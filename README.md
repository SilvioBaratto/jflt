# Project

Full-stack application with **NestJS**, **Angular**, and **Docker**.

## Getting Started

```bash
# Edit .env with your real keys (ships with working dev defaults)
docker compose up -d --build
```

Services will be available at:
- Frontend: http://localhost:4200
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Adminer: http://localhost:8080

## Development

### Backend (NestJS)

```bash
cd api
npm install
npm run start:dev                      # Runs on :8000

# Database (Prisma)
npx prisma migrate dev                 # Create + apply migration
npx prisma migrate deploy              # Apply migrations (production)
npx prisma generate                    # Regenerate Prisma client

# Tests
npm test

# BAML (AI/LLM)
npx baml-cli generate
```

### Frontend (Angular)

```bash
cd frontend
npm install --legacy-peer-deps         # See note below
ng serve                               # Runs on :4200
ng test
```

> **Why `--legacy-peer-deps`?** The frontend `Dockerfile` and CI install with this flag, so a
> local install resolves the same dependency tree. The flag makes npm 7+ ignore peer dependencies
> while it builds the tree, as npm 3–6 did, so a peer-range conflict can't abort the install with
> `ERESOLVE`. `ng build` and `ng test` still run against the installed packages, so a real
> incompatibility still fails there.

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `db` | 5433:5432 | PostgreSQL 16 |
| `redis` | internal | Redis (BullMQ) |
| `api` | 8000:8000 | NestJS with hot reload |
| `frontend` | 4200:80 | Angular + nginx |
| `adminer` | 8080:8080 | Database admin UI |

## License

MIT
