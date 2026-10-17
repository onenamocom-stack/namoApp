"""The worker's tests. The rules run anywhere; the real encode runs only
where FFmpeg is installed (FFMPEG/FFPROBE, or on the PATH).

    cd video-worker && python -m pytest -q
"""

import json
import os
import shutil
import subprocess

import pytest

import encode
import main

HAVE_FFMPEG = bool(shutil.which(encode.FFMPEG) and shutil.which(encode.FFPROBE))


def _probe(w, h, duration="42.5", rotation=None, audio=True):
    video = {"codec_type": "video", "width": w, "height": h}
    if rotation is not None:
        video["side_data_list"] = [{"rotation": rotation}]
    streams = [video] + ([{"codec_type": "audio"}] if audio else [])
    return {"streams": streams, "format": {"duration": duration}}


class TestRules:
    def test_a_phone_video_turned_on_its_side_is_portrait(self):
        info = encode.read_probe(_probe(1920, 1080, rotation=-90))
        assert (info["width"], info["height"], info["audio"]) == (1080, 1920, True)

    def test_too_long_and_not_a_video(self):
        with pytest.raises(encode.Unusable) as err:
            encode.read_probe(_probe(1080, 1920, duration="91.2"))
        assert err.value.reason == "too_long"
        with pytest.raises(encode.Unusable) as err:
            encode.read_probe({"streams": [{"codec_type": "audio"}], "format": {"duration": "5"}})
        assert err.value.reason == "not_a_video"

    def test_the_ladder_never_enlarges(self):
        assert [r[0] for r in encode.ladder(1080, 1920)] == [720, 480]
        assert [r[0] for r in encode.ladder(720, 1280)] == [720, 480]
        assert [r[0] for r in encode.ladder(540, 960)] == [540, 480]
        assert [r[0] for r in encode.ladder(360, 640)] == [360]

    def test_sizes_are_even_and_keep_the_shape(self):
        assert encode.size_for(1080, 1920, 720) == (720, 1280)
        assert encode.size_for(1920, 1080, 480) == (854, 480)
        assert encode.size_for(1080, 2340, 480) == (480, 1040)

    def test_master_lists_the_small_one_first(self):
        text = encode.master([("720p", 720, 1280, 2000, 128), ("480p", 480, 854, 800, 96)])
        lines = text.splitlines()
        assert lines[2].endswith("RESOLUTION=480x854") and lines[3] == "480p/index.m3u8"
        assert lines[5] == "720p/index.m3u8"

    def test_location_and_tags_are_stripped(self):
        cmd, _ = encode.encode_command("in", "out", {"width": 1080, "height": 1920, "audio": False}, 720, 2000, 128)
        assert cmd[cmd.index("-map_metadata") + 1] == "-1"
        assert "0:a:0" not in cmd and "-c:a" not in cmd


class FakeS3:
    def __init__(self, src):
        self.src, self.put, self.deleted = src, {}, []

    def download_file(self, bucket, key, path):
        shutil.copy(self.src, path)

    def upload_file(self, path, bucket, key, ExtraArgs):
        self.put[key] = ExtraArgs

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)


JOB = {"video_id": "abc", "source": {"bucket": "up", "key": "uploads/abc/source"},
       "output": {"bucket": "pub", "prefix": "v/abc/"}}


def _make(path, w, h, seconds):
    subprocess.run([
        encode.FFMPEG, "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=60:duration={seconds}",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
        "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest",
        "-metadata", "location=+28.6139+077.2090/", path,
    ], check=True)


def _meta(path):
    return json.loads(subprocess.run([encode.FFPROBE, "-v", "error", "-print_format", "json",
                                      "-show_streams", "-show_format", path],
                                     capture_output=True, text=True, check=True).stdout)


@pytest.mark.skipif(not HAVE_FFMPEG, reason="FFmpeg not installed")
class TestEncode:
    def test_a_portrait_video_becomes_two_versions_and_a_thumbnail(self, tmp_path):
        src = str(tmp_path / "in.mp4")
        _make(src, 1080, 1920, 9)
        s3 = FakeS3(src)
        got = main.process(JOB, s3=s3)
        assert got["ok"] and got["hls_path"] == "v/abc/master.m3u8" and got["thumb_path"] == "v/abc/thumb.webp"
        assert (got["width"], got["height"], got["versions"]) == (720, 1280, ["720p", "480p"])
        assert 8.5 < got["duration_s"] < 9.5
        keys = set(s3.put)
        assert {"v/abc/master.m3u8", "v/abc/thumb.webp", "v/abc/720p/index.m3u8", "v/abc/480p/index.m3u8"} <= keys
        # 9 seconds in 4-second segments: three per version.
        assert len([k for k in keys if k.startswith("v/abc/480p/seg_")]) == 3
        assert s3.put["v/abc/480p/seg_000.ts"]["ContentType"] == "video/mp2t"
        assert "immutable" in s3.put["v/abc/master.m3u8"]["CacheControl"]
        assert s3.deleted == ["uploads/abc/source"]

    def test_the_output_has_no_location_and_at_most_30_fps(self, tmp_path):
        src = str(tmp_path / "in.mp4")
        _make(src, 720, 1280, 3)
        out = tmp_path / "out"
        out.mkdir()
        assert "28.6139" in json.dumps(_meta(src))
        encode.build(src, str(out))
        meta = _meta(str(out / "720p" / "seg_000.ts"))
        assert "28.6139" not in json.dumps(meta)
        video = next(s for s in meta["streams"] if s["codec_type"] == "video")
        num, den = video["avg_frame_rate"].split("/")
        assert int(num) / int(den) <= 30.01
        assert os.path.getsize(out / "thumb.webp") > 0

    def test_a_long_video_is_refused_and_dropped(self, tmp_path):
        src = str(tmp_path / "in.mp4")
        _make(src, 320, 240, 92)
        s3 = FakeS3(src)
        got = main.process(JOB, s3=s3)
        assert got["ok"] is False and got["final"] is True and got["reason"] == "too_long"
        assert s3.deleted == ["uploads/abc/source"] and s3.put == {}


class TestDoor:
    def _call(self, body, token="t"):
        import io

        data = json.dumps(body).encode()
        seen = {}
        res = main.app({"PATH_INFO": "/process", "REQUEST_METHOD": "POST", "HTTP_X_WORKER_TOKEN": token,
                        "CONTENT_LENGTH": str(len(data)), "wsgi.input": io.BytesIO(data)},
                       lambda status, headers: seen.setdefault("status", status))
        return seen["status"], json.loads(b"".join(res))

    def test_the_token_is_required(self, monkeypatch):
        monkeypatch.setattr(main, "TOKEN", "t")
        assert self._call(JOB, token="wrong")[0].startswith("401")
        monkeypatch.setattr(main, "TOKEN", "")
        assert self._call(JOB, token="")[0].startswith("401")

    def test_a_job_is_taken_once(self, monkeypatch):
        monkeypatch.setattr(main, "TOKEN", "t")
        monkeypatch.setattr(main, "jobs", main.queue.Queue())
        monkeypatch.setattr(main, "held", set())
        assert self._call(JOB)[0].startswith("202")
        status, body = self._call(JOB)
        assert status.startswith("202") and body["already"] is True
        assert main.jobs.qsize() == 1
        assert self._call({"video_id": "x"})[0].startswith("400")
