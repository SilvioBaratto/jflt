"""Blind-solve packs: exam items with the answer key stripped, and the comparison afterwards.

A solver that has seen the key or a rationale proves nothing about whether an item has
exactly one defensible answer. The packs therefore carry only what a candidate sees, and
every field is copied explicitly so a new key-related field in the parsed dicts can never
leak into a pack by accident. Ids are 1-based positions in the parsed set: `R<n>` for a
reading item, `L<n>` for a listening item and `L<n>.<q>` for its questions.
"""

import re
from collections.abc import Sequence

READING_ID = re.compile(r"R(\d+)")
LISTENING_ID = re.compile(r"L(\d+)\.\d+")


def _check_window(count: int, first: int, last: int) -> None:
    if first < 1 or last < first or last > count:
        raise ValueError(f"positions {first}..{last} are not within 1..{count}")


def reading_pack(items: Sequence[dict], first: int, last: int) -> list[dict]:
    """Build the key-free pack for a window of reading items.

    Args:
        items: Parsed reading dicts in file order.
        first: 1-based position of the first item to include.
        last: 1-based position of the last item to include (inclusive).

    Returns:
        One `{"id", "passage", "question", "options"}` entry per item, with `options`
        mapping each label to its text. Nothing that reveals the key is included.

    Raises:
        ValueError: If the window is not within `1..len(items)`.
    """
    _check_window(len(items), first, last)
    return [
        {
            "id": f"R{position}",
            "passage": item["passage"],
            "question": item["question"],
            "options": {option["label"]: option["text"] for option in item["options"]},
        }
        for position, item in enumerate(items, start=1)
        if first <= position <= last
    ]


def listening_pack(items: Sequence[dict], first: int, last: int) -> list[dict]:
    """Build the key-free pack for a window of listening items.

    Args:
        items: Parsed listening dicts in file order.
        first: 1-based position of the first item to include.
        last: 1-based position of the last item to include (inclusive).

    Returns:
        One `{"id", "transcript", "questions"}` entry per item. The transcript has one
        `SPEAKER: text` line per turn; each question is `{"id", "question", "options"}`.
        Topic, setting, speakers' roles, audio path and every rationale are left out.

    Raises:
        ValueError: If the window is not within `1..len(items)`.
    """
    _check_window(len(items), first, last)
    return [
        {
            "id": f"L{position}",
            "transcript": "\n".join(f"{line['speaker']}: {line['text']}" for line in item["lines"]),
            "questions": [
                {
                    "id": f"L{position}.{number}",
                    "question": question["question"],
                    "options": dict(question["options"]),
                }
                for number, question in enumerate(item["questions"], start=1)
            ],
        }
        for position, item in enumerate(items, start=1)
        if first <= position <= last
    ]


def expected_keys(reading: Sequence[dict], listening: Sequence[dict]) -> dict[str, str]:
    """Collect the correct label for every answerable id.

    Args:
        reading: Parsed reading dicts in file order.
        listening: Parsed listening dicts in file order.

    Returns:
        A map from `R<n>` and `L<n>.<q>` to the correct label. A listening item itself
        has no entry because only its questions are answered.
    """
    keys = {f"R{position}": item["correctLabel"] for position, item in enumerate(reading, start=1)}
    for position, item in enumerate(listening, start=1):
        for number, question in enumerate(item["questions"], start=1):
            keys[f"L{position}.{number}"] = question["correctLabel"]
    return keys


def requested_keys(expected: dict[str, str], kind: str, first: int, last: int) -> dict[str, str]:
    """Restrict the keys to the items a solver was asked about.

    Args:
        expected: The full key map from `expected_keys`.
        kind: `reading` or `listening`.
        first: 1-based position of the first item in the window.
        last: 1-based position of the last item in the window (inclusive).

    Returns:
        The entries of `expected` that belong to the window, in their original order.

    Raises:
        ValueError: If `kind` is unknown or some position in the window has no keys.
    """
    if kind == "reading":
        pattern = READING_ID
    elif kind == "listening":
        pattern = LISTENING_ID
    else:
        raise ValueError(f"kind must be reading or listening, not {kind!r}")
    position_of = {key: int(match.group(1)) for key in expected if (match := pattern.fullmatch(key))}
    available = set(position_of.values())
    if first < 1 or last < first or not set(range(first, last + 1)) <= available:
        raise ValueError(f"positions {first}..{last} are not all in the {kind} set of {len(available)} items")
    return {key: expected[key] for key, position in position_of.items() if first <= position <= last}


def compare(expected: dict[str, str], answers: dict[str, str]) -> list[str]:
    """Report every place a solver's answers differ from the key.

    Pass only the requested slice of the key as `expected`; every id in it must be
    answered, so anything the solver skipped is reported rather than ignored.

    Args:
        expected: The correct label per id for the items the solver was given.
        answers: The solver's label per id. Case and surrounding whitespace are ignored.

    Returns:
        One message per wrong or missing answer in the order of `expected`, followed by
        one per answered id that was never asked. Empty when everything matches.
    """
    errors = []
    for key, label in expected.items():
        given = answers.get(key, "").strip().upper()
        if not given:
            errors.append(f"{key}: no answer")
        elif given != label:
            errors.append(f"{key}: expected {label}, got {given}")
    errors += [f"{key}: not in the requested range" for key in answers if key not in expected]
    return errors
