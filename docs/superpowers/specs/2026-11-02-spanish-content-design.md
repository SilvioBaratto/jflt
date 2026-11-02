# Spanish STANAG exam-prep content — design

Date: 2026-11-02
Status: approved; amended during planning (see Amendments)

## Goal

Produce a Spanish counterpart of the English JFLT exam-prep material at the same quality: original,
STANAG 6001 Level 3 and Level 4 reading, writing, listening and vocabulary content, with per-option
rationales, model answers and audio. The material is delivered as content files only. The app
(schema, seed build, exam selection, UI, API TTS) is not changed.

## Non-goals

- No language dimension in `prisma/schema.prisma`, no change to `scripts/build-seed-data.py`, no
  change to `src/modules/*` or the frontend.
- No Spanish content in `prisma/seed-data.json` and nothing under `api/static/`.
- No Levels 1 and 2. The app serves L3–L4 only (`MIN_LEVEL = 3`), so the Spanish set matches.
- No speaking paper. The English set has none.

Wiring the Spanish set into the app is a separate project with its own spec.

## What the English set contains (reference)

| Part | Source | Shape |
|---|---|---|
| Reading | `api/seed-src/reading/reading-exam.md`, `reading-answer-key.md` | 60 items: `## Level 3` items 1–30, `## Level 4` items 31–60. Each is `### N. (topic)`, a passage, `**question?**`, four `- **A)** …` options. The key file has `### N. Key: X`, `- [x]` / `- [ ]` options, and one rationale sub-bullet per option. |
| Writing | `api/seed-src/writing/writing-exam.md`, `writing-model-answers.md` | 16 tasks: 8 at L3 and 8 at L4, each level split 4 `formal_correspondence` and 4 `essay`. Each task is `## Task N — Title`, then `*Level N · type · min–max words*`, a scenario and a bullet list of requirements. |
| Listening | `api/seed-src/listening/listening-01..12.json` plus `.mp3` | 12 items, all `stanag_level` 3. Keys: `id`, `level`, `stanag_level`, `topic`, `conversation_type`, `setting`, `voices`, `speakers`, `lines`, `questions` (3 per item, each with `options`, `answer`, `rationale`, `option_rationales`). |
| Vocabulary | `api/references/english-vocabulary-guide.md` | Bilingual English → Italian, Italian section titles. Its index promises Parts I–IV, but the file holds only Part I: sections 1–7 (operational lexicon, NATO acronyms, phrases) and section 8 (grammar, 8.1–8.16). `parse_vocab` yields 155 table rows from it. |
| Grounding | `api/references/` | `item-writing-rules.md`, `topic-domains.md`, `writing-tasks-spec.md`, `stanag-l3-reading.md` |

Word bands used by the English tasks: L3 correspondence 150–250, L3 essay 250–500, L4 correspondence
250–400, L4 essay 350–700.

## Decisions (agreed with the requester)

1. **Scope: content files only.** App integration is a follow-up project.
2. **Vocabulary gloss: Spanish → Italian**, mirroring the English guide, with Italian section titles.
3. **Volume: full parity** with the English set, as tabulated above (60 reading, 16 writing, 12
   listening, one vocabulary guide, four grounding docs).

## Deliverables and layout

Approach: mirror the English layout under an `es/` subfolder. `build-seed-data.py` reads fixed
English paths and globs only `seed-src/listening/listening-*.json`, so `es/` is not ingested.

```
api/references/es/
  item-writing-rules.md
  topic-domains.md
  writing-tasks-spec.md
  stanag-l3-reading.md
  spanish-vocabulary-guide.md
api/seed-src/es/
  reading/reading-exam.md
  reading/reading-answer-key.md
  writing/writing-exam.md
  writing/writing-model-answers.md
  listening/listening-01.json … listening-12.json
  listening/listening-01.mp3  … listening-12.mp3
```

Structural tokens stay byte-identical to the English files so that a later parser change is only a
path change: `## Level N`, `### N. (topic)`, `**A)**`, `### N. Key: X`, `[x]` / `[ ]`,
`## Task N — Title`, the `*Level N · type · min–max words*` line, and the JSON key names. Natural
language inside those tokens is Spanish, including rationales and model answers.

The grounding docs are written in English, like the English ones: they instruct the maintainer or
generator and are not exam content.

## Content rules

- **Original text only.** Real outlets and think tanks are used as register models and for topic
  research. No passage, sentence or distinctive phrase is copied. Sources consulted are listed under a
  `Fuentes` heading in the vocabulary guide and in each grounding doc where relevant.
- **Level descriptors.** STANAG 6001 descriptors are language-neutral. They are checked online against
  BILC and NATO material when the Spanish `stanag-l3-reading.md` is written.
- **Item rules.** The English `item-writing-rules.md` rules 1–12 apply unchanged: one defensible key
  from the passage alone, key not a verbatim lift and not systematically the longest, parallel
  options, plausible anchored distractors, no "all/none of the above", key positions spread roughly
  evenly over A–D, a rationale for every option.
- **Spanish-specific rules** added to the Spanish grounding docs: neutral standard Spanish with
  Spain-based institutional terms (*OTAN*, *Ministerio de Defensa*); formal register for
  correspondence (*usted*, *le ruego*, *atentamente*); L3/L4 syntax and lexis (subjunctive in
  concessive and hypothetical clauses, *se* passive and impersonal, nominalisation, discourse
  connectors); avoid calques from English.
- **Topics.** The domains in `topic-domains.md` (geopolitics, security and defence, economics, science
  and technology, society and culture, environment), with a specific angle per item.
- **Writing scenarios** keep the English set's military and diplomatic framing, so the exams are
  comparable, but are newly written and not translations.
- **Vocabulary guide.** Mirrors what the English file actually contains: `# Parte I`, sections 1–8 with
  Italian headings, tables for sections 1–7, grammar subsections 8.1–8.16 adapted to Spanish grammar
  (not translated from English). Parts II–IV, which the English index promises but does not contain,
  are out of scope.

## Quality gates

Every batch passes all three gates before it counts as done.

1. **Blind solve.** A separate agent receives only the passage and question and answers each MCQ
   without the key. A mismatch with the stored key means the item is revised and re-solved, or
   dropped and replaced. Applies to reading (60) and listening (36 questions).
2. **Mechanical checks (script).** Per file: four options per item; exactly one `[x]`; every option has
   a rationale; key position counts within a tolerable spread (target roughly 25% each of A–D per
   level); reading passages inside the Spanish `stanag-l3-reading.md` bands (L3 180–320 words, L4
   220–400) and writing answers inside the task bands above; no verbatim key lift, measured as the
   share of the key option's word 4-grams found in the passage (English set: max 0.17, so the
   threshold is 0.30); the key is the longest option in at most 35% of items per level (the English
   set sits at 57–60%, which breaks its own rule 4 and is not to be copied); listening JSON has all
   required keys and every `speaker` in `lines` appears in `speakers`.
3. **Spanish language review.** A separate agent reviews each file for agreement, accents and
   punctuation (¿ ¡), calques, register consistency and naturalness of spoken lines. Findings are fixed
   before the file is accepted.

## Audio

Each listening script's `lines` is rendered to MP3 with OpenAI TTS (`tts-1`, same as
`api/src/modules/generate/tts.service.ts`): one call per line, a fixed voice per speaker, byte
concatenation. A standalone script performs this and writes next to the script JSON. The API
service is not modified. `OPENAI_API_KEY` is read from the shell environment.

- The script text is sent to OpenAI. Rendering runs only after explicit confirmation.
- Each speaker keeps one voice for a whole item, and speakers within an item use distinct voices.
- Spoken lines spell acronyms as Spanish speakers say them (*OTAN*), and avoid constructions that TTS
  reads badly.
- Each MP3 is spot-checked for length and for a nonzero duration, and a sample of items is listened to.

## Build order

1. Spanish grounding docs, with online research for the descriptors and register. Reviewed before
   anything else.
2. Reading: six batches of 10 items, each gated, then the answer key.
3. Writing: tasks, then model answers, each model answer within its band and demonstrating the rubric.
4. Listening: scripts and questions, gated, then audio.
5. Vocabulary guide.
6. Final pass: whole-set mechanical checks and an out-of-tree parser dry run (below).

Steps 2–5 are independent once step 1 is accepted, so batches can run in parallel.

## Acceptance criteria

- File set and counts match the layout and table above.
- All three quality gates pass on every file, with the blind-solver result recorded.
- Parser dry run: the check tooling (`api/seed-src/es/tools/`) loads `scripts/build-seed-data.py`
  with `OUT`, `REF` and `AUDIO_DEST` redirected to the `es/` folders and a temporary directory, and
  runs `parse_reading`, `parse_writing` and `parse_listening` without error, yielding 30 + 30 reading
  items, 16 writing tasks and 12 listening items. This proves format parity without editing the
  script.
- The vocabulary guide is checked against `parse_vocab` by running it on a temporary copy named as the
  parser expects, since the parser hard-codes `english-vocabulary-guide.md`.
- 12 MP3s exist, each nonzero and at a plausible duration for its script.
- No file outside `api/references/es/`, `api/seed-src/es/` (including its `tools/`) and
  `docs/superpowers/` is changed, and `prisma/seed-data.json` and `api/static/` are untouched.

## Amendments (2026-11-02, during planning)

Found while reading the parsers and the English files for the plan:

1. The English vocabulary guide contains only Part I (see the reference table), so the Spanish guide
   mirrors that, not "Parts I–IV".
2. The English reading set has the key as the longest option in 57–60% of items. The Spanish set is
   held to 35% instead.
3. The check tooling lives in the repo under `api/seed-src/es/tools/`, not as a throwaway script,
   because every batch gate reuses it.
4. Reading passage bands come from the Spanish `stanag-l3-reading.md` (180–320 / 220–400), which the
   English passages (154–219 / 248–300) do not all meet.

## Risks

- **Rationale and answer-key quality is the weak point.** Generated MCQs most often fail with two
  defensible keys. The blind solver is the control, and its failures are tracked per batch.
- **Spanish naturalness.** A model-written set can read as translated English. The language review
  gate and the calque rule address this, but a human Spanish reader is the best final check, and is
  recommended before the content is used by candidates.
- **TTS prosody and names.** Proper names and acronyms may be misread. Scripts avoid them where
  possible, and spot-listening covers the rest.
- **Parser details not yet read.** The vocabulary-entry format expected by `parse_vocab` and the
  structure of the English `writing-model-answers.md` have not been inspected for this spec. The
  implementation plan starts by reading both so the Spanish files match.

## Assumptions to confirm at review

- The Spanish variety is neutral standard Spanish with Spain-based institutional terms.
- Rationales, model answers and listening-question text are in Spanish.
- Audio is rendered with OpenAI TTS from the shell-environment key, the same provider the API's
  `TtsService` uses. How the 12 English MP3s were originally produced is not recorded in the repo.
