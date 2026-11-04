# HospAI — Production Deployment

Everything needed to run the hospital system is in this repository: the web app,
the embedded Keppler OCR app, the backend (`keppler-backend/`), the OCR backend
(`dpi-ocr-backend/`), the Node HRMS server (`server/`), and all databases.
One script builds and starts it.

---

## 1. Requirements

| | Minimum | Recommended |
|---|---|---|
| Server | Linux x86-64 (Ubuntu 22.04/24.04 tested) | |
| CPU / RAM | 4 cores / 8 GB | 8 cores / 16 GB |
| Disk | 40 GB free | 100 GB+ (patient uploads, backups) |
| Software | Docker Engine 24+ with the Compose v2 plugin (`docker compose version` ≥ 2.20) | |
| Network | One port open to users (default **80**) | HTTPS in front (see §4) |

**AI features** (OCR, prescription reading, discharge summaries) need a separate
GPU machine running an OpenAI-compatible **vLLM** server (model `qwen3-vl-8b`).
The system runs without it; those features say "unavailable" until
`AI_SERVER_URL` points at it.

---

## 2. Deploy (3 steps)

```bash
# 1. Get the code onto the server (git clone, or copy this folder).
cd Enterprise-Hospital-Management-System

# 2. Create the configuration (generates all secrets automatically).
./deploy.sh
#    -> edit deploy/.env: set PUBLIC_URL (and HTTP_PORT, AI_SERVER_URL if needed)

# 3. Build and start everything.
./deploy.sh up
```

The first build takes 10–20 minutes (it builds ~10 images). When it finishes the
script prints the address. Open it and sign in with the role picker.

That's it. Every later start/update is `./deploy.sh up` (or `./deploy.sh update`).

---

## 3. Configuration — `deploy/.env`

Created by `./deploy.sh` from `deploy/.env.example`. Only the first block is required.

| Setting | What it is |
|---|---|
| `PUBLIC_URL` | **Required.** The exact address users open, e.g. `https://hms.yourhospital.in`. Patient-card QR codes and SMS links point here, so it must be reachable from patients' phones. |
| `HTTP_PORT` | Port the web server listens on (default `80`). |
| `SESSION_COOKIE_SECURE` | `true` when `PUBLIC_URL` is `https://`. |
| `AI_SERVER_URL` | vLLM server, without `/v1`, e.g. `http://10.0.0.20:8700`. |
| `TWILIO_*`, `WHATSAPP_TEMPLATE_SIDS` | Patient SMS/WhatsApp. Optional: until set, messages wait in **Patient Messages** and reception sends them with one click from the desk's WhatsApp/phone. |
| `RAZORPAY_KEY_ID` | Pharmacy card/UPI payments, live key `rzp_live_…`. Empty = test key (no real money). |
| `*_PASSWORD`, `SESSION_PEPPER`, `SETTINGS_ENCRYPTION_KEY`, `HR_SECRETS_KEY` | Generated automatically. **Do not change after the first start**, and back the file up — losing the keys makes stored credentials unreadable. |

After editing `deploy/.env`, apply it with `./deploy.sh up`.
(`PUBLIC_URL` and `RAZORPAY_KEY_ID` are built into the web app, so `up` rebuilds it.)

---

## 4. HTTPS

The stack serves plain HTTP on `HTTP_PORT`. Put any HTTPS terminator in front of it —
the hospital's load balancer, Cloudflare, or a reverse proxy on the same server. With
**Caddy** (automatic certificates), for example, set `HTTP_PORT=8080` and use this Caddyfile:

```
hms.yourhospital.in {
    reverse_proxy 127.0.0.1:8080
}
```

Then set `PUBLIC_URL=https://hms.yourhospital.in` and `SESSION_COOKIE_SECURE=true`,
and run `./deploy.sh up`. The web server already trusts `X-Forwarded-For` /
`X-Forwarded-Proto` from private networks, so per-user rate limits and secure
cookies keep working behind a proxy.

---

## 5. Day-to-day operations

| Task | Command |
|---|---|
| Status (containers + health) | `./deploy.sh status` |
| Logs (all / one service) | `./deploy.sh logs` · `./deploy.sh logs web` |
| Restart | `./deploy.sh restart` |
| Update to new code | pull/copy the new code, then `./deploy.sh update` |
| **Backup** | `./deploy.sh backup` → `backups/<date>/` (4 databases, uploaded files, config). Copy it off the server; schedule it daily, e.g. cron `0 2 * * * cd /path && ./deploy.sh backup` |
| Stop (data kept) | `./deploy.sh down` |

**Restore** (into a fresh install, after `./deploy.sh up` has created the databases):

```bash
B=backups/<date>
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T postgres      pg_restore -U hospai   -d hospai            --clean --if-exists < $B/main.dump
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T hr-postgres   pg_restore -U hr_owner -d hospai_hr         --clean --if-exists < $B/hr.dump
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T ocr-postgres  pg_restore -U keppler  -d keppler           --clean --if-exists < $B/ocr.dump
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T hrms-postgres pg_restore -U hrms     -d hospai_enterprise --clean --if-exists < $B/hrms.dump
for v in hospital_uploads hr_documents ocr_uploads; do
  docker run --rm -v hospai_$v:/data -v "$PWD/$B:/backup" alpine sh -c "cd /data && tar xzf /backup/$v.tar.gz"
done
./deploy.sh restart
```
Restore onto the same secrets: copy `$B/env.backup` to `deploy/.env` first.

All data lives in Docker volumes named `hospai_*` and survives `down`, `update` and reboots.

---

## 6. What runs

Only `web` is reachable from outside; everything else is on a private Docker network.

| Service | Role |
|---|---|
| `web` | nginx: the HMS app, the Keppler OCR app (`/keppler-ocr/`), and the reverse proxy for `/hms-api/*` → gateway, `/hms-api/api/hr` + `/iclock` → hrms, `/api/*` → ocr-api, `/vllm-api/*` → AI server |
| `gateway` | API gateway in front of the backend services |
| `auth`, `patients`, `appointments`, `er`, `billing`, `pharmacy`, `hr`, `ai`, `reporting` `-service`, `celery-worker` | Hospital backend (Flask). `auth-service` creates/migrates the main schema on start |
| `hr-api`, `hr-worker` | HR & Staff (FastAPI) |
| `ocr-api`, `ocr-worker`, `ocr-migrate` | Keppler OCR backend; `ocr-migrate` applies its schema before the API starts |
| `hrms` | Node HRMS server (legacy HR screens, eSSL biometric devices push to `/iclock`) |
| `postgres`, `hr-postgres`, `ocr-postgres`, `hrms-postgres`, `redis`, `ocr-redis`, `ocr-qdrant` | Data stores |

eSSL biometric devices: point their server address at `PUBLIC_URL` (they push to `/iclock`).

---

## 7. Security before go-live — read this

These are properties of the application as it is today. Deployment does not change
application behaviour; they need a product decision before real patients use it.

1. **Login uses built-in accounts.** The login screen's role picker signs in with
   fixed accounts the backend seeds (`SEED_DEMO_USERS=true`), and checks module access
   against a local list where every role's password is `password123`
   (`src/lib/demoCredentials.ts`). Anyone who can open the site can sign in as any role,
   including admin. Before exposing it beyond a trusted network, replace this with real
   per-user accounts, or at minimum keep the site reachable only from the hospital network/VPN.
2. **Much of the clinical workflow is stored in each browser**, not on the server:
   OP encounters, pharmacy queue, lab orders, doctor-portal consultations, insurance cases,
   bed board details, locally created bills. Data entered on one computer is not visible on
   another, and is lost if that browser's site data is cleared. Billing (server invoices),
   patients, appointments, beds/admissions, ICU charts, HR and OCR *are* on the server and
   are covered by `./deploy.sh backup`. Plan pilot use accordingly.
3. **Patient record links** (card QR, SMS) open a patient's history without login, by an
   unguessable per-card token. Treat the card like the patient's file; a lost card's link
   can be cancelled with "Reissue card link" on the patient page.
4. Rotate the Twilio auth token if it was ever shared in plain text, and keep
   `deploy/.env` readable only by the deploy user (`chmod 600`, done by the script).

---

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| `./deploy.sh` says Docker can't be used | `sudo usermod -aG docker $USER`, log out and in |
| Site loads, every screen empty / "Failed to fetch" | `./deploy.sh status`; `./deploy.sh logs gateway auth-service` |
| Keppler OCR tab blank | `./deploy.sh logs ocr-api ocr-migrate` |
| AI features "unavailable" | `AI_SERVER_URL` in `deploy/.env`; from the server: `curl $AI_SERVER_URL/v1/models` |
| QR / SMS links open the wrong address | `PUBLIC_URL` in `deploy/.env`, then `./deploy.sh up` (rebuilds the web app) |
| SMS/WhatsApp not sent | Twilio settings in `deploy/.env`; status shows in Patient Messages |
| Port 80 already in use | set `HTTP_PORT` in `deploy/.env` |

---

## For developers

Development is unchanged (`npm run dev`, see `AGENTS.md`). The backend's working copy
lives outside this repo on the development machine; `keppler-backend/` here is the copy
that ships. Refresh it before a release with `scripts/sync-backend.sh`.
