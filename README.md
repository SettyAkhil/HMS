# HospAI — Hospital Management System

Four independent apps, one folder each, plus deployment glue:

| Folder | What it is | Runs on |
|---|---|---|
| [`frontend/`](frontend/) | The hospital web app (React 19 + Vite + Tailwind). All screens, roles and the browser-side stores. | dev `:8443` |
| [`backend/`](backend/) | Hospital API: 9 Flask microservices behind an nginx gateway, `hr-api` (FastAPI), Postgres, Redis. Docker Compose. | gateway `:8010` |
| [`ocr-frontend/`](ocr-frontend/) | Keppler OCR / summarizer / RAG web app, embedded in the hospital app as an iframe. Has its own React. | dev `:3000` |
| [`ocr-backend/`](ocr-backend/) | Keppler OCR API (FastAPI, Celery, Qdrant, Postgres). Docker Compose. | `:7620` |
| [`deploy/`](deploy/) | Production: one compose file + web (nginx) and HRMS images. Driven by `./deploy.sh`. | `:80` |
| [`scripts/`](scripts/) | `dev.mjs` (starts everything for development), `dev-stop.mjs`, `sync-backend.sh`. | — |
| [`docs/`](docs/) | Module specifications. | — |

## Run it (development)

```bash
npm run install:all        # once: frontend + ocr-frontend dependencies
(cd backend && docker compose up -d)          # hospital API
(cd ocr-backend && docker compose up -d)      # OCR API (optional)
npm run dev                # frontend :8443 + ocr-frontend :3000 + legacy HRMS :8011
npm run dev:stop           # stop the three dev servers
```

The browser only ever talks to `:8443`. `frontend/vite.config.ts` proxies
`/hms-api` → gateway `:8010`, `/hms-api/api/hr` → Node HRMS `:8011`, and
`/keppler-ocr` + `/api` → `ocr-frontend` `:3000`.

## Run it (production)

`./deploy.sh` then `./deploy.sh up` — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Where to look when something breaks

| Symptom | Look in |
|---|---|
| A screen is wrong / blank / throws | `frontend/src/components/<Module>` (route table: `frontend/src/App.tsx`) |
| Data differs between desks | the browser stores in `frontend/src/services/*Db.ts` and `db.ts` (queue sync: `syncOPVisitsWithBackend`) |
| `/hms-api/...` returns 4xx/5xx | `backend/backend/modules/<module>/routes.py`; gateway routing in `backend/gateway/nginx.conf` |
| 502 on `/hms-api` | backend stack is down: `docker ps --filter name=keppler-backend` |
| 502 on `/keppler-ocr` or OCR blank | `ocr-frontend` dev server (`:3000`) or `ocr-backend` is down |
| HR & Staff screens | `frontend/src/components/hr` → `backend/hr-api` |
| Login / roles / menu entries | `frontend/src/services/roleDb.ts`, `frontend/src/lib/demoCredentials.ts`, `backend/backend/core/auth.py` |
| Docker build/deploy | `deploy/docker-compose.yml`, `deploy/web/Dockerfile` |

Notes on the layout:
- `backend/backend/` is intentional: the outer folder is the compose project, the inner one is the
  Python app copied into every service image (`COPY backend/ ./`).
- `frontend/server/` is the legacy Node HRMS server. It stays beside the frontend because the dev
  server imports `server/db/memoryStore.mjs` and both share `frontend/node_modules`.
- Compose project names are pinned (`keppler-backend`, `dpi-ocr-backend`), so renaming the folders
  did not orphan existing Docker volumes, networks or images.
- `backend/dpi-ocr` is a symlink to `../ocr-backend` (the backend compose builds the OCR images from it).

Project notes for AI assistants: [AGENTS.md](AGENTS.md).
