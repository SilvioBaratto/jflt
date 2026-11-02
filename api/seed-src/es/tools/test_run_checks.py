from pathlib import Path

import pytest

from builder import REPO
from run_checks import main

ENGLISH_SEED = REPO / "api" / "seed-src"
ENGLISH_GUIDE = REPO / "api" / "references" / "english-vocabulary-guide.md"


def link_tree(source: Path, target: Path) -> None:
    """Mirror `source` under `target` with symlinks so the English MP3s are not copied."""
    target.mkdir(parents=True)
    for path in source.iterdir():
        (target / path.name).symlink_to(path)


@pytest.fixture
def root(tmp_path):
    """A repo-shaped tree whose Spanish folders hold the English set as stand-in content."""
    es = tmp_path / "api" / "seed-src" / "es"
    for kind in ("reading", "writing", "listening"):
        link_tree(ENGLISH_SEED / kind, es / kind)
    guide_dir = tmp_path / "api" / "references" / "es"
    guide_dir.mkdir(parents=True)
    (guide_dir / "spanish-vocabulary-guide.md").write_text(
        ENGLISH_GUIDE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    return tmp_path


def test_listening_and_audio_pass_on_a_clean_set(root, capsys):
    assert main(["listening", "--final"], root=root) == 0
    assert main(["audio", "--final"], root=root) == 0
    assert "listening: 12 items" in capsys.readouterr().out


def test_vocab_final_passes_and_runs_on_a_renamed_copy(root, capsys):
    assert main(["vocab", "--final"], root=root) == 0
    assert "155 entries" in capsys.readouterr().out


def test_reading_reports_errors_with_exit_code_one(root, capsys):
    assert main(["reading"], root=root) == 1
    assert "longest" in capsys.readouterr().out


def test_writing_flags_non_spanish_rubric_labels(root, capsys):
    assert main(["writing"], root=root) == 1
    assert "rubric" in capsys.readouterr().out


def test_final_enforces_counts_that_partial_runs_allow(root):
    guide = root / "api" / "references" / "es" / "spanish-vocabulary-guide.md"
    guide.write_text("## Uno\n\n| Término | Italiano |\n|---|---|\n| a | b |\n", encoding="utf-8")

    assert main(["vocab"], root=root) == 0
    assert main(["vocab", "--final"], root=root) == 1


def test_missing_files_are_reported_not_raised(tmp_path, capsys):
    assert main(["reading"], root=tmp_path) == 1
    assert "cannot read" in capsys.readouterr().out


def test_all_runs_every_check(root, capsys):
    assert main(["all", "--final"], root=root) == 1

    out = capsys.readouterr().out
    for kind in ("reading", "writing", "listening", "audio", "vocab"):
        assert f"{kind}:" in out
