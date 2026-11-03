# Content language switch (English / Spanish) — design

Status: draft for requester review, 2026-11-03. Branch `feat/language-switch`, worktree `/home/silvio/work/jflt-lang`, stacked on `feat/spanish-content` (the Spanish content files are a prerequisite; merge that branch first).

## Goal

The user picks the exam **content language** — English or Spanish — in the app, and everything content-related follows it: the question bank, practice and exam sessions, listening audio, vocabulary served by the API, progress and adaptive selection, and the Claude-graded writing and on-demand generation. Today the app is English-only: the Spanish STANAG material (reading 60, writing 16, listening 12 + MP3, vocabulary guide 221 rows) exists as content files but nothing in the app reads it.

## Requester's decisions (2026-11-03)

- Scope: **content language end-to-end** (not frontend-only, not translated app labels).
- Approach: a `language` column on the content tables (not separate tables or databases).
- The session screen **no longer shows the topic** above a passage or listening item (the English topics state the answer); the question-bank list on Home keeps showing topics.
- The work is its own project, on its own branch, built in parallel with the end of the content work.

## Non-goals

- Translating the app's own labels, menus, instructions (the interface stays as it is today; `<html lang="en">` stays).
- A vocabulary page in the frontend (none exists today; the API will serve both vocabularies, nothing displays them yet).
- Per-user profiles or authentication (the API is single-tenant today; progress is one shared record per language).
- New content, new scoring rules, Italian or other languages, deleting English.
- Merging, pushing or deploying (the requester decides).

## Architecture

### 1. Data model (`api/prisma/schema.prisma`, one migration)

| Model | Change |
|---|---|
| `ReadingItem`, `WritingTask`, `ListeningItem`, `VocabEntry` | `language String @default("en") @db.VarChar(2)`; `@@index([language, level])` (reading, listening), `@@index([language])` (writing, vocab) |
| `ExamSession` | `language String @default("en") @db.VarChar(2)`; `@@index([language])` |
| `TopicStat` | `language String @default("en") @db.VarChar(2)`; unique key `skill_level_topic` becomes `language_skill_level_topic` on `[language, skill, level, topic]` |
| `ReviewItem` | unchanged (`itemId` identifies the item, its language follows from the item) |

All existing rows get `en`. Allowed values are a single shared constant (`['en','es']`) validated by Zod; anything else is a 400. Generated items (`source = 'generated'`) take the language of the request that produced them.

### 2. Seed build (`scripts/build-seed-data.py`, `api/prisma/seed.ts`)

- `build-seed-data.py --lang en|es|all` (default `all`). A small table maps each language to its source dir (`api/seed-src` / `api/seed-src/es`), reference dir (`api/references` / `api/references/es`), vocabulary file (`english-vocabulary-guide.md` / `spanish-vocabulary-guide.md`), audio destination and audio URL prefix. The `parse_*` functions take that table's entries as parameters instead of module-level paths; the English output stays byte-compatible apart from the new `language` field.
- Spanish MP3s are copied to `api/static/listening/es/` and get `audioPath = /static/listening/es/listening-NN.mp3` (both languages use `listening-NN.mp3` names; English paths do not change).
- One `seed-data.json` carries both languages; every record has `language`.
- `seed.ts`: for each language present in the data, delete that language's `source = 'seed'` rows (vocabulary: that language's rows), then `createMany`. The `SEED_IF_EMPTY=1` shortcut becomes **per language** — a database that already holds English is still seeded with Spanish on the next start.
- Acceptance numbers: English 60 / 16 / 12 / 155 (reading / writing / listening / vocab), Spanish 60 / 16 / 12 / 221.
- The Spanish MP3s (~30 MB) are tracked in git like the English ones; if repository size becomes a problem, that is a later decision.

### 3. API contract (all backward compatible: absent parameter = `en`)

| Route | Change |
|---|---|
| `GET /content/reading`, `/listening`, `/writing` | `?lang=en\|es` (plus existing `limit`, `offset`); responses include `language` per item |
| `GET /vocab`, `/vocab/sections`, `/vocab/flashcards` | `?lang=` filters entries |
| `POST /vocab/review` | none (vocab id identifies the entry) |
| `POST /sessions` | body `language` (default `en`); stored on `ExamSession.language`; item selection (`pickReading`, `pickListening`, `pickWritingTasks`) filters by it; adaptive weights read `TopicStat` of that language only; `TopicStat` upserts use the new key |
| `GET /sessions` | `?lang=` filters the list; `GET /sessions/:id` returns `language` |
| `GET /progress` | `?lang=`: bank counts, weak areas, recent sessions and due-review counts for that language only (due reviews are counted through the item tables' `language`) |
| `POST /generate/reading\|writing\|listening` | body `language` (default `en`); the generated row is stored with it |

Invalid `lang`/`language` → 400 from the existing Zod validation pipe. Submitting an answer needs no language (the item is already in the session's stored list).

### 4. Claude layer (`api/src/claude`)

- `grounding.ts`: the grounding documents are selected by language — English from `api/references/`, Spanish from `api/references/es/` (the four documents already exist there).
- `claude-agent.service.ts`: a small language profile (`en` → "English", `es` → "Spanish") is threaded into the generation, verification, listening-key and writing-grading prompts so they name the language of the item, test the right language's register, and (for grading) write the feedback in the exam language. CEFR/STANAG mapping is unchanged.
- TTS: unchanged (`tts-1` handles Spanish); generated Spanish listening items keep the voice rules of the Spanish rules document (voice gender matches self-reference).
- The Foundry authentication gotcha in `CLAUDE.md` is unchanged.

### 5. Frontend (`frontend/src/app`)

- `services/language.ts` — `LanguageService`, same pattern as `ThemeService`: private writable signal, public readonly `language`, `setLanguage()`, storage key `app-content-language` with validated read and try/catch persist, default `en`, injected at start-up in `app.config.ts`. Exposes the option list (`en` "English", `es` "Español").
- `shared/language-selector/` — a standalone OnPush component (Material icon button + menu, lucide `languages` icon registered in `icons.ts`), used in the desktop rail footer and in the mobile top bar; 48 px targets, `aria-label`, keyboard operable, `lang` attribute on each option label, announces the change politely.
- Services pass the language: `ContentService` (`lang` param), `ProgressService.dashboard` (`lang`), `ExamService.create` (body `language`), `ExamService.list` (`lang`); `LaunchComponent` posts the current language.
- Home reloads its three lists when the language changes (effect on `LanguageService.language`), shows an empty state when a language has no items.
- Session: the language belongs to the session (`session.language`); changing the preference while a session is open does not affect it. Passage, questions and options are rendered with `[attr.lang]="session.language"` so screen readers use the right voice. `L{level} · {topic}` becomes `L{level}`; `{conversationType} · {topic}` becomes `{conversationType}` (topic hidden; writing task titles stay).
- Models gain `language`; `CreateSessionBody` gains `language`.
- Rules: `frontend/.claude/CLAUDE.md` binds (Material 3 tokens only, OnPush, signals, `inject()`, native control flow, a11y list, Vitest + Material harnesses).

## Error handling and edge cases

- Unknown language in storage → default `en`. Storage unavailable → in-memory default (no crash).
- A language with no seeded items → API returns an empty list; Home shows an empty state; `POST /sessions` whose assembled session would hold zero items returns 422 with a clear message (new behaviour for every language: today an empty session is created).
- `lang`/`language` is lowercase only: `?lang=` (empty), `ES`, `fr` → 400. An absent parameter means `en`.
- Old sessions (created before the migration) are `en`.
- Mixed-language items never appear in one session (selection filters before sampling).
- Switching language mid-session never changes that session's items or its audio base.

## Testing

- API unit: `selection.spec.ts` — selection by language, adaptive weights per language; a new `language` helper spec (validation, default); `content`/`vocab`/`progress` services with a mocked Prisma asserting the `where.language` clauses; Claude grounding/profile selection (pure functions).
- API e2e (`test/app.e2e-spec.ts`): `GET /content/reading?lang=xx` → 400; `POST /sessions` with bad `language` → 400; valid values pass validation.
- Seed: a Python test (or script check in CI) running `build-seed-data.py --lang all` to a temp output and asserting the counts above and that every record carries `language`; a `seed.ts` unit check of the per-language emptiness rule if it can be isolated.
- Frontend (Vitest): `LanguageService` (default, persistence, invalid storage, throwing storage), selector component (menu, selection, aria, harness), services send `lang`/`language`, Home reload on change, session hides topic and sets `lang`.
- Existing suites stay green: API `npm test`, `npm run lint`, `npm run build`, e2e; frontend `npm test`, `npm run build` (CI runs these).
- Manual smoke (documented, not automated): `docker compose up -d --build`, switch to Español, start a reading practice and a listening session, play the audio, finish a session, check the dashboard counts per language. Live Claude calls need `az login` on the host (Foundry gotcha).

## Delivery and sequencing

1. Branch `feat/language-switch` from `feat/spanish-content` (done). Merge order: content branch first, then this one.
2. Two parallel slices after the plan is approved: **API + seed** (schema/migration, seed build, endpoints, Claude layer) and **frontend** (service, selector, wiring, topic hiding) — the frontend is built against the contract in section 3 and runs against the English-only API until the API slice lands.
3. Commits are local; nothing is pushed or merged without the requester's say-so.

## Risks and assumptions

- Prisma migration changes a unique index on `topic_stats`; existing rows are `en`, so the new key is satisfiable. Verified on a copy of the schema in the plan's first task, before touching the app code.
- Generated Spanish items rely on the Spanish grounding documents, which have been reviewed as documents but whose generation quality has not been measured; this is not covered by the content gates.
- Feedback language for the writing grader is assumed to be the exam language (as the English grader writes English); changing it is a one-line profile change.
- `tts-1` voice quality for Spanish is the requester's pending listening check of the content branch.
- Vocabulary is language-filtered in the API but invisible in the UI (no page exists).

## Acceptance criteria

1. With the migration applied and `npm run seed` run, the database holds English 60/16/12/155 and Spanish 60/16/12/221 rows with the right `language`.
2. `GET /api/v1/content/reading?lang=es` returns only Spanish items; no parameter returns English as before.
3. In the app, choosing Español persists across reloads, Home lists Spanish items, a practice session contains only Spanish items, its audio plays from `/static/listening/es/`, answers are scored, and the dashboard counts are per language.
4. The session screen shows no topic for reading and listening items, for both languages.
5. Existing API and frontend test suites, lint and builds pass; the new tests above pass.
6. No change outside this project's files; the content files and tools of `feat/spanish-content` are untouched.
