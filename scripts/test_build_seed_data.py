"""Tests for scripts/build-seed-data.py, driven through its command line."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "scripts" / "build-seed-data.py"
ENGLISH_SAMPLES = REPO / "scripts" / "fixtures" / "english_seed_samples.json"
STATIC_LISTENING = REPO / "api" / "static" / "listening"

GROUPS = ("readingItems", "writingTasks", "listeningItems", "vocabEntries")
EXPECTED_COUNTS = {
    "en": {"readingItems": 60, "writingTasks": 16, "listeningItems": 12, "vocabEntries": 155},
    "es": {"readingItems": 60, "writingTasks": 16, "listeningItems": 12, "vocabEntries": 221},
}


def build(out_dir: Path, *args: str) -> dict:
    """Run the builder into `out_dir` without copying audio and return the seed data it wrote."""
    out = out_dir / "seed-data.json"
    subprocess.run([sys.executable, str(SCRIPT), "--out", str(out), "--no-audio", *args],
                   check=True, capture_output=True, text=True)
    return json.loads(out.read_text(encoding="utf-8"))


def records_in(data: dict, group: str, language: str) -> list[dict]:
    """Return the records of one group whose `language` is `language`, in output order."""
    return [record for record in data[group] if record.get("language") == language]


def static_listening_state() -> dict[str, int]:
    """Map every path under api/static/listening to its inode change time.

    `shutil.copy2` keeps the source mtime, so only the ctime reveals an overwrite.
    """
    if not STATIC_LISTENING.exists():
        return {}
    return {str(p.relative_to(STATIC_LISTENING)): p.stat().st_ctime_ns
            for p in sorted(STATIC_LISTENING.rglob("*"))}


@pytest.fixture(scope="module")
def all_languages(tmp_path_factory: pytest.TempPathFactory) -> dict:
    """Build both languages once per module; every parse takes a noticeable fraction of a second."""
    return build(tmp_path_factory.mktemp("all"), "--lang", "all")


def test_output_keeps_the_four_group_keys(all_languages):
    """The Prisma seed reads these exact keys, in this order."""
    assert list(all_languages) == list(GROUPS)


@pytest.mark.parametrize("language", ["en", "es"])
def test_all_holds_each_language_at_its_expected_size(all_languages, language):
    """Each language contributes its full bank to every group."""
    counts = {group: len(records_in(all_languages, group, language)) for group in GROUPS}
    assert counts == EXPECTED_COUNTS[language]


def test_every_record_belongs_to_a_known_language(all_languages):
    """A record without `en` or `es` would be skipped by the seed loader."""
    for group in GROUPS:
        expected = EXPECTED_COUNTS["en"][group] + EXPECTED_COUNTS["es"][group]
        assert len(all_languages[group]) == expected, group


def test_english_records_equal_the_samples_taken_before_languages_existed(all_languages):
    """English output must not drift: only the `language` field may be new."""
    samples = json.loads(ENGLISH_SAMPLES.read_text(encoding="utf-8"))
    for group in GROUPS:
        english = records_in(all_languages, group, "en")
        without_language = [{k: v for k, v in record.items() if k != "language"}
                            for record in (english[0], english[-1])]
        # Item lists keep key order, so a reordered record would change the JSON bytes too.
        assert [list(r.items()) for r in without_language] == \
            [list(r.items()) for r in samples[group]], group


def test_listening_audio_paths_point_at_each_language_folder(all_languages):
    """Both languages name their files listening-NN.mp3, so only the folder tells them apart."""
    english = [r["audioPath"] for r in records_in(all_languages, "listeningItems", "en")]
    spanish = [r["audioPath"] for r in records_in(all_languages, "listeningItems", "es")]
    assert english == [f"/static/listening/listening-{n:02d}.mp3" for n in range(1, 13)]
    assert spanish == [f"/static/listening/es/listening-{n:02d}.mp3" for n in range(1, 13)]


@pytest.mark.parametrize("language", ["en", "es"])
def test_single_language_build_holds_only_that_language(tmp_path, language):
    """`--lang` restricts the output to one language's records."""
    data = build(tmp_path, "--lang", language)
    assert {group: len(data[group]) for group in GROUPS} == EXPECTED_COUNTS[language]
    assert {r["language"] for group in GROUPS for r in data[group]} == {language}


def test_default_language_selection_is_all(tmp_path, all_languages):
    """A bare run regenerates both languages, as the documented rebuild command expects."""
    assert build(tmp_path) == all_languages


def test_no_audio_leaves_the_static_audio_folder_untouched(tmp_path):
    """`--no-audio` keeps the build free of writes into the served static folder."""
    before = static_listening_state()
    build(tmp_path, "--lang", "all")
    assert static_listening_state() == before
