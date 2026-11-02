"""Render the Spanish listening scripts to MP3 with OpenAI text-to-speech.

    OPENAI_API_KEY=... python3 api/seed-src/es/tools/render_audio.py --yes [--only listening-03] [--skip-existing]

Mirrors `api/src/modules/generate/tts.service.ts`: one speech request per script line, using
the voice mapped to that line's speaker, with the returned MP3 segments concatenated byte for
byte. Every `listening-NN.json` in `api/seed-src/es/listening` gets a `listening-NN.mp3`
beside it.

Rendering sends the script text to a third party, so nothing is sent without `--yes`.
`--skip-existing` keeps finished MP3s, so a retry after a mid-batch failure only pays for the rest.
"""

import argparse
import http.client
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path

from builder import REPO
from checks import TTS_MAX_CHARS, TTS_VOICES

SPEECH_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_MODEL = "tts-1"
# A stalled connection would otherwise block a whole batch run indefinitely.
REQUEST_TIMEOUT_S = 120
ITEM_STEM = re.compile(r"listening-\d+")
# Long enough for a transport error's cause, short enough to stay on one terminal line.
MAX_MESSAGE_CHARS = 300

Synth = Callable[[str, str], bytes]
HttpPost = Callable[[str, dict[str, str], bytes], bytes]


def _urllib_post(url: str, headers: dict[str, str], body: bytes) -> bytes:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        # Same shape as the Node service's error; only the body is quoted so the key stays out.
        detail = exc.read().decode("utf-8", errors="replace")[:200]
        raise RuntimeError(f"TTS {exc.code}: {detail}") from exc
    except ValueError:
        # http.client quotes the offending header value, which here is the bearer token.
        raise RuntimeError("TTS request could not be built: invalid header or URL value") from None


def openai_synth(api_key: str, model: str = DEFAULT_MODEL, *, post: HttpPost = _urllib_post) -> Synth:
    """Build a `Synth` that calls the OpenAI speech endpoint.

    Args:
        api_key: OpenAI API key, sent as a bearer token.
        model: Text-to-speech model name.
        post: Transport taking `(url, headers, body)` and returning the response bytes;
            raises `RuntimeError` on a non-2xx status. Injectable so tests never hit the network.

    Returns:
        A function `(text, voice) -> mp3 bytes`.
    """

    def synth(text: str, voice: str) -> bytes:
        """Return the MP3 for `text` spoken in `voice`."""
        payload = {"model": model, "voice": voice, "input": text, "response_format": "mp3"}
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        return post(SPEECH_URL, headers, json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    return synth


def validate_item(item: dict) -> None:
    """Check that a script can be rendered, without synthesising anything.

    Args:
        item: A listening item with `voices` (speaker to voice) and `lines`
            (`{"speaker", "text"}` dicts).

    Raises:
        ValueError: If the script has no lines, a speaker has no voice or one the speech
            service does not offer, or a line is blank or longer than 4096 characters.
    """
    voices = item.get("voices") or {}
    lines = item.get("lines") or []
    if not lines:
        raise ValueError("script has no lines")
    for number, line in enumerate(lines, start=1):
        speaker = line.get("speaker")
        voice = voices.get(speaker)
        if not voice:
            raise ValueError(f"line {number}: speaker {speaker!r} has no voice")
        if not isinstance(voice, str) or voice not in TTS_VOICES:
            raise ValueError(
                f"line {number}: speaker {speaker!r} has unknown voice {voice!r}, "
                f"expected one of {', '.join(sorted(TTS_VOICES))}"
            )
        text = line.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"line {number}: text is empty")
        if len(text) > TTS_MAX_CHARS:
            raise ValueError(f"line {number}: {len(text)} characters exceeds the {TTS_MAX_CHARS} limit")


def render_item(item: dict, synth: Synth) -> bytes:
    """Render one script to MP3 bytes.

    Args:
        item: A listening item shaped like `listening-NN.json`.
        synth: Speech function called once per line, in order.

    Returns:
        The per-line MP3 segments concatenated in script order.

    Raises:
        ValueError: If `validate_item` rejects the script; raised before the first `synth`
            call so an invalid script costs nothing.
    """
    validate_item(item)
    voices = item["voices"]
    return b"".join(synth(line["text"], voices[line["speaker"]]) for line in item["lines"])


def _selected_items(seed_dir: Path, only: set[str] | None) -> list[Path]:
    found = {
        path.stem: path
        for path in seed_dir.glob("listening-*.json")
        if ITEM_STEM.fullmatch(path.stem)
    }
    if not found:
        raise ValueError(f"no listening-NN.json in {seed_dir}")
    if only is not None:
        unknown = sorted(only - found.keys())
        if unknown:
            raise ValueError(f"no such listening item in {seed_dir}: {', '.join(unknown)}")
        found = {stem: path for stem, path in found.items() if stem in only}
    return [found[stem] for stem in sorted(found)]


def _already_rendered(seed_dir: Path, only: set[str] | None) -> list[Path]:
    targets = [path.with_suffix(".mp3") for path in _selected_items(seed_dir, only)]
    return [target for target in targets if target.exists()]


def _load_item(path: Path) -> dict:
    try:
        item = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise ValueError(f"{path.stem}: cannot read the script: {exc}") from exc
    if not isinstance(item, dict):
        raise ValueError(f"{path.stem}: cannot read the script: expected a JSON object")
    return item


def render_all(
    seed_dir: Path,
    synth: Synth,
    *,
    confirmed: bool,
    only: set[str] | None = None,
    skip_existing: bool = False,
) -> list[Path]:
    """Render every listening script in `seed_dir` to an MP3 beside its JSON.

    Args:
        seed_dir: Folder holding `listening-NN.json` files.
        synth: Speech function; see `render_item`.
        confirmed: Whether the requester agreed to send the script text to the speech service.
        only: Item stems such as `{"listening-03"}` to render; every item when None.
        skip_existing: Leave an item alone when its MP3 already exists, so a retry after a
            failure part-way through a batch does not pay for the finished items again.
            Skipped scripts are not read or validated.

    Returns:
        The MP3 paths written, in item order. Skipped items are not included.

    Raises:
        PermissionError: If `confirmed` is false; nothing is read or sent.
        ValueError: If `seed_dir` holds no scripts, `only` names an item that does not
            exist, or any selected script is unreadable JSON or fails `validate_item`. All
            scripts are validated before the first `synth` call so a bad item late in the
            batch cannot waste the earlier renders.
    """
    if not confirmed:
        raise PermissionError("rendering sends the script text to the speech service; pass confirmed=True")
    items: list[tuple[Path, dict]] = []
    for path in _selected_items(seed_dir, only):
        if skip_existing and path.with_suffix(".mp3").exists():
            continue
        item = _load_item(path)
        try:
            validate_item(item)
        except ValueError as exc:
            raise ValueError(f"{path.stem}: {exc}") from exc
        items.append((path, item))
    written = []
    for path, item in items:
        target = path.with_suffix(".mp3")
        target.write_bytes(render_item(item, synth))
        written.append(target)
    return written


def _clean_api_key(raw: str | None) -> str | None:
    """Strip surrounding whitespace from a key and return None when it is unusable.

    A CRLF `.env` or a pasted newline leaves line-ending characters on the value, which
    http.client rejects while quoting the whole header. Trimming recovers that harmless case;
    anything still outside printable ASCII is refused so the key never reaches a header.
    """
    key = (raw or "").strip()
    if key and all(33 <= ord(char) <= 126 for char in key):
        return key
    return None


def build_parser() -> argparse.ArgumentParser:
    """Return the command-line parser."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="confirm sending the script text to OpenAI")
    parser.add_argument(
        "--only",
        action="append",
        metavar="STEM",
        help="render just this item, e.g. listening-03 (repeatable)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="leave items that already have an MP3 alone, so a retry only pays for the rest",
    )
    return parser


def _one_line(exc: Exception, api_key: str) -> str:
    # A client or server error may echo its credentials; stderr can end up in a shared transcript.
    text = " ".join(str(exc).split()).replace(api_key, "***")
    return (text or type(exc).__name__)[:MAX_MESSAGE_CHARS]


def main(
    argv: list[str] | None = None,
    *,
    seed_dir: Path = REPO / "api" / "seed-src" / "es" / "listening",
    environ: Mapping[str, str] | None = None,
    make_synth: Callable[[str], Synth] = openai_synth,
) -> int:
    """Render the Spanish listening MP3s from the command line.

    Args:
        argv: Command-line arguments without the program name; `sys.argv` when None.
        seed_dir: Folder holding the `listening-NN.json` files.
        environ: Environment to read `OPENAI_API_KEY` from; `os.environ` when None.
        make_synth: Builds the speech function from the API key.

    Returns:
        0 on success, 1 when the key is missing or malformed, `--yes` is absent, no script
        is found, a script is unreadable or invalid, or the filesystem or the speech
        service fails.
    """
    args = build_parser().parse_args(argv)
    env = os.environ if environ is None else environ
    raw_key = env.get("OPENAI_API_KEY")
    api_key = _clean_api_key(raw_key)
    if api_key is None:
        unset = not (raw_key or "").strip()
        reason = "is not set" if unset else "contains spaces, control or non-ASCII characters"
        print(f"OPENAI_API_KEY {reason}; export a clean key before rendering.", file=sys.stderr)
        return 1
    if not args.yes:
        print("Rendering sends the script text to OpenAI; re-run with --yes to confirm.", file=sys.stderr)
        return 1
    only = set(args.only) if args.only else None
    try:
        skipped = _already_rendered(seed_dir, only) if args.skip_existing else []
        written = render_all(
            seed_dir,
            make_synth(api_key),
            confirmed=True,
            only=only,
            skip_existing=args.skip_existing,
        )
    except (ValueError, RuntimeError, OSError, http.client.HTTPException) as exc:
        print(f"render failed: {_one_line(exc, api_key)}", file=sys.stderr)
        return 1
    for path in skipped:
        print(f"skipped {path}")
    for path in written:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
