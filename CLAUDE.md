# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack application with **NestJS**, **Angular**, and **Docker**.

## Build & Run Commands

```bash
# Run full stack with Docker
docker compose up -d --build

# Stop all services
docker compose down
```

## API Template (`api/`)

NestJS application with modular architecture:

| Layer | Purpose |
|-------|---------|
| `src/modules/` | Feature modules (health, auth, chatbot, test) |
| `src/prisma/` | Global PrismaModule and PrismaService |
| `src/common/` | Decorators, filters, exceptions, interceptors, middleware |
| `prisma/schema.prisma` | Database models |
| `baml_src/` | LLM function definitions (regenerate client with `npx baml-cli generate`) |

See `api/.claude/CLAUDE.md` for the full BAML call flow and production-readiness checklist.

## Frontend Template (`frontend/`)

Angular 21 with Angular Material 3 (standalone components, signals, native control flow, OnPush, `inject()`, `--mat-sys-*` tokens). See `frontend/.claude/CLAUDE.md` for the full conventions.

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `db` | 5433:5432 | PostgreSQL 16 |
| `redis` | internal | Redis (BullMQ) |
| `api` | 8000:8000 | NestJS with hot reload |
| `frontend` | 4200:80 | Angular + nginx |
| `adminer` | 8080:8080 | Database admin UI |
