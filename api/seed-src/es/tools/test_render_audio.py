import http.client
import io
import json
import socket
from email.message import Message
from pathlib import Path
import urllib.error
import urllib.request

import pytest

import checks
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


@pytest.fixture
def no_network(monkeypatch):
    """Fail loudly if anything tries to open a socket, while letting http.client validate headers."""

    def refuse(*args, **kwargs):
        """Stand in for `socket.create_connection`."""
        raise AssertionError("network access attempted")

    monkeypatch.setattr(socket, "create_connection", refuse)


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


def test_cli_strips_whitespace_around_the_key(tmp_path):
    """A CRLF-terminated .env value must reach the speech client without the line ending."""
    write_item(tmp_path, "listening-01")
    keys = []

    def make_synth(key):
        """Record the key the client would be built with."""
        keys.append(key)
        return RecordingSynth()

    code = main(
        ["--yes"], seed_dir=tmp_path, environ={"OPENAI_API_KEY": "sk-x\r\n"}, make_synth=make_synth
    )

    assert code == 0
    assert keys == ["sk-x"]


@pytest.mark.parametrize(
    "key",
    ["sk-SECRET\rtail", "sk-SECRET\nb", "sk-SECRET b", "sk-SECRET\x00b", "sk-SECRET\u20acb"],
)
def test_cli_rejects_a_malformed_key_without_echoing_it(tmp_path, capsys, no_network, key):
    """http.client quotes an illegal header value verbatim, so the key must be rejected first."""
    write_item(tmp_path, "listening-01")

    code = main(["--yes"], seed_dir=tmp_path, environ={"OPENAI_API_KEY": key})

    captured = capsys.readouterr()
    assert code == 1
    assert "OPENAI_API_KEY" in captured.err
    assert "SECRET" not in captured.out + captured.err
    assert not (tmp_path / "listening-01.mp3").exists()


@pytest.mark.parametrize("key", ["", "  \r\n"])
def test_cli_treats_a_blank_key_as_unset(tmp_path, capsys, key):
    """Whitespace alone is not a key."""
    write_item(tmp_path, "listening-01")

    code = main(["--yes"], seed_dir=tmp_path, environ={"OPENAI_API_KEY": key})

    assert code == 1
    assert "OPENAI_API_KEY" in capsys.readouterr().err


def test_cli_redacts_the_key_from_a_failure_message(tmp_path, capsys):
    """Any layer that echoes the key in an error must not leak it to stderr."""
    write_item(tmp_path, "listening-01")

    def make_synth(key):
        """Build a speech function whose failure quotes the key."""

        def synth(text, voice):
            """Fail the way a client that echoes its credentials would."""
            raise RuntimeError(f"upstream rejected Bearer {key}")

        return synth

    code = main(
        ["--yes"], seed_dir=tmp_path, environ={"OPENAI_API_KEY": "sk-SECRET"}, make_synth=make_synth
    )

    captured = capsys.readouterr()
    assert code == 1
    assert "upstream rejected" in captured.err
    assert "SECRET" not in captured.out + captured.err


def test_default_transport_hides_header_values_when_the_request_cannot_be_built(no_network):
    """A header http.client refuses is quoted by its ValueError, so the transport must drop it."""
    with pytest.raises(RuntimeError) as caught:
        render_audio._urllib_post("https://example.test/x", {"Authorization": "Bearer SECRET\r"}, b"{}")

    assert "SECRET" not in str(caught.value)


def test_validate_item_rejects_a_voice_outside_the_tts_set():
    """A wrong-case voice would be refused by the API after earlier lines were billed."""
    synth = RecordingSynth()
    item = make_item(voices={"HOST": "Nova", "ANALYST": "onyx"})

    with pytest.raises(ValueError, match="HOST.*Nova") as caught:
        render_item(item, synth)

    assert synth.calls == []
    assert "alloy" in str(caught.value)


def test_validate_item_accepts_every_voice_and_length_the_checks_allow():
    """The renderer and the content checks share one voice set and one length limit."""
    for voice in checks.TTS_VOICES:
        validate_item(make_item(voices={"HOST": voice, "ANALYST": voice}))
    validate_item(make_item(lines=[{"speaker": "HOST", "text": "a" * checks.TTS_MAX_CHARS}]))
    with pytest.raises(ValueError, match=str(checks.TTS_MAX_CHARS)):
        validate_item(make_item(lines=[{"speaker": "HOST", "text": "a" * (checks.TTS_MAX_CHARS + 1)}]))


def test_validate_item_rejects_a_voice_that_is_not_a_string():
    """A list or number in the voices map is a clean error, not a TypeError."""
    with pytest.raises(ValueError, match="HOST"):
        validate_item(make_item(voices={"HOST": ["nova"], "ANALYST": "onyx"}))


def run_cli(seed_dir, *args, synth=None, key="k"):
    """Run `main` against `seed_dir` with a fake speech function and an injected key."""
    return main(
        list(args),
        seed_dir=seed_dir,
        environ={"OPENAI_API_KEY": key},
        make_synth=lambda _key: synth or RecordingSynth(),
    )


def test_cli_does_not_blame_a_filesystem_permission_error_on_a_missing_yes(
    tmp_path, capsys, monkeypatch, no_network
):
    """EACCES while writing an MP3 is a render failure, not a request for --yes."""
    write_item(tmp_path, "listening-01")

    def deny(self, data):
        """Fail the way a read-only folder does."""
        raise PermissionError(13, "Permission denied", str(self))

    monkeypatch.setattr(Path, "write_bytes", deny)

    code = run_cli(tmp_path, "--yes")

    err = capsys.readouterr().err
    assert code == 1
    assert err.startswith("render failed: ")
    assert "Permission denied" in err
    assert "--yes" not in err


def test_cli_checks_yes_before_it_calls_render_all(tmp_path, capsys, monkeypatch, no_network):
    """Without --yes the renderer is never entered, so no filesystem work happens."""
    write_item(tmp_path, "listening-01")

    def explode(*args, **kwargs):
        """Fail if the CLI reaches the renderer."""
        raise AssertionError("render_all was called without --yes")

    monkeypatch.setattr(render_audio, "render_all", explode)

    assert run_cli(tmp_path) == 1
    assert "--yes" in capsys.readouterr().err


@pytest.mark.parametrize(
    "failure",
    [
        urllib.error.URLError("connection refused"),
        TimeoutError("timed out"),
        TimeoutError(),
        http.client.RemoteDisconnected("Remote end closed connection without response"),
        http.client.IncompleteRead(b"ab", 10),
    ],
    ids=["urlerror", "timeout", "timeout-no-message", "remote-disconnected", "incomplete-read"],
)
def test_cli_turns_network_failures_into_one_line(tmp_path, capsys, no_network, failure):
    """Transport errors end the run with a short message instead of a traceback."""
    write_item(tmp_path, "listening-01")

    def synth(text, voice):
        """Fail like a dropped connection."""
        raise failure

    code = run_cli(tmp_path, "--yes", synth=synth)

    err = capsys.readouterr().err
    assert code == 1
    assert err.startswith("render failed: ")
    assert len(err.strip().splitlines()) == 1
    assert "Traceback" not in err
    assert not (tmp_path / "listening-01.mp3").exists()


def test_cli_redacts_the_key_from_a_network_failure(tmp_path, capsys, no_network):
    """A transport error that quotes the bearer token must not reach stderr."""
    write_item(tmp_path, "listening-01")

    def synth(text, voice):
        """Fail with a message that echoes the credentials."""
        raise urllib.error.URLError("rejected\nBearer sk-SECRET")

    code = run_cli(tmp_path, "--yes", synth=synth, key="sk-SECRET")

    captured = capsys.readouterr()
    assert code == 1
    assert "SECRET" not in captured.out + captured.err
    assert len(captured.err.strip().splitlines()) == 1


@pytest.mark.parametrize("make_dir", [False, True], ids=["missing", "empty"])
def test_cli_reports_a_seed_folder_without_scripts(tmp_path, capsys, no_network, make_dir):
    """Nothing to render is an error, not a silent success."""
    seed_dir = tmp_path / "listening"
    if make_dir:
        seed_dir.mkdir()
        (seed_dir / "notes.json").write_text("{}", encoding="utf-8")
    synth = RecordingSynth()

    code = run_cli(seed_dir, "--yes", synth=synth)

    err = capsys.readouterr().err
    assert code == 1
    assert f"no listening-NN.json in {seed_dir}" in err
    assert synth.calls == []


def test_render_all_raises_for_a_folder_without_scripts(tmp_path):
    """The library call fails loudly too, even when --only names an item."""
    with pytest.raises(ValueError, match="no listening-NN.json"):
        render_all(tmp_path, RecordingSynth(), confirmed=True)
    with pytest.raises(ValueError, match="no listening-NN.json"):
        render_all(tmp_path, RecordingSynth(), confirmed=True, only={"listening-01"})


@pytest.mark.parametrize("content", ["{not json", "[1, 2]", ""], ids=["syntax", "not-an-object", "empty"])
def test_cli_names_the_script_with_malformed_json(tmp_path, capsys, no_network, content):
    """A broken file is named by stem and nothing is rendered, not even the good scripts."""
    write_item(tmp_path, "listening-01")
    (tmp_path / "listening-02.json").write_text(content, encoding="utf-8")
    synth = RecordingSynth()

    code = run_cli(tmp_path, "--yes", synth=synth)

    err = capsys.readouterr().err
    assert code == 1
    assert "listening-02" in err
    assert "Traceback" not in err
    assert synth.calls == []
    assert not (tmp_path / "listening-01.mp3").exists()


def test_cli_names_the_script_that_is_not_utf8(tmp_path, capsys, no_network):
    """Mis-encoded bytes are reported against the file that holds them."""
    (tmp_path / "listening-04.json").write_bytes(b"\xff\xfe\x80")

    code = run_cli(tmp_path, "--yes")

    assert code == 1
    assert "listening-04" in capsys.readouterr().err


def test_render_all_skip_existing_leaves_finished_items_alone(tmp_path):
    """A retry after a mid-batch failure must not re-synthesise or rewrite finished items."""
    write_item(tmp_path, "listening-01")
    write_item(tmp_path, "listening-02")
    (tmp_path / "listening-01.mp3").write_bytes(b"OLD")
    synth = RecordingSynth()

    written = render_all(tmp_path, synth, confirmed=True, skip_existing=True)

    assert written == [tmp_path / "listening-02.mp3"]
    assert (tmp_path / "listening-01.mp3").read_bytes() == b"OLD"
    assert len(synth.calls) == 3


def test_render_all_overwrites_existing_mp3_by_default(tmp_path):
    """Without the flag a re-render replaces the file, as before."""
    write_item(tmp_path, "listening-01")
    (tmp_path / "listening-01.mp3").write_bytes(b"OLD")

    render_all(tmp_path, RecordingSynth(), confirmed=True)

    assert (tmp_path / "listening-01.mp3").read_bytes() != b"OLD"


def test_cli_skip_existing_reports_what_it_skipped(tmp_path, capsys, no_network):
    """`--skip-existing` renders the rest and says which items were left alone."""
    write_item(tmp_path, "listening-01")
    write_item(tmp_path, "listening-02")
    (tmp_path / "listening-01.mp3").write_bytes(b"OLD")
    synth = RecordingSynth()

    code = run_cli(tmp_path, "--yes", "--skip-existing", synth=synth)

    out = capsys.readouterr().out
    assert code == 0
    assert (tmp_path / "listening-01.mp3").read_bytes() == b"OLD"
    assert "wrote" in out and "listening-02.mp3" in out
    assert "skipped" in out and "listening-01.mp3" in out
    assert len(synth.calls) == 3


def test_cli_skip_existing_is_off_by_default(tmp_path, no_network):
    """Without the flag the CLI re-renders items that already have an MP3."""
    write_item(tmp_path, "listening-01")
    (tmp_path / "listening-01.mp3").write_bytes(b"OLD")

    assert run_cli(tmp_path, "--yes") == 0
    assert (tmp_path / "listening-01.mp3").read_bytes() != b"OLD"
