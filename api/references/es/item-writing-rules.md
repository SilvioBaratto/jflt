# Item-writing rules (grounding, Spanish) — every reading and listening MCQ must satisfy these

These rules exist because the single biggest failure mode of generated items is an item with zero or
two defensible keys, or distractors a test-wise candidate eliminates without reading. An item that
breaks any rule below is invalid regardless of how good the passage is.

They govern the Spanish set (`api/seed-src/es/`). Passages, stems, options and rationales are written
in Spanish; this file is in English because it instructs the generator. Every number below is also a
constant in `api/seed-src/es/tools/checks.py`, which fails the batch when it is broken, so the two must
agree.

## The key
1. Exactly ONE option is defensibly correct given only the passage. No second option can be argued
   from the text.
2. The key is derivable from the passage alone — never from outside knowledge the candidate may or
   may not have.
3. The key is NOT a verbatim lift from the passage. It paraphrases, infers, or synthesises, so
   pattern-matching the wording does not reveal it. Check: at most 30% of the key's word 4-grams may
   occur in the passage (the English set peaks at 17%; aim well below 30%). Paraphrase by changing
   the frame, not by swapping one synonym: nominalise a verb, move the agent into a *se* construction,
   turn a condition into a concession.
   - Passage: *…el Gobierno ha optado por aplazar la compra de las fragatas hasta que se aclare el
     marco presupuestario.*
   - Lift (fails): *El Gobierno ha optado por aplazar la compra de las fragatas.*
   - Paraphrase: *La adquisición queda en suspenso mientras la financiación siga sin definirse.*

   The reverse pattern is also a tell: if keys paraphrase while distractors reuse the passage's words
   (or the other way round), a test-wise candidate learns to pick the odd one out. Mix both in the
   distractors.
4. The key is the longest option in AT MOST 35% of a level's items ("longest" = more characters than
   every other option; the check counts it per level). The English set breaks its own version of this
   rule — its key is the longest option in 57–60% of items — and the Spanish set must not repeat that.
   Draft the key, then make at least one distractor as long or longer in most items. Nor is the key
   systematically the most detailed, the most hedged, or the most "textbook-correct"-sounding. Keep
   all four options parallel in length, grammar, and specificity.
5. Vary the key position across items (do not cluster on A or C). Per level, no letter is the key in
   more than 40% of items, and in a full 30-item level each letter is the key 5–10 times. Target a
   roughly even A/B/C/D spread across a section.

## The distractors
6. Each distractor is wrong, but wrong for a reason a real candidate would fall for: a misread of a
   specific sentence, an over-generalisation, a reversed cause/effect or comparison, a true statement
   that does not answer the question, a view the passage attributes to someone else, or a plausible
   outside assumption the text does not support. At Level 3+ a good distractor is an idea that could
   appear in a similar text with a different stance or focus; it concerns a central point of the
   argument, never a single word.
7. No distractor is absurd, off-topic, or eliminable on grammar or length alone. All options match the
   passage's register (formal passage, formal options) and are sentence-length.
8. No "All of the above" / "None of the above" / "Both A and B" options, nor their Spanish forms
   (*Todas las anteriores*, *Ninguna de las anteriores*, *Ambas*, *A y B*, *Tanto A como C*). The
   check rejects any option that consists of such a phrase.
9. Avoid absolute-word tells (*siempre*, *nunca*, *jamás*, *solo*, *únicamente*, *todos*, *ninguno*,
   *en ningún caso*) that flag a distractor as false by reflex, unless the passage itself warrants the
   absolute. Likewise, do not let hedges (*en cierta medida*, *podría*) mark the key.

## The question
10. The stem tests comprehension at the target level (inference, stance, tone, function, main
    argument, vocabulary-in-context for Level 3; irony, implied judgement and rhetorical purpose for
    Level 4), not trivia or memory of an isolated number. It targets a central feature of the text,
    not a peripheral detail.
11. The stem is answerable from the passage without the options visible (it is not the options that
    make it answerable). When it asks for a judgement, it names whose judgement it is (*según el
    autor*, *en opinión de la autora*).
12. One clear task per item. No double-barrelled questions. Prefer positive stems; if a negative is
    unavoidable, write it in capitals (*NO*, *EXCEPTO*).

Spanish stems are full questions with both marks, `¿…?`: the parser reads the bold line that ends in
`?`, and the check fails a stem without `¿`. Model stems: *¿Qué sugiere el autor sobre…?*, *¿Qué
función cumple la mención de… en el argumento?*, *¿Cuál es la actitud de la autora ante…?*, *¿Qué se
desprende del texto acerca de…?*, *¿Qué significa «…» en este contexto?*

## Output contract
- Provide a rationale for EVERY option, in Spanish and on one line: why the key is correct, and the
  specific misread each distractor targets. Open it with a short tag (*Correcta:*, *Lectura errónea:*,
  *Atribución cambiada:*, *Generalización excesiva:*, *Relación invertida:*, *Cierta pero no
  responde:*, *Conocimiento externo:*) and anchor it in the passage, quoting with «…». The rationale
  is used by the blind-solver verifier and by the answer key.
- Topics must be authentic and analytical (see topic-domains.md). No childish or contrived scenarios
  at Level 3+.
- Text must be original. Do not reproduce real exam passages or copyrighted articles verbatim, and do
  not translate or adapt items from the English set. Outlets and think tanks are register models only.

## Listening scripts
Rules 1–12 apply unchanged to the three questions on each script, with "passage" read as "what is said
in the audio". The candidate hears the audio and never sees the transcript, so:

- **The key is derivable from the audio alone.** Write each question from what a listener hears, not
  from the transcript: no key that depends on spelling, punctuation, or a figure the listener would
  have to memorise.
- **Shape (checked).** 2–3 speakers, each with its own OpenAI TTS voice from `alloy`, `echo`, `fable`,
  `onyx`, `nova`, `shimmer` — no voice shared within an item, and the same voice in the `voices` map
  and on the speaker. 8–12 lines. 350–520 words in total (aim for 380–500). Every line at most 4,096
  characters. `stanag_level` 3 and `level` `"C1"`. 3 questions, each with options A–D, an `answer`, a
  `rationale`, and an `option_rationales` entry for every option.
- **Variety (checked).** No `conversation_type` used more than twice across the 12 items (compared
  case-insensitively; treat near-synonyms as one type). Spread the formats: *entrevista radiofónica*,
  *mesa redonda con moderador*, *debate televisivo*, *rueda de prensa*, *sesión informativa con turno
  de preguntas*, *entrevista en un pódcast*, *reportaje con dos invitados*. Across the 36 questions no
  key letter exceeds 40%; aim for 8–10 each.
- **Level 3 content.** Speakers hypothesise, support opinions, state and defend a policy, and raise
  objections. At least one speaker's stance is implied rather than announced, so one question can test
  the implicit. Each question targets a different stretch of the conversation, in order.
- **Memory is not the construct.** BILC recommends single-question Level 3 listening texts of up to 90
  seconds to avoid testing memory; JFLT keeps its English set's longer three-question format, so
  questions target points a listener retains — positions, reasons, disagreements — never incidental
  details.
- **Spoken register.** Sentences a person would say, not read aloud from a page: no long
  parentheticals or nested subordinate chains; speech markers (*mire*, *a ver*, *es decir*, *en
  cualquier caso*) in moderation; *usted* between host and guest in formal formats, used consistently.
- **Nothing depends on typography.** No quotation marks used for irony, no dashes, parentheses, lists
  or italics: tone is carried by the words. Normal Spanish punctuation and accents (¿ ¡ included) stay.
- **Acronyms as Spanish speakers say them.** Those read as words stay (*OTAN*, *ONU*); write the rest
  out (*Estados Unidos*, not *EE. UU.*; *la Unión Europea*; *el producto interior bruto*). Write
  percentages and decimals in words (*el dos por ciento*, *dos coma cinco*).
- **Voice fits the speaker.** Spanish marks a speaker's gender in self-reference (*estoy convencida*),
  so pick each voice to fit its speaker and confirm the fit when spot-listening. Speaker ids are short
  uppercase labels (*PRESENTADORA*, *ANALISTA*) declared in `speakers`.

## Spanish language (applies to every Spanish file)

### Variety and institutional terms
- Neutral standard Spanish with Spain-based institutional terms: *OTAN* (never *NATO*), *UE*, *ONU*,
  *Ministerio de Defensa*, *Fuerzas Armadas*, *Estado Mayor de la Defensa*, *Ejército de Tierra*,
  *Armada*, *Ejército del Aire y del Espacio*, *Secretaría General de Política de Defensa*, *Consejo de
  Ministros*, *Cortes Generales*. Spell out any other acronym at first mention (*Estado Mayor de la
  Defensa (EMAD)*).
- No regional slang or strongly local idiom at Level 3 (*vale*, *guay*, *currar*). At Level 4 an idiom
  may appear when the text itself makes its sense recoverable. Avoid *vosotros*; formal plural address
  is *ustedes*.

### Typography and encoding
- Opening marks always: *¿…?* and *¡…!*, including questions that start mid-sentence (*Si el gasto
  sube, ¿quién lo paga?*).
- Accents per current norms. This set writes *solo* and the demonstratives (*este*, *ese*, *aquel*)
  without an accent, consistently.
- Text is Unicode NFC (precomposed *á é í ó ú ñ ü*). The check rejects decomposed accents, which split
  words and break both the overlap check and TTS.
- Quotation marks: angular *« »* first, *“ ”* inside them, *‘ ’* for a word's meaning. No straight
  quotes (`"`) in Spanish text.
- No English-style dash where Spanish uses a colon or a comma (*…todos los sectores: la industria, la
  agricultura y los servicios*). No comma before the final *y* of a list.
- Numbers: decimal comma (*1,5*; *0,8*), a space between the figure and *%* (*el 18 %*), years without
  separators (*2026*), dates as *el 3 de marzo de 2026*.
- Spanish capitalises far less than English: months, days, nationalities and languages are lowercase
  (*marzo*, *lunes*, *español*), and titles and topics use sentence case (capital on the first word and
  proper names only).

### Syntax and lexis at Levels 3 and 4
Passages, options, model answers and scripts use the structures that make Spanish prose professional
rather than translated English:
- **Subjunctive** where Spanish requires it: concessive (*aunque el gasto aumente*, *por más que se
  insista*, *aun cuando*); hypothetical (*si la Alianza redujera su presencia, el flanco sur quedaría
  expuesto*; *de haberse previsto…*; *en caso de que…*); volitional and evaluative (*exige que*, *es
  preciso que*, *conviene que*, *no es que… sino que…*); purpose and future time (*para que*, *a fin
  de que*, *cuando se apruebe*); consequence with *de ahí que*.
- ***se* passive and impersonal** for an agentless institutional voice (*se aprobaron los
  presupuestos*, *se considera que*, *se debería destinar más financiación*). Keep *ser* + participle
  for when the agent matters (*fue aprobado por el Congreso*).
- **Nominalisation** that packages a process as an object of analysis (*el despliegue*, *la reducción
  de la dependencia*, *la falta de previsión*), without stacking chains of nouns.
- **Discourse connectors**, varied: *sin embargo*, *no obstante*, *ahora bien*, *aun así*, *pese a
  ello*; *por tanto*, *por consiguiente*, *de ahí que*; *asimismo*, *a su vez*; *es decir*, *dicho de
  otro modo*; *en este sentido*, *en lo que respecta a*; *en definitiva*, *en suma*.
- **Participial and gerund clauses**: absolute participle (*Aprobado el presupuesto, el debate se
  desplazó a…*), causal or simultaneous gerund (*Teniendo en cuenta los plazos, …*). Never the gerund
  of posteriority (*dimitió el martes, siendo sustituido el miércoles* → *y fue sustituido el
  miércoles*).
- **Hedging** that carries stance: *cabe pensar que*, *todo apunta a que*, *no parece descabellado*,
  *hasta cierto punto*, *en cierta medida*, conditional *podría*. A Level 3 stem can ask how firmly the
  author holds a claim.
- **Level 4** adds irony and antiphrasis (*la brillante decisión de recortar el mantenimiento*),
  stance implied by word choice (*la pretendida autonomía*, *el llamado consenso*), register shifts (a
  colloquial turn dropped into formal prose), litotes and understatement (*no es poca cosa*, *no del
  todo desacertado*), and fine contrast (*no es que…, sino que…*; *si acaso*; *a lo sumo*).

### Calques and false friends (avoid)
Checked against an opened source (see *Fuentes*): *aplicar* → *solicitar* (Castellano Actual), the
salutation colon, and the quotation-mark, dash, list-comma and number rules above (DGT guide). RAE and
FundéuRAE refused automated access from the authoring environment, so the other rows below and the
lowercase list under capitalisation follow standard prescriptive usage without a citation; the
Spanish language review gate should confirm them.

| Avoid | Write |
|---|---|
| *realizar una decisión*; *realizar* as an all-purpose verb | *tomar una decisión*; the specific verb (*analizar*, not *realizar un análisis*) |
| *aplicar a un puesto*, *aplicar a una beca* | *solicitar un puesto*, *optar a*, *presentarse a* |
| *actualmente* for "actually" | *en realidad*, *de hecho* (*actualmente* = "currently") |
| *eventualmente* for "eventually" | *finalmente*, *con el tiempo* (*eventualmente* = "possibly, occasionally") |
| *asumir* for "assume" | *suponer*, *dar por sentado* |
| *evidencias* for "evidence" in the sense of data or findings | *pruebas*, *indicios*, *datos* |
| *hacer sentido* | *tener sentido* |
| *tomar lugar* | *tener lugar*, *celebrarse* |
| *en orden a* + infinitive for "in order to" | *para*, *con el fin de* |
| Subject pronouns and possessives that mirror English (*ellos consideran que su posición…*) | drop them where the verb or article already says it (*consideran que la posición…*) |
| A comma after the salutation (*Estimado señor García,*) | a colon (*Estimado señor García:*) |

## Fuentes
- NATO, *ATrainP-5 Language Proficiency Levels*, Edition A, Version 2 (May 2016) —
  https://nato-bilc.org/wp-content/uploads/2024/11/ATrainP-5-EDA-V2-E.pdf — Level 3 listening
  descriptor behind the listening content rule.
- BILC, *Item Review Checklist* (Herzog and Seinhorst, 2014) —
  https://nato-bilc.org/wp-content/uploads/2024/11/Item-Review-Checklist.pdf — paraphrase-pattern tell
  (rule 3), no length or detail clue in the key (rule 4), plausible distractors tied to a specific
  misconception, positive stems and capitalised negatives, citing the authority for a judgement.
- BILC, *STANAG 6001 Levels 1–3 Summary Review: Receptive Skills Testing*, v6.0 (June 2013) —
  https://nato-bilc.org/wp-content/uploads/2024/11/STANAG_6001_Levels_1-3_Summary_Review_on_Receptive_Skills_Testing.pdf
  — Level 3 distractors as ideas from a similar text with a different stance, options in the text's
  register and sentence-length, items on the central discourse feature.
- BILC, *Best Practices in STANAG 6001 Testing* (August 2025) —
  https://nato-bilc.org/wp-content/uploads/2025/08/Best_practices_in_stanag_6001_testing_august_2025-upd.pdf.pdf
  — listening items written from the recording, not the transcript; avoid testing memory; Level 3
  listening texts of up to 90 seconds.
- BILC, *Overview of Listening Text Characteristics by Level* (Vasilj-Begovic and Herzog, 2013) —
  https://nato-bilc.org/wp-content/uploads/2024/11/Overview-of-Listening-Text-Characteristics-by-Level.pdf
  — Level 3 speaker's point of view evident, listening "between the lines".
- Comisión Europea, Dirección General de Traducción, *Guía del Departamento de Lengua Española* (August
  2010) — https://commission.europa.eu/system/files/2016-11/styleguide_spanish_dgt_es.pdf — angular
  quotation marks, dashes, no comma before the last list item, decimal comma and *%* spacing, colon
  after the salutation, English influence on capitalisation.
- Castellano Actual (Universidad de Piura), «Aplicativo o aplicación» (9 September 2019) —
  https://www.udep.edu.pe/castellanoactual/aplicativo-o-aplicacion/ — *solicitar* and *solicitud*
  rather than *aplicar* and *aplicación*.
- *Real Decreto 205/2024, por el que se desarrolla la estructura orgánica básica del Ministerio de
  Defensa* (BOE-A-2024-3791) — https://www.boe.es/buscar/act.php?id=BOE-A-2024-3791 — official names
  of the Ministry of Defence bodies and the Armed Forces.
- Real Instituto Elcano, P. Oliver Llorente, «La soberanía tecnológica de la UE tiene una pregunta sin
  responder: ¿para qué la queremos?» (19 October 2026) —
  https://www.realinstitutoelcano.org/analisis/la-soberania-tecnologica-de-la-ue-tiene-una-pregunta-sin-responder-para-que-la-queremos/
  — register model only: connectors, targeted hedging, impersonal *se*, concessive subjunctive.
