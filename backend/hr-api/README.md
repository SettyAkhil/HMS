# hr-api — HospAI HR & Workforce

FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL with row-level security · Redis · Celery.
One service for the whole HR & Staff module: employee master, organization, eSSL attendance,
attendance engine, shifts & rosters, staffing, leave, payroll, recruitment & onboarding,
documents, training, performance, compliance, grievances, self-service, reports, and the
read APIs other HMS modules use. Frontend: `src/components/hr/` in the frontend repo.

Contents: [1 Features](#1-feature-inventory) · [2 Frontend](#2-frontend-routes) · [3 API](#3-api) ·
[4 Schema](#4-database-schema-and-migrations) · [5 eSSL](#5-essl-integration-guide) ·
[6 Environment](#6-environment) · [7 Tests](#7-test-results) · [8 Security](#8-security-assessment) ·
[9 Performance](#9-performance-assessment) · [10 Deployment](#10-deployment-rollback-and-migration) ·
[11 Limitations](#11-known-limitations) · [12 Outstanding](#12-outstanding-tasks)

## Architecture

```
browser ─/hms-api/api/v1/…─▶ vite proxy ─▶ nginx gateway :8010 ─(regex, 100 r/s/client)─▶ hr-api :8020
                                                                                         │
            auth-service ◀── GET /api/auth/session (forwarded cookie, 15 s cache) ───────┤
            accounts / employees / beds ◀── calls as the signed-in user (hms.py) ────────┤
                                                                                         ├─▶ hr-postgres (RLS on tenant_id)
            eSSL WebAPIService.asmx ◀── hr-worker (Celery beat) ─────────────────────────┤
                                                                                         └─▶ redis: hr:live:<tenant> (SSE), hr:events (outbox)
```

- **Identity & permissions** come from auth-service. No login, user table or password here.
  Permission strings are auth-service's own (`core/auth.py SUB_MODULES["hrms"]`), extended with
  `hr.shifts.write`, `hr.recruitment.write`, `hr.training.write`, `hr.performance.write`,
  `hr.documents.write`, `hr.grievances.manage`, `hr.reports.read`. Granting the bare `hrms` module grants all.
- **Tenancy**: tenant = session `hospital_code`, provisioned on first use. Every tenant table
  (76) has `ENABLE + FORCE ROW LEVEL SECURITY`; the API connects as `hr_app` (no superuser, no
  BYPASSRLS) and sets `app.tenant_id` per transaction. Unset tenant ⇒ zero rows.
- **Other services** are reached only through the gateway, as the user who triggered the action
  (`services/hms.py`): HR never reads another service's database and never acts with more
  authority than the person did. Refusals are recorded and retryable, not hidden.
- **Events**: transactional outbox → Redis stream `hr:events` (`event_id` = idempotency key,
  correlation id carried). Live board updates publish after commit only.
- **Approval engine** (`services/workflow.py`): per-tenant configurable steps (reporting manager,
  department head, permission), conditions (`days >= 3`), snapshot at submission, no
  self-approval, delegation, escalation, full action history. Used by leave, corrections, swaps,
  overtime, requisitions, payroll, grievance closure.

## 1. Feature inventory

| # | Area | What works (all against the database, all via API + UI) |
|---|---|---|
| 01 | HR dashboard | Headcount by status/category/branch/department, presence now, leave, approvals, exceptions, vacancies, training gaps, expiring credentials, last payroll; filters; drill-down |
| 02 | Employees | 15 categories; personal/employment/professional/system fields; create, edit, search, filter, sort, CSV import (all-or-nothing) & export; effective-dated transfer & multiple departments; activate/suspend/terminate/archive with HMS-login sync; 14 profile tabs |
| 03 | Organization | Hospital → branch → department → sub-department → unit; designations; heads; budgets (payroll-only); tree view; HMS-module & census-ward mapping |
| 04 | Attendance | eSSL adapters, devices, PIN mapping, raw ledger, sync history, live board (SSE); **engine**: sessions, debounce, overnight windows, grace, breaks, holidays, weekly offs, leave, overtime, missing punch, rest checks, recalculation; daily register, monthly calendar, exceptions, corrections (approved → manual punch), overtime approval |
| 05 | Shifts & duty | Templates incl. overnight; weekly/2-/4-week rosters; rotation generator; validation (inactive, leave, rest, overlap, membership, competency, staffing) before publish; holidays; swaps/replacements via approval; handovers |
| 06 | Leave | Configurable types & policies (per category, annual/monthly accrual, carry-forward, min service); balances & adjustments; apply (half day, emergency, documents); manager → HR approval; cancel; calendar; attendance update |
| 07 | Payroll | Components, structures (percent/fixed/balance), effective-dated compensation with encrypted PAN/bank; configurable PF/ESI/PT/overtime (no hardcoded rates); LOP from attendance & unpaid leave; approved OT, night allowance; loans/advances, adjustments; calculate → approve → finalize (locks attendance, payslips, Accounts journal) → reverse; DB-enforced immutability |
| 08 | Staffing | Requirements by department/shift/category with nurse-to-patient ratio & competency; coverage with **live bed census**; temporary/replacement allocation; on-duty board; shortage events |
| 09 | Recruitment & onboarding | Requisition (approval) → vacancy → candidates (resume in private storage) → pipeline → interviews & feedback → offer → acceptance → checklist → activation (employee, code, dept, designation, compensation, HMS login, eSSL PIN, first-week roster, welcome notification) |
| 10 | Performance | Cycles with per-category weighted criteria; launch; self → manager → HR; goals & department KPIs; history |
| 11 | Training | Programmes (BLS, ACLS, fire, infection control, clinical, dept), sessions, capacity, enrolment, results with pass marks → certificates with expiry; mandatory-training matrix |
| 12 | Documents | Private volume, magic-byte type check, 10 MB, SHA-256 integrity, versions, issue/expiry, verification, HR-only/employee/confidential access, audited downloads |
| 13 | Grievances | Named or anonymous (unlinked) cases; committee/investigator/submitter visibility; internal notes; investigation; disciplinary actions → history; closure via approval |
| 14 | Self-service | "My HR": profile, attendance & corrections, shifts & cover requests, handovers, leave, payslips (print), documents, training, reviews, grievances, my requests, announcements, notifications |
| 15 | Reports | 13 reports (permission-gated), filters, CSV (formula-safe, audited), schedules with in-app delivery |
| — | Compliance | Nightly scan of credentials, certificates, mandatory training, documents, contracts → status records + expiry alerts; credential verification log |
| — | HMS integration | On-duty strips in ICU/ER/OT/OP, Command Center workforce panel, notification bell, doctor availability API, Accounts payroll posting & reversal, HMS login create/deactivate/reactivate, bed census |

## 2. Frontend routes

The app is module-switched (no URL router). Sidebar **HR & Staff** (`hrms`; `employees` and
`scheduling` land in it too) opens `HrWorkspace` with sections: Dashboard, Approvals, Employees,
Organization, Recruitment, Announcements, Attendance, Shifts & rosters, Staffing, Leave, Payroll,
Training, Performance, Compliance, Grievances, Reports — each shown only to users whose
permissions allow it. **My HR** (`my_hr`, granted to every non-admin role in `roleDb.ts`) opens
`MyHR`. Embedded elsewhere: `WorkforcePanel` (Dashboard / Command Center), `OnDutyStrip`
(emergency, surgery, icu*, op_management), HR items in the notification bell. API client:
`src/services/hr/client.ts` (not `apiFetch`: its offline mock would invent HR data).

## 3. API

**[docs/API.md](docs/API.md)** — 206 operations with the permission each requires, generated
from the route table (`python -m docs.gen_api_inventory`). OpenAPI: `/api/v1/hr-openapi.json`
on hr-api (internal; deliberately not routed by the gateway). Errors:
`{"error", "code", "details"?}`; 422s list `details.fields`; lists page as
`{items,total,page,page_size}`. Gateway prefixes: `/api/v1/{hr,attendance,workforce,payroll,
recruitment,onboarding,training,performance,compliance,me,reports/hr}`.

## 4. Database schema and migrations

| Rev | Tables |
|---|---|
| 0001 | tenants, audit_logs, outbox_events, code_sequences, hospitals, branches, departments, organization_units, designations, employees, employee_profiles, employee_contacts, employment_records, employee_departments, employee_history, employee_credentials, attendance_integrations, biometric_devices, biometric_mappings, attendance_sync_logs, raw_punch_logs (+ append-only trigger, `hr_app` role) |
| 0002 | approval_workflows, approval_steps, approval_instances, approval_actions, shift_templates, holidays, duty_rosters, shift_assignments, shift_swap_requests, shift_handovers, attendance_records, attendance_sessions, attendance_exceptions, attendance_corrections, overtime_records, staffing_requirements, staff_allocations, leave_types, leave_policies, leave_balances, leave_requests |
| 0003 | salary_components, salary_structures, employee_compensation, statutory_configs, employee_loans, payroll_runs, payroll_items, payroll_adjustments, payslips (+ finalized-run immutability triggers) |
| 0004 | job_requisitions, vacancies, candidates, applications, interviews, offers, onboarding_tasks, employee_documents, training_programs, training_sessions, training_enrollments, employee_certifications, review_cycles, performance_goals, performance_reviews, review_scores, credential_verifications, expiry_alerts, compliance_records, grievance_cases, grievance_comments, investigation_records, disciplinary_actions |
| 0005 | hr_announcements, report_schedules, report_runs; departments.hms_module, census_wards |

UUID keys, `tenant_id` FK + index + RLS on every tenant table, audit columns, soft delete where
records are referenced, effective dating on employment, departments, mappings, compensation,
policies and requirements. New migration: `./newmig.sh <rev> "<msg>"` (autogenerates, then
appends `enable_tenant_rls()` with a literal table list). Downgrade path verified for 0001;
each later revision's downgrade is generated and drops only its own objects.

Deliberate deviations from the brief's table list: `employee_profiles` holds professional
fields; leave approvals live in the shared `approval_*` tables (no separate `leave_approvals`);
`staffing_requirements` and `shift_handovers`, `holidays`, `employee_loans`, `statutory_configs`
were added.

## 5. eSSL integration guide

1. **Identify the product**: eSSL software → Help → About (eTimeTrackLite Web or eBioServer).
2. **URL**: usually `http://<server>[:port]/WebAPIService.asmx` (some: `/iclock/WebAPIService.asmx`);
   `…?WSDL` must return XML from the hospital network.
3. **Web-API user** with access to transaction logs.
4. HR & Staff → Attendance → Devices & integrations → *Add integration* → *Test connection*
   (reads the WSDL; only declared operations are used).
5. Register each **device by serial** (GetTransactionsLog is per serial).
6. *Sync now*; map PINs under *Biometric mapping* (unmapped PINs listed; mapping claims their
   earlier punches and recalculates attendance).
7. The worker polls per integration (back-off on failure ≤ 1 h), re-reading 24 h behind the
   watermark; window re-sync for longer outages.
8. Map departments to HMS modules (Organization) to light up on-duty strips.

**Verification status**: operation names are from eSSL's integration page; the
`GetTransactionsLog` request/response shape is from an open-source client used against real
installs (github.com/rtdany10/etimetracklite), **not vendor documentation, and not yet run
against this hospital's server**. AddEmployee / GetCommandStatus stay unsupported until their
parameters are verified. No biometric templates are read or stored. `simulator` provider
(`sim://?pins=…`) is for testing and labelled as such.

## 6. Environment

| Variable | Notes |
|---|---|
| `HR_OWNER_DB_PASSWORD`, `HR_APP_DB_PASSWORD` | DB owner (migrations) and runtime role; compose builds the URLs |
| `HR_SECRETS_KEY` | Fernet key for eSSL passwords, PAN, bank accounts. Rotating it makes stored values unreadable |
| `HR_DATABASE_URL`, `HR_DATABASE_OWNER_URL` | Set by compose |
| `HR_AUTH_SERVICE_URL` (`http://auth-service:8011`), `HR_GATEWAY_URL` (`http://gateway:8010`) | Identity; calls to other services |
| `HR_DOCUMENT_ROOT` (`/data/hr-documents`) | Private volume `hr_documents` |
| `SESSION_COOKIE_NAME`, `REDIS_URL` (`redis://redis:6379/2`), `HR_TIMEZONE` (`Asia/Kolkata`) | |
| `HR_AUDIT_RETENTION_DAYS` (2920), `HR_REPORT_RETENTION_DAYS` (90), `HR_CANDIDATE_RETENTION_DAYS` (365) | Nightly retention |
| `HR_DEVICE_OFFLINE_MINUTES`, `HR_SESSION_CACHE_SECONDS`, `HR_CSRF_ENABLED` | Tuning; CSRF off only in tests |

## 7. Test results

Last run (2026-11-02, all against real services, nothing mocked except where noted):

| Suite | Result |
|---|---|
| pytest (`./run_tests.sh`, throwaway Postgres, real migrations + RLS + triggers) | **412 passed** — includes 223 route-level auth/CSRF sweeps over every registered route |
| Playwright (headless Chromium, real UI on the dev server) | Phase 1 flow + all-areas flow: org, employees, transfer, devices, sync, mapping, live board, roster build & publish, on-duty, leave setup, payroll build/calculate/submit, approvals (self-approval blocked), requisition, training matrix, compliance scan, announcements, reports, dashboards, ICU strip, My HR as staff incl. leave application — **pass**, no unexpected 4xx/5xx |
| Newman (`postman/`, through gateway + auth-service) | **28/28** assertions |
| k6 (`load/hr_load.js`, 100 VUs, 2m45s) | **0.00 % errors** of 14,351 requests; p95 34 ms (reads 35 ms, writes 29 ms) |
| OWASP ZAP API scan (OpenAPI-driven) | **0 FAIL**, 119 PASS; 1 low (CORP header) fixed; 1 informational false positive |
| Gateway rate limit (500 parallel) | 231 × 200, 269 × 429 |

Commands: `./run_tests.sh`; Playwright scripts used are reproducible from the steps above;
`newman run postman/hr-api.postman_collection.json -e postman/local.postman_environment.json --env-var password=…`;
k6 command in `load/hr_load.js` header; ZAP: `docker run --network keppler-backend_default ghcr.io/zaproxy/zaproxy:stable zap-api-scan.py -t http://hr-api:8020/api/v1/hr-openapi.json -f openapi`.

## 8. Security assessment

Controls in place and tested: auth on every route (sweep); CSRF on every write (sweep);
tenant isolation at API and SQL level (RLS, `hr_app` non-privileged, unset tenant ⇒ nothing);
permission checks in dependencies, plus self/ownership checks for self-service, payslips,
documents, grievances; no self-approval; immutable raw punches and finalized payroll (DB
triggers); encrypted secrets/PAN/bank (Fernet, key outside DB), masked in responses; personal
fields hidden without employee-management rights; budgets/payroll figures only with payroll
rights; grievance visibility & anonymity (no link stored); documents private, type-sniffed,
hashed, filename-sanitised, downloads audited, 404 (not 403) for unauthorised; CSV formula
neutralisation; SQL injection probes; XML-bomb-safe SOAP parsing; generic error bodies (no SQL);
security headers incl. CORP; per-client gateway rate limit; audit log of every change with
actor & correlation id; retention purge.

Residual risks: eSSL over HTTP sends web-API credentials in clear text if the hospital's server
is HTTP-only (vendor limitation — put it on an internal VLAN or TLS-terminate); temporary HMS
passwords are shown once to the HR user (no forced change exists in auth-service); per-IP rate
limiting is coarse behind NAT; branch/department-scoped HR roles are not implemented (any HR
reader sees all branches of the tenant).

## 9. Performance assessment

At 100 concurrent users the service stayed at p95 34 ms with zero errors on a single uvicorn
worker and default pool (10 + 20 overflow) — far inside the 800 ms target. Heaviest calls
are the dashboard and live board (aggregate queries, indexed by tenant/date/status). The
attendance engine recalculates per employee-day; a full nightly pass for 1,000 staff × 3 days
is ~3,000 small transactions. Scale-out: run more uvicorn workers / replicas (stateless; the
session cache is per process); Celery concurrency for sync and recalculation. Re-run k6 with
production data volumes before go-live.

## 10. Deployment, rollback and migration

```bash
cd backend
# first time: add HR_OWNER_DB_PASSWORD, HR_APP_DB_PASSWORD, HR_SECRETS_KEY to .env (see .env.example)
docker compose up -d --build hr-postgres hr-api hr-worker     # hr-api runs migrations on start
docker compose up -d --build auth-service                      # picks up the new HR permissions
docker compose up -d --build --no-deps gateway                 # HR routes + rate limit
curl localhost:8010/api/v1/hr/health
```

**Rollback**: frontend — revert `App.tsx` to mount the old `HRMS` component (still in the repo)
and drop `my_hr`; backend — stop `hr-api hr-worker`, remove the HR `location` blocks from
`gateway/nginx.conf`; schema — `pg_dump hospai_hr`, then `alembic downgrade <rev>`. auth-service
permission additions are additive and harmless to leave.

**Data migration** from the old Node HRMS (`app/tools/migrate_legacy.py`, dry run by default,
idempotent, through the normal services). On 2026-11-02 the legacy DB held 13 departments and
0 employees/attendance/leave/payroll; dry run: would create 13 departments, 0 errors — **not
committed**, left for you to decide:

```bash
docker run --rm --network keppler-backend_default --add-host host.docker.internal:host-gateway \
  -e HR_DATABASE_URL=postgresql+psycopg://hr_app:$HR_APP_DB_PASSWORD@hr-postgres:5432/hospai_hr \
  -e HR_SECRETS_KEY=$HR_SECRETS_KEY -e REDIS_URL=redis://redis:6379/2 \
  -e LEGACY_DATABASE_URL=postgresql+psycopg://postgres:<pw>@host.docker.internal:5434/hospai_enterprise \
  keppler-backend-hr-api python -m app.tools.migrate_legacy --tenant-code hosp-default [--commit]
```

### Demo data

`app/tools/seed_demo.py` builds a realistic demo hospital in one tenant through the normal services:
2 branches, 13 departments, 18 designations, 65 staff with managers and registrations (some
expiring), 4 shifts and 5 weeks of published rosters, ~4,400 biometric punches (from a
labelled *simulator* integration) with realistic lateness, absences, missed punches and
overtime → calculated attendance; leave types, policies and requests (approved and pending),
approved overtime, payroll setup with **DEMO statutory values** and a finalized October run,
a recruitment pipeline, training certificates with gaps, a review cycle, staffing
requirements, announcements and grievances. It refuses to run on a tenant that already has
employees. The demo nurse login (backend user `staff`) is linked to an ICU staff nurse so My HR
shows real data.

```bash
docker compose exec hr-api python -m app.tools.seed_demo --tenant-code hosp-default
# remove it again (keeps tenants and the migration marker):
docker exec -i keppler-backend-hr-postgres-1 psql -U hr_owner -d hospai_hr <<'SQL'
DO $$ DECLARE t text; BEGIN
  SELECT string_agg(quote_ident(tablename), ', ') INTO t FROM pg_tables
   WHERE schemaname='public' AND tablename NOT IN ('tenants','alembic_version');
  EXECUTE 'TRUNCATE ' || t || ' CASCADE'; END $$;
SQL
```

## 11. Known limitations

- eSSL contract unverified against a live server (§5); no ADMS push endpoint.
- Device "online" = the server returned data for that serial on the last sync.
- Income tax (TDS) is entered as a payroll adjustment; no tax computation engine.
- Payslips print from the browser; no server-side PDF.
- Scheduled reports are delivered in-app, not by email (no mail service in the stack).
- No forced password change for HMS logins created at onboarding (auth-service lacks it).
- Branch/department-scoped HR permissions not implemented.
- On-duty strips appear only after departments are mapped to HMS modules.
- The old Node HRMS server (`server/`, :8011) still starts with `npm run dev` and `App.tsx` still
  imports its store for unrelated widgets, producing the pre-existing 401s; retire it once
  you have migrated (or chosen not to migrate) its data.

## 12. Outstanding tasks

1. Point an integration at the real eSSL server; verify GetTransactionsLog; enable AddEmployee if its WSDL contract is confirmed.
2. Enter statutory settings (PF/ESI/PT/overtime) from the hospital's current notifications.
3. Decide on the legacy migration (`--commit`) and then retire `server/` and its `dev.mjs` start-up.
4. Map departments to HMS modules and census wards.
5. Production: TLS at the edge, secrets in a vault, backups for `hr_postgres_data` and `hr_documents`, monitoring of `attendance.sync.failed` / `hr.access.sync_failed` events.
6. k6 at production data volume; CI wiring for `run_tests.sh`, Newman and ZAP.
