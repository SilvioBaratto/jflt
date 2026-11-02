"""Render the Spanish listening scripts to MP3 with OpenAI text-to-speech.

    OPENAI_API_KEY=... python3 api/seed-src/es/tools/render_audio.py --yes [--only listening-03]

Mirrors `api/src/modules/generate/tts.service.ts`: one speech request per script line, using
the voice mapped to that line's speaker, with the returned MP3 segments concatenated byte for
byte. Every `listening-NN.json` in `api/seed-src/es/listening` gets a `listening-NN.mp3`
beside it.

Rendering sends the script text to a third party, so nothing is sent without `--yes`.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from pathlib import Path

from builder import REPO

SPEECH_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_MODEL = "tts-1"
# The speech endpoint rejects any `input` longer than this.
MAX_LINE_CHARS = 4096
# A stalled connection would otherwise block a whole batch run indefinitely.
REQUEST_TIMEOUT_S = 120
ITEM_STEM = re.compile(r"listening-\d+")

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
        ValueError: If the script has no lines, a speaker has no voice, or a line is blank
            or longer than 4096 characters.
    """
    voices = item.get("voices") or {}
    lines = item.get("lines") or []
    if not lines:
        raise ValueError("script has no lines")
    for number, line in enumerate(lines, start=1):
        speaker = line.get("speaker")
        if not voices.get(speaker):
            raise ValueError(f"line {number}: speaker {speaker!r} has no voice")
        text = line.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"line {number}: text is empty")
        if len(text) > MAX_LINE_CHARS:
            raise ValueError(f"line {number}: {len(text)} characters exceeds the {MAX_LINE_CHARS} limit")


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
    if only is not None:
        unknown = sorted(only - found.keys())
        if unknown:
            raise ValueError(f"no such listening item in {seed_dir}: {', '.join(unknown)}")
        found = {stem: path for stem, path in found.items() if stem in only}
    return [found[stem] for stem in sorted(found)]


def render_all(
    seed_dir: Path, synth: Synth, *, confirmed: bool, only: set[str] | None = None
) -> list[Path]:
    """Render every listening script in `seed_dir` to an MP3 beside its JSON.

    Args:
        seed_dir: Folder holding `listening-NN.json` files.
        synth: Speech function; see `render_item`.
        confirmed: Whether the requester agreed to send the script text to the speech service.
        only: Item stems such as `{"listening-03"}` to render; every item when None.

    Returns:
        The MP3 paths written, in item order.

    Raises:
        PermissionError: If `confirmed` is false; nothing is read or sent.
        ValueError: If `only` names an item that does not exist, or any selected script fails
            `validate_item`. All scripts are validated before the first `synth` call so a bad
            item late in the batch cannot waste the earlier renders.
    """
    if not confirmed:
        raise PermissionError("rendering sends the script text to the speech service; pass confirmed=True")
    items: list[tuple[Path, dict]] = []
    for path in _selected_items(seed_dir, only):
        item = json.loads(path.read_text(encoding="utf-8"))
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
    return parser


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
        0 on success, 1 when the key is missing, `--yes` is absent, or a script is invalid.
    """
    args = build_parser().parse_args(argv)
    env = os.environ if environ is None else environ
    api_key = env.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set; export it before rendering.", file=sys.stderr)
        return 1
    try:
        written = render_all(
            seed_dir,
            make_synth(api_key),
            confirmed=args.yes,
            only=set(args.only) if args.only else None,
        )
    except PermissionError:
        print("Rendering sends the script text to OpenAI; re-run with --yes to confirm.", file=sys.stderr)
        return 1
    except (ValueError, RuntimeError) as exc:
        print(f"render failed: {exc}", file=sys.stderr)
        return 1
    for path in written:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
