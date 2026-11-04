import React, { useState } from "react"
import { PieChart, Plus, Search, BarChart2, Edit3, CheckCircle2 } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import type { BudgetRow, FiscalYear, CostCentre, Account } from "../../types/accounts"
import AccountPicker, { CostCentrePicker } from "./AccountPicker"
import {
  Button, Card, Empty, ErrorNote, Field, Input, Loaded, Modal, Money, Notice, PageHeader, Pill, Select, Table,
  Td, Th, formatINR, formatINRShort, useAction, useApi
} from "./ui"

export default function BudgetingView() {
  const fyState = useApi(() => accountsApi.periods(), [])
  const [selectedFyId, setSelectedFyId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null)
  const [addingBudget, setAddingBudget] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  // Use the first active FY by default
  const activeFyId = selectedFyId || (fyState.data?.fiscal_years?.[0]?.id ?? null)

  const budgetState = useApi(
    () => (activeFyId ? accountsApi.budgets(activeFyId) : Promise.resolve({ fiscal_year: "", months_elapsed: 0, rows: [] })),
    [activeFyId]
  )

  const rows = budgetState.data?.rows || []
  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    const matchesSearch =
      !q ||
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.cost_centre && r.cost_centre.toLowerCase().includes(q))
    const matchesCategory =
      categoryFilter === "all" ||
      (categoryFilter === "income" && r.category === "income") ||
      (categoryFilter === "expense" && r.category === "expense")
    return matchesSearch && matchesCategory
  })

  const totalAnnualBudget = rows.reduce((s, r) => s + r.annual_amount, 0)
  const totalActual = rows.reduce((s, r) => s + r.actual, 0)
  const totalVariance = rows.reduce((s, r) => s + r.variance, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cost Centre Budgeting & Variance Monitoring"
        subtitle="Departmental revenue and expense budget allocations benchmarked against live general ledger journal actuals."
        actions={
          <div className="flex items-center gap-3">
            {fyState.data?.fiscal_years && (
              <div className="w-44">
                <Select
                  value={activeFyId || ""}
                  onChange={(e) => setSelectedFyId(Number(e.target.value))}
                >
                  {fyState.data.fiscal_years.map((fy) => (
                    <option key={fy.id} value={fy.id}>
                      FY {fy.code} ({fy.status})
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Button variant="primary" onClick={() => setAddingBudget(true)}>
              <Plus size={14} /> Allocate Budget
            </Button>
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Annual Allocated Budget</span>
          <div className="text-xl font-bold text-[#0F172A] mt-1">{formatINRShort(totalAnnualBudget)}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">{rows.length} Budget Targets Configured</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Actual Ledger YTD</span>
          <div className="text-xl font-bold text-[#1B4FD8] mt-1">{formatINRShort(totalActual)}</div>
          <div className="text-[11px] text-[#1B4FD8] mt-0.5 font-semibold">Live General Ledger Postings</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Overall Net Variance</span>
          <div className={`text-xl font-bold mt-1 ${totalVariance >= 0 ? "text-[#047857]" : "text-[#BE123C]"}`}>
            {totalVariance >= 0 ? "+" : ""}{formatINRShort(totalVariance)}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Budget minus Actuals</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Fiscal Elapsed</span>
          <div className="text-xl font-bold text-[#0F172A] mt-1">
            {budgetState.data?.months_elapsed ?? 0} Months
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Proration Baseline</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#DDE2EC] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#F1F5F9] bg-[#FAFAFA] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-2.5 text-[#94A3B8]" size={14} />
              <input
                type="text"
                placeholder="Search code, account or cost centre..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#1B4FD8] bg-white"
              />
            </div>
            <div className="w-40">
              <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All Categories</option>
                <option value="income">Revenue / Income</option>
                <option value="expense">Expenses</option>
              </Select>
            </div>
          </div>
          <span className="text-xs text-[#64748B]">
            Showing {filtered.length} of {rows.length} lines
          </span>
        </div>

        <Loaded state={budgetState}>
          {() =>
            filtered.length === 0 ? (
              <Empty>
                {rows.length === 0
                  ? "No budgets have been allocated for this financial year yet. Click 'Allocate Budget' to set departmental targets."
                  : "No budget rows match search filter."}
              </Empty>
            ) : (
              <Table dense>
                <thead>
                  <tr>
                    <Th>Cost Centre</Th>
                    <Th>Account</Th>
                    <Th>Category</Th>
                    <Th right>Annual Budget</Th>
                    <Th right>Prorated YTD</Th>
                    <Th right>Actual YTD</Th>
                    <Th right>Variance</Th>
                    <Th right>Utilisation</Th>
                    <Th right>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => {
                    const pct = b.utilisation !== null ? b.utilisation.toFixed(1) : "—"
                    const numPct = b.utilisation || 0
                    return (
                      <tr key={b.id || `${b.account_id}-${b.cost_centre}`} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-mono font-bold text-xs text-[#1B4FD8]">
                          {b.cost_centre || "General Hospital"}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-xs text-[#0F172A]">{b.name}</div>
                          <div className="text-[11px] font-mono text-[#64748B]">{b.code}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                              b.category === "income" ? "bg-[#ECFDF5] text-[#047857]" : "bg-[#EFF6FF] text-[#1B4FD8]"
                            }`}
                          >
                            {b.category === "income" ? "Revenue" : "Expense"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-medium">
                          {formatINR(b.annual_amount)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-[#64748B]">
                          {formatINR(b.prorated_budget)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#0F172A]">
                          {formatINR(b.actual)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono text-xs font-semibold ${
                            b.variance >= 0 ? "text-[#047857]" : "text-[#BE123C]"
                          }`}
                        >
                          {b.variance >= 0 ? "+" : ""}{formatINR(b.variance)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono font-bold text-xs">{pct}%</span>
                            <div className="w-14 bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  numPct > 100
                                    ? "bg-[#BE123C]"
                                    : numPct > 80
                                    ? "bg-[#D97706]"
                                    : "bg-[#047857]"
                                }`}
                                style={{ width: `${Math.min(numPct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setEditingBudget(b)}>
                            <Edit3 size={13} />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )
          }
        </Loaded>
      </div>

      {/* Add / Edit Budget Modal */}
      {(addingBudget || editingBudget) && activeFyId && (
        <BudgetFormModal
          fiscalYearId={activeFyId}
          initial={editingBudget}
          onClose={() => {
            setAddingBudget(false)
            setEditingBudget(null)
          }}
          onSaved={() => {
            setAddingBudget(false)
            setEditingBudget(null)
            setNotice("Budget target successfully updated.")
            budgetState.reload()
          }}
        />
      )}
    </div>
  )
}

function BudgetFormModal({
  fiscalYearId,
  initial,
  onClose,
  onSaved,
}: {
  fiscalYearId: number
  initial: BudgetRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [accountId, setAccountId] = useState<number | "">(initial?.account_id || "")
  const [costCentre, setCostCentre] = useState(initial?.cost_centre || "")
  const [annualAmount, setAnnualAmount] = useState(initial?.annual_amount ? String(initial.annual_amount) : "")
  const action = useAction()

  const save = () => {
    if (!accountId || !annualAmount) return
    action.run(
      () =>
        accountsApi.setBudget({
          fiscal_year_id: fiscalYearId,
          account: { id: Number(accountId) },
          cost_centre: costCentre || undefined,
          annual_amount: Number(annualAmount),
        }),
      onSaved
    )
  }

  return (
    <Modal
      title={initial ? `Edit Budget: ${initial.code} ${initial.name}` : "Allocate New Budget Target"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={action.busy}
            disabled={!accountId || !annualAmount}
            onClick={save}
          >
            Save Target
          </Button>
        </>
      }
    >
      <ErrorNote message={action.error} />
      <div className="space-y-3">
        <Field label="GL Account">
          <AccountPicker
            value={accountId}
            onChange={(id) => setAccountId(id)}
            placeholder="Select GL Account (Income or Expense)"
          />
        </Field>
        <Field label="Cost Centre / Department (optional)">
          <CostCentrePicker value={costCentre} onChange={setCostCentre} />
        </Field>
        <Field label="Annual Allocated Target (₹)">
          <Input
            type="number"
            min="0"
            step="1000"
            value={annualAmount}
            onChange={(e) => setAnnualAmount(e.target.value)}
            placeholder="e.g. 15000000"
          />
        </Field>
      </div>
    </Modal>
  )
}
