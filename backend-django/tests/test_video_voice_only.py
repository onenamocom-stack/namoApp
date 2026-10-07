"""An audio call is voice only (7 Oct 2026): its tokens let a person send
audio and nothing else, so the camera cannot be switched on and the call is
billed at Daily's audio rate. A video call's tokens are unchanged."""

from datetime import datetime, timezone
from unittest import mock

from apps.video import providers

EXP = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)


def _token_payload(audio_only):
    with mock.patch.object(providers, "_call", return_value={"token": "t"}) as call:
        providers.meeting_token("room", "Tara", False, EXP, audio_only=audio_only, user_id="u1")
    return call.call_args[0][2]["properties"]


def test_an_audio_call_sends_audio_only():
    props = _token_payload(True)
    assert props["permissions"] == {"canSend": ["audio"]}
    assert props["start_video_off"] is True and props["enable_screenshare"] is False


def test_a_video_call_is_untouched():
    props = _token_payload(False)
    assert "permissions" not in props and "start_video_off" not in props
