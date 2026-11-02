"""Mechanical quality checks for the Spanish STANAG content.

Every check takes the dicts produced by the English builder's `parse_*` functions, so a
file that passes here also parses in the real seed pipeline. Each returns a list of error
strings prefixed with the item id (`R7`, `W3`, `L2`, `V`); an empty list means clean.
Set-level findings use the bare kind letter as prefix (`R: ...`).
"""

import re
import subprocess
import unicodedata
from collections import Counter
from collections.abc import Iterable
from pathlib import Path

RUBRIC_DIMENSIONS_ES = (
    "Precisión gramatical",
    "Rango léxico",
    "Coherencia y organización",
    "Cumplimiento de la tarea",
    "Registro y tono",
)
RUBRIC_DIMENSIONS_EN = (
    "Accuracy",
    "Range",
    "Coherence & organisation",
    "Task fulfilment",
    "Register & tone",
)

READING_BANDS = {3: (180, 320), 4: (220, 400)}
WRITING_BANDS = {
    (3, "formal_correspondence"): (150, 250),
    (3, "essay"): (250, 500),
    (4, "formal_correspondence"): (250, 400),
    (4, "essay"): (350, 700),
}

OPTION_LABELS = ("A", "B", "C", "D")

# The English set measures at most 0.17; 0.30 leaves room for honest paraphrase while a
# key lifted from the passage lands far above it.
MAX_KEY_OVERLAP = 0.30
MAX_LONGEST_KEY_SHARE = 0.35
MAX_KEY_LETTER_SHARE = 0.40
# Below ten items one item moves a share by ten points, so ratios say nothing.
SPREAD_MIN_ITEMS = 10
FULL_LEVEL_ITEMS = 30
FULL_LEVEL_LETTER_RANGE = (5, 10)

SET_TASK_COUNT = 16
SET_LEVELS = (3, 4)
SET_TASK_TYPES = ("formal_correspondence", "essay")
SET_TASKS_PER_TYPE = 4

LISTENING_LEVEL = 3
LISTENING_LINES = (8, 12)
LISTENING_WORDS = (350, 520)
AUDIO_SECONDS_PER_WORD = (0.28, 0.50)
MAX_CONVERSATION_TYPE_USES = 2
TTS_VOICES = frozenset({"alloy", "echo", "fable", "onyx", "nova", "shimmer"})
# The TTS endpoint rejects longer inputs after earlier lines were already billed.
TTS_MAX_CHARS = 4096

_FORBIDDEN_OPTION = re.compile(
    r"\b(todas|ninguna)\s+(de\s+)?(las|los)\s+(anteriores|opciones|respuestas|alternativas)\b"
    r"|\b(todas|ninguna)\s+(son|es)\s+(correctas?|ciertas?|verdaderas?)\b"
    r"|\b(all|none)\s+of\s+the\s+above\b",
    re.IGNORECASE,
)


def _word_count(text: str) -> int:
    return len(text.split())


def _words(text: str) -> list[str]:
    # NFC first: a decomposed accent splits `\w+` mid-word and hides real overlap.
    return re.findall(r"\w+", unicodedata.normalize("NFC", text).lower())


def _ngrams(words: list[str], n: int) -> list[tuple[str, ...]]:
    return [tuple(words[i : i + n]) for i in range(len(words) - n + 1)]


def _nfc_errors(ident: str, fields: Iterable[tuple[str, str | None]]) -> list[str]:
    return [
        f"{ident}: {name} is not NFC (decomposed accents break overlap checks and TTS)"
        for name, text in fields
        if text and unicodedata.normalize("NFC", text) != text
    ]


def _key_spread_errors(scope: str, letters: list[str], total: int, *, full_range: bool) -> list[str]:
    counts = Counter(letters)
    errors = []
    if full_range:
        low, high = FULL_LEVEL_LETTER_RANGE
        for label in OPTION_LABELS:
            if not low <= counts[label] <= high:
                errors.append(
                    f"{scope}: key spread: {label} is the key {counts[label]} times "
                    f"at {total} items, need {low}-{high}"
                )
        return errors
    for label in OPTION_LABELS:
        share = counts[label] / total
        if share > MAX_KEY_LETTER_SHARE:
            errors.append(
                f"{scope}: key spread: {label} is the key in {counts[label]} of {total} "
                f"({share:.0%}), limit {MAX_KEY_LETTER_SHARE:.0%}"
            )
    return errors


def key_overlap(key_text: str, passage: str, n: int = 4) -> float:
    """Measure how much of the key option is lifted from the passage.

    Args:
        key_text: Text of the correct option.
        passage: Reading passage the option is checked against.
        n: Size of the word n-grams compared.

    Returns:
        The share of the key's word n-grams that also occur in the passage, comparing
        lowercase `\\w+` tokens so accents survive. 0.0 when the key has fewer than `n`
        words.
    """
    key_grams = _ngrams(_words(key_text), n)
    if not key_grams:
        return 0.0
    passage_grams = set(_ngrams(_words(passage), n))
    return sum(gram in passage_grams for gram in key_grams) / len(key_grams)


def _check_reading_item(ident: str, item: dict, bands: dict) -> list[str]:
    errors = []
    options = item.get("options") or []
    labels = [option.get("label") for option in options]
    if labels != list(OPTION_LABELS):
        found = ", ".join(str(label) for label in labels) or "none"
        errors.append(f"{ident}: options must be A, B, C, D in order (found {found})")

    key = item.get("correctLabel")
    key_text = None
    if key not in OPTION_LABELS:
        errors.append(f"{ident}: invalid answer key {key!r}")
    else:
        key_text = next((o.get("text", "") for o in options if o.get("label") == key), None)

    for option in options:
        label = option.get("label")
        if not (option.get("rationale") or "").strip():
            errors.append(f"{ident}: option {label} rationale missing")
        match = _FORBIDDEN_OPTION.search(option.get("text") or "")
        if match:
            errors.append(f"{ident}: forbidden option {label}: {match.group(0)!r}")

    question = (item.get("question") or "").strip()
    if not question:
        errors.append(f"{ident}: question missing (the parser found no '**...?**' line)")
    else:
        if not question.endswith("?"):
            errors.append(
                f"{ident}: question must end with '?' (the parser drops one that does not "
                f"close with '?**'), found {question[-12:]!r}"
            )
        if "¿" not in question:
            errors.append(f"{ident}: question missing '¿'")

    level = item.get("level")
    passage = item.get("passage") or ""
    band = bands.get(level)
    if band is None:
        errors.append(f"{ident}: no passage band defined for level {level}")
    else:
        words = _word_count(passage)
        if not band[0] <= words <= band[1]:
            errors.append(
                f"{ident}: passage length {words} words outside L{level} band {band[0]}-{band[1]}"
            )

    if key_text:
        overlap = key_overlap(key_text, passage)
        if overlap > MAX_KEY_OVERLAP:
            errors.append(
                f"{ident}: key overlap {overlap:.2f} with the passage exceeds "
                f"{MAX_KEY_OVERLAP:.2f}, the key reads as a lift"
            )

    fields = [("topic", item.get("topic")), ("passage", passage), ("question", question)]
    for option in options:
        fields.append((f"option {option.get('label')}", option.get("text")))
        fields.append((f"option {option.get('label')} rationale", option.get("rationale")))
    errors += _nfc_errors(ident, fields)
    return errors


def _check_reading_set(items: list[dict], expect_count: int | None, bands: dict) -> list[str]:
    errors = []
    by_level: dict[int, list[dict]] = {}
    for item in items:
        by_level.setdefault(item.get("level"), []).append(item)

    if expect_count is not None:
        if len(items) != expect_count:
            errors.append(f"R: expected {expect_count} items, found {len(items)}")
        per_level = expect_count // len(bands)
        for level in sorted(bands):
            found = len(by_level.get(level, []))
            if found != per_level:
                errors.append(f"R: expected {per_level} L{level} items, found {found}")

    for level in sorted(by_level):
        group = by_level[level]
        if len(group) < SPREAD_MIN_ITEMS:
            continue
        longest = 0
        for item in group:
            lengths = {o.get("label"): len(o.get("text") or "") for o in item.get("options") or []}
            key = item.get("correctLabel")
            others = [n for label, n in lengths.items() if label != key]
            if key in lengths and others and lengths[key] > max(others):
                longest += 1
        share = longest / len(group)
        if share > MAX_LONGEST_KEY_SHARE:
            errors.append(
                f"R: level {level}: key is the longest option in {longest} of {len(group)} "
                f"items ({share:.0%}), limit {MAX_LONGEST_KEY_SHARE:.0%}"
            )
        letters = [item.get("correctLabel") for item in group]
        errors += _key_spread_errors(
            f"R: level {level}", letters, len(group), full_range=len(group) == FULL_LEVEL_ITEMS
        )
    return errors


def check_reading(
    items: list[dict], *, expect_count: int | None = None, bands: dict = READING_BANDS
) -> list[str]:
    """Check parsed reading items against the item-writing rules.

    Args:
        items: Dicts from the builder's `parse_reading`; ids are `R<position>`, 1-based.
        expect_count: Total the finished set must have. When given, each level in `bands`
            must also hold an equal share (60 items means 30 per level).
        bands: Passage word band per level.

    Returns:
        One string per violation: option layout, key, rationales, forbidden options,
        question punctuation, passage band, key overlap, NFC, and the per-level
        longest-key share and key-letter spread (only for levels with enough items).
    """
    errors = []
    for position, item in enumerate(items, start=1):
        errors += _check_reading_item(f"R{position}", item, bands)
    return errors + _check_reading_set(items, expect_count, bands)


_KEY_HEADER = re.compile(r"^### (\d+)\. Key: ([A-D])\s*$")
_ITEM_HEADER = re.compile(r"^### (\d+)\.")
_OPTION_LINE = re.compile(r"^- \[( |x)\] \*\*([A-D])\)\*\* \S")
_RATIONALE_LINE = re.compile(r"^\s+- \S")


def check_answer_key_layout(key_markdown: str) -> list[str]:
    """Check the answer-key markdown against what the parser can read.

    The parser takes each option's rationale from the single indented `- ` line right
    after the option line, so a wrapped rationale is silently truncated and a translated
    `Key:` token drops the whole block.

    Args:
        key_markdown: Full text of `reading-answer-key.md`.

    Returns:
        One string per violation, prefixed `R<item number>`: malformed header, duplicate
        block, options not A-D in order, `[x]` count or letter disagreeing with the
        header, and rationales that are missing or span more than one line.
    """
    blocks: list[tuple[str, list[str]]] = []
    for line in key_markdown.splitlines():
        if line.startswith("### "):
            blocks.append((line, []))
        elif line.startswith("## ") or line.startswith("# "):
            blocks.append(("", []))
        elif blocks:
            blocks[-1][1].append(line)

    errors = []
    seen: set[int] = set()
    for header, lines in blocks:
        if not header:
            continue
        header_match = _KEY_HEADER.match(header)
        number = _ITEM_HEADER.match(header)
        if header_match is None:
            ident = f"R{number.group(1)}" if number else "R"
            errors.append(f"{ident}: heading must be '### N. Key: X', found {header!r}")
            continue
        ident = f"R{header_match.group(1)}"
        key = header_match.group(2)
        if int(header_match.group(1)) in seen:
            errors.append(f"{ident}: duplicate key block")
        seen.add(int(header_match.group(1)))

        option_at = [(i, _OPTION_LINE.match(line)) for i, line in enumerate(lines)]
        option_at = [(i, m) for i, m in option_at if m]
        labels = [m.group(2) for _, m in option_at]
        if labels != list(OPTION_LABELS):
            found = ", ".join(labels) or "none"
            errors.append(f"{ident}: options must be A, B, C, D in order (found {found})")
        marked = [m.group(2) for _, m in option_at if m.group(1) == "x"]
        if len(marked) != 1:
            errors.append(f"{ident}: exactly one [x] option expected, found {len(marked)}")
        elif marked[0] != key:
            errors.append(f"{ident}: [x] marks {marked[0]} but the heading key is {key}")

        for index, match in option_at:
            label = match.group(2)
            following = []
            for line in lines[index + 1 :]:
                if not line[:1].isspace():
                    break
                following.append(line)
            if not following:
                errors.append(f"{ident}: option {label}: rationale line missing")
            elif len(following) > 1:
                errors.append(
                    f"{ident}: option {label}: rationale must be one line "
                    f"(found {len(following)} indented lines)"
                )
            elif not _RATIONALE_LINE.match(following[0]):
                errors.append(f"{ident}: option {label}: rationale must be an indented '- ' line")
    return errors


def _check_writing_task(ident: str, task: dict, dimensions: tuple[str, ...]) -> list[str]:
    errors = []
    level = task.get("stanagLevel")
    task_type = task.get("taskType")
    declared = (task.get("wordCountMin"), task.get("wordCountMax"))
    band = WRITING_BANDS.get((level, task_type))
    if band is None:
        errors.append(f"{ident}: no word band defined for L{level} {task_type!r}")
    elif declared != band:
        errors.append(
            f"{ident}: word band {declared[0]}-{declared[1]} declared, expected "
            f"{band[0]}-{band[1]} for L{level} {task_type}"
        )

    options = task.get("options") or [{}]
    answer = options[0].get("modelAnswer") or ""
    if not answer.strip():
        errors.append(f"{ident}: model answer missing")
    elif band is not None:
        words = _word_count(answer)
        if not band[0] <= words <= band[1]:
            errors.append(
                f"{ident}: model answer has {words} words, outside band {band[0]}-{band[1]}"
            )

    rubric = task.get("rubric") or []
    found = tuple(entry.get("dimension") for entry in rubric)
    if found != tuple(dimensions):
        errors.append(
            f"{ident}: rubric dimensions {list(found)} must be exactly {list(dimensions)} in this order"
        )
    for entry in rubric:
        if not (entry.get("descriptor") or "").strip():
            errors.append(f"{ident}: rubric {entry.get('dimension')!r} has no descriptor")

    instructions = task.get("instructions") or ""
    if not instructions.strip():
        errors.append(f"{ident}: instructions missing")

    fields = [("title", task.get("title")), ("instructions", instructions), ("model answer", answer)]
    fields += [(f"rubric {e.get('dimension')}", e.get("descriptor")) for e in rubric]
    return errors + _nfc_errors(ident, fields)


def _check_writing_set(tasks: list[dict]) -> list[str]:
    errors = []
    if len(tasks) != SET_TASK_COUNT:
        errors.append(f"W: set shape: expected {SET_TASK_COUNT} tasks, found {len(tasks)}")
    counts = Counter((t.get("stanagLevel"), t.get("taskType")) for t in tasks)
    for level in SET_LEVELS:
        for task_type in SET_TASK_TYPES:
            found = counts[(level, task_type)]
            if found != SET_TASKS_PER_TYPE:
                errors.append(
                    f"W: set shape: expected {SET_TASKS_PER_TYPE} L{level} {task_type} "
                    f"tasks, found {found}"
                )
    half = SET_TASK_COUNT // len(SET_LEVELS)
    expected_order = [level for level in SET_LEVELS for _ in range(half)]
    if len(tasks) == SET_TASK_COUNT and [t.get("stanagLevel") for t in tasks] != expected_order:
        errors.append(
            f"W: set shape: tasks 1-{half} must be level 3 and "
            f"tasks {half + 1}-{SET_TASK_COUNT} level 4"
        )
    return errors


def check_writing(
    tasks: list[dict],
    *,
    expect_set: bool = False,
    dimensions: tuple[str, ...] = RUBRIC_DIMENSIONS_ES,
) -> list[str]:
    """Check parsed writing tasks against the word bands and rubric.

    Args:
        tasks: Dicts from the builder's `parse_writing`; ids are `W<position>`, 1-based.
        expect_set: Also require the finished set: 16 tasks, tasks 1-8 level 3 and 9-16
            level 4, four correspondence and four essay per level.
        dimensions: Rubric labels every task must carry, in order.

    Returns:
        One string per violation: declared word band, model answer missing or outside the
        band, rubric labels, instructions, NFC, and (with `expect_set`) the set shape.
    """
    errors = []
    for position, task in enumerate(tasks, start=1):
        errors += _check_writing_task(f"W{position}", task, dimensions)
    if expect_set:
        errors += _check_writing_set(tasks)
    return errors


def _check_listening_item(ident: str, item: dict) -> list[str]:
    errors = []
    if item.get("level") != LISTENING_LEVEL:
        errors.append(f"{ident}: level {item.get('level')}, expected {LISTENING_LEVEL}")
    for name in ("topic", "conversationType", "setting"):
        if not (item.get(name) or "").strip():
            errors.append(f"{ident}: {name} missing")

    lines = item.get("lines") or []
    if not LISTENING_LINES[0] <= len(lines) <= LISTENING_LINES[1]:
        errors.append(
            f"{ident}: {len(lines)} lines, expected {LISTENING_LINES[0]}-{LISTENING_LINES[1]}"
        )
    words = sum(_word_count(line.get("text") or "") for line in lines)
    if not LISTENING_WORDS[0] <= words <= LISTENING_WORDS[1]:
        errors.append(f"{ident}: {words} words, expected {LISTENING_WORDS[0]}-{LISTENING_WORDS[1]}")
    for position, line in enumerate(lines, start=1):
        length = len(line.get("text") or "")
        if length > TTS_MAX_CHARS:
            errors.append(
                f"{ident}: line {position} has {length} characters, over the {TTS_MAX_CHARS} TTS limit"
            )

    speakers = item.get("speakers") or []
    voices = item.get("voices") or {}
    declared = {speaker.get("id") for speaker in speakers}
    undeclared: dict[str, int] = {}
    for position, line in enumerate(lines, start=1):
        speaker = line.get("speaker")
        if speaker not in declared:
            undeclared.setdefault(speaker, position)
    for speaker, position in undeclared.items():
        errors.append(f"{ident}: line {position} speaker {speaker!r} is not declared in speakers")

    by_voice: dict[str, list[str]] = {}
    for speaker in speakers:
        speaker_id = speaker.get("id")
        voice = voices.get(speaker_id)
        if voice is None:
            errors.append(f"{ident}: speaker {speaker_id!r} has no entry in voices")
            continue
        if voice not in TTS_VOICES:
            errors.append(f"{ident}: unknown voice {voice!r} for speaker {speaker_id!r}")
        if speaker.get("voice") != voice:
            errors.append(
                f"{ident}: speaker {speaker_id!r} voice {speaker.get('voice')!r} "
                f"differs from voices map {voice!r}"
            )
        by_voice.setdefault(voice, []).append(speaker_id)
    for voice, ids in by_voice.items():
        if len(ids) > 1:
            errors.append(f"{ident}: duplicate voice {voice!r} shared by {', '.join(map(str, ids))}")

    questions = item.get("questions") or []
    if not questions:
        errors.append(f"{ident}: no questions")
    fields = [("topic", item.get("topic")), ("setting", item.get("setting"))]
    fields += [(f"line {i}", line.get("text")) for i, line in enumerate(lines, start=1)]
    for number, question in enumerate(questions, start=1):
        scope = f"question {number}"
        if not (question.get("question") or "").strip():
            errors.append(f"{ident}: {scope} text missing")
        options = question.get("options") or {}
        if sorted(options) != list(OPTION_LABELS):
            errors.append(f"{ident}: {scope} options must be A, B, C, D")
        if question.get("correctLabel") not in OPTION_LABELS:
            key = question.get("correctLabel")
            errors.append(f"{ident}: {scope} has no valid answer key ({key!r})")
        if not (question.get("rationale") or "").strip():
            errors.append(f"{ident}: {scope} rationale missing")
        option_rationales = question.get("optionRationales") or {}
        for label in OPTION_LABELS:
            if not (option_rationales.get(label) or "").strip():
                errors.append(f"{ident}: {scope} option {label} rationale missing")
        fields.append((f"{scope} text", question.get("question")))
        fields += [(f"{scope} option {label}", text) for label, text in options.items()]
        fields.append((f"{scope} rationale", question.get("rationale")))
        fields += [
            (f"{scope} option {label} rationale", text) for label, text in option_rationales.items()
        ]
    return errors + _nfc_errors(ident, fields)


def check_listening(items: list[dict], *, expect_count: int | None = None) -> list[str]:
    """Check parsed listening items against the script and voice rules.

    Args:
        items: Dicts from the builder's `parse_listening`. They carry no file id, so ids
            are positional (`L1`, `L2`, ...) in file order.
        expect_count: Number of items the finished set must have.

    Returns:
        One string per violation: level, required fields, line and word counts, lines
        over the TTS limit, undeclared speakers, unknown or shared voices, question keys
        and rationales, NFC, conversation types used more than twice, and (from ten
        questions on) a dominant key letter.
    """
    errors = []
    type_uses: Counter[str] = Counter()
    letters = []
    for position, item in enumerate(items, start=1):
        ident = f"L{position}"
        errors += _check_listening_item(ident, item)
        kind = (item.get("conversationType") or "").strip().lower()
        if kind:
            type_uses[kind] += 1
            if type_uses[kind] > MAX_CONVERSATION_TYPE_USES:
                errors.append(
                    f"{ident}: conversation type {item.get('conversationType')!r} already "
                    f"used {MAX_CONVERSATION_TYPE_USES} times"
                )
        letters += [
            q.get("correctLabel") for q in item.get("questions") or []
            if q.get("correctLabel") in OPTION_LABELS
        ]

    if expect_count is not None and len(items) != expect_count:
        errors.append(f"L: expected {expect_count} items, found {len(items)}")
    if len(letters) >= SPREAD_MIN_ITEMS:
        errors += _key_spread_errors("L", letters, len(letters), full_range=False)
    return errors


def _audio_ident(mp3: Path) -> str:
    match = re.search(r"(\d+)$", mp3.stem)
    return f"L{int(match.group(1))}" if match else f"L({mp3.stem})"


def check_audio(item: dict, mp3: Path) -> list[str]:
    """Check that a rendered MP3 plausibly matches its script.

    Compares the duration reported by `ffprobe` with the script's word count, which
    catches a truncated render or a line that was skipped.

    Args:
        item: Parsed listening dict; its `lines` supply the word count.
        mp3: Rendered audio file. The id in messages is the number in its file name.

    Returns:
        One string when the file is missing, unreadable by `ffprobe`, or its seconds per
        word fall outside the allowed range; otherwise an empty list.
    """
    ident = _audio_ident(mp3)
    if not mp3.is_file():
        return [f"{ident}: mp3 missing: {mp3}"]
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(mp3),
            ],
            capture_output=True, text=True, timeout=60, check=False,
        )
    except FileNotFoundError:
        return [f"{ident}: ffprobe is not installed"]
    except subprocess.TimeoutExpired:
        return [f"{ident}: ffprobe timed out on {mp3.name}"]
    try:
        duration = float(result.stdout.strip())
    except ValueError:
        return [f"{ident}: ffprobe could not read a duration from {mp3.name}: {result.stderr.strip()}"]

    words = sum(_word_count(line.get("text") or "") for line in item.get("lines") or [])
    if words == 0:
        return [f"{ident}: script has no words to compare with the audio"]
    low, high = AUDIO_SECONDS_PER_WORD
    ratio = duration / words
    if not low <= ratio <= high:
        return [
            f"{ident}: duration {duration:.1f}s for {words} words is {ratio:.2f} s/word, "
            f"outside {low:.2f}-{high:.2f}"
        ]
    return []


def check_vocab(entries: list[dict], *, min_entries: int = 150, min_sections: int = 8) -> list[str]:
    """Check parsed vocabulary entries for volume and structure.

    `parse_vocab` strips section numbers, so sections are counted, not numbered.

    Args:
        entries: Dicts from the builder's `parse_vocab`.
        min_entries: Fewest table rows the guide must yield.
        min_sections: Fewest distinct sections the rows must come from.

    Returns:
        One string per violation, prefixed `V`: too few entries or sections, or text that
        is not NFC.
    """
    errors = []
    if len(entries) < min_entries:
        errors.append(f"V: {len(entries)} entries, need at least {min_entries}")
    sections = {entry.get("section") for entry in entries if entry.get("section")}
    if len(sections) < min_sections:
        errors.append(f"V: {len(sections)} sections, need at least {min_sections}")
    for position, entry in enumerate(entries, start=1):
        errors += _nfc_errors(
            "V",
            [
                (f"entry {position} term", entry.get("termEn")),
                (f"entry {position} translation", entry.get("translationIt")),
                (f"entry {position} note", entry.get("note")),
            ],
        )
    return errors
