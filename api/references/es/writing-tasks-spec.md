# JFLT writing paper — task specification (grounding, Spanish)

The Spanish writing set mirrors the English seed set: 16 tasks of rising difficulty, each with a clear
prompt, the word band, a scoring rubric, and a model answer at the target level so the candidate can
self-assess. Prompts, instructions, rubric descriptors and model answers are written in Spanish.
Scenarios keep the English set's military and diplomatic framing (staff officers, attachés,
headquarters, ministries) so the two exams are comparable, but every task is newly written — never
translated or adapted from an English task, and with none of its names or accords.

The three `## Task` headings below describe task types (`guided_note`, `formal_correspondence`,
`essay`); the exam's own task numbering is under "The 16-task exam set".

## Task 1 — Guided note (Level ~1–2)
- Not part of the Spanish exam set; kept so the two specifications stay comparable and for on-demand
  generation.
- Length: 50–100 words.
- A short practical message responding to a concrete situation (a note, a message, a short request).
- Assesses: clear, correct, relevant everyday writing; simple connected sentences.

## Task 2 — Formal correspondence / report (Levels 3 and 4)
- Length: Level 3 150–250 words; Level 4 250–400 words.
- A formal letter, email, or short report for a professional purpose (a request, a complaint, a
  recommendation, a briefing).
- Level 3: effective formal correspondence on practical, social and professional topics; ideas
  clearly related and coherently ordered; occasional errors that never block comprehension.
- Level 4: the same genres when the writer must represent an official policy or point of view,
  persuade, or handle disagreement with a senior or foreign counterpart — precision, tailoring to the
  reader, and control of nuance and shades of meaning.
- Assesses: appropriate formal register and conventions, organisation, accurate functional language.

## Task 3 — Essay (Levels 3 and 4)
- Length: Level 3 250–500 words; Level 4 350–700 words. In on-demand generation, offer THREE prompt
  options and the candidate chooses one; in the exam set each essay task has one prompt and one model
  answer.
- An argumentative/analytical essay on a geopolitical, security, economic, or societal issue (see
  topic-domains.md). Requires a thesis, reasoned argument, concession, and a conclusion.
- Level 3: essay-length argumentation, analysis and hypothesis on complex topics, abstract concepts
  conveyed clearly; the organisation may feel non-native but the meaning is never in doubt.
- Level 4: persuades and elaborates on abstract concepts in stylistically appropriate prose; firm
  grasp of levels of style, with deliberate shifts of register; anticipates and answers objections.
- Assesses: sustained argument, cohesion, range and accuracy of grammar and vocabulary, analytical
  register.

## Rubric dimensions (score each 0–4 against the STANAG level descriptors)
Use exactly these five labels, in this order (they are `RUBRIC_DIMENSIONS_ES` in
`api/seed-src/es/tools/checks.py`):

1. **Precisión gramatical** — range and control of structures under complexity: subjunctive in
   concessive, hypothetical and volitional clauses, *se* constructions, agreement, clitics.
2. **Rango léxico** — precise, varied vocabulary; idiomatic collocation; institutional terms; no
   calques.
3. **Coherencia y organización** — logical structure, paragraphing, cohesive devices and connectors.
4. **Cumplimiento de la tarea** — every part of the prompt addressed, appropriate length and purpose.
5. **Registro y tono** — appropriate to task and audience, consistent; *usted* and conventional
   formulae in correspondence.

In `writing-model-answers.md`, each task carries one bullet per label, in this order, before the
`**Model answer**` line:

```
- **Precisión gramatical:** <descriptor>
- **Rango léxico:** <descriptor>
- **Coherencia y organización:** <descriptor>
- **Cumplimiento de la tarea:** <descriptor>
- **Registro y tono:** <descriptor>
```

The label and its colon sit inside the bold, followed by one space and a one-line descriptor in
Spanish that is specific to the task and quotes the model answer where useful («…»). The check fails a
task with any other label, a different order, or an empty descriptor. The labels correspond to the
English model-answer file's *Accuracy*, *Range*, *Coherence & organisation*, *Task fulfilment* and
*Register & tone*, in the same order. (The English `writing-tasks-spec.md` lists its dimensions in
another order and under other names; the English data files and the check follow the order above.)

BILC's writing assessment criteria split proficiency into content, tasks, accuracy and text produced:
*Cumplimiento de la tarea* covers content and tasks, *Precisión gramatical* and *Rango léxico* cover
accuracy, *Coherencia y organización* covers the text produced, and *Registro y tono* covers the tone
the task calls for.

A model answer must itself be at the target band and demonstrate the rubric, not merely be "correct".

## The 16-task exam set
- Tasks 1–8 are Level 3 and tasks 9–16 Level 4. Each level has 4 `formal_correspondence` and 4
  `essay` tasks, in any order within the level.
- The band declared on each task must equal the table, and the model answer must fall inside it:

  | Level | Type | Band (words) | Aim for |
  |---|---|---|---|
  | 3 | `formal_correspondence` | 150–250 | 180–230 |
  | 3 | `essay` | 250–500 | 320–450 |
  | 4 | `formal_correspondence` | 250–400 | 290–370 |
  | 4 | `essay` | 350–700 | 450–620 |

  Words are whitespace-separated tokens of everything after `**Model answer**`, including the
  salutation, the closing and the signature block.
- The model-answers file lists the tasks in the same order as the exam, with identical
  `## Task N — Title` headings: the parser pairs them by position only.

## Format tokens that stay in English
The parser matches these literally, so they are not translated even though everything around them is
Spanish:
- `## Task N — Title` — the task heading, with an em dash; the title itself is Spanish, in sentence
  case: `## Task 3 — Servicio militar obligatorio y disponibilidad operativa`.
- `*Level N · formal_correspondence · min–max words*` or `*Level N · essay · min–max words*` — the line
  right under the heading, with `Level`, the English type token and the literal word `words` (not
  `palabras`): `*Level 3 · essay · 250–500 words*`.
- `**Model answer**` — the line that introduces the answer in the model-answers file.

Inside a model answer, never start a line with a bold label and colon in a list item (`- **…:** …`).
The parser's rubric pattern (`^- \*\*(.+?):\*\* (.*)$` in `scripts/build-seed-data.py`) scans the
whole task block, answer included, so a line such as `- **Asunto:** …` or a bulleted bold report
heading becomes an extra rubric dimension and fails the label check. Write *Asunto:* as a plain line,
and give a report its headings without a leading `- **`.

## Spanish conventions for correspondence
- *usted* throughout, never *tú* or *vosotros*; plural address is *ustedes*. Keep third-person verbs
  and the clitics consistent (*Le ruego que me remita…*).
- The salutation ends with a colon, not a comma, and the text starts on a new line with a capital:
  *Estimado señor García:*, *Señor Director:*, *Muy señor mío:*.
- Openings: *Me dirijo a usted para…*, *En relación con su escrito de…*, *Le escribo con el fin de…*.
- Requests: *Le ruego que* + present subjunctive; *Le agradecería que* + imperfect subjunctive (*Le
  agradecería que nos hiciera llegar su posición antes del 15 de mayo*); *Quedo a su disposición
  para…*.
- Closings, each with its own punctuation: an adverb takes a comma (*Atentamente,*, *Cordialmente,*);
  a full sentence ends with a full stop (*Reciba un cordial saludo.*); a phrase whose subject is the
  signatory takes none (*Le saluda atentamente*).
- Emails add an *Asunto:* line in Spanish.
- Spanish correspondence favours a direct, sober style: one opening and one closing formula, not *Por
  medio de la presente* plus *Sin otro particular* plus a double closing.
- Level 4 correspondence handles disagreement with diplomatic precision (*Sin perjuicio de la
  valoración que corresponda a su ministerio, me permito señalar que…*).

## Spanish conventions for essays
- Thesis in the first paragraph; one paragraph per main argument, each opened by a topic sentence.
- Concession and counter-argument: *Si bien…*, *Aun cuando* + subjunctive, *Por más que* +
  subjunctive, *Cabría objetar que…*, *No es menos cierto que…*.
- Hypothesis: *si* + imperfect subjunctive with a conditional; *de* + perfect infinitive (*de haberse
  previsto…*); *en caso de que* + subjunctive.
- A conclusion that synthesises rather than repeats: *En definitiva…*, *En suma…*.
- Level 4 model answers show deliberate control of tone — a measured ironic aside, a register shift
  for effect, a precise hedge — used once and to a purpose, never as decoration.
- Institutional terms, typography, Level 3–4 syntax and the calques to avoid: item-writing-rules.md
  (Spanish language).

## Fuentes
- NATO, *ATrainP-5 Language Proficiency Levels*, Edition A, Version 2 (May 2016) —
  https://nato-bilc.org/wp-content/uploads/2024/11/ATrainP-5-EDA-V2-E.pdf — writing descriptors for
  Levels 3 and 4 (essay-length argumentation and hypothesis; representing an official point of view;
  persuasion; levels of style; nuance).
- BILC, *STANAG 6001 Writing Assessment Criteria* —
  https://nato-bilc.org/wp-content/uploads/2024/11/STANAG-6001-Writing-Assessment-Criteria.pdf —
  content, tasks, accuracy and text produced, mapped onto the five rubric labels.
- BILC, *Best Practices in STANAG 6001 Testing* (August 2025) —
  https://nato-bilc.org/wp-content/uploads/2025/08/Best_practices_in_stanag_6001_testing_august_2025-upd.pdf.pdf
  — productive-skills prompts that are unambiguous about the task and the amount of language
  expected, with clear rubrics.
- Comisión Europea, Dirección General de Traducción, *Guía del Departamento de Lengua Española* (August
  2010) — https://commission.europa.eu/system/files/2016-11/styleguide_spanish_dgt_es.pdf — salutation
  and closing formulae and their punctuation, the colon and capital after the salutation, the
  preference for a direct and sober epistolary style.
- Castellano Actual (Universidad de Piura), «Saludos en cartas y correos electrónicos» (10 January
  2020) — https://www.udep.edu.pe/castellanoactual/saludos-en-cartas-y-correos-electronicos/ — colon
  after a salutation on its own line.
- Real Instituto Elcano, P. Oliver Llorente, «La soberanía tecnológica de la UE tiene una pregunta sin
  responder: ¿para qué la queremos?» (19 October 2026) —
  https://www.realinstitutoelcano.org/analisis/la-soberania-tecnologica-de-la-ue-tiene-una-pregunta-sin-responder-para-que-la-queremos/
  — register model for analytical argument (concession then pivot, concessive and hypothetical
  subjunctive); nothing taken from its content.
