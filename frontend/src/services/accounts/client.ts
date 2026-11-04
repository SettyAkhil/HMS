// Typed client for the general-ledger API.
//
// Deliberately raw `fetch`, not `apiFetch`: apiFetch answers from offline mocks
// when the backend is unreachable, which is right for clinical screens that must
// keep working, and wrong for accounting -- a finance user must never see mock
// figures presented as the hospital's books. Every failure surfaces as an
// AccountsApiError carrying the server's own message.

import { API_BASE } from "../../lib/constants"
import { withAuthHeaders } from "../../lib/api"
import type {
  Account,
  AccountStatement,
  Ageing,
  AuditEntry,
  BalanceSheet,
  BankReconciliation,
  BudgetRow,
  CashSession,
  CostCentre,
  FiscalYear,
  FixedAsset,
  GstSummary,
  Journal,
  JournalDetail,
  Overview,
  PostingEvent,
  PostingException,
  PostingResult,
  ProfitAndLoss,
  TaxCode,
  TrialBalance,
  Voucher,
  VoucherLine,
  VoucherType,
  AccountRef,
  Party,
} from "../../types/accounts"

export class AccountsApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/accounts${path}`, {
      method,
      credentials: "include",
      headers: withAuthHeaders(body === undefined ? {} : { "Content-Type": "application/json" }, method),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new AccountsApiError("The accounts service is not reachable. Check that the backend is running.", 0)
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      response.status === 401
        ? "Your session has expired — sign in again to use Accounts."
        : response.status === 403
          ? "Your role does not have permission for this accounts action."
          : payload?.error || `Accounts service returned ${response.status}.`
    throw new AccountsApiError(message, response.status)
  }
  return payload as T
}

function query(params: Record<string, string | number | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : ""
}

export interface DateRange {
  from?: string
  to?: string
}

export const accountsApi = {
  overview: () => request<Overview>("GET", "/overview"),

  // Masters
  chart: () => request<{ accounts: Account[]; cost_centres: CostCentre[]; tax_codes: TaxCode[] }>("GET", "/accounts"),
  createAccount: (body: {
    code: string
    name: string
    parent_code?: string
    category?: string
    is_group?: boolean
    is_bank?: boolean
    is_cash?: boolean
    description?: string
  }) => request<Account>("POST", "/accounts", body),
  updateAccount: (id: number, body: { name?: string; description?: string; is_active?: boolean }) =>
    request<Account>("PATCH", `/accounts/${id}`, body),

  // Journals
  journals: (filter: DateRange & { q?: string; voucher_type?: string; source?: string; status?: string; limit?: number }) =>
    request<{ journals: Journal[] }>("GET", `/journals${query({ ...filter })}`),
  journal: (id: number) => request<JournalDetail>("GET", `/journals/${id}`),
  reverse: (id: number, reason: string) => request<Journal>("POST", `/journals/${id}/reverse`, { reason }),

  // Operational postings
  post: (events: PostingEvent[]) =>
    request<{ summary: Record<PostingResult["status"], number>; results: PostingResult[] }>("POST", "/postings", { events }),
  receipt: (body: {
    patient: Party
    amount: number
    method: string
    date: string
    bill_no?: string
    department?: string
    reference?: string
  }) => request<PostingResult>("POST", "/receipts", body),
  exceptions: () => request<{ exceptions: PostingException[] }>("GET", "/posting-exceptions"),
  retryException: (id: number) => request<PostingResult>("POST", `/posting-exceptions/${id}/retry`),

  // Sub-ledgers
  ageing: (ledger: "AR" | "AP", asOf?: string) => request<Ageing>("GET", `/ageing/${ledger}${query({ as_of: asOf })}`),

  // Vouchers
  vouchers: (status?: string) => request<{ vouchers: Voucher[]; me: string }>("GET", `/vouchers${query({ status })}`),
  submitVoucher: (body: {
    voucher_type: VoucherType
    date: string
    narration: string
    lines?: VoucherLine[]
    // PV fields
    amount?: number
    tds?: number
    tds_section?: string
    supplier?: Party
    supplier_invoice_no?: string
    expense_account?: AccountRef
    bank_account?: AccountRef
    cost_centre?: string
    method?: string
    reference?: string
    payee_name?: string
  }) => request<Voucher>("POST", "/vouchers", body),
  approveVoucher: (id: number) => request<Voucher>("POST", `/vouchers/${id}/approve`, {}),
  rejectVoucher: (id: number, reason: string) => request<Voucher>("POST", `/vouchers/${id}/reject`, { reason }),
  cancelVoucher: (id: number) => request<Voucher>("POST", `/vouchers/${id}/cancel`, {}),

  // Reports
  trialBalance: (range: DateRange) => request<TrialBalance>("GET", `/reports/trial-balance${query({ ...range })}`),
  profitAndLoss: (range: DateRange) => request<ProfitAndLoss>("GET", `/reports/profit-loss${query({ ...range })}`),
  balanceSheet: (asOf?: string) => request<BalanceSheet>("GET", `/reports/balance-sheet${query({ as_of: asOf })}`),
  gst: (range: DateRange) => request<GstSummary>("GET", `/reports/gst${query({ ...range })}`),
  accountStatement: (accountId: number, range: DateRange) =>
    request<AccountStatement>("GET", `/reports/ledger${query({ account_id: accountId, ...range })}`),

  // Periods
  periods: () => request<{ fiscal_years: FiscalYear[] }>("GET", "/periods"),
  closePeriod: (id: number) => request<{ status: string }>("POST", `/periods/${id}/close`),
  reopenPeriod: (id: number) => request<{ status: string }>("POST", `/periods/${id}/reopen`),
  runDepreciation: (periodId: number) =>
    request<{ journal_no: string | null; assets: number; total: number }>("POST", `/periods/${periodId}/depreciation`),
  closeYear: (id: number) => request<{ surplus: number; journal_no: string | null }>("POST", `/fiscal-years/${id}/close`),

  // Assets & budgets
  assets: () => request<{ assets: FixedAsset[] }>("GET", "/assets"),
  registerAsset: (body: Record<string, unknown>) => request<FixedAsset>("POST", "/assets", body),
  budgets: (fiscalYearId: number) =>
    request<{ fiscal_year: string; months_elapsed: number; rows: BudgetRow[] }>("GET", `/budgets/${fiscalYearId}`),
  setBudget: (body: { fiscal_year_id: number; account: AccountRef; cost_centre?: string; annual_amount: number }) =>
    request<{ saved: boolean }>("PUT", "/budgets", body),

  // Cash & bank
  cashSessions: () => request<{ sessions: CashSession[]; me: string }>("GET", "/cash-sessions"),
  openCashSession: (body: { cash_account: AccountRef; opening_float: number }) =>
    request<CashSession>("POST", "/cash-sessions", body),
  closeCashSession: (id: number, counted: number, notes?: string) =>
    request<CashSession>("POST", `/cash-sessions/${id}/close`, { counted, notes }),
  verifyCashSession: (id: number) => request<CashSession>("POST", `/cash-sessions/${id}/verify`),
  bankReconciliation: (accountId: number, asOf?: string) =>
    request<BankReconciliation>("GET", `/bank-reconciliation/${accountId}${query({ as_of: asOf })}`),
  reconcile: (accountId: number, lineIds: number[], statementDate: string, statementRef?: string) =>
    request<{ reconciled: number }>("POST", `/bank-reconciliation/${accountId}`, {
      line_ids: lineIds,
      statement_date: statementDate,
      statement_ref: statementRef,
    }),

  audit: () => request<{ entries: AuditEntry[] }>("GET", "/audit"),
}
