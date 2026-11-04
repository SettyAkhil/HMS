import React, { useState, useMemo } from "react"
import { Pill, Box, RefreshCw, Layers, TrendingUp, Building2, Download, Search } from "lucide-react"
import { PharmacyDatabase, type AppMedicine, type AppGRN } from "../../services/pharmacyDb"
import { accountsApi } from "../../services/accounts/client"
import { syncOperationalFeed } from "../../services/accounts/operationalFeed"
import { JournalDetailModal } from "./JournalsView"
import {
  Button, Card, Empty, ErrorNote, Loaded, Money, Notice, PageHeader, Pill as Badge, Table, Td, Th,
  downloadCsv, formatDate, formatINR, formatINRShort, fyStart, today, useAction, useApi
} from "./ui"

export default function PharmacyAccountsView() {
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"journals" | "inventory" | "grns">("journals")
  const [openJournalId, setOpenJournalId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  // Real operational database data
  const inventory: AppMedicine[] = useMemo(() => PharmacyDatabase.getMedicines(), [])
  const bills = useMemo(() => PharmacyDatabase.getBills(), [])
  const grns: AppGRN[] = useMemo(() => PharmacyDatabase.getGRNs(), [])
  const suppliers = useMemo(() => new Map(PharmacyDatabase.getSuppliers().map((s) => [s.id, s.supplierName])), [])

  // Real ledger API data
  const chartState = useApi(() => accountsApi.chart(), [])
  const pharmacyJournalsState = useApi(
    () => accountsApi.journals({ from: fyStart(), to: today(), source: "pharmacy", limit: 150 }),
    []
  )

  // Dynamic calculations from operational inventory and bills
  const stockValuation = useMemo(() => {
    return inventory.reduce((sum: number, item: AppMedicine) => {
      const qty = Number(item.currentStock ?? item.stock ?? 0)
      const cost = Number(item.purchasePrice || (item.mrp ? item.mrp * 0.7 : 0)) || 0
      return sum + qty * cost
    }, 0)
  }, [inventory])

  const totalSalesOperational = useMemo(() => {
    return bills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0)
  }, [bills])

  const totalGrnInwarded = useMemo(() => {
    return grns.reduce((sum, g) => {
      const itemsCost = (g.items || []).reduce(
        (sub, it) => sub + (Number(it.receivedQty) || 0) * (Number(it.purchasePrice) || 0),
        0
      )
      return sum + itemsCost
    }, 0)
  }, [grns])

  // Extract balances from GL accounts if available
  const glAccounts = chartState.data?.accounts || []
  const stockAccount = glAccounts.find((a) => a.code === "1410")
  const salesAccount = glAccounts.find((a) => a.code === "4310")

  const handleSyncToLedger = () => {
    action.run(
      () => syncOperationalFeed(),
      (res) => {
        setNotice(
          `Operational feed synchronized: ${res.posted} entries posted, ${res.duplicate} duplicate(s) reconciled, ${res.rejected} exceptions.`
        )
        pharmacyJournalsState.reload()
        chartState.reload()
      }
    )
  }

  const exportInventoryValuation = () => {
    downloadCsv(
      `pharmacy_inventory_valuation_${today()}.csv`,
      ["Item Name", "Generic Name", "Batch", "Stock Qty", "Estimated Unit Cost (₹)", "Total Valuation (₹)"],
      inventory.map((item: AppMedicine) => {
        const qty = Number(item.currentStock ?? item.stock ?? 0)
        const cost = Number(item.purchasePrice || (item.mrp ? item.mrp * 0.7 : 0)) || 0
        const total = qty * cost
        return [
          item.medicineName || item.name || "",
          item.genericName || "",
          item.batchNumber || "—",
          qty,
          cost.toFixed(2),
          total.toFixed(2),
        ]
      })
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pharmacy Accounts & Inventory Cost Accounting"
        subtitle="Medicine sales revenue, live inventory valuation, goods received notes (GRN), and perpetual double-entry stock accounting."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={exportInventoryValuation}>
              <Download size={13} /> Export Valuation
            </Button>
            <Button variant="primary" size="sm" busy={action.busy} onClick={handleSyncToLedger}>
              <RefreshCw size={13} /> Sync to General Ledger
            </Button>
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      {/* Dynamic Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE2EC] p-5 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Inventory Stock Valuation</span>
          <div className="text-xl font-bold text-[#1B4FD8] mt-1">{formatINRShort(stockValuation)}</div>
          <div className="text-[11px] text-[#64748B] mt-1">
            {inventory.length} Stock SKUs · GL [1410]: {stockAccount ? formatINR(stockAccount.balance) : "—"}
          </div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-5 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Total Pharmacy Sales Revenue</span>
          <div className="text-xl font-bold text-[#047857] mt-1">{formatINRShort(totalSalesOperational)}</div>
          <div className="text-[11px] text-[#047857] mt-1 font-semibold">
            {bills.length} Dispensing Invoices · GL [4310]: {salesAccount ? formatINR(salesAccount.balance) : "—"}
          </div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-5 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Total GRN Inward Purchases</span>
          <div className="text-xl font-bold text-[#BE123C] mt-1">{formatINRShort(totalGrnInwarded)}</div>
          <div className="text-[11px] text-[#64748B] mt-1">{grns.length} Verified Goods Receipts</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-5 rounded-xl shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">COGS &amp; Gross Margin</span>
          <div className="text-xl font-bold text-[#0F172A] mt-1">
            {totalSalesOperational > 0
              ? `${Math.round(((totalSalesOperational - totalGrnInwarded) / totalSalesOperational) * 100)}%`
              : "—"}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">Estimated Trading Margin</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-[#DDE2EC] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#F1F5F9] bg-[#FAFAFA] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex border border-[#D0D5DD] rounded-[6px] overflow-hidden text-xs">
            <button
              onClick={() => setActiveTab("journals")}
              className={`px-3 py-1.5 font-medium cursor-pointer transition ${
                activeTab === "journals" ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054] hover:bg-gray-50"
              }`}
            >
              Posted GL Journals
            </button>
            <button
              onClick={() => setActiveTab("inventory")}
              className={`px-3 py-1.5 font-medium cursor-pointer transition ${
                activeTab === "inventory" ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054] hover:bg-gray-50"
              }`}
            >
              Stock Valuation SKUs ({inventory.length})
            </button>
            <button
              onClick={() => setActiveTab("grns")}
              className={`px-3 py-1.5 font-medium cursor-pointer transition ${
                activeTab === "grns" ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054] hover:bg-gray-50"
              }`}
            >
              Goods Received Notes ({grns.length})
            </button>
          </div>

          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 text-[#94A3B8]" size={14} />
            <input
              type="text"
              placeholder="Search items, bills or suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded-lg focus:outline-none focus:border-[#1B4FD8] bg-white"
            />
          </div>
        </div>

        {/* Tab 1: Posted GL Journals */}
        {activeTab === "journals" && (
          <Loaded state={pharmacyJournalsState}>
            {({ journals }) => {
              const q = search.trim().toLowerCase()
              const list = (journals || []).filter(
                (j) =>
                  !q ||
                  j.journal_no.toLowerCase().includes(q) ||
                  j.narration.toLowerCase().includes(q) ||
                  (j.source_ref && j.source_ref.toLowerCase().includes(q))
              )

              return list.length === 0 ? (
                <Empty>No pharmacy accounting journals posted yet. Click 'Sync to General Ledger' above.</Empty>
              ) : (
                <Table dense>
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Journal No</Th>
                      <Th>Narration</Th>
                      <Th>Reference</Th>
                      <Th right>Total Amount</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((j) => (
                      <tr
                        key={j.id}
                        className="hover:bg-[#F8FAFC] cursor-pointer"
                        onClick={() => setOpenJournalId(j.id)}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap text-xs text-[#475569]">
                          {formatDate(j.journal_date)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-xs text-[#1B4FD8]">
                          {j.journal_no}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-[#0F172A]">{j.narration}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                          {j.source_ref || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Money value={j.total} strong />
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge tone={j.status === "posted" ? "green" : "red"}>{j.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )
            }}
          </Loaded>
        )}

        {/* Tab 2: Inventory Stock Valuation */}
        {activeTab === "inventory" && (
          <Table dense>
            <thead>
              <tr>
                <Th>Medicine / Item</Th>
                <Th>Generic Name</Th>
                <Th>Batch</Th>
                <Th right>Stock In Hand</Th>
                <Th right>Unit Cost Est.</Th>
                <Th right>Inventory Asset Value</Th>
              </tr>
            </thead>
            <tbody>
              {inventory
                .filter((item: AppMedicine) => {
                  const name = (item.medicineName || item.name || "").toLowerCase()
                  const gen = (item.genericName || "").toLowerCase()
                  const s = search.toLowerCase()
                  return !s || name.includes(s) || gen.includes(s)
                })
                .map((item: AppMedicine) => {
                  const qty = Number(item.currentStock ?? item.stock ?? 0)
                  const cost = Number(item.purchasePrice || (item.mrp ? item.mrp * 0.7 : 0)) || 0
                  const valuation = qty * cost
                  return (
                    <tr key={item.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 px-3 font-semibold text-xs text-[#0F172A]">
                        {item.medicineName || item.name}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#64748B] italic">
                        {item.genericName || "—"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[#64748B]">
                        {item.batchNumber || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#0F172A]">
                        {qty}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-[#475569]">
                        {formatINR(cost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#1B4FD8]">
                        {formatINR(valuation)}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </Table>
        )}

        {/* Tab 3: Goods Received Notes */}
        {activeTab === "grns" && (
          <Table dense>
            <thead>
              <tr>
                <Th>GRN ID</Th>
                <Th>Date</Th>
                <Th>Supplier</Th>
                <Th>Supplier Invoice #</Th>
                <Th right>Items Count</Th>
                <Th right>Taxable Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {grns
                .filter((g: AppGRN) => {
                  const s = search.toLowerCase()
                  return (
                    !s ||
                    g.id.toLowerCase().includes(s) ||
                    (g.invoiceNumber && g.invoiceNumber.toLowerCase().includes(s)) ||
                    (suppliers.get(g.supplierId) || "").toLowerCase().includes(s)
                  )
                })
                .map((g: AppGRN) => {
                  const grnCost = (g.items || []).reduce(
                    (s: number, it) => s + (Number(it.receivedQty) || 0) * (Number(it.purchasePrice) || 0),
                    0
                  )
                  return (
                    <tr key={g.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 px-3 font-mono font-bold text-xs text-[#1B4FD8]">{g.id}</td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        {formatDate(g.grnDate || g.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-xs text-[#0F172A]">
                        {suppliers.get(g.supplierId) || g.supplierId}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[#64748B]">
                        {g.invoiceNumber || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-[#475569]">
                        {(g.items || []).length} items
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#BE123C]">
                        {formatINR(grnCost)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge tone="green">Verified</Badge>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </Table>
        )}
      </div>

      {openJournalId !== null && (
        <JournalDetailModal id={openJournalId} onClose={() => setOpenJournalId(null)} />
      )}
    </div>
  )
}
