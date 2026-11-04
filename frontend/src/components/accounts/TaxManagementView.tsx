import React, { useState, useEffect } from "react"
import { Percent, Building2, CheckCircle2, FileCheck2, Download, Save, RefreshCw } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import type { GstSummary, TaxCode } from "../../types/accounts"
import {
  Button, Card, DateRangeBar, Empty, ErrorNote, Field, Input, Loaded, Money, Notice, PageHeader, Pill, Select,
  Table, Td, Th, downloadCsv, formatDate, formatINR, fyStart, today, useAction, useApi
} from "./ui"

interface TaxConfig {
  gstin: string
  legalName: string
  placeOfSupply: string
  taxScheme: "Regular" | "Composition"
  isGstRegistered: boolean
}

const DEFAULT_TAX_CONFIG: TaxConfig = {
  gstin: "36AAAAA0000A1Z5",
  legalName: "HospAI Healthcare Enterprise Pvt Ltd",
  placeOfSupply: "Telangana (36)",
  taxScheme: "Regular",
  isGstRegistered: true,
}

const TAX_CONFIG_KEY = "hospai_tax_config_v1"

export default function TaxManagementView() {
  const [config, setConfig] = useState<TaxConfig>(() => {
    try {
      const raw = localStorage.getItem(TAX_CONFIG_KEY)
      return raw ? JSON.parse(raw) : DEFAULT_TAX_CONFIG
    } catch {
      return DEFAULT_TAX_CONFIG
    }
  })

  const [range, setRange] = useState<{ from?: string; to: string }>({ from: fyStart(), to: today() })
  const [notice, setNotice] = useState<string | null>(null)
  const gstState = useApi(() => accountsApi.gst(range), [range.from, range.to])
  const chartState = useApi(() => accountsApi.chart(), [])

  const saveConfig = () => {
    localStorage.setItem(TAX_CONFIG_KEY, JSON.stringify(config))
    setNotice("Tax configuration saved.")
  }

  const exportGst = (summary: GstSummary) => {
    const lines = Object.values(summary.lines || {})
    downloadCsv(
      `gst_summary_${summary.from}_${summary.to}.csv`,
      ["Account Code", "Account Name", "Amount (₹)"],
      lines.map((l) => [l.code, l.name, l.amount])
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST & Tax Engine"
        subtitle="Indian Goods and Services Tax compliance, live Output Liability, Input Tax Credit (ITC) reconciliation, and general ledger tax codes."
        actions={
          <div className="flex items-center gap-3">
            <DateRangeBar from={range.from} to={range.to} onChange={setRange} />
            {gstState.data && (
              <Button size="sm" onClick={() => exportGst(gstState.data!)}>
                <Download size={13} /> Export GST
              </Button>
            )}
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />

      {/* Live GST Overview Banner from Ledger */}
      <Loaded state={gstState}>
        {(summary) => (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-[#DDE2EC] p-5 rounded-none shadow-xs">
              <span className="text-xs text-[#64748B] font-medium">Output Tax Liability (Gross)</span>
              <div className="text-xl font-bold text-[#BE123C] mt-1">{formatINR(summary.output_tax)}</div>
              <div className="text-[11px] text-[#64748B] mt-1">Tax collected on Patient bills &amp; Pharmacy sales</div>
            </div>

            <div className="bg-white border border-[#DDE2EC] p-5 rounded-none shadow-xs">
              <span className="text-xs text-[#64748B] font-medium">Eligible Input Tax Credit (ITC)</span>
              <div className="text-xl font-bold text-[#047857] mt-1">{formatINR(summary.input_credit)}</div>
              <div className="text-[11px] text-[#64748B] mt-1">Tax paid on Pharmacy GRNs &amp; Supplier purchases</div>
            </div>

            <div className="bg-white border border-[#DDE2EC] p-5 rounded-none shadow-xs">
              <span className="text-xs text-[#64748B] font-medium">Net GST Payable / (Credit)</span>
              <div
                className={`text-xl font-bold mt-1 ${
                  summary.net_payable > 0 ? "text-[#B45309]" : "text-[#047857]"
                }`}
              >
                {formatINR(summary.net_payable)}
              </div>
              <div className="text-[11px] text-[#64748B] mt-1">
                {summary.net_payable > 0 ? "Payable to Tax Authorities" : "Net Input Credit Carried Forward"}
              </div>
            </div>
          </div>
        )}
      </Loaded>

      {/* Configuration & Tax Code Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Entity Tax Registration */}
        <div className="bg-white border border-[#DDE2EC] p-5 rounded-none space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
            <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <Building2 size={16} className="text-[#1B4FD8]" />
              Hospital Entity Tax Registration
            </h3>
            <Button size="sm" variant="primary" onClick={saveConfig}>
              <Save size={13} /> Save Config
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#475569] block mb-1">GSTIN Number</label>
              <input
                type="text"
                value={config.gstin}
                onChange={(e) => setConfig({ ...config, gstin: e.target.value.toUpperCase() })}
                className="w-full text-xs font-mono font-semibold px-3 py-2 border border-[#CBD5E1] rounded-none focus:outline-none focus:border-[#1B4FD8] bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#475569] block mb-1">Legal Business Name</label>
              <input
                type="text"
                value={config.legalName}
                onChange={(e) => setConfig({ ...config, legalName: e.target.value })}
                className="w-full text-xs font-semibold px-3 py-2 border border-[#CBD5E1] rounded-none focus:outline-none focus:border-[#1B4FD8] bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[#475569] block mb-1">Place of Supply (State)</label>
                <input
                  type="text"
                  value={config.placeOfSupply}
                  onChange={(e) => setConfig({ ...config, placeOfSupply: e.target.value })}
                  className="w-full text-xs font-semibold px-3 py-2 border border-[#CBD5E1] rounded-none focus:outline-none focus:border-[#1B4FD8] bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#475569] block mb-1">Taxation Scheme</label>
                <Select
                  value={config.taxScheme}
                  onChange={(e) => setConfig({ ...config, taxScheme: e.target.value as any })}
                >
                  <option value="Regular">Regular Taxpayer</option>
                  <option value="Composition">Composition Scheme</option>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Configured General Ledger Tax Codes from API */}
        <Loaded state={chartState}>
          {({ tax_codes }) => {
            const list = Array.isArray(tax_codes) ? tax_codes : []
            return (
              <Card title={`Active Tax Codes (${list.length})`} padded={false}>
                {list.length === 0 ? (
                  <Empty>No tax codes configured.</Empty>
                ) : (
                  <Table dense>
                    <thead>
                      <tr>
                        <Th>Code</Th>
                        <Th>Name</Th>
                        <Th right>Rate (%)</Th>
                        <Th>Kind</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((tc) => (
                        <tr key={tc.id} className="hover:bg-[#F8FAFC]">
                          <td className="py-2.5 px-3 font-mono font-bold text-xs text-[#1B4FD8]">{tc.code}</td>
                          <td className="py-2.5 px-3 text-xs font-semibold text-[#0F172A]">{tc.name}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs font-bold tabular-nums">
                            {tc.rate}%
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-none font-semibold text-[10px] uppercase ${
                                tc.kind === "gst"
                                  ? "bg-[#EFF6FF] text-[#1B4FD8]"
                                  : tc.kind === "tds"
                                  ? "bg-[#FEF3C7] text-[#92400E]"
                                  : "bg-[#F1F5F9] text-[#475569]"
                              }`}
                            >
                              {tc.kind}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            )
          }}
        </Loaded>
      </div>

      {/* Tax Accounts Mapping Table from Chart */}
      <Loaded state={chartState}>
        {({ accounts }) => {
          const allAccounts = Array.isArray(accounts) ? accounts : []
          const taxAccounts = allAccounts.filter(
            (a) =>
              a.code.startsWith("221") ||
              a.code.startsWith("142") ||
              a.name.toLowerCase().includes("gst") ||
              a.name.toLowerCase().includes("tax")
          )

          return (
            <Card title="General Ledger Tax Account Mappings & Balances" padded={false}>
              <Table dense>
                <thead>
                  <tr>
                    <Th>Account Code</Th>
                    <Th>Account Name</Th>
                    <Th>Category</Th>
                    <Th>Normal Balance</Th>
                    <Th right>Live Balance</Th>
                    <Th right>Total Postings</Th>
                  </tr>
                </thead>
                <tbody>
                  {taxAccounts.map((a) => (
                    <tr key={a.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 px-3 font-mono font-bold text-xs text-[#1B4FD8]">{a.code}</td>
                      <td className="py-2.5 px-3 text-xs font-semibold text-[#0F172A]">{a.name}</td>
                      <td className="py-2.5 px-3">
                        <Pill tone={a.category === "asset" ? "blue" : "amber"}>{a.category}</Pill>
                      </td>
                      <td className="py-2.5 px-3 text-xs capitalize text-[#475569]">{a.normal_balance}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Money value={a.balance} strong />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-[#64748B]">
                        {a.line_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )
        }}
      </Loaded>
    </div>
  )
}
