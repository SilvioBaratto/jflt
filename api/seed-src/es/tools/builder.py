"""Load the English seed builder so the Spanish content is parsed by the exact same code."""

import importlib.util
from pathlib import Path
from types import ModuleType

REPO = Path(__file__).resolve().parents[4]
BUILDER_SCRIPT = REPO / "scripts" / "build-seed-data.py"


def load_builder(out: Path, ref: Path, audio_dest: Path) -> ModuleType:
    """Import `scripts/build-seed-data.py` and point its parsers at other folders.

    The script's filename has hyphens, so it cannot be imported by name; it is loaded by
    path and left untouched. Every call returns a fresh module, so overrides never leak
    between callers.

    Args:
        out: Folder holding `reading/`, `writing/` and `listening/` (replaces `OUT`).
        ref: Folder holding `english-vocabulary-guide.md` (replaces `REF`).
        audio_dest: Folder `parse_listening` copies MP3s into (replaces `AUDIO_DEST`);
            pass a temporary directory so nothing lands in `api/static/`.

    Returns:
        The loaded module, exposing `parse_reading`, `parse_writing`, `parse_listening`
        and `parse_vocab`.

    Raises:
        FileNotFoundError: If the builder script is missing.
    """
    spec = importlib.util.spec_from_file_location("build_seed_data", BUILDER_SCRIPT)
    if spec is None or spec.loader is None:
        raise FileNotFoundError(f"cannot load builder script: {BUILDER_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.OUT = out
    module.REF = ref
    module.AUDIO_DEST = audio_dest
    return module
