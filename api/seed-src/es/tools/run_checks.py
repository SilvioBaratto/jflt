"""Run the mechanical checks over the Spanish content from the command line.

    python3 api/seed-src/es/tools/run_checks.py {reading|writing|listening|audio|vocab|all} [--final]

Errors are printed one per line and the exit status is 1 when there is any. Without
`--final` a partially written file set is accepted; with it the Global Constraints counts
(60 reading, 16 writing, 12 listening, at least 150 vocabulary rows) are enforced.
"""

import argparse
import shutil
import sys
import tempfile
from collections import Counter
from collections.abc import Callable
from pathlib import Path

from builder import REPO, load_builder
from checks import (
    check_answer_key_layout,
    check_audio,
    check_listening,
    check_reading,
    check_vocab,
    check_writing,
)

READING_COUNT = 60
LISTENING_COUNT = 12
# `parse_vocab` hard-codes this file name, so the Spanish guide is checked as a renamed copy.
PARSER_VOCAB_NAME = "english-vocabulary-guide.md"
SPANISH_VOCAB_NAME = "spanish-vocabulary-guide.md"
MIN_VOCAB_ENTRIES = 150
MIN_VOCAB_SECTIONS = 8

Result = tuple[list[str], str]


def _unreadable(prefix: str, exc: Exception) -> Result:
    return [f"{prefix}: cannot read the content files: {exc}"], "not parsed"


def _es_builder(root: Path, scratch: Path):
    return load_builder(root / "api" / "seed-src" / "es", root / "api" / "references" / "es", scratch)


def run_reading(root: Path, scratch: Path, final: bool) -> Result:
    """Check the reading exam and its answer key.

    Args:
        root: Repository root holding `api/seed-src/es` and `api/references/es`.
        scratch: Empty temporary directory the builder may write into.
        final: Enforce the finished-set counts instead of accepting a partial set.

    Returns:
        The error strings and a one-line summary of what was parsed.
    """
    es = root / "api" / "seed-src" / "es"
    builder = _es_builder(root, scratch)
    try:
        items = builder.parse_reading()
        key_markdown = (es / "reading" / "reading-answer-key.md").read_text(encoding="utf-8")
    except OSError as exc:
        return _unreadable("R", exc)
    errors = check_reading(items, expect_count=READING_COUNT if final else None)
    errors += check_answer_key_layout(key_markdown)
    levels = Counter(item["level"] for item in items)
    split = ", ".join(f"L{level} {levels[level]}" for level in sorted(levels))
    return errors, f"{len(items)} items ({split})"


def run_writing(root: Path, scratch: Path, final: bool) -> Result:
    """Check the writing tasks and model answers.

    Args:
        root: Repository root holding `api/seed-src/es` and `api/references/es`.
        scratch: Empty temporary directory the builder may write into.
        final: Enforce the finished-set counts instead of accepting a partial set.

    Returns:
        The error strings and a one-line summary of what was parsed.
    """
    builder = _es_builder(root, scratch)
    try:
        tasks = builder.parse_writing()
    except (OSError, ValueError) as exc:
        return _unreadable("W", exc)
    return check_writing(tasks, expect_set=final), f"{len(tasks)} tasks"


def run_listening(root: Path, scratch: Path, final: bool) -> Result:
    """Check the listening scripts.

    Args:
        root: Repository root holding `api/seed-src/es` and `api/references/es`.
        scratch: Empty temporary directory the builder may write into.
        final: Enforce the finished-set counts instead of accepting a partial set.

    Returns:
        The error strings and a one-line summary of what was parsed.
    """
    builder = _es_builder(root, scratch)
    try:
        items = builder.parse_listening()
    except (OSError, ValueError) as exc:
        return _unreadable("L", exc)
    errors = check_listening(items, expect_count=LISTENING_COUNT if final else None)
    return errors, f"{len(items)} items"


def run_audio(root: Path, scratch: Path, final: bool) -> Result:
    """Check each rendered MP3 against its script's length.

    Args:
        root: Repository root holding `api/seed-src/es` and `api/references/es`.
        scratch: Empty temporary directory the builder may write into.
        final: Enforce the finished-set counts instead of accepting a partial set.

    Returns:
        The error strings and a one-line summary of what was parsed.
    """
    es = root / "api" / "seed-src" / "es"
    builder = _es_builder(root, scratch)
    try:
        items = builder.parse_listening()
    except (OSError, ValueError) as exc:
        return _unreadable("L", exc)
    scripts = sorted((es / "listening").glob("listening-*.json"))
    errors = []
    # `parse_listening` walks the same sorted glob, so items and scripts line up by index.
    for item, script in zip(items, scripts):
        errors += check_audio(item, script.with_suffix(".mp3"))
    if not scripts:
        errors.append("L: no listening-*.json scripts found")
    return errors, f"{len(scripts)} scripts"


def run_vocab(root: Path, scratch: Path, final: bool) -> Result:
    """Check the vocabulary guide through a copy named the way `parse_vocab` expects.

    Args:
        root: Repository root holding `api/seed-src/es` and `api/references/es`.
        scratch: Empty temporary directory the builder may write into.
        final: Enforce the finished-set counts instead of accepting a partial set.

    Returns:
        The error strings and a one-line summary of what was parsed.
    """
    guide = root / "api" / "references" / "es" / SPANISH_VOCAB_NAME
    ref = scratch / "ref"
    ref.mkdir()
    try:
        shutil.copyfile(guide, ref / PARSER_VOCAB_NAME)
    except OSError as exc:
        return _unreadable("V", exc)
    builder = load_builder(root / "api" / "seed-src" / "es", ref, scratch)
    entries = builder.parse_vocab()
    errors = check_vocab(
        entries,
        min_entries=MIN_VOCAB_ENTRIES if final else 1,
        min_sections=MIN_VOCAB_SECTIONS if final else 1,
    )
    sections = len({entry["section"] for entry in entries})
    return errors, f"{len(entries)} entries in {sections} sections"


CHECKS: dict[str, Callable[[Path, Path, bool], Result]] = {
    "reading": run_reading,
    "writing": run_writing,
    "listening": run_listening,
    "audio": run_audio,
    "vocab": run_vocab,
}


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser, one subcommand per check plus `all`."""
    parser = argparse.ArgumentParser(prog="run_checks.py", description=__doc__.split("\n\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    for name in (*CHECKS, "all"):
        help_text = "run every check" if name == "all" else f"run the {name} check"
        command = commands.add_parser(name, help=help_text)
        command.add_argument(
            "--final",
            action="store_true",
            help="enforce the finished-set counts instead of accepting partial files",
        )
    return parser


def main(argv: list[str] | None = None, *, root: Path = REPO) -> int:
    """Run the selected checks and print their errors.

    Args:
        argv: Command-line arguments without the program name; `sys.argv` when None.
        root: Repository root holding `api/seed-src/es` and `api/references/es`.

    Returns:
        0 when every selected check is clean, 1 when any reported an error.
    """
    args = build_parser().parse_args(argv)
    names = list(CHECKS) if args.command == "all" else [args.command]
    failed = False
    # The builder copies listening MP3s while parsing, so keep that out of api/static/.
    with tempfile.TemporaryDirectory() as tmp:
        for name in names:
            scratch = Path(tmp) / name
            scratch.mkdir()
            errors, summary = CHECKS[name](root, scratch, args.final)
            for error in errors:
                print(error)
            print(f"{name}: {summary}, {len(errors)} errors")
            failed = failed or bool(errors)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
