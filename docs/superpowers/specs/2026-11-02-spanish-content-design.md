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

At hand-over three items stay open: the requester's spot-listen of `listening-01`, `-06` and `-12`,
the re-render of `listening-09` after the journalist's name change, and the question of whether the
reverse-test bar should be relaxed (see Amendments and Known limitations).

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

## Amendments (implementation)

Changes made while the content was written and reviewed. The git-ignored
SDD ledger records each gate result and ruling.

- **Neutral headings.** The reading heading and the listening card (`<conversation type> · <topic>`)
  are shown to the candidate above the passage, and the approved grounding docs told drafters to state
  the angle as a claim, which gave keys away. `topic-domains.md` and `item-writing-rules.md` were
  amended after the Task 4 approval so that headings are neutral subject-and-situation labels that
  never state or hint at the conclusion or an option. The edits ride in commits `eed4008` and `2fb44c4`
  (labelled as reading fixes): `item-writing-rules.md` +5/−2 lines, `topic-domains.md` +9/−4 lines.
- **Listening scripts section.** The English grounding docs have no listening rules, so
  `item-writing-rules.md` gained a "Listening scripts" section (script shape and the limits that
  `checks.py` enforces) in Task 4 (`fd142f8`, corrected in `35bc338`).
- **Writing rubric names.** The Spanish model-answer rubric dimensions differ from the English five:
  `Precisión gramatical`, `Rango léxico`, `Coherencia y organización`, `Cumplimiento de la tarea`,
  `Registro y tono` (`RUBRIC_DIMENSIONS_ES`) against `Accuracy`, `Range`, `Coherence & organisation`,
  `Task fulfilment`, `Register & tone`. `writing-tasks-spec.md` lists the Spanish labels.
- **Reverse test and blind packs.** The blind solver also receives the candidate-visible heading
  (Task 3c, `20502a5`), so the solve runs under real conditions. A second, reverse test answers each
  item from heading, stem and options only. A strong model reaches many keys that way through general
  knowledge, so it is used as a signal, not as a pass/fail gate: a batch fails it only if a key is
  reached at medium or higher confidence for a form-only reason (length, the only hedged option, echo of
  stem words) in more than three of ten items, or if an item has a second defensible key. Whether to
  relax this bar is an open question for the requester: the three questions of one listening dialogue
  share a theme, and repeated rework did not lower the count.
- **Vocabulary guide section 8.4.** The table is reshaped to three columns because `parse_vocab` keeps
  only cells 0, 2 and 1 of a row and a fourth column dropped the Italian; the English guide has the
  same defect and was not touched.
- **Model answers above the «Aim for» ranges.** The writing model answers sit inside the binding
  bands but above the «Aim for» ranges of `writing-tasks-spec.md` (see Known limitations). The brief
  given to the writer carried aims that differed from the spec's; the bands are binding.
- **Writing Tasks 3 and 5 replaced.** The whole-branch review found that Task 3 repeats the argument of
  Reading 1 (EU training missions in the Sahel) and Task 5 the Air Force retention case of Reading 56.
  Both tasks were rewritten in a separate writer task (commit `b43794b`), then checked by a
  language/facts review and an independent blind rater (results in the ledger).

**Blind-solve log.** Every solve of every batch matched all its keys, and the last solve of each batch
found no second defensible option (earlier rounds flagged second-key candidates, for example R14 and
R15, which were fixed). The reverse-test counts (items reached at medium or higher confidence for a
form-driven reason) are those recorded in the ledger; they differ between solvers because the
solver's label is liberal and the prompt was tightened between rounds.

| Batch | Solves (keys matched) | Reverse test, form-driven at medium+ |
|---|---|---|
| Reading B1 (1–10) | 10/10 in each of four solves | metric not yet defined; solve 2 flagged 5 keys guessable from option shape (R1, R3, R7, R9, R10); solve 3 reached 6 keys (R2, R3, R4, R5, R7, R10) plus 3 partly; solve 4 reached 10/10 at medium or low confidence (high only R6), mostly by knowledge; round-3 cap applied |
| Reading B2 (11–20) | 10/10, 10/10 | 4 (R14, R15, R19, R20), then 2 (R15, R20) |
| Reading B3 (21–30) | 10/10, 10/10 | 2 (R26, R30), then 0; re-reviewer 2 (R25, R30) |
| Reading B4 (31–40) | 10/10, 10/10 | 3 (R33, R37, R40), then 7 with a stricter prompt; low to medium after round 2 |
| Reading B5 (41–50) | 10/10, 10/10 | 7, then 7 (solver label liberal); re-reviewer 3 (R41, R43, R44) |
| Reading B6 (51–60) | 10/10, 10/10 | 1 (R53), then 1 (R59); re-reviewer 5 |
| Listening L1 (01–04) | 12/12, 12/12 | 2 (L1.3, L2.2), then 3 |
| Listening L2 (05–08) | 12/12 in three solves | 10 of 12, 10 of 12, 12 of 12; accepted at round 2 by ruling |
| Listening L3 (09–12) | 12/12, 12/12 | 9 of 12, then 10 of 12; accepted |

## Known limitations

1. **Reverse-test guessability.** Blind solvers reached the key from heading, stems and options at
   medium or higher confidence in many items (listening 05–12: 9–12 of 12 per batch). It was accepted
   by ruling after repeated fix rounds did not move the count; the English set is worse, because its
   headings state the answer.
2. **Answer-pattern cues.** The key is mid-length in about 78% of reading items and in 29 of 36
   listening questions (random would be about 50%).
3. **Repeated devices.** The Level 4 irony device (14 of 30 passages; 9 stems quote the approving
   phrase), recurring thesis templates ("the invisible loser", "the obvious cause is wrong") and
   recurring closings.
4. **Level drift.** R10, R18, R25, R28, R34 and R38 read at or below Level 3. Some listening questions
   restate one explicit sentence (04 Q3, 06 Q3, 10 Q1, 05 Q1 and Q2). Level 4 passages average 279 words
   against 266 for Level 3, and 10 of 30 fall below the stated Level 4 aim.
5. **Model-answer length.** Writing model answers exceed the «Aim for» ranges in 15 of 16 tasks and use
   some Level 4 devices.
6. **Cross-set overlaps.** Make-or-buy (R2, listening 03, W4); R5 with W6 and listening 12; R6 and R27
   with W8; same-angle pairs R19/L02, R12/L07, R31/R41 and R11/R58; angles shared with the English set:
   R26/EN35 and R44/EN49.
7. **Grammar evidence.** `rae.es` returned 403, so grammar claims rest on search extracts: deber and
   deber de, por más que with the indicative, por si, que galicado, apenas.
8. **Equivalences.** Spanish–Italian rank and unit equivalences are positional (≈); no official table
   was found.
9. **Time-bound statements.** The UNIFIL mandate, R34 and Regulation (EU) 2026/1388, the
   *juez de instrucción* entry, R51's account of the negotiations and the phrase "hace unos años" in
   listening 08.
10. **Audio.** Clips run 140–181 s, about twice BILC's 90-second single-question guidance (deliberate
    parity with the English set). The unmarked voices `alloy` and `fable` and the requester's
    spot-listen of listening-01, -06 and -12 are pending. The MP3 of listening-09 must be re-rendered
    after the journalist's name change (Daniel Ortega to Daniel Olmos); until then text and audio
    differ by one name.
11. **Toolkit.** Its tests are not in CI, need `ffprobe`, use the English files as fixtures, and
    `builder.py` locates the repo by `parents[4]`.
12. **Process.** Gate results and rulings are in the git-ignored SDD ledger. Commit trailers do not
    reliably record the authoring model: most drafts by Opus-class models carry the Sonnet trailer by
    instruction, while eight commits (among them `fd142f8`, `18fe79f`, `9148056`, `40ad0e5`) carry an
    Opus trailer.
    The branch base `0dc2c02` is six commits past the Mac copy's `63b64bd`.
