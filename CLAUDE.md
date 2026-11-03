# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**JFLT** — a STANAG language-proficiency exam-prep app. Candidates practise and sit mock exams across
four skills (reading MCQ, listening comprehension, writing tasks, vocabulary) scored on the STANAG
1–4 / SLP scale. Items come from a seeded content bank and are also generated and graded on demand by
Claude.

Monorepo with three parts: a **NestJS** API (`api/`), an **Angular 21** frontend (`frontend/`), and the
**Docker Compose** topology that wires them to Postgres, Redis, and Adminer. The `pyproject.toml` /
`MANIFEST.in` at the root are vestigial scaffolding metadata — the running app is the NestJS + Angular
stack, not a Python package.

## Run the stack

```bash
docker compose up -d --build     # full stack; frontend :4200, API :8000/docs, Adminer :8080
docker compose down
```

Host ports are configurable via `*_HOST_PORT` vars in `.env`.

### Local dev (outside Docker)

```bash
# API
cd api && npm install && npm run start:dev        # :8000, hot reload
# Frontend
cd frontend && npm install --legacy-peer-deps && npm start   # ng serve on :4200
```

`--legacy-peer-deps` is required for the frontend and is what the Dockerfile and CI use — install
without it and npm aborts on an `ERESOLVE` peer conflict.

## Commands

| Task | API (`cd api`) | Frontend (`cd frontend`) |
|------|----------------|--------------------------|
| Test (all) | `npm test` (Jest under `--experimental-vm-modules`, since NestJS 12 ships ESM) | `npm test` / `ng test` (Vitest) |
| Single test | `npm test -- health.controller` (path/name regex); add `-t "case name"` | `ng test` (Vitest filters) |
| Lint | `npm run lint` (oxlint, type-aware) | — (no lint script; Prettier config only) |
| Build | `npm run build` | `npm run build` |
| E2E | `npm run test:e2e` | — |

CI (`.github/workflows/ci.yml`) runs the API's lint, unit, e2e and build, the frontend's test and
build, and the pytest suite for `scripts/build-seed-data.py`, on every push and pull request to `main`.

API Jest needs **Node 24** (what CI and the Dockerfile use; from Node 24.9 Jest can `require` ESM natively). On
Node 22 the specs that import `@nestjs/common` fail with "Must use import to load ES Module".

### Database & seed (API)

```bash
npm run prisma:migrate:dev        # create + apply a migration in dev
npm run prisma:migrate:deploy     # apply migrations (prod)
npm run prisma:generate           # regenerate the Prisma client (also runs on postinstall)
npm run seed                      # load seed data (tsx prisma/seed.ts)
npm run prisma:studio
```

Seed data (`api/prisma/seed-data.json`) is **built from in-repo generated content** by
`scripts/build-seed-data.py [--lang en|es|all] [--out PATH] [--no-audio]`. Each content language has an
entry in the script's `LANGUAGES` table (source folder, reference folder, vocabulary guide, audio folder
and URL prefix), and every record it emits carries its `language`:

| | English (`en`) | Spanish (`es`) |
|---|---|---|
| Exam markdown + listening JSON | `api/seed-src/` (`reading/`, `writing/`, `listening/`) | `api/seed-src/es/` |
| Vocabulary guide | `api/references/english-vocabulary-guide.md` | `api/references/es/spanish-vocabulary-guide.md` |
| Listening MP3s copied to | `api/static/listening/` | `api/static/listening/es/` (same `listening-NN.mp3` names) |

`--lang` defaults to `all`. `--out` redirects the JSON and `--no-audio` skips the MP3 copy. A partial
build such as `--lang es` without `--out` overwrites the committed `seed-data.json` with only that
language's records, so give it a different `--out` unless that is what you want. Regenerate after editing
any source guide: `python scripts/build-seed-data.py`.

`prisma/seed.ts` (`npm run seed`) loads `seed-data.json` one language at a time: it deletes only that
language's `source = 'seed'` rows (generated items and the other language stay) and recreates them in one
transaction. With `SEED_IF_EMPTY=1` a language is skipped only when it already has seed rows, so a database
seeded before Spanish existed still receives Spanish on the next start. `api/entrypoint.sh` sets it, but only
in the dev image: the production image installs production dependencies only (`npm ci --omit=dev`), `tsx` is
missing there and the entrypoint skips the seed, so a production database must be seeded from a dev checkout.

A plain `npm run seed` (without `SEED_IF_EMPTY`) is **not** safe on a database in use. The seed data carries no
ids, so every seed row of every language in the file is deleted and recreated with a new UUID: existing
sessions then load no items, and `Answer` and `ReviewItem` rows point at ids that no longer exist. Run it
only on an empty or disposable database; the `SEED_IF_EMPTY=1` form never touches a language that has seed rows.

## Backend architecture (`api/`)

Standard NestJS modular layout (`src/modules/*`, global `PrismaModule`, cross-cutting code in
`src/common/`). See `api/.claude/CLAUDE.md` for the request-pipeline and production-readiness detail —
**but note that doc still describes the original template's `chatbot`/BAML module and nestjs-zod pipe,
which no longer exist**; the sections below are authoritative where they conflict.

**Feature modules:** `health` (Terminus liveness/readiness), `auth` (lightweight header-based dev auth
via `X-Dev-User`), `content` (serve items from the bank), `exam` (sessions, answers, Claude-graded
writing), `vocab`, `progress` (adaptive engine), `generate` (on-demand item generation + TTS), and
`test` (a template CRUD example, safe to delete).

**AI layer — `src/claude/` (not BAML).** `ClaudeAgentService` shells out to the `claude` CLI in print mode
(`claude -p --output-format json --json-schema ...`), so calls bill against the logged-in Claude Code
subscription — no API key, no `@anthropic-ai/claude-agent-sdk`. It passes a JSON Schema (draft-07, built
from the Zod schemas in `claude/schemas.ts` via `toSdkSchema`) and returns the CLI's `structured_output`,
validated with Zod. `grounding.ts` holds the reading/writing grounding prompts. The `generate` and `exam`
modules depend on it via `ClaudeModule`. Model comes from `JFLT_MODEL` (alias or id, default `sonnet`).
Every generate, verify and grade method takes the content language (default English): the prompts name
the language (`claude/language-profile.ts`) and `grounding.ts` embeds the reference set for it, `api/references/`
for English or `api/references/es/` for Spanish. The grader writes its feedback in the exam language.

> **Auth gotcha.** The `claude` binary must be on PATH and logged in (`claude auth login`) wherever the API
> runs. The Docker images install the CLI, and compose keeps the container's own login in the
> `claude_home` volume (`CLAUDE_CONFIG_DIR=/root/.claude`): run `docker compose exec api claude auth login`
> once from an interactive terminal. `docker compose down -v` deletes the volume and the login with it.
> Alternatively run the API on the host, where your existing login applies.

**Validation & serialization:** Zod v4 schemas wired through NestJS's **built-in**
`StandardSchemaValidationPipe` (`APP_PIPE`) and `StandardSchemaSerializerInterceptor` (`APP_INTERCEPTOR`)
in `app.module.ts` — response schemas whitelist fields so Prisma rows can't leak columns. Only
`ThrottlerGuard` is registered globally; there is **no global auth guard**, so routes are open by default.

**Generated code (do not hand-edit):** `prisma/schema.prisma` emits the Prisma client to
`api/generated/prisma` and Zod schemas to `api/generated/zod` (via `prisma-zod-generator`). Jest and
`tsconfig` resolve these through the aliases `@generated/prisma`, `@generated/zod`, and `@/` (= `src/`).

**Static assets:** `main.ts` serves `api/static` at `/static` — this is where listening-item TTS audio
lives (`ListeningItem.audioPath` points into it). English audio is `/static/listening/listening-NN.mp3`,
Spanish audio `/static/listening/es/listening-NN.mp3`; the two sets share file names, so never copy one
language's files into the other's folder.

**Routing & infra:** global prefix `api/v1`; Swagger at `/docs`; BullMQ + Bull Board are wired, with the
queue dashboard at `/api/v1/admin/queues` (unprotected — gate it behind a reverse proxy in production).

### Domain model (`prisma/schema.prisma`)

Three concerns: **content bank** (`ReadingItem`, `WritingTask`, `ListeningItem`, `VocabEntry`;
`source` = `seed` | `generated`), **attempts & scoring** (`ExamSession` → `Answer`, polymorphic by
`itemType`/`itemId` — MCQ answers set `chosenLabel`/`isCorrect`, writing answers set
`responseText`/`score`/`feedback`), and the **adaptive engine** (`TopicStat` for weak-area targeting,
`ReviewItem` for SM-2-style spaced repetition). Columns are `snake_case` in the DB via `@map`.

### Content language

The bank is bilingual. `language` (`en` | `es`, lowercase, default `en`) is a column on `ReadingItem`,
`WritingTask`, `ListeningItem`, `VocabEntry`, `ExamSession` and `TopicStat`, whose unique key is
`(language, skill, level, topic)`. The API picks the language per request:

- Read routes (`content/*`, `vocab`, `vocab/sections`, `vocab/flashcards`, `progress`, `GET sessions`) take
  `?lang=`; `POST sessions` and the `generate/*` bodies take `language`. Controllers resolve `?lang=` with
  `parseLanguage` (`src/common/language.ts`). Absent means `en`; any other value is a 400, including an
  empty `?lang=`, `ES`, `fr` and a repeated key (`?lang=es&lang=en`). Bracket syntax is not an error: under
  Express 5's simple query parser `?lang[]=es` and `?lang[a]=es` are different keys (`lang[]`, `lang[a]`), so
  the request carries no `lang` and English is served with 200.
- A session draws every item from its own language and never mixes them. `POST sessions` returns 422 when no
  item of that language matches the request. `completeSession` updates `TopicStat` under each item's own language.

The frontend keeps the choice in `LanguageService` (`services/language.ts`), persisted in `localStorage`
under `app-content-language` (default `en`; blocked or unreadable storage falls back to `en`). The shell's
`app-language-selector` (top bar on compact windows, sidebar footer from 600px) changes it. Content, progress
and session requests send it, Home reloads the question bank when it changes, and a new session starts in the
current language. An open session keeps the language it began with: the session screen hides each item's topic
(English topics state the answer) and marks the content and feedback with `lang` set to the session language.

### Upgrading an existing database

Migration `20261103102139_add_content_language` cannot be undone by Prisma: it drops the unique index
`topic_stats_skill_level_topic_key`, adds `language` (default `en`, so every existing row becomes English) to
`reading_items`, `writing_tasks`, `listening_items`, `vocab_entries`, `exam_sessions` and `topic_stats`, and
creates the new `(language, skill, level, topic)` unique index. Back up before the first start of the new
version. In the compose setup the database service is `db`, user `postgres`, database `app_db`
(`docker-compose.yml`):

```bash
docker compose exec -T db pg_dump -U postgres -d app_db -Fc > jflt-before-language-switch.dump
```

The first start then runs the migration and, in the dev image, `SEED_IF_EMPTY=1 npm run seed`, which also
seeds Spanish (English rows and their ids are left alone).

To roll back, stop the API and restore the dump, then start the previous version:

```bash
docker compose stop api
docker compose exec -T db pg_restore -U postgres -d app_db --clean --if-exists < jflt-before-language-switch.dump
```

The alternative that keeps newer data is to delete the `language = 'es'` rows (the five content and session
tables above plus `topic_stats`; an `exam_sessions` row takes its `answers` with it) and recreate the old index with
`CREATE UNIQUE INDEX "topic_stats_skill_level_topic_key" ON "topic_stats"("skill", "level", "topic");`. The
`language` columns can stay, since they default to `en`.

## Frontend architecture (`frontend/`)

Angular 21, standalone + zoneless + signals, OnPush, `inject()`, Angular Material 3 themed entirely
through `--mat-sys-*` tokens. `frontend/.claude/CLAUDE.md` is the authoritative and current convention
guide (Material usage, theming, responsive M3 window-size-class shell, icons, a11y, testing) — follow it
closely for any UI work.

The app shell is `shared/layout/`. Routes (`app.routes.ts`) are the practice/exam flow: `home` (question
bank) → `reading`/`listening`/`writing`/`full`/`exam` all load `LaunchComponent` (which starts a session
from route `data` then redirects to) → `session/:id` (`SessionComponent`, the test runner). Some template
residue remains unrouted (`pages/chatbot`, `pages/components`, `pages/dashboard`, `services/chat`).

## Environment

A single root `.env` is the source of truth (copy from `.env.example`). The API reads `../.env` then a
local `api/.env` fallback; Docker Compose injects the same file via `env_file` and then overrides **only**
the DB/Redis host values to point at compose-network services. `env.validation.ts` fails fast if
`DATABASE_URL` / `DIRECT_URL` are missing.
