import unicodedata
from types import SimpleNamespace

import pytest

from builder import REPO, load_builder
from checks import (
    RUBRIC_DIMENSIONS_EN,
    RUBRIC_DIMENSIONS_ES,
    WRITING_BANDS,
    check_answer_key_layout,
    check_audio,
    check_listening,
    check_reading,
    check_vocab,
    check_writing,
    key_overlap,
)

SEED_SRC = REPO / "api" / "seed-src"


@pytest.fixture(scope="module")
def english(tmp_path_factory):
    builder = load_builder(SEED_SRC, REPO / "api" / "references", tmp_path_factory.mktemp("audio"))
    return SimpleNamespace(
        reading=builder.parse_reading(),
        writing=builder.parse_writing(),
        listening=builder.parse_listening(),
        vocab=builder.parse_vocab(),
    )


def make_item(n=1, *, level=3, key="A", key_longest=False, words=None):
    words = words or (200 if level == 3 else 260)
    passage = " ".join(f"término{n}x{j}" for j in range(words))
    options = [
        {
            "label": label,
            "text": f"La opción {label} sostiene una postura propia sobre el asunto {n}",
            "rationale": f"Razón específica de la opción {label} en el ítem {n}.",
        }
        for label in "ABCD"
    ]
    longest = key if key_longest else next(label for label in "ABCD" if label != key)
    options["ABCD".index(longest)]["text"] += " y además añade un matiz extenso en su formulación"
    return {
        "level": level,
        "topic": f"Tema {n}",
        "passage": passage,
        "question": f"¿Qué sugiere el autor en el caso {n}?",
        "options": options,
        "correctLabel": key,
        "source": "seed",
    }


def make_level(count, *, level=3, longest=0, keys="ABCD"):
    return [
        make_item(i + 1, level=level, key=keys[i % len(keys)], key_longest=i < longest)
        for i in range(count)
    ]


def errors_with(errors, *needles):
    return [e for e in errors if all(needle in e for needle in needles)]


# --- reading ---------------------------------------------------------------


def test_valid_item_passes():
    assert check_reading([make_item()]) == []


def test_flags_missing_rationale():
    item = make_item()
    item["options"][2]["rationale"] = ""

    assert errors_with(check_reading([item]), "R1", "rationale")


def test_flags_key_overlap():
    item = make_item()
    item["options"][0]["text"] = " ".join(item["passage"].split()[10:22])

    assert errors_with(check_reading([item]), "R1", "overlap")


def test_flags_all_of_the_above():
    item = make_item()
    item["options"][3]["text"] = "Todas las anteriores"

    assert errors_with(check_reading([item]), "forbidden option")


def test_flags_none_of_the_above():
    item = make_item()
    item["options"][3]["text"] = "Ninguna de las anteriores es correcta"

    assert errors_with(check_reading([item]), "forbidden option")


def test_flags_passage_out_of_band():
    assert errors_with(check_reading([make_item(words=100)]), "passage length")


def test_level_four_uses_its_own_band():
    assert check_reading([make_item(level=4, words=260)]) == []
    assert errors_with(check_reading([make_item(level=4, words=200)]), "passage length")


def test_flags_question_without_closing_mark():
    item = make_item()
    item["question"] = "¿Qué sugiere el autor?»"

    assert errors_with(check_reading([item]), "must end with '?'")


def test_flags_missing_inverted_mark():
    item = make_item()
    item["question"] = "Qué sugiere el autor?"

    assert errors_with(check_reading([item]), "missing '¿'")


def test_flags_non_nfc_text():
    item = make_item()
    item["passage"] += " " + unicodedata.normalize("NFD", "café")

    assert errors_with(check_reading([item]), "not NFC")


def test_flags_invalid_key_and_option_labels():
    item = make_item()
    item["correctLabel"] = ""
    del item["options"][3]

    errors = check_reading([item])

    assert errors_with(errors, "R1", "key")
    assert errors_with(errors, "R1", "options")


def test_longest_key_share():
    assert errors_with(check_reading(make_level(10, longest=4)), "longest")
    assert check_reading(make_level(10, longest=3)) == []


def test_longest_key_share_waits_for_ten_items():
    assert check_reading(make_level(9, longest=9)) == []


def test_key_spread_flags_dominant_letter():
    assert errors_with(check_reading(make_level(10, keys="A")), "key spread")


def test_key_spread_requires_five_to_ten_per_letter_at_thirty_items():
    skewed = make_level(30, keys="AAAAAAAAAAABBBBBBBBBCCCCCDDDDD")
    balanced = make_level(30, keys="AABBCDDC")

    assert errors_with(check_reading(skewed), "key spread")
    assert check_reading(balanced) == []


def test_expect_count():
    items = make_level(30) + make_level(29, level=4)

    assert errors_with(check_reading(items, expect_count=60), "expected 60")
    assert errors_with(check_reading(items, expect_count=60), "expected 30", "L4")


def test_expect_count_met_is_clean():
    items = make_level(30, keys="AABBCDDC") + make_level(30, level=4, keys="AABBCDDC")

    assert check_reading(items, expect_count=60) == []


def test_key_overlap_measures_shared_four_grams():
    passage = "uno dos tres cuatro cinco seis siete"

    assert key_overlap("uno dos tres cuatro cinco", passage) == 1.0
    assert key_overlap("uno dos tres otro cinco", passage) == 0.0
    assert key_overlap("uno dos tres", passage) == 0.0


def test_key_overlap_ignores_case_punctuation_and_accent_encoding():
    passage = "La región, según el análisis, es estable"
    key = unicodedata.normalize("NFD", "LA REGIÓN según EL análisis")

    assert key_overlap(key, passage) == 1.0


def test_english_key_overlap_stays_below_threshold(english):
    worst = max(
        key_overlap(
            next(o["text"] for o in item["options"] if o["label"] == item["correctLabel"]),
            item["passage"],
        )
        for item in english.reading
    )

    assert worst < 0.30


# --- answer key layout -----------------------------------------------------


VALID_KEY = """# Clave

## Level 3

### 1. Key: B

- [ ] **A)** Primera opción.
  - Error: motivo de la primera.
- [x] **B)** Segunda opción.
  - Correcta: motivo de la segunda.
- [ ] **C)** Tercera opción.
  - Error: motivo de la tercera.
- [ ] **D)** Cuarta opción.
  - Error: motivo de la cuarta.
"""


def test_answer_key_layout_accepts_valid_block():
    assert check_answer_key_layout(VALID_KEY) == []


def test_answer_key_layout_flags_wrapped_rationale():
    wrapped = VALID_KEY.replace(
        "  - Error: motivo de la primera.\n",
        "  - Error: motivo de la primera\n    que continúa aquí.\n",
    )

    assert errors_with(check_answer_key_layout(wrapped), "R1", "rationale must be one line")


def test_answer_key_layout_flags_two_bullet_rationale():
    wrapped = VALID_KEY.replace(
        "  - Error: motivo de la primera.\n",
        "  - Error: motivo de la primera.\n  - Segundo punto.\n",
    )

    assert errors_with(check_answer_key_layout(wrapped), "R1", "rationale must be one line")


def test_answer_key_layout_flags_missing_rationale_line():
    missing = VALID_KEY.replace("  - Error: motivo de la tercera.\n", "")

    assert errors_with(check_answer_key_layout(missing), "R1", "option C", "rationale")


def test_answer_key_layout_flags_marker_that_disagrees_with_header():
    moved = VALID_KEY.replace("Key: B", "Key: C")

    assert errors_with(check_answer_key_layout(moved), "R1", "[x]")


def test_answer_key_layout_flags_translated_key_token():
    translated = VALID_KEY.replace("Key: B", "Clave: B")

    assert errors_with(check_answer_key_layout(translated), "R1", "Key:")


def test_answer_key_layout_flags_duplicate_block():
    assert errors_with(check_answer_key_layout(VALID_KEY + "\n" + VALID_KEY), "R1", "duplicate")


def test_english_answer_key_layout_passes():
    key = (SEED_SRC / "reading" / "reading-answer-key.md").read_text(encoding="utf-8")

    assert check_answer_key_layout(key) == []


# --- writing ---------------------------------------------------------------


def make_task(
    *,
    level=3,
    task_type="essay",
    band=None,
    answer_words=None,
    dimensions=RUBRIC_DIMENSIONS_ES,
):
    low, high = WRITING_BANDS[(level, task_type)]
    declared_low, declared_high = band or (low, high)
    count = answer_words if answer_words is not None else (low + high) // 2
    return {
        "taskType": task_type,
        "stanagLevel": level,
        "title": "Task 1 — Título",
        "instructions": "Redacte un texto sobre el asunto indicado.",
        "wordCountMin": declared_low,
        "wordCountMax": declared_high,
        "rubric": [{"dimension": d, "descriptor": f"Descriptor de {d}."} for d in dimensions],
        "options": [
            {"key": "main", "label": "", "prompt": "", "modelAnswer": " ".join(["palabra"] * count)}
        ],
        "source": "seed",
    }


def make_task_set():
    tasks = []
    for level in (3, 4):
        for task_type in ("formal_correspondence", "essay") * 4:
            tasks.append(make_task(level=level, task_type=task_type))
    return tasks


def test_valid_task_passes():
    assert check_writing([make_task()]) == []


def test_flags_band_mismatch():
    assert errors_with(check_writing([make_task(band=(250, 400))]), "W1", "word band")


def test_flags_unknown_level_or_type():
    task = make_task()
    task["taskType"] = "memo"

    assert errors_with(check_writing([task]), "W1", "word band")


def test_flags_model_answer_outside_band():
    task = make_task(task_type="formal_correspondence", answer_words=100)

    assert errors_with(check_writing([task]), "W1", "model answer")


def test_flags_missing_model_answer():
    task = make_task()
    task["options"][0]["modelAnswer"] = ""

    assert errors_with(check_writing([task]), "model answer missing")


def test_flags_wrong_rubric_labels():
    translated = make_task(dimensions=RUBRIC_DIMENSIONS_EN)
    reordered = make_task(dimensions=RUBRIC_DIMENSIONS_ES[::-1])

    assert errors_with(check_writing([translated]), "W1", "rubric")
    assert errors_with(check_writing([reordered]), "W1", "rubric")


def test_flags_non_nfc_model_answer():
    task = make_task()
    task["options"][0]["modelAnswer"] += " " + unicodedata.normalize("NFD", "señor")

    assert errors_with(check_writing([task]), "not NFC")


def test_set_shape():
    assert check_writing(make_task_set(), expect_set=True) == []
    assert errors_with(check_writing(make_task_set()[:15], expect_set=True), "set shape")

    five_essays = make_task_set()
    five_essays[0] = make_task(level=3, task_type="essay")
    assert errors_with(check_writing(five_essays, expect_set=True), "set shape")


def test_set_shape_requires_level_three_tasks_first():
    swapped = make_task_set()
    swapped = swapped[8:] + swapped[:8]

    assert errors_with(check_writing(swapped, expect_set=True), "set shape")


def test_english_writing_passes(english):
    assert check_writing(english.writing, dimensions=RUBRIC_DIMENSIONS_EN) == []
    assert check_writing(english.writing, expect_set=True, dimensions=RUBRIC_DIMENSIONS_EN) == []


# --- listening -------------------------------------------------------------


def make_listening(n=1, *, conversation_type=None, line_count=9, words_per_line=45):
    return {
        "level": 3,
        "topic": f"Tema {n}",
        "conversationType": conversation_type or f"formato {n}",
        "setting": "Un estudio de radio durante un programa de actualidad.",
        "voices": {"HOST": "nova", "GUEST": "onyx"},
        "speakers": [
            {"id": "HOST", "role": "Presentadora", "voice": "nova"},
            {"id": "GUEST", "role": "Analista", "voice": "onyx"},
        ],
        "lines": [
            {
                "speaker": "HOST" if k % 2 == 0 else "GUEST",
                "text": " ".join(f"voz{n}x{k}x{j}" for j in range(words_per_line)),
            }
            for k in range(line_count)
        ],
        "questions": [
            {
                "question": f"¿Qué afirma el invitado en la pregunta {q}?",
                "options": {label: f"Opción {label}" for label in "ABCD"},
                "correctLabel": "ABCD"[(n + q) % 4],
                "rationale": "Razón general.",
                "optionRationales": {label: f"Razón de {label}." for label in "ABCD"},
            }
            for q in range(3)
        ],
        "audioPath": None,
        "hasKey": True,
        "source": "seed",
    }


def test_valid_listening_item_passes():
    assert check_listening([make_listening()]) == []


def test_flags_speaker_not_declared():
    item = make_listening()
    item["lines"][2]["speaker"] = "INTRUSO"

    assert errors_with(check_listening([item]), "L1", "INTRUSO", "not declared")


def test_flags_duplicate_voice():
    item = make_listening()
    item["voices"]["GUEST"] = "nova"
    item["speakers"][1]["voice"] = "nova"

    assert errors_with(check_listening([item]), "L1", "duplicate voice")


def test_flags_unknown_voice():
    item = make_listening()
    item["voices"]["GUEST"] = "robot"
    item["speakers"][1]["voice"] = "robot"

    assert errors_with(check_listening([item]), "L1", "unknown voice")


def test_flags_voice_map_that_disagrees_with_speakers():
    item = make_listening()
    item["speakers"][1]["voice"] = "echo"

    assert errors_with(check_listening([item]), "L1", "voice")


def test_flags_conversation_type_used_three_times():
    items = [make_listening(n, conversation_type="debate") for n in (1, 2, 3)]

    errors = check_listening(items)

    assert errors_with(errors, "L3", "conversation type")
    assert not errors_with(errors, "L2", "conversation type")
    assert check_listening(items[:2]) == []


def test_flags_line_over_4096_chars():
    item = make_listening()
    item["lines"][0]["text"] = "a" * 4097

    assert errors_with(check_listening([item]), "L1", "4096")


def test_flags_line_count_outside_range():
    assert errors_with(check_listening([make_listening(line_count=7, words_per_line=55)]), "lines")
    assert errors_with(check_listening([make_listening(line_count=13, words_per_line=30)]), "lines")


def test_flags_word_count_outside_range():
    assert errors_with(check_listening([make_listening(words_per_line=30)]), "words")
    assert errors_with(check_listening([make_listening(words_per_line=65)]), "words")


def test_flags_level_other_than_three():
    item = make_listening()
    item["level"] = 4

    assert errors_with(check_listening([item]), "L1", "level")


def test_flags_unkeyed_question_and_missing_rationales():
    item = make_listening()
    item["questions"][0]["correctLabel"] = None
    item["questions"][1]["optionRationales"]["C"] = ""

    errors = check_listening([item])

    assert errors_with(errors, "L1", "question 1", "answer key")
    assert errors_with(errors, "L1", "question 2", "rationale")


def test_flags_non_nfc_line():
    item = make_listening()
    item["lines"][0]["text"] += " " + unicodedata.normalize("NFD", "canción")

    assert errors_with(check_listening([item]), "L1", "not NFC")


def test_listening_expect_count():
    assert errors_with(check_listening([make_listening()], expect_count=12), "expected 12")


def test_listening_key_spread():
    items = [make_listening(n) for n in range(1, 5)]
    for item in items:
        for question in item["questions"]:
            question["correctLabel"] = "A"

    assert errors_with(check_listening(items), "key spread")


def test_english_listening_passes(english):
    assert check_listening(english.listening, expect_count=12) == []


def test_check_audio_passes_english_sample(english):
    mp3 = SEED_SRC / "listening" / "listening-01.mp3"

    assert check_audio(english.listening[0], mp3) == []


def test_check_audio_flags_truncated_mp3(english, tmp_path):
    original = (SEED_SRC / "listening" / "listening-01.mp3").read_bytes()
    truncated = tmp_path / "listening-01.mp3"
    truncated.write_bytes(original[: len(original) // 5])

    assert errors_with(check_audio(english.listening[0], truncated), "L1", "duration")


def test_check_audio_flags_missing_and_unreadable_files(english, tmp_path):
    missing = tmp_path / "listening-02.mp3"
    garbage = tmp_path / "listening-03.mp3"
    garbage.write_bytes(b"not audio at all")

    assert errors_with(check_audio(english.listening[1], missing), "L2", "missing")
    assert errors_with(check_audio(english.listening[2], garbage), "L3", "ffprobe")


# --- vocab -----------------------------------------------------------------


def make_entries(count, sections):
    return [
        {
            "part": "I",
            "section": f"Sección {i % sections}",
            "termEn": f"término {i}",
            "translationIt": f"termine {i}",
            "note": None,
        }
        for i in range(count)
    ]


def test_valid_vocab_passes():
    assert check_vocab(make_entries(150, 8)) == []


def test_flags_below_min_entries():
    assert errors_with(check_vocab(make_entries(149, 8)), "V", "entries")


def test_flags_too_few_sections():
    assert errors_with(check_vocab(make_entries(160, 7)), "V", "sections")


def test_flags_non_nfc_vocab_term():
    entries = make_entries(150, 8)
    entries[4]["termEn"] = unicodedata.normalize("NFD", "ejército")

    assert errors_with(check_vocab(entries), "V", "not NFC")


def test_english_vocab_passes(english):
    assert len(english.vocab) == 155
    assert check_vocab(english.vocab) == []
