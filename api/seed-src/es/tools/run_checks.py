"""Run the mechanical checks over the Spanish content from the command line.

    python3 api/seed-src/es/tools/run_checks.py {reading|writing|listening|audio|vocab|all} [--final]
    python3 api/seed-src/es/tools/run_checks.py pack --kind {reading|listening} --first N --last M --out PATH
    python3 api/seed-src/es/tools/run_checks.py compare --answers PATH --kind {reading|listening} --first N --last M

Errors are printed one per line and the exit status is 1 when there is any. Without
`--final` a partially written file set is accepted; with it the Global Constraints counts
(60 reading, 16 writing, 12 listening, at least 150 vocabulary rows) are enforced.

`pack` writes the key-free items for positions N..M so an independent solver can answer
them blind; `compare` checks the solver's `{"R1": "A", "L2.1": "C", ...}` file against the
answer key and lists every mismatch or missing answer.
"""

import argparse
import json
import shutil
import sys
import tempfile
from collections import Counter
from collections.abc import Callable
from pathlib import Path

from blind import compare, expected_keys, listening_pack, reading_pack, requested_keys
from builder import REPO, load_builder
from checks import (
    check_answer_key_layout,
    check_audio,
    check_listening,
    check_reading,
    check_vocab,
    check_writing,
    check_writing_alignment,
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
    except (OSError, ValueError) as exc:
        return _unreadable("R", exc)
    errors = check_reading(items, expect_count=READING_COUNT if final else None)
    errors += check_answer_key_layout(key_markdown)
    levels = Counter(item["level"] for item in items)
    split = ", ".join(f"L{level} {levels[level]}" for level in sorted(levels))
    return errors, f"{len(items)} items ({split})"


def run_writing(root: Path, scratch: Path, final: bool) -> Result:
    """Check the writing tasks and model answers, and that the two files line up.

    Args:
        root: Repository root holding `api/seed-src/es` and `api/references/es`.
        scratch: Empty temporary directory the builder may write into.
        final: Enforce the finished-set counts instead of accepting a partial set.

    Returns:
        The error strings and a one-line summary of what was parsed.
    """
    folder = root / "api" / "seed-src" / "es" / "writing"
    builder = _es_builder(root, scratch)
    try:
        tasks = builder.parse_writing()
        exam = (folder / "writing-exam.md").read_text(encoding="utf-8")
        model = (folder / "writing-model-answers.md").read_text(encoding="utf-8")
    except (OSError, ValueError) as exc:
        return _unreadable("W", exc)
    errors = check_writing(tasks, expect_set=final)
    errors += check_writing_alignment(exam, model, allow_pending=not final)
    return errors, f"{len(tasks)} tasks"


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
    rendered = sum(script.with_suffix(".mp3").is_file() for script in scripts)
    if final and (len(scripts) != LISTENING_COUNT or rendered != len(scripts)):
        errors.append(
            f"audio: expected {LISTENING_COUNT} listening-NN.json scripts with an mp3 each, "
            f"found {len(scripts)} scripts and {rendered} with an mp3"
        )
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
        builder = load_builder(root / "api" / "seed-src" / "es", ref, scratch)
        entries = builder.parse_vocab()
    except (OSError, ValueError) as exc:
        return _unreadable("V", exc)
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


def _parse_kind(root: Path, kind: str, scratch: Path) -> list[dict]:
    builder = _es_builder(root, scratch)
    return builder.parse_reading() if kind == "reading" else builder.parse_listening()


def _load_answers(path: Path) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not all(isinstance(value, str) for value in data.values()):
        raise ValueError('expected a JSON object such as {"R1": "A"}')
    return data


def run_pack(root: Path, kind: str, first: int, last: int, out: Path) -> int:
    """Write the key-free pack for a window of items.

    Args:
        root: Repository root holding `api/seed-src/es`.
        kind: `reading` or `listening`.
        first: 1-based position of the first item.
        last: 1-based position of the last item (inclusive).
        out: JSON file to write; missing parent folders are created.

    Returns:
        0 when the pack was written, 1 when the content or the window is unusable.
    """
    with tempfile.TemporaryDirectory() as tmp:
        try:
            items = _parse_kind(root, kind, Path(tmp))
        except (OSError, ValueError) as exc:
            print(f"pack: cannot read the content files: {exc}")
            return 1
    try:
        pack = (reading_pack if kind == "reading" else listening_pack)(items, first, last)
    except ValueError as exc:
        print(f"pack: {exc}")
        return 1
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        # Keep accents literal: the solver reads the file as-is and \u escapes would hide typos.
        out.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"pack: cannot write {out}: {exc}")
        return 1
    print(f"pack: {len(pack)} {kind} items written to {out}")
    return 0


def run_compare(root: Path, kind: str, first: int, last: int, answers_path: Path) -> int:
    """Compare a solver's answers with the key for a window of items.

    Args:
        root: Repository root holding `api/seed-src/es`.
        kind: `reading` or `listening`.
        first: 1-based position of the first item.
        last: 1-based position of the last item (inclusive).
        answers_path: JSON object mapping each pack id to the solver's label.

    Returns:
        0 when every answer matches, 1 when any differs or the inputs are unusable.
    """
    try:
        answers = _load_answers(answers_path)
    except (OSError, ValueError) as exc:
        print(f"compare: cannot read the answers file: {exc}")
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        try:
            items = _parse_kind(root, kind, Path(tmp))
        except (OSError, ValueError) as exc:
            print(f"compare: cannot read the content files: {exc}")
            return 1
    keys = expected_keys(items, []) if kind == "reading" else expected_keys([], items)
    try:
        window = requested_keys(keys, kind, first, last)
    except ValueError as exc:
        print(f"compare: {exc}")
        return 1
    errors = compare(window, answers)
    for error in errors:
        print(error)
    print(f"compare: {len(window)} answers checked, {len(errors)} errors")
    return 1 if errors else 0


def _add_window_arguments(command: argparse.ArgumentParser) -> None:
    command.add_argument("--kind", choices=("reading", "listening"), required=True)
    command.add_argument("--first", type=int, required=True, help="1-based position of the first item")
    command.add_argument("--last", type=int, required=True, help="1-based position of the last item")


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser: one subcommand per check, `all`, `pack` and `compare`."""
    parser = argparse.ArgumentParser(prog="run_checks.py", description="Run the mechanical quality checks over the Spanish STANAG content.")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in (*CHECKS, "all"):
        help_text = "run every check" if name == "all" else f"run the {name} check"
        command = commands.add_parser(name, help=help_text)
        command.add_argument(
            "--final",
            action="store_true",
            help="enforce the finished-set counts instead of accepting partial files",
        )
    pack = commands.add_parser("pack", help="write the key-free items for a blind solve")
    _add_window_arguments(pack)
    pack.add_argument("--out", type=Path, required=True, help="JSON file to write")
    answers = commands.add_parser("compare", help="compare a solver's answers with the key")
    answers.add_argument("--answers", type=Path, required=True, help="JSON file of the solver's answers")
    _add_window_arguments(answers)
    return parser


def main(argv: list[str] | None = None, *, root: Path = REPO) -> int:
    """Run the selected checks, or the `pack` / `compare` blind-solve commands.

    Args:
        argv: Command-line arguments without the program name; `sys.argv` when None.
        root: Repository root holding `api/seed-src/es` and `api/references/es`.

    Returns:
        0 when every selected check is clean or the blind-solve command succeeded,
        1 when any reported an error.
    """
    args = build_parser().parse_args(argv)
    if args.command == "pack":
        return run_pack(root, args.kind, args.first, args.last, args.out)
    if args.command == "compare":
        return run_compare(root, args.kind, args.first, args.last, args.answers)
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
