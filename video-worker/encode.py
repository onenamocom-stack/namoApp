"""The video pipeline's encoder (part D, 17 Oct 2026; Rahul's spec,
"Server processing"). Pure FFmpeg work on local files, no network:

  probe     length, the frame size after the phone's rotation, audio or not
  ladder    which HLS versions to make: 720p and 480p, never upscaled
  encode    one HLS version: H.264, 4-second segments, at most 30 fps,
            AAC, every tag (location included) stripped
  thumb     one WebP frame, shorter side 480
  master    the playlist that lists the versions, 480p first so a player
            starts small and climbs
  sheets    the moderation images (part E): a frame every 10 seconds,
            nine to a 3×3 sheet, so a 90-second video is one image

`main.py` fetches the upload, calls these, and sends the files to R2.
"""

import json
import os
import subprocess

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")

MAX_SECONDS = 90.5
SEGMENT_SECONDS = 4
# (shorter side, video kbps, audio kbps): the spec's ~2 Mbps and ~0.8 Mbps.
RUNGS = ((720, 2000, 128), (480, 800, 96))
THUMB_SIDE = 480
# Moderation (Rahul, 17 Oct): a frame every 10 seconds, nine to a sheet.
# What happens between two frames is not seen; reports cover that.
FRAME_EVERY = 10
TILE = 3
CELL_SIDE = 320


class Unusable(Exception):
    """The file cannot become a video here: not a video, or too long."""

    def __init__(self, reason, detail=""):
        super().__init__(f"{reason}: {detail}" if detail else reason)
        self.reason = reason


def _even(n):
    return max(2, int(round(n / 2)) * 2)


def _rotation(stream):
    for side in stream.get("side_data_list") or []:
        if "rotation" in side:
            return int(side["rotation"])
    try:
        return int((stream.get("tags") or {}).get("rotate", 0))
    except ValueError:
        return 0


def probe(path):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise Unusable("not_a_video", out.stderr.strip()[-300:])
    return read_probe(json.loads(out.stdout or "{}"))


def read_probe(data):
    """ffprobe's JSON to {duration, width, height, audio}; split out so the
    rules are testable without FFmpeg."""
    streams = data.get("streams") or []
    video = next((s for s in streams if s.get("codec_type") == "video"
                  and not (s.get("disposition") or {}).get("attached_pic")), None)
    if video is None or not video.get("width"):
        raise Unusable("not_a_video", "no video stream")
    try:
        duration = float((data.get("format") or {}).get("duration") or video.get("duration") or 0)
    except ValueError:
        duration = 0.0
    if duration <= 0:
        raise Unusable("not_a_video", "no length")
    if duration > MAX_SECONDS:
        raise Unusable("too_long", f"{duration:.1f}s")
    w, h = int(video["width"]), int(video["height"])
    if abs(_rotation(video)) % 180 == 90:
        w, h = h, w
    return {
        "duration": round(duration, 2),
        "width": w,
        "height": h,
        "audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def size_for(width, height, side):
    """The frame with its shorter side at `side`, both sides even."""
    if width <= height:
        return _even(side), _even(height * side / width)
    return _even(width * side / height), _even(side)


def ladder(width, height):
    """The versions to make, largest first. A source smaller than 720p
    gets its own size on top; nothing is ever enlarged."""
    short = min(width, height)
    top = min(RUNGS[0][0], short)
    rungs = []
    for side, v_kbps, a_kbps in RUNGS:
        if side <= top:
            rungs.append((side, v_kbps, a_kbps))
    if not rungs or rungs[0][0] < top:
        # e.g. a 540p source: 540 on top, at the top rung's rate.
        rungs.insert(0, (_even(top), RUNGS[0][1], RUNGS[0][2]))
    return rungs


def encode_command(src, out_dir, info, side, v_kbps, a_kbps):
    w, h = size_for(info["width"], info["height"], side)
    cmd = [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src,
        "-map", "0:v:0",
    ]
    if info["audio"]:
        cmd += ["-map", "0:a:0"]
    cmd += [
        "-vf", f"scale={w}:{h},setsar=1,format=yuv420p",
        "-fpsmax", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main",
        "-b:v", f"{v_kbps}k", "-maxrate", f"{int(v_kbps * 1.07)}k", "-bufsize", f"{int(v_kbps * 1.5)}k",
        "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})", "-sc_threshold", "0",
    ]
    if info["audio"]:
        cmd += ["-c:a", "aac", "-b:a", f"{a_kbps}k", "-ac", "2", "-ar", "48000"]
    cmd += [
        # Every tag goes, the phone's location among them (spec: privacy).
        "-map_metadata", "-1", "-map_chapters", "-1",
        "-f", "hls", "-hls_time", str(SEGMENT_SECONDS), "-hls_playlist_type", "vod",
        "-hls_segment_filename", os.path.join(out_dir, "seg_%03d.ts"),
        os.path.join(out_dir, "index.m3u8"),
    ]
    return cmd, (w, h)


def thumb_command(src, out_path, info):
    w, h = size_for(info["width"], info["height"], min(THUMB_SIDE, min(info["width"], info["height"])))
    at = min(1.0, info["duration"] / 2)
    return [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{at:.2f}", "-i", src,
        "-frames:v", "1", "-vf", f"scale={w}:{h}", "-map_metadata", "-1",
        "-c:v", "libwebp", "-quality", "75", out_path,
    ]


def frame_times(duration):
    """Where the moderation frames fall: the middle of each 10-second
    stretch, so a video under 10 seconds still gets its middle frame."""
    times, t = [], min(FRAME_EVERY / 2, duration / 2)
    while t < duration:
        times.append(round(t, 2))
        t += FRAME_EVERY
    return times


def sheet_count(duration):
    return -(-len(frame_times(duration)) // (TILE * TILE))


def sheet_command(src, out_pattern, info):
    """Every frame 10 seconds after the last one picked, from the first
    frame time on, tiled 3×3 (a last sheet that is not full is padded
    black)."""
    side = min(CELL_SIDE, info["width"], info["height"])
    w, h = size_for(info["width"], info["height"], side)
    first = frame_times(info["duration"])[0]
    return [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{first:.2f}", "-i", src, "-an",
        "-vf", (f"select='isnan(prev_selected_t)+gte(t-prev_selected_t,{FRAME_EVERY})',"
                f"scale={w}:{h},setsar=1,tile={TILE}x{TILE}"),
        "-fps_mode", "vfr", "-q:v", "4", "-map_metadata", "-1", out_pattern,
    ]


def sheets(src, out_dir, info):
    """The moderation sheets as JPEG files in `out_dir`, in order."""
    _run(sheet_command(src, os.path.join(out_dir, "sheet_%d.jpg"), info), timeout=120)
    found = sorted((n for n in os.listdir(out_dir) if n.startswith("sheet_") and n.endswith(".jpg")),
                   key=lambda n: int(n[6:-4]))
    return [os.path.join(out_dir, n) for n in found]


def _run(cmd, timeout=600):
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if out.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {out.stderr.strip()[-500:]}")


def share_command(playlist, out_path):
    """The top version as one MP4, the same frames copied rather than
    encoded again (24 Oct 2026, Rahul): a WhatsApp status needs one video
    file, and a reel is otherwise only HLS pieces."""
    return [
        FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", playlist,
        "-c", "copy", "-bsf:a", "aac_adtstoasc", "-movflags", "+faststart",
        "-map_metadata", "-1", out_path,
    ]


def master(variants):
    """`variants`: [(dir name, width, height, video kbps, audio kbps)],
    largest first; written smallest first."""
    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for name, w, h, v_kbps, a_kbps in sorted(variants, key=lambda v: v[3]):
        bandwidth = int((v_kbps * 1.07 + a_kbps) * 1000)
        lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={w}x{h}")
        lines.append(f"{name}/index.m3u8")
    return "\n".join(lines) + "\n"


def build(src, out_dir):
    """Everything for one upload, into `out_dir`: master.m3u8, one folder
    per version, thumb.webp, share.mp4 (the top version as one file), the
    moderation sheets. Returns what the API
    stores, and the sheets' local paths under `sheets`."""
    info = probe(src)
    variants = []
    for side, v_kbps, a_kbps in ladder(info["width"], info["height"]):
        name = f"{side}p"
        os.makedirs(os.path.join(out_dir, name), exist_ok=True)
        cmd, (w, h) = encode_command(src, os.path.join(out_dir, name), info, side, v_kbps, a_kbps)
        _run(cmd)
        variants.append((name, w, h, v_kbps, a_kbps if info["audio"] else 0))
    with open(os.path.join(out_dir, "master.m3u8"), "w", newline="\n") as f:
        f.write(master(variants))
    _run(thumb_command(src, os.path.join(out_dir, "thumb.webp"), info), timeout=120)
    top = variants[0]
    _run(share_command(os.path.join(out_dir, top[0], "index.m3u8"), os.path.join(out_dir, "share.mp4")), timeout=120)
    return {"duration_s": info["duration"], "width": top[1], "height": top[2],
            "versions": [v[0] for v in variants], "sheets": sheets(src, out_dir, info)}
