import React, { useState } from "react"
import { FileSpreadsheet, Download, RefreshCw } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import { Card, Empty, Loaded, Money, PageHeader, Pill, Table, Td, Th, downloadCsv, fyStart, today, useApi } from "./ui"

type StatementTab = "pnl" | "balance_sheet" | "trial_balance" | "gst"

export default function FinancialStatementsView() {
  const [tab, setTab] = useState<StatementTab>("balance_sheet")
  const [from, setFrom] = useState(fyStart())
  const [to, setTo] = useState(today())

  const pnlState = useApi(() => accountsApi.profitAndLoss({ from, to }), [from, to])
  const bsState = useApi(() => accountsApi.balanceSheet(to), [to])
  const tbState = useApi(() => accountsApi.trialBalance({ from, to }), [from, to])
  const gstState = useApi(() => accountsApi.gst({ from, to }), [from, to])

  const exportCurrent = () => {
    if (tab === "balance_sheet" && bsState.data) {
      const rows: (string | number)[][] = [["Category", "Section", "Code", "Name", "Amount"]]
      const addBlock = (cat: string, block: typeof bsState.data.assets) => {
        block.sections.forEach(s => {
          s.accounts.forEach(a => {
            rows.push([cat, s.name, a.code, a.name, a.amount])
          })
        })
      }
      addBlock("Assets", bsState.data.assets)
      addBlock("Liabilities", bsState.data.liabilities)
      addBlock("Equity", bsState.data.equity)
      downloadCsv(`Balance_Sheet_${to}.csv`, rows[0] as string[], rows.slice(1))
    } else if (tab === "pnl" && pnlState.data) {
      const rows: (string | number)[][] = [["Category", "Section", "Code", "Name", "Amount"]]
      const addBlock = (cat: string, block: typeof pnlState.data.income) => {
        block.sections.forEach(s => {
          s.accounts.forEach(a => {
            rows.push([cat, s.name, a.code, a.name, a.amount])
          })
        })
      }
      addBlock("Income", pnlState.data.income)
      addBlock("Expense", pnlState.data.expense)
      downloadCsv(`Profit_And_Loss_${from}_${to}.csv`, rows[0] as string[], rows.slice(1))
    } else if (tab === "trial_balance" && tbState.data) {
      const rows: (string | number)[][] = [["Code", "Name", "Category", "Opening Dr", "Opening Cr", "Period Dr", "Period Cr", "Closing Dr", "Closing Cr"]]
      tbState.data.rows.forEach(r => {
        rows.push([r.code, r.name, r.category, r.opening_dr, r.opening_cr, r.period_dr, r.period_cr, r.closing_dr, r.closing_cr])
      })
      downloadCsv(`Trial_Balance_${from}_${to}.csv`, rows[0] as string[], rows.slice(1))
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Financial Statements"
        subtitle="Live double-entry reports calculated directly from posted general ledger journals."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex border border-[#D0D5DD] rounded-none overflow-hidden text-xs">
              {(
                [
                  { key: "balance_sheet", label: "Balance Sheet" },
                  { key: "pnl", label: "Profit & Loss" },
                  { key: "trial_balance", label: "Trial Balance" },
                  { key: "gst", label: "GST Summary" },
                ] as const
              ).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 font-medium cursor-pointer transition ${
                    tab === t.key ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054] hover:bg-gray-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={exportCurrent}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D0D5DD] rounded-none text-xs font-semibold text-[#344054] hover:bg-gray-50 cursor-pointer shadow-xs"
            >
              <Download size={14} />
              CSV Export
            </button>
          </div>
        }
      />

      {tab === "balance_sheet" && (
        <Loaded state={bsState}>
          {bs => (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white border border-[#DDE2EC] rounded-none text-xs">
                <span className="text-[#64748B]">As of: <strong className="text-[#0F172A]">{to}</strong></span>
                <Pill tone={bs.balanced ? "green" : "red"}>
                  {bs.balanced ? "Invariant Balanced: Assets = Liabilities + Equity" : "Out of Balance"}
                </Pill>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Assets */}
                <Card title="Assets" padded={false}>
                  <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex justify-between font-bold text-xs text-[#0F172A]">
                    <span>Total Assets</span>
                    <Money value={bs.total_assets} strong />
                  </div>
                  <div className="divide-y divide-[#F1F5F9] text-xs">
                    {bs.assets.sections.map(sec => (
                      <div key={sec.code} className="p-3">
                        <div className="flex justify-between font-semibold text-[#1B4FD8] mb-1">
                          <span>{sec.name}</span>
                          <Money value={sec.total} />
                        </div>
                        <div className="space-y-1 pl-2 text-[11px] text-[#475569]">
                          {sec.accounts.map(a => (
                            <div key={a.code} className="flex justify-between">
                              <span><code className="text-gray-500 mr-1">{a.code}</code>{a.name}</span>
                              <Money value={a.amount} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Liabilities & Equity */}
                <div className="space-y-4">
                  <Card title="Liabilities" padded={false}>
                    <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex justify-between font-bold text-xs text-[#0F172A]">
                      <span>Total Liabilities</span>
                      <Money value={bs.liabilities.total} strong />
                    </div>
                    <div className="divide-y divide-[#F1F5F9] text-xs">
                      {bs.liabilities.sections.map(sec => (
                        <div key={sec.code} className="p-3">
                          <div className="flex justify-between font-semibold text-[#B45309] mb-1">
                            <span>{sec.name}</span>
                            <Money value={sec.total} />
                          </div>
                          <div className="space-y-1 pl-2 text-[11px] text-[#475569]">
                            {sec.accounts.map(a => (
                              <div key={a.code} className="flex justify-between">
                                <span><code className="text-gray-500 mr-1">{a.code}</code>{a.name}</span>
                                <Money value={a.amount} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card title="Equity" padded={false}>
                    <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex justify-between font-bold text-xs text-[#0F172A]">
                      <span>Total Equity</span>
                      <Money value={bs.equity.total} strong />
                    </div>
                    <div className="divide-y divide-[#F1F5F9] text-xs">
                      {bs.equity.sections.map(sec => (
                        <div key={sec.code} className="p-3">
                          <div className="flex justify-between font-semibold text-[#047857] mb-1">
                            <span>{sec.name}</span>
                            <Money value={sec.total} />
                          </div>
                          <div className="space-y-1 pl-2 text-[11px] text-[#475569]">
                            {sec.accounts.map(a => (
                              <div key={a.code} className="flex justify-between">
                                <span><code className="text-gray-500 mr-1">{a.code}</code>{a.name}</span>
                                <Money value={a.amount} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </Loaded>
      )}

      {tab === "pnl" && (
        <Loaded state={pnlState}>
          {pnl => (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white border border-[#DDE2EC] rounded-none text-xs">
                <span className="text-[#64748B]">Period: <strong className="text-[#0F172A]">{from} to {to}</strong></span>
                <span className={`font-bold ${pnl.surplus >= 0 ? "text-[#047857]" : "text-[#B42318]"}`}>
                  Net Surplus: <Money value={pnl.surplus} strong />
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card title="Operating Income" padded={false}>
                  <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex justify-between font-bold text-xs text-[#0F172A]">
                    <span>Total Income</span>
                    <Money value={pnl.income.total} strong />
                  </div>
                  <div className="divide-y divide-[#F1F5F9] text-xs">
                    {pnl.income.sections.map(sec => (
                      <div key={sec.code} className="p-3">
                        <div className="flex justify-between font-semibold text-[#047857] mb-1">
                          <span>{sec.name}</span>
                          <Money value={sec.total} />
                        </div>
                        <div className="space-y-1 pl-2 text-[11px] text-[#475569]">
                          {sec.accounts.map(a => (
                            <div key={a.code} className="flex justify-between">
                              <span><code className="text-gray-500 mr-1">{a.code}</code>{a.name}</span>
                              <Money value={a.amount} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="Operating Expenses" padded={false}>
                  <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex justify-between font-bold text-xs text-[#0F172A]">
                    <span>Total Expenses</span>
                    <Money value={pnl.expense.total} strong />
                  </div>
                  <div className="divide-y divide-[#F1F5F9] text-xs">
                    {pnl.expense.sections.map(sec => (
                      <div key={sec.code} className="p-3">
                        <div className="flex justify-between font-semibold text-[#BE123C] mb-1">
                          <span>{sec.name}</span>
                          <Money value={sec.total} />
                        </div>
                        <div className="space-y-1 pl-2 text-[11px] text-[#475569]">
                          {sec.accounts.map(a => (
                            <div key={a.code} className="flex justify-between">
                              <span><code className="text-gray-500 mr-1">{a.code}</code>{a.name}</span>
                              <Money value={a.amount} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </Loaded>
      )}

      {tab === "trial_balance" && (
        <Loaded state={tbState}>
          {tb => (
            <Card title={`Trial Balance (${from} to ${to})`} padded={false}>
              <Table>
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <Th>Code</Th>
                    <Th>Account Name</Th>
                    <Th>Category</Th>
                    <Th right>Opening (₹)</Th>
                    <Th right>Period Debits (₹)</Th>
                    <Th right>Period Credits (₹)</Th>
                    <Th right>Closing Balance (₹)</Th>
                  </tr>
                </thead>
                <tbody>
                  {tb.rows.map(r => (
                    <tr key={r.account_id} className="hover:bg-[#F8FAFC]">
                      <Td className="font-mono font-bold text-blue-700">{r.code}</Td>
                      <Td className="font-bold">{r.name}</Td>
                      <Td><span className="text-[11px] capitalize text-[#64748B]">{r.category}</span></Td>
                      <Td right><Money value={r.opening_dr - r.opening_cr} /></Td>
                      <Td right><Money value={r.period_dr} /></Td>
                      <Td right><Money value={r.period_cr} /></Td>
                      <Td right><Money value={r.closing_dr - r.closing_cr} strong /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </Loaded>
      )}

      {tab === "gst" && (
        <Loaded state={gstState}>
          {gst => (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card title="Output Tax Liability" padded>
                  <div className="text-xl font-bold text-[#BE123C]"><Money value={gst.output_tax} /></div>
                  <p className="text-[11px] text-[#64748B] mt-1">Tax collected on hospital revenue</p>
                </Card>
                <Card title="Input Tax Credit (ITC)" padded>
                  <div className="text-xl font-bold text-[#047857]"><Money value={gst.input_credit} /></div>
                  <p className="text-[11px] text-[#64748B] mt-1">Eligible tax credit on supplier purchases</p>
                </Card>
                <Card title="Net GST Payable" padded>
                  <div className="text-xl font-bold text-[#1B4FD8]"><Money value={gst.net_payable} /></div>
                  <p className="text-[11px] text-[#64748B] mt-1">Net tax settlement payable to government</p>
                </Card>
              </div>
            </div>
          )}
        </Loaded>
      )}
    </div>
  )
}
