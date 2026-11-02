import json
from collections.abc import Iterator
from pathlib import Path

import pytest

from blind import compare, expected_keys, listening_pack, reading_pack, requested_keys
from builder import REPO, load_builder
from run_checks import main

ENGLISH_SEED = REPO / "api" / "seed-src"
ENGLISH_REF = REPO / "api" / "references"


@pytest.fixture(scope="module")
def english(tmp_path_factory):
    """The parsed English reading and listening sets, used as realistic fixture data."""
    builder = load_builder(ENGLISH_SEED, ENGLISH_REF, tmp_path_factory.mktemp("audio"))
    return builder.parse_reading(), builder.parse_listening()


@pytest.fixture
def root(tmp_path):
    """A repo-shaped tree whose Spanish folders point at the English set as stand-in content."""
    es = tmp_path / "api" / "seed-src" / "es"
    es.mkdir(parents=True)
    for kind in ("reading", "writing", "listening"):
        (es / kind).symlink_to(ENGLISH_SEED / kind)
    return tmp_path


def strings(value) -> Iterator[str]:
    """Yield every key and string value in a nested JSON structure."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from strings(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from strings(inner)


def field_names(value) -> set[str]:
    """Collect every object key in a nested JSON structure."""
    if isinstance(value, dict):
        return set(value) | {name for inner in value.values() for name in field_names(inner)}
    if isinstance(value, list):
        return {name for inner in value for name in field_names(inner)}
    return set()


def write_answers(path: Path, answers: dict[str, str]) -> Path:
    """Write a solver's answers file and return its path."""
    path.write_text(json.dumps(answers), encoding="utf-8")
    return path


def test_reading_pack_has_no_key_material(english):
    """A reading pack entry carries only the id and what a candidate sees."""
    reading, _ = english
    pack = reading_pack(reading, 1, len(reading))

    assert set(pack[0]) == {"id", "passage", "question", "options"}
    assert all(set(entry) == set(pack[0]) for entry in pack)
    leaked = list(strings(pack))
    for item in reading:
        for option in item["options"]:
            assert not any(option["rationale"] in text for text in leaked)
        assert not any(item["topic"] in text for text in leaked)
    assert not {"correctLabel", "rationale", "level", "topic", "source"} & field_names(pack)


def test_listening_pack_has_no_key_material(english):
    """A listening pack never exposes keys, rationales, topics or audio metadata."""
    _, listening = english
    pack = listening_pack(listening, 1, len(listening))

    assert set(pack[0]) == {"id", "transcript", "questions"}
    assert all(set(entry["questions"][0]) == {"id", "question", "options"} for entry in pack)
    leaked = list(strings(pack))
    for item in listening:
        assert not any(item["topic"] in text for text in leaked)
        for question in item["questions"]:
            assert not any(question["rationale"] in text for text in leaked)
            for rationale in question["optionRationales"].values():
                assert not any(rationale in text for text in leaked)
    forbidden = {"correctLabel", "rationale", "optionRationales", "audioPath", "hasKey", "topic", "setting"}
    assert not forbidden & field_names(pack)


def test_reading_pack_ids_are_one_based_positions(english):
    """Ids follow the 1-based position in the full set, not the position in the window."""
    reading, _ = english
    pack = reading_pack(reading, 3, 4)

    assert [entry["id"] for entry in pack] == ["R3", "R4"]
    assert pack[0]["passage"] == reading[2]["passage"]
    assert pack[0]["question"] == reading[2]["question"]
    assert pack[0]["options"] == {option["label"]: option["text"] for option in reading[2]["options"]}


def test_listening_pack_transcript_and_question_ids(english):
    """The transcript is one `SPEAKER: text` line per turn and question ids nest under the item."""
    _, listening = english
    pack = listening_pack(listening, 2, 2)

    item = listening[1]
    assert [entry["id"] for entry in pack] == ["L2"]
    expected_transcript = "\n".join(f"{line['speaker']}: {line['text']}" for line in item["lines"])
    assert pack[0]["transcript"] == expected_transcript
    assert [q["id"] for q in pack[0]["questions"]] == [
        f"L2.{number}" for number in range(1, len(item["questions"]) + 1)
    ]
    assert pack[0]["questions"][0]["options"] == item["questions"][0]["options"]


def test_packs_do_not_alias_the_source_items(english):
    """Mutating a pack must not corrupt the parsed items the keys are read from."""
    reading, listening = english
    reading_pack(reading, 1, 1)[0]["options"]["A"] = "changed"
    listening_pack(listening, 1, 1)[0]["questions"][0]["options"]["A"] = "changed"

    assert reading[0]["options"][0]["text"] != "changed"
    assert listening[0]["questions"][0]["options"]["A"] != "changed"


@pytest.mark.parametrize("first, last", [(0, 3), (-1, 3), (4, 3), (1, 61)])
def test_reading_pack_rejects_bad_ranges(english, first, last):
    """Positions below 1, inverted windows and windows past the end are errors."""
    reading, _ = english

    with pytest.raises(ValueError, match="positions"):
        reading_pack(reading, first, last)


@pytest.mark.parametrize("first, last", [(0, 3), (5, 4), (1, 13)])
def test_listening_pack_rejects_bad_ranges(english, first, last):
    """Positions below 1, inverted windows and windows past the end are errors."""
    _, listening = english

    with pytest.raises(ValueError, match="positions"):
        listening_pack(listening, first, last)


def test_expected_keys_cover_every_answerable_id(english):
    """Reading items and listening questions are keyed; a listening item itself is not."""
    reading, listening = english
    keys = expected_keys(reading, listening)

    assert keys["R1"] == reading[0]["correctLabel"]
    assert keys["R60"] == reading[59]["correctLabel"]
    assert keys["L2.3"] == listening[1]["questions"][2]["correctLabel"]
    assert len([key for key in keys if key.startswith("R")]) == 60
    assert len([key for key in keys if key.startswith("L")]) == sum(len(item["questions"]) for item in listening)
    assert "L1" not in keys


def test_expected_keys_ids_match_the_pack_ids(english):
    """Every id a solver can answer has a key and every key has a matching pack id."""
    reading, listening = english
    keys = expected_keys(reading, listening)

    pack_ids = [entry["id"] for entry in reading_pack(reading, 1, 60)]
    for entry in listening_pack(listening, 1, 12):
        pack_ids += [question["id"] for question in entry["questions"]]
    assert set(pack_ids) == set(keys)


def test_requested_keys_restricts_to_the_range(english):
    """The comparison window is selected by item position within one kind."""
    reading, listening = english
    keys = expected_keys(reading, listening)

    assert requested_keys(keys, "reading", 2, 4) == {key: keys[key] for key in ("R2", "R3", "R4")}
    listening_ids = [f"L2.{n}" for n in range(1, len(listening[1]["questions"]) + 1)]
    assert requested_keys(keys, "listening", 2, 2) == {key: keys[key] for key in listening_ids}


def test_requested_keys_rejects_an_unknown_kind():
    """Only reading and listening have blind packs."""
    with pytest.raises(ValueError, match="kind"):
        requested_keys({}, "writing", 1, 2)


def test_compare_reports_mismatch_and_missing():
    """Each wrong or absent answer gets its own message."""
    expected = {"R1": "A", "R2": "B", "R3": "C"}

    assert compare(expected, {"R1": "A", "R2": "C"}) == ["R2: expected B, got C", "R3: no answer"]


def test_compare_clean():
    """Matching answers produce no messages."""
    expected = {"R1": "A", "L1.1": "D"}

    assert compare(expected, {"R1": "A", "L1.1": "D"}) == []


def test_compare_keeps_the_order_of_the_expected_keys():
    """Messages follow the key order rather than a string sort that would put R10 before R2."""
    expected = {"R2": "A", "R10": "B", "L1.1": "C"}

    assert compare(expected, {}) == ["R2: no answer", "R10: no answer", "L1.1: no answer"]


def test_compare_tolerates_case_and_surrounding_whitespace():
    """A solver writing ' b ' still means B."""
    assert compare({"R1": "B", "R2": "C"}, {"R1": " b ", "R2": "c\n"}) == []


def test_compare_treats_a_blank_answer_as_missing():
    """An empty answer is the same as no answer, not a wrong one."""
    assert compare({"R1": "B"}, {"R1": "  "}) == ["R1: no answer"]


def test_compare_flags_answers_for_ids_nobody_asked_about():
    """A stray id signals a solver working from the wrong pack."""
    expected = {"R1": "A"}

    assert compare(expected, {"R1": "A", "R9": "B", "R10": "C"}) == [
        "R9: not in the requested range",
        "R10: not in the requested range",
    ]


def test_pack_command_writes_reading_json(root, tmp_path, capsys):
    """`pack --kind reading` writes the window as JSON, creating the output folder."""
    out = tmp_path / "packs" / "reading.json"

    assert main(["pack", "--kind", "reading", "--first", "1", "--last", "3", "--out", str(out)], root=root) == 0

    pack = json.loads(out.read_text(encoding="utf-8"))
    assert [entry["id"] for entry in pack] == ["R1", "R2", "R3"]
    assert set(pack[0]) == {"id", "passage", "question", "options"}
    assert "3 reading" in capsys.readouterr().out


def test_pack_command_writes_listening_json(root, tmp_path):
    """`pack --kind listening` writes items with nested question ids."""
    out = tmp_path / "listening.json"

    assert main(["pack", "--kind", "listening", "--first", "1", "--last", "2", "--out", str(out)], root=root) == 0

    pack = json.loads(out.read_text(encoding="utf-8"))
    assert [entry["id"] for entry in pack] == ["L1", "L2"]
    assert pack[0]["questions"][0]["id"] == "L1.1"


def test_pack_command_keeps_non_ascii_text_readable(root, tmp_path):
    """Accented Spanish must reach the solver as text, not as \\u escapes."""
    es_reading = root / "api" / "seed-src" / "es" / "reading"
    es_reading.unlink()
    es_reading.mkdir()
    source = (ENGLISH_SEED / "reading" / "reading-exam.md").read_text(encoding="utf-8")
    (es_reading / "reading-exam.md").write_text(source.replace("NATO", "OTAN ñ á"), encoding="utf-8")
    (es_reading / "reading-answer-key.md").write_text(
        (ENGLISH_SEED / "reading" / "reading-answer-key.md").read_text(encoding="utf-8"), encoding="utf-8"
    )
    out = tmp_path / "reading.json"

    assert main(["pack", "--kind", "reading", "--first", "1", "--last", "60", "--out", str(out)], root=root) == 0

    raw = out.read_text(encoding="utf-8")
    assert "ñ á" in raw
    assert "\\u" not in raw


def test_pack_command_reports_an_out_of_range_request(root, tmp_path, capsys):
    """Asking for items that do not exist fails loudly and writes nothing."""
    out = tmp_path / "reading.json"

    assert main(["pack", "--kind", "reading", "--first", "1", "--last", "99", "--out", str(out)], root=root) == 1
    assert "positions" in capsys.readouterr().out
    assert not out.exists()


def test_pack_command_reports_missing_content_files(tmp_path, capsys):
    """A tree without content files is reported, not raised."""
    out = tmp_path / "reading.json"

    assert main(["pack", "--kind", "reading", "--first", "1", "--last", "1", "--out", str(out)], root=tmp_path) == 1
    assert "cannot read" in capsys.readouterr().out


def test_compare_command_is_clean_for_the_right_answers(root, tmp_path, capsys):
    """Answering with the key exits 0."""
    reading = load_builder(ENGLISH_SEED, ENGLISH_REF, tmp_path / "audio").parse_reading()
    answers = write_answers(tmp_path / "a.json", {f"R{n}": reading[n - 1]["correctLabel"] for n in (1, 2, 3)})

    code = main(["compare", "--answers", str(answers), "--kind", "reading", "--first", "1", "--last", "3"], root=root)

    assert code == 0
    assert "0 errors" in capsys.readouterr().out


def test_compare_command_lists_mismatches_and_missing_answers(root, tmp_path, capsys):
    """Wrong and absent answers are printed one per line and the exit status is 1."""
    reading = load_builder(ENGLISH_SEED, ENGLISH_REF, tmp_path / "audio").parse_reading()
    right = reading[0]["correctLabel"]
    wrong = next(label for label in "ABCD" if label != reading[1]["correctLabel"])
    answers = write_answers(tmp_path / "a.json", {"R1": right, "R2": wrong})

    code = main(["compare", "--answers", str(answers), "--kind", "reading", "--first", "1", "--last", "3"], root=root)

    out = capsys.readouterr().out
    assert code == 1
    assert f"R2: expected {reading[1]['correctLabel']}, got {wrong}" in out
    assert "R3: no answer" in out


def test_compare_command_only_checks_the_requested_range(root, tmp_path, capsys):
    """Items outside --first/--last are not reported as missing."""
    answers = write_answers(tmp_path / "a.json", {})

    main(["compare", "--answers", str(answers), "--kind", "listening", "--first", "2", "--last", "2"], root=root)

    out = capsys.readouterr().out
    assert "L2.1: no answer" in out
    assert "L1.1" not in out
    assert "L3.1" not in out


@pytest.mark.parametrize(
    "content",
    ["not json", "[1, 2]", '{"R1": 3}'],
    ids=["invalid-json", "not-an-object", "non-string-answer"],
)
def test_compare_command_rejects_a_malformed_answers_file(root, tmp_path, capsys, content):
    """Anything but a JSON object of string answers is reported, not raised."""
    answers = tmp_path / "a.json"
    answers.write_text(content, encoding="utf-8")

    code = main(["compare", "--answers", str(answers), "--kind", "reading", "--first", "1", "--last", "1"], root=root)

    assert code == 1
    assert "answers file" in capsys.readouterr().out


def test_compare_command_reports_a_missing_answers_file(root, tmp_path, capsys):
    """A path that does not exist is reported, not raised."""
    code = main(
        ["compare", "--answers", str(tmp_path / "none.json"), "--kind", "reading", "--first", "1", "--last", "1"],
        root=root,
    )

    assert code == 1
    assert "answers file" in capsys.readouterr().out
