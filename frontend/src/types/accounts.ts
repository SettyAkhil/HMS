// Shapes returned by the general-ledger API (backend modules/accounts).
// Money arrives as numbers rounded to 2 dp; dates as ISO strings.

export type AccountCategory = "asset" | "liability" | "equity" | "income" | "expense"

export interface Account {
  id: number
  code: string
  name: string
  category: AccountCategory
  normal_balance: "debit" | "credit"
  parent_id: number | null
  parent_code: string | null
  is_group: boolean
  is_active: boolean
  system_role: string | null
  party_type: "patient" | "payer" | "supplier" | "employee" | null
  allow_manual: boolean
  is_bank: boolean
  is_cash: boolean
  description: string | null
  balance: number
  line_count: number
}

export interface CostCentre {
  id: number
  code: string
  name: string
  is_active: boolean
}

export interface TaxCode {
  id: number
  code: string
  name: string
  rate: number
  kind: "gst" | "tds" | "exempt"
}

export interface Journal {
  id: number
  journal_no: string
  voucher_type: string
  journal_date: string
  narration: string
  source_module: string
  source_ref: string | null
  status: "posted" | "reversed"
  total: number
  created_by: string
  approved_by: string | null
  created_at: string
  reversed_by_no?: string | null
  reversal_of_no?: string | null
}

export interface JournalLine {
  id: number
  line_no: number
  account_id: number
  account_code: string
  account_name: string
  debit: number
  credit: number
  cost_centre: string | null
  party_type: string | null
  party_id: string | null
  party_name: string | null
  document_no: string | null
  narration: string | null
}

export type JournalDetail = Journal & { lines: JournalLine[] }

export interface Overview {
  as_of: string
  cash: number
  bank: number
  receivables: number
  receivables_overdue_90: number
  payables: number
  month: { income: number; expense: number; surplus: number }
  year: { income: number; expense: number; surplus: number; from: string }
  revenue_by_section: { name: string; amount: number }[]
  trend: { month: string; income: number; expense: number }[]
  pending_approvals: number
  posting_exceptions: number
}

export interface StatementSection {
  code: string
  name: string
  total: number
  accounts: { account_id: number; code: string; name: string; amount: number }[]
}

export interface StatementBlock {
  sections: StatementSection[]
  total: number
}

export interface ProfitAndLoss {
  from: string
  to: string
  income: StatementBlock
  expense: StatementBlock
  surplus: number
}

export interface BalanceSheet {
  as_of: string
  assets: StatementBlock
  liabilities: StatementBlock
  equity: StatementBlock
  total_assets: number
  total_liabilities_and_equity: number
  balanced: boolean
}

export interface TrialBalanceRow {
  account_id: number
  code: string
  name: string
  category: AccountCategory
  opening_dr: number
  opening_cr: number
  period_dr: number
  period_cr: number
  closing_dr: number
  closing_cr: number
}

export interface TrialBalance {
  from: string
  to: string
  rows: TrialBalanceRow[]
  totals: Omit<TrialBalanceRow, "account_id" | "code" | "name" | "category">
  balanced: boolean
}

export interface GstSummary {
  from: string
  to: string
  lines: Record<string, { code: string; name: string; amount: number }>
  output_tax: number
  input_credit: number
  net_payable: number
}

export interface AccountStatement {
  account: Account
  from: string
  to: string
  opening: number
  closing: number
  entries: {
    journal_id: number
    journal_no: string
    journal_date: string
    voucher_type: string
    journal_narration: string
    source_module: string
    source_ref: string | null
    status: string
    debit: number
    credit: number
    narration: string | null
    party_name: string | null
    document_no: string | null
    cost_centre: string | null
    balance: number
  }[]
}

export type AgeingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+"

export interface OpenItem {
  id: number
  document_no: string
  document_date: string
  due_date: string
  party_type: string
  party_id: string
  party_name: string
  account_code: string
  account_name: string
  amount: number
  settled: number
  outstanding: number
  days_overdue: number
  bucket: AgeingBucket
}

export type AgeingParty = { party_type: string; party_id: string; party_name: string; total: number; documents: number } & Record<AgeingBucket, number>

export interface Ageing {
  ledger: "AR" | "AP"
  as_of: string
  items: OpenItem[]
  parties: AgeingParty[]
  totals: Record<AgeingBucket | "total", number>
}

export type VoucherType = "PV" | "JV" | "OB"

export interface Voucher {
  id: number
  voucher_type: VoucherType
  voucher_date: string
  narration: string
  payee_name: string | null
  amount: number
  lines: VoucherLine[]
  status: "submitted" | "approved" | "rejected" | "cancelled"
  maker: string
  checker: string | null
  decided_at: string | null
  reject_reason: string | null
  journal_id: number | null
  journal_no: string | null
  created_at: string
}

export interface AccountRef {
  id?: number
  code?: string
  role?: string
}

export interface Party {
  id: string
  name: string
}

export interface VoucherLine {
  account: AccountRef
  debit?: number
  credit?: number
  party?: Party
  cost_centre?: string
  document_no?: string
  narration?: string
}

export interface Period {
  id: number
  fiscal_year_id: number
  period_no: number
  name: string
  start_date: string
  end_date: string
  status: "open" | "closed"
  closed_at: string | null
  closed_by: string | null
  journal_count: number
}

export interface FiscalYear {
  id: number
  code: string
  start_date: string
  end_date: string
  status: "open" | "closed"
  closed_at: string | null
  closed_by: string | null
  periods: Period[]
}

export interface FixedAsset {
  id: number
  asset_code: string
  name: string
  asset_account_code: string
  asset_account_name: string
  cost: number
  salvage: number
  useful_life_months: number
  method: "SLM" | "WDV"
  wdv_rate: number | null
  in_service_date: string
  cost_centre: string | null
  location: string | null
  status: "active" | "disposed"
  accumulated: number
  net_book_value: number
}

export interface BudgetRow {
  id: number
  account_id: number
  code: string
  name: string
  category: AccountCategory
  cost_centre: string | null
  annual_amount: number
  prorated_budget: number
  actual: number
  variance: number
  utilisation: number | null
}

export interface CashSession {
  id: number
  account_code: string
  account_name: string
  cashier: string
  opened_at: string
  opening_float: number
  closed_at: string | null
  expected: number | null
  counted: number | null
  variance: number | null
  status: "open" | "closed" | "verified"
  verified_by: string | null
  notes: string | null
}

export interface BankReconciliation {
  as_of: string
  book_balance: number
  cleared_balance: number
  uncleared_receipts: number
  uncleared_payments: number
  pending: {
    id: number
    journal_no: string
    journal_date: string
    narration: string
    debit: number
    credit: number
    line_narration: string | null
  }[]
}

export interface PostingException {
  id: number
  event_id: string
  event_type: string
  source_module: string
  payload: Record<string, unknown>
  reason: string
  first_seen: string
  last_seen: string
  attempts: number
}

export interface AuditEntry {
  id: number
  at: string
  actor: string
  action: string
  entity: string
  entity_id: string | null
  detail: Record<string, unknown> | null
}

export type PostingEventType =
  | "PATIENT_BILL"
  | "PATIENT_RECEIPT"
  | "INSURANCE_SETTLEMENT"
  | "PHARMACY_SALE"
  | "PHARMACY_GRN"
  | "PAYROLL_RUN"

/** An operational event for POST /api/accounts/postings. `event_id` is its idempotency key. */
export interface PostingEvent {
  event_id: string
  type: PostingEventType
  source: string
  date: string
  [field: string]: unknown
}

export interface PostingResult {
  event_id: string
  status: "posted" | "duplicate" | "rejected"
  journal_no?: string
  reason?: string
}
