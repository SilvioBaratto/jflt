import io
import json
from email.message import Message
import urllib.error
import urllib.request

import pytest

import render_audio
from render_audio import main, openai_synth, render_all, render_item, validate_item


class RecordingSynth:
    """A fake `Synth` that records every call and returns bytes derived from its inputs."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def __call__(self, text: str, voice: str) -> bytes:
        self.calls.append((text, voice))
        return f"<{voice}:{text}>".encode()


def make_item(**overrides) -> dict:
    """Build a three-line, two-speaker listening item, with `overrides` replacing top-level keys."""
    item = {
        "id": "listening-01",
        "voices": {"HOST": "nova", "ANALYST": "onyx"},
        "lines": [
            {"speaker": "HOST", "text": "Buenas noches."},
            {"speaker": "ANALYST", "text": "Gracias por invitarme."},
            {"speaker": "HOST", "text": "Empecemos."},
        ],
    }
    item.update(overrides)
    return item


def write_item(seed_dir, stem: str, **overrides) -> None:
    """Write a `make_item` JSON file named `<stem>.json` into `seed_dir`."""
    item = make_item(id=stem, **overrides)
    (seed_dir / f"{stem}.json").write_text(json.dumps(item), encoding="utf-8")


def test_render_item_calls_synth_per_line_with_speaker_voice():
    """Each line is synthesised once, in order, with its own speaker's voice."""
    synth = RecordingSynth()

    audio = render_item(make_item(), synth)

    assert synth.calls == [
        ("Buenas noches.", "nova"),
        ("Gracias por invitarme.", "onyx"),
        ("Empecemos.", "nova"),
    ]
    assert audio == b"<nova:Buenas noches.><onyx:Gracias por invitarme.><nova:Empecemos.>"


def test_render_item_rejects_speaker_without_voice():
    """A speaker missing from `voices` fails before any synth call is made."""
    synth = RecordingSynth()
    item = make_item(voices={"HOST": "nova"})

    with pytest.raises(ValueError, match="ANALYST"):
        render_item(item, synth)

    assert synth.calls == []


def test_render_item_rejects_line_over_4096_chars_before_any_call():
    """An over-long line later in the script still costs nothing."""
    synth = RecordingSynth()
    item = make_item()
    item["lines"][2]["text"] = "a" * 4097

    with pytest.raises(ValueError, match="4096"):
        render_item(item, synth)

    assert synth.calls == []


def test_render_item_accepts_line_of_exactly_4096_chars():
    """The API limit is inclusive."""
    synth = RecordingSynth()
    item = make_item(lines=[{"speaker": "HOST", "text": "a" * 4096}])

    render_item(item, synth)

    assert len(synth.calls) == 1


@pytest.mark.parametrize("text", ["", "   \n"])
def test_render_item_rejects_blank_line_before_any_call(text):
    """A blank line would be rejected by the API after earlier lines were paid for."""
    synth = RecordingSynth()
    item = make_item()
    item["lines"][1]["text"] = text

    with pytest.raises(ValueError, match="line 2"):
        render_item(item, synth)

    assert synth.calls == []


def test_validate_item_rejects_an_item_without_lines():
    """An empty script would silently produce a zero-byte MP3."""
    with pytest.raises(ValueError, match="no lines"):
        validate_item(make_item(lines=[]))


def test_render_all_requires_confirmation(tmp_path):
    """Sending script text to a third party needs an explicit go-ahead."""
    write_item(tmp_path, "listening-01")
    synth = RecordingSynth()

    with pytest.raises(PermissionError):
        render_all(tmp_path, synth, confirmed=False)

    assert synth.calls == []
    assert not (tmp_path / "listening-01.mp3").exists()


def test_render_all_writes_mp3_next_to_json(tmp_path):
    """Only the selected item is rendered, and its MP3 lands beside its JSON."""
    write_item(tmp_path, "listening-01")
    write_item(tmp_path, "listening-02")
    synth = RecordingSynth()

    written = render_all(tmp_path, synth, confirmed=True, only={"listening-01"})

    assert written == [tmp_path / "listening-01.mp3"]
    assert (tmp_path / "listening-01.mp3").read_bytes() == render_item(make_item(), RecordingSynth())
    assert not (tmp_path / "listening-02.mp3").exists()


def test_render_all_renders_every_item_in_order_when_not_filtered(tmp_path):
    """Without `only` every listening-NN.json is rendered, lowest number first."""
    write_item(tmp_path, "listening-02")
    write_item(tmp_path, "listening-01")
    (tmp_path / "notes.json").write_text("{}", encoding="utf-8")

    written = render_all(tmp_path, RecordingSynth(), confirmed=True)

    assert written == [tmp_path / "listening-01.mp3", tmp_path / "listening-02.mp3"]


def test_render_all_validates_every_item_before_any_call(tmp_path):
    """A bad item later in the batch must not be discovered after earlier ones were paid for."""
    write_item(tmp_path, "listening-01")
    write_item(tmp_path, "listening-02", voices={"HOST": "nova"})
    synth = RecordingSynth()

    with pytest.raises(ValueError, match="listening-02"):
        render_all(tmp_path, synth, confirmed=True)

    assert synth.calls == []
    assert not (tmp_path / "listening-01.mp3").exists()


def test_render_all_rejects_an_unknown_only_name(tmp_path):
    """A typo in `--only` must not turn into a silent no-op."""
    write_item(tmp_path, "listening-01")

    with pytest.raises(ValueError, match="listening-09"):
        render_all(tmp_path, RecordingSynth(), confirmed=True, only={"listening-09"})


def test_openai_synth_builds_the_speech_request():
    """The request mirrors tts.service.ts: model, voice, input and mp3 output."""
    seen = {}

    def post(url: str, headers: dict[str, str], body: bytes) -> bytes:
        """Capture the request instead of sending it."""
        seen.update(url=url, headers=headers, body=json.loads(body))
        return b"mp3-bytes"

    synth = openai_synth("test-key", post=post)

    assert synth("Buenos días, señor.", "onyx") == b"mp3-bytes"
    assert seen["url"] == "https://api.openai.com/v1/audio/speech"
    assert seen["headers"]["Authorization"] == "Bearer test-key"
    assert seen["headers"]["Content-Type"] == "application/json"
    assert seen["body"] == {
        "model": "tts-1",
        "voice": "onyx",
        "input": "Buenos días, señor.",
        "response_format": "mp3",
    }


def test_openai_synth_honours_a_custom_model():
    """The model is configurable."""
    bodies = []
    synth = openai_synth("k", "tts-1-hd", post=lambda url, headers, body: bodies.append(body) or b"")

    synth("hola", "nova")

    assert json.loads(bodies[0])["model"] == "tts-1-hd"


class FakeResponse(io.BytesIO):
    """A stand-in for the object `urlopen` returns."""


def test_default_transport_posts_through_urllib(monkeypatch):
    """The stdlib transport sends a POST with the headers and body it was given."""
    captured = {}

    def fake_urlopen(request, timeout):
        """Capture the request and return canned audio."""
        captured.update(request=request, timeout=timeout)
        return FakeResponse(b"audio")

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    out = render_audio._urllib_post("https://example.test/x", {"Authorization": "Bearer k"}, b"{}")

    request = captured["request"]
    assert out == b"audio"
    assert request.get_method() == "POST"
    assert request.full_url == "https://example.test/x"
    assert request.get_header("Authorization") == "Bearer k"
    assert request.data == b"{}"
    assert captured["timeout"] > 0


def test_default_transport_turns_http_errors_into_runtime_errors(monkeypatch):
    """The status and a short body excerpt reach the caller, never the key."""

    def fake_urlopen(request, timeout):
        """Fail the way urllib does for a non-2xx status."""
        raise urllib.error.HTTPError(
            request.full_url, 401, "Unauthorized", Message(), io.BytesIO(b'{"error": "bad key"}')
        )

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    with pytest.raises(RuntimeError, match="TTS 401") as caught:
        render_audio._urllib_post("https://example.test/x", {"Authorization": "Bearer secret"}, b"{}")

    assert "bad key" in str(caught.value)
    assert "secret" not in str(caught.value)


def test_cli_exits_with_a_message_when_the_key_is_unset(tmp_path, capsys):
    """No key means no run, and the message names the variable."""
    write_item(tmp_path, "listening-01")

    code = main(["--yes"], seed_dir=tmp_path, environ={})

    assert code == 1
    assert "OPENAI_API_KEY" in capsys.readouterr().err
    assert not (tmp_path / "listening-01.mp3").exists()


def test_cli_without_yes_sends_nothing(tmp_path, capsys):
    """Omitting `--yes` is refused before any request is built."""
    write_item(tmp_path, "listening-01")
    synth = RecordingSynth()

    code = main([], seed_dir=tmp_path, environ={"OPENAI_API_KEY": "k"}, make_synth=lambda key: synth)

    assert code == 1
    assert "--yes" in capsys.readouterr().err
    assert synth.calls == []


def test_cli_renders_only_the_requested_items(tmp_path, capsys):
    """`--only` limits the run and the written paths are reported."""
    write_item(tmp_path, "listening-01")
    write_item(tmp_path, "listening-03")
    synth = RecordingSynth()

    code = main(
        ["--yes", "--only", "listening-03"],
        seed_dir=tmp_path,
        environ={"OPENAI_API_KEY": "k"},
        make_synth=lambda key: synth,
    )

    assert code == 0
    assert (tmp_path / "listening-03.mp3").exists()
    assert not (tmp_path / "listening-01.mp3").exists()
    assert "listening-03.mp3" in capsys.readouterr().out


def test_cli_reports_validation_errors_without_a_traceback(tmp_path, capsys):
    """A bad item is a one-line error and a non-zero exit."""
    write_item(tmp_path, "listening-01", voices={})

    code = main(
        ["--yes"],
        seed_dir=tmp_path,
        environ={"OPENAI_API_KEY": "k"},
        make_synth=lambda key: RecordingSynth(),
    )

    assert code == 1
    assert "listening-01" in capsys.readouterr().err
