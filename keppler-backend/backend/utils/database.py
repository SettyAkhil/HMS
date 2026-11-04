import os
import json
import math
import re
import uuid as uuid_lib
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager

from .embeddings import (
    generate_embedding,
    cosine_similarity,
    encode_vector,
    decode_vector,
    VLLM_EMBEDDING_MODEL,
)

from dotenv import load_dotenv

try:
    import psycopg2
    from psycopg2 import pool as psycopg2_pool
    from psycopg2.extras import DictCursor
except Exception:
    psycopg2 = None
    psycopg2_pool = None
    DictCursor = None

try:
    import psycopg
except Exception:
    psycopg = None

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=False)
DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))
DEFAULT_HOSPITAL_CODE = (
    (os.getenv("DEFAULT_HOSPITAL_CODE") or "hosp-default").strip().lower()
)


def current_ist_datetime():
    return datetime.now(IST_TIMEZONE)


def current_ist_timestamp():
    return current_ist_datetime().isoformat(timespec="seconds")


def normalize_hospital_code(code):
    value = (code or DEFAULT_HOSPITAL_CODE).strip().lower()
    return value or DEFAULT_HOSPITAL_CODE


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if "connect_timeout" not in url:
        sep = "&" if "?" in url else "?"
        url += f"{sep}connect_timeout=5"
    return url


def _to_sql_params(sql: str):
    return sql.replace("?", "%s")


_PG_POOL = None
_PG_POOL_MINCONN = int(os.getenv("PG_POOL_MIN", "1"))
_PG_POOL_MAXCONN = int(os.getenv("PG_POOL_MAX", "20"))


def _get_pg_pool():
    global _PG_POOL
    if _PG_POOL is None:
        try:
            _PG_POOL = psycopg2_pool.ThreadedConnectionPool(
                _PG_POOL_MINCONN,
                _PG_POOL_MAXCONN,
                _normalize_database_url(DATABASE_URL),
                cursor_factory=DictCursor,
            )
        except Exception:
            _PG_POOL = None
            raise
    return _PG_POOL


@contextmanager
def get_connection(autocommit: bool = False):
    if psycopg2 is not None:
        pool = _get_pg_pool()
        conn = None
        for attempt in range(3):
            try:
                conn = pool.getconn()
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                conn.rollback()
                break
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                if conn:
                    pool.putconn(conn, close=True)
                    conn = None
                if attempt == 2:
                    raise

        if not conn:
            raise RuntimeError("Failed to get a working connection from pool")

        conn.autocommit = autocommit
        try:
            yield _CompatConnection(conn)
        except Exception:
            if not autocommit:
                try:
                    conn.rollback()
                except (psycopg2.OperationalError, psycopg2.InterfaceError):
                    pass
            raise
        finally:
            pool.putconn(conn)
        return
    elif psycopg is not None:
        conn = psycopg.connect(_normalize_database_url(DATABASE_URL))
        if autocommit:
            conn.autocommit = True
        try:
            yield _CompatConnection(conn)
        finally:
            conn.close()
        return
    else:
        raise RuntimeError(
            "PostgreSQL driver missing for DATABASE_URL. "
            "Install dependencies with `pip install -r backend/requirements.txt`"
        )


class _CompatConnection:
    def __init__(self, conn):
        self._conn = conn

    def cursor(self):
        return _CompatCursor(self._conn.cursor())

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        return self._conn.rollback()

    def execute(self, query, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def __getattr__(self, name):
        return getattr(self._conn, name)


class _CompatCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, query, params=None):
        sql = _to_sql_params(query)
        if params is None:
            return self._cursor.execute(sql)
        return self._cursor.execute(sql, params)

    def executemany(self, query, seq_of_params):
        sql = _to_sql_params(query)
        return self._cursor.executemany(sql, seq_of_params)

    def fetchone(self):
        return self._wrap_row(self._cursor.fetchone())

    def fetchall(self):
        return [self._wrap_row(row) for row in self._cursor.fetchall()]

    @property
    def lastrowid(self):
        try:
            self._cursor.execute("SELECT lastval()")
            val = self._cursor.fetchone()
            return val[0] if val else None
        except Exception:
            # If lastval() fails (e.g. no sequence was touched), safely ignore
            pass
        return getattr(self._cursor, "lastrowid", None)

    @property
    def rowcount(self):
        return self._cursor.rowcount

    def _wrap_row(self, row):
        if row is None:
            return row
        if hasattr(row, "keys"):
            return row
        description = getattr(self._cursor, "description", None) or []
        columns = [col[0] for col in description]
        if not columns:
            return row
        return _RowProxy(row, columns)

    def __getattr__(self, name):
        return getattr(self._cursor, name)


class _RowProxy:
    def __init__(self, values, columns):
        self._values = tuple(values)
        self._columns = tuple(columns)
        self._index = {name: idx for idx, name in enumerate(self._columns)}

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return self._values[self._index[key]]

    def get(self, key, default=None):
        if key not in self._index:
            return default
        return self._values[self._index[key]]

    def items(self):
        return [(name, self._values[idx]) for idx, name in enumerate(self._columns)]

    def keys(self):
        return self._columns

    def __iter__(self):
        return iter(self.items())


def resolve_hospital_id(hospital_code=None):
    code = normalize_hospital_code(hospital_code)
    hospital = get_hospital_by_code(code)
    if hospital:
        return hospital["id"]
    hospital_id, _created = create_hospital(code)
    return hospital_id


def get_hospital_by_code(hospital_code):
    code = normalize_hospital_code(hospital_code)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM hospitals WHERE code = ?", (code,))
        return cursor.fetchone()


def create_hospital(hospital_code, name=None):
    code = normalize_hospital_code(hospital_code)
    hospital_name = (
        name or code.replace("-", " ").title()
    ).strip() or "Default Hospital"
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM hospitals WHERE code = ?", (code,))
        existing = cursor.fetchone()
        if existing:
            return existing["id"], False
        cursor.execute(
            """
            INSERT INTO hospitals (code, name, status)
            VALUES (?, ?, 'active')
            RETURNING id
            """,
            (code, hospital_name),
        )
        hospital_id = cursor.fetchone()[0]
        conn.commit()
        return hospital_id, True


def list_hospitals():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, code, name, status, disabled_at, disabled_reason, created_at
            FROM hospitals
            ORDER BY created_at DESC, id DESC
            """)
        return cursor.fetchall()


def set_hospital_status(hospital_code, status, reason=None):
    status_value = (status or "").strip().lower()
    if status_value not in ("active", "inactive"):
        raise ValueError("status must be 'active' or 'inactive'")
    code = normalize_hospital_code(hospital_code)
    with get_connection() as conn:
        cursor = conn.cursor()
        if status_value == "inactive":
            cursor.execute(
                """
                UPDATE hospitals
                SET status = ?, disabled_at = CURRENT_TIMESTAMP, disabled_reason = ?
                WHERE code = ?
                """,
                (status_value, reason, code),
            )
        else:
            cursor.execute(
                """
                UPDATE hospitals
                SET status = ?, disabled_at = NULL, disabled_reason = NULL
                WHERE code = ?
                """,
                (status_value, code),
            )
        changed = cursor.rowcount > 0
        if changed and status_value == "inactive":
            cursor.execute(
                """
                DELETE FROM sessions
                WHERE hospital_id = (SELECT id FROM hospitals WHERE code = ?)
                """,
                (code,),
            )
        conn.commit()
        return changed


def init_database():
    # Runs dozens of independent, idempotent (IF NOT EXISTS-guarded) DDL statements.
    # Autocommit so each one lands immediately rather than sitting in one giant
    # multi-minute uncommitted transaction -- against a remote/serverless Postgres
    # (e.g. Neon) a long-held transaction is prone to dropping mid-way, and every
    # such drop previously left an "idle in transaction" session wedged on a table
    # lock that blocked every subsequent retry until manually killed.
    with get_connection(autocommit=True) as conn:
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hospitals (
                id SERIAL PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                disabled_at TIMESTAMP,
                disabled_reason TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_feedback (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER,
                emr_id INTEGER,
                rating INTEGER,
                comment TEXT,
                status TEXT DEFAULT 'New',
                received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                whatsapp_message_id TEXT,
                phone_number TEXT
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS whatsapp_templates (
                id SERIAL PRIMARY KEY,
                template_key TEXT UNIQUE NOT NULL,
                content TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('employee', 'staff')),
                access_role TEXT DEFAULT 'receptionist' CHECK(access_role IN ('receptionist', 'clinician', 'hr_manager', 'owner')),
                user_type TEXT DEFAULT 'normal' CHECK(user_type IN ('admin', 'normal')),
                module_access TEXT DEFAULT '[]',
                job_role TEXT,
                full_name TEXT,
                email TEXT,
                phone TEXT,
                department TEXT,
                employee_id TEXT UNIQUE,
                date_joined TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
                address TEXT,
                emergency_contact TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id SERIAL PRIMARY KEY,
                patient_id TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                middle_name TEXT,
                last_name TEXT NOT NULL,
                dob DATE,
                age INTEGER,
                weight REAL,
                height REAL,
                gender TEXT,
                pregnant INTEGER DEFAULT 0,
                allergies TEXT,
                symptoms TEXT,
                phone TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admissions (
                id SERIAL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                admission_date TIMESTAMP NOT NULL,
                discharge_date DATE,
                notes TEXT,
                FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                patient_id TEXT NOT NULL,
                admission_id INTEGER,
                doc_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_name TEXT,
                mime_type TEXT,
                file_data BYTEA,
                ocr_text TEXT,
                ocr_language TEXT DEFAULT 'en',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
                FOREIGN KEY (admission_id) REFERENCES admissions(id)
            )
            """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS whatsapp_media (
                token TEXT PRIMARY KEY,
                content BYTEA NOT NULL,
                mime_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """)
        ensure_hospital_columns(conn)
        ensure_patient_columns(conn)
        ensure_patient_id_generation(conn)
        ensure_user_columns(conn)
        ensure_document_columns(conn)
        ensure_hospai_module_tables(conn)
        ensure_er_tables(conn)
        ensure_financial_hospital_columns(conn)
        ensure_operational_audit_columns(conn)
        ensure_vector_store_tables(conn)
        ensure_symptom_ai_tables(conn)
        ensure_ocr_portal_tables(conn)
        ensure_pharmacy_prescriptions_tables(conn)
        ensure_emr_tables(conn)
        ensure_icu_tables(conn)
        ensure_clinical_tables(conn)
        ensure_ot_tables(conn)
        ensure_patient_bulk_columns(conn)
        ensure_bulk_import_jobs_table(conn)
        ensure_whatsapp_settings_table(conn)
        ensure_whatsapp_broadcasts_table(conn)
        ensure_patient_messages_table(conn)
        ensure_bed_management_columns(conn)
        ensure_admission_care_columns(conn)
        ensure_bed_transfer_columns(conn)
        ensure_appointment_timestamp_columns(conn)
        ensure_pharmacy_hospital_columns(conn)
        ensure_bed_billing_columns(conn)
        ensure_op_tables(conn)

        # General ledger (billing-service's accounts module). Imported here, not at
        # module top, so utils.database keeps no import-time dependency on modules/.
        from modules.accounts.schema import ensure_gl_tables

        ensure_gl_tables(conn)

        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_hospitals_code ON hospitals(code)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_patient_id ON patients(patient_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_patient_phone ON patients(phone)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_patient_name ON patients(name, last_name)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)"
        )

        conn.commit()


def ensure_hospital_columns(conn):
    cursor = conn.cursor()

    id_type = "SERIAL PRIMARY KEY"
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS hospitals (
            id {id_type},
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            disabled_at TIMESTAMP,
            disabled_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        """
        INSERT INTO hospitals (code, name, status)
        VALUES (?, ?, 'active')
        ON CONFLICT (code) DO NOTHING
        """,
        (DEFAULT_HOSPITAL_CODE, "Default Hospital"),
    )
    cursor.execute("SELECT id FROM hospitals WHERE code = ?", (DEFAULT_HOSPITAL_CODE,))
    default_row = cursor.fetchone()
    if not default_row:
        return
    default_hospital_id = default_row[0]

    for table_name in ("users", "sessions", "patients", "admissions", "documents"):
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = ? AND column_name = 'hospital_id'
            """,
            (table_name,),
        )
        has_hospital_col = cursor.fetchone() is not None
        if not has_hospital_col:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN hospital_id INTEGER")

        cursor.execute(
            f"UPDATE {table_name} SET hospital_id = ? WHERE hospital_id IS NULL",
            (default_hospital_id,),
        )


# Tables that identify a patient only by their (per-hospital, not globally
# unique) patient_id string -- generate_patient_id() resets its sequence per
# hospital_id, so two different hospitals can produce the identical
# "PAT-YYYYMMDD-NNNN" on the same day. Without their own hospital_id, every
# aggregate/list query on these tables risks silently merging two different
# patients' billing/lab/pharmacy records if their hospitals collide on an id.
_FINANCIAL_TABLES_WITH_PATIENT_ID = (
    "appointments",
    "invoices",
    "diagnostics",
    "pharmacy_sales",
    "encounters",
    "patient_consents",
)


def ensure_financial_hospital_columns(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM hospitals WHERE code = ?", (DEFAULT_HOSPITAL_CODE,))
    default_row = cursor.fetchone()
    if not default_row:
        return
    default_hospital_id = default_row[0]

    for table_name in _FINANCIAL_TABLES_WITH_PATIENT_ID:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = ? AND column_name = 'hospital_id'
            """,
            (table_name,),
        )
        has_hospital_col = cursor.fetchone() is not None
        if not has_hospital_col:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN hospital_id INTEGER")

        # Backfill from the owning patient's hospital where possible -- a blind
        # default would silently mix data if this table already holds rows
        # from more than one hospital.
        cursor.execute(f"""
            UPDATE {table_name}
            SET hospital_id = (
                SELECT p.hospital_id FROM patients p WHERE p.patient_id = {table_name}.patient_id
            )
            WHERE hospital_id IS NULL
            """)
        cursor.execute(
            f"UPDATE {table_name} SET hospital_id = ? WHERE hospital_id IS NULL",
            (default_hospital_id,),
        )

    # invoice_payments has no patient_id of its own -- backfill through the invoice it belongs to.
    cursor.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'invoice_payments' AND column_name = 'hospital_id'
        """)
    payments_has_hospital_col = cursor.fetchone() is not None
    if not payments_has_hospital_col:
        cursor.execute("ALTER TABLE invoice_payments ADD COLUMN hospital_id INTEGER")

    cursor.execute("""
        UPDATE invoice_payments
        SET hospital_id = (
            SELECT i.hospital_id FROM invoices i WHERE i.id = invoice_payments.invoice_id
        )
        WHERE hospital_id IS NULL
        """)
    cursor.execute(
        "UPDATE invoice_payments SET hospital_id = ? WHERE hospital_id IS NULL",
        (default_hospital_id,),
    )

    conn.commit()


def ensure_department_master_scope(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM hospitals WHERE code = ?", (DEFAULT_HOSPITAL_CODE,))
    default_row = cursor.fetchone()
    if not default_row:
        return
    default_hospital_id = default_row[0]

    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'department_master'
        """)
    columns = {row[0] for row in cursor.fetchall()}
    if "hospital_id" not in columns:
        cursor.execute("ALTER TABLE department_master ADD COLUMN hospital_id INTEGER")
    cursor.execute(
        "UPDATE department_master SET hospital_id = ? WHERE hospital_id IS NULL",
        (default_hospital_id,),
    )
    cursor.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_department_master_hospital_name
        ON department_master(hospital_id, department_name)
        """)

    # No longer seed default departments here as per user request.
    # Departments should only be created explicitly by admin or inferred from employee directory.
    return

    cursor.execute("PRAGMA table_info(department_master)")
    columns_info = cursor.fetchall()
    columns = {row[1] for row in columns_info}
    cursor.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='department_master'"
    )
    table_row = cursor.fetchone()
    table_sql = (table_row[0] or "").lower() if table_row else ""
    has_legacy_global_unique = "department_name text unique" in table_sql

    needs_rebuild = "hospital_id" not in columns or has_legacy_global_unique
    if needs_rebuild:
        old_hospital_expr = "hospital_id" if "hospital_id" in columns else "NULL"
        old_head_expr = (
            "mapped_head_employee_id"
            if "mapped_head_employee_id" in columns
            else "NULL"
        )
        old_created_expr = (
            "created_at" if "created_at" in columns else "CURRENT_TIMESTAMP"
        )
        id_type = "SERIAL PRIMARY KEY"
        cursor.execute("ALTER TABLE department_master RENAME TO department_master_old")
        cursor.execute(f"""
            CREATE TABLE department_master (
                id {id_type},
                hospital_id INTEGER NOT NULL,
                department_name TEXT NOT NULL,
                mapped_head_employee_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(hospital_id, department_name)
            )
            """)
        insert_conflict = "ON CONFLICT DO NOTHING"
        insert_prefix = "INSERT INTO"
        cursor.execute(
            f"""
            {insert_prefix} department_master (
                id, hospital_id, department_name, mapped_head_employee_id, created_at
            )
            SELECT
                id,
                COALESCE({old_hospital_expr}, ?),
                department_name,
                {old_head_expr},
                {old_created_expr}
            FROM department_master_old
            {insert_conflict}
            """,
            (default_hospital_id,),
        )
        cursor.execute("DROP TABLE department_master_old")
    else:
        cursor.execute(
            "UPDATE department_master SET hospital_id = ? WHERE hospital_id IS NULL",
            (default_hospital_id,),
        )

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_department_master_hospital ON department_master(hospital_id)"
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_department_master_hospital_name ON department_master(hospital_id, department_name)"
    )

    # Seed standard multi-specialty hospital departments
    standard_departments = [
        "Cardiology",
        "Neurology",
        "Orthopedics",
        "General Medicine",
        "Pediatrics",
        "Gynecology",
        "Dermatology",
        "Oncology",
        "ENT",
        "Ophthalmology",
        "Psychiatry",
        "Urology",
        "Gastroenterology",
        "Pulmonology",
        "Endocrinology",
        "Nephrology",
        "Rheumatology",
        "General Surgery",
    ]

    insert_conflict = "ON CONFLICT DO NOTHING"
    insert_prefix = "INSERT INTO"

    for dept in standard_departments:
        cursor.execute(
            f"""
            {insert_prefix} department_master (hospital_id, department_name)
            VALUES (?, ?) {insert_conflict}
            """,
            (default_hospital_id, dept),
        )


def ensure_patient_columns(conn):
    cursor = conn.cursor()
    _ensure_column(cursor, "patients", "address", "TEXT")
    _ensure_column(cursor, "patients", "blood_group", "TEXT")
    _ensure_column(cursor, "patients", "emergency_contact", "TEXT")
    _ensure_column(cursor, "patients", "aadhar_number", "TEXT")
    _ensure_column(cursor, "patients", "registration_source", "TEXT DEFAULT 'outpatient'")
    _ensure_column(cursor, "patients", "patient_type", "TEXT DEFAULT 'regular'")


def ensure_patient_id_generation(conn):
    """generate_patient_id() used to scan for the next number per hospital
    with no locking -- two concurrent registrations for the same hospital
    could read the same max and collide on insert. patients.patient_id is
    also GLOBALLY unique (not per-hospital) -- and that turned out to be
    unsafe to change: admissions, documents, medical_history, clinical_notes,
    patient_vitals, diagnosis_records, and emr_access_logs all carry a
    FOREIGN KEY against patients(patient_id) that depends on it staying a
    single-column unique key (confirmed by a DependentObjectsStillExist error
    when this was tried). So instead of touching that constraint, this makes
    id generation itself race-free and globally unique by construction: one
    Postgres SEQUENCE shared by every hospital, seeded once from whatever's
    already been issued so no existing id is ever re-used."""
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pg_sequences WHERE sequencename = 'patient_id_seq'")
    if cursor.fetchone() is None:
        cursor.execute(
            "SELECT MAX(CAST(SUBSTR(patient_id, 5) AS INTEGER)) FROM patients "
            "WHERE patient_id LIKE 'PAT-1%'"
        )
        row = cursor.fetchone()
        seed = int(row[0]) if row and row[0] else 100000
        cursor.execute(f"CREATE SEQUENCE patient_id_seq START WITH {seed + 1}")


def ensure_user_columns(conn):
    """Add any missing columns to users table for older databases."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'users'
        """)
    existing = {row[0] for row in cursor.fetchall()}
    expected = {
        "hospital_id": "INTEGER",
        "username": "TEXT",
        "password_hash": "TEXT",
        "role": "TEXT",
        "access_role": "TEXT DEFAULT 'receptionist'",
        "user_type": "TEXT DEFAULT 'normal'",
        "module_access": "TEXT DEFAULT '[]'",
        "job_role": "TEXT",
        "full_name": "TEXT",
        "email": "TEXT",
        "phone": "TEXT",
        "department": "TEXT",
        "employee_id": "TEXT",
        "date_joined": "TIMESTAMP",
        "status": "TEXT DEFAULT 'active'",
        "address": "TEXT",
        "emergency_contact": "TEXT",
        "created_at": "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        "password_changed_at": "TIMESTAMP",
    }
    for column, col_type in expected.items():
        if column not in existing:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {column} {col_type}")
    cursor.execute("UPDATE users SET status='active' WHERE status IS NULL")
    cursor.execute("""
        UPDATE users
        SET access_role = CASE
            WHEN role = 'employee' THEN 'owner'
            WHEN role = 'staff' THEN 'receptionist'
            ELSE 'receptionist'
        END
        WHERE access_role IS NULL OR TRIM(access_role) = ''
    """)
    cursor.execute("""
        UPDATE users
        SET user_type = CASE
            WHEN access_role IN ('owner', 'hr_manager') THEN 'admin'
            WHEN role = 'employee' THEN 'admin'
            ELSE 'normal'
        END
        WHERE user_type IS NULL OR TRIM(user_type) = ''
    """)
    default_modules_normal = json.dumps(
        ["dashboard", "patients", "symptom_ai"], separators=(",", ":")
    )
    default_modules_admin = json.dumps(
        [
            "dashboard",
            "patients",
            "billing",
            "pharmacy",
            "lab",
            "hrms",
            "ot",
            "accounts",
            "reports",
            "symptom_ai",
        ],
        separators=(",", ":"),
    )
    cursor.execute(
        """
        UPDATE users
        SET module_access = CASE
            WHEN user_type = 'admin' THEN ?
            ELSE ?
        END
        WHERE module_access IS NULL OR TRIM(module_access) = ''
    """,
        (default_modules_admin, default_modules_normal),
    )


def ensure_document_columns(conn):
    """Add any missing document storage columns for older databases."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'documents'
        """)
    existing = {row[0] for row in cursor.fetchall()}
    if "file_name" not in existing:
        cursor.execute("ALTER TABLE documents ADD COLUMN file_name TEXT")
    if "mime_type" not in existing:
        cursor.execute("ALTER TABLE documents ADD COLUMN mime_type TEXT")
    if "file_data" not in existing:
        cursor.execute("ALTER TABLE documents ADD COLUMN file_data BYTEA")
    if "structured_data" not in existing:
        cursor.execute("ALTER TABLE documents ADD COLUMN structured_data TEXT")


def ensure_hospai_module_tables(conn):
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS encounters (
            id {id_column},
            patient_id TEXT NOT NULL,
            encounter_type TEXT NOT NULL CHECK(encounter_type IN ('OP', 'IP')),
            arrival_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            insurance_provider TEXT,
            insurance_policy_no TEXT,
            is_accident INTEGER DEFAULT 0,
            referral_source TEXT,
            referral_name TEXT,
            status TEXT DEFAULT 'active',
            created_by TEXT
        )
        """)
    _ensure_column(cursor, "encounters", "appointment_id", "INTEGER")
    _ensure_column(cursor, "encounters", "hospital_id", "INTEGER")
    _ensure_column(cursor, "encounters", "op_number", "INTEGER")
    _ensure_column(cursor, "encounters", "chief_complaint", "TEXT")
    _ensure_column(cursor, "encounters", "symptoms", "TEXT")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS bed_allocations (
            id {id_column},
            admission_id INTEGER NOT NULL,
            patient_id TEXT NOT NULL,
            ward TEXT,
            room_no TEXT,
            bed_no TEXT,
            allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            released_at TIMESTAMP,
            status TEXT DEFAULT 'active'
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS medication_schedules (
            id {id_column},
            patient_id TEXT NOT NULL,
            medicine_name TEXT NOT NULL,
            dosage TEXT,
            schedule_time TIMESTAMP NOT NULL,
            administered INTEGER DEFAULT 0,
            alert_enabled INTEGER DEFAULT 1,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS observation_notes (
            id {id_column},
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            doctor_name TEXT,
            note TEXT NOT NULL,
            treatment_plan TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    # Distinguishes a doctor's evaluation from a nurse's round -- both share
    # this one table (there's no separate nurse_notes table), so the
    # discharge summary and the chart's Day-wise feed need this to label
    # entries correctly instead of lumping every author together.
    _ensure_column(cursor, "observation_notes", "role", "TEXT")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS patient_movements (
            id {id_column},
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            from_department TEXT,
            to_department TEXT NOT NULL,
            moved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            moved_by TEXT
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS invoices (
            id {id_column},
            invoice_no TEXT UNIQUE NOT NULL,
            patient_id TEXT,
            module TEXT NOT NULL CHECK(module IN ('OP', 'IP', 'LAB', 'PHARMACY')),
            doctor_name TEXT,
            clinic_name TEXT,
            referral_source TEXT,
            subtotal REAL DEFAULT 0,
            tax REAL DEFAULT 0,
            discount REAL DEFAULT 0,
            total_amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            due_amount REAL DEFAULT 0,
            payment_status TEXT DEFAULT 'due' CHECK(payment_status IN ('paid', 'partial', 'due', 'refunded')),
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'invoices'
        """)
    invoice_columns = {row[0] for row in cursor.fetchall()}
    if "advance_amount" not in invoice_columns:
        cursor.execute("ALTER TABLE invoices ADD COLUMN advance_amount REAL DEFAULT 0")
    if "refunded_amount" not in invoice_columns:
        cursor.execute("ALTER TABLE invoices ADD COLUMN refunded_amount REAL DEFAULT 0")
    if "appointment_id" not in invoice_columns:
        cursor.execute("ALTER TABLE invoices ADD COLUMN appointment_id INTEGER")
    if "encounter_id" not in invoice_columns:
        cursor.execute("ALTER TABLE invoices ADD COLUMN encounter_id INTEGER")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS invoice_payments (
            id {id_column},
            invoice_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_mode TEXT NOT NULL CHECK(payment_mode IN ('cash', 'card', 'upi', 'bank')),
            gateway_ref TEXT,
            converted_from_mode TEXT,
            converted_to_mode TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    # Line-item detail per invoice -- `invoices` itself only ever had aggregate
    # totals, so there was nowhere to record what a bill's total was actually
    # made of (service/category, insurance-covered vs patient-payable split).
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS invoice_items (
            id {id_column},
            invoice_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            category TEXT,
            cpt_code TEXT,
            quantity REAL DEFAULT 1,
            unit_price REAL DEFAULT 0,
            total REAL DEFAULT 0,
            insurance_covered REAL DEFAULT 0,
            patient_payable REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS insurance_claims (
            id {id_column},
            invoice_id INTEGER NOT NULL,
            patient_id TEXT,
            insurer_name TEXT NOT NULL,
            claim_amount REAL NOT NULL,
            approved_amount REAL DEFAULT 0,
            claim_status TEXT NOT NULL DEFAULT 'submitted' CHECK(claim_status IN ('submitted', 'under_review', 'approved', 'rejected', 'settled')),
            external_ref TEXT,
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS pharmacy_inventory (
            id {id_column},
            medicine_name TEXT NOT NULL,
            batch_no TEXT,
            quantity INTEGER NOT NULL DEFAULT 0,
            reorder_level INTEGER DEFAULT 10,
            unit_price REAL DEFAULT 0,
            expiry_date DATE,
            stock_condition TEXT DEFAULT 'proper' CHECK(stock_condition IN ('proper', 'damaged')),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS pharmacy_sales (
            id {id_column},
            invoice_id INTEGER,
            patient_id TEXT,
            prescription_ref TEXT,
            medicine_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            amount REAL NOT NULL,
            hospital_id INTEGER,
            sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'pharmacy_sales'
        """)
    pharmacy_sales_column_types = {row[0]: row[1] for row in cursor.fetchall()}
    pharmacy_sales_columns = set(pharmacy_sales_column_types)
    if "patient_id" not in pharmacy_sales_columns:
        cursor.execute("ALTER TABLE pharmacy_sales ADD COLUMN patient_id TEXT")
    if "prescription_ref" not in pharmacy_sales_columns:
        cursor.execute("ALTER TABLE pharmacy_sales ADD COLUMN prescription_ref TEXT")
    if "hospital_id" not in pharmacy_sales_columns:
        cursor.execute("ALTER TABLE pharmacy_sales ADD COLUMN hospital_id INTEGER")
    elif pharmacy_sales_column_types.get("hospital_id") != "integer":
        # Repairs databases created before this column's type was fixed from the
        # original (incorrect) TEXT to match hospitals.id/every other table's
        # INTEGER hospital_id -- without this, hospital-scoped queries against
        # pharmacy_sales fail with "operator does not exist: text = integer".
        cursor.execute(
            "ALTER TABLE pharmacy_sales ALTER COLUMN hospital_id TYPE INTEGER USING hospital_id::integer"
        )

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS pharmacy_suppliers (
            id {id_column},
            supplier_name TEXT NOT NULL,
            contact_person TEXT,
            phone TEXT,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS pharmacy_purchases (
            id {id_column},
            supplier_id INTEGER,
            medicine_name TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            unit_cost REAL NOT NULL,
            total_cost REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'ordered' CHECK(status IN ('ordered', 'received', 'cancelled')),
            expected_date DATE,
            received_date DATE,
            stock_applied INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS lab_vendors (
            id {id_column},
            vendor_name TEXT NOT NULL,
            contact_person TEXT,
            phone TEXT,
            status TEXT DEFAULT 'active'
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS diagnostics (
            id {id_column},
            invoice_no TEXT,
            patient_id TEXT,
            vendor_id INTEGER,
            doctor_name TEXT,
            test_name TEXT NOT NULL,
            amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            due_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'due' CHECK(status IN ('paid', 'partial', 'due')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'diagnostics'
        """)
    diagnostic_columns = {row[0] for row in cursor.fetchall()}
    if "sample_barcode" not in diagnostic_columns:
        cursor.execute("ALTER TABLE diagnostics ADD COLUMN sample_barcode TEXT")
    if "order_status" not in diagnostic_columns:
        cursor.execute(
            "ALTER TABLE diagnostics ADD COLUMN order_status TEXT DEFAULT 'ordered'"
        )
    if "collected_at" not in diagnostic_columns:
        cursor.execute("ALTER TABLE diagnostics ADD COLUMN collected_at TIMESTAMP")
    if "reported_at" not in diagnostic_columns:
        cursor.execute("ALTER TABLE diagnostics ADD COLUMN reported_at TIMESTAMP")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS department_master (
            id {id_column},
            hospital_id INTEGER,
            department_name TEXT NOT NULL,
            mapped_head_employee_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(hospital_id, department_name)
        )
        """)
    ensure_department_master_scope(conn)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS attendance (
            id {id_column},
            employee_id TEXT NOT NULL,
            attendance_date DATE NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'leave')),
            in_time TEXT,
            out_time TEXT,
            notes TEXT
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS payroll (
            id {id_column},
            employee_id TEXT NOT NULL,
            payroll_month TEXT NOT NULL,
            basic_salary REAL NOT NULL,
            allowances REAL DEFAULT 0,
            deductions REAL DEFAULT 0,
            net_salary REAL NOT NULL,
            paid_status TEXT DEFAULT 'pending' CHECK(paid_status IN ('pending', 'paid')),
            paid_date DATE
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS leave_requests (
            id {id_column},
            employee_id TEXT NOT NULL,
            leave_type TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            reason TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
            decided_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id {id_column},
            actor_username TEXT,
            action TEXT NOT NULL,
            module_name TEXT NOT NULL,
            entity_key TEXT,
            payload TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS appointments (
            id {id_column},
            patient_id TEXT,
            patient_name TEXT NOT NULL,
            visit_type TEXT NOT NULL CHECK(visit_type IN ('OP', 'IP')),
            department TEXT,
            doctor_name TEXT,
            appointment_date TIMESTAMP NOT NULL,
            token_no INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'checked_in', 'in_consultation', 'completed', 'cancelled')),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'appointments'
        """)
    appointment_columns = {row[0] for row in cursor.fetchall()}
    if "appointment_kind" not in appointment_columns:
        cursor.execute(
            "ALTER TABLE appointments ADD COLUMN appointment_kind TEXT DEFAULT 'new'"
        )
    if "follow_up_for" not in appointment_columns:
        cursor.execute("ALTER TABLE appointments ADD COLUMN follow_up_for INTEGER")
    if "reminder_sent_at" not in appointment_columns:
        cursor.execute("ALTER TABLE appointments ADD COLUMN reminder_sent_at TIMESTAMP")
    if "no_show_marked" not in appointment_columns:
        cursor.execute(
            "ALTER TABLE appointments ADD COLUMN no_show_marked INTEGER DEFAULT 0"
        )
    if "encounter_id" not in appointment_columns:
        cursor.execute("ALTER TABLE appointments ADD COLUMN encounter_id INTEGER")
    if "chief_complaint" not in appointment_columns:
        cursor.execute("ALTER TABLE appointments ADD COLUMN chief_complaint TEXT")
    if "symptoms" not in appointment_columns:
        cursor.execute("ALTER TABLE appointments ADD COLUMN symptoms TEXT")
    if "ai_recommendation" not in appointment_columns:
        cursor.execute("ALTER TABLE appointments ADD COLUMN ai_recommendation TEXT")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS doctor_schedules (
            id {id_column},
            doctor_name TEXT NOT NULL,
            department TEXT,
            schedule_date DATE NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            slot_capacity INTEGER DEFAULT 12,
            status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'full', 'leave')),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS doctors (
            id {id_column},
            doctor_name TEXT NOT NULL,
            department TEXT,
            consultation_fee REAL DEFAULT 0,
            review_fee REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'leave')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS patient_consents (
            id {id_column},
            patient_id TEXT,
            patient_name TEXT NOT NULL,
            consent_type TEXT NOT NULL CHECK(consent_type IN ('general', 'procedure', 'privacy', 'insurance', 'lama', 'dama', 'admission', 'emergency')),
            signed_by TEXT NOT NULL,
            relation_to_patient TEXT,
            status TEXT NOT NULL DEFAULT 'signed' CHECK(status IN ('signed', 'revoked')),
            notes TEXT,
            signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    # Added after patient_consents already existed in earlier dev databases --
    # CREATE TABLE IF NOT EXISTS above is a no-op there, so these need an
    # explicit ALTER for anyone who ran init_database() before this change.
    _ensure_column(cursor, "patient_consents", "er_visit_id", "INTEGER")
    _ensure_column(cursor, "patient_consents", "witness_doctor", "TEXT")
    _ensure_column(cursor, "patient_consents", "signed_by_phone", "TEXT")
    _ensure_column(cursor, "patient_consents", "refusal_reason", "TEXT")
    _ensure_column(cursor, "patient_consents", "legal_waiver_acknowledged", "BOOLEAN DEFAULT FALSE")
    _ensure_column(cursor, "patient_consents", "document_filename", "TEXT")
    _ensure_column(cursor, "patient_consents", "document_mime_type", "TEXT")
    _ensure_column(cursor, "patient_consents", "document_data", "BYTEA")
    cursor.execute(
        "ALTER TABLE patient_consents DROP CONSTRAINT IF EXISTS patient_consents_consent_type_check"
    )
    cursor.execute(
        "ALTER TABLE patient_consents ADD CONSTRAINT patient_consents_consent_type_check "
        "CHECK (consent_type IN ('general', 'procedure', 'privacy', 'insurance', 'lama', 'dama', 'admission', 'emergency'))"
    )

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS insurance_verifications (
            id {id_column},
            patient_id TEXT,
            patient_name TEXT NOT NULL,
            insurer_name TEXT NOT NULL,
            policy_number TEXT,
            member_id TEXT,
            verification_status TEXT NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending', 'verified', 'rejected')),
            coverage_notes TEXT,
            checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS certificates (
            id {id_column},
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            certificate_type TEXT NOT NULL CHECK(certificate_type IN ('discharge_summary', 'medical_certificate', 'insurance_document', 'fit_to_work')),
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            issued_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ot_theatres (
            id {id_column},
            theatre_code TEXT NOT NULL UNIQUE,
            theatre_name TEXT NOT NULL,
            equipment_notes TEXT,
            status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'maintenance', 'occupied')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ot_surgeries (
            id {id_column},
            theatre_id INTEGER NOT NULL,
            patient_id TEXT,
            procedure_name TEXT NOT NULL,
            surgeon_name TEXT NOT NULL,
            scheduled_start TIMESTAMP NOT NULL,
            estimated_duration_hours REAL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
            equipment_required TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS accounts_ledger (
            id {id_column},
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL CHECK(entry_type IN ('income', 'expense', 'adjustment')),
            category TEXT NOT NULL,
            reference_no TEXT,
            counterparty_name TEXT,
            amount REAL NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS vendor_payments (
            id {id_column},
            vendor_name TEXT NOT NULL,
            invoice_ref TEXT,
            amount REAL NOT NULL,
            payment_date DATE NOT NULL,
            payment_mode TEXT NOT NULL CHECK(payment_mode IN ('cash', 'card', 'upi', 'bank')),
            status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('pending', 'partial', 'paid')),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS doctor_payouts (
            id {id_column},
            doctor_name TEXT NOT NULL,
            payout_month TEXT NOT NULL,
            amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            due_amount REAL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'partial', 'paid')),
            paid_date DATE,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_invoice_patient ON invoices(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_invoice_status ON invoices(payment_status)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_claims_invoice ON insurance_claims(invoice_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_claims_status ON insurance_claims(claim_status)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_patient ON pharmacy_sales(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_pharmacy_purchases_supplier ON pharmacy_purchases(supplier_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_diagnostics_patient ON diagnostics(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_leaves_employee ON leave_requests(employee_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_module ON audit_logs(module_name)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status)"
    )
    # get_all_patients/search_patients run a correlated subquery against this
    # table (latest appointment status) for every patient row -- without this
    # index each patients-list request was a full appointments scan per row.
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_appointments_patient_created ON appointments(patient_id, created_at DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_doctor_schedules_date ON doctor_schedules(schedule_date)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor ON doctor_schedules(doctor_name)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_patient_consents_patient ON patient_consents(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_insurance_verifications_patient ON insurance_verifications(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_certificates_patient ON certificates(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_ot_surgeries_theatre ON ot_surgeries(theatre_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_ot_surgeries_status ON ot_surgeries(status)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_accounts_ledger_type ON accounts_ledger(entry_type)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_name)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_doctor_payouts_doctor ON doctor_payouts(doctor_name)"
    )

    cursor.execute("SELECT COUNT(*) FROM doctors")
    doc_count = cursor.fetchone()[0]
    # Intentionally leaving doctors table empty instead of seeding hardcoded misleading names


def ensure_er_tables(conn):
    """ER / Casualty module (Phase 1). Every table here gets hospital_id from
    day one (not the legacy patient_id-trust pattern used by the
    pre-multi-tenancy EMR tables) and is added to OPERATIONAL_TABLES below for
    uuid/audit/soft-delete columns.

    er_triage_config ships with zero seeded rows on purpose -- the hospital's
    own clinical team must author B1-B4-equivalent categories before triage
    can be used; nothing here hardcodes a clinical threshold."""
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"

    cursor.execute("CREATE SEQUENCE IF NOT EXISTS er_visit_seq START 1")

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_visits (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            visit_no TEXT UNIQUE NOT NULL,
            patient_id TEXT,
            is_unknown_patient BOOLEAN DEFAULT FALSE,
            unknown_patient_label TEXT,
            merged_into_patient_id TEXT,
            arrival_mode TEXT,
            brought_by TEXT,
            referral_hospital TEXT,
            police_involved BOOLEAN DEFAULT FALSE,
            condition_at_arrival TEXT,
            conscious_status TEXT,
            arrival_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT NOT NULL DEFAULT 'registered',
            assigned_doctor_name TEXT,
            assigned_specialty TEXT,
            doctor_assigned_at TIMESTAMP,
            doctor_accepted_at TIMESTAMP,
            registered_by TEXT,
            closed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_complaints (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL,
            complaint TEXT NOT NULL,
            severity TEXT,
            start_date DATE,
            start_time TEXT,
            duration TEXT,
            progression TEXT,
            associated_symptoms TEXT,
            source_of_information TEXT,
            reported_by TEXT,
            case_category TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_incident_history (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL UNIQUE,
            incident_type TEXT,
            incident_at TIMESTAMP,
            incident_time_precision TEXT,
            discovered_at TIMESTAMP,
            details_json JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_vitals (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            recorded_by TEXT,
            heart_rate INTEGER,
            bp_systolic INTEGER,
            bp_diastolic INTEGER,
            respiratory_rate INTEGER,
            spo2 INTEGER,
            temperature REAL,
            consciousness_level TEXT,
            blood_glucose REAL,
            pain_score INTEGER,
            gcs INTEGER,
            pupillary_response TEXT,
            notes TEXT
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_triage_config (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            category_code TEXT NOT NULL,
            category_label TEXT NOT NULL,
            description TEXT,
            sort_order INTEGER DEFAULT 0,
            color TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_er_triage_config_code "
        "ON er_triage_config(hospital_id, category_code)"
    )

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_triage (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL UNIQUE,
            category TEXT NOT NULL,
            triage_bed_label TEXT,
            reason TEXT,
            assigned_by TEXT,
            triaged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_treatments (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL,
            intervention_type TEXT NOT NULL,
            description TEXT,
            administered_by TEXT,
            prescribed_by TEXT,
            performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_clinical_notes (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL,
            note_type TEXT NOT NULL DEFAULT 'assessment',
            author TEXT,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_disposition (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL UNIQUE,
            outcome TEXT NOT NULL,
            required_specialty TEXT,
            clinical_reason TEXT NOT NULL,
            decided_by TEXT,
            decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            priority TEXT
        )
        """)

    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS er_bed_requests (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            er_visit_id INTEGER NOT NULL,
            disposition_id INTEGER NOT NULL,
            requested_level_of_care TEXT NOT NULL,
            requested_specialty TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            requested_by TEXT,
            requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            allocated_bed_id INTEGER,
            allocated_admission_id INTEGER,
            allocated_by TEXT,
            allocated_at TIMESTAMP
        )
        """)

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_er_visits_hospital ON er_visits(hospital_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_er_visits_patient ON er_visits(patient_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_er_bed_requests_status ON er_bed_requests(hospital_id, status)"
    )

    # Back-link from a real admission to the ER visit that led to it.
    # assign_patient_to_bed() always mints a fresh admissions row -- this is
    # set afterward by the /bed-requests/<id>/allocate route, not by changing
    # that function.
    _ensure_column(cursor, "admissions", "er_visit_id", "INTEGER")

    # audit_logs predates per-hospital scoping (it wasn't in OPERATIONAL_TABLES
    # when hospital_id was added elsewhere), so without this any audit.read
    # user could see every hospital's rows through /api/audit/logs.
    _ensure_column(cursor, "audit_logs", "hospital_id", "INTEGER")

    # invoices.module's CHECK constraint is declared inline in its CREATE
    # TABLE with no separate ADD CONSTRAINT anywhere, so adding 'ER' isn't a
    # plain _ensure_column-style ALTER -- look up the actual (Postgres
    # auto-generated) constraint name dynamically rather than hardcoding one.
    # Once 'ER' is present in the definition this is permanently a no-op, so
    # it's safe to leave in the boot sequence.
    cursor.execute("""
        SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'invoices' AND con.contype = 'c'
            AND pg_get_constraintdef(con.oid) LIKE '%module%'
        """)
    module_check = cursor.fetchone()
    if module_check and ("'ER'" not in module_check[1] or "'OT'" not in module_check[1]):
        cursor.execute(f"ALTER TABLE invoices DROP CONSTRAINT {module_check[0]}")
        cursor.execute(
            "ALTER TABLE invoices ADD CONSTRAINT invoices_module_check "
            "CHECK (module IN ('OP', 'IP', 'LAB', 'PHARMACY', 'ER', 'OT'))"
        )


# ==================== Schema hardening: uuid + audit/soft-delete columns ====================

# Every operational/domain table (system tables -- hospitals, users, sessions, audit_logs --
# are intentionally excluded; they have their own identity/audit semantics already).
OPERATIONAL_TABLES = (
    "patients",
    "admissions",
    "documents",
    "encounters",
    "bed_allocations",
    "medication_schedules",
    "observation_notes",
    "patient_movements",
    "invoices",
    "invoice_payments",
    "insurance_claims",
    "pharmacy_inventory",
    "pharmacy_sales",
    "pharmacy_suppliers",
    "pharmacy_purchases",
    "lab_vendors",
    "diagnostics",
    "department_master",
    "attendance",
    "payroll",
    "leave_requests",
    "appointments",
    "doctor_schedules",
    "patient_consents",
    "insurance_verifications",
    "certificates",
    "ot_theatres",
    "ot_surgeries",
    "accounts_ledger",
    "vendor_payments",
    "doctor_payouts",
    "er_visits",
    "er_complaints",
    "er_incident_history",
    "er_vitals",
    "er_triage_config",
    "er_triage",
    "er_treatments",
    "er_clinical_notes",
    "er_disposition",
    "er_bed_requests",
)


def _table_columns(cursor, table_name: str) -> set:
    cursor.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = ?",
        (table_name,),
    )
    return {row[0] for row in cursor.fetchall()}


def _ensure_column(cursor, table_name: str, column_name: str, postgres_type: str):
    existing = _table_columns(cursor, table_name)
    if column_name in existing:
        return
    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {postgres_type}")


def soft_delete_row(
    cursor, table_name, id_column, id_value, hospital_id=None, actor=None
):
    """Mark a row deleted_at/deleted_by instead of physically removing it.

    Returns True if a row was updated (i.e. existed and wasn't already deleted).
    """
    where = f"{id_column} = ? AND deleted_at IS NULL"
    params = [id_value]
    if hospital_id is not None:
        where += " AND hospital_id = ?"
        params.append(hospital_id)
    cursor.execute(
        f"UPDATE {table_name} SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? WHERE {where}",
        (actor, *params),
    )
    return cursor.rowcount > 0


def ensure_operational_audit_columns(conn):
    """Add uuid + created_by/updated_by/deleted_by/deleted_at to every operational table.

    Purely additive: existing integer primary keys, foreign keys, and API response shapes
    are untouched. uuid is populated for new rows via a DB-level default/trigger (Postgres
    gen_random_uuid(), SQLite AFTER INSERT trigger) so no INSERT call site needs to change.
    """
    cursor = conn.cursor()

    for table_name in OPERATIONAL_TABLES:
        _ensure_column(cursor, table_name, "uuid", "TEXT")
        _ensure_column(cursor, table_name, "created_by", "TEXT")
        _ensure_column(cursor, table_name, "updated_by", "TEXT")
        _ensure_column(cursor, table_name, "deleted_by", "TEXT")
        _ensure_column(cursor, table_name, "deleted_at", "TIMESTAMP")

        # Backfill uuid for any existing rows (idempotent: only touches NULLs).
        cursor.execute(f"SELECT id FROM {table_name} WHERE uuid IS NULL")
        missing_ids = [row[0] for row in cursor.fetchall()]
        for row_id in missing_ids:
            cursor.execute(
                f"UPDATE {table_name} SET uuid = ? WHERE id = ?",
                (str(uuid_lib.uuid4()), row_id),
            )

        cursor.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS idx_{table_name}_uuid ON {table_name}(uuid)"
        )
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table_name}_deleted_at ON {table_name}(deleted_at)"
        )

        # Native since Postgres 13, no pgcrypto/uuid-ossp extension required.
        cursor.execute(
            f"ALTER TABLE {table_name} ALTER COLUMN uuid SET DEFAULT gen_random_uuid()::text"
        )
    # Composite indexes for common tenant-scoped dashboard/report lookups.
    composite_indexes = [
        ("idx_patients_hospital_created", "patients", "hospital_id, created_at"),
        ("idx_invoices_hospital_status", "invoices", "hospital_id, payment_status"),
        ("idx_invoices_hospital_created", "invoices", "hospital_id, created_at"),
        ("idx_diagnostics_hospital_created", "diagnostics", "hospital_id, created_at"),
        ("idx_pharmacy_sales_hospital_sold", "pharmacy_sales", "hospital_id, sold_at"),
        (
            "idx_appointments_hospital_date",
            "appointments",
            "hospital_id, appointment_date",
        ),
        ("idx_attendance_hospital_date", "attendance", "hospital_id, attendance_date"),
        ("idx_admissions_hospital_date", "admissions", "hospital_id, admission_date"),
    ]
    for index_name, table_name, columns in composite_indexes:
        table_columns = _table_columns(cursor, table_name)
        required_columns = {c.strip() for c in columns.split(",")}
        if not required_columns.issubset(table_columns):
            continue
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name}({columns})"
        )

    conn.commit()


def ensure_vector_store_tables(conn):
    """RAG/vector store for clinical documents (Phase C).

    Vectors are stored as JSON-encoded float arrays and compared via cosine similarity
    in Python -- portable across SQLite and Postgres without requiring the Postgres
    `vector` extension to be pre-installed. See utils/embeddings.py for rationale.
    """
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS clinical_document_embeddings (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            patient_id TEXT,
            source_table TEXT NOT NULL,
            source_id INTEGER NOT NULL,
            content_text TEXT NOT NULL,
            embedding TEXT,
            embedding_model TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_hospital "
        "ON clinical_document_embeddings(hospital_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_source "
        "ON clinical_document_embeddings(source_table, source_id)"
    )

    # Phase H Tables
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS bed_master (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            ward TEXT NOT NULL,
            room_no TEXT NOT NULL,
            bed_no TEXT NOT NULL,
            status TEXT DEFAULT 'Available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS icu_monitoring (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            heart_rate INTEGER,
            blood_pressure TEXT,
            spo2 INTEGER,
            ventilator_active BOOLEAN DEFAULT FALSE,
            critical_alerts TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS opd_queue (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            patient_id TEXT NOT NULL,
            department TEXT NOT NULL,
            doctor_id TEXT,
            token_number INTEGER NOT NULL,
            status TEXT DEFAULT 'Waiting',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS emergency_triage (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            patient_name TEXT NOT NULL,
            age INTEGER,
            gender TEXT,
            priority TEXT NOT NULL,
            chief_complaint TEXT NOT NULL,
            arrival_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Pending'
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ambulances (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            vehicle_number TEXT NOT NULL,
            driver_name TEXT,
            driver_phone TEXT,
            status TEXT DEFAULT 'Available',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ambulance_dispatch (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            ambulance_id INTEGER NOT NULL,
            patient_id TEXT,
            pickup_location TEXT NOT NULL,
            drop_location TEXT NOT NULL,
            dispatch_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completion_time TIMESTAMP,
            status TEXT DEFAULT 'En Route'
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS nurse_shifts (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            nurse_id TEXT NOT NULL,
            ward TEXT NOT NULL,
            shift_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            shift_end TIMESTAMP,
            handover_notes TEXT
        )
        """)
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS nursing_notes (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            patient_id TEXT NOT NULL,
            nurse_id TEXT NOT NULL,
            note TEXT NOT NULL,
            vitals TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_clinical_embeddings_patient "
        "ON clinical_document_embeddings(patient_id)"
    )
    conn.commit()


def ensure_symptom_ai_tables(conn):
    """Personal document vault + chat history for the Symptom AI 'Ask About Your
    Documents' tab -- scoped per hospital + username, independent of clinical
    patient records (this is a staff-user knowledge base, not part of a patient chart).
    """
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS symptom_ai_documents (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            filename TEXT NOT NULL,
            doc_category TEXT,
            raw_text TEXT,
            created_by TEXT,
            deleted_by TEXT,
            deleted_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_symptom_ai_documents_owner "
        "ON symptom_ai_documents(hospital_id, username)"
    )
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS symptom_ai_chat_messages (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_symptom_ai_chat_owner "
        "ON symptom_ai_chat_messages(hospital_id, username, session_id)"
    )
    conn.commit()


def create_symptom_ai_document(hospital_id, username, filename, doc_category, raw_text):
    with get_connection() as conn:
        cursor = conn.cursor()
        # cursor.lastrowid is not reliable under psycopg2 (always reads back 0) -- RETURNING
        # id works on both engines (SQLite 3.35+ / all supported Postgres versions), so use it
        # here rather than relying on the lastrowid convention most of this file still uses.
        cursor.execute(
            """
            INSERT INTO symptom_ai_documents (hospital_id, username, filename, doc_category, raw_text, created_by)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (hospital_id, username, filename, doc_category, raw_text, username),
        )
        document_id = cursor.fetchone()[0]
        conn.commit()
        return document_id


def list_symptom_ai_documents(hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, doc_category, created_at FROM symptom_ai_documents
            WHERE hospital_id = ? AND username = ? AND deleted_at IS NULL
            ORDER BY created_at DESC
            """,
            (hospital_id, username),
        )
        return cursor.fetchall()


def get_symptom_ai_document(document_id, hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM symptom_ai_documents
            WHERE id = ? AND hospital_id = ? AND username = ? AND deleted_at IS NULL
            """,
            (document_id, hospital_id, username),
        )
        return cursor.fetchone()


def delete_symptom_ai_document(document_id, hospital_id, username, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM symptom_ai_documents WHERE id = ? AND hospital_id = ? AND username = ? AND deleted_at IS NULL",
            (document_id, hospital_id, username),
        )
        if not cursor.fetchone():
            return False
        deleted = soft_delete_row(
            cursor,
            "symptom_ai_documents",
            "id",
            document_id,
            hospital_id=hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


def save_symptom_ai_chat_message(hospital_id, username, session_id, role, content):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO symptom_ai_chat_messages (hospital_id, username, session_id, role, content)
            VALUES (?, ?, ?, ?, ?) RETURNING id
            """,
            (hospital_id, username, session_id, role, content),
        )
        message_id = cursor.fetchone()[0]
        conn.commit()
        return message_id


def list_symptom_ai_chat_history(hospital_id, username, session_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if session_id:
            cursor.execute(
                """
                SELECT role, content, session_id, created_at FROM symptom_ai_chat_messages
                WHERE hospital_id = ? AND username = ? AND session_id = ?
                ORDER BY created_at ASC
                """,
                (hospital_id, username, session_id),
            )
        else:
            cursor.execute(
                """
                SELECT role, content, session_id, created_at FROM symptom_ai_chat_messages
                WHERE hospital_id = ? AND username = ?
                ORDER BY created_at ASC
                """,
                (hospital_id, username),
            )
        return cursor.fetchall()


def delete_symptom_ai_chat_history(hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM symptom_ai_chat_messages WHERE hospital_id = ? AND username = ?",
            (hospital_id, username),
        )
        conn.commit()
        return cursor.rowcount > 0


def ensure_ocr_portal_tables(conn):
    """Maps each (hospital, username) to its own auto-provisioned account on the
    separate OCR/document-intelligence service (see backend/ai/ocr_portal_client.py)
    -- so every user gets their own isolated documents/jobs/chat history there
    instead of a shared account, without that service knowing anything about
    hospitals or Hosp AI sessions itself.
    """
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ocr_service_accounts (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            ocr_username TEXT NOT NULL,
            encrypted_password TEXT NOT NULL,
            ocr_user_id INTEGER,
            access_token TEXT,
            token_expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_ocr_service_accounts_owner "
        "ON ocr_service_accounts(hospital_id, username)"
    )

    # Local OCR Portal vault + chat -- the separate ocr_portal/ microservice this
    # module used to proxy to (Docker + Postgres + Qdrant + a GPU vLLM model) isn't
    # available in this deployment, so upload/vault/knowledge-base/chat are all
    # served locally instead via the same vLLM model as the rest of the app
    # (see ai/local_ocr_portal.py, ai/service.py).
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ocr_portal_documents (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            filename TEXT NOT NULL,
            doc_category TEXT,
            mime_type TEXT,
            ocr_text TEXT,
            confidence_score REAL,
            status TEXT DEFAULT 'COMPLETED',
            error_message TEXT,
            in_kb INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_ocr_portal_documents_owner "
        "ON ocr_portal_documents(hospital_id, username)"
    )
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS ocr_portal_chat_messages (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            citations TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_ocr_portal_chat_owner "
        "ON ocr_portal_chat_messages(hospital_id, username, session_id)"
    )
    conn.commit()


def create_ocr_portal_document(
    hospital_id,
    username,
    filename,
    doc_category,
    mime_type,
    ocr_text,
    confidence_score=None,
    status="COMPLETED",
    error_message=None,
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO ocr_portal_documents
                (hospital_id, username, filename, doc_category, mime_type, ocr_text,
                 confidence_score, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (
                hospital_id,
                username,
                filename,
                doc_category,
                mime_type,
                ocr_text,
                confidence_score,
                status,
                error_message,
            ),
        )
        document_id = cursor.fetchone()[0]
        conn.commit()
        return document_id


def list_ocr_portal_documents(hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, doc_category, confidence_score, status, in_kb, created_at
            FROM ocr_portal_documents
            WHERE hospital_id = ? AND username = ?
            ORDER BY created_at DESC
            """,
            (hospital_id, username),
        )
        return cursor.fetchall()


def get_ocr_portal_document(document_id, hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM ocr_portal_documents
            WHERE id = ? AND hospital_id = ? AND username = ?
            """,
            (document_id, hospital_id, username),
        )
        return cursor.fetchone()


def delete_ocr_portal_document(document_id, hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM ocr_portal_documents WHERE id = ? AND hospital_id = ? AND username = ?",
            (document_id, hospital_id, username),
        )
        conn.commit()
        return cursor.rowcount > 0


def set_ocr_portal_document_kb_flag(document_id, hospital_id, username, in_kb: bool):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ocr_portal_documents SET in_kb = ? WHERE id = ? AND hospital_id = ? AND username = ?",
            (1 if in_kb else 0, document_id, hospital_id, username),
        )
        conn.commit()


def list_ocr_portal_kb_documents(hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, doc_category FROM ocr_portal_documents
            WHERE hospital_id = ? AND username = ? AND in_kb = 1
            ORDER BY created_at DESC
            """,
            (hospital_id, username),
        )
        return cursor.fetchall()


def save_ocr_portal_chat_message(
    hospital_id, username, session_id, role, content, citations=None
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO ocr_portal_chat_messages (hospital_id, username, session_id, role, content, citations)
            VALUES (?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (hospital_id, username, session_id, role, content, citations),
        )
        message_id = cursor.fetchone()[0]
        conn.commit()
        return message_id


def list_ocr_portal_chat_history(hospital_id, username, session_id="default"):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT role, content, citations, created_at FROM ocr_portal_chat_messages
            WHERE hospital_id = ? AND username = ? AND session_id = ?
            ORDER BY created_at ASC
            """,
            (hospital_id, username, session_id),
        )
        return cursor.fetchall()


def delete_ocr_portal_chat_history(hospital_id, username, session_id="default"):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM ocr_portal_chat_messages WHERE hospital_id = ? AND username = ? AND session_id = ?",
            (hospital_id, username, session_id),
        )
        conn.commit()


def search_ocr_portal_chunks(hospital_id, doc_ids, query_text, k=5):
    """Cosine-similarity search restricted to this user's ingested OCR-portal chunks
    (source_table='ocr_portal_documents', source_id in doc_ids) -- reuses the same
    clinical_document_embeddings store as patient history search, just scoped
    differently, so no new vector store is needed."""
    from .embeddings import generate_embedding, decode_vector, cosine_similarity

    if not doc_ids:
        return []
    query_vector = generate_embedding(query_text)
    if query_vector is None:
        return []
    placeholders = ", ".join(["?"] * len(doc_ids))
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT source_id, content_text, embedding FROM clinical_document_embeddings
            WHERE hospital_id = ? AND source_table = 'ocr_portal_documents'
            AND source_id IN ({placeholders}) AND embedding IS NOT NULL
            """,
            (hospital_id, *doc_ids),
        )
        rows = cursor.fetchall()

    scored = []
    for row in rows:
        candidate_vector = decode_vector(row["embedding"])
        if not candidate_vector:
            continue
        similarity = cosine_similarity(query_vector, candidate_vector)
        scored.append(
            {
                "source_id": row["source_id"],
                "content_text": row["content_text"],
                "similarity": similarity,
            }
        )
    scored.sort(key=lambda item: item["similarity"], reverse=True)
    return scored[:k]


def delete_ocr_portal_chunks(hospital_id, document_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM clinical_document_embeddings "
            "WHERE hospital_id = ? AND source_table = 'ocr_portal_documents' AND source_id = ?",
            (hospital_id, document_id),
        )
        conn.commit()


def get_ocr_service_account(hospital_id, username):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT hospital_id, username, ocr_username, encrypted_password, ocr_user_id, "
            "access_token, token_expires_at FROM ocr_service_accounts "
            "WHERE hospital_id = ? AND username = ?",
            (hospital_id, username),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def create_ocr_service_account(
    hospital_id, username, ocr_username, encrypted_password, ocr_user_id
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO ocr_service_accounts "
            "(hospital_id, username, ocr_username, encrypted_password, ocr_user_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (hospital_id, username, ocr_username, encrypted_password, ocr_user_id),
        )
        conn.commit()


def update_ocr_service_account_token(
    hospital_id, username, access_token, token_expires_at
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ocr_service_accounts SET access_token = ?, token_expires_at = ? "
            "WHERE hospital_id = ? AND username = ?",
            (access_token, token_expires_at, hospital_id, username),
        )
        conn.commit()


def store_document_embedding(
    source_table, source_id, content_text, hospital_id=None, patient_id=None
):
    """Embed and store a clinical document/certificate chunk for later semantic search.

    Returns the new row id, or None if embeddings are unavailable (local vLLM
    embedding model unreachable) -- callers should treat this as a soft failure, not
    an error, since OCR/document upload must keep working even when the embedding
    provider is unset.
    """
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    vector = generate_embedding(content_text)
    if vector is None:
        return None
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO clinical_document_embeddings (
                hospital_id, patient_id, source_table, source_id, content_text, embedding, embedding_model
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scoped_hospital_id,
                patient_id,
                source_table,
                source_id,
                content_text,
                encode_vector(vector),
                VLLM_EMBEDDING_MODEL,
            ),
        )
        conn.commit()
        return cursor.lastrowid


def search_similar_documents(query_text, hospital_id=None, patient_id=None, k=5):
    """Return the top-k most semantically similar stored document chunks.

    Brute-force cosine similarity in Python -- fine at the row counts a single hospital's
    clinical documents realistically reach; a native pgvector index is a storage-layer
    optimization for later, not a change to this function's contract.
    """
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    query_vector = generate_embedding(query_text)
    if query_vector is None:
        return []
    with get_connection() as conn:
        cursor = conn.cursor()
        if patient_id:
            cursor.execute(
                """
                SELECT id, patient_id, source_table, source_id, content_text, embedding
                FROM clinical_document_embeddings
                WHERE hospital_id = ? AND patient_id = ? AND embedding IS NOT NULL
                """,
                (scoped_hospital_id, patient_id),
            )
        else:
            cursor.execute(
                """
                SELECT id, patient_id, source_table, source_id, content_text, embedding
                FROM clinical_document_embeddings
                WHERE hospital_id = ? AND embedding IS NOT NULL
                """,
                (scoped_hospital_id,),
            )
        rows = cursor.fetchall()

    scored = []
    for row in rows:
        candidate_vector = decode_vector(row["embedding"])
        if not candidate_vector:
            continue
        similarity = cosine_similarity(query_vector, candidate_vector)
        scored.append(
            {
                "id": row["id"],
                "patient_id": row["patient_id"],
                "source_table": row["source_table"],
                "source_id": row["source_id"],
                "content_text": row["content_text"],
                "similarity": similarity,
            }
        )
    scored.sort(key=lambda item: item["similarity"], reverse=True)
    return scored[:k]


# ==================== Bulk AI patient import ====================


def ensure_patient_bulk_columns(conn):
    """Adds the columns a bulk Excel/CSV import needs on top of the core patients
    schema (area/medical_condition aren't collected by the normal registration
    flow), plus a partial-unique index on (hospital_id, phone) scoped to
    source='bulk_import' rows only -- so bulk import can upsert its own
    previously-imported patients on re-upload without colliding, while normal
    registration (source='registration') keeps allowing multiple patients to
    share one phone number (e.g. a family registered under one guardian's
    number), exactly as it does today."""
    cursor = conn.cursor()
    _ensure_column(cursor, "patients", "area", "TEXT")
    _ensure_column(cursor, "patients", "medical_condition", "TEXT")
    _ensure_column(cursor, "patients", "source", "TEXT DEFAULT 'registration'")
    cursor.execute("UPDATE patients SET source = 'registration' WHERE source IS NULL")
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_bulk_import_phone "
        "ON patients(hospital_id, phone) WHERE phone IS NOT NULL AND phone <> '' AND source = 'bulk_import'"
    )
    # Tracks which bulk-import job most recently touched a patient row, kept
    # separate from patient_id (a stable natural key referenced by foreign
    # keys elsewhere) so job-scoped AI Mode search can be re-pointed to the
    # latest upload on re-import without ever rewriting patient_id itself.
    _ensure_column(cursor, "patients", "bulk_import_job_id", "INTEGER")
    # Backfill from patient_id's still-intact "BULK-{job_id}-{row}" prefix for
    # rows imported before this column existed -- without this, every bulk
    # import done before this migration would vanish from job-scoped search
    # the moment it runs, since the new column starts out NULL for all of them.
    cursor.execute(
        r"""
        UPDATE patients
        SET bulk_import_job_id = split_part(patient_id, '-', 2)::integer
        WHERE bulk_import_job_id IS NULL
          AND source = 'bulk_import'
          AND patient_id ~ '^BULK-[0-9]+-'
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_bulk_import_job "
        "ON patients(bulk_import_job_id) WHERE bulk_import_job_id IS NOT NULL"
    )
    conn.commit()


def ensure_bulk_import_jobs_table(conn):
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS bulk_import_jobs (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            created_by TEXT,
            original_filename TEXT,
            storage_path TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING_MAPPING',
            detected_columns TEXT,
            suggested_mapping TEXT,
            confirmed_mapping TEXT,
            total_rows INTEGER DEFAULT 0,
            processed_rows INTEGER DEFAULT 0,
            imported_count INTEGER DEFAULT 0,
            updated_count INTEGER DEFAULT 0,
            skipped_count INTEGER DEFAULT 0,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_bulk_import_jobs_hospital ON bulk_import_jobs(hospital_id)"
    )
    # PDF/DOCX uploads skip column mapping entirely -- their extracted text is stored
    # here and answered against directly via /ask, never turned into patient rows.
    _ensure_column(cursor, "bulk_import_jobs", "extracted_text", "TEXT")
    conn.commit()


def ensure_whatsapp_settings_table(conn):
    """Single-row table (id is always 1) holding the platform-wide Twilio
    WhatsApp credentials that admins configure through Settings, as an
    alternative to setting TWILIO_* env vars directly on the server. One row
    for the whole deployment, not per-hospital -- see core/whatsapp.py for how
    this is read (DB row wins over env vars when both are present)."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS whatsapp_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            account_sid TEXT,
            auth_token_encrypted TEXT,
            whatsapp_from TEXT,
            default_country_code TEXT DEFAULT '+91',
            updated_by TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    conn.commit()


def get_whatsapp_settings():
    """Returns the single settings row as a dict, or None if never configured."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM whatsapp_settings WHERE id = 1")
        row = cursor.fetchone()
        return dict(row) if row else None


def save_whatsapp_settings(
    account_sid, auth_token_encrypted, whatsapp_from, default_country_code, updated_by
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO whatsapp_settings
                (id, account_sid, auth_token_encrypted, whatsapp_from, default_country_code, updated_by, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                account_sid = EXCLUDED.account_sid,
                auth_token_encrypted = EXCLUDED.auth_token_encrypted,
                whatsapp_from = EXCLUDED.whatsapp_from,
                default_country_code = EXCLUDED.default_country_code,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                account_sid,
                auth_token_encrypted,
                whatsapp_from,
                default_country_code,
                updated_by,
            ),
        )
        conn.commit()


def ensure_patient_messages_table(conn):
    """One row per message sent (or attempted) to a patient on one channel --
    the record behind every "sent to the patient" claim in the UI. See
    modules/messaging/routes.py. status starts as what the send itself
    returned ("sent" = accepted by Twilio, "failed", "not_configured") and is
    advanced by Twilio's delivery callbacks ("delivered", "read",
    "undelivered") when PUBLIC_BASE_URL lets Twilio reach us."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patient_messages (
            id SERIAL PRIMARY KEY,
            hospital_id INTEGER,
            patient_id TEXT,
            patient_name TEXT,
            phone TEXT,
            channel TEXT NOT NULL,
            kind TEXT NOT NULL,
            body TEXT NOT NULL,
            document_title TEXT,
            media_token TEXT,
            status TEXT NOT NULL,
            provider_sid TEXT,
            error TEXT,
            error_code TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_patient_messages_patient "
        "ON patient_messages (hospital_id, patient_id, created_at DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_patient_messages_sid "
        "ON patient_messages (provider_sid)"
    )
    conn.commit()


def insert_patient_message(
    hospital_id,
    patient_id,
    patient_name,
    phone,
    channel,
    kind,
    body,
    status,
    document_title=None,
    media_token=None,
    provider_sid=None,
    error=None,
    error_code=None,
    created_by=None,
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO patient_messages
                (hospital_id, patient_id, patient_name, phone, channel, kind, body,
                 document_title, media_token, status, provider_sid, error, error_code,
                 created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                hospital_id,
                patient_id,
                patient_name,
                phone,
                channel,
                kind,
                body,
                document_title,
                media_token,
                status,
                provider_sid,
                error,
                error_code,
                created_by,
            ),
        )
        row = cursor.fetchone()
        conn.commit()
        return row["id"] if row else None


def update_patient_message_delivery(provider_sid, status, error_code=None):
    """Applies a Twilio status callback. A callback can arrive out of order
    ("sent" after "delivered"), so a later-stage status is never overwritten
    by an earlier one."""
    rank = {"sent": 1, "failed": 2, "undelivered": 2, "delivered": 3, "read": 4}
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, status FROM patient_messages WHERE provider_sid = ?",
            (provider_sid,),
        )
        row = cursor.fetchone()
        if not row:
            return False
        if rank.get(status, 0) < rank.get(row["status"], 0):
            return True
        cursor.execute(
            """
            UPDATE patient_messages
            SET status = ?, error_code = COALESCE(?, error_code), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (status, error_code, row["id"]),
        )
        conn.commit()
        return True


def list_patient_messages(hospital_id, patient_id=None, limit=100):
    sql = "SELECT * FROM patient_messages WHERE hospital_id = ?"
    params = [hospital_id]
    if patient_id:
        sql += " AND patient_id = ?"
        params.append(patient_id)
    sql += " ORDER BY created_at DESC, id DESC LIMIT ?"
    params.append(max(1, min(int(limit or 100), 500)))
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        return [dict(r) for r in cursor.fetchall()]


def ensure_whatsapp_broadcasts_table(conn):
    """Tracks a single 'message everyone matching this AI Mode search' send --
    one row per Send to All click. Recipients are captured as a JSON snapshot
    at send time (not re-queried later), so what actually gets messaged can't
    drift if the underlying patient data changes while the Celery task is
    still working through the list."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
            id SERIAL PRIMARY KEY,
            hospital_id INTEGER NOT NULL,
            bulk_import_job_id INTEGER,
            prompt TEXT,
            message_template TEXT NOT NULL,
            recipients TEXT NOT NULL,
            total_recipients INTEGER NOT NULL DEFAULT 0,
            sent_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_hospital "
        "ON whatsapp_broadcasts(hospital_id)"
    )
    # "channel" lets one broadcast/send pipeline cover both WhatsApp and SMS
    # (see core/sms.py) -- default keeps every pre-existing row correctly
    # WhatsApp, since that's the only channel that ever existed before.
    cursor.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'whatsapp_broadcasts'
        """)
    existing = {row[0] for row in cursor.fetchall()}
    if "channel" not in existing:
        cursor.execute(
            "ALTER TABLE whatsapp_broadcasts ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'"
        )
    conn.commit()


def create_whatsapp_broadcast(
    hospital_id, bulk_import_job_id, prompt, message_template, recipients, created_by,
    channel="whatsapp",
):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO whatsapp_broadcasts
                (hospital_id, bulk_import_job_id, prompt, message_template,
                 recipients, total_recipients, created_by, channel)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                hospital_id,
                bulk_import_job_id,
                prompt,
                message_template,
                json.dumps(recipients, separators=(",", ":")),
                len(recipients),
                created_by,
                channel,
            ),
        )
        conn.commit()
        return cursor.lastrowid


def get_whatsapp_broadcast(broadcast_id, hospital_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM whatsapp_broadcasts WHERE id = ? AND hospital_id = ?",
            (broadcast_id, hospital_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def get_whatsapp_broadcast_internal(broadcast_id):
    """Unscoped lookup for the Celery worker, same rationale as
    get_bulk_import_job_internal -- no per-request tenant context to check
    against, so it trusts hospital_id already stored on the row."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM whatsapp_broadcasts WHERE id = ?", (broadcast_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def update_whatsapp_broadcast(broadcast_id, **fields):
    if not fields:
        return
    columns = list(fields.keys())
    set_clause = ", ".join(f"{col} = ?" for col in columns)
    values = [fields[col] for col in columns]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE whatsapp_broadcasts SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*values, broadcast_id),
        )
        conn.commit()


def create_bulk_import_job(hospital_id, created_by, original_filename, storage_path):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bulk_import_jobs (hospital_id, created_by, original_filename, storage_path) "
            "VALUES (?, ?, ?, ?)",
            (hospital_id, created_by, original_filename, storage_path),
        )
        conn.commit()
        return cursor.lastrowid


def get_bulk_import_job(job_id, hospital_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM bulk_import_jobs WHERE id = ? AND hospital_id = ?",
            (job_id, hospital_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def update_bulk_import_job(job_id, **fields):
    if not fields:
        return
    columns = list(fields.keys())
    set_clause = ", ".join(f"{col} = ?" for col in columns)
    values = [fields[col] for col in columns]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE bulk_import_jobs SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*values, job_id),
        )
        conn.commit()


def get_bulk_import_job_internal(job_id):
    """Unscoped lookup for use by the Celery worker, which has no per-request
    tenant context to check against -- the job's own hospital_id (set once at
    creation, from the authenticated upload request) is what tasks pass on to
    every subsequent DB write."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bulk_import_jobs WHERE id = ?", (job_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


BULK_IMPORT_PATIENT_FIELDS = [
    "name",
    "last_name",
    "age",
    "gender",
    "area",
    "medical_condition",
]


def upsert_bulk_import_patients_batch(hospital_id, job_id, rows):
    """Batch insert/update patients keyed on (hospital_id, phone) via one
    executemany call -- opening a connection per row would be far too slow at
    100k-300k rows. Each item in `rows` is (patient_id, phone, fields) where
    fields is a dict with exactly the keys in BULK_IMPORT_PATIENT_FIELDS
    (missing ones as None). The ON CONFLICT target's WHERE clause must match
    idx_patients_bulk_import_phone's predicate exactly (both Postgres and
    SQLite require this to infer a partial unique index) -- this scopes the
    upsert to only collide with other bulk-imported rows, never with normal
    registration data that may legitimately share a phone number.

    patient_id is intentionally NEVER reassigned on conflict: several tables
    (emr_access_logs, documents, admissions, ...) carry a foreign key to
    patients.patient_id, so changing it on an existing row throws a foreign
    key violation the moment that patient has any related record. Which job
    most recently touched a row is instead tracked in bulk_import_job_id, a
    plain non-key column that's safe to overwrite on every re-upload -- job
    scoped search filters on that column, not on patient_id."""
    if not rows:
        return
    columns = [
        "hospital_id",
        "patient_id",
        "phone",
        "source",
        "bulk_import_job_id",
    ] + BULK_IMPORT_PATIENT_FIELDS
    placeholders = ", ".join(["?"] * len(columns))
    update_assignments = ", ".join(
        f"{col} = EXCLUDED.{col}" for col in ["bulk_import_job_id"] + BULK_IMPORT_PATIENT_FIELDS
    )
    param_rows = [
        (
            hospital_id,
            patient_id,
            phone,
            "bulk_import",
            job_id,
            *(fields.get(f) for f in BULK_IMPORT_PATIENT_FIELDS),
        )
        for patient_id, phone, fields in rows
    ]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.executemany(
            f"""
            INSERT INTO patients ({", ".join(columns)})
            VALUES ({placeholders})
            ON CONFLICT (hospital_id, phone) WHERE phone IS NOT NULL AND phone <> '' AND source = 'bulk_import'
            DO UPDATE SET {update_assignments}, updated_at = CURRENT_TIMESTAMP
            """,
            param_rows,
        )
        conn.commit()


def query_bulk_patients(hospital_id, where_clause, params, page=1, page_size=150):
    offset = (page - 1) * page_size
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT patient_id, name, last_name, phone, age, gender, area, medical_condition, source
            FROM patients
            WHERE hospital_id = ? AND deleted_at IS NULL AND source = 'bulk_import' {where_clause}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (hospital_id, *params, page_size, offset),
        )
        rows = [dict(row) for row in cursor.fetchall()]
        cursor.execute(
            f"""
            SELECT COUNT(*) FROM patients
            WHERE hospital_id = ? AND deleted_at IS NULL AND source = 'bulk_import' {where_clause}
            """,
            (hospital_id, *params),
        )
        total = cursor.fetchone()[0]
        return rows, total


# ==================== Patient operations ====================


def generate_patient_id(hospital_id=None):
    """Atomically reserves the next globally-unique PAT-XXXXXX number via a
    single Postgres SEQUENCE shared across every hospital (patient_id is a
    GLOBAL unique column, not per-hospital -- several other tables carry a
    foreign key against it that depends on that, see
    ensure_patient_id_generation). Replaces the old per-hospital scan, which
    had no locking and let two concurrent calls read the same max and
    collide on insert; nextval() is atomic by construction, no locking code
    needed here. hospital_id is accepted for call-site compatibility but no
    longer affects the generated id."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT nextval('patient_id_seq')")
        issued = cursor.fetchone()[0]
        conn.commit()

    return f"PAT-{issued}"


def generate_er_patient_id(hospital_id=None):
    """Atomically reserves the next globally-unique ER-PAT-XXXXXX number for Emergency Room
    patients via the shared sequence, keeping ER records distinct and standalone."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT nextval('patient_id_seq')")
        issued = cursor.fetchone()[0]
        conn.commit()

    return f"ER-PAT-{issued}"


def check_duplicate_patient(name, last_name, dob, phone, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT patient_id, name, last_name FROM patients
            WHERE hospital_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
            AND (dob = ? OR phone = ?)
        """,
            (scoped_hospital_id, name, last_name, dob, phone),
        )
        return cursor.fetchone()


def add_patient(data, hospital_id=None):
    scoped_hospital_id = hospital_id or data.get("hospital_id") or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO patients (hospital_id, patient_id, name, middle_name, last_name, dob, age, weight, height, gender, pregnant, allergies, symptoms, phone, address, blood_group, emergency_contact, aadhar_number, registration_source, patient_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                scoped_hospital_id,
                data["patient_id"],
                data["name"],
                data.get("middle_name", ""),
                data["last_name"],
                data.get("dob"),
                data.get("age"),
                data.get("weight"),
                data.get("height"),
                data.get("gender"),
                data.get("pregnant", 0),
                data.get("allergies", ""),
                data.get("symptoms", ""),
                data.get("phone", ""),
                data.get("address", ""),
                data.get("blood_group", ""),
                data.get("emergency_contact", ""),
                data.get("aadhar_number", ""),
                data.get("registration_source", "outpatient"),
                data.get("patient_type", "regular"),
            ),
        )
        conn.commit()
        return data["patient_id"]


def get_patient(patient_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (patient_id, scoped_hospital_id),
        )
        return cursor.fetchone()


def get_patient_stream_counts(hospital_id=None, doctor_name=None):
    """Calculates live patient tallies segregated by care stream: All, OP, IP, and ER."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        # See get_all_patients() -- LIKE patterns must be bound params, not
        # inlined SQL text, or a literal "%" breaks psycopg2's substitution
        # for the whole query. A third copy of the same mistake.
        er_prefix_pattern = "ER-PAT-%"
        doc_filter = ""
        params = [scoped_hospital_id]
        if doctor_name:
            doc_filter = " AND p.patient_id IN (SELECT patient_id FROM appointments WHERE doctor_name = ?)"
            params.append(doctor_name)

        query = f"""
            SELECT
                COUNT(*) AS total_count,
                COUNT(CASE
                    WHEN (p.registration_source = 'emergency' OR p.patient_id LIKE ? OR p.patient_type = 'emergency'
                          OR EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL))
                    THEN 1
                END) AS er_count,
                COUNT(CASE
                    WHEN EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL))
                    THEN 1
                END) AS ip_count,
                COUNT(CASE
                    WHEN (p.registration_source != 'emergency' AND p.patient_id NOT LIKE ?
                          AND NOT EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL))
                          AND NOT EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL))
                    THEN 1
                END) AS op_count
            FROM patients p
            WHERE p.hospital_id = ? AND p.deleted_at IS NULL {doc_filter}
        """
        # Both "LIKE ?" placeholders (er_count, then op_count) precede the
        # WHERE clause's own params in the finished SQL text.
        cursor.execute(query, tuple([er_prefix_pattern, er_prefix_pattern] + params))
        row = cursor.fetchone()
        if not row:
            return {"all": 0, "op": 0, "ip": 0, "er": 0}
        r = dict(row)
        return {
            "all": r.get("total_count", 0) or 0,
            "op": r.get("op_count", 0) or 0,
            "ip": r.get("ip_count", 0) or 0,
            "er": r.get("er_count", 0) or 0,
        }


def get_all_patients(hospital_id=None, doctor_name=None, care_type=None, limit=None, offset=0):
    """Every patient of the hospital, newest first -- or one page of them when
    `limit` is given. The page is cut in SQL: each row carries nine correlated
    subqueries, so slicing after fetching still paid for every patient."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        care_type_lower = (care_type or "all").lower().strip()

        # LIKE patterns must always be bound parameters (LIKE ?), never
        # inlined into the SQL text -- the shared _CompatCursor.execute()
        # (see _to_sql_params) hands the finished string to psycopg2's own
        # %s-style substitution, which treats ANY literal "%" character in
        # the SQL text itself as part of that substitution syntax. An
        # inlined "LIKE 'ER-PAT-%'" broke every call to this function
        # (including the plain, no-filter GET /api/patients, since the '%'
        # in the SELECT clause's CASE below ran unconditionally) with
        # "IndexError: tuple index out of range" from psycopg2 -- not just
        # when a care_type filter was active. Every other LIKE in this file
        # already follows this pattern (e.g. list_departments, search_patients);
        # this one just didn't.
        er_prefix_pattern = "ER-PAT-%"

        where_clauses = ["p.hospital_id = ?", "p.deleted_at IS NULL"]
        params = [scoped_hospital_id]

        if doctor_name:
            where_clauses.append("p.patient_id IN (SELECT patient_id FROM appointments WHERE doctor_name = ?)")
            params.append(doctor_name)

        if care_type_lower in ("er", "emergency"):
            where_clauses.append(
                "(p.registration_source = 'emergency' OR p.patient_id LIKE ? OR p.patient_type = 'emergency' "
                "OR EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL))"
            )
            params.append(er_prefix_pattern)
        elif care_type_lower in ("ip", "inpatient"):
            where_clauses.append(
                "EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL))"
            )
        elif care_type_lower in ("op", "outpatient"):
            where_clauses.append(
                "(p.registration_source != 'emergency' AND p.patient_id NOT LIKE ? "
                "AND NOT EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL)) "
                "AND NOT EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL))"
            )
            params.append(er_prefix_pattern)

        query = f"""
            SELECT p.*,
                (SELECT status FROM appointments a WHERE a.patient_id = p.patient_id ORDER BY a.created_at DESC LIMIT 1) as appointment_status,
                (SELECT doctor_name FROM appointments a WHERE a.patient_id = p.patient_id ORDER BY a.created_at DESC LIMIT 1) as appointment_doctor,
                (SELECT department FROM appointments a WHERE a.patient_id = p.patient_id ORDER BY a.created_at DESC LIMIT 1) as appointment_dept,
                (SELECT ba.ward || ' · Bed ' || ba.bed_no FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL) ORDER BY ba.allocated_at DESC LIMIT 1) as active_bed,
                (SELECT ev.id FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as active_er_visit_id,
                (SELECT ev.visit_no FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as active_er_visit_no,
                (SELECT ev.status FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as active_er_status,
                (SELECT t.category FROM er_visits ev JOIN er_triage t ON t.er_visit_id = ev.id WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as er_triage_category,
                CASE
                    WHEN (p.registration_source = 'emergency' OR p.patient_id LIKE ? OR p.patient_type = 'emergency'
                          OR EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL)) THEN 'ER'
                    WHEN EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL)) THEN 'IP'
                    ELSE 'OP'
                END AS care_stream
            FROM patients p
            WHERE {' AND '.join(where_clauses)}
            ORDER BY p.created_at DESC
        """
        page_params = []
        if limit is not None:
            query += " LIMIT ? OFFSET ?"
            page_params = [int(limit), int(offset or 0)]
        # The CASE's "LIKE ?" is the first placeholder to appear in the
        # finished SQL text (SELECT clause precedes WHERE), so its bound
        # value must be first in the params tuple, ahead of the WHERE clause's.
        cursor.execute(query, tuple([er_prefix_pattern] + params + page_params))
        rows = cursor.fetchall()
        if limit is None:
            return rows
        cursor.execute(
            f"SELECT COUNT(*) AS n FROM patients p WHERE {' AND '.join(where_clauses)}",
            tuple(params),
        )
        return rows, cursor.fetchone()["n"]


def search_patients(query, hospital_id=None, doctor_name=None, care_type=None, limit=None, offset=0):
    """Matching patients, newest first; one page plus the total when `limit`
    is given (cut in SQL, as in get_all_patients)."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        if not query:
            return []
        search = f"%{query.strip().lower()}%"
        care_type_lower = (care_type or "all").lower().strip()

        where_clauses = [
            "p.hospital_id = ?",
            "p.deleted_at IS NULL",
            """(
                LOWER(p.name) LIKE ? OR LOWER(p.last_name) LIKE ? OR LOWER(p.middle_name) LIKE ?
                OR LOWER(p.phone) LIKE ? OR LOWER(p.patient_id) LIKE ? OR LOWER(p.aadhar_number) LIKE ?
                OR LOWER(TRIM(p.name || ' ' || COALESCE(p.middle_name, '') || ' ' || p.last_name)) LIKE ?
                OR LOWER(TRIM(p.last_name || ' ' || p.name)) LIKE ?
            )"""
        ]
        params = [
            scoped_hospital_id,
            search,
            search,
            search,
            search,
            search,
            search,
            search,
            search,
        ]

        if doctor_name:
            where_clauses.append("p.patient_id IN (SELECT patient_id FROM appointments WHERE doctor_name = ?)")
            params.append(doctor_name)

        # See get_all_patients() for why this must be a bound "LIKE ?" param
        # rather than inlined "LIKE 'ER-PAT-%'" text -- a literal "%" in the
        # SQL string breaks psycopg2's %s-style substitution for the whole
        # query. This duplicated the same bug: it broke every patient search
        # (any non-empty q), not just ones with a care_type filter, because
        # the CASE clause's inlined LIKE is unconditional.
        er_prefix_pattern = "ER-PAT-%"

        if care_type_lower in ("er", "emergency"):
            where_clauses.append(
                "(p.registration_source = 'emergency' OR p.patient_id LIKE ? OR p.patient_type = 'emergency' "
                "OR EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL))"
            )
            params.append(er_prefix_pattern)
        elif care_type_lower in ("ip", "inpatient"):
            where_clauses.append(
                "EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL))"
            )
        elif care_type_lower in ("op", "outpatient"):
            where_clauses.append(
                "(p.registration_source != 'emergency' AND p.patient_id NOT LIKE ? "
                "AND NOT EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL)) "
                "AND NOT EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL))"
            )
            params.append(er_prefix_pattern)

        sql = f"""
            SELECT p.*,
                (SELECT status FROM appointments a WHERE a.patient_id = p.patient_id ORDER BY a.created_at DESC LIMIT 1) as appointment_status,
                (SELECT doctor_name FROM appointments a WHERE a.patient_id = p.patient_id ORDER BY a.created_at DESC LIMIT 1) as appointment_doctor,
                (SELECT department FROM appointments a WHERE a.patient_id = p.patient_id ORDER BY a.created_at DESC LIMIT 1) as appointment_dept,
                (SELECT ba.ward || ' · Bed ' || ba.bed_no FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL) ORDER BY ba.allocated_at DESC LIMIT 1) as active_bed,
                (SELECT ev.id FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as active_er_visit_id,
                (SELECT ev.visit_no FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as active_er_visit_no,
                (SELECT ev.status FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as active_er_status,
                (SELECT t.category FROM er_visits ev JOIN er_triage t ON t.er_visit_id = ev.id WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL ORDER BY ev.arrival_at DESC LIMIT 1) as er_triage_category,
                CASE
                    WHEN (p.registration_source = 'emergency' OR p.patient_id LIKE ? OR p.patient_type = 'emergency'
                          OR EXISTS (SELECT 1 FROM er_visits ev WHERE ev.patient_id = p.patient_id AND ev.hospital_id = p.hospital_id AND ev.deleted_at IS NULL)) THEN 'ER'
                    WHEN EXISTS (SELECT 1 FROM bed_allocations ba WHERE ba.patient_id = p.patient_id AND (ba.status = 'active' OR ba.released_at IS NULL)) THEN 'IP'
                    ELSE 'OP'
                END AS care_stream
            FROM patients p
            WHERE {' AND '.join(where_clauses)}
            ORDER BY p.created_at DESC
        """
        page_params = []
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            page_params = [int(limit), int(offset or 0)]
        # CASE's "LIKE ?" is the first placeholder in the finished SQL text
        # (SELECT precedes WHERE), so its value goes first in the tuple.
        cursor.execute(sql, tuple([er_prefix_pattern] + params + page_params))
        rows = cursor.fetchall()
        if limit is None:
            return rows
        cursor.execute(
            f"SELECT COUNT(*) AS n FROM patients p WHERE {' AND '.join(where_clauses)}",
            tuple(params),
        )
        return rows, cursor.fetchone()["n"]


def update_patient(patient_id, data):
    """Partial update: any field omitted from `data` (value is None, since the
    route always includes every key via payload.get()) keeps its existing
    value instead of being wiped -- mirrors the data.get(field, existing[field])
    pattern used by update_patient_consent() etc. Without this, a caller that
    only means to change one field (e.g. just allergies) would silently null
    out name/dob/phone/... for every field it didn't send."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM patients WHERE patient_id = ?", (patient_id,))
        existing = cursor.fetchone()
        if not existing:
            return False

        def field(key, default_empty=False):
            value = data.get(key)
            if value is not None:
                return value
            return existing[key] if not default_empty else (existing[key] or "")

        cursor.execute(
            """
            UPDATE patients SET name=?, middle_name=?, last_name=?, dob=?, age=?, weight=?, height=?,
            gender=?, pregnant=?, allergies=?, symptoms=?, phone=?, address=?, blood_group=?, emergency_contact=?, aadhar_number=?, updated_at=CURRENT_TIMESTAMP
            WHERE patient_id=?
        """,
            (
                field("name"),
                field("middle_name", default_empty=True),
                field("last_name"),
                field("dob"),
                field("age"),
                field("weight"),
                field("height"),
                field("gender"),
                data.get("pregnant") if data.get("pregnant") is not None else existing["pregnant"],
                field("allergies", default_empty=True),
                field("symptoms", default_empty=True),
                field("phone", default_empty=True),
                field("address", default_empty=True),
                field("blood_group", default_empty=True),
                field("emergency_contact", default_empty=True),
                field("aadhar_number", default_empty=True),
                patient_id,
            ),
        )
        conn.commit()
        return True


def add_admission(patient_id, notes="", hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        admission_timestamp = current_ist_timestamp()
        cursor.execute(
            """
            INSERT INTO admissions (hospital_id, patient_id, admission_date, notes)
            VALUES (?, ?, ?, ?)
            RETURNING id
            """,
            (scoped_hospital_id, patient_id, admission_timestamp, notes),
        )
        admission_id = cursor.fetchone()[0]
        conn.commit()
        return admission_id


def get_admissions(patient_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM admissions WHERE patient_id = ? AND hospital_id = ? ORDER BY admission_date DESC",
            (patient_id, scoped_hospital_id),
        )
        return cursor.fetchall()


def _as_datetime(value):
    """admission_date/discharge_date can come back as either datetime.date
    (DATE columns) or datetime.datetime (TIMESTAMP columns) depending on how
    a given row was written -- subtracting a date from a datetime raises
    TypeError, so this normalizes both to datetime (midnight for a bare
    date) before any arithmetic."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value)
    if isinstance(value, datetime):
        return value
    return datetime(value.year, value.month, value.day)


def get_readmission_analytics(hospital_id, window_days=30):
    """30-day-readmission analytics computed straight from real admission/
    discharge dates -- no predictive model, no fabricated penalty dollar
    figures (there's no real reimbursement-rate data to compute those from).
    A "readmission" here is: this patient had another admission that started
    within `window_days` of a previous admission's discharge. "High
    frequency" is a plain rule (3+ admissions in the trailing 12 months),
    not an AI risk score -- there's no model behind it, so it isn't
    presented as one."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT a.id, a.patient_id, a.admission_date, a.discharge_date,
                   p.name, p.last_name
            FROM admissions a
            JOIN patients p ON p.patient_id = a.patient_id AND p.hospital_id = a.hospital_id
            WHERE a.hospital_id = ? AND a.deleted_at IS NULL
            ORDER BY a.patient_id, a.admission_date
            """,
            (scoped_hospital_id,),
        )
        rows = [dict(r) for r in cursor.fetchall()]

    by_patient: dict = {}
    for row in rows:
        by_patient.setdefault(row["patient_id"], []).append(row)

    now = datetime.now()
    trailing_12mo_cutoff = now - timedelta(days=365)

    readmission_events = []
    total_discharges = 0
    high_frequency_patients = []

    for patient_id, admissions in by_patient.items():
        # Already sorted by admission_date via the query's ORDER BY.
        discharged = [a for a in admissions if a["discharge_date"]]
        total_discharges += len(discharged)

        for i in range(len(admissions) - 1):
            current = admissions[i]
            nxt = admissions[i + 1]
            if not current["discharge_date"]:
                continue
            discharge_dt = _as_datetime(current["discharge_date"])
            next_admit_dt = _as_datetime(nxt["admission_date"])
            gap_days = (next_admit_dt - discharge_dt).days
            if 0 <= gap_days <= window_days:
                readmission_events.append(
                    {
                        "patient_id": patient_id,
                        "patient_name": f"{current.get('name') or ''} {current.get('last_name') or ''}".strip(),
                        "index_discharge_date": current["discharge_date"],
                        "readmission_date": nxt["admission_date"],
                        "gap_days": gap_days,
                        "readmission_admission_id": nxt["id"],
                    }
                )

        recent_count = sum(
            1 for a in admissions if _as_datetime(a["admission_date"]) >= trailing_12mo_cutoff
        )
        if recent_count >= 3:
            high_frequency_patients.append(
                {
                    "patient_id": patient_id,
                    "patient_name": f"{admissions[-1].get('name') or ''} {admissions[-1].get('last_name') or ''}".strip(),
                    "admissions_in_last_12_months": recent_count,
                }
            )

    rate = (len(readmission_events) / total_discharges * 100) if total_discharges else 0.0

    return {
        "window_days": window_days,
        "total_discharges": total_discharges,
        "total_readmissions": len(readmission_events),
        "readmission_rate_pct": round(rate, 1),
        "readmission_events": sorted(
            readmission_events, key=lambda e: e["readmission_date"], reverse=True
        ),
        "high_frequency_patients": sorted(
            high_frequency_patients,
            key=lambda p: p["admissions_in_last_12_months"],
            reverse=True,
        ),
    }


def add_document(
    patient_id,
    admission_id,
    doc_type,
    file_path,
    ocr_text="",
    ocr_language="en",
    file_name=None,
    mime_type=None,
    file_data=None,
    hospital_id=None,
):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        upload_timestamp = current_ist_timestamp()
        cursor.execute(
            """
            INSERT INTO documents (
                hospital_id, patient_id, admission_id, doc_type, file_path, file_name, mime_type, file_data, ocr_text, ocr_language, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                scoped_hospital_id,
                patient_id,
                admission_id,
                doc_type,
                file_path,
                file_name,
                mime_type,
                file_data,
                ocr_text,
                ocr_language,
                upload_timestamp,
            ),
        )
        document_id = cursor.fetchone()[0]
        conn.commit()
        return document_id


def get_documents(patient_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                id,
                patient_id,
                admission_id,
                doc_type,
                file_path,
                file_name,
                mime_type,
                ocr_text,
                ocr_language,
                created_at,
                CASE WHEN file_data IS NOT NULL THEN 1 ELSE 0 END AS has_file_data
            FROM documents
            WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL
            ORDER BY created_at DESC
            """,
            (patient_id, scoped_hospital_id),
        )
        return cursor.fetchall()


def get_document(document_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM documents WHERE id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (document_id, scoped_hospital_id),
        )
        return cursor.fetchone()


def store_whatsapp_media(content: bytes, mime_type: str = "application/pdf") -> str:
    """Stash a generated file (e.g. a prescription PDF) under a random token so it
    can be served back over a short-lived, unauthenticated URL that WhatsApp's
    servers are able to fetch directly (they can't send session cookies)."""
    token = uuid_lib.uuid4().hex
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO whatsapp_media (token, content, mime_type) VALUES (?, ?, ?)",
            (token, content, mime_type),
        )
        conn.commit()
    return token


def get_whatsapp_media(token: str, max_age_hours: int = None):
    """max_age_hours, when given, treats an older file as gone: these URLs are
    unauthenticated, so a link to a bill or discharge summary that a patient
    forwarded months ago must stop working at some point."""
    sql = "SELECT content, mime_type FROM whatsapp_media WHERE token = ?"
    params = [token]
    if max_age_hours:
        sql += " AND created_at > CURRENT_TIMESTAMP - make_interval(hours => ?)"
        params.append(int(max_age_hours))
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        row = cursor.fetchone()
        return (row["content"], row["mime_type"]) if row else (None, None)


def delete_document(document_id, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor,
            "documents",
            "id",
            document_id,
            hospital_id=scoped_hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


def update_document_ocr(
    document_id, ocr_text, ocr_language="en", hospital_id=None, structured_data=None
):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT patient_id FROM documents WHERE id = ? AND hospital_id = ?",
            (document_id, scoped_hospital_id),
        )
        existing = cursor.fetchone()
        structured_json = (
            json.dumps(structured_data, separators=(",", ":"))
            if structured_data
            else None
        )
        cursor.execute(
            "UPDATE documents SET ocr_text = ?, ocr_language = ?, structured_data = ? WHERE id = ? AND hospital_id = ?",
            (ocr_text, ocr_language, structured_json, document_id, scoped_hospital_id),
        )
        conn.commit()
        updated = cursor.rowcount > 0

    if updated and existing:
        try:
            from core.tasks import process_document_embedding_task

            process_document_embedding_task.delay(
                "documents",
                document_id,
                ocr_text,
                hospital_id=scoped_hospital_id,
                patient_id=existing["patient_id"],
            )
        except Exception:
            # Embedding is a best-effort enrichment; OCR persistence must not fail if it errors.
            pass

    return updated


def get_patient_stats(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM patients WHERE hospital_id = ?", (scoped_hospital_id,)
        )
        total = cursor.fetchone()[0]
        cursor.execute(
            "SELECT COUNT(*) FROM patients WHERE hospital_id = ? AND DATE(created_at) = CURRENT_DATE",
            (scoped_hospital_id,),
        )
        today = cursor.fetchone()[0]
        cursor.execute(
            "SELECT COUNT(*) FROM admissions WHERE hospital_id = ? AND discharge_date IS NULL",
            (scoped_hospital_id,),
        )
        active = cursor.fetchone()[0]
        cursor.execute(
            "SELECT COUNT(*) FROM documents WHERE hospital_id = ?",
            (scoped_hospital_id,),
        )
        docs = cursor.fetchone()[0]
        cursor.execute(
            """
            SELECT COUNT(*) FROM (
                SELECT patient_id
                FROM admissions
                WHERE hospital_id = ?
                GROUP BY patient_id
                HAVING COUNT(*) > 1
            ) AS readmitted_subquery
            """,
            (scoped_hospital_id,),
        )
        readmitted_patients = cursor.fetchone()[0]
    return {
        "total": total,
        "today": today,
        "active_admissions": active,
        "documents": docs,
        "readmitted_patients": readmitted_patients,
    }


def get_dashboard_analytics(days=14, include_employee=False, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    try:
        requested_days = int(days)
    except (TypeError, ValueError):
        requested_days = 14

    # Keep the window bounded so the dashboard stays fast and readable.
    window_days = max(7, min(requested_days, 60))
    start_date = current_ist_datetime().date() - timedelta(days=window_days - 1)
    day_range = [
        (start_date + timedelta(days=index)).isoformat() for index in range(window_days)
    ]

    def _day_key(value):
        # DATE(...) comes back from Postgres as a datetime.date, but day_range is
        # built from ISO strings -- without normalizing, every lookup below misses
        # and both trends flatline to zero.
        if hasattr(value, "isoformat"):
            return value.isoformat()[:10]
        return str(value)[:10]

    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM patients
            WHERE hospital_id = ? AND DATE(created_at) >= CURRENT_DATE - (%s * INTERVAL '1 day')
            GROUP BY DATE(created_at)
            ORDER BY day ASC
            """,
            (scoped_hospital_id, window_days - 1),
        )
        patient_trend_map = {
            _day_key(row["day"]): row["count"] for row in cursor.fetchall()
        }

        cursor.execute(
            """
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM documents
            WHERE hospital_id = ? AND DATE(created_at) >= CURRENT_DATE - (%s * INTERVAL '1 day')
            GROUP BY DATE(created_at)
            ORDER BY day ASC
            """,
            (scoped_hospital_id, window_days - 1),
        )
        document_trend_map = {
            _day_key(row["day"]): row["count"] for row in cursor.fetchall()
        }

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(gender), ''), 'Unknown') AS label, COUNT(*) AS count
            FROM patients
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        gender_distribution = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(doc_type), ''), 'Unknown') AS label, COUNT(*) AS count
            FROM documents
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        doc_type_distribution = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT CASE WHEN discharge_date IS NULL THEN 'Active' ELSE 'Discharged' END AS label, COUNT(*) AS count
            FROM admissions
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        admission_status_distribution = [dict(row) for row in cursor.fetchall()]

        analytics = {
            "window_days": window_days,
            "patients_trend": [
                {"date": day, "count": patient_trend_map.get(day, 0)}
                for day in day_range
            ],
            "documents_trend": [
                {"date": day, "count": document_trend_map.get(day, 0)}
                for day in day_range
            ],
            "gender_distribution": gender_distribution,
            "doc_type_distribution": doc_type_distribution,
            "admission_status_distribution": admission_status_distribution,
        }

        if include_employee:
            cursor.execute(
                """
                SELECT COALESCE(NULLIF(TRIM(status), ''), 'unknown') AS label, COUNT(*) AS count
                FROM users
                WHERE hospital_id = ?
                GROUP BY label
                ORDER BY count DESC, label ASC
                """,
                (scoped_hospital_id,),
            )
            employee_status_distribution = [dict(row) for row in cursor.fetchall()]

            cursor.execute(
                """
                SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS label, COUNT(*) AS count
                FROM users
                WHERE hospital_id = ?
                GROUP BY label
                ORDER BY count DESC, label ASC
                """,
                (scoped_hospital_id,),
            )
            department_distribution = [dict(row) for row in cursor.fetchall()]

            cursor.execute(
                """
                SELECT COALESCE(NULLIF(TRIM(user_type), ''), 'unknown') AS label, COUNT(*) AS count
                FROM users
                WHERE hospital_id = ?
                GROUP BY label
                ORDER BY count DESC, label ASC
                """,
                (scoped_hospital_id,),
            )
            access_role_distribution = [dict(row) for row in cursor.fetchall()]

            cursor.execute(
                "SELECT COUNT(*) AS total FROM users WHERE hospital_id = ?",
                (scoped_hospital_id,),
            )
            employee_total = cursor.fetchone()["total"]

            analytics["employee"] = {
                "total": employee_total,
                "status_distribution": employee_status_distribution,
                "department_distribution": department_distribution,
                "access_role_distribution": access_role_distribution,
            }

    return analytics


def delete_patient(patient_id, hospital_id=None, actor=None):
    """Soft-delete a patient and all associated admissions/documents."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? "
            "WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (actor, patient_id, scoped_hospital_id),
        )
        cursor.execute(
            "UPDATE admissions SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? "
            "WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (actor, patient_id, scoped_hospital_id),
        )
        deleted = soft_delete_row(
            cursor,
            "patients",
            "patient_id",
            patient_id,
            hospital_id=scoped_hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


# ==================== Employee management ====================


def generate_employee_id(hospital_id=None):
    # employee_id has a global UNIQUE constraint (not scoped per hospital), so the
    # next-id counter must scan across all hospitals, not just the current one.
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT employee_id FROM users WHERE employee_id LIKE ?", ("EMP-%",)
        )
        ids = [row[0] for row in cursor.fetchall()]

        max_num = 0
        for emp_id in ids:
            try:
                num = int(emp_id.split("-")[1])
                if num > max_num:
                    max_num = num
            except (IndexError, ValueError):
                continue

    return f"EMP-{max_num + 1:05d}"


def add_employee(data, hospital_id=None):
    scoped_hospital_id = hospital_id or data.get("hospital_id") or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO users (hospital_id, username, password_hash, role, job_role, full_name, email, phone,
                               department, employee_id, status, address, emergency_contact, access_role, user_type, module_access)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                scoped_hospital_id,
                data["username"],
                data["password_hash"],
                data.get("role", "employee"),
                data.get("job_role"),
                data.get("full_name"),
                data.get("email"),
                data.get("phone"),
                data.get("department"),
                data["employee_id"],
                data.get("status", "active"),
                data.get("address"),
                data.get("emergency_contact"),
                data.get("access_role")
                or (
                    "clinician"
                    if str(data.get("job_role", "")).lower() == "doctor"
                    else "receptionist"
                ),
                data.get("user_type", "normal"),
                json.dumps(data.get("module_access", []), separators=(",", ":")),
            ),
        )
        employee_pk = cursor.fetchone()[0]
        conn.commit()
        return employee_pk


def get_all_employees(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, username, role, job_role, full_name, email, phone, department,
                   employee_id, date_joined, status, address, emergency_contact, created_at, access_role, user_type, module_access
            FROM users
            WHERE hospital_id = ?
            ORDER BY date_joined DESC
        """,
            (scoped_hospital_id,),
        )
        return cursor.fetchall()


def get_employee(employee_id=None, username=None, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        if employee_id:
            cursor.execute(
                """
                SELECT id, username, role, job_role, full_name, email, phone, department,
                       employee_id, date_joined, status, address, emergency_contact, created_at, access_role, user_type, module_access
                FROM users WHERE employee_id = ? AND hospital_id = ?
            """,
                (employee_id, scoped_hospital_id),
            )
        elif username:
            cursor.execute(
                """
                SELECT id, username, role, job_role, full_name, email, phone, department,
                       employee_id, date_joined, status, address, emergency_contact, created_at, access_role, user_type, module_access
                FROM users WHERE username = ? AND hospital_id = ?
            """,
                (username, scoped_hospital_id),
            )
        else:
            return None
        return cursor.fetchone()


def update_employee(employee_id, data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE users SET full_name=?, email=?, phone=?, department=?,
                           status=?, address=?, emergency_contact=?, job_role=?, access_role=COALESCE(?, access_role),
                           user_type=COALESCE(?, user_type), module_access=COALESCE(?, module_access)
            WHERE employee_id=? AND hospital_id=?
        """,
            (
                data.get("full_name"),
                data.get("email"),
                data.get("phone"),
                data.get("department"),
                data.get("status"),
                data.get("address"),
                data.get("emergency_contact"),
                data.get("job_role"),
                data.get("access_role"),
                data.get("user_type"),
                (
                    json.dumps(data["module_access"], separators=(",", ":"))
                    if "module_access" in data
                    else None
                ),
                employee_id,
                scoped_hospital_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def deactivate_employee(employee_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET status='inactive' WHERE employee_id=? AND hospital_id=?",
            (employee_id, scoped_hospital_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def activate_employee(employee_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET status='active' WHERE employee_id=? AND hospital_id=?",
            (employee_id, scoped_hospital_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_employee(employee_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM users WHERE employee_id=? AND hospital_id=?",
            (employee_id, scoped_hospital_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def get_employee_stats(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM users WHERE status='active' AND hospital_id = ?",
            (scoped_hospital_id,),
        )
        active = cursor.fetchone()[0]
        cursor.execute(
            "SELECT COUNT(*) FROM users WHERE status='inactive' AND hospital_id = ?",
            (scoped_hospital_id,),
        )
        inactive = cursor.fetchone()[0]
        cursor.execute(
            "SELECT COUNT(*) FROM users WHERE hospital_id = ?", (scoped_hospital_id,)
        )
        total = cursor.fetchone()[0]
    return {"total": total, "active": active, "inactive": inactive}


def check_if_first_user(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) FROM users WHERE hospital_id = ?", (scoped_hospital_id,)
        )
        count = cursor.fetchone()[0]
    return count == 0


def search_employees(query, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        search = f"%{query}%"
        cursor.execute(
            """
            SELECT id, username, role, job_role, full_name, email, phone, department,
                   employee_id, date_joined, status, address, emergency_contact, created_at, access_role, user_type, module_access
            FROM users WHERE
            hospital_id = ? AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR employee_id LIKE ?)
            ORDER BY date_joined DESC
        """,
            (scoped_hospital_id, search, search, search, search),
        )
        return cursor.fetchall()


def create_appointment(data, hospital_id=None):
    appointment_date = data["appointment_date"]
    appointment_day = str(appointment_date).split("T")[0].split(" ")[0]
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Resolve Patient ID (Generate permanent UMR if missing)
        resolved_patient_id = (data.get("patient_id") or "").strip()
        patient_name = (data.get("patient_name") or "").strip()
        patient_gender = (data.get("patient_gender") or data.get("gender") or "Male").strip().capitalize()
        if patient_gender not in ("Male", "Female"):
            patient_gender = "Other"
        patient_phone = (data.get("patient_phone") or data.get("phone") or "").strip()
        patient_age = data.get("patient_age") or data.get("age")
        if patient_age is not None:
            try:
                patient_age = int(patient_age)
            except Exception:
                patient_age = None

        if not resolved_patient_id:
            parts = patient_name.split(None, 1)
            first_name = parts[0] if parts else "Walk-in"
            last_name = parts[1] if len(parts) > 1 else ""

            # Check if matching patient exists
            cursor.execute(
                """
                SELECT patient_id FROM patients 
                WHERE hospital_id = ? AND deleted_at IS NULL 
                  AND LOWER(name) = LOWER(?) AND (LOWER(last_name) = LOWER(?) OR ? = '') 
                  AND (? = '' OR phone = ?)
                LIMIT 1 FOR UPDATE
                """,
                (scoped_hospital_id, first_name, last_name, last_name, patient_phone, patient_phone),
            )
            existing = cursor.fetchone()
            if existing:
                resolved_patient_id = existing["patient_id"]
            else:
                # Shared sequence, as generate_patient_id(): a max+1 scan here
                # collided with ids the sequence issued later.
                cursor.execute("SELECT nextval('patient_id_seq')")
                resolved_patient_id = f"PAT-{cursor.fetchone()[0]}"
                cursor.execute(
                    """
                    INSERT INTO patients (
                        hospital_id, patient_id, name, last_name, gender, age, phone
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (scoped_hospital_id, resolved_patient_id, first_name, last_name, patient_gender, patient_age, patient_phone),
                )

        cursor.execute(
            _to_sql_params(
                "SELECT COALESCE(MAX(token_no), 0) AS value FROM appointments "
                "WHERE DATE(appointment_date) = DATE(?) AND hospital_id = ?"
            ),
            (appointment_day, scoped_hospital_id),
        )
        token_no = int((cursor.fetchone() or {"value": 0})["value"] or 0) + 1

        # 2. Create Encounter if OP
        visit_type = data.get("visit_type", "OP")
        doctor_name = data.get("doctor_name")
        initial_status = data.get("status") or ("checked_in" if doctor_name else "scheduled")
        op_status = "doctor_assigned" if doctor_name else "queued"
        chief_complaint = data.get("chief_complaint") or data.get("notes") or ""
        symptoms = data.get("symptoms") or ""
        symptom_duration = data.get("symptom_duration") or ""
        symptom_severity = data.get("symptom_severity") or "moderate"
        created_by = data.get("created_by") or "reception"

        cursor.execute(
            """
            INSERT INTO encounters (
                patient_id, encounter_type, status, created_by, hospital_id, op_number,
                chief_complaint, symptoms, symptom_duration, symptom_severity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (
                resolved_patient_id, visit_type, initial_status, created_by, scoped_hospital_id,
                token_no, chief_complaint, symptoms, symptom_duration, symptom_severity
            ),
        )
        encounter_id = cursor.fetchone()[0]

        # 3. Create Appointment
        insert_sql = """
            INSERT INTO appointments (
                patient_id, patient_name, visit_type, department, doctor_name,
                appointment_date, token_no, status, notes, appointment_kind, follow_up_for,
                reminder_sent_at, no_show_marked, hospital_id, encounter_id,
                chief_complaint, symptoms, symptom_duration, symptom_severity,
                ai_recommendation, gender_preference, op_status, consultation_fee, payment_mode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
        """

        cursor.execute(
            _to_sql_params(insert_sql),
            (
                resolved_patient_id,
                patient_name,
                visit_type,
                data.get("department"),
                doctor_name,
                appointment_date,
                token_no,
                initial_status,
                data.get("notes"),
                data.get("appointment_kind", "new"),
                data.get("follow_up_for"),
                data.get("reminder_sent_at"),
                1 if data.get("no_show_marked") else 0,
                scoped_hospital_id,
                encounter_id,
                chief_complaint,
                symptoms,
                symptom_duration,
                symptom_severity,
                data.get("ai_recommendation"),
                data.get("gender_preference") or patient_gender,
                op_status,
                float(data.get("consultation_fee") or 0),
                data.get("payment_mode", "cash"),
            ),
        )

        appointment_id = cursor.fetchone()[0]
        cursor.execute("UPDATE encounters SET appointment_id = ? WHERE id = ?", (appointment_id, encounter_id))

        # 4. Record OP Timeline Event
        cursor.execute(
            """
            INSERT INTO op_timeline (
                hospital_id, appointment_id, encounter_id, patient_id, event_name, event_description, actor
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scoped_hospital_id, appointment_id, encounter_id, resolved_patient_id,
                "Registered",
                f"OP Visit registered. Assigned OP #{token_no} for UMR {resolved_patient_id}. Doctor: {doctor_name or 'Unassigned'}",
                created_by,
            ),
        )

        conn.commit()
        return appointment_id, token_no, resolved_patient_id


def record_op_timeline_event(appointment_id, event_name, event_description, actor=None, patient_id=None, encounter_id=None, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            p_id = patient_id
            enc_id = encounter_id
            if appointment_id and (not p_id or not enc_id):
                cursor.execute("SELECT patient_id, encounter_id FROM appointments WHERE id = ?", (appointment_id,))
                row = cursor.fetchone()
                if row:
                    p_id = p_id or row["patient_id"]
                    enc_id = enc_id or row["encounter_id"]
            if not p_id:
                p_id = "UNKNOWN"
            cursor.execute(
                """
                INSERT INTO op_timeline (hospital_id, appointment_id, encounter_id, patient_id, event_name, event_description, actor)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (scoped_hospital_id, appointment_id, enc_id, p_id, event_name, event_description, actor or "system"),
            )
            conn.commit()
    except Exception:
        pass


def check_patient_match(term, hospital_id=None):
    """Fast server-side search to detect whether a patient is NEW or ALREADY EXISTING."""
    if not term or len(term.strip()) < 2:
        return {"matches": [], "is_match": False}
    clean = term.strip()
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        search_pattern = f"%{clean}%"
        cursor.execute(
            """
            SELECT p.patient_id, p.name, p.middle_name, p.last_name, p.phone, p.gender, p.age, p.dob, p.blood_group, p.created_at,
                   (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.patient_id AND a.hospital_id = p.hospital_id AND a.visit_type = 'OP') AS total_op_visits
            FROM patients p
            WHERE p.hospital_id = ? AND p.deleted_at IS NULL
              AND (
                  p.patient_id ILIKE ?
                  OR p.name ILIKE ?
                  OR p.last_name ILIKE ?
                  OR p.phone ILIKE ?
                  OR (p.name || ' ' || COALESCE(p.last_name, '')) ILIKE ?
                  OR (p.name || ' ' || COALESCE(p.middle_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE ?
              )
            ORDER BY p.name ASC
            LIMIT 10
            """,
            (scoped_hospital_id, search_pattern, search_pattern, search_pattern, search_pattern, search_pattern, search_pattern),
        )
        rows = cursor.fetchall()
        matches = []
        for r in rows:
            full_name = f"{r['name']} {r['middle_name'] or ''} {r['last_name'] or ''}".strip()
            matches.append({
                "patient_id": r["patient_id"],
                "name": r["name"],
                "middle_name": r["middle_name"] or "",
                "last_name": r["last_name"] or "",
                "full_name": full_name,
                "phone": r["phone"] or "",
                "gender": r["gender"] or "Other",
                "age": r["age"],
                "dob": r["dob"],
                "blood_group": r["blood_group"] or "",
                "created_at": str(r["created_at"]) if r["created_at"] else "",
                "total_op_visits": r["total_op_visits"] or 0,
            })
        return {"matches": matches, "is_match": len(matches) > 0}


def get_eligible_op_doctors(department=None, patient_gender=None, doctor_gender_preference=None, hospital_id=None):
    """Implement gender-matching and availability rule for OP doctor assignment.
    Male Patient -> Male Doctor of Required Specialty
    Female Patient -> Female Doctor of Required Specialty
    Fallback to other available doctor of same specialty if none available."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    today = current_ist_datetime().strftime("%Y-%m-%d")

    desired_gender = (doctor_gender_preference or patient_gender or "").strip().capitalize()
    if desired_gender not in ("Male", "Female"):
        desired_gender = None

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, doctor_name, department, gender, consultation_fee, review_fee, status FROM doctors ORDER BY doctor_name ASC")
        doc_rows = cursor.fetchall()

        cursor.execute(
            """
            SELECT doctor_name, COUNT(*) as count
            FROM appointments
            WHERE hospital_id = ? AND visit_type = 'OP' AND DATE(appointment_date) = DATE(?)
              AND status IN ('scheduled', 'checked_in', 'in_consultation')
            GROUP BY doctor_name
            """,
            (scoped_hospital_id, today),
        )
        workload_map = {row["doctor_name"]: row["count"] for row in cursor.fetchall()}

        doctors_list = []
        for d in doc_rows:
            d_name = d["doctor_name"]
            d_dept = d["department"] or "General"
            d_gender = d["gender"] or "Male"
            d_status = (d["status"] or "available").lower()
            workload = workload_map.get(d_name, 0)

            dept_matches = True
            if department and department.strip():
                req_dept = department.strip().lower()
                dept_matches = req_dept in d_dept.lower() or d_dept.lower() in req_dept

            gender_matches = (desired_gender is None) or (d_gender.lower() == desired_gender.lower())
            is_available = (d_status == "available")

            score = 0
            if dept_matches:
                score += 100
            if gender_matches:
                score += 50
            if is_available:
                score += 30
            score += max(0, 20 - workload)

            doctors_list.append({
                "id": d["id"],
                "doctor_name": d_name,
                "department": d_dept,
                "gender": d_gender,
                "consultation_fee": d["consultation_fee"] or 0,
                "review_fee": d["review_fee"] or 0,
                "status": d_status,
                "current_workload": workload,
                "department_matches": dept_matches,
                "gender_matches": gender_matches,
                "is_available": is_available,
                "match_score": score,
            })

        doctors_list.sort(key=lambda x: (-x["match_score"], -int(x["department_matches"]), -int(x["gender_matches"]), x["current_workload"]))

        recommended = None
        # 1. Department match + Gender match + Available
        for doc in doctors_list:
            if doc["department_matches"] and doc["gender_matches"] and doc["is_available"]:
                recommended = doc
                break
        # 2. If primary doctor is unavailable/busy, fallback to another available doctor of SAME gender
        if not recommended:
            for doc in doctors_list:
                if doc["gender_matches"] and doc["is_available"]:
                    recommended = doc
                    break
        # 3. Department match + Available
        if not recommended:
            for doc in doctors_list:
                if doc["department_matches"] and doc["is_available"]:
                    recommended = doc
                    break
        if not recommended and doctors_list:
            recommended = doctors_list[0]

        recommendation_action = "assign" if (recommended and recommended["is_available"]) else "queue"

        return {
            "doctors": doctors_list,
            "recommended_doctor": recommended,
            "recommendation_action": recommendation_action,
            "desired_gender": desired_gender,
            "department": department,
        }


def new_invoice_no(prefix="INV"):
    """A unique invoice number: prefix, timestamp, random suffix.

    invoices.invoice_no is UNIQUE, and a bare timestamp to the second made two
    invoices raised in the same second (a busy counter, a double click) fail
    with a duplicate-key error.
    """
    import secrets

    return f"{prefix}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3).upper()}"


def _same_person(patient, details):
    """Whether a stored patient row and incoming registration details describe
    the same person: same first and last name, and the same phone when both
    sides have one."""
    def norm(value):
        return " ".join(str(value or "").split()).lower()

    first = norm(details.get("name") or details.get("first_name"))
    if norm(patient["name"]) != first or norm(patient["last_name"]) != norm(details.get("last_name")):
        return False
    stored_phone = "".join(ch for ch in str(patient["phone"] or "") if ch.isdigit())
    given_phone = "".join(ch for ch in str(details.get("phone") or "") if ch.isdigit())
    return not (stored_phone and given_phone and stored_phone != given_phone)


def register_op_visit(patient_data=None, patient_id=None, appointment_data=None, hospital_id=None):
    """Resolve one patient UMR and create one linked OP encounter atomically.
    1 PATIENT = 1 UMR | 1 OP VISIT = 1 OP NUMBER"""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    appointment_data = appointment_data or {}
    created_by = appointment_data.get("created_by") or "reception"

    with get_connection() as conn:
        cursor = conn.cursor()
        is_new_patient = False

        patient = None
        if patient_id:
            cursor.execute(
                "SELECT * FROM patients WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL FOR UPDATE",
                (patient_id, scoped_hospital_id),
            )
            patient = cursor.fetchone()
            # An unknown id with no details to create it from is an error. With
            # details, it is a patient registered at the front desk first (the
            # browser issues the UMR) whose record is reaching the backend now:
            # create it under that same id so both sides agree.
            if not patient and not patient_data:
                raise ValueError("Patient not found")
        # The front desk issues UMRs from a per-browser counter, so two browsers
        # can hand the same UMR to two different people. Filing the second
        # person's visit under the first person's record is a wrong-patient
        # merge; register them under a server-issued id instead.
        umr_conflict = bool(patient and patient_data and not _same_person(patient, patient_data))
        if umr_conflict:
            patient = None
        if patient:
            resolved_patient_id = patient_id
            patient_name = f"{patient['name']} {patient['last_name']}".strip()
            patient_gender = patient.get("gender") or "Other"
        else:
            is_new_patient = True
            required = dict(patient_data or {})
            required["name"] = required.get("name") or required.get("first_name")
            if not required.get("name") or not required.get("last_name"):
                raise ValueError("Patient name and last name are required")
            
            cursor.execute(
                "SELECT patient_id FROM patients WHERE hospital_id = ? AND deleted_at IS NULL AND LOWER(name) = LOWER(?) AND LOWER(last_name) = LOWER(?) AND (dob = ? OR phone = ?) FOR UPDATE",
                (scoped_hospital_id, required["name"], required["last_name"], required.get("dob"), required.get("phone")),
            )
            duplicate = cursor.fetchone()
            if duplicate:
                raise ValueError(f"Existing patient match found with UMR {duplicate['patient_id']}. Please select the existing patient.")

            resolved_patient_id = None if umr_conflict else patient_id
            if not resolved_patient_id:
                # The shared sequence, as generate_patient_id() uses. A
                # "highest PAT number + 1" scan here handed out numbers the
                # sequence later issued again -> duplicate-key 500s on the next
                # ordinary registration.
                cursor.execute("SELECT nextval('patient_id_seq')")
                resolved_patient_id = f"PAT-{cursor.fetchone()[0]}"
            cursor.execute(
                """
                INSERT INTO patients (
                    hospital_id, patient_id, name, middle_name, last_name, dob, age,
                    weight, height, gender, pregnant, allergies, symptoms, phone,
                    address, blood_group, emergency_contact, aadhar_number
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scoped_hospital_id, resolved_patient_id, required["name"], required.get("middle_name", ""),
                    required["last_name"], required.get("dob"), required.get("age"), required.get("weight"),
                    required.get("height"), required.get("gender") or "Other", 1 if required.get("pregnant") else 0,
                    required.get("allergies", ""), required.get("symptoms", ""), required.get("phone", ""),
                    required.get("address", ""), required.get("blood_group", ""), required.get("emergency_contact", ""),
                    required.get("aadhar_number", "")
                ),
            )
            patient_name = f"{required['name']} {required['last_name']}".strip()
            patient_gender = required.get("gender") or "Other"

        cursor.execute("LOCK TABLE appointments IN SHARE ROW EXCLUSIVE MODE")
        appt_date = appointment_data.get("appointment_date") or current_ist_datetime().isoformat()
        cursor.execute(
            "SELECT COALESCE(MAX(token_no), 0) AS value FROM appointments WHERE DATE(appointment_date) = DATE(?) AND hospital_id = ? AND visit_type = 'OP'",
            (appt_date, scoped_hospital_id),
        )
        token_no = int((cursor.fetchone() or {"value": 0})["value"] or 0) + 1

        doctor_name = appointment_data.get("doctor_name")
        initial_status = appointment_data.get("status") or ("checked_in" if doctor_name else "scheduled")
        op_status = "doctor_assigned" if doctor_name else "queued"

        chief_complaint = appointment_data.get("chief_complaint") or appointment_data.get("notes") or ""
        symptoms = appointment_data.get("symptoms") or ""
        symptom_duration = appointment_data.get("symptom_duration") or ""
        symptom_severity = appointment_data.get("symptom_severity") or "moderate"
        ai_rec = appointment_data.get("ai_recommendation") or ""
        gender_pref = appointment_data.get("gender_preference") or patient_gender
        consultation_fee = float(appointment_data.get("consultation_fee") or 0)
        payment_mode = appointment_data.get("payment_mode") or "cash"

        cursor.execute(
            """
            INSERT INTO encounters (
                patient_id, encounter_type, status, created_by, hospital_id, op_number,
                chief_complaint, symptoms, symptom_duration, symptom_severity
            ) VALUES (?, 'OP', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (
                resolved_patient_id, initial_status, created_by, scoped_hospital_id,
                token_no, chief_complaint, symptoms, symptom_duration, symptom_severity
            ),
        )
        encounter_id = cursor.fetchone()[0]

        cursor.execute(
            """
            INSERT INTO appointments (
                patient_id, patient_name, visit_type, department, doctor_name,
                appointment_date, token_no, status, notes, appointment_kind,
                follow_up_for, hospital_id, encounter_id, chief_complaint, symptoms,
                symptom_duration, symptom_severity, ai_recommendation, gender_preference,
                op_status, consultation_fee, payment_mode, checked_in_at
            ) VALUES (?, ?, 'OP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            RETURNING id
            """,
            (
                resolved_patient_id, patient_name, appointment_data.get("department"), doctor_name,
                appt_date, token_no, initial_status, appointment_data.get("notes"),
                appointment_data.get("appointment_kind", "new" if is_new_patient else "revisit"),
                appointment_data.get("follow_up_for"), scoped_hospital_id, encounter_id,
                chief_complaint, symptoms, symptom_duration, symptom_severity, ai_rec,
                gender_pref, op_status, consultation_fee, payment_mode
            ),
        )
        appointment_id = cursor.fetchone()[0]

        cursor.execute("UPDATE encounters SET appointment_id = ? WHERE id = ?", (appointment_id, encounter_id))

        cursor.execute(
            """
            INSERT INTO op_timeline (
                hospital_id, appointment_id, encounter_id, patient_id, event_name, event_description, actor
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scoped_hospital_id, appointment_id, encounter_id, resolved_patient_id,
                "Registered",
                f"OP Visit registered. Assigned OP #{token_no} for UMR {resolved_patient_id} ({'New Patient' if is_new_patient else 'Revisit'}). Doctor: {doctor_name or 'Unassigned'}",
                created_by
            ),
        )

        if consultation_fee > 0:
            cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM invoices")
            next_inv_id = cursor.fetchone()[0]
            invoice_no = f"INV-OP-{next_inv_id:05d}"
            cursor.execute(
                """
                INSERT INTO invoices (
                    invoice_no, patient_id, module, doctor_name, subtotal, tax, discount,
                    total_amount, paid_amount, due_amount, payment_status, created_by,
                    hospital_id, appointment_id, encounter_id
                ) VALUES (?, ?, 'OP', ?, ?, 0, 0, ?, ?, 0, 'paid', ?, ?, ?, ?)
                RETURNING id
                """,
                (
                    invoice_no, resolved_patient_id, doctor_name or "OP Desk", consultation_fee,
                    consultation_fee, consultation_fee, created_by, scoped_hospital_id,
                    appointment_id, encounter_id
                ),
            )
            inv_id = cursor.fetchone()[0]
            cursor.execute(
                """
                INSERT INTO invoice_payments (
                    invoice_id, amount, payment_mode, created_by, hospital_id
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (inv_id, consultation_fee, payment_mode, created_by, scoped_hospital_id),
            )

        conn.commit()
        return {
            "patient_id": resolved_patient_id,
            "encounter_id": encounter_id,
            "appointment_id": appointment_id,
            "op_number": token_no,
            "patient_name": patient_name,
            "is_new_patient": is_new_patient,
            # The caller's UMR belongs to someone else; patient_id is the id
            # this patient was actually registered under.
            "umr_conflict": umr_conflict,
            "requested_patient_id": patient_id,
            "status": initial_status,
            "op_status": op_status,
        }


def list_appointments(
    appointment_date=None,
    status=None,
    visit_type=None,
    doctor_name=None,
    patient_id=None,
    hospital_id=None,
):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if hospital_id:
            clauses.append("a.hospital_id = ?")
            params.append(hospital_id)
        if appointment_date:
            clauses.append("DATE(a.appointment_date) = DATE(?)")
            params.append(appointment_date)
        if status:
            clauses.append("a.status = ?")
            params.append(status)
        if visit_type:
            clauses.append("a.visit_type = ?")
            params.append(visit_type)
        if doctor_name:
            clauses.append("a.doctor_name = ?")
            params.append(doctor_name)
        if patient_id:
            clauses.append("a.patient_id = ?")
            params.append(patient_id)
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"SELECT a.*, p.phone as patient_phone, p.symptoms as patient_symptoms, p.gender as patient_gender, p.age as patient_age, p.blood_group as patient_blood_group FROM appointments a LEFT JOIN patients p ON a.patient_id = p.patient_id AND a.hospital_id = p.hospital_id{where_clause} ORDER BY a.appointment_date ASC, a.token_no ASC",
            tuple(params),
        )
        return cursor.fetchall()


def get_op_visit(appointment_id, hospital_id=None):
    return get_appointment_by_id(appointment_id, hospital_id=hospital_id)


def update_op_symptoms(appointment_id, data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE appointments
            SET chief_complaint = ?, symptoms = ?, symptom_duration = ?, symptom_severity = ?, ai_recommendation = ?
            WHERE id = ? AND hospital_id = ? AND status NOT IN ('completed', 'cancelled')
            """,
            (
                data.get("chief_complaint"), data.get("symptoms"),
                data.get("symptom_duration"), data.get("symptom_severity"),
                data.get("ai_recommendation"), appointment_id, scoped_hospital_id
            ),
        )
        if cursor.rowcount:
            cursor.execute(
                """
                UPDATE encounters
                SET chief_complaint = ?, symptoms = ?, symptom_duration = ?, symptom_severity = ?
                WHERE appointment_id = ? AND hospital_id = ?
                """,
                (
                    data.get("chief_complaint"), data.get("symptoms"),
                    data.get("symptom_duration"), data.get("symptom_severity"),
                    appointment_id, scoped_hospital_id
                ),
            )
            record_op_timeline_event(
                appointment_id, "Symptoms Updated",
                f"Symptoms updated: {data.get('chief_complaint') or ''} {data.get('symptoms') or ''}",
                hospital_id=scoped_hospital_id
            )
        conn.commit()
        return cursor.rowcount > 0


def transition_op_status(appointment_id, status, hospital_id=None, actor=None):
    allowed = {
        "scheduled": {"checked_in", "in_consultation", "cancelled"},
        "checked_in": {"in_consultation", "completed", "cancelled"},
        "in_consultation": {"completed", "post_consultation", "cancelled"},
        "post_consultation": {"completed"},
        "completed": set(),
        "cancelled": set(),
    }
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status, doctor_name FROM appointments WHERE id = ? AND hospital_id = ? FOR UPDATE", (appointment_id, scoped_hospital_id))
        row = cursor.fetchone()
        if not row:
            return "not_found"
        if status not in allowed.get(row["status"], set()):
            return "invalid_transition"
        timestamp_column = _APPOINTMENT_STATUS_TIMESTAMP_COLUMNS.get(status)
        if timestamp_column:
            cursor.execute(f"UPDATE appointments SET status = ?, {timestamp_column} = COALESCE({timestamp_column}, CURRENT_TIMESTAMP) WHERE id = ? AND hospital_id = ?", (status, appointment_id, scoped_hospital_id))
        else:
            cursor.execute("UPDATE appointments SET status = ? WHERE id = ? AND hospital_id = ?", (status, appointment_id, scoped_hospital_id))
        cursor.execute("UPDATE encounters SET status = ? WHERE appointment_id = ? AND hospital_id = ?", (status, appointment_id, scoped_hospital_id))

        record_op_timeline_event(
            appointment_id, f"Status: {status.replace('_', ' ').title()}",
            f"OP Visit transitioned from {row['status']} to {status}",
            actor=actor, hospital_id=scoped_hospital_id
        )
        conn.commit()
        return "ok"


def save_op_consultation(appointment_id, data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    doctor_username = data.get("doctor_username") or "doctor"
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM appointments WHERE id = ? AND hospital_id = ? FOR UPDATE", (appointment_id, scoped_hospital_id))
        appointment = cursor.fetchone()
        if not appointment:
            return "not_found"
        if appointment["status"] not in ("checked_in", "in_consultation", "scheduled"):
            return "invalid_status"

        # Save Clinical Notes
        cursor.execute(
            """
            INSERT INTO clinical_notes (encounter_id, patient_id, chief_complaint, notes, follow_up)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                appointment["encounter_id"], appointment["patient_id"],
                data.get("chief_complaint") or appointment.get("chief_complaint") or "",
                data.get("advice") or data.get("notes") or "",
                data.get("follow_up")
            ),
        )

        # Save Diagnosis Record
        diagnosis = (data.get("diagnosis") or "").strip()
        if diagnosis:
            cursor.execute(
                "INSERT INTO diagnosis_records (encounter_id, patient_id, diagnosis_name) VALUES (?, ?, ?)",
                (appointment["encounter_id"], appointment["patient_id"], diagnosis),
            )

        # Save Prescriptions
        medicines = data.get("medicines")
        if medicines:
            cursor.execute(
                """
                INSERT INTO pharmacy_prescriptions (hospital_id, patient_id, doctor_username, doc_id, medicines_json)
                VALUES (?, ?, ?, ?, ?) RETURNING id
                """,
                (scoped_hospital_id, appointment["patient_id"], doctor_username, None, json.dumps(medicines)),
            )

        # Save Lab / Diagnostic orders if any
        tests = data.get("tests") or []
        if isinstance(tests, list):
            for t in tests:
                test_name = t if isinstance(t, str) else t.get("name") or t.get("test_name")
                if test_name:
                    cursor.execute(
                        """
                        INSERT INTO diagnostics (hospital_id, patient_id, doctor_name, test_name, amount, order_status, status, created_by)
                        VALUES (?, ?, ?, ?, 0, 'ordered', 'due', ?)
                        """,
                        (scoped_hospital_id, appointment["patient_id"], appointment.get("doctor_name") or doctor_username, test_name, doctor_username),
                    )

        further_action = (data.get("further_action") or "none").lower()
        further_action_notes = data.get("further_action_notes") or ""

        # Update appointment & encounter
        cursor.execute(
            """
            UPDATE appointments
            SET status = 'completed',
                op_status = 'consultation_completed',
                further_action = ?,
                further_action_notes = ?,
                consultation_completed_at = COALESCE(consultation_completed_at, CURRENT_TIMESTAMP)
            WHERE id = ? AND hospital_id = ?
            """,
            (further_action, further_action_notes, appointment_id, scoped_hospital_id),
        )
        cursor.execute(
            "UPDATE encounters SET status = 'completed', further_action = ? WHERE id = ? AND hospital_id = ?",
            (further_action, appointment["encounter_id"], scoped_hospital_id),
        )

        record_op_timeline_event(
            appointment_id, "Consultation Completed",
            f"Doctor consultation completed. Diagnosis: {diagnosis or 'None specified'}. Further action: {further_action}",
            actor=doctor_username, hospital_id=scoped_hospital_id
        )

        conn.commit()
        return "ok"


def add_op_vitals(appointment_id, data, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT patient_id, encounter_id FROM appointments WHERE id = ? AND hospital_id = ?", (appointment_id, scoped_hospital_id))
        appointment = cursor.fetchone()
        if not appointment:
            return None

        bp = data.get("bp") or data.get("blood_pressure")
        pulse = data.get("pulse") or data.get("heart_rate")
        temp = data.get("temperature")
        spo2 = data.get("spo2")
        resp_rate = data.get("respiratory_rate")
        weight = data.get("weight")
        glucose = data.get("blood_glucose")
        notes = data.get("notes")
        recorded_by = actor or data.get("recorded_by") or "nurse"

        cursor.execute(
            """
            INSERT INTO patient_vitals (
                encounter_id, patient_id, bp, pulse, temperature,
                spo2, respiratory_rate, weight, blood_glucose, notes, recorded_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (
                appointment["encounter_id"], appointment["patient_id"],
                bp, pulse, temp, spo2, resp_rate, weight, glucose, notes, recorded_by
            ),
        )
        vital_id = cursor.fetchone()[0]

        summary_parts = []
        if bp: summary_parts.append(f"BP: {bp}")
        if pulse: summary_parts.append(f"HR: {pulse}")
        if temp: summary_parts.append(f"Temp: {temp}")
        if spo2: summary_parts.append(f"SpO2: {spo2}%")
        if weight: summary_parts.append(f"Weight: {weight}kg")

        record_op_timeline_event(
            appointment_id, "Vitals Recorded",
            f"Vitals recorded: {', '.join(summary_parts) if summary_parts else 'Recorded'}",
            actor=recorded_by, hospital_id=scoped_hospital_id
        )

        conn.commit()
        return vital_id


def assign_op_doctor(appointment_id, doctor_name, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM appointments WHERE id = ? AND hospital_id = ? FOR UPDATE", (appointment_id, scoped_hospital_id))
        appointment = cursor.fetchone()
        if not appointment:
            return "not_found"

        cursor.execute("SELECT doctor_name, department, status, gender FROM doctors WHERE LOWER(doctor_name) = LOWER(?)", (doctor_name.strip(),))
        doctor = cursor.fetchone()
        if not doctor:
            cursor.execute("SELECT full_name as doctor_name, department, status FROM users WHERE hospital_id = ? AND job_role = 'Doctor' AND LOWER(full_name) = LOWER(?)", (scoped_hospital_id, doctor_name.strip()))
            doctor = cursor.fetchone()

        if not doctor:
            return "unavailable"

        cursor.execute(
            """
            UPDATE appointments
            SET doctor_name = ?, department = COALESCE(?, department), status = 'checked_in', op_status = 'doctor_assigned'
            WHERE id = ? AND hospital_id = ?
            """,
            (doctor["doctor_name"], doctor.get("department"), appointment_id, scoped_hospital_id),
        )

        record_op_timeline_event(
            appointment_id, "Doctor Assigned",
            f"Patient assigned to {doctor['doctor_name']} ({doctor.get('department') or 'General'})",
            actor=actor, hospital_id=scoped_hospital_id
        )

        conn.commit()
        return "ok"


def set_op_further_action(appointment_id, action, notes=None, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM appointments WHERE id = ? AND hospital_id = ? FOR UPDATE", (appointment_id, scoped_hospital_id))
        appointment = cursor.fetchone()
        if not appointment:
            return "not_found"

        clean_action = (action or "none").lower()
        cursor.execute(
            "UPDATE appointments SET further_action = ?, further_action_notes = ? WHERE id = ? AND hospital_id = ?",
            (clean_action, notes or "", appointment_id, scoped_hospital_id),
        )
        if appointment.get("encounter_id"):
            cursor.execute(
                "UPDATE encounters SET further_action = ? WHERE id = ? AND hospital_id = ?",
                (clean_action, appointment["encounter_id"], scoped_hospital_id),
            )

        record_op_timeline_event(
            appointment_id, "Further Action Routed",
            f"Next Action: {clean_action.upper()}{' - ' + notes if notes else ''}",
            actor=actor, hospital_id=scoped_hospital_id
        )

        conn.commit()
        return "ok"


def get_op_timeline(appointment_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM op_timeline WHERE appointment_id = ? AND hospital_id = ? ORDER BY created_at ASC, id ASC",
            (appointment_id, scoped_hospital_id),
        )
        return cursor.fetchall()


def get_op_patient_history(patient_id, hospital_id=None):
    """Retrieve full history of OP visits, prescriptions, diagnoses, and vitals for a patient UMR."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT a.*, e.op_number as encounter_op_number, e.chief_complaint as encounter_complaint, e.symptoms as encounter_symptoms
            FROM appointments a
            LEFT JOIN encounters e ON a.encounter_id = e.id
            WHERE a.patient_id = ? AND a.hospital_id = ? AND a.visit_type = 'OP'
            ORDER BY a.appointment_date DESC, a.token_no DESC
            """,
            (patient_id, scoped_hospital_id),
        )
        visits = cursor.fetchall()
        history = []
        for v in visits:
            enc_id = v.get("encounter_id")
            diagnoses = []
            notes = []
            prescriptions = []
            vitals = []

            if enc_id:
                cursor.execute("SELECT diagnosis_name, created_at FROM diagnosis_records WHERE encounter_id = ? ORDER BY id ASC", (enc_id,))
                diagnoses = [r["diagnosis_name"] for r in cursor.fetchall()]

                cursor.execute("SELECT notes, follow_up, created_at FROM clinical_notes WHERE encounter_id = ? ORDER BY id ASC", (enc_id,))
                notes = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM patient_vitals WHERE encounter_id = ? ORDER BY created_at ASC", (enc_id,))
                vitals = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT id, doctor_username, medicines_json, created_at FROM pharmacy_prescriptions WHERE patient_id = ? ORDER BY id DESC LIMIT 5", (patient_id,))
            for pr in cursor.fetchall():
                try:
                    meds = json.loads(pr["medicines_json"]) if pr.get("medicines_json") else []
                except Exception:
                    meds = []
                prescriptions.append({"id": pr["id"], "doctor_username": pr["doctor_username"], "medicines": meds, "created_at": pr["created_at"]})

            history.append({
                "appointment_id": v["id"],
                "token_no": v["token_no"],
                "appointment_date": str(v["appointment_date"]),
                "doctor_name": v["doctor_name"],
                "department": v["department"],
                "status": v["status"],
                "chief_complaint": v.get("chief_complaint") or v.get("encounter_complaint") or "",
                "symptoms": v.get("symptoms") or v.get("encounter_symptoms") or "",
                "symptom_duration": v.get("symptom_duration") or "",
                "symptom_severity": v.get("symptom_severity") or "",
                "further_action": v.get("further_action") or "none",
                "diagnoses": diagnoses,
                "clinical_notes": notes,
                "prescriptions": prescriptions,
                "vitals": vitals,
            })
        return history


def get_op_summary(target_date=None, hospital_id=None):
    day = target_date or current_ist_datetime().strftime("%Y-%m-%d")
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        total_appointments = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND appointment_kind = 'new' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        new_patients = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND appointment_kind IN ('revisit', 'follow_up') AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        follow_ups = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND status = 'scheduled' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        awaiting_doctor = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND status = 'checked_in' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        active_queue = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND status = 'in_consultation' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        in_consultation = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND status = 'completed' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        completed_visits = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND no_show_marked = 1 AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        no_shows = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND reminder_sent_at IS NOT NULL AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        reminders_sent = cursor.fetchone()["value"]

        cursor.execute("SELECT COUNT(*) AS value FROM doctors WHERE status = 'available'")
        available_doctors = cursor.fetchone()["value"]

        cursor.execute("SELECT COUNT(*) AS value FROM doctors WHERE status = 'busy'")
        busy_doctors = cursor.fetchone()["value"]

        cursor.execute("SELECT COUNT(*) AS value FROM doctors WHERE status IN ('leave', 'inactive')")
        leave_doctors = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM invoices WHERE hospital_id = ? AND module = 'OP' AND payment_status = 'due' AND DATE(created_at) = DATE(?)",
            (scoped_hospital_id, day),
        )
        pending_billing = cursor.fetchone()["value"]

        cursor.execute(
            "SELECT COUNT(*) AS value FROM diagnostics WHERE hospital_id = ? AND status = 'ordered' AND DATE(created_at) = DATE(?)",
            (scoped_hospital_id, day),
        )
        pending_investigations = cursor.fetchone()["value"]

    return {
        "date": day,
        "total_appointments": total_appointments,
        "new_patients": new_patients,
        "follow_ups": follow_ups,
        "awaiting_doctor": awaiting_doctor,
        "active_queue": active_queue,
        "in_consultation": in_consultation,
        "completed": completed_visits,
        "no_shows": no_shows,
        "reminders_sent": reminders_sent,
        "available_doctors": available_doctors,
        "busy_doctors": busy_doctors,
        "leave_doctors": leave_doctors,
        "pending_billing": pending_billing,
        "pending_investigations": pending_investigations,
    }


def get_appointment_by_id(appointment_id, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if hospital_id:
            cursor.execute(
                "SELECT * FROM appointments WHERE id = ? AND hospital_id = ?",
                (appointment_id, hospital_id),
            )
        else:
            cursor.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,))
        return cursor.fetchone()


# Status -> timestamp column recorded the FIRST time an appointment transitions
# into that status. Keyed by status value so update_appointment can stamp the
# real moment each stage happened, not just the current status -- nothing
# previously persisted this, only the latest status string.
_APPOINTMENT_STATUS_TIMESTAMP_COLUMNS = {
    "checked_in": "checked_in_at",
    "in_consultation": "consultation_started_at",
    "completed": "consultation_completed_at",
}


def update_appointment(appointment_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM appointments WHERE id = ?", (appointment_id,))
        existing = cursor.fetchone()
        if not existing:
            return False

        new_status = data.get("status", existing["status"])
        stamp_column = _APPOINTMENT_STATUS_TIMESTAMP_COLUMNS.get(new_status)
        checked_in_at = existing["checked_in_at"]
        consultation_started_at = existing["consultation_started_at"]
        consultation_completed_at = existing["consultation_completed_at"]
        if stamp_column and new_status != existing["status"]:
            now = current_ist_timestamp()
            if stamp_column == "checked_in_at":
                checked_in_at = now
            elif stamp_column == "consultation_started_at":
                consultation_started_at = now
            elif stamp_column == "consultation_completed_at":
                consultation_completed_at = now

        cursor.execute(
            """
            UPDATE appointments
            SET patient_id = ?,
                patient_name = ?,
                visit_type = ?,
                department = ?,
                doctor_name = ?,
                appointment_date = ?,
                status = ?,
                notes = ?,
                appointment_kind = ?,
                follow_up_for = ?,
                reminder_sent_at = ?,
                no_show_marked = ?,
                checked_in_at = ?,
                consultation_started_at = ?,
                consultation_completed_at = ?
            WHERE id = ?
            """,
            (
                data.get("patient_id", existing["patient_id"]),
                data.get("patient_name", existing["patient_name"]),
                data.get("visit_type", existing["visit_type"]),
                data.get("department", existing["department"]),
                data.get("doctor_name", existing["doctor_name"]),
                data.get("appointment_date", existing["appointment_date"]),
                new_status,
                data.get("notes", existing["notes"]),
                data.get("appointment_kind", existing["appointment_kind"]),
                data.get("follow_up_for", existing["follow_up_for"]),
                data.get("reminder_sent_at", existing["reminder_sent_at"]),
                1 if data.get("no_show_marked", existing["no_show_marked"]) else 0,
                checked_in_at,
                consultation_started_at,
                consultation_completed_at,
                appointment_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


# --- Doctors (Static) ---


def create_doctor(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            _to_sql_params("""
            INSERT INTO doctors (
                doctor_name, department, consultation_fee, review_fee, status
            ) VALUES (?, ?, ?, ?, ?)
            """),
            (
                data.get("doctor_name"),
                data.get("department"),
                float(data.get("consultation_fee", 0)),
                float(data.get("review_fee", 0)),
                data.get("status", "available"),
            ),
        )
        doctor_id = cursor.lastrowid
        conn.commit()
        return doctor_id


def list_doctors(department=None, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        # Only return doctors added via the Employee Management (users table) for this hospital
        query = """
            SELECT
                u.id as id,
                u.full_name as doctor_name,
                u.department as department,
                0.0 as consultation_fee,
                0.0 as review_fee,
                u.status as status,
                'users' as source
            FROM users u
            WHERE u.job_role = 'Doctor' AND u.hospital_id = ?
        """
        if department:
            cursor.execute(
                _to_sql_params(
                    f"SELECT * FROM ({query}) AS combined WHERE department = ? ORDER BY doctor_name"
                ),
                (scoped_hospital_id, department),
            )
        else:
            cursor.execute(
                _to_sql_params(
                    f"SELECT * FROM ({query}) AS combined ORDER BY doctor_name"
                ),
                (scoped_hospital_id,),
            )
        return [dict(row) for row in cursor.fetchall()]


def update_doctor(doctor_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        updates = []
        params = []
        for key in [
            "doctor_name",
            "department",
            "consultation_fee",
            "review_fee",
            "status",
        ]:
            if key in data:
                updates.append(f"{key} = ?")
                val = data[key]
                if key in ["consultation_fee", "review_fee"]:
                    val = float(val)
                params.append(val)
        if not updates:
            return False
        params.append(doctor_id)
        sql = _to_sql_params(f"UPDATE doctors SET {', '.join(updates)} WHERE id = ?")
        cursor.execute(sql, tuple(params))
        conn.commit()
        return cursor.rowcount > 0


def delete_doctor(doctor_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(_to_sql_params("DELETE FROM doctors WHERE id = ?"), (doctor_id,))
        conn.commit()
        return cursor.rowcount > 0


def get_suggested_doctors(department=None, region=None, hospital_id=None):
    # Previously always resolve_hospital_id() regardless of what the caller
    # actually wanted -- that falls back to the platform's DEFAULT hospital
    # whenever it's not given an explicit code, not "whichever hospital is
    # asking." assign_er_doctor() (and any other caller) passing its own
    # hospital_id was silently discarded, so a non-default hospital's ER
    # visit could get auto-assigned a doctor who works at a different
    # hospital entirely, or told "no doctor on staff" while its own roster
    # has one.
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    region_dept_map = {
        "chest": "Cardiology",
        "head": "Neurology",
        "neck": "ENT",
        "abdomen": "General Medicine",
        "hips": "Orthopedics",
        "thighs": "Orthopedics",
        "knees": "Orthopedics",
        "feet": "Orthopedics",
        "arms": "Orthopedics",
        "skin": "Dermatology",
        "full_body": "General Medicine",
    }
    target_dept = department
    if not target_dept and region:
        target_dept = region_dept_map.get(region.lower(), "General Medicine")

    with get_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT 
                id as id,
                full_name as doctor_name,
                department as department,
                0.0 as consultation_fee,
                0.0 as review_fee,
                status as status
            FROM users
            WHERE job_role = 'Doctor' AND hospital_id = ?
        """
        if target_dept:
            cursor.execute(
                _to_sql_params(
                    f"SELECT * FROM ({query}) AS combined WHERE LOWER(department) LIKE LOWER(?) ORDER BY doctor_name"
                ),
                (
                    scoped_hospital_id,
                    f"%{target_dept}%",
                ),
            )
            matched = [dict(row) for row in cursor.fetchall()]
            if matched:
                return matched
        cursor.execute(
            _to_sql_params(f"SELECT * FROM ({query}) AS combined ORDER BY doctor_name"),
            (scoped_hospital_id,),
        )
        return [dict(row) for row in cursor.fetchall()]


def match_doctor_to_department(available_doctors, department):
    """Picks the first entry from available_doctors (each formatted
    "Name (Department)") whose parenthetical department matches department,
    case-insensitively. Returns the doctor's name, or "" if none match.
    Extracted from Symptom AI triage's deterministic doctor-matching fallback
    (the local model doesn't reliably pick a doctor even when one is
    available for the chosen department) so ER doctor assignment can reuse
    the exact same mechanism -- same "suggest, don't decide" discipline in
    both places."""
    target = (department or "").strip().lower()
    if not target:
        return ""
    for doc_entry in available_doctors or []:
        m = re.match(r"^(.*)\(([^()]*)\)\s*$", doc_entry.strip())
        doc_name, doc_dept = (
            (m.group(1).strip(), m.group(2).strip().lower())
            if m
            else (doc_entry.strip(), "")
        )
        if doc_dept == target:
            return doc_name
    return ""


def create_doctor_schedule(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO doctor_schedules (
                doctor_name, department, schedule_date, start_time, end_time,
                slot_capacity, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["doctor_name"],
                data.get("department"),
                data["schedule_date"],
                data["start_time"],
                data["end_time"],
                int(data.get("slot_capacity", 12) or 12),
                data.get("status", "available"),
                data.get("notes"),
            ),
        )
        schedule_id = cursor.lastrowid
        conn.commit()
        return schedule_id


def list_doctor_schedules(schedule_date=None, doctor_name=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if schedule_date:
            clauses.append("schedule_date = ?")
            params.append(schedule_date)
        if doctor_name:
            clauses.append("doctor_name = ?")
            params.append(doctor_name)
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"SELECT * FROM doctor_schedules{where_clause} ORDER BY schedule_date ASC, start_time ASC",
            tuple(params),
        )
        return cursor.fetchall()


def update_doctor_schedule(schedule_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM doctor_schedules WHERE id = ?", (schedule_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE doctor_schedules
            SET doctor_name = ?, department = ?, schedule_date = ?, start_time = ?,
                end_time = ?, slot_capacity = ?, status = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("doctor_name", existing["doctor_name"]),
                data.get("department", existing["department"]),
                data.get("schedule_date", existing["schedule_date"]),
                data.get("start_time", existing["start_time"]),
                data.get("end_time", existing["end_time"]),
                int(data.get("slot_capacity", existing["slot_capacity"] or 12)),
                data.get("status", existing["status"]),
                data.get("notes", existing["notes"]),
                schedule_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_doctor_schedule(schedule_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "doctor_schedules", "id", schedule_id, actor=actor
        )
        conn.commit()
        return deleted


def get_op_summary(target_date=None, hospital_id=None):
    day = target_date or current_ist_datetime().strftime("%Y-%m-%d")
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        total_appointments = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND appointment_kind = 'follow_up' AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        follow_ups = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND status IN ('checked_in', 'in_consultation') AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        active_queue = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND no_show_marked = 1 AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        no_shows = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM appointments WHERE hospital_id = ? AND visit_type = 'OP' AND reminder_sent_at IS NOT NULL AND DATE(appointment_date) = DATE(?)",
            (scoped_hospital_id, day),
        )
        reminders_sent = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM doctor_schedules WHERE schedule_date = ? AND status = 'available'",
            (day,),
        )
        available_doctors = cursor.fetchone()["value"]
    return {
        "date": day,
        "total_appointments": total_appointments,
        "follow_ups": follow_ups,
        "active_queue": active_queue,
        "no_shows": no_shows,
        "reminders_sent": reminders_sent,
        "available_doctors": available_doctors,
    }


def create_patient_consent(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO patient_consents (
                hospital_id, patient_id, patient_name, consent_type, signed_by, relation_to_patient,
                witness_doctor, signed_by_phone, refusal_reason, legal_waiver_acknowledged,
                er_visit_id, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
            """,
            (
                scoped_hospital_id,
                data.get("patient_id"),
                data["patient_name"],
                data.get("consent_type", "general"),
                data["signed_by"],
                data.get("relation_to_patient"),
                data.get("witness_doctor"),
                data.get("signed_by_phone"),
                data.get("refusal_reason"),
                bool(data.get("legal_waiver_acknowledged", False)),
                data.get("er_visit_id"),
                data.get("status", "signed"),
                data.get("notes"),
            ),
        )
        consent_id = cursor.fetchone()[0]
        conn.commit()
        return consent_id


def list_patient_consents(patient_id=None, er_visit_id=None, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["hospital_id = ?", "deleted_at IS NULL"]
        params = [scoped_hospital_id]
        if patient_id:
            clauses.append("patient_id = ?")
            params.append(patient_id)
        if er_visit_id:
            clauses.append("er_visit_id = ?")
            params.append(er_visit_id)
        cursor.execute(
            f"""
            SELECT id, hospital_id, er_visit_id, patient_id, patient_name, consent_type,
                   signed_by, relation_to_patient, witness_doctor, signed_by_phone,
                   refusal_reason, legal_waiver_acknowledged, status, notes, signed_at,
                   document_filename, document_mime_type
            FROM patient_consents WHERE {' AND '.join(clauses)}
            ORDER BY signed_at DESC, id DESC
            """,
            tuple(params),
        )
        return cursor.fetchall()


def attach_consent_document(hospital_id, consent_id, filename, mime_type, data):
    """Stores a photo/scan of a physically-signed paper consent form against
    an existing consent record. One attachment per consent (re-uploading
    replaces it)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE patient_consents SET document_filename = ?, document_mime_type = ?, document_data = ? "
            "WHERE id = ? AND hospital_id = ? RETURNING id",
            (filename, mime_type, psycopg2.Binary(data), consent_id, hospital_id),
        )
        row = cursor.fetchone()
        conn.commit()
        return bool(row)


def get_consent_document(hospital_id, consent_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT document_filename, document_mime_type, document_data "
            "FROM patient_consents WHERE id = ? AND hospital_id = ?",
            (consent_id, hospital_id),
        )
        row = cursor.fetchone()
        if not row or not row["document_data"]:
            return None
        return {
            "filename": row["document_filename"],
            "mime_type": row["document_mime_type"],
            "data": bytes(row["document_data"]),
        }


def update_patient_consent(consent_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM patient_consents WHERE id = ?", (consent_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE patient_consents
            SET patient_id = ?, patient_name = ?, consent_type = ?, signed_by = ?,
                relation_to_patient = ?, status = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("patient_id", existing["patient_id"]),
                data.get("patient_name", existing["patient_name"]),
                data.get("consent_type", existing["consent_type"]),
                data.get("signed_by", existing["signed_by"]),
                data.get("relation_to_patient", existing["relation_to_patient"]),
                data.get("status", existing["status"]),
                data.get("notes", existing["notes"]),
                consent_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def create_insurance_verification(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO insurance_verifications (
                patient_id, patient_name, insurer_name, policy_number, member_id,
                verification_status, coverage_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("patient_id"),
                data["patient_name"],
                data["insurer_name"],
                data.get("policy_number"),
                data.get("member_id"),
                data.get("verification_status", "pending"),
                data.get("coverage_notes"),
            ),
        )
        verification_id = cursor.lastrowid
        conn.commit()
        return verification_id


def list_insurance_verifications(patient_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if patient_id:
            cursor.execute(
                "SELECT * FROM insurance_verifications WHERE patient_id = ? ORDER BY checked_at DESC, id DESC",
                (patient_id,),
            )
        else:
            cursor.execute(
                "SELECT * FROM insurance_verifications ORDER BY checked_at DESC, id DESC"
            )
        return cursor.fetchall()


def update_insurance_verification(verification_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM insurance_verifications WHERE id = ?",
            (verification_id,),
        )
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE insurance_verifications
            SET patient_id = ?, patient_name = ?, insurer_name = ?, policy_number = ?,
                member_id = ?, verification_status = ?, coverage_notes = ?
            WHERE id = ?
            """,
            (
                data.get("patient_id", existing["patient_id"]),
                data.get("patient_name", existing["patient_name"]),
                data.get("insurer_name", existing["insurer_name"]),
                data.get("policy_number", existing["policy_number"]),
                data.get("member_id", existing["member_id"]),
                data.get("verification_status", existing["verification_status"]),
                data.get("coverage_notes", existing["coverage_notes"]),
                verification_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def create_certificate(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO certificates (
                patient_id, admission_id, certificate_type, title, body, issued_by
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data.get("admission_id"),
                data["certificate_type"],
                data["title"],
                data["body"],
                data.get("issued_by"),
            ),
        )
        certificate_id = cursor.lastrowid
        conn.commit()

    try:
        from core.tasks import process_document_embedding_task

        process_document_embedding_task.delay(
            "certificates",
            certificate_id,
            data["body"],
            hospital_id=None,
            patient_id=data["patient_id"],
        )
    except Exception:
        pass

    return certificate_id


def list_certificates(patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM certificates WHERE patient_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
            (patient_id,),
        )
        return cursor.fetchall()


def delete_certificate(certificate_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "certificates", "id", certificate_id, actor=actor
        )
        conn.commit()
        return deleted


def create_ot_theatre(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO ot_theatres (
                theatre_code, theatre_name, equipment_notes, status
            ) VALUES (?, ?, ?, ?)
            """,
            (
                data["theatre_code"],
                data["theatre_name"],
                data.get("equipment_notes"),
                data.get("status", "available"),
            ),
        )
        theatre_id = cursor.lastrowid
        conn.commit()
        return theatre_id


def list_ot_theatres():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM ot_theatres WHERE deleted_at IS NULL ORDER BY theatre_code ASC"
        )
        return cursor.fetchall()


def update_ot_theatre(theatre_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ot_theatres WHERE id = ?", (theatre_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE ot_theatres
            SET theatre_code = ?, theatre_name = ?, equipment_notes = ?, status = ?
            WHERE id = ?
            """,
            (
                data.get("theatre_code", existing["theatre_code"]),
                data.get("theatre_name", existing["theatre_name"]),
                data.get("equipment_notes", existing["equipment_notes"]),
                data.get("status", existing["status"]),
                theatre_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_ot_theatre(theatre_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ot_surgeries SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? "
            "WHERE theatre_id = ? AND deleted_at IS NULL",
            (actor, theatre_id),
        )
        deleted = soft_delete_row(cursor, "ot_theatres", "id", theatre_id, actor=actor)
        conn.commit()
        return deleted


def create_ot_surgery(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO ot_surgeries (
                theatre_id, patient_id, procedure_name, surgeon_name, scheduled_start,
                estimated_duration_hours, status, equipment_required, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["theatre_id"],
                data.get("patient_id"),
                data["procedure_name"],
                data["surgeon_name"],
                data["scheduled_start"],
                data.get("estimated_duration_hours", 1),
                data.get("status", "scheduled"),
                data.get("equipment_required"),
                data.get("notes"),
            ),
        )
        surgery_id = cursor.lastrowid
        cursor.execute(
            "UPDATE ot_theatres SET status = CASE WHEN ? IN ('scheduled', 'in_progress') THEN 'occupied' ELSE status END WHERE id = ?",
            (data.get("status", "scheduled"), data["theatre_id"]),
        )
        conn.commit()
        return surgery_id


def list_ot_surgeries(theatre_id=None, status=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["deleted_at IS NULL"]
        params = []
        if theatre_id:
            clauses.append("theatre_id = ?")
            params.append(theatre_id)
        if status:
            clauses.append("status = ?")
            params.append(status)
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"SELECT * FROM ot_surgeries{where_clause} ORDER BY scheduled_start ASC",
            tuple(params),
        )
        return cursor.fetchall()


def update_ot_surgery(surgery_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ot_surgeries WHERE id = ?", (surgery_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        theatre_id = data.get("theatre_id", existing["theatre_id"])
        status = data.get("status", existing["status"])
        cursor.execute(
            """
            UPDATE ot_surgeries
            SET theatre_id = ?, patient_id = ?, procedure_name = ?, surgeon_name = ?,
                scheduled_start = ?, estimated_duration_hours = ?, status = ?,
                equipment_required = ?, notes = ?
            WHERE id = ?
            """,
            (
                theatre_id,
                data.get("patient_id", existing["patient_id"]),
                data.get("procedure_name", existing["procedure_name"]),
                data.get("surgeon_name", existing["surgeon_name"]),
                data.get("scheduled_start", existing["scheduled_start"]),
                data.get(
                    "estimated_duration_hours", existing["estimated_duration_hours"]
                ),
                status,
                data.get("equipment_required", existing["equipment_required"]),
                data.get("notes", existing["notes"]),
                surgery_id,
            ),
        )
        cursor.execute(
            "UPDATE ot_theatres SET status = CASE WHEN ? IN ('scheduled', 'in_progress') THEN 'occupied' ELSE 'available' END WHERE id = ?",
            (status, theatre_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_ot_surgery(surgery_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT theatre_id FROM ot_surgeries WHERE id = ? AND deleted_at IS NULL",
            (surgery_id,),
        )
        existing = cursor.fetchone()
        if not existing:
            return False
        soft_delete_row(cursor, "ot_surgeries", "id", surgery_id, actor=actor)
        cursor.execute(
            """
            UPDATE ot_theatres
            SET status = CASE
                WHEN EXISTS (
                    SELECT 1 FROM ot_surgeries
                    WHERE theatre_id = ? AND status IN ('scheduled', 'in_progress') AND deleted_at IS NULL
                ) THEN 'occupied'
                ELSE 'available'
            END
            WHERE id = ?
            """,
            (existing["theatre_id"], existing["theatre_id"]),
        )
        deleted = cursor.rowcount >= 0
        conn.commit()
        return deleted


def get_ot_summary():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) AS value FROM ot_theatres")
        theatre_count = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM ot_theatres WHERE status = 'available'"
        )
        available_count = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM ot_surgeries WHERE status = 'scheduled'"
        )
        scheduled_count = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COUNT(*) AS value FROM ot_surgeries WHERE status = 'completed'"
        )
        completed_count = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(estimated_duration_hours), 0) AS value FROM ot_surgeries WHERE status IN ('scheduled', 'in_progress')"
        )
        scheduled_hours = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(estimated_duration_hours), 0) AS value FROM ot_surgeries WHERE status = 'completed'"
        )
        completed_hours = cursor.fetchone()["value"]
        cursor.execute("""
            SELECT
                ot_theatres.theatre_code AS label,
                COALESCE(SUM(
                    CASE
                        WHEN ot_surgeries.status IN ('scheduled', 'in_progress', 'completed')
                        THEN ot_surgeries.estimated_duration_hours
                        ELSE 0
                    END
                ), 0) AS count
            FROM ot_theatres
            LEFT JOIN ot_surgeries ON ot_surgeries.theatre_id = ot_theatres.id
            GROUP BY ot_theatres.id, ot_theatres.theatre_code
            ORDER BY count DESC, ot_theatres.theatre_code ASC
            """)
        utilization = [dict(row) for row in cursor.fetchall()]
    return {
        "theatre_count": theatre_count,
        "available_theatres": available_count,
        "scheduled_surgeries": scheduled_count,
        "completed_surgeries": completed_count,
        "scheduled_hours": scheduled_hours,
        "completed_hours": completed_hours,
        "theatre_utilization": utilization,
    }


# ==================== Accounts operations ====================


def create_account_ledger_entry(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO accounts_ledger (
                entry_date, entry_type, category, reference_no, counterparty_name, amount, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["entry_date"],
                data.get("entry_type", "expense"),
                data["category"],
                data.get("reference_no"),
                data.get("counterparty_name"),
                float(data["amount"]),
                data.get("notes"),
            ),
        )
        entry_id = cursor.lastrowid
        conn.commit()
        return entry_id


def list_account_ledger_entries(entry_type=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if entry_type:
            cursor.execute(
                "SELECT * FROM accounts_ledger WHERE entry_type = ? AND deleted_at IS NULL ORDER BY entry_date DESC, id DESC",
                (entry_type,),
            )
        else:
            cursor.execute(
                "SELECT * FROM accounts_ledger WHERE deleted_at IS NULL ORDER BY entry_date DESC, id DESC"
            )
        return cursor.fetchall()


def update_account_ledger_entry(entry_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM accounts_ledger WHERE id = ?", (entry_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE accounts_ledger
            SET entry_date = ?, entry_type = ?, category = ?, reference_no = ?,
                counterparty_name = ?, amount = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("entry_date", existing["entry_date"]),
                data.get("entry_type", existing["entry_type"]),
                data.get("category", existing["category"]),
                data.get("reference_no", existing["reference_no"]),
                data.get("counterparty_name", existing["counterparty_name"]),
                float(data.get("amount", existing["amount"] or 0)),
                data.get("notes", existing["notes"]),
                entry_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_account_ledger_entry(entry_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "accounts_ledger", "id", entry_id, actor=actor
        )
        conn.commit()
        return deleted


def create_vendor_payment(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO vendor_payments (
                vendor_name, invoice_ref, amount, payment_date, payment_mode, status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["vendor_name"],
                data.get("invoice_ref"),
                float(data["amount"]),
                data["payment_date"],
                data.get("payment_mode", "bank"),
                data.get("status", "paid"),
                data.get("notes"),
            ),
        )
        payment_id = cursor.lastrowid
        conn.commit()
        return payment_id


def list_vendor_payments(vendor_name=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if vendor_name:
            cursor.execute(
                "SELECT * FROM vendor_payments WHERE vendor_name = ? AND deleted_at IS NULL ORDER BY payment_date DESC, id DESC",
                (vendor_name,),
            )
        else:
            cursor.execute(
                "SELECT * FROM vendor_payments WHERE deleted_at IS NULL ORDER BY payment_date DESC, id DESC"
            )
        return cursor.fetchall()


def update_vendor_payment(payment_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vendor_payments WHERE id = ?", (payment_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE vendor_payments
            SET vendor_name = ?, invoice_ref = ?, amount = ?, payment_date = ?,
                payment_mode = ?, status = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("vendor_name", existing["vendor_name"]),
                data.get("invoice_ref", existing["invoice_ref"]),
                float(data.get("amount", existing["amount"] or 0)),
                data.get("payment_date", existing["payment_date"]),
                data.get("payment_mode", existing["payment_mode"]),
                data.get("status", existing["status"]),
                data.get("notes", existing["notes"]),
                payment_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_vendor_payment(payment_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "vendor_payments", "id", payment_id, actor=actor
        )
        conn.commit()
        return deleted


def create_doctor_payout(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        total_amount = float(data["amount"])
        paid_amount = float(data.get("paid_amount", 0))
        due_amount = max(total_amount - paid_amount, 0.0)
        status = data.get("status")
        if not status:
            status = (
                "paid"
                if due_amount == 0
                else ("partial" if paid_amount > 0 else "pending")
            )
        cursor.execute(
            """
            INSERT INTO doctor_payouts (
                doctor_name, payout_month, amount, paid_amount, due_amount, status, paid_date, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["doctor_name"],
                data["payout_month"],
                total_amount,
                paid_amount,
                due_amount,
                status,
                data.get("paid_date"),
                data.get("notes"),
            ),
        )
        payout_id = cursor.lastrowid
        conn.commit()
        return payout_id


def list_doctor_payouts(doctor_name=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if doctor_name:
            cursor.execute(
                "SELECT * FROM doctor_payouts WHERE doctor_name = ? AND deleted_at IS NULL ORDER BY payout_month DESC, id DESC",
                (doctor_name,),
            )
        else:
            cursor.execute(
                "SELECT * FROM doctor_payouts WHERE deleted_at IS NULL ORDER BY payout_month DESC, id DESC"
            )
        return cursor.fetchall()


def update_doctor_payout(payout_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM doctor_payouts WHERE id = ?", (payout_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        total_amount = float(data.get("amount", existing["amount"] or 0))
        paid_amount = float(data.get("paid_amount", existing["paid_amount"] or 0))
        due_amount = max(total_amount - paid_amount, 0.0)
        status = data.get("status")
        if not status:
            status = (
                "paid"
                if due_amount == 0
                else ("partial" if paid_amount > 0 else "pending")
            )
        cursor.execute(
            """
            UPDATE doctor_payouts
            SET doctor_name = ?, payout_month = ?, amount = ?, paid_amount = ?,
                due_amount = ?, status = ?, paid_date = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("doctor_name", existing["doctor_name"]),
                data.get("payout_month", existing["payout_month"]),
                total_amount,
                paid_amount,
                due_amount,
                status,
                data.get("paid_date", existing["paid_date"]),
                data.get("notes", existing["notes"]),
                payout_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_doctor_payout(payout_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "doctor_payouts", "id", payout_id, actor=actor
        )
        conn.commit()
        return deleted


def get_accounts_summary():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS value FROM accounts_ledger WHERE entry_type = 'income'"
        )
        ledger_income = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS value FROM accounts_ledger WHERE entry_type = 'expense'"
        )
        ledger_expense = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS value FROM vendor_payments WHERE status IN ('partial', 'paid')"
        )
        vendor_paid = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(paid_amount), 0) AS value FROM doctor_payouts"
        )
        doctor_paid = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(due_amount), 0) AS value FROM doctor_payouts"
        )
        doctor_due = cursor.fetchone()["value"]
    return {
        "ledger_income": ledger_income,
        "ledger_expense": ledger_expense,
        "net_position": ledger_income - ledger_expense,
        "vendor_paid_total": vendor_paid,
        "doctor_paid_total": doctor_paid,
        "doctor_due_total": doctor_due,
    }


# ==================== HospAI module operations ====================


def create_encounter(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO encounters (
                patient_id, encounter_type, insurance_provider, insurance_policy_no,
                is_accident, referral_source, referral_name, status, created_by, hospital_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data.get("encounter_type", "OP"),
                data.get("insurance_provider"),
                data.get("insurance_policy_no"),
                1 if data.get("is_accident") else 0,
                data.get("referral_source"),
                data.get("referral_name"),
                data.get("status", "active"),
                data.get("created_by"),
                scoped_hospital_id,
            ),
        )
        encounter_id = cursor.lastrowid
        conn.commit()
        return encounter_id


def list_encounters(patient_id=None, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        if patient_id:
            clauses.append("patient_id = ?")
            params.append(patient_id)
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"SELECT * FROM encounters{where_clause} ORDER BY arrival_at DESC",
            tuple(params),
        )
        return cursor.fetchall()


def list_bed_allocations(patient_id=None, active_only=False, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        if patient_id:
            clauses.append("patient_id = ?")
            params.append(patient_id)
        if active_only:
            clauses.append("status = 'active'")
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"SELECT * FROM bed_allocations{where_clause} ORDER BY allocated_at DESC",
            tuple(params),
        )
        return cursor.fetchall()


def ensure_bed_management_columns(conn):
    """bed_master (a hospital-scoped bed inventory) and bed_allocations (who's
    currently in which bed) both existed already but were never wired up to
    real routes -- bed_allocations in particular was missing hospital_id
    entirely, so list_bed_allocations() had no tenant isolation. This adds
    what Bed Management needs: a bed_type classification, hospital_id +
    bed_id on bed_allocations (bed_id links a stay directly to a bed_master
    row instead of only free-text ward/room/bed), and a uniqueness guarantee
    so the same bed number can't be entered twice in one ward/room."""
    cursor = conn.cursor()
    _ensure_column(cursor, "bed_master", "bed_type", "TEXT DEFAULT 'General'")
    _ensure_column(cursor, "bed_allocations", "hospital_id", "INTEGER")
    _ensure_column(cursor, "bed_allocations", "bed_id", "INTEGER")
    # Backfill hospital_id on any bed_allocations rows created before this
    # column existed, via the admission each row belongs to.
    cursor.execute("""
        UPDATE bed_allocations
        SET hospital_id = (
            SELECT a.hospital_id FROM admissions a WHERE a.id = bed_allocations.admission_id
        )
        WHERE hospital_id IS NULL
        """)
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_bed_master_unique "
        "ON bed_master(hospital_id, ward, room_no, bed_no)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_bed_allocations_hospital ON bed_allocations(hospital_id)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_bed_allocations_bed ON bed_allocations(bed_id)"
    )
    # Every patient-list row runs two correlated lookups by patient_id here
    # (active bed, IP care stream); without this each was a full scan.
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_bed_allocations_patient ON bed_allocations(patient_id, allocated_at DESC)"
    )
    conn.commit()


def ensure_admission_care_columns(conn):
    """expected_discharge_date is the single source of truth for planned length
    of stay -- the UI collects "days", the backend converts to a date so there's
    never two numbers (days vs. date) that can drift out of sync. discharge_override_reason
    is only set when staff discharge despite a pending-items warning (billing/prescriptions);
    NULL means the discharge checklist was clean."""
    cursor = conn.cursor()
    _ensure_column(cursor, "admissions", "expected_discharge_date", "DATE")
    _ensure_column(cursor, "admissions", "discharge_override_reason", "TEXT")
    conn.commit()


def ensure_bed_transfer_columns(conn):
    """Supports transferring a patient bed-to-bed (e.g. ward -> ICU) without
    releasing and re-admitting them, which would sever admission continuity.
    previous_allocation_id chains transfer rows together under the same
    admission_id; bed_allocations.status has no CHECK constraint today, so the
    new 'transferred' status value needs no separate migration."""
    cursor = conn.cursor()
    _ensure_column(cursor, "bed_allocations", "previous_allocation_id", "INTEGER")
    _ensure_column(cursor, "bed_allocations", "transfer_reason", "TEXT")
    conn.commit()


# Starting per-day room rates by bed type -- purely a seed default applied to
# beds that don't already have a rate; every bed's rate stays freely editable
# afterward (some rooms are priced differently than their type's default).
BED_TYPE_DEFAULT_DAILY_RATE = {
    "General": 1500,
    "Semi-Private": 2500,
    "Private": 4000,
    "ICU": 8000,
}


def ensure_bed_billing_columns(conn):
    """Nothing in the bed workflow ever generated a room charge -- admitting,
    transferring, and discharging a patient was billing-free. bed_master gets
    a per-bed daily_rate (seeded by bed_type); bed_allocations gets its own
    daily_rate SNAPSHOTTED at assign/transfer time, because a stay must keep
    billing at the rate that applied while the patient was actually in that
    bed even if the bed's listed rate changes later. Existing allocations are
    backfilled from their bed's current rate as a best-effort approximation
    (no historical rate existed before this migration)."""
    cursor = conn.cursor()
    _ensure_column(cursor, "bed_master", "daily_rate", "REAL")
    _ensure_column(cursor, "bed_allocations", "daily_rate", "REAL")

    for bed_type, rate in BED_TYPE_DEFAULT_DAILY_RATE.items():
        cursor.execute(
            "UPDATE bed_master SET daily_rate = ? WHERE daily_rate IS NULL AND bed_type = ?",
            (rate, bed_type),
        )
    cursor.execute(
        "UPDATE bed_master SET daily_rate = ? WHERE daily_rate IS NULL",
        (BED_TYPE_DEFAULT_DAILY_RATE["General"],),
    )
    cursor.execute(
        """
        UPDATE bed_allocations
        SET daily_rate = (SELECT b.daily_rate FROM bed_master b WHERE b.id = bed_allocations.bed_id)
        WHERE daily_rate IS NULL AND bed_id IS NOT NULL
        """
    )
    conn.commit()


def ensure_appointment_timestamp_columns(conn):
    """appointment_date is only the scheduled slot -- these three record the
    actual moment each status transition happened, which nothing previously
    persisted (only the current status value was kept, not its history)."""
    cursor = conn.cursor()
    _ensure_column(cursor, "appointments", "checked_in_at", "TIMESTAMP")
    _ensure_column(cursor, "appointments", "consultation_started_at", "TIMESTAMP")
    _ensure_column(cursor, "appointments", "consultation_completed_at", "TIMESTAMP")
    conn.commit()


def ensure_pharmacy_hospital_columns(conn):
    """pharmacy_inventory/pharmacy_suppliers/pharmacy_purchases were never
    tenant-scoped despite every other operational table being hospital_id-
    filtered -- every hospital was silently sharing (and could overwrite or
    dispense against) every other hospital's medicine stock, suppliers, and
    purchase orders. Backfills any pre-existing rows to the first/default
    hospital, matching the ensure_bed_management_columns backfill pattern."""
    cursor = conn.cursor()
    for table_name in ("pharmacy_inventory", "pharmacy_suppliers", "pharmacy_purchases"):
        _ensure_column(cursor, table_name, "hospital_id", "INTEGER")
        cursor.execute(
            f"""
            UPDATE {table_name}
            SET hospital_id = (SELECT id FROM hospitals ORDER BY id LIMIT 1)
            WHERE hospital_id IS NULL
            """
        )
        cursor.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table_name}_hospital ON {table_name}(hospital_id)"
        )
    conn.commit()


def ensure_op_tables(conn):
    """Ensure complete Outpatient (OP) workflow schema tables, columns, indexes,
    and seed default specialty/gender-balanced doctors."""
    cursor = conn.cursor()
    id_column = "SERIAL PRIMARY KEY"

    # Doctors schema
    _ensure_column(cursor, "doctors", "gender", "TEXT DEFAULT 'Male'")
    try:
        cursor.execute("ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_status_check")
    except Exception:
        pass

    # Appointments schema
    _ensure_column(cursor, "appointments", "symptom_duration", "TEXT")
    _ensure_column(cursor, "appointments", "symptom_severity", "TEXT DEFAULT 'moderate'")
    _ensure_column(cursor, "appointments", "gender_preference", "TEXT")
    _ensure_column(cursor, "appointments", "further_action", "TEXT")
    _ensure_column(cursor, "appointments", "further_action_notes", "TEXT")
    _ensure_column(cursor, "appointments", "op_status", "TEXT DEFAULT 'registered'")
    _ensure_column(cursor, "appointments", "consultation_fee", "REAL DEFAULT 0")
    _ensure_column(cursor, "appointments", "payment_mode", "TEXT DEFAULT 'cash'")

    # Encounters schema
    _ensure_column(cursor, "encounters", "symptom_duration", "TEXT")
    _ensure_column(cursor, "encounters", "symptom_severity", "TEXT DEFAULT 'moderate'")
    _ensure_column(cursor, "encounters", "further_action", "TEXT")

    # Patient vitals schema
    _ensure_column(cursor, "patient_vitals", "spo2", "TEXT")
    _ensure_column(cursor, "patient_vitals", "respiratory_rate", "TEXT")
    _ensure_column(cursor, "patient_vitals", "weight", "TEXT")
    _ensure_column(cursor, "patient_vitals", "blood_glucose", "TEXT")
    _ensure_column(cursor, "patient_vitals", "notes", "TEXT")
    _ensure_column(cursor, "patient_vitals", "recorded_by", "TEXT")

    # OP Timeline table
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS op_timeline (
            id {id_column},
            hospital_id INTEGER NOT NULL,
            appointment_id INTEGER,
            encounter_id INTEGER,
            patient_id TEXT NOT NULL,
            event_name TEXT NOT NULL,
            event_description TEXT,
            actor TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_op_timeline_appt ON op_timeline(appointment_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_op_timeline_patient ON op_timeline(patient_id)")

    # Seed default gender-balanced doctors if table is empty
    cursor.execute("SELECT COUNT(*) FROM doctors")
    count_row = cursor.fetchone()
    doc_count = count_row[0] if count_row else 0
    if doc_count == 0:
        default_docs = [
            ("Dr. Emily Chen", "Cardiology", "Female", 500.0, 250.0, "available"),
            ("Dr. Robert Davis", "Cardiology", "Male", 500.0, 250.0, "available"),
            ("Dr. Sarah Patel", "General Medicine", "Female", 400.0, 200.0, "available"),
            ("Dr. Michael Johnson", "General Medicine", "Male", 400.0, 200.0, "available"),
            ("Dr. Priya Sharma", "Pediatrics", "Female", 450.0, 200.0, "available"),
            ("Dr. David Wilson", "Orthopedics", "Male", 600.0, 300.0, "available"),
            ("Dr. Lisa Martinez", "Neurology", "Female", 650.0, 300.0, "available"),
            ("Dr. James Taylor", "Dermatology", "Male", 400.0, 200.0, "available"),
        ]
        for name, dept, gen, fee, rfee, stat in default_docs:
            cursor.execute(
                "INSERT INTO doctors (doctor_name, department, gender, consultation_fee, review_fee, status) VALUES (?, ?, ?, ?, ?, ?)",
                (name, dept, gen, fee, rfee, stat),
            )
    else:
        cursor.execute("UPDATE doctors SET gender = 'Male' WHERE gender IS NULL")
        cursor.execute("UPDATE doctors SET gender = 'Female' WHERE doctor_name ILIKE '%Sarah%' OR doctor_name ILIKE '%Emily%' OR doctor_name ILIKE '%Priya%' OR doctor_name ILIKE '%Lisa%' OR doctor_name ILIKE '%Anita%'")

    conn.commit()


def list_beds(hospital_id):
    """All beds for a hospital, each with its current occupant (if any) via a
    LEFT JOIN to the active bed_allocations row -- one query for the whole
    grid instead of N+1 lookups per bed."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                b.id, b.ward, b.room_no, b.bed_no, b.bed_type, b.status, b.daily_rate,
                ba.id AS allocation_id, ba.admission_id, ba.allocated_at,
                p.patient_id, p.name AS patient_name, p.last_name AS patient_last_name,
                p.phone AS patient_phone, p.age AS patient_age, p.gender AS patient_gender,
                a.notes AS admission_notes, a.admission_date, a.expected_discharge_date,
                (
                    SELECT COALESCE(SUM(
                        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (COALESCE(seg.released_at, CURRENT_TIMESTAMP) - seg.allocated_at)) / 86400.0))
                        * COALESCE(seg.daily_rate, 0)
                    ), 0)
                    FROM bed_allocations seg
                    WHERE seg.admission_id = ba.admission_id
                ) AS room_charges_so_far
            FROM bed_master b
            LEFT JOIN bed_allocations ba
                ON ba.bed_id = b.id AND ba.status = 'active'
            LEFT JOIN patients p ON p.patient_id = ba.patient_id
            LEFT JOIN admissions a ON a.id = ba.admission_id
            WHERE b.hospital_id = ?
            ORDER BY
                b.ward,
                b.room_no,
                -- bed_no is free text (some hospitals label beds "A1", not just
                -- numbers), so a plain text sort would order "10" before "2".
                -- Zero-pad purely numeric bed numbers so those sort correctly;
                -- non-numeric labels fall back to sorting as-is.
                CASE WHEN b.bed_no ~ '^[0-9]+$' THEN LPAD(b.bed_no, 10, '0') ELSE b.bed_no END
            """,
            (hospital_id,),
        )
        rows = [dict(row) for row in cursor.fetchall()]
        # Flask's default JSON provider serializes a raw datetime as an RFC
        # 1123 string ("Tue, 11 Aug 2026 10:05:48 GMT") -- the frontend's date
        # parser expects ISO 8601, so convert explicitly rather than let that
        # mismatch silently fall back to displaying the raw string.
        for row in rows:
            for field in ("allocated_at", "admission_date", "expected_discharge_date"):
                if row.get(field) is not None and hasattr(row[field], "isoformat"):
                    row[field] = row[field].isoformat()
        return rows


def get_bed(bed_id, hospital_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM bed_master WHERE id = ? AND hospital_id = ?",
            (bed_id, hospital_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def create_bed(hospital_id, ward, room_no, bed_no, bed_type, daily_rate=None):
    rate = daily_rate if daily_rate is not None else BED_TYPE_DEFAULT_DAILY_RATE.get(
        bed_type, BED_TYPE_DEFAULT_DAILY_RATE["General"]
    )
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO bed_master (hospital_id, ward, room_no, bed_no, bed_type, status, daily_rate)
            VALUES (?, ?, ?, ?, ?, 'Available', ?)
            RETURNING id
            """,
            (hospital_id, ward, room_no, bed_no, bed_type, rate),
        )
        bed_id = cursor.fetchone()[0]
        conn.commit()
        return bed_id


def create_beds_range(hospital_id, ward, room_no, bed_type, from_bed, to_bed, daily_rate=None):
    """Creates beds numbered from_bed..to_bed in one go (e.g. a 20-bed room in
    one action instead of 20). Numbers that already exist in this
    hospital/ward/room are silently skipped rather than failing the whole
    batch -- e.g. re-running this to top up a room from 15 to 20 beds just
    adds the 5 new ones."""
    rate = daily_rate if daily_rate is not None else BED_TYPE_DEFAULT_DAILY_RATE.get(
        bed_type, BED_TYPE_DEFAULT_DAILY_RATE["General"]
    )
    created = []
    skipped = []
    with get_connection() as conn:
        cursor = conn.cursor()
        for n in range(from_bed, to_bed + 1):
            bed_no = str(n)
            cursor.execute(
                """
                INSERT INTO bed_master (hospital_id, ward, room_no, bed_no, bed_type, status, daily_rate)
                VALUES (?, ?, ?, ?, ?, 'Available', ?)
                ON CONFLICT (hospital_id, ward, room_no, bed_no) DO NOTHING
                RETURNING id
                """,
                (hospital_id, ward, room_no, bed_no, bed_type, rate),
            )
            if cursor.fetchone():
                created.append(bed_no)
            else:
                skipped.append(bed_no)
        conn.commit()
    return {"created": created, "skipped": skipped}


def update_bed(bed_id, hospital_id, **fields):
    if not fields:
        return False
    columns = list(fields.keys())
    set_clause = ", ".join(f"{col} = ?" for col in columns)
    values = [fields[col] for col in columns]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"UPDATE bed_master SET {set_clause}, updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND hospital_id = ?",
            (*values, bed_id, hospital_id),
        )
        updated = cursor.rowcount > 0
        conn.commit()
        return updated


def delete_bed(bed_id, hospital_id):
    """Refuses to delete an occupied bed -- returns False rather than
    silently orphaning whoever's currently assigned to it."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM bed_master WHERE id = ? AND hospital_id = ? AND status != 'Occupied'",
            (bed_id, hospital_id),
        )
        deleted = cursor.rowcount > 0
        conn.commit()
        return deleted


def find_active_bed_for_patient(patient_id, hospital_id):
    """Used to block double-booking -- a patient shouldn't be assigned to a
    second bed while still occupying one."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT b.id, b.ward, b.room_no, b.bed_no
            FROM bed_allocations ba
            JOIN bed_master b ON b.id = ba.bed_id
            WHERE ba.patient_id = ? AND ba.hospital_id = ? AND ba.status = 'active'
            LIMIT 1
            """,
            (patient_id, hospital_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def assign_patient_to_bed(hospital_id, bed_id, patient_id, notes, expected_los_days=None):
    """Admitting a patient into a bed IS the admission, from this page's point
    of view -- creates the admissions row and the bed_allocations link in one
    step rather than requiring a separate admission to already exist.

    expected_los_days, when given, is converted to a concrete
    expected_discharge_date at write time (admission_date + N days) so the UI
    never has to keep "days" and "date" in sync itself -- the date is the
    single source of truth from here on."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT ward, room_no, bed_no, status, daily_rate FROM bed_master WHERE id = ? AND hospital_id = ?",
            (bed_id, hospital_id),
        )
        bed = cursor.fetchone()
        if not bed:
            return None
        if bed["status"] != "Available":
            raise ValueError("This bed is no longer available.")

        admission_timestamp = current_ist_timestamp()
        expected_discharge_date = None
        if expected_los_days:
            expected_discharge_date = (
                current_ist_datetime().date() + timedelta(days=int(expected_los_days))
            )
        cursor.execute(
            """
            INSERT INTO admissions (hospital_id, patient_id, admission_date, notes, expected_discharge_date)
            VALUES (?, ?, ?, ?, ?)
            RETURNING id
            """,
            (hospital_id, patient_id, admission_timestamp, notes, expected_discharge_date),
        )
        admission_id = cursor.fetchone()[0]

        cursor.execute(
            """
            INSERT INTO bed_allocations
                (hospital_id, bed_id, admission_id, patient_id, ward, room_no, bed_no, status, daily_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
            RETURNING id
            """,
            (
                hospital_id,
                bed_id,
                admission_id,
                patient_id,
                bed["ward"],
                bed["room_no"],
                bed["bed_no"],
                bed["daily_rate"],
            ),
        )
        allocation_id = cursor.fetchone()[0]

        cursor.execute(
            "UPDATE bed_master SET status = 'Occupied', updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (bed_id,),
        )
        conn.commit()
        return {"admission_id": admission_id, "allocation_id": allocation_id}


def compute_room_charges(hospital_id, admission_id):
    """Prices every bed_allocations segment of a stay at the rate that applied
    while the patient was actually in that bed (bed_allocations.daily_rate,
    snapshotted at assign/transfer time) -- so a ward -> ICU -> ward stay
    bills each leg at its own correct rate instead of one blended average.
    Partial days round up (minimum 1 day per segment), matching standard
    hotel-style room billing. Safe to call mid-stay (the still-open segment
    is priced up to now) or after discharge (every segment already has a
    released_at)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT ward, room_no, bed_no, allocated_at, released_at, daily_rate "
            "FROM bed_allocations WHERE hospital_id = ? AND admission_id = ? "
            "ORDER BY allocated_at ASC",
            (hospital_id, admission_id),
        )
        rows = cursor.fetchall()

    segments = []
    total = 0.0
    now = current_ist_datetime().replace(tzinfo=None)
    for row in rows:
        allocated_at = row["allocated_at"]
        released_at = row["released_at"] or now
        if isinstance(allocated_at, str):
            allocated_at = datetime.fromisoformat(allocated_at)
        if isinstance(released_at, str):
            released_at = datetime.fromisoformat(released_at)
        # allocated_at/released_at may or may not carry timezone info
        # depending on the driver -- normalize to naive so the subtraction
        # below can't raise a naive/aware TypeError.
        if allocated_at.tzinfo:
            allocated_at = allocated_at.replace(tzinfo=None)
        if released_at.tzinfo:
            released_at = released_at.replace(tzinfo=None)
        elapsed_seconds = (released_at - allocated_at).total_seconds()
        days = max(1, math.ceil(elapsed_seconds / 86400))
        rate = float(row["daily_rate"] or 0)
        amount = days * rate
        total += amount
        segments.append(
            {
                "ward": row["ward"],
                "room_no": row["room_no"],
                "bed_no": row["bed_no"],
                "days": days,
                "daily_rate": rate,
                "amount": amount,
            }
        )
    return {"segments": segments, "total": total}


def release_bed(
    hospital_id,
    bed_id,
    discharge_override_reason=None,
    room_charge_total=None,
    created_by=None,
):
    """Discharges the current occupant and frees the bed: closes out the
    active bed_allocations row, sets discharge_date on the admission it
    belongs to, flips the bed back to Available, and raises the room-charge
    invoice for the whole stay (every ward/bed segment the patient passed
    through, each at its own rate) -- this is what actually bills the
    admission; nothing else in the bed workflow ever did.

    discharge_override_reason is recorded only when staff chose to discharge
    despite the discharge checklist flagging pending dues/prescriptions --
    NULL means the checklist was clean (or wasn't checked). room_charge_total,
    when given, is the staff-reviewed/adjusted total from the discharge
    modal (mirrors the Pharmacy fulfill flow's editable line items); when
    omitted, the server-computed compute_room_charges() total is used --
    covers non-UI callers and keeps this endpoint safe to call without the
    review step."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, admission_id FROM bed_allocations "
            "WHERE bed_id = ? AND hospital_id = ? AND status = 'active'",
            (bed_id, hospital_id),
        )
        allocation = cursor.fetchone()
        if not allocation:
            return False

        cursor.execute(
            "UPDATE bed_allocations SET status = 'released', released_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (allocation["id"],),
        )
        cursor.execute(
            "UPDATE admissions SET discharge_date = CURRENT_DATE, "
            "discharge_override_reason = COALESCE(?, discharge_override_reason) "
            "WHERE id = ? AND discharge_date IS NULL",
            (discharge_override_reason, allocation["admission_id"]),
        )
        cursor.execute(
            "UPDATE bed_master SET status = 'Available', updated_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (bed_id,),
        )

        cursor.execute(
            "SELECT patient_id FROM bed_allocations WHERE id = ?", (allocation["id"],)
        )
        patient_id = cursor.fetchone()["patient_id"]
        conn.commit()

    # released_at is now set, so this call prices every segment definitively
    # (no more "still open, priced to now" segment).
    total = (
        room_charge_total
        if room_charge_total is not None
        else compute_room_charges(hospital_id, allocation["admission_id"])["total"]
    )
    if total and total > 0:
        invoice_no = new_invoice_no(f"INV-IP-{allocation['admission_id']}")
        create_invoice(
            {
                "invoice_no": invoice_no,
                "patient_id": patient_id,
                "module": "IP",
                "total_amount": total,
                "subtotal": total,
                "payment_status": "due",
                "created_by": created_by,
            },
            hospital_id=hospital_id,
        )
    return True


def list_discharged_patients(hospital_id):
    """Every completed stay (a released bed_allocations row), for the
    Discharged Directory. Casting both dates to ::date before subtracting is
    what makes the day-count reliable regardless of whether admission_date/
    discharge_date/released_at end up TIMESTAMP or DATE underneath. Room
    charges are matched by release_bed()'s own "INV-IP-<admission_id>-..."
    invoice_no convention -- there's no invoice_id column on admissions to
    join on directly.

    NOTE: the LIKE wildcard below is doubled. This query is executed with a
    parameter tuple, so psycopg2 first runs its own percent-interpolation over
    the whole SQL string; a single wildcard there is read as a placeholder and
    raises "IndexError: tuple index out of range". Keep every literal percent in
    this string doubled -- including any inside SQL comments."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                ba.id AS allocation_id,
                ba.patient_id,
                ba.ward, ba.room_no, ba.bed_no,
                a.id AS admission_id,
                a.admission_date,
                COALESCE(a.discharge_date, ba.released_at) AS discharge_date,
                a.discharge_override_reason,
                GREATEST(1, (COALESCE(a.discharge_date, ba.released_at)::date - a.admission_date::date))::int AS length_of_stay_days,
                p.name, p.last_name,
                (SELECT o.doctor_name FROM observation_notes o
                 WHERE o.admission_id = a.id AND o.doctor_name IS NOT NULL
                 ORDER BY o.created_at DESC LIMIT 1) AS attending_doctor,
                (SELECT COALESCE(SUM(i.total_amount), 0) FROM invoices i
                 WHERE i.module = 'IP' AND i.invoice_no LIKE ('INV-IP-' || a.id::text || '-%%')) AS room_charges_total
            FROM bed_allocations ba
            JOIN admissions a ON a.id = ba.admission_id
            JOIN patients p ON p.patient_id = ba.patient_id
            WHERE ba.hospital_id = ? AND ba.status = 'released'
            ORDER BY ba.released_at DESC
            """,
            (hospital_id,),
        )
        return cursor.fetchall()


def transfer_bed(hospital_id, from_bed_id, to_bed_id, reason=None):
    """Moves a patient from one bed to another (e.g. general ward -> ICU)
    without releasing and re-admitting them, which would sever admission
    continuity and history. Closes the current bed_allocations row as
    'transferred' and opens a new one under the SAME admission_id, chained via
    previous_allocation_id. Raises ValueError on bad input (mirrors
    assign_patient_to_bed's error style) so routes can translate to a 400."""
    if from_bed_id == to_bed_id:
        raise ValueError("Source and destination beds must be different.")

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, admission_id, patient_id FROM bed_allocations "
            "WHERE bed_id = ? AND hospital_id = ? AND status = 'active'",
            (from_bed_id, hospital_id),
        )
        current_allocation = cursor.fetchone()
        if not current_allocation:
            raise ValueError("No active patient found in the source bed.")

        cursor.execute(
            "SELECT ward, room_no, bed_no, status, daily_rate FROM bed_master WHERE id = ? AND hospital_id = ?",
            (to_bed_id, hospital_id),
        )
        target_bed = cursor.fetchone()
        if not target_bed:
            raise ValueError("Destination bed not found.")
        if target_bed["status"] != "Available":
            raise ValueError("Destination bed is not available.")

        cursor.execute(
            "UPDATE bed_allocations SET status = 'transferred', released_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (current_allocation["id"],),
        )
        cursor.execute(
            """
            INSERT INTO bed_allocations
                (hospital_id, bed_id, admission_id, patient_id, ward, room_no, bed_no,
                 status, previous_allocation_id, transfer_reason, daily_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
            RETURNING id
            """,
            (
                hospital_id,
                to_bed_id,
                current_allocation["admission_id"],
                current_allocation["patient_id"],
                target_bed["ward"],
                target_bed["room_no"],
                target_bed["bed_no"],
                current_allocation["id"],
                reason,
                target_bed["daily_rate"],
            ),
        )
        new_allocation_id = cursor.fetchone()[0]

        cursor.execute(
            "UPDATE bed_master SET status = 'Available', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (from_bed_id,),
        )
        cursor.execute(
            "UPDATE bed_master SET status = 'Occupied', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (to_bed_id,),
        )
        conn.commit()
        return {
            "allocation_id": new_allocation_id,
            "admission_id": current_allocation["admission_id"],
            "from_bed": from_bed_id,
            "to_bed": to_bed_id,
        }


def get_discharge_checklist(hospital_id, bed_id):
    """Read-only snapshot of pending items for the patient currently in
    bed_id, shown before discharge -- warns staff but never blocks discharge
    (real hospitals need to allow discharge-against-medical-advice with dues
    still outstanding)."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, admission_id, patient_id FROM bed_allocations "
            "WHERE bed_id = ? AND hospital_id = ? AND status = 'active'",
            (bed_id, hospital_id),
        )
        allocation = cursor.fetchone()
        if not allocation:
            return None

        cursor.execute(
            "SELECT admission_date FROM admissions WHERE id = ?",
            (allocation["admission_id"],),
        )
        admission = cursor.fetchone()
        admission_date = admission["admission_date"] if admission else None

        cursor.execute(
            """
            SELECT invoice_no, total_amount, paid_amount, due_amount, payment_status
            FROM invoices
            WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL
              AND payment_status IN ('due', 'partial')
            """,
            (allocation["patient_id"], hospital_id),
        )
        pending_invoices = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT id, medicines_json, status, created_at
            FROM pharmacy_prescriptions
            WHERE patient_id = ? AND hospital_id = ? AND status != 'fulfilled'
              AND created_at >= ?
            """,
            (allocation["patient_id"], hospital_id, admission_date),
        )
        pending_prescriptions = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            "SELECT COUNT(*) AS c FROM documents WHERE admission_id = ?",
            (allocation["admission_id"],),
        )
        document_count = cursor.fetchone()["c"]

        billing_ok = len(pending_invoices) == 0
        prescriptions_ok = len(pending_prescriptions) == 0
        admission_id = allocation["admission_id"]
        patient_id = allocation["patient_id"]

    room_charges = compute_room_charges(hospital_id, admission_id)
    return {
        "admission_id": admission_id,
        "patient_id": patient_id,
        "billing": {"ok": billing_ok, "pending_invoices": pending_invoices},
        "prescriptions": {
            "ok": prescriptions_ok,
            "pending_count": len(pending_prescriptions),
        },
        "documents": {"count": document_count},
        "room_charges": room_charges,
        "clear": billing_ok and prescriptions_ok,
    }


def add_medication_schedule(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO medication_schedules (
                patient_id, medicine_name, dosage, schedule_time, administered, alert_enabled, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data["medicine_name"],
                data.get("dosage"),
                data["schedule_time"],
                1 if data.get("administered") else 0,
                1 if data.get("alert_enabled", True) else 0,
                data.get("notes"),
            ),
        )
        schedule_id = cursor.lastrowid
        conn.commit()
        return schedule_id


def list_medication_schedules(patient_id, pending_only=False):
    with get_connection() as conn:
        cursor = conn.cursor()
        if pending_only:
            cursor.execute(
                """
                SELECT * FROM medication_schedules
                WHERE patient_id = ? AND administered = 0
                ORDER BY schedule_time ASC
                """,
                (patient_id,),
            )
        else:
            cursor.execute(
                """
                SELECT * FROM medication_schedules
                WHERE patient_id = ?
                ORDER BY schedule_time ASC
                """,
                (patient_id,),
            )
        return cursor.fetchall()


def add_observation_note(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO observation_notes (
                patient_id, admission_id, doctor_name, note, treatment_plan, role
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data.get("admission_id"),
                data.get("doctor_name"),
                data["note"],
                data.get("treatment_plan"),
                data.get("role"),
            ),
        )
        note_id = cursor.lastrowid
        conn.commit()
        return note_id


def add_manual_patient_vital(data):
    """Records a vitals reading taken outside an OP consultation (e.g. a
    ward/ICU nursing round) -- add_op_vitals() above is appointment-scoped
    and can't be used here, but encounter_id is nullable on patient_vitals
    precisely so a bare patient_id reading like this is valid."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO patient_vitals (
                patient_id, bp, pulse, temperature, spo2, respiratory_rate, notes, recorded_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data.get("bp"),
                data.get("pulse"),
                data.get("temperature"),
                data.get("spo2"),
                data.get("respiratory_rate"),
                data.get("notes"),
                data.get("recorded_by"),
            ),
        )
        vital_id = cursor.lastrowid
        conn.commit()
        return vital_id


def add_manual_diagnosis(data):
    """Records a diagnosis/clinical impression outside an OP consultation
    (save_op_consultation() above is appointment-scoped) -- same nullable-
    encounter_id reasoning as add_manual_patient_vital()."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO diagnosis_records (patient_id, diagnosis_name) VALUES (?, ?)",
            (data["patient_id"], data["diagnosis_name"]),
        )
        diagnosis_id = cursor.lastrowid
        conn.commit()
        return diagnosis_id


# ==================== ICU flowsheet ====================

def add_ventilator_setting(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO icu_ventilator_settings (
                patient_id, admission_id, mode, fio2, peep, tidal_volume, resp_rate, pip, recorded_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"], data.get("admission_id"), data.get("mode"), data.get("fio2"),
                data.get("peep"), data.get("tidal_volume"), data.get("resp_rate"), data.get("pip"),
                data.get("recorded_by"),
            ),
        )
        row_id = cursor.lastrowid
        conn.commit()
        return row_id


def get_ventilator_settings(patient_id, limit=10):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM icu_ventilator_settings WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?",
            (patient_id, limit),
        )
        return cursor.fetchall()


def add_infusion(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO icu_infusions (patient_id, admission_id, medication_name, rate, unit, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (data["patient_id"], data.get("admission_id"), data["medication_name"], data.get("rate"), data.get("unit"), data.get("recorded_by")),
        )
        row_id = cursor.lastrowid
        conn.commit()
        return row_id


def stop_infusion(infusion_id, patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE icu_infusions SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP WHERE id = ? AND patient_id = ?",
            (infusion_id, patient_id),
        )
        updated = cursor.rowcount
        conn.commit()
        return updated > 0


def get_infusions(patient_id, active_only=False):
    with get_connection() as conn:
        cursor = conn.cursor()
        if active_only:
            cursor.execute(
                "SELECT * FROM icu_infusions WHERE patient_id = ? AND status = 'active' ORDER BY started_at DESC",
                (patient_id,),
            )
        else:
            cursor.execute(
                "SELECT * FROM icu_infusions WHERE patient_id = ? ORDER BY started_at DESC",
                (patient_id,),
            )
        return cursor.fetchall()


def add_io_record(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO icu_io_records (patient_id, admission_id, intake_ml, output_ml, notes, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (data["patient_id"], data.get("admission_id"), data.get("intake_ml"), data.get("output_ml"), data.get("notes"), data.get("recorded_by")),
        )
        row_id = cursor.lastrowid
        conn.commit()
        return row_id


def get_io_records(patient_id, limit=20):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM icu_io_records WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT ?",
            (patient_id, limit),
        )
        return cursor.fetchall()


def add_rass_score(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO icu_rass_scores (patient_id, admission_id, score, recorded_by) VALUES (?, ?, ?, ?)",
            (data["patient_id"], data.get("admission_id"), data["score"], data.get("recorded_by")),
        )
        row_id = cursor.lastrowid
        conn.commit()
        return row_id


def get_rass_scores(patient_id, limit=10):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM icu_rass_scores WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?",
            (patient_id, limit),
        )
        return cursor.fetchall()


def add_icu_lab_result(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO icu_lab_results (patient_id, admission_id, test_name, value, unit, flag, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (data["patient_id"], data.get("admission_id"), data["test_name"], data.get("value"), data.get("unit"), data.get("flag"), data.get("recorded_by")),
        )
        row_id = cursor.lastrowid
        conn.commit()
        return row_id


def get_icu_lab_results(patient_id, limit=20):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM icu_lab_results WHERE patient_id = ? ORDER BY created_at DESC LIMIT ?",
            (patient_id, limit),
        )
        return cursor.fetchall()


def add_icu_consult(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO icu_consults (patient_id, admission_id, specialty, consultant_name, notes, requested_by)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (data["patient_id"], data.get("admission_id"), data["specialty"], data.get("consultant_name"), data.get("notes"), data.get("requested_by")),
        )
        row_id = cursor.lastrowid
        conn.commit()
        return row_id


def update_icu_consult_status(consult_id, patient_id, status):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE icu_consults SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND patient_id = ?",
            (status, consult_id, patient_id),
        )
        updated = cursor.rowcount
        conn.commit()
        return updated > 0


def get_icu_consults(patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM icu_consults WHERE patient_id = ? ORDER BY created_at DESC",
            (patient_id,),
        )
        return cursor.fetchall()


# --- ICU daily flowsheet (the nurse's paper chart, one row per chart day) ---
def upsert_icu_flowsheet(patient_id, chart_date, data, entry_count=0, updated_by=None):
    """Insert or replace one patient-day chart. Returns the stored row."""
    payload = data if isinstance(data, str) else json.dumps(data)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO icu_flowsheets (patient_id, chart_date, data, entry_count, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (patient_id, chart_date) DO UPDATE SET
                data = EXCLUDED.data,
                entry_count = EXCLUDED.entry_count,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
            """,
            (patient_id, chart_date, payload, entry_count, updated_by),
        )
        conn.commit()
        cursor.execute(
            "SELECT * FROM icu_flowsheets WHERE patient_id = ? AND chart_date = ?",
            (patient_id, chart_date),
        )
        return cursor.fetchone()


def get_icu_flowsheet(patient_id, chart_date):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM icu_flowsheets WHERE patient_id = ? AND chart_date = ?",
            (patient_id, chart_date),
        )
        return cursor.fetchone()


# --- Patient card links ------------------------------------------------------
# The QR on a patient's OP card opens their record without a login. It carries
# an unguessable per-card token, never the UMR: UMRs are sequential, so a
# no-login page addressed by UMR would let anyone read every patient's record
# by changing the number. One active token per patient; reissuing (lost card)
# revokes the old one. Created lazily: only auth-service runs init_database().
_card_tokens_ready = False


def _ensure_card_tokens(cursor):
    global _card_tokens_ready
    if _card_tokens_ready:
        return
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS patient_card_tokens (
            id SERIAL PRIMARY KEY,
            hospital_id INTEGER NOT NULL,
            patient_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            revoked_at TIMESTAMP,
            revoked_by TEXT,
            last_used_at TIMESTAMP
        )
        """
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_patient_card_tokens_active "
        "ON patient_card_tokens (hospital_id, patient_id) WHERE revoked_at IS NULL"
    )
    _card_tokens_ready = True


def ensure_card_patient(patient_id, details, hospital_id):
    """Make sure the backend has the patient a card is printed for.

    Patients registered while the backend was unreachable, or seeded in the
    browser, exist only at the front desk; a card link needs a backend record
    to resolve to. Returns (patient_id, status):
      - ("<id>", "exists")    -- already here under that id, same person
      - ("<id>", "matched")   -- same person already here under another id
      - ("<id>", "created")   -- registered now under the card's UMR
      - (None, "conflict")    -- that UMR belongs to someone else here
      - (None, "deleted")     -- that UMR's record was deleted here
      - (None, "invalid")     -- not enough details to register
    """
    details = details or {}
    first = " ".join(str(details.get("name") or details.get("first_name") or "").split())
    last = " ".join(str(details.get("last_name") or "").split())
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patients WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (patient_id, hospital_id),
        )
        existing = cursor.fetchone()
        if existing:
            conn.commit()
            if first and not _same_person(existing, {"name": first, "last_name": last, "phone": details.get("phone")}):
                return None, "conflict"
            return patient_id, "exists"
        cursor.execute(
            "SELECT 1 FROM patients WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NOT NULL",
            (patient_id, hospital_id),
        )
        if cursor.fetchone():
            # A removed record is not re-created behind the back of whoever
            # removed it, and its id is never reused for anyone else.
            conn.commit()
            return None, "deleted"
        if not first:
            conn.commit()
            return None, "invalid"
        phone = "".join(ch for ch in str(details.get("phone") or "") if ch.isdigit())
        if phone:
            cursor.execute(
                "SELECT patient_id FROM patients WHERE hospital_id = ? AND deleted_at IS NULL "
                "AND LOWER(name) = LOWER(?) AND LOWER(last_name) = LOWER(?) "
                "AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ? LIMIT 1",
                (hospital_id, first, last, phone),
            )
            match = cursor.fetchone()
            if match:
                conn.commit()
                return match["patient_id"], "matched"
        cursor.execute("SELECT 1 FROM patients WHERE patient_id = ?", (patient_id,))
        if cursor.fetchone():
            conn.commit()
            return None, "conflict"
        age = details.get("age")
        try:
            age = int(age) if age not in (None, "") else None
        except (TypeError, ValueError):
            age = None
        cursor.execute(
            """
            INSERT INTO patients (hospital_id, patient_id, name, middle_name, last_name, age, gender, phone, address, blood_group)
            VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?)
            """,
            (
                hospital_id, patient_id, first, last, age,
                details.get("gender") or details.get("sex") or "Other",
                details.get("phone") or None, details.get("address") or None,
                details.get("blood_group") or None,
            ),
        )
        conn.commit()
        return patient_id, "created"


def get_or_create_card_token(patient_id, hospital_id, created_by=None, rotate=False):
    """The patient's active card token, issuing one if needed (or if rotating)."""
    import secrets

    with get_connection() as conn:
        cursor = conn.cursor()
        _ensure_card_tokens(cursor)
        if rotate:
            cursor.execute(
                "UPDATE patient_card_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_by = ? "
                "WHERE hospital_id = ? AND patient_id = ? AND revoked_at IS NULL",
                (created_by, hospital_id, patient_id),
            )
        else:
            cursor.execute(
                "SELECT token, created_at FROM patient_card_tokens "
                "WHERE hospital_id = ? AND patient_id = ? AND revoked_at IS NULL "
                "ORDER BY id DESC LIMIT 1",
                (hospital_id, patient_id),
            )
            row = cursor.fetchone()
            if row:
                conn.commit()
                return {"token": row["token"], "created_at": row["created_at"], "issued": False}
        token = secrets.token_urlsafe(24)
        cursor.execute(
            "INSERT INTO patient_card_tokens (hospital_id, patient_id, token, created_by) VALUES (?, ?, ?, ?)",
            (hospital_id, patient_id, token, created_by),
        )
        conn.commit()
        return {"token": token, "created_at": None, "issued": True}


def resolve_card_token(token):
    """(hospital_id, patient_id) for an active card token, else None."""
    if not token or len(token) < 20 or len(token) > 64:
        return None
    with get_connection() as conn:
        cursor = conn.cursor()
        _ensure_card_tokens(cursor)
        cursor.execute(
            "SELECT hospital_id, patient_id FROM patient_card_tokens WHERE token = ? AND revoked_at IS NULL",
            (token,),
        )
        row = cursor.fetchone()
        if not row:
            conn.commit()
            return None
        cursor.execute(
            "UPDATE patient_card_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token = ?",
            (token,),
        )
        conn.commit()
        return int(row["hospital_id"]), row["patient_id"]


def list_icu_flowsheets(patient_id, limit=60):
    """Day-wise index: newest chart day first, without the (large) data blob."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT chart_date, entry_count, updated_by, created_at, updated_at
            FROM icu_flowsheets
            WHERE patient_id = ?
            ORDER BY chart_date DESC
            LIMIT ?
            """,
            (patient_id, limit),
        )
        return cursor.fetchall()


# --- OT / Surgery cases -----------------------------------------------------
# One row per case; the 14-page digital booklet (PAC, WHO checklist,
# anaesthesia/operation record, Aldrete recovery) lives whole in `booklet`
# (JSON) -- see ensure_ot_tables() for why. `status` is the only thing the
# gate route (PATCH .../status) is allowed to move, and only when the
# relevant booklet section is actually filled in -- see modules/ot/routes.py.

def create_ot_case(data, created_by=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO ot_cases (case_no, patient_id, or_room, procedure_name, surgeon, total_amount, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"OT-PENDING-{uuid_lib.uuid4().hex[:8]}",
                data["patient_id"],
                data.get("or_room"),
                data["procedure_name"],
                data.get("surgeon"),
                data.get("total_amount", 0),
                created_by,
            ),
        )
        conn.commit()
        cursor.execute("SELECT currval(pg_get_serial_sequence('ot_cases', 'id'))")
        new_id = cursor.fetchone()[0]
        cursor.execute(
            "UPDATE ot_cases SET case_no = ? WHERE id = ?",
            (f"OT-{new_id}", new_id),
        )
        conn.commit()
        cursor.execute("SELECT * FROM ot_cases WHERE id = ?", (new_id,))
        return cursor.fetchone()


def list_ot_cases(status=None, patient_id=None, exclude_data=False):
    """Room board / queue views. include_booklet defaults on: unlike the ICU
    flowsheet list (which is a day-wise index), this hospital's whole OT board
    is small enough that the PAC/Aldrete/WHO status the board displays for
    every case is worth the extra payload rather than an N+1 fetch per case."""
    cols = "id, case_no, patient_id, or_room, procedure_name, surgeon, total_amount, status, billed_at, invoice_id, created_at, updated_at" if exclude_data else "*"
    query = f"SELECT {cols} FROM ot_cases WHERE 1=1"
    params = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if patient_id:
        query += " AND patient_id = ?"
        params.append(patient_id)
    query += " ORDER BY updated_at DESC"
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        return cursor.fetchall()


def get_ot_case(case_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM ot_cases WHERE id = ?", (case_id,))
        return cursor.fetchone()


def get_ot_case_booklet_section(case_id, section):
    row = get_ot_case(case_id)
    if not row:
        return None
    try:
        booklet = json.loads(row["booklet"]) if row["booklet"] else {}
    except (TypeError, ValueError):
        booklet = {}
    return booklet.get(section)


def save_ot_booklet_section(case_id, section, payload):
    """Merge one named section (e.g. 'pac', 'whoChecklist', 'recoveryAldrete')
    into the case's booklet JSON, leaving other sections untouched."""
    row = get_ot_case(case_id)
    if not row:
        return None
    try:
        booklet = json.loads(row["booklet"]) if row["booklet"] else {}
    except (TypeError, ValueError):
        booklet = {}
    booklet[section] = payload
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ot_cases SET booklet = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(booklet), case_id),
        )
        conn.commit()
        cursor.execute("SELECT * FROM ot_cases WHERE id = ?", (case_id,))
        return cursor.fetchone()


def save_ot_booklet_full(case_id, booklet):
    """Whole-booklet replace, for the multi-page 'Save & Sync' action."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ot_cases SET booklet = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(booklet), case_id),
        )
        conn.commit()
        cursor.execute("SELECT * FROM ot_cases WHERE id = ?", (case_id,))
        return cursor.fetchone()


def update_ot_case_status(case_id, status):
    """No gate logic here -- the route validates the booklet before calling
    this, same division of responsibility as everywhere else in this file."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ot_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, case_id),
        )
        conn.commit()
        cursor.execute("SELECT * FROM ot_cases WHERE id = ?", (case_id,))
        return cursor.fetchone()


def mark_ot_case_billed(case_id, invoice_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE ot_cases SET billed_at = CURRENT_TIMESTAMP, invoice_id = ? WHERE id = ? AND billed_at IS NULL",
            (invoice_id, case_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def list_ot_cases_pacu_ready():
    """Cases cleared out of PACU (Aldrete recovery discharge status says
    ready for the ward) but not yet picked up by a bed allocation -- this is
    the OT-side half of the ward hand-off, same shape as ER's pending
    bed-requests."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, case_no, patient_id, or_room, procedure_name, surgeon, status, booklet, updated_at
            FROM ot_cases
            WHERE status = 'PACU Recovery'
            ORDER BY updated_at ASC
            """
        )
        rows = cursor.fetchall()
    ready = []
    for row in rows:
        try:
            booklet = json.loads(row["booklet"]) if row["booklet"] else {}
        except (TypeError, ValueError):
            booklet = {}
        discharge_status = (booklet.get("recoveryAldrete") or {}).get("dischargeStatus")
        if discharge_status and discharge_status != "In PACU":
            record = dict(row)
            record.pop("booklet", None)
            record["discharge_status"] = discharge_status
            ready.append(record)
    return ready


# --- Clinical orders (radiology / nursing / dietary / referral) -----------
def add_clinical_order(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO clinical_orders (patient_id, admission_id, order_type, description, priority, notes, ordered_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data.get("admission_id"),
                data["order_type"],
                data["description"],
                data.get("priority") or "routine",
                data.get("notes"),
                data.get("ordered_by"),
            ),
        )
        row_id = cursor.lastrowid
        conn.commit()
        cursor.execute("SELECT * FROM clinical_orders WHERE id = ?", (row_id,))
        return cursor.fetchone()


def get_clinical_orders(patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM clinical_orders WHERE patient_id = ? ORDER BY ordered_at DESC",
            (patient_id,),
        )
        return cursor.fetchall()


def update_clinical_order_status(order_id, patient_id, status, notes=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        completed_at = "CURRENT_TIMESTAMP" if status == "completed" else "NULL"
        cursor.execute(
            f"""
            UPDATE clinical_orders
            SET status = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP,
                completed_at = {completed_at}
            WHERE id = ? AND patient_id = ?
            """,
            (status, notes, order_id, patient_id),
        )
        updated = cursor.rowcount
        conn.commit()
        return updated > 0


# --- Care plan (one structured, editable-over-time plan per patient) ------
def get_care_plan(patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM care_plans WHERE patient_id = ?", (patient_id,))
        return cursor.fetchone()


def upsert_care_plan(patient_id, problems, narrative, status="active", updated_by=None):
    """Insert or replace this patient's care plan in place. Returns the stored row."""
    payload = problems if isinstance(problems, str) else json.dumps(problems)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO care_plans (patient_id, status, problems, narrative, updated_by, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (patient_id) DO UPDATE SET
                status = EXCLUDED.status,
                problems = EXCLUDED.problems,
                narrative = EXCLUDED.narrative,
                updated_by = EXCLUDED.updated_by,
                updated_at = CURRENT_TIMESTAMP
            """,
            (patient_id, status or "active", payload, narrative, updated_by),
        )
        conn.commit()
        cursor.execute("SELECT * FROM care_plans WHERE patient_id = ?", (patient_id,))
        return cursor.fetchone()


def list_observation_notes(patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM observation_notes WHERE patient_id = ? ORDER BY created_at DESC",
            (patient_id,),
        )
        return cursor.fetchall()


def add_patient_movement(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO patient_movements (
                patient_id, admission_id, from_department, to_department, moved_by
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (
                data["patient_id"],
                data.get("admission_id"),
                data.get("from_department"),
                data["to_department"],
                data.get("moved_by"),
            ),
        )
        movement_id = cursor.lastrowid
        conn.commit()
        return movement_id


def list_patient_movements(patient_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM patient_movements WHERE patient_id = ? ORDER BY moved_at DESC",
            (patient_id,),
        )
        return cursor.fetchall()


# ==================== ER / Casualty module (Phase 1) ====================

# Deliberately collapsed vs. the spec's illustrative status list (which names
# icu_requested/ward_requested separately): the *clinical* outcome detail
# always lives in er_disposition.outcome, so er_visits.status only needs to
# track coarse workflow progress for the queue view, not duplicate it.
ER_STATUS_TRANSITIONS = {
    "registered": {"triaged", "closed"},
    "triaged": {"under_treatment", "doctor_assigned", "closed"},
    "under_treatment": {"doctor_assigned", "under_investigation", "stabilized", "closed"},
    # A doctor can be assigned before OR after treatment starts (Quick Intake's
    # AI flow triages then immediately assigns a doctor, before any treatment
    # is logged) -- every clinically-active state must therefore be able to
    # move back into "under_treatment" as further interventions are given,
    # or add_er_treatment()'s status nudge silently no-ops and the queue's
    # status badge gets stuck on "Doctor Assigned" forever even while the
    # patient is actively being treated.
    "doctor_assigned": {"under_treatment", "under_investigation", "stabilized", "awaiting_disposition", "closed"},
    "under_investigation": {"under_treatment", "stabilized", "awaiting_disposition", "closed"},
    "stabilized": {"under_treatment", "under_investigation", "awaiting_disposition", "closed"},
    "awaiting_disposition": {"bed_requested", "closed"},
    "bed_requested": {"bed_allocated", "closed"},
    "bed_allocated": {"transferred", "closed"},
    "transferred": {"closed"},
    "closed": set(),
}

# Disposition outcomes that need a physical bed -- these get an er_bed_requests
# row; everything else closes the visit directly (see close_er_visit).
ER_OUTCOMES_REQUIRING_BED = {"ward", "icu", "ot", "observation"}


def update_er_visit_status(hospital_id, er_visit_id, new_status):
    """Raises ValueError on an illegal transition, mirroring the
    ValueError-on-bad-input style of transfer_bed/assign_patient_to_bed."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT status FROM er_visits WHERE id = ? AND hospital_id = ?",
            (er_visit_id, hospital_id),
        )
        row = cursor.fetchone()
        if not row:
            raise ValueError("ER visit not found.")
        current_status = row["status"]
        if new_status != current_status and new_status not in ER_STATUS_TRANSITIONS.get(
            current_status, set()
        ):
            raise ValueError(
                f"Cannot move ER visit from '{current_status}' to '{new_status}'."
            )
        closed_clause = ", closed_at = CURRENT_TIMESTAMP" if new_status == "closed" else ""
        cursor.execute(
            f"UPDATE er_visits SET status = ?{closed_clause} WHERE id = ?",
            (new_status, er_visit_id),
        )
        conn.commit()
        return True


def create_er_visit(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT nextval('er_visit_seq')")
        seq = cursor.fetchone()[0]
        visit_no = f"ER-{current_ist_datetime().year}-{int(seq):06d}"
        cursor.execute(
            """
            INSERT INTO er_visits (
                hospital_id, visit_no, patient_id, is_unknown_patient, unknown_patient_label,
                arrival_mode, brought_by, referral_hospital, police_involved,
                condition_at_arrival, conscious_status, registered_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                scoped_hospital_id,
                visit_no,
                data.get("patient_id"),
                bool(data.get("is_unknown_patient", False)),
                data.get("unknown_patient_label"),
                data.get("arrival_mode"),
                data.get("brought_by"),
                data.get("referral_hospital"),
                bool(data.get("police_involved", False)),
                data.get("condition_at_arrival"),
                data.get("conscious_status"),
                data.get("registered_by"),
            ),
        )
        visit_id = cursor.fetchone()[0]
        conn.commit()
        return {"id": visit_id, "visit_no": visit_no}


def register_er_patient(
    hospital_id,
    patient_data,
    visit_data,
    complaints=None,
    vitals=None,
    registered_by=None,
):
    """Atomically registers an emergency room patient and opens their ER visit
    without needing any OP registration detour or merge steps."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()

    patient_id = patient_data.get("patient_id")
    if not patient_id:
        patient_id = generate_er_patient_id(scoped_hospital_id)

    name = (patient_data.get("name") or "Emergency Patient").strip()
    middle_name = (patient_data.get("middle_name") or "").strip()
    last_name = (patient_data.get("last_name") or "").strip()

    with get_connection() as conn:
        cursor = conn.cursor()
        # 1. Insert patient
        cursor.execute(
            """
            INSERT INTO patients (
                hospital_id, patient_id, name, middle_name, last_name,
                dob, age, weight, height, gender, pregnant,
                allergies, symptoms, phone, address, blood_group,
                emergency_contact, aadhar_number, registration_source, patient_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emergency', 'emergency')
            """,
            (
                scoped_hospital_id,
                patient_id,
                name,
                middle_name,
                last_name,
                patient_data.get("dob"),
                patient_data.get("age"),
                patient_data.get("weight"),
                patient_data.get("height"),
                patient_data.get("gender"),
                1 if patient_data.get("pregnant") else 0,
                patient_data.get("allergies", ""),
                patient_data.get("symptoms", ""),
                patient_data.get("phone", ""),
                patient_data.get("address", ""),
                patient_data.get("blood_group", ""),
                patient_data.get("emergency_contact", ""),
                patient_data.get("aadhar_number", ""),
            ),
        )
        conn.commit()

    # 2-4. Create the ER visit (+ complaints/vitals) -- the patient insert
    # above already committed on its own connection, so it's NOT covered by
    # any transaction spanning these steps. If any of them raise, this
    # deletes that patient row before re-raising rather than leaving an
    # orphaned "Emergency Patient" record with no visit behind it -- the
    # docstring says "atomically" and this is what actually makes that true.
    try:
        visit_payload = dict(visit_data or {})
        visit_payload["patient_id"] = patient_id
        visit_payload["is_unknown_patient"] = False
        visit_payload["registered_by"] = registered_by or visit_payload.get("registered_by")
        visit_result = create_er_visit(visit_payload, hospital_id=scoped_hospital_id)
        visit_id = visit_result["id"]

        if complaints:
            if isinstance(complaints, list):
                for c in complaints:
                    if isinstance(c, str) and c.strip():
                        add_er_complaint(scoped_hospital_id, visit_id, {"complaint": c.strip(), "reported_by": registered_by})
                    elif isinstance(c, dict) and c.get("complaint"):
                        c.setdefault("reported_by", registered_by)
                        add_er_complaint(scoped_hospital_id, visit_id, c)
            elif isinstance(complaints, str) and complaints.strip():
                add_er_complaint(scoped_hospital_id, visit_id, {"complaint": complaints.strip(), "reported_by": registered_by})

        if vitals and isinstance(vitals, dict):
            has_vitals = any(vitals.get(k) is not None and str(vitals.get(k)).strip() != "" for k in ["heart_rate", "bp_systolic", "bp_diastolic", "spo2", "temperature", "respiratory_rate", "pain_score", "gcs"])
            if has_vitals:
                add_er_vitals(scoped_hospital_id, visit_id, vitals, recorded_by=registered_by)
    except Exception:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM patients WHERE patient_id = ? AND hospital_id = ?",
                (patient_id, scoped_hospital_id),
            )
            conn.commit()
        raise

    patient_record = get_patient(patient_id, hospital_id=scoped_hospital_id)
    return {
        "patient_id": patient_id,
        "patient": dict(patient_record) if patient_record else patient_data,
        "visit": visit_result,
    }


def list_er_visits(patient_id=None, hospital_id=None, status=None, active_only=False):
    """Includes the current triage category/bay and patient demographics
    (LEFT JOINs) so the ED tracking board displays acuity and patient info directly."""
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["v.deleted_at IS NULL"]
        params = []
        if hospital_id:
            clauses.append("v.hospital_id = ?")
            params.append(hospital_id)
        if patient_id:
            clauses.append("v.patient_id = ?")
            params.append(patient_id)
        if status:
            clauses.append("v.status = ?")
            params.append(status)
        if active_only:
            clauses.append("v.status != 'closed'")
        where_clause = f" WHERE {' AND '.join(clauses)}"
        cursor.execute(
            f"""
            SELECT v.*, t.category AS triage_category, t.triage_bed_label AS triage_bed_label,
                   p.name AS patient_name, p.last_name AS patient_last_name, p.gender AS patient_gender,
                   p.age AS patient_age, p.phone AS patient_phone, p.emergency_contact AS patient_emergency_contact
            FROM er_visits v
            LEFT JOIN er_triage t ON t.er_visit_id = v.id
            LEFT JOIN patients p ON p.patient_id = v.patient_id AND p.hospital_id = v.hospital_id
            {where_clause}
            ORDER BY v.arrival_at DESC
            """,
            tuple(params),
        )
        return cursor.fetchall()


def get_er_visit(er_visit_id, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM er_visits WHERE id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (er_visit_id, scoped_hospital_id),
        )
        visit = cursor.fetchone()
        if not visit:
            return None
        visit = dict(visit)

        # Attach linked patient demographics if available
        if visit.get("patient_id"):
            cursor.execute(
                "SELECT * FROM patients WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL",
                (visit["patient_id"], scoped_hospital_id),
            )
            p_row = cursor.fetchone()
            visit["patient"] = dict(p_row) if p_row else None
        else:
            visit["patient"] = None

        cursor.execute(
            "SELECT * FROM er_complaints WHERE er_visit_id = ? ORDER BY created_at ASC",
            (er_visit_id,),
        )
        visit["complaints"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM er_incident_history WHERE er_visit_id = ?", (er_visit_id,)
        )
        incident = cursor.fetchone()
        visit["incident_history"] = dict(incident) if incident else None

        cursor.execute(
            "SELECT * FROM er_vitals WHERE er_visit_id = ? ORDER BY recorded_at ASC",
            (er_visit_id,),
        )
        visit["vitals"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM er_triage WHERE er_visit_id = ?", (er_visit_id,))
        triage = cursor.fetchone()
        visit["triage"] = dict(triage) if triage else None

        cursor.execute(
            "SELECT * FROM er_treatments WHERE er_visit_id = ? ORDER BY performed_at ASC",
            (er_visit_id,),
        )
        visit["treatments"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            "SELECT * FROM er_clinical_notes WHERE er_visit_id = ? ORDER BY created_at ASC",
            (er_visit_id,),
        )
        visit["clinical_notes"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT * FROM er_disposition WHERE er_visit_id = ?", (er_visit_id,))
        disposition = cursor.fetchone()
        visit["disposition"] = dict(disposition) if disposition else None

        cursor.execute(
            "SELECT * FROM er_bed_requests WHERE er_visit_id = ? ORDER BY requested_at DESC",
            (er_visit_id,),
        )
        visit["bed_requests"] = [dict(r) for r in cursor.fetchall()]

        return visit


def merge_er_unknown_patient(hospital_id, er_visit_id, patient_id):
    """Links a temporary unknown-patient ER visit to a confirmed patient_id
    once identity is known. Everything already recorded on the visit
    (complaints/vitals/triage/treatments/notes) stays exactly where it is --
    only er_visits.patient_id changes, so nothing needs to be copied.

    Raises ValueError if patient_id doesn't refer to a real, non-deleted
    patient in this hospital -- previously any string was accepted as-is, so
    a typo silently "succeeded": is_unknown_patient flipped to FALSE, the
    queue's LEFT JOIN then shows a blank name for a patient_id that matches
    nothing, and the UI can no longer offer a re-merge since it only renders
    that option while is_unknown_patient is still true."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM er_visits WHERE id = ? AND hospital_id = ?",
            (er_visit_id, hospital_id),
        )
        if not cursor.fetchone():
            return False
        cursor.execute(
            "SELECT patient_id FROM patients WHERE patient_id = ? AND hospital_id = ? AND deleted_at IS NULL",
            (patient_id, hospital_id),
        )
        if not cursor.fetchone():
            raise ValueError(f"Patient {patient_id} was not found in this hospital.")
        cursor.execute(
            "UPDATE er_visits SET patient_id = ?, is_unknown_patient = FALSE, "
            "merged_into_patient_id = ? WHERE id = ?",
            (patient_id, patient_id, er_visit_id),
        )
        conn.commit()
        return True


def add_er_complaint(hospital_id, er_visit_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO er_complaints (
                hospital_id, er_visit_id, complaint, severity, start_date, start_time,
                duration, progression, associated_symptoms, source_of_information,
                reported_by, case_category
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                hospital_id,
                er_visit_id,
                data["complaint"],
                data.get("severity"),
                data.get("start_date"),
                data.get("start_time"),
                data.get("duration"),
                data.get("progression"),
                data.get("associated_symptoms"),
                data.get("source_of_information"),
                data.get("reported_by"),
                data.get("case_category"),
            ),
        )
        complaint_id = cursor.fetchone()[0]
        conn.commit()
        return complaint_id


def set_er_incident(hospital_id, er_visit_id, data):
    """One incident-history record per visit -- an upsert, since staff refine
    incident details as more information arrives rather than filing a fresh
    record each time."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM er_incident_history WHERE er_visit_id = ?", (er_visit_id,)
        )
        existing = cursor.fetchone()
        details_json = json.dumps(data.get("details") or {})
        if existing:
            cursor.execute(
                "UPDATE er_incident_history SET incident_type = ?, incident_at = ?, "
                "incident_time_precision = ?, discovered_at = ?, details_json = ? "
                "WHERE er_visit_id = ?",
                (
                    data.get("incident_type"),
                    data.get("incident_at"),
                    data.get("incident_time_precision"),
                    data.get("discovered_at"),
                    details_json,
                    er_visit_id,
                ),
            )
        else:
            cursor.execute(
                "INSERT INTO er_incident_history (hospital_id, er_visit_id, incident_type, "
                "incident_at, incident_time_precision, discovered_at, details_json) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    hospital_id,
                    er_visit_id,
                    data.get("incident_type"),
                    data.get("incident_at"),
                    data.get("incident_time_precision"),
                    data.get("discovered_at"),
                    details_json,
                ),
            )
        conn.commit()
        return True


def add_er_vitals(hospital_id, er_visit_id, data, recorded_by=None):
    """Every call inserts a new row -- vitals are never updated/overwritten,
    matching the spec's BR-003."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO er_vitals (
                hospital_id, er_visit_id, recorded_by, heart_rate, bp_systolic, bp_diastolic,
                respiratory_rate, spo2, temperature, consciousness_level, blood_glucose,
                pain_score, gcs, pupillary_response, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                hospital_id,
                er_visit_id,
                recorded_by,
                data.get("heart_rate"),
                data.get("bp_systolic"),
                data.get("bp_diastolic"),
                data.get("respiratory_rate"),
                data.get("spo2"),
                data.get("temperature"),
                data.get("consciousness_level"),
                data.get("blood_glucose"),
                data.get("pain_score"),
                data.get("gcs"),
                data.get("pupillary_response"),
                data.get("notes"),
            ),
        )
        vitals_id = cursor.fetchone()[0]
        conn.commit()
        return vitals_id


def list_er_triage_config(hospital_id, active_only=True):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["hospital_id = ?", "deleted_at IS NULL"]
        params = [hospital_id]
        if active_only:
            clauses.append("is_active = TRUE")
        cursor.execute(
            f"SELECT * FROM er_triage_config WHERE {' AND '.join(clauses)} "
            "ORDER BY sort_order ASC, category_code ASC",
            tuple(params),
        )
        return cursor.fetchall()


def create_er_triage_category(hospital_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO er_triage_config (
                hospital_id, category_code, category_label, description, sort_order, color
            ) VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                hospital_id,
                data["category_code"],
                data["category_label"],
                data.get("description"),
                int(data.get("sort_order", 0) or 0),
                data.get("color"),
            ),
        )
        category_id = cursor.fetchone()[0]
        conn.commit()
        return category_id


def set_er_triage(hospital_id, er_visit_id, data, assigned_by=None):
    """One triage row per visit -- corrections overwrite it; the change itself
    is captured by the generic audit-log mechanism at the route layer (same
    as the spec's own "Nurse01 changed triage level B3->B1" example), not a
    separate history table here."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM er_triage WHERE er_visit_id = ?", (er_visit_id,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE er_triage SET category = ?, triage_bed_label = ?, reason = ?, "
                "assigned_by = ?, triaged_at = CURRENT_TIMESTAMP WHERE er_visit_id = ?",
                (
                    data["category"],
                    data.get("triage_bed_label"),
                    data.get("reason"),
                    assigned_by,
                    er_visit_id,
                ),
            )
        else:
            cursor.execute(
                "INSERT INTO er_triage (hospital_id, er_visit_id, category, triage_bed_label, "
                "reason, assigned_by) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    hospital_id,
                    er_visit_id,
                    data["category"],
                    data.get("triage_bed_label"),
                    data.get("reason"),
                    assigned_by,
                ),
            )
        conn.commit()

    # Best-effort forward nudge -- triage can be corrected later in the visit
    # (e.g. after treatment has already started), so an invalid-transition
    # error here is expected and non-fatal, not a reason to fail the request.
    try:
        update_er_visit_status(hospital_id, er_visit_id, "triaged")
    except ValueError:
        pass
    return True


def add_er_treatment(hospital_id, er_visit_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO er_treatments (
                hospital_id, er_visit_id, intervention_type, description,
                administered_by, prescribed_by, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """,
            (
                hospital_id,
                er_visit_id,
                data["intervention_type"],
                data.get("description"),
                data.get("administered_by"),
                data.get("prescribed_by"),
                data.get("notes"),
            ),
        )
        treatment_id = cursor.fetchone()[0]
        conn.commit()

    try:
        update_er_visit_status(hospital_id, er_visit_id, "under_treatment")
    except ValueError:
        pass
    return treatment_id


def assign_er_doctor(hospital_id, er_visit_id, specialty, doctor_name=None):
    """Suggests a doctor via the same deterministic matching Symptom AI triage
    uses when no doctor_name is given explicitly; staff can always override
    with an explicit doctor_name. Never decides on its own who treats the
    patient -- only fills in a suggestion for staff to confirm.

    If nobody in the exact requested specialty is on staff, falls back to any
    other available doctor (real ER practice: the on-call/general physician
    covers until a specialist is free) instead of leaving the visit
    unassigned. get_suggested_doctors() already does this same
    exact-department-first-else-anyone fallback internally, but a naive
    match_doctor_to_department() re-filter on its result would silently
    throw that fallback away again whenever the exact department has no
    doctor -- so the fallback candidate is taken directly here instead."""
    final_doctor = (doctor_name or "").strip()
    matched_specialty = specialty
    used_fallback = False
    if not final_doctor:
        candidates = get_suggested_doctors(department=specialty, hospital_id=hospital_id)
        available = [
            f"{doc['doctor_name']} ({doc.get('department') or ''})"
            for doc in candidates
            if doc.get("doctor_name")
        ]
        final_doctor = match_doctor_to_department(available, specialty)
        if not final_doctor and candidates:
            top = candidates[0]
            final_doctor = (top.get("doctor_name") or "").strip()
            matched_specialty = top.get("department") or specialty
            used_fallback = bool(final_doctor)

    with get_connection() as conn:
        cursor = conn.cursor()
        # matched_specialty, not specialty -- on a fallback match it holds the
        # covering doctor's REAL department, while `specialty` is still the
        # originally requested one. Storing `specialty` here was writing e.g.
        # "Cardiology" (what was asked for) even though the doctor actually
        # assigned practices General Medicine (the fallback that was found) --
        # the accept toast and printed handover sheet would then show a
        # doctor next to a specialty they don't actually belong to.
        cursor.execute(
            "UPDATE er_visits SET assigned_doctor_name = ?, assigned_specialty = ?, "
            "doctor_assigned_at = CURRENT_TIMESTAMP, doctor_accepted_at = NULL "
            "WHERE id = ? AND hospital_id = ?",
            (final_doctor or None, matched_specialty, er_visit_id, hospital_id),
        )
        conn.commit()

    try:
        update_er_visit_status(hospital_id, er_visit_id, "doctor_assigned")
    except ValueError:
        pass
    return {
        "doctor_name": final_doctor,
        "matched_specialty": matched_specialty,
        "used_fallback": used_fallback,
    }


def accept_er_doctor_assignment(hospital_id, er_visit_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE er_visits SET doctor_accepted_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND hospital_id = ? AND assigned_doctor_name IS NOT NULL",
            (er_visit_id, hospital_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def add_er_clinical_note(hospital_id, er_visit_id, note_type, content, author=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO er_clinical_notes (hospital_id, er_visit_id, note_type, author, content) "
            "VALUES (?, ?, ?, ?, ?) RETURNING id",
            (hospital_id, er_visit_id, note_type, author, content),
        )
        note_id = cursor.fetchone()[0]
        conn.commit()
        return note_id


def record_er_disposition(hospital_id, er_visit_id, data, decided_by=None):
    """Records the ER doctor's clinical decision -- never a bed number. For
    outcomes that need a physical bed, also creates the er_bed_requests row
    Reception fulfills via allocate_er_bed_request(); this function never
    touches bed_master/bed_allocations itself."""
    outcome = data["outcome"]
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT status FROM er_visits WHERE id = ? AND hospital_id = ?",
            (er_visit_id, hospital_id),
        )
        visit_row = cursor.fetchone()
        if not visit_row:
            raise ValueError("ER visit not found.")
        if visit_row["status"] in ("bed_allocated", "transferred", "closed"):
            raise ValueError("This ER visit has already progressed past the disposition stage.")

        cursor.execute("SELECT id FROM er_disposition WHERE er_visit_id = ?", (er_visit_id,))
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE er_disposition SET outcome = ?, required_specialty = ?, "
                "clinical_reason = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, "
                "priority = ? WHERE er_visit_id = ? RETURNING id",
                (
                    outcome,
                    data.get("required_specialty"),
                    data["clinical_reason"],
                    decided_by,
                    data.get("priority"),
                    er_visit_id,
                ),
            )
        else:
            cursor.execute(
                "INSERT INTO er_disposition (hospital_id, er_visit_id, outcome, "
                "required_specialty, clinical_reason, decided_by, priority) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
                (
                    hospital_id,
                    er_visit_id,
                    outcome,
                    data.get("required_specialty"),
                    data["clinical_reason"],
                    decided_by,
                    data.get("priority"),
                ),
            )
        disposition_id = cursor.fetchone()[0]

        # A disposition correction (existing != None) can change the outcome
        # away from one that needed a bed, or to a different bed-requiring
        # outcome entirely (ward -> icu) -- either way, any bed request the
        # PREVIOUS outcome raised is now stale and must not be left
        # "pending" for Reception to act on. Without this, ward -> discharge
        # left the original ward request sitting in Bed Management's queue
        # indefinitely, allocatable for a patient who's actually being
        # discharged; ward -> icu left two pending requests instead of one.
        if existing:
            cursor.execute(
                "UPDATE er_bed_requests SET status = 'cancelled' "
                "WHERE er_visit_id = ? AND status = 'pending'",
                (er_visit_id,),
            )

        bed_request_id = None
        if outcome in ER_OUTCOMES_REQUIRING_BED:
            cursor.execute(
                "INSERT INTO er_bed_requests (hospital_id, er_visit_id, disposition_id, "
                "requested_level_of_care, requested_specialty, requested_by) "
                "VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
                (
                    hospital_id,
                    er_visit_id,
                    disposition_id,
                    outcome,
                    data.get("required_specialty"),
                    decided_by,
                ),
            )
            bed_request_id = cursor.fetchone()[0]

        # Recording a disposition is itself the "we've reached the decision
        # point" transition, so this sets status directly in the same
        # transaction rather than going through update_er_visit_status's
        # stricter step-by-step transition table -- real ER visits don't
        # reliably walk through every intermediate status via a separate API
        # call first (e.g. a nurse may give oxygen before a doctor is even
        # assigned), and disposition recording shouldn't be blocked by that.
        new_status = "bed_requested" if bed_request_id else "awaiting_disposition"
        cursor.execute("UPDATE er_visits SET status = ? WHERE id = ?", (new_status, er_visit_id))
        conn.commit()

    return {"disposition_id": disposition_id, "bed_request_id": bed_request_id}


def list_er_bed_requests(hospital_id, status=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["r.hospital_id = ?"]
        params = [hospital_id]
        if status:
            clauses.append("r.status = ?")
            params.append(status)
        cursor.execute(
            f"""
            SELECT r.*, v.visit_no, v.patient_id, v.unknown_patient_label, v.is_unknown_patient
            FROM er_bed_requests r
            JOIN er_visits v ON v.id = r.er_visit_id
            WHERE {' AND '.join(clauses)}
            ORDER BY r.requested_at ASC
            """,
            tuple(params),
        )
        return cursor.fetchall()


def allocate_er_bed_request(
    hospital_id, bed_request_id, bed_id, notes, allocated_by=None, expected_los_days=None
):
    """Reception fulfilling an ER bed request. Calls assign_patient_to_bed()
    completely unchanged -- this function only reads the request, delegates
    the actual bed assignment, then records the back-link and advances the
    request/visit status. The bed_id always comes from the caller (Reception,
    choosing from real availability); this function never picks one itself --
    that's the boundary the whole ER module is built around."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM er_bed_requests WHERE id = ? AND hospital_id = ? AND status = 'pending'",
            (bed_request_id, hospital_id),
        )
        req = cursor.fetchone()
        if not req:
            return None
        er_visit_id = req["er_visit_id"]
        cursor.execute("SELECT patient_id FROM er_visits WHERE id = ?", (er_visit_id,))
        visit_row = cursor.fetchone()
        patient_id = visit_row["patient_id"] if visit_row else None

    if not patient_id:
        raise ValueError(
            "This ER visit isn't linked to a confirmed patient record yet -- "
            "merge the unknown patient before allocating a bed."
        )

    result = assign_patient_to_bed(
        hospital_id, bed_id, patient_id, notes, expected_los_days=expected_los_days
    )
    if result is None:
        return None

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE er_bed_requests SET status = 'allocated', allocated_bed_id = ?, "
            "allocated_admission_id = ?, allocated_by = ?, allocated_at = CURRENT_TIMESTAMP "
            "WHERE id = ?",
            (bed_id, result["admission_id"], allocated_by, bed_request_id),
        )
        cursor.execute(
            "UPDATE admissions SET er_visit_id = ? WHERE id = ?",
            (er_visit_id, result["admission_id"]),
        )
        conn.commit()

    # Best-effort: the bed is already assigned and committed above regardless
    # of whether this coarse status label updates cleanly, so a mismatch here
    # must never look like the allocation itself failed.
    try:
        update_er_visit_status(hospital_id, er_visit_id, "bed_allocated")
    except ValueError:
        pass
    return {**result, "er_visit_id": er_visit_id, "bed_request_id": bed_request_id}


def compute_er_charges(hospital_id, er_visit_id, consultation_fee=0.0):
    """Itemizes an ER visit's own charges for staff review before an invoice
    is raised -- mirrors compute_room_charges()'s shape. Only used for
    outcomes that close without an admission; an admitted visit's stay is
    billed by the existing IP invoice at discharge instead, exactly like OP
    consultation and IP room charges are already two separate invoice events
    at two separate points in time. Treatment line items have no per-item
    price configured in Phase 1 -- they're listed for the review step, not
    automatically priced; staff enter/adjust the reviewed total on confirm."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT intervention_type, description FROM er_treatments "
            "WHERE hospital_id = ? AND er_visit_id = ? ORDER BY performed_at ASC",
            (hospital_id, er_visit_id),
        )
        treatment_rows = cursor.fetchall()

    items = []
    total = 0.0
    if consultation_fee:
        items.append({"label": "ER Consultation", "amount": float(consultation_fee)})
        total += float(consultation_fee)
    for row in treatment_rows:
        label = (
            row["intervention_type"]
            if not row["description"]
            else f"{row['intervention_type']} — {row['description']}"
        )
        items.append({"label": label, "amount": 0.0})
    return {"items": items, "total": total}


def close_er_visit(hospital_id, er_visit_id, total_amount=None, consultation_fee=0.0, created_by=None):
    """Closes an ER visit that isn't being admitted (discharge/referral/
    transfer/death/other outcomes) and raises its invoice -- mirrors how
    release_bed() auto-invoices at the equivalent IP closing action.
    total_amount, when given, is the staff-reviewed/adjusted total from the
    closing modal; when omitted, falls back to compute_er_charges()'s total.
    No new "deposit before total is known" capability -- confirmed not to
    exist anywhere in the app today, out of scope for this pass."""
    charges = compute_er_charges(hospital_id, er_visit_id, consultation_fee=consultation_fee)
    total = total_amount if total_amount is not None else charges["total"]

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT patient_id FROM er_visits WHERE id = ? AND hospital_id = ?",
            (er_visit_id, hospital_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        patient_id = row["patient_id"]

    invoice_id = None
    if total and total > 0 and patient_id:
        invoice_no = new_invoice_no(f"INV-ER-{er_visit_id}")
        invoice_id = create_invoice(
            {
                "invoice_no": invoice_no,
                "patient_id": patient_id,
                "module": "ER",
                "total_amount": total,
                "subtotal": total,
                "payment_status": "due",
                "created_by": created_by,
            },
            hospital_id=hospital_id,
        )

    update_er_visit_status(hospital_id, er_visit_id, "closed")
    return {"invoice_id": invoice_id, "total": total, "items": charges["items"]}


def get_patient_journey(patient_id, hospital_id=None):
    patient = get_patient(patient_id, hospital_id=hospital_id)
    if not patient:
        return None
    patient = dict(patient)

    events = []
    if patient.get("created_at"):
        events.append(
            {
                "stage": "registration",
                "label": "Patient Registered",
                "timestamp": patient["created_at"],
            }
        )

    for row in list_er_visits(patient_id=patient_id, hospital_id=hospital_id):
        er_visit = dict(row)
        events.append(
            {
                "stage": "er",
                "label": f"ER visit registered ({er_visit.get('visit_no')})"
                + (f" — {er_visit.get('arrival_mode')}" if er_visit.get("arrival_mode") else ""),
                "timestamp": er_visit.get("arrival_at"),
                "detail": {"visit_no": er_visit.get("visit_no"), "status": er_visit.get("status")},
            }
        )
        with get_connection() as conn:
            er_cursor = conn.cursor()
            er_cursor.execute(
                "SELECT category, triage_bed_label, triaged_at FROM er_triage WHERE er_visit_id = ?",
                (er_visit["id"],),
            )
            triage_row = er_cursor.fetchone()
            if triage_row:
                events.append(
                    {
                        "stage": "er",
                        "label": f"ER triage: {triage_row['category']}"
                        + (
                            f" — {triage_row['triage_bed_label']}"
                            if triage_row["triage_bed_label"]
                            else ""
                        ),
                        "timestamp": triage_row["triaged_at"],
                    }
                )
            er_cursor.execute(
                "SELECT outcome, clinical_reason, decided_at FROM er_disposition WHERE er_visit_id = ?",
                (er_visit["id"],),
            )
            disposition_row = er_cursor.fetchone()
            if disposition_row:
                events.append(
                    {
                        "stage": "er",
                        "label": f"ER disposition: {disposition_row['outcome']}"
                        + (
                            f" — {disposition_row['clinical_reason']}"
                            if disposition_row["clinical_reason"]
                            else ""
                        ),
                        "timestamp": disposition_row["decided_at"],
                    }
                )

    for row in list_appointments(patient_id=patient_id, hospital_id=hospital_id):
        appt = dict(row)
        events.append(
            {
                "stage": "queue",
                "label": f"Appointment scheduled ({appt.get('visit_type')}, token #{appt.get('token_no')})",
                "timestamp": appt.get("created_at") or appt.get("appointment_date"),
                "detail": {
                    "doctor_name": appt.get("doctor_name"),
                    "department": appt.get("department"),
                },
            }
        )
        if appt.get("checked_in_at"):
            events.append(
                {
                    "stage": "consultation",
                    "label": "Patient checked in",
                    "timestamp": appt.get("checked_in_at"),
                }
            )
        if appt.get("consultation_started_at"):
            events.append(
                {
                    "stage": "consultation",
                    "label": f"Consultation started with Dr. {appt.get('doctor_name') or '—'}",
                    "timestamp": appt.get("consultation_started_at"),
                }
            )
        if appt.get("consultation_completed_at"):
            events.append(
                {
                    "stage": "consultation",
                    "label": "Consultation completed",
                    "timestamp": appt.get("consultation_completed_at"),
                }
            )
        if appt.get("status") == "cancelled":
            events.append(
                {
                    "stage": "consultation",
                    "label": "Appointment cancelled",
                    "timestamp": appt.get("appointment_date"),
                }
            )

    for row in list_bed_allocations(patient_id=patient_id, hospital_id=hospital_id):
        allocation = dict(row)
        bed_label = f"{allocation.get('ward') or '-'} / Room {allocation.get('room_no') or '-'} / Bed {allocation.get('bed_no') or '-'}"
        if allocation.get("allocated_at"):
            events.append(
                {
                    "stage": "bed",
                    "label": (
                        f"Transferred to {bed_label}"
                        if allocation.get("previous_allocation_id")
                        else f"Admitted to {bed_label}"
                    ),
                    "timestamp": allocation.get("allocated_at"),
                }
            )
        if allocation.get("status") == "transferred" and allocation.get("released_at"):
            events.append(
                {
                    "stage": "bed",
                    "label": f"Transferred out of {bed_label}"
                    + (f" — {allocation['transfer_reason']}" if allocation.get("transfer_reason") else ""),
                    "timestamp": allocation.get("released_at"),
                }
            )
        elif allocation.get("status") == "released" and allocation.get("released_at"):
            events.append(
                {
                    "stage": "bed",
                    "label": f"Discharged, {bed_label} released",
                    "timestamp": allocation.get("released_at"),
                }
            )

    for row in list_observation_notes(patient_id):
        note = dict(row)
        events.append(
            {
                "stage": "clinical",
                "label": f"Treatment plan / notes recorded by Dr. {note.get('doctor_name') or '—'}",
                "timestamp": note.get("created_at"),
                "detail": {
                    "note": note.get("note"),
                    "treatment_plan": note.get("treatment_plan"),
                },
            }
        )

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pharmacy_prescriptions WHERE patient_id = ? AND hospital_id = ? "
            "ORDER BY created_at DESC",
            (patient_id, hospital_id),
        )
        prescription_rows = [dict(r) for r in cursor.fetchall()]
        cursor.execute(
            "SELECT * FROM documents WHERE patient_id = ? AND deleted_at IS NULL "
            "ORDER BY created_at DESC",
            (patient_id,),
        )
        document_rows = [dict(r) for r in cursor.fetchall()]

    for med in parse_pharmacy_prescriptions(prescription_rows):
        events.append(
            {
                "stage": "pharmacy",
                "label": f"Prescribed {med.get('medicine_name')}"
                + (f" ({med['dosage']})" if med.get("dosage") else "")
                + f" — Dr. {med.get('doctor_username') or '—'}",
                "timestamp": med.get("created_at"),
                "detail": {"status": med.get("status")},
            }
        )

    for doc in document_rows:
        events.append(
            {
                "stage": "documents",
                "label": f"{doc.get('doc_type') or 'Document'} uploaded: {doc.get('file_name')}",
                "timestamp": doc.get("created_at"),
            }
        )

    for row in list_patient_movements(patient_id):
        movement = dict(row)
        events.append(
            {
                "stage": "queue",
                "label": f"Moved {movement.get('from_department') or '-'} -> {movement.get('to_department')}",
                "timestamp": movement.get("moved_at"),
            }
        )

    consultation_billed = 0.0
    consultation_paid = 0.0
    for row in list_invoices(patient_id=patient_id, hospital_id=hospital_id):
        invoice = dict(row)
        total_amount = float(invoice.get("total_amount") or 0)
        paid_amount = float(invoice.get("paid_amount") or 0)
        consultation_billed += total_amount
        consultation_paid += paid_amount
        events.append(
            {
                "stage": "billing",
                "label": f"Invoice {invoice.get('invoice_no')} raised — total {total_amount} ({invoice.get('payment_status')})",
                "timestamp": invoice.get("created_at"),
            }
        )

    for row in list_invoice_payments_for_patient(patient_id, hospital_id=hospital_id):
        payment = dict(row)
        events.append(
            {
                "stage": "billing",
                "label": f"Payment received: {payment.get('amount')} via {payment.get('payment_mode')} (Invoice {payment.get('invoice_no')})",
                "timestamp": payment.get("created_at"),
            }
        )

    lab_billed = 0.0
    lab_paid = 0.0
    for row in list_diagnostics(patient_id=patient_id, hospital_id=hospital_id):
        diagnostic = dict(row)
        amount = float(diagnostic.get("amount") or 0)
        paid_amount = float(diagnostic.get("paid_amount") or 0)
        lab_billed += amount
        lab_paid += paid_amount
        events.append(
            {
                "stage": "lab",
                "label": f"Lab order: {diagnostic.get('test_name')} ({diagnostic.get('order_status')}) — {amount}",
                "timestamp": diagnostic.get("created_at"),
            }
        )

    # Pharmacy sales have no due/partial concept -- they're paid in full at the
    # point of sale, so billed and paid are always equal.
    pharmacy_billed = 0.0
    for row in list_pharmacy_sales(patient_id=patient_id, hospital_id=hospital_id):
        sale = dict(row)
        amount = float(sale.get("amount") or 0)
        pharmacy_billed += amount
        events.append(
            {
                "stage": "pharmacy",
                "label": f"Pharmacy sale: {sale.get('medicine_name')} x{sale.get('quantity')} — {amount}",
                "timestamp": sale.get("sold_at"),
            }
        )
    pharmacy_paid = pharmacy_billed

    # Each ICU chart day the nurse recorded shows on the journey, so the daily
    # flowsheet is part of the patient's clinical record rather than a side file.
    try:
        for row in list_icu_flowsheets(patient_id):
            flow = dict(row)
            count = flow.get("entry_count") or 0
            events.append(
                {
                    "stage": "icu",
                    "label": f"ICU daily chart recorded ({count} entries)",
                    "timestamp": flow.get("updated_at") or flow.get("created_at"),
                    "detail": {
                        "chart_date": str(flow.get("chart_date")),
                        "entry_count": count,
                        "updated_by": flow.get("updated_by"),
                    },
                }
            )
    except Exception:
        # A missing icu_flowsheets table must never break the whole journey.
        pass

    # Every OT/surgery case shows on the journey the same way ICU chart days
    # do -- otherwise a surgery is invisible to the rest of the patient's record.
    try:
        for row in list_ot_cases(patient_id=patient_id):
            case = dict(row)
            events.append(
                {
                    "stage": "ot",
                    "label": f"OT: {case.get('procedure_name')} — {case.get('status')}",
                    "timestamp": case.get("updated_at") or case.get("created_at"),
                    "detail": {
                        "case_no": case.get("case_no"),
                        "or_room": case.get("or_room"),
                        "surgeon": case.get("surgeon"),
                        "status": case.get("status"),
                    },
                }
            )
    except Exception:
        # A missing ot_cases table must never break the whole journey.
        pass

    # Clinical orders and the care plan likewise show up as dated journey
    # events -- each reflects the order/plan's current state as of its last
    # update, not a full per-status-change history.
    try:
        for row in get_clinical_orders(patient_id):
            order = dict(row)
            events.append(
                {
                    "stage": "orders",
                    "label": f"{(order.get('order_type') or '').title()} order: {order.get('description')} ({order.get('status')})",
                    "timestamp": order.get("updated_at") or order.get("ordered_at"),
                    "detail": {
                        "order_type": order.get("order_type"),
                        "priority": order.get("priority"),
                        "status": order.get("status"),
                        "ordered_by": order.get("ordered_by"),
                    },
                }
            )
    except Exception:
        # A missing clinical_orders table must never break the whole journey.
        pass

    try:
        plan_row = get_care_plan(patient_id)
        if plan_row:
            plan = dict(plan_row)
            try:
                problems = json.loads(plan.get("problems") or "[]")
            except (TypeError, ValueError):
                problems = []
            active_count = sum(1 for p in problems if isinstance(p, dict) and p.get("status") == "active")
            events.append(
                {
                    "stage": "care_plan",
                    "label": f"Care plan updated ({active_count} active problem{'s' if active_count != 1 else ''})",
                    "timestamp": plan.get("updated_at") or plan.get("created_at"),
                    "detail": {
                        "status": plan.get("status"),
                        "problem_count": len(problems),
                        "updated_by": plan.get("updated_by"),
                    },
                }
            )
    except Exception:
        # A missing care_plans table must never break the whole journey.
        pass

    # Postgres returns native datetime objects while SQLite returns strings; mixing
    # None with either in a raw sort raises TypeError, so normalize everything to str
    # (Python's default datetime str() is still chronologically sortable).
    events.sort(key=lambda event: str(event["timestamp"]) if event["timestamp"] else "")

    total_billed = consultation_billed + lab_billed + pharmacy_billed
    total_paid = consultation_paid + lab_paid + pharmacy_paid
    summary = {
        "consultation_billed": consultation_billed,
        "consultation_paid": consultation_paid,
        "lab_billed": lab_billed,
        "lab_paid": lab_paid,
        "pharmacy_billed": pharmacy_billed,
        "pharmacy_paid": pharmacy_paid,
        "total_billed": total_billed,
        "total_paid": total_paid,
        "total_due": max(total_billed - total_paid, 0.0),
    }
    return {"patient": patient, "events": events, "summary": summary}


def create_invoice(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        paid_amount = float(data.get("paid_amount", 0) or 0)
        advance_amount = float(data.get("advance_amount", 0) or 0)
        refunded_amount = float(data.get("refunded_amount", 0) or 0)
        collected_amount = max(paid_amount + advance_amount - refunded_amount, 0.0)
        total_amount = float(data["total_amount"])
        due_amount = max(total_amount - collected_amount, 0.0)
        # cursor.lastrowid is unreliable under psycopg2, so use RETURNING id on Postgres.
        insert_sql = """
            INSERT INTO invoices (
                invoice_no, patient_id, module, doctor_name, clinic_name, referral_source,
                subtotal, tax, discount, total_amount, paid_amount, due_amount, payment_status, created_by,
                advance_amount, refunded_amount, hospital_id, appointment_id, encounter_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        insert_sql += " RETURNING id"
        cursor.execute(
            insert_sql,
            (
                data["invoice_no"],
                data.get("patient_id"),
                data["module"],
                data.get("doctor_name"),
                data.get("clinic_name"),
                data.get("referral_source"),
                data.get("subtotal", 0),
                data.get("tax", 0),
                data.get("discount", 0),
                total_amount,
                paid_amount,
                data.get("due_amount", due_amount),
                data.get("payment_status", "due"),
                data.get("created_by"),
                advance_amount,
                refunded_amount,
                scoped_hospital_id,
                data.get("appointment_id"),
                data.get("encounter_id"),
            ),
        )
        invoice_id = cursor.fetchone()[0]
        conn.commit()
        return invoice_id


def list_invoices(patient_id=None, module=None, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["deleted_at IS NULL"]
        params = []
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        if patient_id:
            clauses.append("patient_id = ?")
            params.append(patient_id)
        if module:
            clauses.append("module = ?")
            params.append(module)
        where_clause = f" WHERE {' AND '.join(clauses)}"
        cursor.execute(
            f"SELECT * FROM invoices{where_clause} ORDER BY created_at DESC",
            tuple(params),
        )
        return cursor.fetchall()


def get_invoice_by_id(invoice_id, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["id = ?", "deleted_at IS NULL"]
        params = [invoice_id]
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        cursor.execute(
            f"SELECT * FROM invoices WHERE {' AND '.join(clauses)}", tuple(params)
        )
        return cursor.fetchone()


def add_invoice_items(invoice_id, items):
    """Bulk-insert line items for one invoice. `items` is a list of dicts
    with description/category/cpt_code/quantity/unit_price/total/
    insurance_covered/patient_payable -- unset fields default sensibly."""
    with get_connection() as conn:
        cursor = conn.cursor()
        for item in items:
            cursor.execute(
                """
                INSERT INTO invoice_items (
                    invoice_id, description, category, cpt_code, quantity,
                    unit_price, total, insurance_covered, patient_payable
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    invoice_id,
                    item.get("description", ""),
                    item.get("category"),
                    item.get("cpt_code"),
                    item.get("quantity", 1),
                    item.get("unit_price", 0),
                    item.get("total", 0),
                    item.get("insurance_covered", 0),
                    item.get("patient_payable", 0),
                ),
            )
        conn.commit()
        cursor.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id", (invoice_id,)
        )
        return cursor.fetchall()


def list_invoice_items_for(invoice_ids):
    """Line items for many invoices in one query, grouped by invoice id."""
    ids = [int(i) for i in invoice_ids if i is not None]
    if not ids:
        return {}
    with get_connection() as conn:
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in ids)
        cursor.execute(
            f"SELECT * FROM invoice_items WHERE invoice_id IN ({placeholders}) ORDER BY invoice_id, id",
            tuple(ids),
        )
        grouped = {}
        for row in cursor.fetchall():
            grouped.setdefault(row["invoice_id"], []).append(dict(row))
        return grouped


def get_invoice_items(invoice_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id", (invoice_id,)
        )
        return cursor.fetchall()


def get_umr_ledger(patient_id, hospital_id=None):
    """One patient's whole real bill across every department that has
    invoiced them (OP/IP/ER/OT/LAB/PHARMACY) -- the consolidated view that
    billingDb.ts's dead getUmrLedger() was supposed to be, rebuilt against the
    real invoices/invoice_items tables instead of a local mock."""
    invoices = list_invoices(patient_id=patient_id, hospital_id=hospital_id)
    result = []
    total_amount = 0.0
    paid_amount = 0.0
    due_amount = 0.0
    for inv in invoices:
        inv_dict = dict(inv)
        inv_dict["items"] = [dict(item) for item in get_invoice_items(inv["id"])]
        result.append(inv_dict)
        total_amount += float(inv["total_amount"] or 0)
        paid_amount += float(inv["paid_amount"] or 0)
        due_amount += float(inv["due_amount"] or 0)
    return {
        "patient_id": patient_id,
        "invoices": result,
        "totals": {
            "total_amount": round(total_amount, 2),
            "paid_amount": round(paid_amount, 2),
            "due_amount": round(due_amount, 2),
            "invoice_count": len(result),
        },
    }


def update_invoice(invoice_id, data, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        # Same cross-tenant gap as record_invoice_payment/get_invoice_by_id --
        # without this, any authenticated user could edit another hospital's
        # invoice by guessing/incrementing its numeric id.
        clauses = ["id = ?"]
        params = [invoice_id]
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        cursor.execute(
            f"SELECT * FROM invoices WHERE {' AND '.join(clauses)}", tuple(params)
        )
        existing = cursor.fetchone()
        if not existing:
            return False

        total_amount = float(data.get("total_amount", existing["total_amount"] or 0))
        paid_amount = float(data.get("paid_amount", existing["paid_amount"] or 0))
        advance_amount = float(
            data.get("advance_amount", existing["advance_amount"] or 0)
        )
        refunded_amount = float(
            data.get("refunded_amount", existing["refunded_amount"] or 0)
        )
        collected_amount = max(paid_amount + advance_amount - refunded_amount, 0.0)
        due_amount = max(total_amount - collected_amount, 0.0)
        payment_status = data.get("payment_status")
        if not payment_status:
            if due_amount == 0:
                payment_status = "paid"
            elif paid_amount > 0:
                payment_status = "partial"
            else:
                payment_status = "due"

        module_name = str(data.get("module", existing["module"])).upper()

        cursor.execute(
            """
            UPDATE invoices
            SET patient_id = ?,
                module = ?,
                doctor_name = ?,
                clinic_name = ?,
                referral_source = ?,
                subtotal = ?,
                tax = ?,
                discount = ?,
                total_amount = ?,
                paid_amount = ?,
                due_amount = ?,
                payment_status = ?,
                advance_amount = ?,
                refunded_amount = ?
            WHERE id = ?
            """,
            (
                data.get("patient_id", existing["patient_id"]),
                module_name,
                data.get("doctor_name", existing["doctor_name"]),
                data.get("clinic_name", existing["clinic_name"]),
                data.get("referral_source", existing["referral_source"]),
                data.get("subtotal", existing["subtotal"]),
                data.get("tax", existing["tax"]),
                data.get("discount", existing["discount"]),
                total_amount,
                paid_amount,
                due_amount,
                payment_status,
                advance_amount,
                refunded_amount,
                invoice_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_invoice(invoice_id, actor=None, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        payment_clauses = ["invoice_id = ?", "deleted_at IS NULL"]
        payment_params = [invoice_id]
        if hospital_id:
            payment_clauses.append("hospital_id = ?")
            payment_params.append(hospital_id)
        cursor.execute(
            f"UPDATE invoice_payments SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ? "
            f"WHERE {' AND '.join(payment_clauses)}",
            (actor, *payment_params),
        )
        deleted = soft_delete_row(
            cursor, "invoices", "id", invoice_id, hospital_id=hospital_id, actor=actor
        )
        conn.commit()
        return deleted


def list_invoice_payments_for_patient(patient_id, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clause = "invoices.patient_id = ? AND invoice_payments.deleted_at IS NULL"
        params = [patient_id]
        if hospital_id:
            clause += " AND invoices.hospital_id = ?"
            params.append(hospital_id)
        cursor.execute(
            f"""
            SELECT invoice_payments.*, invoices.invoice_no AS invoice_no
            FROM invoice_payments
            JOIN invoices ON invoices.id = invoice_payments.invoice_id
            WHERE {clause}
            ORDER BY invoice_payments.created_at ASC
            """,
            tuple(params),
        )
        return cursor.fetchall()


def list_all_invoice_payments(hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT p.id, p.invoice_id, i.invoice_no, i.patient_id,
                   COALESCE(pt.name || ' ' || COALESCE(pt.last_name, ''), i.patient_id, 'Unknown') AS patient_name,
                   i.module AS payment_for, 
                   p.amount, p.payment_mode AS mode, p.created_at AS date, p.gateway_ref
            FROM invoice_payments p
            JOIN invoices i ON p.invoice_id = i.id
            LEFT JOIN patients pt ON pt.patient_id = i.patient_id
            WHERE p.deleted_at IS NULL
        """
        params = []
        if hospital_id:
            query += " AND p.hospital_id = ?"
            params.append(hospital_id)
        query += " ORDER BY p.created_at DESC"
        cursor.execute(query, tuple(params))
        return cursor.fetchall()


def record_invoice_payment(invoice_id, data, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        # FOR UPDATE locks this invoice row for the rest of the transaction --
        # without it, two concurrent payments both read the same starting
        # paid_amount, both compute "+amount" from it, and the second UPDATE
        # clobbers the first instead of the two summing (a real race, not
        # hypothetical: two staff recording payment on the same invoice near-
        # simultaneously, or a double-click before the first request returns).
        # Also now hospital-scoped -- previously any authenticated user could
        # record (and silently succeed) a payment against another hospital's
        # invoice by id alone.
        clauses = ["id = ?"]
        params = [invoice_id]
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        cursor.execute(
            f"SELECT total_amount, paid_amount, advance_amount, refunded_amount, hospital_id "
            f"FROM invoices WHERE {' AND '.join(clauses)} AND deleted_at IS NULL FOR UPDATE",
            tuple(params),
        )
        invoice = cursor.fetchone()
        if not invoice:
            return None

        try:
            amount = float(data["amount"])
        except (TypeError, ValueError):
            raise ValueError("amount must be a number")
        total_amount = float(invoice["total_amount"] or 0)
        advance_amount = float(invoice["advance_amount"] or 0)
        refunded_amount = float(invoice["refunded_amount"] or 0)
        # Checked here, under the row lock, so two concurrent payments cannot
        # together exceed the balance.
        outstanding = total_amount - max(
            float(invoice["paid_amount"] or 0) + advance_amount - refunded_amount, 0.0
        )
        if amount <= 0:
            raise ValueError("Payment amount must be greater than zero")
        if amount > outstanding + 0.005:
            raise ValueError(
                f"Payment of {amount:.2f} exceeds the outstanding balance of {max(outstanding, 0):.2f}"
            )
        paid_total = float(invoice["paid_amount"] or 0) + amount
        due_total = max(
            total_amount - max(paid_total + advance_amount - refunded_amount, 0.0), 0.0
        )
        if due_total == 0:
            status = "paid"
        elif paid_total > 0:
            status = "partial"
        else:
            status = "due"

        payment_insert_sql = """
            INSERT INTO invoice_payments (
                invoice_id, amount, payment_mode, gateway_ref, converted_from_mode, converted_to_mode, hospital_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """
        payment_insert_sql += " RETURNING id"
        cursor.execute(
            payment_insert_sql,
            (
                invoice_id,
                amount,
                data["payment_mode"],
                data.get("gateway_ref"),
                data.get("converted_from_mode"),
                data.get("converted_to_mode"),
                invoice["hospital_id"],
            ),
        )
        payment_id = cursor.fetchone()[0]
        cursor.execute(
            """
            UPDATE invoices
            SET paid_amount = ?, due_amount = ?, payment_status = ?
            WHERE id = ?
            """,
            (paid_total, due_total, status, invoice_id),
        )
        conn.commit()
        return payment_id


def create_insurance_claim(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO insurance_claims (
                invoice_id, patient_id, insurer_name, claim_amount, approved_amount,
                claim_status, external_ref, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["invoice_id"],
                data.get("patient_id"),
                data["insurer_name"],
                float(data["claim_amount"]),
                float(data.get("approved_amount", 0)),
                data.get("claim_status", "submitted"),
                data.get("external_ref"),
                data.get("notes"),
            ),
        )
        claim_id = cursor.lastrowid
        conn.commit()
        return claim_id


def get_insurance_claim(claim_id):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM insurance_claims WHERE id = ?", (claim_id,))
        return cursor.fetchone()


def list_insurance_claims(invoice_id=None, status=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["deleted_at IS NULL"]
        params = []
        if invoice_id:
            clauses.append("invoice_id = ?")
            params.append(invoice_id)
        if status:
            clauses.append("claim_status = ?")
            params.append(status)
        where_clause = f" WHERE {' AND '.join(clauses)}"
        cursor.execute(
            f"SELECT * FROM insurance_claims{where_clause} ORDER BY submitted_at DESC, id DESC",
            tuple(params),
        )
        return cursor.fetchall()


def update_insurance_claim(claim_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM insurance_claims WHERE id = ?", (claim_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE insurance_claims
            SET invoice_id = ?, patient_id = ?, insurer_name = ?, claim_amount = ?,
                approved_amount = ?, claim_status = ?, external_ref = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("invoice_id", existing["invoice_id"]),
                data.get("patient_id", existing["patient_id"]),
                data.get("insurer_name", existing["insurer_name"]),
                float(data.get("claim_amount", existing["claim_amount"] or 0)),
                float(data.get("approved_amount", existing["approved_amount"] or 0)),
                data.get("claim_status", existing["claim_status"]),
                data.get("external_ref", existing["external_ref"]),
                data.get("notes", existing["notes"]),
                claim_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_insurance_claim(claim_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "insurance_claims", "id", claim_id, actor=actor
        )
        conn.commit()
        return deleted


def get_revenue_summary(hospital_id=None):
    # Every invoices query below matches list_invoices()'s own convention of
    # excluding soft-deleted rows -- omitted here previously, so a deleted
    # invoice kept inflating these totals forever (it never gets excluded by
    # anything else, since nothing else in this function joins against a
    # "current" invoice list).
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(total_amount), 0) AS value FROM invoices WHERE hospital_id = ? AND deleted_at IS NULL",
            (scoped_hospital_id,),
        )
        total_billed = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(paid_amount + advance_amount - refunded_amount), 0) AS value FROM invoices WHERE hospital_id = ? AND deleted_at IS NULL",
            (scoped_hospital_id,),
        )
        total_collected = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(due_amount), 0) AS value FROM invoices WHERE hospital_id = ? AND deleted_at IS NULL",
            (scoped_hospital_id,),
        )
        total_due = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(advance_amount), 0) AS value FROM invoices WHERE hospital_id = ? AND deleted_at IS NULL",
            (scoped_hospital_id,),
        )
        total_advance = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(refunded_amount), 0) AS value FROM invoices WHERE hospital_id = ? AND deleted_at IS NULL",
            (scoped_hospital_id,),
        )
        total_refunded = cursor.fetchone()["value"]
        cursor.execute(
            """
            SELECT payment_mode AS label, COALESCE(SUM(amount), 0) AS count
            FROM invoice_payments
            WHERE hospital_id = ? AND deleted_at IS NULL
            GROUP BY payment_mode
            ORDER BY count DESC
            """,
            (scoped_hospital_id,),
        )
        by_mode = [dict(row) for row in cursor.fetchall()]
        cursor.execute(
            """
            SELECT module AS label, COALESCE(SUM(paid_amount + advance_amount - refunded_amount), 0) AS count
            FROM invoices
            WHERE hospital_id = ? AND deleted_at IS NULL
            GROUP BY module
            ORDER BY count DESC
            """,
            (scoped_hospital_id,),
        )
        by_module = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN due_amount > 0 AND CURRENT_TIMESTAMP - created_at < INTERVAL '31 days' THEN due_amount ELSE 0 END), 0) AS bucket_0_30,
                COALESCE(SUM(CASE WHEN due_amount > 0 AND CURRENT_TIMESTAMP - created_at >= INTERVAL '31 days' AND CURRENT_TIMESTAMP - created_at < INTERVAL '61 days' THEN due_amount ELSE 0 END), 0) AS bucket_31_60,
                COALESCE(SUM(CASE WHEN due_amount > 0 AND CURRENT_TIMESTAMP - created_at >= INTERVAL '61 days' AND CURRENT_TIMESTAMP - created_at < INTERVAL '91 days' THEN due_amount ELSE 0 END), 0) AS bucket_61_90,
                COALESCE(SUM(CASE WHEN due_amount > 0 AND CURRENT_TIMESTAMP - created_at >= INTERVAL '91 days' THEN due_amount ELSE 0 END), 0) AS bucket_91_plus
            FROM invoices
            WHERE hospital_id = ? AND deleted_at IS NULL
            """,
            (scoped_hospital_id,),
        )
        aging = dict(cursor.fetchone() or {})

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN gateway_ref IS NOT NULL AND TRIM(gateway_ref) <> '' THEN amount ELSE 0 END), 0) AS gateway_collected,
                COALESCE(SUM(CASE WHEN converted_from_mode IS NOT NULL AND TRIM(converted_from_mode) <> '' THEN amount ELSE 0 END), 0) AS converted_total
            FROM invoice_payments
            WHERE hospital_id = ?
            """,
            (scoped_hospital_id,),
        )
        reconciliation = dict(cursor.fetchone() or {})

        cursor.execute(
            """
            SELECT
                COALESCE(NULLIF(TRIM(converted_from_mode), ''), payment_mode) || ' -> ' ||
                COALESCE(NULLIF(TRIM(converted_to_mode), ''), payment_mode) AS label,
                COALESCE(SUM(amount), 0) AS count
            FROM invoice_payments
            WHERE hospital_id = ? AND converted_from_mode IS NOT NULL AND TRIM(converted_from_mode) <> ''
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        conversion_breakdown = [dict(row) for row in cursor.fetchall()]
    return {
        "total_billed": total_billed,
        "total_collected": total_collected,
        "total_due": total_due,
        "total_advance": total_advance,
        "total_refunded": total_refunded,
        "payment_mode_breakdown": by_mode,
        "collections_by_module": by_module,
        "aging_buckets": {
            "bucket_0_30": aging.get("bucket_0_30", 0),
            "bucket_31_60": aging.get("bucket_31_60", 0),
            "bucket_61_90": aging.get("bucket_61_90", 0),
            "bucket_91_plus": aging.get("bucket_91_plus", 0),
        },
        "reconciliation_summary": {
            "gateway_collected": reconciliation.get("gateway_collected", 0),
            "converted_total": reconciliation.get("converted_total", 0),
        },
        "conversion_breakdown": conversion_breakdown,
    }


def get_reports_overview(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    hospital_summary = get_hospital_dashboard_summary(hospital_id=scoped_hospital_id)
    billing_summary = get_revenue_summary(hospital_id=scoped_hospital_id)
    pharmacy_summary = get_pharmacy_summary(hospital_id=scoped_hospital_id)
    lab_summary = get_diagnostic_summary(hospital_id=scoped_hospital_id)
    employee_summary = get_employee_stats(hospital_id=scoped_hospital_id)
    accounts_summary = get_accounts_summary()

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(doctor_name), ''), 'Unassigned') AS label,
                   COALESCE(SUM(paid_amount + advance_amount - refunded_amount), 0) AS count
            FROM invoices
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        doctor_income = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(patient_id), ''), 'Unknown') AS label,
                   COALESCE(SUM(total_amount), 0) AS total_billed,
                   COALESCE(SUM(due_amount), 0) AS total_due
            FROM invoices
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY total_due DESC, total_billed DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        patient_financials = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(doctor_name), ''), 'Unassigned') AS label,
                   COALESCE(SUM(amount), 0) AS count
            FROM diagnostics
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        diagnostics_by_doctor = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(clinic_name), ''), 'General') AS label,
                   COALESCE(SUM(total_amount), 0) AS count
            FROM invoices
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        clinic_income = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(module), ''), 'UNKNOWN') AS label,
                   COALESCE(SUM(discount), 0) AS count
            FROM invoices
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        discount_by_module = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(NULLIF(TRIM(payment_status), ''), 'due') AS label,
                   COUNT(*) AS count
            FROM invoices
            WHERE hospital_id = ?
            GROUP BY label
            ORDER BY count DESC, label ASC
            """,
            (scoped_hospital_id,),
        )
        payment_status_breakdown = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT AVG(
                GREATEST(
                    EXTRACT(EPOCH FROM (COALESCE(discharge_date::timestamp, CURRENT_TIMESTAMP) - admission_date)) / 86400.0,
                    0
                )
            ) AS avg_los,
            COUNT(*) AS admission_count
            FROM admissions
            WHERE hospital_id = ?
            """,
            (scoped_hospital_id,),
        )
        alos_row = cursor.fetchone()
        average_los_days = round(float((alos_row or {"avg_los": 0})["avg_los"] or 0), 2)
        admission_count = int(
            (alos_row or {"admission_count": 0})["admission_count"] or 0
        )

        # Phase H Metrics
        cursor.execute("SELECT COUNT(*) AS total_beds FROM bed_master")
        total_beds = int((cursor.fetchone() or {"total_beds": 0})["total_beds"] or 0)
        cursor.execute(
            "SELECT COUNT(*) AS occupied_beds FROM bed_master WHERE status = 'Occupied'"
        )
        occupied_beds = int(
            (cursor.fetchone() or {"occupied_beds": 0})["occupied_beds"] or 0
        )
        bed_occupancy_rate = round(
            (occupied_beds / total_beds * 100) if total_beds > 0 else 0, 1
        )

        cursor.execute(
            "SELECT COUNT(*) AS icu_patients FROM icu_monitoring WHERE ventilator_active = TRUE"
        )
        icu_critical = int(
            (cursor.fetchone() or {"icu_patients": 0})["icu_patients"] or 0
        )

        cursor.execute(
            "SELECT COUNT(*) AS active_emergencies FROM emergency_triage WHERE status = 'Pending'"
        )
        active_emergencies = int(
            (cursor.fetchone() or {"active_emergencies": 0})["active_emergencies"] or 0
        )

        cursor.execute(
            "SELECT COUNT(*) AS active_ambulances FROM ambulance_dispatch WHERE status = 'En Route'"
        )
        active_ambulances = int(
            (cursor.fetchone() or {"active_ambulances": 0})["active_ambulances"] or 0
        )

    return {
        "hospital_summary": hospital_summary,
        "billing_summary": billing_summary,
        "pharmacy_summary": pharmacy_summary,
        "lab_summary": lab_summary,
        "employee_summary": employee_summary,
        "accounts_summary": accounts_summary,
        "doctor_income": doctor_income,
        "patient_financials": patient_financials,
        "diagnostics_by_doctor": diagnostics_by_doctor,
        "clinic_income": clinic_income,
        "discount_by_module": discount_by_module,
        "payment_status_breakdown": payment_status_breakdown,
        "alos_summary": {
            "average_los_days": average_los_days,
            "admission_count": admission_count,
        },
        "phase_h_summary": {
            "total_beds": total_beds,
            "occupied_beds": occupied_beds,
            "bed_occupancy_rate": bed_occupancy_rate,
            "icu_critical_patients": icu_critical,
            "active_emergencies": active_emergencies,
            "active_ambulances": active_ambulances,
        },
    }


def upsert_inventory_item(data, hospital_id=None):
    """hospital_id is required for correct multi-tenant isolation: without it,
    every hospital would share (and silently overwrite) the same medicine
    stock rows, since medicine_name alone isn't unique across hospitals."""
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        item_id = data.get("id")
        if item_id:
            cursor.execute(
                """
                UPDATE pharmacy_inventory
                SET medicine_name=?, batch_no=?, quantity=?, reorder_level=?, unit_price=?, expiry_date=?, stock_condition=?, updated_at=CURRENT_TIMESTAMP
                WHERE id=? AND hospital_id=?
                """,
                (
                    data["medicine_name"],
                    data.get("batch_no"),
                    data.get("quantity", 0),
                    data.get("reorder_level", 10),
                    data.get("unit_price", 0),
                    data.get("expiry_date"),
                    data.get("stock_condition", "proper"),
                    item_id,
                    scoped_hospital_id,
                ),
            )
            conn.commit()
            return item_id
        cursor.execute(
            """
            INSERT INTO pharmacy_inventory (
                hospital_id, medicine_name, batch_no, quantity, reorder_level, unit_price, expiry_date, stock_condition
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scoped_hospital_id,
                data["medicine_name"],
                data.get("batch_no"),
                data.get("quantity", 0),
                data.get("reorder_level", 10),
                data.get("unit_price", 0),
                data.get("expiry_date"),
                data.get("stock_condition", "proper"),
            ),
        )
        item_id = cursor.lastrowid
        conn.commit()
        return item_id


def list_inventory_items(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pharmacy_inventory WHERE hospital_id = ? AND deleted_at IS NULL ORDER BY medicine_name ASC",
            (scoped_hospital_id,),
        )
        return cursor.fetchall()


def delete_inventory_item(item_id, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor,
            "pharmacy_inventory",
            "id",
            item_id,
            hospital_id=scoped_hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


def create_pharmacy_supplier(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO pharmacy_suppliers (hospital_id, supplier_name, contact_person, phone, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                scoped_hospital_id,
                data["supplier_name"],
                data.get("contact_person"),
                data.get("phone"),
                data.get("status", "active"),
            ),
        )
        supplier_id = cursor.lastrowid
        conn.commit()
        return supplier_id


def list_pharmacy_suppliers(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pharmacy_suppliers WHERE hospital_id = ? AND deleted_at IS NULL ORDER BY supplier_name ASC",
            (scoped_hospital_id,),
        )
        return cursor.fetchall()


def update_pharmacy_supplier(supplier_id, data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pharmacy_suppliers WHERE id = ? AND hospital_id = ?",
            (supplier_id, scoped_hospital_id),
        )
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE pharmacy_suppliers
            SET supplier_name = ?, contact_person = ?, phone = ?, status = ?
            WHERE id = ?
            """,
            (
                data.get("supplier_name", existing["supplier_name"]),
                data.get("contact_person", existing["contact_person"]),
                data.get("phone", existing["phone"]),
                data.get("status", existing["status"]),
                supplier_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_pharmacy_supplier(supplier_id, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE pharmacy_purchases SET supplier_id = NULL WHERE supplier_id = ? AND hospital_id = ?",
            (supplier_id, scoped_hospital_id),
        )
        deleted = soft_delete_row(
            cursor,
            "pharmacy_suppliers",
            "id",
            supplier_id,
            hospital_id=scoped_hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


def _apply_purchase_inventory(cursor, hospital_id, medicine_name, quantity):
    cursor.execute(
        "SELECT id, quantity FROM pharmacy_inventory WHERE hospital_id = ? AND medicine_name = ? AND deleted_at IS NULL",
        (hospital_id, medicine_name),
    )
    existing_inventory = cursor.fetchone()
    if existing_inventory:
        cursor.execute(
            """
            UPDATE pharmacy_inventory
            SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (quantity, existing_inventory["id"]),
        )
    else:
        cursor.execute(
            """
            INSERT INTO pharmacy_inventory (
                hospital_id, medicine_name, quantity, reorder_level, unit_price, stock_condition
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (hospital_id, medicine_name, quantity, 10, 0, "proper"),
        )


def create_pharmacy_purchase(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        quantity = int(data["quantity"])
        unit_cost = float(data["unit_cost"])
        status = data.get("status", "ordered")
        stock_applied = 1 if status == "received" else 0
        cursor.execute(
            """
            INSERT INTO pharmacy_purchases (
                hospital_id, supplier_id, medicine_name, quantity, unit_cost, total_cost, status,
                expected_date, received_date, stock_applied
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scoped_hospital_id,
                data.get("supplier_id"),
                data["medicine_name"],
                quantity,
                unit_cost,
                quantity * unit_cost,
                status,
                data.get("expected_date"),
                data.get("received_date"),
                stock_applied,
            ),
        )
        purchase_id = cursor.lastrowid
        if stock_applied:
            _apply_purchase_inventory(
                cursor, scoped_hospital_id, data["medicine_name"], quantity
            )
        conn.commit()
        return purchase_id


def list_pharmacy_purchases(status=None, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        if status:
            cursor.execute(
                "SELECT * FROM pharmacy_purchases WHERE hospital_id = ? AND status = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC",
                (scoped_hospital_id, status),
            )
        else:
            cursor.execute(
                "SELECT * FROM pharmacy_purchases WHERE hospital_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC",
                (scoped_hospital_id,),
            )
        return cursor.fetchall()


def update_pharmacy_purchase(purchase_id, data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM pharmacy_purchases WHERE id = ? AND hospital_id = ?",
            (purchase_id, scoped_hospital_id),
        )
        existing = cursor.fetchone()
        if not existing:
            return False
        quantity = int(data.get("quantity", existing["quantity"] or 0))
        unit_cost = float(data.get("unit_cost", existing["unit_cost"] or 0))
        status = data.get("status", existing["status"])
        stock_applied = int(existing["stock_applied"] or 0)
        cursor.execute(
            """
            UPDATE pharmacy_purchases
            SET supplier_id = ?, medicine_name = ?, quantity = ?, unit_cost = ?, total_cost = ?,
                status = ?, expected_date = ?, received_date = ?, stock_applied = ?
            WHERE id = ?
            """,
            (
                data.get("supplier_id", existing["supplier_id"]),
                data.get("medicine_name", existing["medicine_name"]),
                quantity,
                unit_cost,
                quantity * unit_cost,
                status,
                data.get("expected_date", existing["expected_date"]),
                data.get("received_date", existing["received_date"]),
                stock_applied,
                purchase_id,
            ),
        )
        if status == "received" and not stock_applied:
            _apply_purchase_inventory(
                cursor,
                scoped_hospital_id,
                data.get("medicine_name", existing["medicine_name"]),
                quantity,
            )
            cursor.execute(
                "UPDATE pharmacy_purchases SET stock_applied = 1 WHERE id = ?",
                (purchase_id,),
            )
        conn.commit()
        return cursor.rowcount > 0


def delete_pharmacy_purchase(purchase_id, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor,
            "pharmacy_purchases",
            "id",
            purchase_id,
            hospital_id=scoped_hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


def create_pharmacy_sale(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        amount = float(data["quantity"]) * float(data["unit_price"])
        cursor.execute(
            """
            INSERT INTO pharmacy_sales (
                invoice_id, patient_id, prescription_ref, medicine_name, quantity, unit_price, amount, hospital_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("invoice_id"),
                data.get("patient_id"),
                data.get("prescription_ref"),
                data["medicine_name"],
                data["quantity"],
                data["unit_price"],
                amount,
                scoped_hospital_id,
            ),
        )
        sale_id = cursor.lastrowid
        cursor.execute(
            """
            UPDATE pharmacy_inventory
            SET quantity = CASE WHEN quantity >= ? THEN quantity - ? ELSE 0 END, updated_at=CURRENT_TIMESTAMP
            WHERE hospital_id = ? AND LOWER(medicine_name) = LOWER(?)
            """,
            (data["quantity"], data["quantity"], scoped_hospital_id, data["medicine_name"]),
        )
        conn.commit()
        return sale_id


def get_sellable_stock(hospital_id, medicine_name):
    """Units of a medicine that can be dispensed today: not deleted, not expired."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COALESCE(SUM(quantity), 0) AS qty FROM pharmacy_inventory
            WHERE hospital_id = ? AND LOWER(medicine_name) = LOWER(?) AND deleted_at IS NULL
              AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
            """,
            (hospital_id, medicine_name),
        )
        row = cursor.fetchone()
        return int(row["qty"] if row else 0)


def list_pharmacy_sales(
    medicine_name=None, invoice_id=None, patient_id=None, hospital_id=None
):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = []
        params = []
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        if medicine_name:
            clauses.append("medicine_name = ?")
            params.append(medicine_name)
        if invoice_id:
            clauses.append("invoice_id = ?")
            params.append(invoice_id)
        if patient_id:
            clauses.append("patient_id = ?")
            params.append(patient_id)
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"""
            SELECT s.*, p.name as patient_name 
            FROM pharmacy_sales s 
            LEFT JOIN patients p ON s.patient_id = p.patient_id 
            {where_clause.replace("hospital_id", "s.hospital_id").replace("medicine_name", "s.medicine_name").replace("invoice_id", "s.invoice_id").replace("patient_id", "s.patient_id")} 
            ORDER BY s.sold_at DESC
            """,
            tuple(params),
        )
        return cursor.fetchall()


def get_pharmacy_summary(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*) AS value
            FROM pharmacy_inventory
            WHERE hospital_id = ? AND deleted_at IS NULL AND quantity <= reorder_level
            """,
            (scoped_hospital_id,),
        )
        low_stock = cursor.fetchone()["value"]
        cursor.execute(
            """
            SELECT COUNT(*) AS value
            FROM pharmacy_inventory
            WHERE hospital_id = ? AND deleted_at IS NULL AND quantity = 0
            """,
            (scoped_hospital_id,),
        )
        out_of_stock = cursor.fetchone()["value"]
        cursor.execute(
            """
            SELECT COUNT(*) AS value
            FROM pharmacy_inventory
            WHERE hospital_id = ? AND deleted_at IS NULL AND stock_condition = 'damaged'
            """,
            (scoped_hospital_id,),
        )
        damaged = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS value FROM pharmacy_sales WHERE hospital_id = ?",
            (scoped_hospital_id,),
        )
        sales_total = cursor.fetchone()["value"]
    return {
        "low_stock_count": low_stock,
        "out_of_stock_count": out_of_stock,
        "damaged_stock_count": damaged,
        "sales_total": sales_total,
    }


def create_lab_vendor(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO lab_vendors (vendor_name, contact_person, phone, status)
            VALUES (?, ?, ?, ?)
            """,
            (
                data["vendor_name"],
                data.get("contact_person"),
                data.get("phone"),
                data.get("status", "active"),
            ),
        )
        vendor_id = cursor.lastrowid
        conn.commit()
        return vendor_id


def list_lab_vendors():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM lab_vendors WHERE deleted_at IS NULL ORDER BY vendor_name ASC"
        )
        return cursor.fetchall()


def update_lab_vendor(vendor_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM lab_vendors WHERE id = ?", (vendor_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE lab_vendors
            SET vendor_name = ?, contact_person = ?, phone = ?, status = ?
            WHERE id = ?
            """,
            (
                data.get("vendor_name", existing["vendor_name"]),
                data.get("contact_person", existing["contact_person"]),
                data.get("phone", existing["phone"]),
                data.get("status", existing["status"]),
                vendor_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_lab_vendor(vendor_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE diagnostics SET vendor_id = NULL WHERE vendor_id = ?", (vendor_id,)
        )
        deleted = soft_delete_row(cursor, "lab_vendors", "id", vendor_id, actor=actor)
        conn.commit()
        return deleted


def create_diagnostic_record(data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        paid_amount = float(data.get("paid_amount", 0))
        total_amount = float(data["amount"])
        due_amount = max(total_amount - paid_amount, 0.0)
        status = (
            "paid" if due_amount == 0 else ("partial" if paid_amount > 0 else "due")
        )
        cursor.execute(
            """
            INSERT INTO diagnostics (
                invoice_no, patient_id, vendor_id, doctor_name, test_name, amount, paid_amount, due_amount, status,
                sample_barcode, order_status, collected_at, reported_at, hospital_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("invoice_no"),
                data.get("patient_id"),
                data.get("vendor_id"),
                data.get("doctor_name"),
                data["test_name"],
                total_amount,
                paid_amount,
                due_amount,
                status,
                data.get("sample_barcode"),
                data.get("order_status", "ordered"),
                data.get("collected_at"),
                data.get("reported_at"),
                scoped_hospital_id,
            ),
        )
        diagnostic_id = cursor.lastrowid
        conn.commit()
        return diagnostic_id


def list_diagnostics(patient_id=None, doctor_name=None, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        clauses = ["deleted_at IS NULL"]
        params = []
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        if patient_id:
            clauses.append("patient_id = ?")
            params.append(patient_id)
        if doctor_name:
            clauses.append("doctor_name = ?")
            params.append(doctor_name)
        where_clause = f" WHERE {' AND '.join(clauses)}"
        cursor.execute(
            f"SELECT * FROM diagnostics{where_clause} ORDER BY created_at DESC",
            tuple(params),
        )
        return cursor.fetchall()


def update_diagnostic_record(diagnostic_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM diagnostics WHERE id = ?", (diagnostic_id,))
        existing = cursor.fetchone()
        if not existing:
            return False

        total_amount = float(data.get("amount", existing["amount"] or 0))
        paid_amount = float(data.get("paid_amount", existing["paid_amount"] or 0))
        due_amount = max(total_amount - paid_amount, 0.0)
        status = data.get("status")
        if not status:
            status = (
                "paid" if due_amount == 0 else ("partial" if paid_amount > 0 else "due")
            )

        cursor.execute(
            """
            UPDATE diagnostics
            SET invoice_no = ?,
                patient_id = ?,
                vendor_id = ?,
                doctor_name = ?,
                test_name = ?,
                amount = ?,
                paid_amount = ?,
                due_amount = ?,
                status = ?,
                sample_barcode = ?,
                order_status = ?,
                collected_at = ?,
                reported_at = ?
            WHERE id = ?
            """,
            (
                data.get("invoice_no", existing["invoice_no"]),
                data.get("patient_id", existing["patient_id"]),
                data.get("vendor_id", existing["vendor_id"]),
                data.get("doctor_name", existing["doctor_name"]),
                data.get("test_name", existing["test_name"]),
                total_amount,
                paid_amount,
                due_amount,
                status,
                data.get("sample_barcode", existing["sample_barcode"]),
                data.get("order_status", existing["order_status"]),
                data.get("collected_at", existing["collected_at"]),
                data.get("reported_at", existing["reported_at"]),
                diagnostic_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_diagnostic_record(diagnostic_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "diagnostics", "id", diagnostic_id, actor=actor
        )
        conn.commit()
        return deleted


def get_diagnostic_summary(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS value FROM diagnostics WHERE hospital_id = ?",
            (scoped_hospital_id,),
        )
        total_amount = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(paid_amount), 0) AS value FROM diagnostics WHERE hospital_id = ?",
            (scoped_hospital_id,),
        )
        total_paid = cursor.fetchone()["value"]
        cursor.execute(
            "SELECT COALESCE(SUM(due_amount), 0) AS value FROM diagnostics WHERE hospital_id = ?",
            (scoped_hospital_id,),
        )
        total_due = cursor.fetchone()["value"]
    return {
        "total_amount": total_amount,
        "total_paid": total_paid,
        "total_due": total_due,
    }


def create_department(data, hospital_id=None):
    scoped_hospital_id = hospital_id or data.get("hospital_id") or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO department_master (hospital_id, department_name, mapped_head_employee_id)
            VALUES (?, ?, ?)
            """,
            (
                scoped_hospital_id,
                data["department_name"],
                data.get("mapped_head_employee_id"),
            ),
        )
        department_id = cursor.lastrowid
        conn.commit()
        return department_id


def list_departments(hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        # Plain UNION only dedupes when every selected column matches, but the
        # department_master branch carries a real id/created_at while the
        # doctor-derived branch has NULL for both -- so a department that
        # exists in both (the common case once department_master and doctor
        # profiles are kept in sync) survived as two "duplicate" rows. Group
        # by name so a hospital's own configured departments and any
        # department only implied by a doctor's profile are still merged
        # into one list, picking a representative id/created_at per name.
        cursor.execute(
            """
            SELECT MIN(id) as id, department_name, MIN(created_at) as created_at, hospital_id
            FROM (
                SELECT id, department_name, created_at, hospital_id
                FROM department_master
                WHERE hospital_id = ?
                UNION ALL
                SELECT NULL as id, department as department_name, NULL as created_at, hospital_id
                FROM users
                WHERE hospital_id = ? AND department IS NOT NULL AND department != '' AND status = 'active' AND LOWER(job_role) = 'doctor'
            ) AS combined
            GROUP BY department_name, hospital_id
            ORDER BY department_name ASC
            """,
            (scoped_hospital_id, scoped_hospital_id),
        )
        return cursor.fetchall()


def update_department(department_id, data, hospital_id=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM department_master WHERE id = ? AND hospital_id = ?",
            (department_id, scoped_hospital_id),
        )
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE department_master
            SET department_name = ?, mapped_head_employee_id = ?
            WHERE id = ? AND hospital_id = ?
            """,
            (
                data.get("department_name", existing["department_name"]),
                data.get(
                    "mapped_head_employee_id", existing["mapped_head_employee_id"]
                ),
                department_id,
                scoped_hospital_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_department(department_id, hospital_id=None, actor=None):
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor,
            "department_master",
            "id",
            department_id,
            hospital_id=scoped_hospital_id,
            actor=actor,
        )
        conn.commit()
        return deleted


def create_attendance(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO attendance (employee_id, attendance_date, status, in_time, out_time, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["employee_id"],
                data["attendance_date"],
                data["status"],
                data.get("in_time"),
                data.get("out_time"),
                data.get("notes"),
            ),
        )
        attendance_id = cursor.lastrowid
        conn.commit()
        return attendance_id


def list_attendance(employee_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if employee_id:
            cursor.execute(
                "SELECT * FROM attendance WHERE employee_id = ? AND deleted_at IS NULL ORDER BY attendance_date DESC",
                (employee_id,),
            )
        else:
            cursor.execute(
                "SELECT * FROM attendance WHERE deleted_at IS NULL ORDER BY attendance_date DESC"
            )
        return cursor.fetchall()


def update_attendance_record(attendance_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM attendance WHERE id = ?", (attendance_id,))
        existing = cursor.fetchone()
        if not existing:
            return False
        cursor.execute(
            """
            UPDATE attendance
            SET employee_id = ?, attendance_date = ?, status = ?, in_time = ?, out_time = ?, notes = ?
            WHERE id = ?
            """,
            (
                data.get("employee_id", existing["employee_id"]),
                data.get("attendance_date", existing["attendance_date"]),
                data.get("status", existing["status"]),
                data.get("in_time", existing["in_time"]),
                data.get("out_time", existing["out_time"]),
                data.get("notes", existing["notes"]),
                attendance_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_attendance_record(attendance_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(
            cursor, "attendance", "id", attendance_id, actor=actor
        )
        conn.commit()
        return deleted


def create_payroll_record(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        net_salary = (
            float(data["basic_salary"])
            + float(data.get("allowances", 0))
            - float(data.get("deductions", 0))
        )
        cursor.execute(
            """
            INSERT INTO payroll (
                employee_id, payroll_month, basic_salary, allowances, deductions, net_salary, paid_status, paid_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["employee_id"],
                data["payroll_month"],
                data["basic_salary"],
                data.get("allowances", 0),
                data.get("deductions", 0),
                net_salary,
                data.get("paid_status", "pending"),
                data.get("paid_date"),
            ),
        )
        payroll_id = cursor.lastrowid
        conn.commit()
        return payroll_id


def list_payroll(employee_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if employee_id:
            cursor.execute(
                "SELECT * FROM payroll WHERE employee_id = ? AND deleted_at IS NULL ORDER BY payroll_month DESC",
                (employee_id,),
            )
        else:
            cursor.execute(
                "SELECT * FROM payroll WHERE deleted_at IS NULL ORDER BY payroll_month DESC"
            )
        return cursor.fetchall()


def update_payroll_record(payroll_id, data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payroll WHERE id = ?", (payroll_id,))
        existing = cursor.fetchone()
        if not existing:
            return False

        basic_salary = float(data.get("basic_salary", existing["basic_salary"] or 0))
        allowances = float(data.get("allowances", existing["allowances"] or 0))
        deductions = float(data.get("deductions", existing["deductions"] or 0))
        net_salary = basic_salary + allowances - deductions

        cursor.execute(
            """
            UPDATE payroll
            SET employee_id = ?, payroll_month = ?, basic_salary = ?, allowances = ?, deductions = ?, net_salary = ?, paid_status = ?, paid_date = ?
            WHERE id = ?
            """,
            (
                data.get("employee_id", existing["employee_id"]),
                data.get("payroll_month", existing["payroll_month"]),
                basic_salary,
                allowances,
                deductions,
                net_salary,
                data.get("paid_status", existing["paid_status"]),
                data.get("paid_date", existing["paid_date"]),
                payroll_id,
            ),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_payroll_record(payroll_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(cursor, "payroll", "id", payroll_id, actor=actor)
        conn.commit()
        return deleted


def create_leave_request(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO leave_requests (
                employee_id, leave_type, start_date, end_date, reason, status, decided_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["employee_id"],
                data["leave_type"],
                data["start_date"],
                data["end_date"],
                data.get("reason"),
                data.get("status", "pending"),
                data.get("decided_by"),
            ),
        )
        leave_id = cursor.lastrowid
        conn.commit()
        return leave_id


def update_leave_status(leave_id, status, decided_by=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE leave_requests SET status=?, decided_by=? WHERE id=?",
            (status, decided_by, leave_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def list_leave_requests(employee_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        if employee_id:
            cursor.execute(
                "SELECT * FROM leave_requests WHERE employee_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
                (employee_id,),
            )
        else:
            cursor.execute(
                "SELECT * FROM leave_requests WHERE deleted_at IS NULL ORDER BY created_at DESC"
            )
        return cursor.fetchall()


def delete_leave_request(leave_id, actor=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        deleted = soft_delete_row(cursor, "leave_requests", "id", leave_id, actor=actor)
        conn.commit()
        return deleted


def add_audit_log(data):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO audit_logs (
                actor_username, action, module_name, entity_key, payload, ip_address, hospital_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("actor_username"),
                data["action"],
                data["module_name"],
                data.get("entity_key"),
                data.get("payload"),
                data.get("ip_address"),
                data.get("hospital_id"),
            ),
        )
        log_id = cursor.lastrowid
        conn.commit()
        return log_id


def get_audit_logs(module_name=None, limit=100, offset=0, hospital_id=None):
    with get_connection() as conn:
        cursor = conn.cursor()
        safe_limit = max(1, min(int(limit), 1000))
        safe_offset = max(0, int(offset))
        clauses = []
        params = []
        if module_name:
            clauses.append("module_name = ?")
            params.append(module_name)
        if hospital_id:
            clauses.append("hospital_id = ?")
            params.append(hospital_id)
        where_clause = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        cursor.execute(
            f"""
            SELECT * FROM audit_logs{where_clause}
            ORDER BY created_at DESC
            LIMIT {safe_limit} OFFSET {safe_offset}
            """,
            tuple(params),
        )
        rows = cursor.fetchall()
        cursor.execute(
            f"SELECT COUNT(*) FROM audit_logs{where_clause}", tuple(params)
        )
        total = cursor.fetchone()[0]
        return rows, total


def get_hospital_dashboard_summary(hospital_id=None):
    # strftime()/DATE('now') are SQLite-only; Postgres has no such functions. Compute the
    # "today" and "this month" boundaries in Python instead so the comparisons are portable
    # range/equality checks against plain ISO date strings on both engines.
    scoped_hospital_id = hospital_id or resolve_hospital_id()
    today = current_ist_datetime().date()
    month_start = today.replace(day=1)
    if month_start.month == 12:
        next_month_start = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month_start = month_start.replace(month=month_start.month + 1)
    today_str = today.isoformat()
    month_start_str = month_start.isoformat()
    next_month_start_str = next_month_start.isoformat()

    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT
                SUM(CASE WHEN encounter_type='IP' AND DATE(arrival_at)=? THEN 1 ELSE 0 END) AS daily_ip,
                SUM(CASE WHEN encounter_type='OP' AND DATE(arrival_at)=? THEN 1 ELSE 0 END) AS daily_op,
                SUM(CASE WHEN encounter_type='IP' THEN 1 ELSE 0 END) AS monthly_ip,
                SUM(CASE WHEN encounter_type='OP' THEN 1 ELSE 0 END) AS monthly_op,
                SUM(CASE WHEN is_accident=1 AND DATE(arrival_at)=? THEN 1 ELSE 0 END) AS daily_accident,
                SUM(CASE WHEN is_accident=1 THEN 1 ELSE 0 END) AS monthly_accident
            FROM encounters
            WHERE hospital_id = ? AND arrival_at >= ? AND arrival_at < ?
            """,
            (
                today_str,
                today_str,
                today_str,
                scoped_hospital_id,
                month_start_str,
                next_month_start_str,
            ),
        )
        encounter_summary = dict(cursor.fetchone() or {})

        cursor.execute(
            """
            SELECT
                COALESCE(SUM(total_amount), 0) AS total_revenue,
                COALESCE(SUM(due_amount), 0) AS due_collection
            FROM invoices
            WHERE hospital_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
            """,
            (scoped_hospital_id, month_start_str, next_month_start_str),
        )
        revenue_summary = dict(cursor.fetchone() or {})

        cursor.execute(
            """
            SELECT payment_mode AS label, COALESCE(SUM(amount), 0) AS count
            FROM invoice_payments
            WHERE hospital_id = ? AND created_at >= ? AND created_at < ?
            GROUP BY payment_mode
            ORDER BY count DESC
            """,
            (scoped_hospital_id, month_start_str, next_month_start_str),
        )
        payment_mode_breakdown = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS diagnostics_income
            FROM diagnostics
            WHERE hospital_id = ? AND created_at >= ? AND created_at < ?
            """,
            (scoped_hospital_id, month_start_str, next_month_start_str),
        )
        diagnostics_income_row = cursor.fetchone()
        diagnostics_income = (
            diagnostics_income_row["diagnostics_income"]
            if diagnostics_income_row
            else 0
        )

        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS pharmacy_sales
            FROM pharmacy_sales
            WHERE hospital_id = ? AND sold_at >= ? AND sold_at < ?
            """,
            (scoped_hospital_id, month_start_str, next_month_start_str),
        )
        pharmacy_sales_row = cursor.fetchone()
        pharmacy_sales = (
            pharmacy_sales_row["pharmacy_sales"] if pharmacy_sales_row else 0
        )

        cursor.execute(
            """
            SELECT COALESCE(referral_source, 'unknown') AS label, COUNT(*) AS count
            FROM encounters
            WHERE hospital_id = ? AND arrival_at >= ? AND arrival_at < ?
            GROUP BY referral_source
            ORDER BY count DESC
            """,
            (scoped_hospital_id, month_start_str, next_month_start_str),
        )
        referral_summary = [dict(row) for row in cursor.fetchall()]

        cursor.execute(
            """
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'Available' THEN 1 ELSE 0 END) AS available,
                SUM(CASE WHEN status = 'Occupied' THEN 1 ELSE 0 END) AS occupied,
                SUM(CASE WHEN status = 'Maintenance' THEN 1 ELSE 0 END) AS maintenance
            FROM bed_master
            WHERE hospital_id = ?
            """,
            (scoped_hospital_id,),
        )
        bed_row = dict(cursor.fetchone() or {})

        cursor.execute(
            """
            SELECT COALESCE(SUM(total_amount), 0) AS ip_revenue
            FROM invoices
            WHERE hospital_id = ? AND module = 'IP' AND deleted_at IS NULL
              AND created_at >= ? AND created_at < ?
            """,
            (scoped_hospital_id, month_start_str, next_month_start_str),
        )
        ip_revenue_row = cursor.fetchone()
        ip_revenue = (ip_revenue_row["ip_revenue"] if ip_revenue_row else 0) or 0

    bed_total = bed_row.get("total", 0) or 0
    bed_occupied = bed_row.get("occupied", 0) or 0

    return {
        "ip_op_counts": {
            "daily_ip": encounter_summary.get("daily_ip", 0) or 0,
            "daily_op": encounter_summary.get("daily_op", 0) or 0,
            "monthly_ip": encounter_summary.get("monthly_ip", 0) or 0,
            "monthly_op": encounter_summary.get("monthly_op", 0) or 0,
        },
        "accidents": {
            "daily": encounter_summary.get("daily_accident", 0) or 0,
            "monthly": encounter_summary.get("monthly_accident", 0) or 0,
        },
        "revenue": {
            "total": revenue_summary.get("total_revenue", 0) or 0,
            "due": revenue_summary.get("due_collection", 0) or 0,
            "payment_mode_breakdown": payment_mode_breakdown,
            "ip_this_month": ip_revenue,
        },
        "pharmacy_summary": {"monthly_sales": pharmacy_sales},
        "diagnostics_summary": {"monthly_income": diagnostics_income},
        "referrals": referral_summary,
        "bed_occupancy": {
            "total": bed_total,
            "available": bed_row.get("available", 0) or 0,
            "occupied": bed_occupied,
            "maintenance": bed_row.get("maintenance", 0) or 0,
            "occupancy_rate": round((bed_occupied / bed_total) * 100) if bed_total else 0,
        },
    }


# ---- Pharmacy Prescriptions (OCR Integration) ----


def ensure_pharmacy_prescriptions_tables(conn):
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pharmacy_prescriptions (
            id SERIAL PRIMARY KEY,
            hospital_id INTEGER NOT NULL,
            patient_id TEXT NOT NULL,
            doctor_username TEXT NOT NULL,
            doc_id INTEGER,
            medicines_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            fulfilled_at TIMESTAMP,
            FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
        )
        """)
    conn.commit()


def parse_pharmacy_prescriptions(raw_prescriptions):
    """Each pharmacy_prescriptions row stores its medicines as an opaque JSON
    blob (medicines_json: [{name, dosage, quantity, unit_price?}, ...]) rather
    than flat columns. Flatten to one row per medicine, keyed off the fields
    actually captured at creation time (PrescriptionUploadModal.tsx) -- there
    is no frequency/instructions field anywhere in this data model, so we
    don't fabricate one. Shared by the EMR Medications tab and the patient
    journey timeline so both flatten prescriptions the same way."""
    flattened = []
    for presc in raw_prescriptions:
        try:
            medicines = json.loads(presc.get("medicines_json") or "[]")
        except (TypeError, ValueError):
            medicines = []
        if not isinstance(medicines, list):
            medicines = []
        for med in medicines:
            if not isinstance(med, dict):
                continue
            flattened.append(
                {
                    "prescription_id": presc.get("id"),
                    "medicine_name": med.get("name") or med.get("medicine_name") or "—",
                    "dosage": med.get("dosage"),
                    "quantity": med.get("quantity"),
                    "unit_price": med.get("unit_price"),
                    "status": presc.get("status"),
                    "doctor_username": presc.get("doctor_username"),
                    "created_at": presc.get("created_at"),
                    "fulfilled_at": presc.get("fulfilled_at"),
                }
            )
    return flattened


def create_pharmacy_prescription(
    hospital_id, patient_id, doctor_username, medicines_json, doc_id=None
):
    from utils.database import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO pharmacy_prescriptions (hospital_id, patient_id, doctor_username, doc_id, medicines_json)
            VALUES (?, ?, ?, ?, ?)
            RETURNING id
            """,
            (hospital_id, patient_id, doctor_username, doc_id, medicines_json),
        )
        pid = cursor.fetchone()[0]
        conn.commit()
        return pid


def list_pending_pharmacy_prescriptions(hospital_id):
    from utils.database import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT p.*, pat.name as patient_name, pat.last_name as patient_last_name 
            FROM pharmacy_prescriptions p
            JOIN patients pat ON pat.patient_id = p.patient_id
            WHERE p.hospital_id = ? AND p.status = 'pending'
            ORDER BY p.created_at DESC
            """,
            (hospital_id,),
        )
        return cursor.fetchall()


def get_pharmacy_prescription(hospital_id, prescription_id):
    from utils.database import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT * FROM pharmacy_prescriptions
            WHERE id = ? AND hospital_id = ?
            """,
            (prescription_id, hospital_id),
        )
        return cursor.fetchone()


def fulfill_pharmacy_prescription(hospital_id, prescription_id):
    from utils.database import get_connection

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE pharmacy_prescriptions
            SET status = 'fulfilled', fulfilled_at = CURRENT_TIMESTAMP
            WHERE id = ? AND hospital_id = ?
            """,
            (prescription_id, hospital_id),
        )
        conn.commit()


def ensure_emr_tables(conn):
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS medical_history (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            allergies TEXT,
            existing_diseases TEXT,
            chronic_conditions TEXT,
            previous_surgeries TEXT,
            family_history TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clinical_notes (
            id SERIAL PRIMARY KEY,
            encounter_id INTEGER,
            patient_id TEXT NOT NULL,
            chief_complaint TEXT,
            notes TEXT,
            follow_up TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
            FOREIGN KEY (encounter_id) REFERENCES encounters(id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patient_vitals (
            id SERIAL PRIMARY KEY,
            encounter_id INTEGER,
            patient_id TEXT NOT NULL,
            bp TEXT,
            pulse TEXT,
            temperature TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
            FOREIGN KEY (encounter_id) REFERENCES encounters(id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS diagnosis_records (
            id SERIAL PRIMARY KEY,
            encounter_id INTEGER,
            patient_id TEXT NOT NULL,
            diagnosis_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
            FOREIGN KEY (encounter_id) REFERENCES encounters(id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS emr_access_logs (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            doctor_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
            FOREIGN KEY (doctor_id) REFERENCES users(id)
        )
        """)
    conn.commit()


# ICU flowsheet -- the real, nurse/doctor-entered counterpart to what the old
# ICU page used to show as hardcoded numbers (ventilator settings, active
# infusions, intake/output, RASS sedation score, critical labs, consults).
# Each table is patient_id-scoped the same way patient_vitals/diagnosis_records
# are -- no hospital_id column needed since every read/write already goes
# through a patient_id whose ownership was checked further up the call chain.
def ensure_icu_tables(conn):
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_ventilator_settings (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            mode TEXT,
            fio2 TEXT,
            peep TEXT,
            tidal_volume TEXT,
            resp_rate TEXT,
            pip TEXT,
            recorded_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_infusions (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            medication_name TEXT NOT NULL,
            rate TEXT,
            unit TEXT,
            status TEXT DEFAULT 'active',
            recorded_by TEXT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            stopped_at TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_io_records (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            intake_ml NUMERIC,
            output_ml NUMERIC,
            notes TEXT,
            recorded_by TEXT,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_rass_scores (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            score INTEGER NOT NULL,
            recorded_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_lab_results (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            test_name TEXT NOT NULL,
            value TEXT,
            unit TEXT,
            flag TEXT,
            recorded_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_consults (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            specialty TEXT NOT NULL,
            consultant_name TEXT,
            status TEXT DEFAULT 'requested',
            notes TEXT,
            requested_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    # One row per patient per chart day -- the ICU daily flowsheet (the paper
    # chart the nurse fills in). The whole chart is stored as a JSON document
    # because its shape is driven by flowsheetSchema.ts on the frontend and
    # changes with the form, not with the database.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS icu_flowsheets (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            chart_date DATE NOT NULL,
            data TEXT NOT NULL,
            entry_count INTEGER DEFAULT 0,
            updated_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (patient_id, chart_date),
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    conn.commit()


def ensure_clinical_tables(conn):
    """Clinical → Orders and Care Plan: physician orders that have no other
    home in this schema (radiology, nursing, dietary, referral -- lab and
    pharmacy already have their own dedicated order flows elsewhere), and one
    structured, editable-over-time care plan per patient."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS clinical_orders (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL,
            admission_id INTEGER,
            order_type TEXT NOT NULL,
            description TEXT NOT NULL,
            priority TEXT DEFAULT 'routine',
            status TEXT DEFAULT 'ordered',
            notes TEXT,
            ordered_by TEXT,
            ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    # One active plan per patient (UNIQUE patient_id) -- edited over time via
    # upsert-in-place, same trade-off icu_flowsheets makes; problems is a JSON
    # list because a problem/goal entry's shape belongs to the frontend form,
    # not the database.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS care_plans (
            id SERIAL PRIMARY KEY,
            patient_id TEXT NOT NULL UNIQUE,
            admission_id INTEGER,
            status TEXT DEFAULT 'active',
            problems TEXT NOT NULL DEFAULT '[]',
            narrative TEXT,
            updated_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    conn.commit()


def ensure_ot_tables(conn):
    """One row per surgical case. Core columns support list/filter queries
    across the OR room board, PAC queue, and PACU queue; the full 14-page
    digital booklet (PAC, WHO checklist, anaesthesia/operation record,
    Aldrete recovery) is stored whole as JSON because its shape is owned by
    the frontend schema (src/services/surgeryDb.ts), not the database --
    same trade-off as icu_flowsheets.data.

    The pre-existing ot_surgeries/ot_theatres tables are a separate, unrelated,
    never-routed stub with an incompatible status enum -- left alone here,
    not reused."""
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ot_cases (
            id SERIAL PRIMARY KEY,
            case_no TEXT UNIQUE NOT NULL,
            patient_id TEXT NOT NULL,
            or_room TEXT,
            procedure_name TEXT NOT NULL,
            surgeon TEXT,
            total_amount NUMERIC DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'PAC Pending' CHECK (status IN (
                'PAC Pending', 'PAC Cleared', 'Pre-Op Holding', 'In Surgery',
                'PACU Recovery', 'Completed', 'Cancelled'
            )),
            booklet TEXT NOT NULL DEFAULT '{}',
            billed_at TIMESTAMP,
            invoice_id INTEGER,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
        )
        """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ot_cases_patient ON ot_cases(patient_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_ot_cases_status ON ot_cases(status)")
    conn.commit()
