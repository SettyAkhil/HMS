"""General-ledger schema: tables, and the invariants Postgres enforces itself.

Accounting rules that matter are enforced by the database, not by convention in
the service layer, so no code path (a bug, a one-off script, a future endpoint)
can produce books that do not balance:

* Every journal balances -- a DEFERRED constraint trigger checks sum(debit) =
  sum(credit) > 0 per journal at COMMIT, so lines can be inserted one by one
  inside the posting transaction but an unbalanced journal can never commit.
* Posted lines are immutable -- UPDATE / DELETE on gl_journal_lines raises.
  A mistake is corrected by a reversing journal, never by editing history.
* A journal can only change status posted -> reversed (and record what reversed
  it); it can never be deleted.
* A journal can only be inserted into an OPEN period.

Balances are never stored. Every figure (account balance, trial balance, P&L,
balance sheet, ageing) is derived from gl_journal_lines, so a report cannot
disagree with the journals behind it.

Called from utils.database.init_database(), which only auth-service runs.
"""

GL_DDL = [
    # ── Calendar ────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_fiscal_years (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        code TEXT NOT NULL,                       -- "2026-27"
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        closed_at TIMESTAMP,
        closed_by TEXT,
        closing_journal_id BIGINT,
        UNIQUE (hospital_id, code),
        CHECK (end_date > start_date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS gl_periods (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        fiscal_year_id BIGINT NOT NULL REFERENCES gl_fiscal_years(id),
        period_no SMALLINT NOT NULL CHECK (period_no BETWEEN 1 AND 12),
        name TEXT NOT NULL,                       -- "Oct 2026"
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        closed_at TIMESTAMP,
        closed_by TEXT,
        UNIQUE (fiscal_year_id, period_no)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_gl_periods_lookup ON gl_periods (hospital_id, start_date, end_date)",
    # ── Masters ─────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_accounts (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('asset', 'liability', 'equity', 'income', 'expense')),
        normal_balance TEXT NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
        parent_id BIGINT REFERENCES gl_accounts(id),
        is_group BOOLEAN NOT NULL DEFAULT FALSE,   -- headings carry no postings
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        -- Stable handle posting rules use ("AR_PATIENT"), so a hospital can renumber
        -- or rename its chart without breaking integrations.
        system_role TEXT,
        -- Control accounts (AR / AP) require a party on every line and are posted
        -- only through their sub-ledger, never by manual journal.
        party_type TEXT CHECK (party_type IN ('patient', 'payer', 'supplier', 'employee')),
        allow_manual BOOLEAN NOT NULL DEFAULT TRUE,
        is_bank BOOLEAN NOT NULL DEFAULT FALSE,
        is_cash BOOLEAN NOT NULL DEFAULT FALSE,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (hospital_id, code)
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_accounts_role ON gl_accounts (hospital_id, system_role) WHERE system_role IS NOT NULL",
    """
    CREATE TABLE IF NOT EXISTS gl_cost_centres (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (hospital_id, code)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS gl_tax_codes (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        code TEXT NOT NULL,                       -- "GST12"
        name TEXT NOT NULL,
        rate NUMERIC(6, 3) NOT NULL CHECK (rate >= 0),
        kind TEXT NOT NULL DEFAULT 'gst' CHECK (kind IN ('gst', 'tds', 'exempt')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (hospital_id, code)
    )
    """,
    # ── Journals ────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_sequences (
        hospital_id INTEGER NOT NULL,
        voucher_type TEXT NOT NULL,
        fiscal_year_id BIGINT NOT NULL REFERENCES gl_fiscal_years(id),
        next_no BIGINT NOT NULL DEFAULT 1,
        PRIMARY KEY (hospital_id, voucher_type, fiscal_year_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS gl_journals (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        journal_no TEXT NOT NULL,                 -- "RV/2026-27/000042", gapless per type and year
        voucher_type TEXT NOT NULL,
        journal_date DATE NOT NULL,
        period_id BIGINT NOT NULL REFERENCES gl_periods(id),
        narration TEXT NOT NULL,
        source_module TEXT NOT NULL,              -- "billing", "pharmacy", "manual", ...
        source_ref TEXT,                          -- the operational document it records
        idempotency_key TEXT,                     -- an operational event is posted at most once
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
        reversal_of_id BIGINT REFERENCES gl_journals(id),
        reversed_by_id BIGINT REFERENCES gl_journals(id),
        total NUMERIC(18, 2) NOT NULL CHECK (total > 0),
        voucher_id BIGINT,
        created_by TEXT NOT NULL,
        approved_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (hospital_id, journal_no)
    )
    """,
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_gl_journals_idem ON gl_journals (hospital_id, idempotency_key) WHERE idempotency_key IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_gl_journals_date ON gl_journals (hospital_id, journal_date)",
    "CREATE INDEX IF NOT EXISTS idx_gl_journals_source ON gl_journals (hospital_id, source_module, source_ref)",
    """
    CREATE TABLE IF NOT EXISTS gl_journal_lines (
        id BIGSERIAL PRIMARY KEY,
        journal_id BIGINT NOT NULL REFERENCES gl_journals(id),
        hospital_id INTEGER NOT NULL,
        line_no SMALLINT NOT NULL,
        account_id BIGINT NOT NULL REFERENCES gl_accounts(id),
        debit NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
        credit NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
        cost_centre_id BIGINT REFERENCES gl_cost_centres(id),
        party_type TEXT,
        party_id TEXT,
        party_name TEXT,
        document_no TEXT,                         -- invoice / bill this line opens or settles
        narration TEXT,
        CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
        UNIQUE (journal_id, line_no)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_gl_lines_account ON gl_journal_lines (hospital_id, account_id)",
    "CREATE INDEX IF NOT EXISTS idx_gl_lines_party ON gl_journal_lines (hospital_id, party_type, party_id)",
    # ── Sub-ledgers (AR / AP open items) ────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_open_items (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        ledger TEXT NOT NULL CHECK (ledger IN ('AR', 'AP')),
        account_id BIGINT NOT NULL REFERENCES gl_accounts(id),
        party_type TEXT NOT NULL,
        party_id TEXT NOT NULL,
        party_name TEXT NOT NULL,
        document_no TEXT NOT NULL,
        document_date DATE NOT NULL,
        due_date DATE NOT NULL,
        amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
        settled NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (settled >= 0),
        journal_id BIGINT NOT NULL REFERENCES gl_journals(id),
        CHECK (settled <= amount),
        UNIQUE (hospital_id, account_id, party_id, document_no)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_gl_open_items_open ON gl_open_items (hospital_id, ledger) WHERE settled < amount",
    """
    CREATE TABLE IF NOT EXISTS gl_allocations (
        id BIGSERIAL PRIMARY KEY,
        open_item_id BIGINT NOT NULL REFERENCES gl_open_items(id),
        journal_id BIGINT NOT NULL REFERENCES gl_journals(id),
        amount NUMERIC(18, 2) NOT NULL,           -- negative when a reversal undoes a settlement
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # ── Maker-checker vouchers (payments, manual journals) ──────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_vouchers (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        voucher_type TEXT NOT NULL CHECK (voucher_type IN ('PV', 'JV', 'OB')),
        voucher_date DATE NOT NULL,
        narration TEXT NOT NULL,
        payee_name TEXT,
        amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
        lines JSONB NOT NULL,                     -- the journal it will post, validated on submit
        status TEXT NOT NULL DEFAULT 'submitted'
            CHECK (status IN ('submitted', 'approved', 'rejected', 'cancelled')),
        maker TEXT NOT NULL,
        checker TEXT,
        decided_at TIMESTAMP,
        reject_reason TEXT,
        journal_id BIGINT REFERENCES gl_journals(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # ── Integration exceptions (operational events that could not post) ─────
    """
    CREATE TABLE IF NOT EXISTS gl_posting_exceptions (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        source_module TEXT NOT NULL,
        payload JSONB NOT NULL,
        reason TEXT NOT NULL,
        first_seen TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMP NOT NULL DEFAULT NOW(),
        attempts INTEGER NOT NULL DEFAULT 1,
        resolved_at TIMESTAMP,
        UNIQUE (hospital_id, event_id)
    )
    """,
    # ── Fixed assets ────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS fa_assets (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        asset_code TEXT NOT NULL,
        name TEXT NOT NULL,
        asset_account_id BIGINT NOT NULL REFERENCES gl_accounts(id),
        accum_account_id BIGINT NOT NULL REFERENCES gl_accounts(id),
        cost NUMERIC(18, 2) NOT NULL CHECK (cost > 0),
        salvage NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (salvage >= 0),
        useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
        method TEXT NOT NULL DEFAULT 'SLM' CHECK (method IN ('SLM', 'WDV')),
        wdv_rate NUMERIC(6, 3),                   -- annual %, WDV only
        in_service_date DATE NOT NULL,
        cost_centre_id BIGINT REFERENCES gl_cost_centres(id),
        location TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed')),
        acquisition_journal_id BIGINT REFERENCES gl_journals(id),
        UNIQUE (hospital_id, asset_code)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS fa_depreciation (
        id BIGSERIAL PRIMARY KEY,
        asset_id BIGINT NOT NULL REFERENCES fa_assets(id),
        period_id BIGINT NOT NULL REFERENCES gl_periods(id),
        amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
        journal_id BIGINT NOT NULL REFERENCES gl_journals(id),
        UNIQUE (asset_id, period_id)
    )
    """,
    # ── Budgets ─────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_budgets (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        fiscal_year_id BIGINT NOT NULL REFERENCES gl_fiscal_years(id),
        account_id BIGINT NOT NULL REFERENCES gl_accounts(id),
        cost_centre_id BIGINT REFERENCES gl_cost_centres(id),
        annual_amount NUMERIC(18, 2) NOT NULL CHECK (annual_amount >= 0),
        UNIQUE (fiscal_year_id, account_id, cost_centre_id)
    )
    """,
    # ── Cash counters & bank reconciliation ─────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_cash_sessions (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        cash_account_id BIGINT NOT NULL REFERENCES gl_accounts(id),
        cashier TEXT NOT NULL,
        opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
        opening_float NUMERIC(18, 2) NOT NULL DEFAULT 0,
        closed_at TIMESTAMP,
        expected NUMERIC(18, 2),
        counted NUMERIC(18, 2),
        variance NUMERIC(18, 2),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'verified')),
        verified_by TEXT,
        variance_journal_id BIGINT REFERENCES gl_journals(id),
        notes TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS gl_bank_reconciliation (
        line_id BIGINT PRIMARY KEY REFERENCES gl_journal_lines(id),
        hospital_id INTEGER NOT NULL,
        statement_date DATE NOT NULL,
        statement_ref TEXT,
        reconciled_by TEXT NOT NULL,
        reconciled_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
    """,
    # ── Audit (append-only) ─────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS gl_audit_log (
        id BIGSERIAL PRIMARY KEY,
        hospital_id INTEGER NOT NULL,
        at TIMESTAMP NOT NULL DEFAULT NOW(),
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        detail JSONB
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_gl_audit_recent ON gl_audit_log (hospital_id, at DESC)",
]

GL_TRIGGERS = [
    # Balanced journals, checked at COMMIT so lines can be inserted one at a time.
    """
    CREATE OR REPLACE FUNCTION gl_check_journal_balanced() RETURNS trigger AS $$
    DECLARE dr NUMERIC; cr NUMERIC;
    BEGIN
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0) INTO dr, cr
          FROM gl_journal_lines WHERE journal_id = NEW.journal_id;
        IF dr <> cr OR dr = 0 THEN
            RAISE EXCEPTION 'journal % is unbalanced (debit %, credit %)', NEW.journal_id, dr, cr;
        END IF;
        RETURN NULL;
    END $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS trg_gl_journal_balanced ON gl_journal_lines",
    """
    CREATE CONSTRAINT TRIGGER trg_gl_journal_balanced
        AFTER INSERT ON gl_journal_lines
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION gl_check_journal_balanced()
    """,
    # Posted lines are history: never edited, never deleted.
    """
    CREATE OR REPLACE FUNCTION gl_forbid_line_change() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'posted journal lines are immutable -- post a reversal instead';
    END $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS trg_gl_lines_immutable ON gl_journal_lines",
    """
    CREATE TRIGGER trg_gl_lines_immutable
        BEFORE UPDATE OR DELETE ON gl_journal_lines
        FOR EACH ROW EXECUTE FUNCTION gl_forbid_line_change()
    """,
    # Journals: never deleted; the only permitted change is posted -> reversed.
    """
    CREATE OR REPLACE FUNCTION gl_guard_journal() RETURNS trigger AS $$
    BEGIN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'journals cannot be deleted -- post a reversal instead';
        END IF;
        IF TG_OP = 'INSERT' THEN
            IF (SELECT status FROM gl_periods WHERE id = NEW.period_id) <> 'open' THEN
                RAISE EXCEPTION 'period % is closed', NEW.period_id;
            END IF;
            RETURN NEW;
        END IF;
        IF NEW.status = 'reversed' AND OLD.status = 'posted' AND NEW.reversed_by_id IS NOT NULL
           AND (NEW.journal_no, NEW.journal_date, NEW.total, NEW.period_id, NEW.hospital_id)
             = (OLD.journal_no, OLD.journal_date, OLD.total, OLD.period_id, OLD.hospital_id) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'posted journals are immutable -- post a reversal instead';
    END $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS trg_gl_journal_guard ON gl_journals",
    """
    CREATE TRIGGER trg_gl_journal_guard
        BEFORE INSERT OR UPDATE OR DELETE ON gl_journals
        FOR EACH ROW EXECUTE FUNCTION gl_guard_journal()
    """,
    # The audit log is append-only too.
    "DROP TRIGGER IF EXISTS trg_gl_audit_append_only ON gl_audit_log",
    """
    CREATE TRIGGER trg_gl_audit_append_only
        BEFORE UPDATE OR DELETE ON gl_audit_log
        FOR EACH ROW EXECUTE FUNCTION gl_forbid_line_change()
    """,
]


def ensure_gl_tables(conn):
    cursor = conn.cursor()
    for statement in GL_DDL + GL_TRIGGERS:
        cursor.execute(statement)
