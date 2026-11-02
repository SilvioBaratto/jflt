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


def replace_with_copy(path: Path, text: str) -> None:
    """Swap a symlinked English file for a real copy so edits never reach the originals."""
    path.unlink()
    path.write_text(text, encoding="utf-8")


def replace_with_bytes(path: Path, data: bytes) -> None:
    """Swap a symlinked English file for raw bytes without writing through the link."""
    path.unlink()
    path.write_bytes(data)


def edit_model_answers(root: Path, edit) -> None:
    model = root / "api" / "seed-src" / "es" / "writing" / "writing-model-answers.md"
    replace_with_copy(model, edit(model.read_text(encoding="utf-8")))


def test_writing_alignment_is_clean_on_the_matching_english_set(root, capsys):
    """Matching exam and model-answer headings produce no alignment error."""
    main(["writing", "--final"], root=root)

    assert "alignment" not in capsys.readouterr().out


def test_writing_flags_a_swapped_model_answer_title(root, capsys):
    """A model answer filed under another task's heading is reported by position."""
    edit_model_answers(
        root,
        lambda text: text.replace(
            "## Task 1 — Sanctions Framework Renewal: Request for Clarification",
            "## Task 1 — Procurement Recommendation: Supply Chain Diversification",
        ),
    )

    assert main(["writing"], root=root) == 1
    assert "W1: alignment" in capsys.readouterr().out


def test_writing_allows_fewer_model_answers_only_without_final(root, capsys):
    """A model file cut short is accepted while drafting and reported under --final."""
    edit_model_answers(root, lambda text: text[: text.index("## Task 4 ")])

    main(["writing"], root=root)
    assert "alignment" not in capsys.readouterr().out

    main(["writing", "--final"], root=root)
    assert "W: alignment: the exam has 16 tasks but the model answers have 3" in capsys.readouterr().out


def test_writing_rejects_more_model_answers_than_exam_tasks(root, capsys):
    """Extra model answers are an error even without --final."""
    edit_model_answers(root, lambda text: text + "\n## Task 17 — Extra\n\nCuerpo.\n")

    assert main(["writing"], root=root) == 1
    assert "W: alignment: the exam has 16 tasks but the model answers have 17" in capsys.readouterr().out


def test_audio_final_requires_twelve_scripts_with_an_mp3_each(root, capsys):
    """Under --final a missing script or a script without audio is an error."""
    listening = root / "api" / "seed-src" / "es" / "listening"
    (listening / "listening-12.json").unlink()

    assert main(["audio"], root=root) == 0
    assert main(["audio", "--final"], root=root) == 1
    assert "audio: expected 12 listening-NN.json scripts" in capsys.readouterr().out


def test_audio_final_flags_a_script_without_its_mp3(root, capsys):
    """A script whose MP3 is missing fails --final with the count message too."""
    (root / "api" / "seed-src" / "es" / "listening" / "listening-05.mp3").unlink()

    assert main(["audio", "--final"], root=root) == 1

    out = capsys.readouterr().out
    assert "audio: expected 12 listening-NN.json scripts" in out
    assert "11 with an mp3" in out


def test_reading_with_invalid_utf8_prints_one_error_line(root, capsys):
    """A mis-encoded reading file is reported, not raised as a traceback."""
    replace_with_bytes(root / "api" / "seed-src" / "es" / "reading" / "reading-exam.md", b"\xff\xfe\x80")

    assert main(["reading"], root=root) == 1

    out = capsys.readouterr().out
    assert out.startswith("R: cannot read the content files")
    assert "Traceback" not in out


def test_vocab_with_invalid_utf8_prints_one_error_line(root, capsys):
    """A mis-encoded vocabulary guide is reported, not raised as a traceback."""
    guide = root / "api" / "references" / "es" / "spanish-vocabulary-guide.md"
    guide.write_bytes(b"\xff\xfe\x80")

    assert main(["vocab"], root=root) == 1

    out = capsys.readouterr().out
    assert out.startswith("V: cannot read the content files")
    assert "Traceback" not in out


def test_help_describes_the_tool(capsys):
    """The parser carries its own one-line description instead of slicing the module doc."""
    with pytest.raises(SystemExit) as stopped:
        main(["--help"])

    assert stopped.value.code == 0
    assert "mechanical" in capsys.readouterr().out
