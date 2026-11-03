# Content Language Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user picks English or Spanish in the app and the question bank, sessions, audio, vocabulary API, progress and Claude-graded writing/generation all follow that language.

**Architecture:** A `language` column (`en`|`es`) on the content tables, `exam_sessions` and `topic_stats`; the seed build and seed loader become per-language; every read/session API takes `lang`/`language` (absent = `en`); Claude grounding and prompts take a language profile; the Angular app gets a persisted `LanguageService`, a selector in the shell, and passes the language on every call. Two disjoint slices (API under `api/` + `scripts/`; frontend under `frontend/`) are built in two worktrees and merged.

**Tech Stack:** NestJS 11 + Prisma + Zod v4 (Jest, ESM), Python 3 seed script (pytest), Angular 21 zoneless + Material 3 (Vitest), Postgres.

**Spec:** `docs/superpowers/specs/2026-11-03-language-switch-design.md` (requester-approved).

## Global Constraints

- Work only in the worktrees named below; **never** under `/home/silvio/Documents/projects/jflt` (a one-way mirror that deletes Linux-only work). Nothing is pushed; no git remote/config changes; commits are local.
- Do not touch `api/seed-src/es/**`, `api/references/es/**` (Spanish content), `docs/superpowers/*/2026-11-02-*`.
- Commit trailer, exactly: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Explicit-path `git add` only.
- Code comments explain WHY only, in English; Google-style docstrings (Python), TSDoc without `{type}` (TS) for exported API; no TODO/FIXME; no commented-out code.
- API: generated code (`api/generated/**`) is never hand-edited; run `npm run prisma:generate` after schema edits. Jest runs ESM (`npm test`). Lint: `npm run lint` (oxlint). Validation via Zod v4 (`StandardSchemaValidationPipe`); controllers read `lang` with `parseLanguage` (Task A1).
- Frontend: rules in `frontend/.claude/CLAUDE.md` bind all UI code — standalone without `standalone: true`, OnPush, `input()/output()`, `inject()`, signals/`computed`, native control flow, Material 3 tokens only (`--mat-sys-*`), lucide icons registered in `src/app/icons.ts`, 48 px targets, sentence-case labels, Vitest + Material harnesses, `npm install --legacy-peer-deps`.
- `language` values are lowercase `en`/`es`; absent means `en`; invalid, empty or uppercase → 400.

## Review Focus

Failure modes the spec implies but no obvious test covers; each is pinned by a test in the owning task:

1. A database that already holds English seed rows and starts with `SEED_IF_EMPTY=1` must still get Spanish seeded (A7).
2. `?lang=`, `?lang=ES`, `?lang=fr` must be 400, never silently English (A1, A3, A8).
3. A session never mixes languages, and `completeSession` updates `TopicStat` under the item's own language (A5).
4. Spanish and English audio both use `listening-NN.mp3`; the Spanish files must land in `static/listening/es/` and the seeded `audioPath` must point there (A7, B5).
5. Blocked/corrupt `localStorage`, and switching the language while a session is open, must not crash or change the open session (B1, B5).

## Worktrees and branches

- API slice: existing worktree `/home/silvio/work/jflt-lang`, branch `feat/language-switch` (carries the spec and this plan).
- Frontend slice: **create** `git -C /home/silvio/work/jflt-lang worktree add /home/silvio/work/jflt-lang-ui -b feat/language-switch-ui feat/language-switch`. File sets are disjoint (`frontend/` vs `api/`+`scripts/`), so the two slices run in parallel without conflicts; Task C1 merges the UI branch into `feat/language-switch`.

---

## Slice A — API, seed, Claude (worktree `/home/silvio/work/jflt-lang`)

### Task A1: Language constants and query parsing

**Files:**
- Create: `api/src/common/language.ts`, `api/src/common/language.spec.ts`

**Interfaces:**
- Produces: `LANGUAGES = ['en','es'] as const`; `type Language`; `DEFAULT_LANGUAGE: Language = 'en'`; `LanguageSchema` (Zod `z.enum(LANGUAGES)`); `parseLanguage(value: string | undefined): Language` — `undefined` → `'en'`; `'en'`/`'es'` → itself; anything else (including `''`, `'ES'`, `'fr'`) throws `BadRequestException("lang must be one of: en, es")`.

- [ ] **Step 1: Write the failing test** `language.spec.ts`: `parseLanguage(undefined) === 'en'`; `parseLanguage('es') === 'es'`; `expect(() => parseLanguage('')).toThrow(BadRequestException)`; same for `'ES'`, `'fr'`, `'en '`; `LanguageSchema.safeParse('es').success === true`, `safeParse('fr').success === false`.
- [ ] **Step 2:** `cd api && npm test -- language` → FAIL (module missing).
- [ ] **Step 3:** Implement `language.ts` as specified (TSDoc on each export; WHY comment: strict, no normalisation, so a typo can never silently serve English).
- [ ] **Step 4:** `npm test -- language` → PASS; `npm run lint` clean.
- [ ] **Step 5:** `git add api/src/common/language.ts api/src/common/language.spec.ts && git commit -m "Add content language constants and parser"` (+ trailer).

### Task A2: Schema and migration

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<timestamp>_add_content_language/migration.sql`

**Interfaces:**
- Produces: `language String @default("en") @db.VarChar(2)` on `ReadingItem`, `WritingTask`, `ListeningItem`, `VocabEntry`, `ExamSession`, `TopicStat`; `@@index([language, level])` on `ReadingItem` and `ListeningItem`, `@@index([language])` on `WritingTask`, `VocabEntry`, `ExamSession`; `TopicStat` unique `@@unique([language, skill, level, topic], name: "language_skill_level_topic")` replacing `skill_level_topic`. Prisma client getter name for the new unique: `language_skill_level_topic`.

- [ ] **Step 1:** Edit the schema as above. `npx prisma validate` → valid.
- [ ] **Step 2:** Generate the migration against a throwaway local Postgres (start the compose `db` service, or any local Postgres; point `DATABASE_URL`/`DIRECT_URL` at it): `npm run prisma:migrate:dev -- --name add_content_language`. If Docker/Postgres is unavailable, produce the SQL with `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (needs a shadow DB URL) and write the folder by hand.
- [ ] **Step 3: Verify on data:** before applying, load the English seed (`npm run seed`); after `migrate deploy` assert with `psql`: `SELECT count(*) FROM reading_items WHERE language = 'en'` equals the reading row count (60), same for the other tables; `SELECT count(*) FROM topic_stats` unchanged; the old unique index is gone and `language_skill_level_topic` exists. Record the output in the task report.
- [ ] **Step 4:** `npm run prisma:generate`. This breaks exactly one call: `skill_level_topic` in `ExamService.updateTopicStats`. Fix it minimally so every commit stays green: `where: { language_skill_level_topic: { language: 'en', skill: a.itemType, level: meta.level, topic: meta.topic } }` and `language: 'en'` in the `create` data (Task A5 replaces this placeholder with the item's own language). `npm run build`, `npm test`, `npm run lint` must pass at this commit.
- [ ] **Step 5:** Commit `api/prisma/schema.prisma` and the migration folder — "Add language column to content tables, sessions and topic stats".

### Task A3: Content, vocab and progress filtered by language

**Files:**
- Modify: `api/src/modules/content/content.service.ts`, `content.controller.ts`, `api/src/modules/vocab/vocab.service.ts`, `vocab.controller.ts`, `api/src/modules/progress/progress.service.ts`, `progress.controller.ts`
- Create: `content.service.spec.ts`, `vocab.service.spec.ts`, `progress.service.spec.ts` next to them

**Interfaces:**
- Consumes: `Language`, `parseLanguage` (A1); Prisma `language` fields (A2).
- Produces: `ContentService.reading|listening|writing(language: Language, limit?: number, offset?: number)` (selects include `language`); `VocabService.list(params: { language: Language; part?; section?; q?; limit?; offset? })`, `sections(language: Language)`, `flashcards(language: Language, limit = 20)`; `ProgressService.dashboard(language: Language)`; controllers take `@Query('lang') lang?: string` and call `parseLanguage(lang)`.

- [ ] **Step 1: Write failing tests** with a hand-built Prisma mock (`{ readingItem: { findMany: jest.fn(), count: jest.fn() }, ... }`): (a) `content.reading('es')` calls `readingItem.findMany` with `where: { language: 'es' }` and the same for listening/writing, and `count` with the same `where`; (b) `vocab.list({language:'es'})` puts `language: 'es'` in the `where` next to `part/section/q`; `sections('es')` filters; `flashcards('es')` returns only entries whose `language` is `es` (due `ReviewItem` ids → `vocabEntry.findMany({ where: { id: { in }, language } })`); (c) `progress.dashboard('es')`: `topicStat.findMany` where includes `language: 'es'`, `examSession.findMany` where includes `language: 'es'`, bank counts use `where: { language: 'es' }`, and `reviewDue` counts only due `ReviewItem`s whose item exists in that language's tables (mock `reading/listening/vocab findMany` returning ids for both languages; assert `es` count excludes the English ones).
- [ ] **Step 2:** `npm test -- content.service vocab.service progress.service` → FAIL.
- [ ] **Step 3:** Implement. For `reviewDue`: fetch due `ReviewItem` rows `{ itemType, itemId }`, resolve which ids exist in the language's reading/listening/vocab tables (`findMany({ where: { id: { in }, language }, select: { id: true } })`), count per `itemType`.
- [ ] **Step 4:** Tests PASS; lint clean.
- [ ] **Step 5:** Commit — "Filter content, vocab and progress by language".

### Task A4: Claude layer by language

**Files:**
- Modify: `api/src/claude/grounding.ts`, `claude-agent.service.ts`
- Create: `api/src/claude/language-profile.ts`, `grounding.spec.ts`, `claude-agent.service.spec.ts`

**Interfaces:**
- Produces: `LANGUAGE_PROFILE: Record<Language, { name: string; feedbackLanguage: string }>` (`en` → `'English'`, `es` → `'Spanish'` for both); `readingGrounding(language: Language = 'en')`, `writingGrounding(language: Language = 'en')` — `en` reads `references/<file>`, `es` reads `references/es/<file>`; memoisation key includes the language; `ClaudeAgentService` methods gain a trailing/param `language: Language = 'en'`: `generateReadingItem(level, topic, language?)`, `verifyReadingItem(item, samples = 3, language?)`, `generateListeningConversation(..., language?)`, `solveListeningKeys(..., language?)`, `generateWritingTask(..., language?)`, `gradeWriting({ ..., language? })`; prompts name the language ("Write ONE original reading item in Spanish…", "…examiner for the Spanish STANAG 6001 / JFLT writing test… write the feedback in Spanish") and embed the matching grounding.

- [ ] **Step 1: Write failing tests:** `grounding.spec.ts` (run with `process.cwd()` = `api/`): `readingGrounding('es')` contains the text of a marker line from `references/es/item-writing-rules.md` and `readingGrounding('en')` contains one from `references/item-writing-rules.md`, and they differ; `claude-agent.service.spec.ts`: `jest.spyOn(service as any, 'runStructured')` captures the prompt — `generateReadingItem(3, 'x', 'es')` prompt contains `Spanish` and the es grounding marker and no `English`; the default call still names English; `gradeWriting({..., language:'es'})` prompt asks for Spanish feedback.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Keep schemas and the CEFR/band tables unchanged.
- [ ] **Step 4:** Tests PASS; `npm run lint`; `npm run build`.
- [ ] **Step 5:** Commit — "Make Claude grounding and prompts language-aware".

### Task A5: Exam sessions by language

**Files:**
- Modify: `api/src/modules/exam/dto/exam.dto.ts`, `exam.controller.ts`, `exam.service.ts`
- Modify tests: `api/src/modules/exam/selection.spec.ts` untouched (pure functions unchanged); Create: `exam.service.spec.ts`

**Interfaces:**
- Consumes: `LanguageSchema`, `Language`, `parseLanguage` (A1); A2 schema; `ClaudeAgentService.gradeWriting({..., language})` (Task A4, which must be done first).
- Produces: `CreateSessionSchema` gains `language: LanguageSchema.default('en')`; `ExamService.createSession(dto)` stores `language` column and `config.language`; private `pickReading(language, levels, count, adaptive)`, `pickListening(language, count)`, `pickWriting(language, levels, count)` filter by `language` (adaptive weights read `topicStat` where `{ skill: 'reading', language }`); `listSessions(language: Language)`; `getSession` returns `language`; `updateTopicStats` selects `language` with the item and upserts on `language_skill_level_topic`; an assembled session with zero items across all skills throws `UnprocessableEntityException("no <language> items available for this request")`.

- [ ] **Step 1: Write failing tests** (`exam.service.spec.ts`, Prisma mock + stub `ClaudeAgentService`): creating with `language:'es'` queries `readingItem/listeningItem/writingTask` with `language:'es'` in `where` and stores `language: 'es'`; defaults to `'en'`; adaptive reading reads `topicStat` with `language`; `listSessions('es')` filters; empty banks → `UnprocessableEntityException`; `completeSession` on a session with a Spanish reading answer upserts `topicStat` with `where.language_skill_level_topic.language === 'es'` (derived from the item); writing answer calls `claude.gradeWriting` with `language: 'es'` (session language).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement per the Interfaces. WHY comment on the 422: an empty session is unusable and a language without seeded content must be visible to the caller.
- [ ] **Step 4:** `npm test` (whole API suite) PASS, `npm run lint`, `npm run build` PASS.
- [ ] **Step 5:** Commit — "Scope sessions, selection and topic stats to a language".

### Task A6: Generate endpoints by language

**Files:**
- Modify: `api/src/modules/generate/dto/generate.dto.ts`, `generate.controller.ts`, `generate.service.ts`
- Create: `generate.service.spec.ts`

**Interfaces:**
- Consumes: A1, A2, A4.
- Produces: `GenReadingSchema`, `GenWritingSchema`, `GenListeningSchema` gain `language: LanguageSchema.default('en')`; `GenerateService.reading(level, topic, language)`, `writing(taskType, language)`, `listening(topic, genre, speakers, language)` pass the language to Claude and store it in the created row.

- [ ] **Step 1: Failing tests** (Claude and Prisma stubbed): a `reading(3, 'topic', 'es')` call creates the row with `language: 'es'` and calls `claude.generateReadingItem(3, 'topic', 'es')`; the DTO schemas default to `'en'` and reject `'fr'`; the generated listening row keeps `language` and a TTS `audioPath` of the form `/static/listening/gen-<uuid>.mp3` (unchanged).
- [ ] **Step 2–4:** run FAIL → implement → `npm test`, lint, build PASS.
- [ ] **Step 5:** Commit — "Generate content in the requested language".

### Task A7: Seed build and loader per language

**Files:**
- Modify: `scripts/build-seed-data.py`, `api/prisma/seed.ts`, `api/prisma/seed-data.json` (regenerated), `.gitignore` only if needed
- Create: `scripts/test_build_seed_data.py`, `scripts/fixtures/english_seed_samples.json`, `api/src/common/seed-plan.ts`, `api/src/common/seed-plan.spec.ts`; Spanish MP3 copies under `api/static/listening/es/` (generated by the script)

**Interfaces:**
- Produces: CLI `python scripts/build-seed-data.py [--lang en|es|all] [--out PATH] [--no-audio]` (default `--lang all`); a per-language config table `{ en: {src: api/seed-src, ref: api/references, vocab: 'english-vocabulary-guide.md', audio_dest: api/static/listening, audio_url: '/static/listening/'}, es: {src: api/seed-src/es, ref: api/references/es, vocab: 'spanish-vocabulary-guide.md', audio_dest: api/static/listening/es, audio_url: '/static/listening/es/'} }`; `parse_reading|parse_writing|parse_listening|parse_vocab` take that config entry instead of module-level paths and every returned record carries `"language"`; `seed-data.json` keeps the top-level keys `readingItems, writingTasks, listeningItems, vocabEntries`. TS: `languagesToSeed(existingSeedRows: Record<Language, number>, present: Language[], ifEmpty: boolean): Language[]` — with `ifEmpty` true returns the present languages that have **zero** existing seed rows, otherwise all present languages. `seed.ts` calls it, then per returned language: `deleteMany({ where: { language, source: 'seed' } })` for reading/writing/listening and `vocabEntry.deleteMany({ where: { language } })`, then `createMany` of that language's records.

- [ ] **Step 1: Failing tests:** `test_build_seed_data.py` (pytest, `--out` to a tmp dir, `--no-audio`): `--lang all` yields reading 60/60, writing 16/16, listening 12/12, vocab 155/221 for en/es; every record has `language` equal to its group; English records equal the pre-change samples checked in at `scripts/fixtures/english_seed_samples.json` (before touching the script, copy the first and last record of each of the four English groups from the current `seed-data.json` into that fixture; the test compares them minus `language`); Spanish listening `audioPath` starts with `/static/listening/es/listening-` and English with `/static/listening/listening-`; `--lang es` yields only Spanish. `seed-plan.spec.ts`: ifEmpty with `{en: 60, es: 0}` and present `['en','es']` → `['es']`; `{en:0, es:0}` → both; ifEmpty false → both regardless of counts.
- [ ] **Step 2:** `python -m pytest scripts/test_build_seed_data.py` and `cd api && npm test -- seed-plan` → FAIL.
- [ ] **Step 3:** Implement the script refactor (keep `MIN_LEVEL` filtering and the English parse regexes untouched; `audio_dest` is created if missing; the MP3 copy stays a side effect unless `--no-audio`), `seed-plan.ts`, and `seed.ts`. Run `python scripts/build-seed-data.py` to regenerate `seed-data.json` and copy the Spanish MP3s.
- [ ] **Step 4:** Both test files PASS; `cd api && npm run seed` against a local Postgres loaded earlier with English only and `SEED_IF_EMPTY=1` seeds Spanish and leaves English untouched (record the `SELECT language, count(*)` output in the report); `npm test`, lint, build PASS.
- [ ] **Step 5:** Commit script, tests, seed files, regenerated `seed-data.json` and `api/static/listening/es/*.mp3` — "Build and load seed data per language".

### Task A8: Controllers' `lang` validation and e2e

**Files:**
- Modify: `api/test/app.e2e-spec.ts`
- Modify (if a controller was not yet wired): `content.controller.ts`, `vocab.controller.ts`, `progress.controller.ts`, `exam.controller.ts`

**Interfaces:**
- Consumes: all of A1–A6.

- [ ] **Step 1: Failing e2e tests** (existing Prisma-mock harness): `GET /api/v1/content/reading?lang=fr` → 400; `?lang=` (empty) → 400; `?lang=ES` → 400; `?lang=es` → 200 and the Prisma mock received `where.language === 'es'`; no `lang` → `'en'`; `GET /vocab?lang=xx` → 400; `GET /progress?lang=es` → 200; `GET /sessions?lang=zz` → 400; `POST /sessions` with `{ mode: 'practice', language: 'fr' }` → 400 and with `language: 'es'` and empty mocked banks → 422.
- [ ] **Step 2–4:** `npm run test:e2e` FAIL → wire anything missing → PASS; `npm test`, lint, build PASS.
- [ ] **Step 5:** Commit — "Cover language parameters in e2e".

---

## Slice B — Frontend (worktree `/home/silvio/work/jflt-lang-ui`, branch `feat/language-switch-ui`)

Run once: `cd frontend && npm install --legacy-peer-deps`. The frontend is built against the API contract of the spec (section 3); its tests use `HttpTestingController`, so it does not depend on Slice A at build time.

### Task B1: LanguageService

**Files:**
- Create: `frontend/src/app/services/language.ts`, `language.spec.ts`
- Modify: `frontend/src/app/app.config.ts` (inject at start-up beside `ThemeService`)

**Interfaces:**
- Produces: `type Language = 'en' | 'es'`; `LANGUAGE_OPTIONS: { value: Language; label: string; code: string }[]` (`en` "English", `es` "Español"); `@Injectable({providedIn:'root'}) class LanguageService { readonly language: Signal<Language>; setLanguage(language: Language): void }` — storage key `app-content-language`, read validated (anything else → `'en'`), read and write wrapped in try/catch, same pattern as `ThemeService`.

- [ ] **Step 1: Write failing tests:** default `'en'` with empty storage; stored `'es'` is read; stored `'fr'`/`''` falls back to `'en'`; `setLanguage('es')` updates the signal and `localStorage`; a throwing `localStorage` (spy `getItem`/`setItem` to throw) neither crashes the constructor nor `setLanguage` and the signal still updates.
- [ ] **Step 2:** `cd frontend && npm test` → FAIL.
- [ ] **Step 3:** Implement; register in `provideAppInitializer` (inject `LanguageService`).
- [ ] **Step 4:** Tests PASS; `npm run build`.
- [ ] **Step 5:** Commit — "Add persisted content language service".

### Task B2: Services and models carry the language

**Files:**
- Modify: `frontend/src/app/services/content.ts`, `exam.ts`, `progress.ts`, `models/exam.ts`, `models/content.ts`, `models/progress.ts`
- Create/Modify specs: `content.spec.ts`, `exam.spec.ts`, `progress.spec.ts`

**Interfaces:**
- Consumes: `LanguageService`, `Language` (B1).
- Produces: `ContentService.reading|listening|writing()` send `?lang=<current>` (language read from `LanguageService` at call time); `ProgressService.dashboard()` sends `?lang=`; `ExamService.list()` sends `?lang=`; `ExamService.create(body)` sends `{ ...body, language: body.language ?? current }`; model additions: `Session.language: Language`, `CreateSessionBody.language?: Language`, `ReadingSummary|ListeningSummary|WritingSummary.language: Language`.

- [ ] **Step 1: Failing tests** (`HttpTestingController`): with the service set to `'es'`, `content.reading()` issues `GET .../content/reading?lang=es`; with the default, `?lang=en`; `exam.create({mode:'practice'})` body includes `language: 'es'`; an explicit `language` in the body wins; `progress.dashboard()` and `exam.list()` carry `lang`.
- [ ] **Step 2–4:** FAIL → implement → `npm test` PASS, build PASS.
- [ ] **Step 5:** Commit — "Send the content language on every API call".

### Task B3: Language selector in the shell

**Files:**
- Create: `frontend/src/app/shared/language-selector/language-selector.ts`, `.html`, `.css`, `language-selector.spec.ts`
- Modify: `frontend/src/app/icons.ts` (register lucide `Languages`), `shared/sidebar/sidebar.html`/`.ts` (footer of the rail, collapsed and expanded), the mobile top bar (`app-navbar`, locate through `shared/layout/layout.html`) and their specs

**Interfaces:**
- Consumes: `LanguageService`, `LANGUAGE_OPTIONS` (B1).
- Produces: `<app-language-selector />` — standalone OnPush, Material icon button (lucide `Languages`, `aria-label` "Content language, current: English") opening a `mat-menu` with one radio-style `mat-menu-item` per option (`role="menuitemradio"`, `aria-checked`, `lang` attribute on each label), selecting calls `setLanguage`; keyboard operable; 48 px target; tokens only.

- [ ] **Step 1: Failing tests** (Material harnesses): renders with the current language in the accessible name; opening the menu lists English and Español with the current one checked; choosing Español calls `setLanguage('es')` and updates the label; the menu closes and focus returns to the trigger; appears in the sidebar footer (collapsed and expanded) and in the mobile top bar.
- [ ] **Step 2–4:** FAIL → implement → `npm test`, `npm run build` PASS; check the rail at ≥ 600 px and the top bar at < 600 px in the existing layout specs.
- [ ] **Step 5:** Commit — "Add content language selector to the shell".

### Task B4: Launch and Home follow the language

**Files:**
- Modify: `frontend/src/app/pages/launch/launch.ts`, `pages/home/home.ts`, `home.html`, specs `launch.spec.ts`, `home.spec.ts`

**Interfaces:**
- Consumes: B1, B2.
- Produces: `LaunchComponent` posts `{ mode, skill, adaptive: true, language: <current> }`; `HomeComponent` reloads its three lists when `LanguageService.language()` changes (an `effect` that triggers `loadReading/loadListening/loadWriting`, resetting each state to `'loading'`), and shows the empty-state text "No items in this language yet" when a list returns zero items.

- [ ] **Step 1: Failing tests:** launch posts the current language (default and after `setLanguage('es')`); home loads once with `lang=en`, then after `setLanguage('es')` issues three new requests with `lang=es` and renders the new items; an empty list shows the empty state; a failed reload shows the existing error state.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit — "Reload the question bank and start sessions in the chosen language".

### Task B5: Session screen — language attribute, no topic

**Files:**
- Modify: `frontend/src/app/pages/session/session.html`, `session.ts` (if a helper is needed), `session.spec.ts`

**Interfaces:**
- Consumes: `Session.language` (B2).
- Produces: reading header `L{level}` (no topic), listening header `{conversationType}` (no topic), writing title unchanged; passage, question and option containers carry `[attr.lang]="session()?.language"` (the exact signal name is whatever `session.ts` uses); audio source remains `audioBase + item.audioPath` (the Spanish `audioPath` already contains `/es/`).

- [ ] **Step 1: Failing tests:** with a Spanish reading item (topic "Algo") the rendered header is `L3` and does not contain the topic; listening header is the conversation type only; the passage/options elements have `lang="es"` for a Spanish session and `lang="en"` for English; the `<audio>` `src` for an item with `audioPath: '/static/listening/es/listening-01.mp3'` is `<audioBase>/static/listening/es/listening-01.mp3`; changing `LanguageService` while the session is displayed changes neither items nor `lang`.
- [ ] **Step 2–4:** FAIL → implement → `npm test`, `npm run build` PASS.
- [ ] **Step 5:** Commit — "Hide topic in sessions and mark the content language".

---

## Integration

### Task C1: Merge, document, verify

**Files:**
- Modify: `CLAUDE.md` (root of the repo: seed section and API/frontend notes mention `language`, `--lang`, `lang` parameter, `static/listening/es/`), `api/.claude/CLAUDE.md` only if it describes the changed pipelines

- [ ] **Step 1:** In `/home/silvio/work/jflt-lang`: `git merge --no-ff feat/language-switch-ui -m "Merge frontend language switch"` (disjoint files; no conflicts expected — resolve any with both sides kept).
- [ ] **Step 2:** Update the docs named above.
- [ ] **Step 3: Full verification** (record outputs): API `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`; frontend `npm test`, `npm run build`; `python -m pytest scripts/test_build_seed_data.py`; Spanish tooling untouched: `python api/seed-src/es/tools/run_checks.py all --final` still clean; `git diff --stat feat/spanish-content..HEAD` touches no file under `api/seed-src/es` or `api/references/es`.
- [ ] **Step 4: Manual smoke** (documented, run if Docker is available): `docker compose up -d --build`, seed, open the app, switch to Español, start a reading practice and a listening session, play the audio, finish a session, reload and confirm the choice persisted; note that live Claude calls need the `claude` CLI logged in (`claude auth login`) wherever the API runs.
- [ ] **Step 5:** Commit the docs — "Document the content language switch". Then a whole-branch review (read-only, most capable model) before finishing the branch.
