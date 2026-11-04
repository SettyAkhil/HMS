# HospAI Backend Architecture

## Design Pattern
- API layer: each domain lives in its own Flask Blueprint under `backend/modules/<name>/routes.py`
  (patients, billing, pharmacy, hr, beds, op, documents, emr, whatsapp, accounts, reports,
  symptom_ai, ocr_portal, bulk_import, queue, appointments, admin, auth, dashboard, ai_exports,
  audit) -- all registered onto the app in `backend/app.py`, which itself stays a thin
  composition root (app factory, blueprint registration, a handful of shared helpers like
  `require_permissions`/`current_hospital_id`/`log_audit_event`).
- Service/data layer: `backend/utils/database.py` holds all SQL and domain data-access
  functions, grouped by module. Route handlers call these rather than writing SQL inline.
- AI layer: `backend/ai/service.py` is the only module business routes import for OCR/LLM
  work -- it wraps the configured provider (`backend/ai/vllm_provider.py`, local vLLM only,
  no cloud LLM). Every generator function follows a `_try_generate()` -> `None`-on-failure
  pattern; callers must treat `None` as "AI unavailable," never fabricate a fallback.
- Security layer: `backend/core/auth.py` centralizes password hashing, session lifecycle,
  and RBAC. Access control is *not* a fixed role table -- it's `user_type` (`admin` | `normal`)
  plus a `module_access` array stored per user, where each entry is either a bare module key
  (full access to that module) or a dotted `module.subitem` key narrowing it to one specific
  action (see `SUB_MODULES`). `get_permissions()` expands that into the actual permission
  strings routes check via `@require_permissions(...)`.
- Cross-cutting concerns:
  - RBAC via `require_permissions` / `require_session` (`backend/app.py`).
  - Multi-tenancy: `current_hospital_id()` resolves the requesting hospital from the session;
    every query on a table that has a `hospital_id` column must filter by it explicitly --
    there is no automatic tenant scoping. A handful of child tables (documents, admissions,
    clinical_notes, patient_vitals, diagnosis_records, certificates, etc.) have no
    `hospital_id` column of their own; routes touching them scope safety through the parent
    `patient_id`, verified against the requesting hospital first.
  - Audit logging via `log_audit_event` + the `audit_logs` table.
  - Input validation via `validate_required_fields`.
  - CSRF: enforced on every non-GET request that carries a session cookie
    (`backend/app.py`'s `csrf_protect` before-request hook), via a double-submit
    `X-CSRF-Token` header matched against the `csrf_token` cookie.

## Adding a new module
1. Create `backend/modules/<name>/routes.py` with a `Blueprint`, register it in `app.py`.
2. Put any new tables/queries in `backend/utils/database.py`, not inline in the route file.
3. Gate every route with `@require_permissions("<module>.read")` (or a more specific
   permission) -- never `@require_session` alone unless the action is genuinely fine for
   any authenticated user.
4. If the module should be assignable to non-admin users, add it to `ASSIGNABLE_MODULES` /
   `MODULE_BASE_PERMISSION` (and `SUB_MODULES` if it has finer-grained actions) in
   `backend/core/auth.py`, **and** add a matching entry to `MODULE_OPTIONS` / `SUB_MODULES`
   in `frontend/src/lib/constants.ts` (kept in the same order as the sidebar's own
   grouping -- Overview -> OP Management -> Operations -> AI -> Finance -> Administration).
5. Wire the corresponding page into the sidebar: an entry in `NAV_ITEMS`
   (`frontend/src/lib/constants.ts`) plus a lazy import and a `page === "..."` render
   block in `frontend/src/App.tsx`. A module that's grantable in RBAC but has no nav
   entry/page is a real bug, not a stub -- it looks like a checkbox that does nothing.
