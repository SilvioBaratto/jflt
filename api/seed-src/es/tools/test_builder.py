from builder import REPO, load_builder


def test_load_builder_parses_english_set(tmp_path):
    builder = load_builder(REPO / "api" / "seed-src", REPO / "api" / "references", tmp_path)

    assert len(builder.parse_reading()) == 60
    assert len(builder.parse_writing()) == 16


def test_load_builder_redirects_audio_and_leaves_static_untouched(tmp_path):
    builder = load_builder(REPO / "api" / "seed-src", REPO / "api" / "references", tmp_path)

    builder.parse_listening()

    assert len(list(tmp_path.glob("listening-*.mp3"))) == 12


def test_load_builder_instances_do_not_share_overrides(tmp_path):
    first = load_builder(REPO / "api" / "seed-src", REPO / "api" / "references", tmp_path / "a")
    second = load_builder(tmp_path / "x", tmp_path / "y", tmp_path / "z")

    assert first.OUT == REPO / "api" / "seed-src"
    assert second.OUT == tmp_path / "x"
