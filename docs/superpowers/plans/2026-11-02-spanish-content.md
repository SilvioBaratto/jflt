# Spanish STANAG Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the full Spanish counterpart of the English JFLT exam-prep set (60 reading items, 16 writing tasks, 12 listening items with audio, a Spanish → Italian vocabulary guide, 4 grounding docs) as content files only.

**Architecture:** Content lives in `api/seed-src/es/` and `api/references/es/`, mirroring the English files so the existing `scripts/build-seed-data.py` parsers read them unchanged. A small tested Python toolkit in `api/seed-src/es/tools/` reuses those parsers to gate every batch (structure, statistics, blind solve, audio) and renders the MP3s through OpenAI TTS.

**Tech Stack:** Python 3.12, pytest 8, ffprobe, OpenAI TTS (`tts-1`) via `OPENAI_API_KEY` from the shell environment.

**Spec:** `docs/superpowers/specs/2026-11-02-spanish-content-design.md` (including its Amendments section)

## Global Constraints

- Write only under `api/references/es/`, `api/seed-src/es/` (incl. `tools/`) and `docs/superpowers/`. Never touch `scripts/build-seed-data.py`, `api/prisma/seed-data.json`, `api/static/` or `api/src/`.
- Structural tokens stay English and byte-identical to the English files: `## Level N`, `### N. (topic)`, `- **A)** `, `### N. Key: X`, `- [x]` / `- [ ]`, `## Task N — Title`, `*Level N · type · min–max words*` (literal `words`; types `formal_correspondence` / `essay`), `**Model answer**`, the listening JSON key names. The parsers match these literally; a Spanish `palabras` or `Respuesta modelo` breaks them silently.
- All natural-language content, rationales and model answers are Spanish: neutral standard Spanish, Spain-based institutional terms (*OTAN*, *Ministerio de Defensa*), formal correspondence in *usted*. Grounding docs are written in English.
- Counts: reading 60 (items 1–30 = L3, 31–60 = L4); writing 16 (Tasks 1–8 L3, 9–16 L4, 4 `formal_correspondence` + 4 `essay` per level); listening 12, all `stanag_level` 3; vocabulary guide ≥ 150 table rows.
- Writing bands: L3 correspondence 150–250, L3 essay 250–500, L4 correspondence 250–400, L4 essay 350–700 words. Reading passages: L3 180–320, L4 220–400 words.
- Original text only. Real outlets are register models, never copied. List sources under `Fuentes`.
- Every batch passes three gates before it is committed: tool checks clean, blind solve with zero mismatches, Spanish language review with findings fixed.
- Python comments explain why, not what, in English; public functions get Google-style docstrings; no TODO markers.
- Commit steps run only after the requester says to commit. Work on branch `feat/spanish-content`.

## Review Focus

Failure modes the spec implies that a candidate would hit, each pinned by a test in the task that owns the code:

1. A question that loses its closing `?` (e.g. ends `?»`) is dropped by the parser's `^\*\*(.*?\?)\*\*` match, and one missing `¿` reads as unedited English punctuation. → Task 1 tests.
2. A translated structural token (`palabras`, `Respuesta modelo`, `Clave:`) silently yields an empty model answer or a missing key. → Task 1 tests.
3. A rationale wrapped over two lines is truncated to its first line by `\s+- (.*)$`. → Task 1 tests.
4. A listening line over 4096 characters fails the TTS request after earlier lines were already paid for. → Task 3 test.
5. Decomposed accents (NFD) pasted from sources break n-gram overlap and TTS reading. → Task 1 tests.

---

### Task 1: Check toolkit (builder loader, checks, CLI)

**Files:**
- Create: `api/seed-src/es/tools/builder.py`, `checks.py`, `run_checks.py`
- Test: `api/seed-src/es/tools/test_builder.py`, `test_checks.py`

**Interfaces:**
- Produces:
  - `builder.load_builder(out: Path, ref: Path, audio_dest: Path) -> ModuleType` — imports `scripts/build-seed-data.py` by path and overrides its `OUT`, `REF`, `AUDIO_DEST` constants.
  - `checks.RUBRIC_DIMENSIONS_ES = ("Precisión gramatical", "Rango léxico", "Coherencia y organización", "Cumplimiento de la tarea", "Registro y tono")`; `RUBRIC_DIMENSIONS_EN = ("Accuracy", "Range", "Coherence & organisation", "Task fulfilment", "Register & tone")`.
  - `checks.READING_BANDS = {3: (180, 320), 4: (220, 400)}`; `checks.WRITING_BANDS` keyed `(level, taskType)` with the writing bands above.
  - `checks.key_overlap(key_text: str, passage: str, n: int = 4) -> float` — share of the key's word n-grams found in the passage.
  - `checks.check_reading(items: list[dict], *, expect_count: int | None = None, bands: dict = READING_BANDS) -> list[str]`; `checks.check_answer_key_layout(key_markdown: str) -> list[str]`.
  - `checks.check_writing(tasks: list[dict], *, expect_set: bool = False, dimensions: tuple[str, ...] = RUBRIC_DIMENSIONS_ES) -> list[str]`.
  - `checks.check_listening(items: list[dict], *, expect_count: int | None = None) -> list[str]`; `checks.check_audio(item: dict, mp3: Path) -> list[str]`; `checks.check_vocab(entries: list[dict], *, min_entries: int = 150, min_sections: int = 8) -> list[str]` (the English guide yields 155 entries across 9 sections: 1–7 plus the tables under 8.2 and 8.4; `parse_vocab` strips section numbers, so sections are counted, not numbered).
  - Every check returns error strings prefixed with the item id (`R7`, `W3`, `L02`, `V`); an empty list means clean. `items`/`tasks`/`entries` are the dicts returned by the builder's `parse_*` functions.
  - CLI: `python3 api/seed-src/es/tools/run_checks.py {reading|writing|listening|audio|vocab|all} [--final]` prints errors, exits 1 on any. Without `--final`, partial files are allowed; with it, the Global Constraints counts are enforced. Vocab runs on a temp copy named `english-vocabulary-guide.md`, the name `parse_vocab` hard-codes.

Thresholds (constants in `checks.py`): key overlap > 0.30 fails (English max 0.17); key is the longest option in > 35% of a level's items fails once the level has ≥ 10 items; any key letter > 40% of a level fails at ≥ 10 items, and at exactly 30 items each letter must be 5–10; listening 8–12 lines, 350–520 words, 0.28–0.50 s of audio per word, no `conversation_type` used more than twice, voices from `{alloy, echo, fable, onyx, nova, shimmer}` and distinct per speaker within an item.

- [ ] **Step 1: Create branch `feat/spanish-content` and write the failing tests**

`test_builder.py`: `test_load_builder_parses_english_set` — `load_builder(Path("api/seed-src"), Path("api/references"), tmp_path)` yields `len(parse_reading()) == 60` and `len(parse_writing()) == 16`.

`test_checks.py`, with small factory fixtures `make_item`, `make_task`, `make_listening`:
- Reading: `test_valid_item_passes` (`[] `); `test_flags_missing_rationale` (message has `R1` and `rationale`); `test_flags_key_overlap` (key copies 12 consecutive passage words → `overlap`); `test_flags_all_of_the_above` (option `Todas las anteriores` → `forbidden option`); `test_flags_passage_out_of_band` (100-word L3 passage → `passage length`); `test_flags_question_without_closing_mark` (question ending `?»` → `must end with '?'`); `test_flags_missing_inverted_mark` (`Qué sugiere el autor?` → `missing '¿'`); `test_flags_non_nfc_text` (passage with `é` → `not NFC`); `test_longest_key_share` (10 items, key longest in 4 → `longest`; in 3 → clean); `test_key_spread_flags_dominant_letter` (10 items all `A` → `key spread`); `test_expect_count` (59 items with `expect_count=60` → `expected 60`).
- `test_answer_key_layout_flags_wrapped_rationale`: an option line followed by two indented lines → `R1` and `rationale must be one line`.
- Writing: `test_valid_task_passes`; `test_flags_band_mismatch` (L3 essay declared 250–400 → `word band`); `test_flags_model_answer_outside_band` (100-word answer for 150–250 → `model answer`); `test_flags_missing_model_answer` (`modelAnswer == ""` → `model answer missing`); `test_flags_wrong_rubric_labels`; `test_set_shape` (`expect_set=True` with 15 tasks, or 5 essays at one level → `set shape`); `test_english_writing_passes` (English tasks with `dimensions=RUBRIC_DIMENSIONS_EN` → `[]`).
- Listening: `test_valid_item_passes`; `test_flags_speaker_not_declared`; `test_flags_duplicate_voice`; `test_flags_unknown_voice`; `test_flags_conversation_type_used_three_times`; `test_flags_line_over_4096_chars`; `test_english_listening_passes` (English set → `[]`); `test_check_audio_passes_english_sample` (`listening-01` json + mp3 → `[]`); `test_check_audio_flags_truncated_mp3` (first 20% of the bytes → `duration`).
- Vocab: `test_flags_below_min_entries`; `test_flags_too_few_sections` (7 distinct `section` values → `sections`); `test_english_vocab_passes` (English entries → `[]`).

- [ ] **Step 2: Run `python3 -m pytest api/seed-src/es/tools -q`** — Expected: collection errors / FAIL (modules missing).

- [ ] **Step 3: Implement `builder.py`, `checks.py` and `run_checks.py` to the Interfaces block**

`key_overlap` lowercases and tokenises with `\w+` so accents survive; the NFC check uses `unicodedata.normalize("NFC", s) != s`; `check_audio` shells out to `ffprobe -show_entries format=duration`.

- [ ] **Step 4: Run `python3 -m pytest api/seed-src/es/tools -q`** — Expected: all pass.

- [ ] **Step 5: Commit** — `git add api/seed-src/es/tools docs/superpowers` / `git commit -m "Add Spanish content check toolkit"`

### Task 2: Blind-solve packs and comparison

**Files:**
- Create: `api/seed-src/es/tools/blind.py`; extend `run_checks.py` with `pack`
- Test: `api/seed-src/es/tools/test_blind.py`

**Interfaces:**
- Consumes: parsed reading/listening dicts from Task 1's builder.
- Produces:
  - `blind.reading_pack(items: list[dict], first: int, last: int) -> list[dict]` — entries `{"id": "R<n>", "passage", "question", "options": {"A": ...}}` for 1-based positions `first..last`; nothing else.
  - `blind.listening_pack(items: list[dict], first: int, last: int) -> list[dict]` — `{"id": "L<n>", "transcript": "SPEAKER: text\n…", "questions": [{"id": "L<n>.<q>", "question", "options"}]}`.
  - `blind.expected_keys(reading: list[dict], listening: list[dict]) -> dict[str, str]` keyed by the ids above.
  - `blind.compare(expected: dict[str, str], answers: dict[str, str]) -> list[str]` — one message per mismatch or missing id; only ids present in `answers` or requested are compared.
  - CLI: `run_checks.py pack --kind {reading|listening} --first N --last M --out PATH` writes the pack JSON, `run_checks.py compare --answers PATH --kind … --first N --last M` prints `compare` output.

- [ ] **Step 1: Write failing tests** — `test_reading_pack_has_no_key_material` (`set(pack[0]) == {"id","passage","question","options"}` and the serialized pack contains no rationale text or `correctLabel`); `test_listening_pack_has_no_key_material`; `test_compare_reports_mismatch_and_missing` (`["R2: expected B, got C", "R3: no answer"]`); `test_compare_clean` (`[]`).
- [ ] **Step 2: Run the tests** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `blind.py` and the two CLI subcommands.**
- [ ] **Step 4: Run `python3 -m pytest api/seed-src/es/tools -q`** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "Add blind-solve packs and comparison"`

### Task 3: Audio renderer

**Files:**
- Create: `api/seed-src/es/tools/render_audio.py`
- Test: `api/seed-src/es/tools/test_render_audio.py`

**Interfaces:**
- Produces:
  - `Synth = Callable[[str, str], bytes]` — `(text, voice) -> mp3 bytes`.
  - `render_audio.openai_synth(api_key: str, model: str = "tts-1") -> Synth` — POST to `https://api.openai.com/v1/audio/speech` with `{"model","voice","input","response_format":"mp3"}`, as `api/src/modules/generate/tts.service.ts` does.
  - `render_audio.render_item(item: dict, synth: Synth) -> bytes` — one `synth` call per line in order, voice from `item["voices"][line["speaker"]]`, results concatenated.
  - `render_audio.render_all(seed_dir: Path, synth: Synth, *, confirmed: bool, only: set[str] | None = None) -> list[Path]` — writes `listening-NN.mp3` beside each `listening-NN.json`; raises `PermissionError` when `confirmed` is false.
  - CLI: `python3 api/seed-src/es/tools/render_audio.py --yes [--only listening-03]`; reads `OPENAI_API_KEY` from the environment and exits with a clear message when it is unset.

- [ ] **Step 1: Write failing tests** with a recording fake `synth`: `test_render_item_calls_synth_per_line_with_speaker_voice` (call order and voices asserted, output equals the byte concatenation); `test_render_item_rejects_speaker_without_voice` (raises `ValueError`, no calls made); `test_render_item_rejects_line_over_4096_chars_before_any_call` (raises `ValueError`, zero calls); `test_render_all_requires_confirmation` (`PermissionError`); `test_render_all_writes_mp3_next_to_json` (tmp dir, `only={"listening-01"}`).
- [ ] **Step 2: Run the tests** — Expected: FAIL (module missing).
- [ ] **Step 3: Implement `render_audio.py`.** Validate all lines before the first `synth` call so a bad item costs nothing.
- [ ] **Step 4: Run `python3 -m pytest api/seed-src/es/tools -q`** — Expected: all pass.
- [ ] **Step 5: Commit** — `git commit -m "Add listening audio renderer"`

### Task 4: Spanish grounding docs (research) — requester checkpoint

**Files:**
- Create: `api/references/es/item-writing-rules.md`, `topic-domains.md`, `writing-tasks-spec.md`, `stanag-l3-reading.md`

**Interfaces:**
- Produces: the rules every later task drafts against; `stanag-l3-reading.md` carries the passage bands `L3 180–320` and `L4 220–400`.

- [ ] **Step 1: Read the four English files in `api/references/`** and research online: BILC / STANAG 6001 level descriptors for reading and writing, and register and topic models from Spanish-language quality press and think tanks (analysis only, no copying). Record each source under `Fuentes`.
- [ ] **Step 2: Write the four docs in English**, same headings as the English ones, plus the Spanish-specific rules: neutral standard Spanish with Spain-based terms, *usted* register and formulae (*le ruego*, *atentamente*), subjunctive in concessive and hypothetical clauses, *se* passive and impersonal, nominalisation, connectors, no calques. In `item-writing-rules.md` rule 4 reads: the key is the longest option in at most 35% of a level's items.
- [ ] **Step 3: Verify** — `grep -c "180–320" api/references/es/stanag-l3-reading.md` and `grep -c "35%" api/references/es/item-writing-rules.md` both print `1` or more.
- [ ] **Step 4: Stop and ask the requester to review the four docs.** Tasks 5–8 and 10 start only after approval.
- [ ] **Step 5: Commit** — `git commit -m "Add Spanish grounding docs"`

### Task 5: Reading items 1–60

**Files:**
- Create: `api/seed-src/es/reading/reading-exam.md`, `reading-answer-key.md`

**Interfaces:**
- Consumes: Task 4 docs; `run_checks.py reading|pack|compare` from Tasks 1–2.
- Produces: 60 parseable items, L3 = 1–30 under `## Level 3`, L4 = 31–60 under `## Level 4`; exam file opens `# JFLT Reading Simulation` (Spanish topic text inside), key file `# JFLT Reading — Answer Key & Rationales`, each option followed by exactly one indented `- ` rationale line.

Batches: B1 = 1–10, B2 = 11–20, B3 = 21–30 (L3); B4 = 31–40, B5 = 41–50, B6 = 51–60 (L4). Each batch touches at least five of the six topic domains with at most two items per domain, and the key letters follow the spread constraints.

For each batch B1…B6 in order:
- [ ] **Step 1: Draft the batch** into both files per the grounding docs. A drafter agent writes to disk and returns no item text.
- [ ] **Step 2: Run `python3 api/seed-src/es/tools/run_checks.py reading`** — Expected: no errors. Fix and re-run until clean.
- [ ] **Step 3: Blind solve.** `run_checks.py pack --kind reading --first N --last M --out <scratch>/pack.json`; give a fresh read-only agent (`opus-synthesizer`) only that file path and ask for `{id: letter}` JSON; then `run_checks.py compare …`. Expected: no output. Revise or replace each mismatched item and repeat Steps 2–3 for it.
- [ ] **Step 4: Language review.** A fresh read-only agent reviews the batch for agreement, accents, `¿ ¡`, calques, register and naturalness; apply fixes, re-run Step 2.
- [ ] **Step 5: Commit** — `git commit -m "Add Spanish reading items N–M"`

After B6: `run_checks.py reading --final` — Expected: no errors (60 items, 30/30, spreads and longest-key share inside limits).

### Task 6: Writing tasks 1–8 (Level 3)

**Files:**
- Create: `api/seed-src/es/writing/writing-exam.md`, `writing-model-answers.md`

**Interfaces:**
- Produces: Tasks 1–8 in both files in identical order. Exam entry: `## Task N — Title`, `*Level 3 · formal_correspondence|essay · min–max words*`, scenario, requirement bullets. Model-answer entry: `## Task N — Title`, five bullets `- **<RUBRIC_DIMENSIONS_ES label>:** descriptor`, then `**Model answer**` and the answer. Types: 4 `formal_correspondence` + 4 `essay`. Scenarios keep the English military/diplomatic framing but are newly written.

- [ ] **Step 1: Draft prompts and model answers** per `writing-tasks-spec.md`; each model answer sits inside its word band and demonstrably meets the five rubric bullets.
- [ ] **Step 2: Run `run_checks.py writing`** — Expected: no errors.
- [ ] **Step 3: Language review** by a fresh read-only agent; apply fixes, re-run Step 2.
- [ ] **Step 4: Commit** — `git commit -m "Add Spanish writing tasks 1–8"`

### Task 7: Writing tasks 9–16 (Level 4)

Same files, interfaces and steps as Task 6, appended after Task 8 with `*Level 4 · …*` lines and the L4 bands (correspondence 250–400, essay 350–700). Four `formal_correspondence` + four `essay`. Verify with `run_checks.py writing --final` — Expected: no errors (16 tasks, 8/8 split, set shape). Commit: `Add Spanish writing tasks 9–16`.

### Task 8: Listening scripts 01–12

**Files:**
- Create: `api/seed-src/es/listening/listening-01.json` … `listening-12.json`

**Interfaces:**
- Produces: JSON in the shape of the English `listening-01.json`: `id` (`listening-NN`), `level` `"C1"`, `stanag_level` `3`, `topic`, `conversation_type`, `setting`, `voices` (`{SPEAKER: voice}`), `speakers` (`[{id, role, voice}]`), `lines` (`[{speaker, text}]`), `questions` — 3 each as `{id: 1..3, question, options: {A..D}, answer, rationale, option_rationales: {A..D}}`. Speakers 2–3 per item, 380–500 words per script.

Batches: 01–04, 05–08, 09–12. For each batch:
- [ ] **Step 1: Draft the four scripts and questions**; vary `conversation_type` (interview, panel, debate, press conference, briefing, podcast…) so none repeats more than twice across the set; keys spread over A–D.
- [ ] **Step 2: Run `run_checks.py listening`** — Expected: no errors.
- [ ] **Step 3: Blind solve** with `pack --kind listening` and `compare`, as in Task 5 Step 3 — Expected: no mismatches.
- [ ] **Step 4: Language review**, with attention to how the lines sound spoken (no long parentheticals, acronyms as *OTAN*); fix and re-run Step 2.
- [ ] **Step 5: Commit** — `git commit -m "Add Spanish listening scripts N–M"`

### Task 9: Render and verify audio

**Files:**
- Create: `api/seed-src/es/listening/listening-01.mp3` … `listening-12.mp3`

- [ ] **Step 1: Ask the requester to confirm** that the 12 scripts (about 5,000 words in total) may be sent to OpenAI TTS. Do not continue without a yes.
- [ ] **Step 2: Run `python3 api/seed-src/es/tools/render_audio.py --yes`** with `OPENAI_API_KEY` from the shell — Expected: 12 files written, no error.
- [ ] **Step 3: Run `run_checks.py audio`** — Expected: no errors (non-empty files, 0.28–0.50 s per word).
- [ ] **Step 4: Ask the requester to listen to `listening-01`, `-06` and `-12`** and report mispronounced names or acronyms; re-render affected items with `--only` after editing their scripts.
- [ ] **Step 5: Commit** — `git commit -m "Add Spanish listening audio"`

### Task 10: Vocabulary guide

**Files:**
- Create: `api/references/es/spanish-vocabulary-guide.md`

**Interfaces:**
- Produces: a file `parse_vocab` can read: one `# Parte I — Lessico operativo e di campo` heading; `## 1.`–`## 8.` sections (Italian titles, as in the English guide); `### 8.1`–`### 8.16` grammar subsections adapted to Spanish; tables with a header row and separator row, two columns (`Término español | Traducción / Significato`) or, for acronyms, three (`term | note | italiano`); a `Fuentes` list.

- [ ] **Step 1: Read English guide sections 1, 6, 7 and 8.1 in `api/references/english-vocabulary-guide.md`** to copy exact table column shapes and how examples are written.
- [ ] **Step 2: Write sections 1–7** with Spanish military, law-enforcement, intelligence, diplomacy, acronym and phrase vocabulary glossed in Italian, in three drafting batches (1–3, 4–5, 6–7).
- [ ] **Step 3: Write section 8** as Spanish C1 grammar for an Italian speaker (subjunctive, *ser/estar* and periphrases, *se* constructions, conditionals, reported speech, relatives, concession and contrast, nominalisation, hedging, sentence frames…); at least 14 of 8.1–8.16 present, explained in Italian with Spanish examples.
- [ ] **Step 4: Run `run_checks.py vocab`** — Expected: no errors (≥ 150 entries across ≥ 8 sections; put tables in sections 1–7 and at least one grammar subsection, as the English guide does in 8.2 and 8.4).
- [ ] **Step 5: Language review** (Spanish accuracy and Italian glosses) by a fresh read-only agent; fix and re-run Step 4.
- [ ] **Step 6: Commit** — `git commit -m "Add Spanish vocabulary guide"`

### Task 11: Final verification

- [ ] **Step 1: Run `python3 -m pytest api/seed-src/es/tools -q`** — Expected: all pass.
- [ ] **Step 2: Run `python3 api/seed-src/es/tools/run_checks.py all --final`** — Expected: no errors; the output lists 30 + 30 reading, 16 writing, 12 listening and the vocab entry count (the builder dry run).
- [ ] **Step 3: Confirm scope** — `git diff --stat main -- scripts api/prisma api/static api/src frontend` prints nothing, and `git diff --name-only main` lists only `api/references/es/`, `api/seed-src/es/` and `docs/superpowers/` paths.
- [ ] **Step 4: Report** to the requester: counts, per-batch blind-solve mismatch log (how many items were revised), the recommendation for a native Spanish reader before candidate use, and the finding that the English reading key is the longest option in 57–60% of items.
- [ ] **Step 5: Commit** any leftover files — `git commit -m "Finish Spanish content set"`
