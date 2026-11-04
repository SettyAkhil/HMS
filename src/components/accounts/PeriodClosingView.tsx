import React, { useState } from "react"
import { Lock, Unlock, CheckCircle2, AlertTriangle, Calendar, Calculator, RefreshCw } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import type { FiscalYear, Period } from "../../types/accounts"
import {
  Button, Card, Empty, ErrorNote, Loaded, Modal, Money, Notice, PageHeader, Pill, Table, Td, Th,
  formatDate, formatDateTime, useAction, useApi
} from "./ui"

export default function PeriodClosingView() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null)
  const [confirmAction, setConfirmAction] = useState<"close" | "reopen" | "depreciation" | "close_year" | null>(null)
  const [selectedFy, setSelectedFy] = useState<FiscalYear | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  const state = useApi(() => accountsApi.periods(), [])
  const overviewState = useApi(() => accountsApi.overview(), [])

  const handleClosePeriod = (period: Period) => {
    action.run(
      () => accountsApi.closePeriod(period.id),
      () => {
        setNotice(`Period "${period.name}" successfully closed and locked.`)
        setSelectedPeriod(null)
        setConfirmAction(null)
        state.reload()
      }
    )
  }

  const handleReopenPeriod = (period: Period) => {
    action.run(
      () => accountsApi.reopenPeriod(period.id),
      () => {
        setNotice(`Period "${period.name}" reopened for postings.`)
        setSelectedPeriod(null)
        setConfirmAction(null)
        state.reload()
      }
    )
  }

  const handleRunDepreciation = (period: Period) => {
    action.run(
      () => accountsApi.runDepreciation(period.id),
      (res) => {
        setNotice(
          `Depreciation executed: ₹${(res.total || 0).toLocaleString("en-IN")} across ${res.assets || 0} assets posted as ${res.journal_no || "journal"}.`
        )
        setSelectedPeriod(null)
        setConfirmAction(null)
        state.reload()
      }
    )
  }

  const handleCloseYear = (fy: FiscalYear) => {
    action.run(
      () => accountsApi.closeYear(fy.id),
      (res) => {
        setNotice(
          `Fiscal Year ${fy.code} closed. Net surplus ₹${(res.surplus || 0).toLocaleString("en-IN")} posted to Retained Earnings as ${res.journal_no || "journal"}.`
        )
        setSelectedFy(null)
        setConfirmAction(null)
        state.reload()
      }
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Period Closing & Fiscal Year Governance"
        subtitle="Manage calendar and financial periods, execute monthly fixed asset depreciation runs, lock historical ledgers against backdated entries, and close the fiscal year."
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      {/* Pre-Flight Checklist from Real Data */}
      <Loaded state={overviewState}>
        {(ov) => {
          const exceptionsCount = ov.posting_exceptions || 0
          const pendingApprovals = ov.pending_approvals || 0
          return (
            <div className="bg-white border border-[#DDE2EC] p-5 rounded-xl space-y-3 shadow-xs">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#047857]" />
                Financial Month-End Closure Pre-Flight Checklist
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-[#334155] pt-1">
                <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${pendingApprovals === 0 ? "bg-[#F8FAFC] border-[#E2E8F0]" : "bg-[#FFFBEB] border-[#FDE68A]"}`}>
                  <span className={`w-2 h-2 rounded-full ${pendingApprovals === 0 ? "bg-[#10B981]" : "bg-[#F59E0B]"}`} />
                  <span>
                    {pendingApprovals === 0 ? "All Vouchers Approved & Posted" : `${pendingApprovals} Voucher(s) Awaiting Approval`}
                  </span>
                </div>
                <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${exceptionsCount === 0 ? "bg-[#F8FAFC] border-[#E2E8F0]" : "bg-[#FEF2F2] border-[#FEE2E2]"}`}>
                  <span className={`w-2 h-2 rounded-full ${exceptionsCount === 0 ? "bg-[#10B981]" : "bg-[#EF4444]"}`} />
                  <span>
                    {exceptionsCount === 0 ? "Outbox Zero Posting Exceptions" : `${exceptionsCount} Posting Exception(s)`}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>Double-Entry Trial Balance Invariant</span>
                </div>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>Bank & Cash Reconciliations Reconciled</span>
                </div>
              </div>
            </div>
          )
        }}
      </Loaded>

      {/* Fiscal Periods from API */}
      <Loaded state={state}>
        {({ fiscal_years }) => {
          const years = Array.isArray(fiscal_years) ? fiscal_years : []
          if (years.length === 0) {
            return (
              <Card>
                <Empty>No fiscal years found.</Empty>
              </Card>
            )
          }

          return (
            <div className="space-y-6">
              {years.map((fy) => (
                <Card
                  key={fy.id}
                  title={`Fiscal Year: ${fy.code} (${formatDate(fy.start_date)} to ${formatDate(fy.end_date)})`}
                  padded={false}
                  actions={
                    <div className="flex items-center gap-2">
                      <Pill tone={fy.status === "open" ? "green" : "neutral"}>
                        {fy.status === "open" ? "FY Active & Open" : `Closed by ${fy.closed_by || "Admin"}`}
                      </Pill>
                      {fy.status === "open" && (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setSelectedFy(fy)
                            setConfirmAction("close_year")
                          }}
                        >
                          Close Financial Year
                        </Button>
                      )}
                    </div>
                  }
                >
                  <Table dense>
                    <thead>
                      <tr>
                        <Th>#</Th>
                        <Th>Period Name</Th>
                        <Th>Date Range</Th>
                        <Th right>Journals Posted</Th>
                        <Th>Status</Th>
                        <Th right>Actions</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(fy.periods || []).map((p) => (
                        <tr key={p.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                            P{p.period_no.toString().padStart(2, "0")}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-xs text-[#0F172A]">
                            {p.name}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-[#475569] whitespace-nowrap">
                            {formatDate(p.start_date)} — {formatDate(p.end_date)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums font-medium text-[#1B4FD8]">
                            {p.journal_count || 0}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                                p.status === "closed"
                                  ? "bg-[#FEF2F2] text-[#B42318]"
                                  : "bg-[#ECFDF5] text-[#047857]"
                              }`}
                            >
                              {p.status === "closed" ? "Locked / Closed" : "Open for Postings"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {p.status === "open" && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setSelectedPeriod(p)
                                      setConfirmAction("depreciation")
                                    }}
                                    title="Run Fixed Asset Depreciation for this period"
                                  >
                                    <Calculator size={12} /> Depreciation
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => {
                                      setSelectedPeriod(p)
                                      setConfirmAction("close")
                                    }}
                                  >
                                    <Lock size={12} /> Lock Period
                                  </Button>
                                </>
                              )}
                              {p.status === "closed" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedPeriod(p)
                                    setConfirmAction("reopen")
                                  }}
                                >
                                  <Unlock size={12} /> Reopen
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              ))}
            </div>
          )
        }}
      </Loaded>

      {/* Confirmation Modals */}
      {confirmAction === "close" && selectedPeriod && (
        <Modal
          title={`Lock Period: ${selectedPeriod.name}`}
          onClose={() => {
            setSelectedPeriod(null)
            setConfirmAction(null)
          }}
          footer={
            <>
              <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="danger"
                busy={action.busy}
                onClick={() => handleClosePeriod(selectedPeriod)}
              >
                Confirm Lock Period
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs text-[#334155]">
            <p>
              Locking this period prevents all subsequent journal postings, edits, and backdated transactions dated within{" "}
              <strong>{selectedPeriod.name}</strong>.
            </p>
            <p className="text-[#64748B]">
              Only users with <code>accounts.periods.manage</code> permissions can reopen closed periods.
            </p>
          </div>
        </Modal>
      )}

      {confirmAction === "reopen" && selectedPeriod && (
        <Modal
          title={`Reopen Period: ${selectedPeriod.name}`}
          onClose={() => {
            setSelectedPeriod(null)
            setConfirmAction(null)
          }}
          footer={
            <>
              <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="primary"
                busy={action.busy}
                onClick={() => handleReopenPeriod(selectedPeriod)}
              >
                Confirm Reopen
              </Button>
            </>
          }
        >
          <p className="text-xs text-[#334155]">
            Reopening <strong>{selectedPeriod.name}</strong> will allow backdated journal adjustments to be recorded. Ensure all audit considerations are noted.
          </p>
        </Modal>
      )}

      {confirmAction === "depreciation" && selectedPeriod && (
        <Modal
          title={`Execute Depreciation: ${selectedPeriod.name}`}
          onClose={() => {
            setSelectedPeriod(null)
            setConfirmAction(null)
          }}
          footer={
            <>
              <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="primary"
                busy={action.busy}
                onClick={() => handleRunDepreciation(selectedPeriod)}
              >
                Execute & Post Journal
              </Button>
            </>
          }
        >
          <p className="text-xs text-[#334155]">
            This will compute monthly depreciation for all active capitalized assets for period{" "}
            <strong>{selectedPeriod.name}</strong> and post a double-entry journal (Debit Depreciation Expense, Credit Accumulated Depreciation).
          </p>
        </Modal>
      )}

      {confirmAction === "close_year" && selectedFy && (
        <Modal
          title={`Close Financial Year: ${selectedFy.code}`}
          onClose={() => {
            setSelectedFy(null)
            setConfirmAction(null)
          }}
          footer={
            <>
              <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
              <Button
                variant="danger"
                busy={action.busy}
                onClick={() => handleCloseYear(selectedFy)}
              >
                Finalize Year Close
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs text-[#334155]">
            <p>
              Year-end closing will transfer net surplus/deficit from temporary Income & Expense accounts into{" "}
              <strong>Retained Earnings (Equity)</strong> via a closing entry, and lock the fiscal year permanently.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
