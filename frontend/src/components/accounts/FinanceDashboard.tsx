import { useState } from "react"
import { RefreshCw, Landmark, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import { syncOperationalFeed } from "../../services/accounts/operationalFeed"
import type { AccountsSubTab } from "../AccountsModule"
import {
  Button, Card, Empty, ErrorNote, Grid, Loaded, Money, Notice, PageHeader, Pill, Stat, Table, Td, Th,
  formatDate, formatINRShort, useAction, useApi,
} from "./ui"

const monthLabel = (ym: string) => {
  if (!ym || !ym.includes("-")) return ym || "—"
  const [y, m] = ym.split("-").map(Number)
  if (isNaN(y) || isNaN(m)) return ym
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
}

export default function FinanceDashboard({
  onNavigate,
  feedRevision,
}: {
  onNavigate: (tab: AccountsSubTab) => void
  feedRevision: number
}) {
  const [internalRev, setInternalRev] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  const state = useApi(() => accountsApi.overview(), [feedRevision, internalRev])

  const handleManualSync = () => {
    action.run(
      () => syncOperationalFeed(),
      (res) => {
        setNotice(
          `Operational feed synced: ${res.posted} new entries posted, ${res.duplicate} duplicate(s) reconciled.`
        )
        setInternalRev((r) => r + 1)
      }
    )
  }

  return (
    <div>
      <PageHeader
        title="Finance Overview"
        subtitle="Live double-entry books derived from posted general ledger journals. Control accounts, receivables, payables, and service line revenues."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" busy={action.busy} onClick={handleManualSync}>
              <RefreshCw size={13} /> Sync Ledger
            </Button>
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      <Loaded state={state}>
        {(o) => {
          const revenueTotal = (o.revenue_by_section || []).reduce((s, r) => s + r.amount, 0)
          return (
            <div className="space-y-4">
              {(o.pending_approvals > 0 || o.posting_exceptions > 0) && (
                <div className="flex flex-wrap gap-2">
                  {o.pending_approvals > 0 && (
                    <button onClick={() => onNavigate("manager")} className="text-left cursor-pointer">
                      <Pill tone="amber">{o.pending_approvals} voucher(s) awaiting approval</Pill>
                    </button>
                  )}
                  {o.posting_exceptions > 0 && (
                    <button onClick={() => onNavigate("audit")} className="text-left cursor-pointer">
                      <Pill tone="red">{o.posting_exceptions} operational entr{o.posting_exceptions === 1 ? "y" : "ies"} in exception queue</Pill>
                    </button>
                  )}
                </div>
              )}

              <Grid cols={5}>
                <Stat label="Cash in hand" value={formatINRShort(o.cash || 0)} onClick={() => onNavigate("cash_bank")} />
                <Stat label="Bank balances" value={formatINRShort(o.bank || 0)} onClick={() => onNavigate("cash_bank")} />
                <Stat
                  label="Receivables (AR)"
                  value={formatINRShort(o.receivables || 0)}
                  hint={o.receivables_overdue_90 && o.receivables_overdue_90 > 0 ? `${formatINRShort(o.receivables_overdue_90)} over 90 days` : "Nothing over 90 days"}
                  tone={o.receivables_overdue_90 && o.receivables_overdue_90 > 0 ? "warn" : "default"}
                  onClick={() => onNavigate("ar")}
                />
                <Stat label="Payables (AP)" value={formatINRShort(o.payables || 0)} onClick={() => onNavigate("ap")} />
                <Stat
                  label="Surplus, year to date"
                  value={formatINRShort(o.year?.surplus || 0)}
                  hint={o.year?.from ? `Since ${formatDate(o.year.from)}` : "Current financial year"}
                  tone={(o.year?.surplus || 0) < 0 ? "bad" : "good"}
                  onClick={() => onNavigate("statements")}
                />
              </Grid>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="This month" padded={false}>
                  <Table>
                    <tbody>
                      <tr>
                        <Td>Income</Td>
                        <Td right><Money value={o.month?.income || 0} /></Td>
                      </tr>
                      <tr>
                        <Td>Expenses</Td>
                        <Td right><Money value={o.month?.expense || 0} /></Td>
                      </tr>
                      <tr>
                        <Td className="font-semibold">Surplus</Td>
                        <Td right><Money value={o.month?.surplus || 0} strong /></Td>
                      </tr>
                    </tbody>
                  </Table>
                </Card>

                <Card title="Income by service line, year to date" padded={false}>
                  {(!o.revenue_by_section || o.revenue_by_section.length === 0) ? (
                    <Empty>No income posted this financial year yet.</Empty>
                  ) : (
                    <Table>
                      <thead>
                        <tr>
                          <Th>Service line</Th>
                          <Th right>Amount</Th>
                          <Th right>Share</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(o.revenue_by_section || []).map((r) => (
                          <tr key={r.name}>
                            <Td>{r.name}</Td>
                            <Td right><Money value={r.amount} /></Td>
                            <Td right className="tabular-nums text-[#64748B]">
                              {revenueTotal ? `${((r.amount / revenueTotal) * 100).toFixed(1)}%` : "—"}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Card>
              </div>

              <Card title="Month by month, this financial year" padded={false}>
                {(!o.trend || o.trend.length === 0) ? (
                  <Empty>No income or expense posted this financial year yet.</Empty>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Month</Th>
                        <Th right>Income</Th>
                        <Th right>Expenses</Th>
                        <Th right>Surplus</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(o.trend || []).map((t) => (
                        <tr key={t.month}>
                          <Td>{monthLabel(t.month)}</Td>
                          <Td right><Money value={t.income} /></Td>
                          <Td right><Money value={t.expense} /></Td>
                          <Td right><Money value={t.income - t.expense} strong /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          )
        }}
      </Loaded>
    </div>
  )
}
