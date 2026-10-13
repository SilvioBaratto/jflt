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
| Test (all) | `npm test` (Jest) | `npm test` / `ng test` (Vitest) |
| Single test | `npm test -- health.controller` (path/name regex); add `-t "case name"` | `ng test` (Vitest filters) |
| Lint | `npm run lint` (ESLint) | — (no lint script; Prettier config only) |
| Build | `npm run build` | `npm run build` |
| E2E | `npm run test:e2e` | — |

### Database & seed (API)

```bash
npm run prisma:migrate:dev        # create + apply a migration in dev
npm run prisma:migrate:deploy     # apply migrations (prod)
npm run prisma:generate           # regenerate the Prisma client (also runs on postinstall)
npm run seed                      # load seed data (tsx prisma/seed.ts)
npm run prisma:studio
```

Seed data (`api/prisma/seed-data.json`) is **built from in-repo generated content** by
`scripts/build-seed-data.py`: exam markdown and listening JSON under `api/seed-src/`
(`reading/`, `writing/`, `listening/`) plus the bilingual vocabulary guide
`api/references/english-vocabulary-guide.md`. The script also copies the listening MP3s into
`api/static/listening/`. `prisma/seed.ts` (`npm run seed`) then loads `seed-data.json` into the DB.
Regenerate after editing any source guide: `python scripts/build-seed-data.py`.

## Backend architecture (`api/`)

Standard NestJS modular layout (`src/modules/*`, global `PrismaModule`, cross-cutting code in
`src/common/`). See `api/.claude/CLAUDE.md` for the request-pipeline and production-readiness detail —
**but note that doc still describes the original template's `chatbot`/BAML module and nestjs-zod pipe,
which no longer exist**; the sections below are authoritative where they conflict.

**Feature modules:** `health` (Terminus liveness/readiness), `auth` (lightweight header-based dev auth
via `X-Dev-User`), `content` (serve items from the bank), `exam` (sessions, answers, Claude-graded
writing), `vocab`, `progress` (adaptive engine), `generate` (on-demand item generation + TTS), and
`test` (a template CRUD example, safe to delete).

**AI layer — `src/claude/` (not BAML).** `ClaudeAgentService` wraps the `@anthropic-ai/claude-agent-sdk`
`query()` call for single-shot structured output: it passes a JSON Schema (draft-07, built from the Zod
schemas in `claude/schemas.ts` via `toSdkSchema`) and returns validated structured data. `grounding.ts`
holds the reading/writing grounding prompts. The `generate` and `exam` modules depend on it via
`ClaudeModule`.

> **Foundry auth gotcha.** The SDK is configured for **Azure AI Foundry** through the environment
> (`CLAUDE_CODE_USE_FOUNDRY=1`, `ANTHROPIC_FOUNDRY_RESOURCE`, model from `JFLT_MODEL`). With no token
> set it uses the Entra default credential chain — i.e. your `az login` session. **A Docker container
> has no `az login`**, so for live Claude calls either run the API on the host, or pass
> `ANTHROPIC_FOUNDRY_AUTH_TOKEN` / `ANTHROPIC_FOUNDRY_API_KEY` into the container.

**Validation & serialization:** Zod v4 schemas wired through NestJS's **built-in**
`StandardSchemaValidationPipe` (`APP_PIPE`) and `StandardSchemaSerializerInterceptor` (`APP_INTERCEPTOR`)
in `app.module.ts` — response schemas whitelist fields so Prisma rows can't leak columns. Only
`ThrottlerGuard` is registered globally; there is **no global auth guard**, so routes are open by default.

**Generated code (do not hand-edit):** `prisma/schema.prisma` emits the Prisma client to
`api/generated/prisma` and Zod schemas to `api/generated/zod` (via `prisma-zod-generator`). Jest and
`tsconfig` resolve these through the aliases `@generated/prisma`, `@generated/zod`, and `@/` (= `src/`).

**Static assets:** `main.ts` serves `api/static` at `/static` — this is where listening-item TTS audio
lives (`ListeningItem.audioPath` points into it).

**Routing & infra:** global prefix `api/v1`; Swagger at `/docs`; BullMQ + Bull Board are wired, with the
queue dashboard at `/api/v1/admin/queues` (unprotected — gate it behind a reverse proxy in production).

### Domain model (`prisma/schema.prisma`)

Three concerns: **content bank** (`ReadingItem`, `WritingTask`, `ListeningItem`, `VocabEntry`;
`source` = `seed` | `generated`), **attempts & scoring** (`ExamSession` → `Answer`, polymorphic by
`itemType`/`itemId` — MCQ answers set `chosenLabel`/`isCorrect`, writing answers set
`responseText`/`score`/`feedback`), and the **adaptive engine** (`TopicStat` for weak-area targeting,
`ReviewItem` for SM-2-style spaced repetition). Columns are `snake_case` in the DB via `@map`.

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
