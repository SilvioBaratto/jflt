# STANAG 6001 Reading — level descriptors (grounding, Spanish)

The Spanish JFLT reading paper mirrors the English seed set: 60 items, **Level 3 = items 1–30 and
Level 4 = items 31–60**. Each item is a short self-contained Spanish text followed by one four-option
multiple-choice question. Generate items that match the target level's descriptor below. Level 3 is
the benchmark most candidates aim for ("SLP 3"; reading is the third digit of a Standardized Language
Profile, so SLP 3332 means reading at Level 3). The app labels Level 3 as C1; none of the BILC
documents consulted states an official STANAG–CEFR equivalence, so treat that label as informal.

The descriptors are language-neutral: NATO's ATrainP-5 (Edition A, Version 2, May 2016), whose use
STANAG 6001 records, defines them for any language. What changes in Spanish is which textual features
realise each level; they are named below and detailed in item-writing-rules.md (Spanish language).

Every descriptor has three facets (the content / task / accuracy breakdown BILC also uses in its
assessment criteria):
- **Content** — the domains and text types the reader can handle.
- **Task** — what the reader can do (locate facts, infer, follow argument, detect stance/tone).
- **Accuracy** — how fully and reliably meaning is extracted.

## Level 1 — Survival
Not in the Spanish seed set (Levels 3 and 4 only); kept so the two grounding sets stay comparable and
for on-demand generation.
- Content: short, simple, predictable texts — signs, notices, labels, menus, timetables, very short
  personal messages (*avisos*, *carteles*, *horarios*). High-frequency vocabulary, present tense,
  concrete topics.
- Task: locate explicitly stated facts; match a word or phrase; understand a single simple instruction.
- Accuracy: understands the main concrete point when context is highly supportive.
- Question type: literal retrieval. Answer is stated almost verbatim.

## Level 2 — Functional
Not in the Spanish seed set; kept for comparability and on-demand generation.
- Content: straightforward factual texts on familiar topics — routine correspondence, short news
  items, simple reports, instructions, descriptions. Mostly concrete, some simple connected prose.
- Task: understand main ideas and important supporting detail; follow a simple sequence of events or
  steps; grasp the writer's evident purpose.
- Accuracy: gets the gist and key facts; may miss nuance and lower-frequency vocabulary. ATrainP-5:
  cannot draw inferences directly from the text or understand the subtleties around factual material.
- Question type: main idea, specific detail, simple purpose. Answer requires reading a sentence or
  two, not just scanning a single word.

## Level 3 — Professional (C1 target)
- Content: long, dense, authentic-style, analytical prose on abstract and professional topics —
  geopolitics, security and defence policy, international affairs, economics, science and technology,
  society — including subjects unfamiliar to the reader. Editorials, opinion and analysis in major
  periodicals for educated native readers, think-tank analysis, official correspondence and reports.
  The author's purpose is to *evaluate*: present and support arguments or hypotheses with factual and
  abstract reasoning, with the author's voice evident. In Spanish this means multi-clause sentences,
  subjunctive in concessive and hypothetical clauses, *se* constructions, nominalisation, varied
  connectors and hedging. Keep out heavy regionalisms, low-frequency idioms (*refranes*) and dense
  cultural allusion: ATrainP-5 names exactly these as what a Level 3 reader may not fully grasp, so
  they push a text to Level 4.
- Task: follow a sustained line of argument; infer meaning that is implied but not stated ("read
  between the lines"); identify the author's stance, attitude, and tone; distinguish fact from opinion
  and different stylistic levels; understand hypothesising, supporting opinion, argumentation,
  clarification and elaboration; understand the function of a sentence within the argument (e.g.
  concession, example, qualification); resolve reference and cohesion across the text — in Spanish
  this includes null subjects and clitics (*lo*, *le*, *se lo*: who does what to whom); infer the
  meaning of unfamiliar words from context; recognise deliberate ambiguity.
- Accuracy: reads a variety of texts with almost complete comprehension; misreading is rare; may miss
  some nuance in sophisticated texts and in texts with unusually complex structure, low-frequency
  idioms or heavy cultural load; may read somewhat more slowly than a native reader.
- Question type: inference, author's opinion/attitude, tone, main argument, function of a sentence or
  paragraph, vocabulary-in-context, implication — aimed at the central argument, not a peripheral
  detail. The key must NOT be a verbatim lift from the text; it requires the reader to synthesise or
  infer. Distractors must be plausible to a weak reader and anchored in the text (a misread, an
  over-generalisation, a true-but-irrelevant statement, a reversed relation, a view the text
  attributes to someone else). A Level 2 reader, who by definition cannot infer from the text, should
  be drawn to the distractors that restate concrete content.

## Level 4 — Expert
- Content: highly abstract, sophisticated, and stylistically varied texts in all styles used for
  professional purposes — commentary and essays for the well-educated reader, professional literature,
  subtle argument with unpredictable turns of thought, implicit cultural reference. The author's
  purpose is to *project*: discourse tailored to its audience, with low-frequency vocabulary, cultural
  and historical concepts, and shared values taken for granted. In Spanish: irony and antiphrasis,
  stance implied by word choice (*la pretendida*, *el llamado*), register shifts, litotes and
  understatement, rhetorical questions, allusion, fine contrast (*no es que… sino que…*).
- Task: grasp fine nuance, implication, irony, register shifts, and rhetorical strategy; appreciate
  stylistic effect; follow abstract reasoning in any field; read "beyond the lines": judge the
  author's intent, credibility and unstated assumptions, and what a reference or a word choice does in
  the argument. BILC's Level 4 example task, analysing the real communicative intent of diplomatic
  pronouncements, is the model. BILC names reading beyond the lines as the skill that separates
  Level 4 from Level 3.
- Accuracy: near-complete comprehension including subtlety and connotation; understands almost all
  cultural references; firm grasp of stylistic nuance, irony and humour; reads at about native speed.
- Question type: nuance, irony, implied authorial judgement, rhetorical purpose, function of an
  allusion, subtle contrast. Both the key and the distractors are defensible on a shallow reading; only
  full comprehension separates them. An allusion may colour the text, but the answer must still follow
  from the passage (item-writing rule 2): ask what the reference does in the argument, not where it
  comes from.
- Format: BILC's own Level 4 reading test uses two texts of roughly 1,200–1,500 words with
  constructed responses. JFLT approximates Level 4 with 220–400-word passages and multiple choice, so
  each passage must concentrate Level 4 features — at least one of irony, implied stance, a register
  shift, an unstated assumption, or a reference whose function must be inferred — and the question
  must target it. A passage that is merely longer or more technical than a Level 3 one is a Level 3
  item.

## Passage length guidance (approximate)
- Level 1: 15–40 words.
- Level 2: 60–120 words.
- Level 3: 180–320 words.
- Level 4: 220–400 words.

Levels 1 and 2 are approximate. The Level 3 and Level 4 bands are hard limits for the Spanish set: `checks.py` (`READING_BANDS`) counts
whitespace-separated words in everything between the item heading and the question line, and fails a
passage outside its band. Aim for the middle (Level 3 about 220–290, Level 4 about 270–360) so a later
edit does not push a passage out. Spanish usually needs more words than English for the same content
(a translators' rule of thumb, not verified here), so keep the syntax at level and cut content rather
than compressing sentences. For comparison, BILC best practice suggests average multiple-choice
reading texts of about 50, 150 and 300 words at Levels 1, 2 and 3; the JFLT bands are kept for parity
with the English set.

## Fuentes
- NATO, *ATrainP-5 Language Proficiency Levels*, Edition A, Version 2 (May 2016) —
  https://nato-bilc.org/wp-content/uploads/2024/11/ATrainP-5-EDA-V2-E.pdf — reading descriptors for
  Levels 2–4, the SLP digit order.
- BILC, *STANAG 6001* page — https://nato-bilc.org/stanag-6001/ — STANAG 6001 Edition 5 and the
  ATrainP-5 link.
- BILC, *NATO STANAG 6001, Ed. 5: Overview of Language Proficiency Levels* (February 2019) —
  https://nato-bilc.org/wp-content/uploads/2024/11/STANAG-6001-Overview-Feb-2019.pdf — example tasks:
  recognising deliberate ambiguity (Level 3), analysing the intent of diplomatic pronouncements
  (Level 4).
- BILC, *Overview of Reading Text Characteristics by Level* (R. T. Clifford, 2012) —
  https://nato-bilc.org/wp-content/uploads/2024/11/Overview-of-Reading-Text-Characteristics-by-Level.pdf
  — author purpose (evaluate, project), typical text type, reader purpose per level.
- BILC, *STANAG 6001 Writing Assessment Criteria* —
  https://nato-bilc.org/wp-content/uploads/2024/11/STANAG-6001-Writing-Assessment-Criteria.pdf —
  the content / tasks / accuracy breakdown.
- BILC, *STANAG 6001 Levels 1–3 Summary Review: Receptive Skills Testing*, v6.0 (June 2013) —
  https://nato-bilc.org/wp-content/uploads/2024/11/STANAG_6001_Levels_1-3_Summary_Review_on_Receptive_Skills_Testing.pdf
  — Level 3 question foci (inference, supported opinion, tone, synthesis, hypothesis) and items on the
  central discourse feature.
- BILC, *Best Practices in STANAG 6001 Testing* (August 2025) —
  https://nato-bilc.org/wp-content/uploads/2025/08/Best_practices_in_stanag_6001_testing_august_2025-upd.pdf.pdf
  — suggested reading-text lengths per level.
- BILC Working Group on Level 4 Proficiency, *STANAG 6001 Level 4 Reading Proficiency Test:
  Familiarization Guide* (June 2018) —
  https://nato-bilc.org/wp-content/uploads/2024/11/L4-Familiarization_Guide_June-2018.pdf — Level 4
  texts, "between" and "beyond the lines", test format.
- BILC Working Group on Level 4 Proficiency, *STANAG 6001 Level 4 Tutorial: Testing the Receptive
  Skills* (April 2017) —
  https://nato-bilc.org/wp-content/uploads/2024/11/STANAG-6001-L4-Tutorial-Testing-Receptive-Skills1.pdf
  — beyond the lines as the Level 4 discriminator; Level 4 tasks (tone, irony, persuasive devices,
  word choice, cultural references).
