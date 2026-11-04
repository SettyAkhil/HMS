import React, { useState, useEffect, useMemo } from "react"
import {
  BillingDatabase,
  ClaimRecord,
  DepartmentType,
  PaymentRecord,
} from "../services/billingDb"
import HospitalReceiptModal from "./HospitalReceiptModal"
import { BillingHeader, KpiTile, headerBtnSoft } from "./billing/BillingChrome"
import {
  CalendarDays,
  Download,
  History,
  Hourglass,
  IndianRupee,
  Receipt,
} from "lucide-react"

export default function PaymentCollection() {
  // ── Tab State ───────────────────────────────────────────────────────────────
  // Only the ledger lives here; collecting payment is the Billing Counter's
  // job (its own sidebar page), so the old in-page POS desk was removed.
  const activeTab = "payment_history" as const

  // ── Data State ──────────────────────────────────────────────────────────────
  const [claims, setClaims] = useState<ClaimRecord[]>([])
  const [paymentsList, setPaymentsList] = useState<(PaymentRecord & {
    patientName: string;
    patientId: string;
    mrn: string;
    invoiceNo: string;
    department: DepartmentType;
  })[]>([])

  // ── Filters for Payment History Ledger ──────────────────────────────────────
  const [historySearch, setHistorySearch] = useState("")
  const [historyDeptFilter, setHistoryDeptFilter] =
    useState<DepartmentType | "All">("All")
  const [historyMethodFilter, setHistoryMethodFilter] = useState<string>("All")
  const [historyDateFilter, setHistoryDateFilter] =
    useState<"all" | "today" | "week" | "month">("all")

  // ── Receipt Modal State (Standard Reference Layout) ─────────────────────────
  const [receiptModalData, setReceiptModalData] = useState<{
    claim: ClaimRecord
    payment: PaymentRecord
  } | null>(null)

  // ── Toast Notifications ─────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null)

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Data Refresh & Synchronization ──────────────────────────────────────────
  const refreshData = () => {
    const allClaims = BillingDatabase.getClaims()
    setClaims(allClaims)
    const allPayments = BillingDatabase.getAllPayments()
    setPaymentsList(allPayments)
  }

  useEffect(() => {
    refreshData()
    const unsub = BillingDatabase.onUpdate(refreshData)
    return () => unsub()
  }, [])

  // ── Financial Metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalCollected = claims.reduce(
      (sum, c) => sum + (c.amountPaid || 0),
      0,
    )
    const totalOutstanding = claims.reduce(
      (sum, c) => sum + (c.balanceDue || 0),
      0,
    )
    const todayStr = new Date().toISOString().split("T")[0]
    const todayPayments = paymentsList.filter(
      (p) => p.paymentDate && p.paymentDate.startsWith(todayStr),
    )
    const todayCollected = todayPayments.reduce((sum, p) => sum + p.amount, 0)

    return {
      totalCollected,
      totalOutstanding,
      // Real ledger figures only -- no estimated fallbacks.
      totalReceipts: paymentsList.length,
      todayCollected,
      avgReceipt:
        paymentsList.length > 0
          ? Math.round(totalCollected / paymentsList.length)
          : 0,
    }
  }, [claims, paymentsList])

  // ── Filtered Payment History Ledger ─────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    // Only receipts that were actually issued. (An empty ledger used to be
    // padded with invented receipts carrying random numbers.)
    return paymentsList.filter((p) => {
      // Search
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase()
        const matchName = p.patientName?.toLowerCase().includes(q)
        const matchUmr =
          p.patientId?.toLowerCase().includes(q) ||
          p.mrn?.toLowerCase().includes(q)
        const matchRcpt = p.receiptNo?.toLowerCase().includes(q)
        const matchInv = p.invoiceNo?.toLowerCase().includes(q)
        const matchTxn = p.transactionRef?.toLowerCase().includes(q)
        if (!matchName && !matchUmr && !matchRcpt && !matchInv && !matchTxn)
          return false
      }

      // Department
      if (historyDeptFilter !== "All" && p.department !== historyDeptFilter) {
        return false
      }

      // Method
      if (
        historyMethodFilter !== "All" &&
        p.paymentMethod !== historyMethodFilter
      ) {
        return false
      }

      // Date Range
      if (historyDateFilter !== "all" && p.paymentDate) {
        const pDate = new Date(p.paymentDate).getTime()
        const now = new Date().getTime()
        const diffDays = (now - pDate) / (1000 * 60 * 60 * 24)
        if (historyDateFilter === "today" && diffDays > 1) return false
        if (historyDateFilter === "week" && diffDays > 7) return false
        if (historyDateFilter === "month" && diffDays > 30) return false
      }

      return true
    })
  }, [
    paymentsList,
    claims,
    historySearch,
    historyDeptFilter,
    historyMethodFilter,
    historyDateFilter,
  ])

  // ── Export Payment History CSV ──────────────────────────────────────────────
  const handleExportHistoryCSV = () => {
    try {
      const headers = [
        "Receipt No",
        "Date",
        "Patient Name",
        "UMR",
        "Invoice No",
        "Department",
        "Payment Mode",
        "Amount (INR)",
        "Txn Reference",
        "Cashier",
      ]
      const rows = filteredHistory.map((p) => [
        p.receiptNo || "",
        p.paymentDate ? new Date(p.paymentDate).toLocaleString() : "",
        `"${p.patientName || ""}"`,
        p.patientId || p.mrn || "",
        p.invoiceNo || "",
        p.department || "",
        p.paymentMethod || "",
        p.amount || 0,
        p.transactionRef || "",
        `"${p.collectedBy || ""}"`,
      ])

      const csvContent = [
        headers.join(","),
        ...rows.map((r) => r.join(",")),
      ].join("\n")
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute(
        "download",
        `Payment_History_Ledger_${new Date().toISOString().split("T")[0]}.csv`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast("Payment History CSV exported successfully!", "success")
    } catch {
      showToast("Failed to export payment history CSV", "error")
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F1F5F9] overflow-hidden">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-[13px] font-medium flex items-center gap-2.5 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : toast.type === "info"
              ? "bg-blue-600 text-white"
              : "bg-rose-600 text-white"
          }`}
        >
          <span>{toast.type === "success" ? "✓" : toast.type === "info" ? "ℹ️" : "⚠️"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <BillingHeader
        icon={History}
        title="Payment History"
        pill="Ledger"
        subtitle="Every collection and receipt issued at all billing counters."
        actions={
          <button type="button" onClick={handleExportHistoryCSV} className={headerBtnSoft}>
            <Download size={13} /> Export CSV
          </button>
        }
      />

      <div className="px-5 pt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <KpiTile tone="emerald" icon={IndianRupee} label="Total collections" value={`₹${metrics.totalCollected.toLocaleString("en-IN")}`} />
        <KpiTile tone="blue" icon={CalendarDays} label="Today's collections" value={`₹${metrics.todayCollected.toLocaleString("en-IN")}`} />
        <KpiTile tone="amber" icon={Hourglass} label="Outstanding dues" value={`₹${metrics.totalOutstanding.toLocaleString("en-IN")}`} />
        <KpiTile tone="purple" icon={Receipt} label="Receipts issued" value={metrics.totalReceipts} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-5">
        {/* =========================================================================
            VIEW 1: PAYMENT HISTORY & RECEIPTS LEDGER
           ========================================================================= */}
        {activeTab === "payment_history" && (
          <div className="bg-white border border-[#CBD5E1] shadow-2xs overflow-hidden flex flex-col w-full">
            {/* Filter Bar */}
            <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md">
                  <div className="relative w-full">
                    <input
                      type="text"
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search patient, UMR, Receipt #, Invoice #, Txn Ref..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#CBD5E1] focus:outline-none focus:border-[#1B4FD8] bg-white text-gray-900"
                    />
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                      🔍
                    </span>
                    {historySearch && (
                      <button
                        type="button"
                        onClick={() => setHistorySearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Department Filter */}
                  <select
                    value={historyDeptFilter}
                    onChange={(e) =>
                      setHistoryDeptFilter(e.target.value as any)
                    }
                    className="px-2.5 py-1.5 bg-white border border-[#CBD5E1] font-medium text-slate-700 focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="All">All Departments</option>
                    <option value="Outpatient">Outpatient</option>
                    <option value="Inpatient">Inpatient Wards</option>
                    <option value="Emergency">Emergency</option>
                    <option value="ICU">ICU</option>
                    <option value="Surgery">Surgery &amp; OT</option>
                    <option value="Laboratory">Laboratory</option>
                    <option value="Radiology">Radiology</option>
                  </select>

                  {/* Payment Method Filter */}
                  <select
                    value={historyMethodFilter}
                    onChange={(e) => setHistoryMethodFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-[#CBD5E1] font-medium text-slate-700 focus:outline-none focus:border-[#1B4FD8]"
                  >
                    <option value="All">All Payment Modes</option>
                    <option value="UPI / Digital">UPI / Digital</option>
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Insurance Copay">Insurance Copay</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>

                  {/* Date Range Filter */}
                  <div className="flex items-center bg-white border border-[#CBD5E1] text-[11px] font-semibold">
                    {(["all", "today", "week", "month"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setHistoryDateFilter(r)}
                        className={`px-2.5 py-1 cursor-pointer transition-colors capitalize ${
                          historyDateFilter === r
                            ? "bg-[#0F172A] text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {r === "all" ? "All Time" : r === "week" ? "7 Days" : r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Ledger Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#DDE2EC] bg-[#FAFCFF] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    <th className="px-4 py-3">Receipt No</th>
                    <th className="px-4 py-3">Payment Date</th>
                    <th className="px-4 py-3">Patient Name &amp; UMR</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Payment Mode</th>
                    <th className="px-4 py-3 text-right">Amount Collected</th>
                    <th className="px-4 py-3">Txn Reference</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[12px]">
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-12 text-center text-slate-500"
                      >
                        No transactions found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((p, idx) => {
                      const relatedClaim =
                        claims.find(
                          (c) =>
                            c.id === p.invoiceId || c.invoiceNo === p.invoiceNo,
                        ) ||
                        {
                          id: p.invoiceId || `CLM-${idx}`,
                          invoiceNo: p.invoiceNo || "INV-2026-0811",
                          patientId: p.patientId || "UMR111893",
                          patientName: p.patientName || "Patient",
                          mrn: p.mrn || "MRN111893",
                          age: 41,
                          gender: "Male",
                          phone: "+91 98765 43210",
                          department: p.department || "Outpatient",
                          dateOfService: p.paymentDate
                            ? p.paymentDate.split("T")[0]
                            : "2026-09-01",
                          insuranceProvider: "Self-Pay",
                          policyNumber: "N/A",
                          status: "Paid",
                          items: [
                            {
                              id: "ITEM-1",
                              description: `${p.department || "Hospital"} Services & Consultation`,
                              category: "Consultation",
                              cptCode: "99213",
                              quantity: 1,
                              unitPrice: p.amount,
                              total: p.amount,
                              insuranceCovered: 0,
                              patientPayable: p.amount,
                            },
                          ],
                          subtotal: p.amount,
                          discount: 0,
                          tax: 0,
                          totalAmount: p.amount,
                          insurancePortion: 0,
                          patientPortion: p.amount,
                          amountPaid: p.amount,
                          balanceDue: 0,
                          payments: [p],
                          diagnosisCodes: ["Z00.00"],
                          attendingDoctor: "DR. M.RAMA KRISHNA M.S. ENT",
                          createdAt: p.paymentDate || new Date().toISOString(),
                          updatedAt: p.paymentDate || new Date().toISOString(),
                        } as ClaimRecord

                      return (
                        <tr
                          key={p.id || idx}
                          className="hover:bg-[#F8FAFC] transition-colors"
                        >
                          <td className="px-4 py-3 font-mono font-semibold text-[#0F172A]">
                            {p.receiptNo || `5985${60 + idx}`}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {p.paymentDate
                              ? new Date(p.paymentDate).toLocaleString()
                              : "Today"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-gray-900">
                              {p.patientName}
                            </div>
                            <div className="text-[10.5px] font-mono text-slate-500">
                              UMR: {p.patientId || p.mrn}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-1.5 py-0.5 bg-slate-100 font-semibold text-[10.5px] text-slate-700">
                              {p.department}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600 text-[11px]">
                            {p.invoiceNo || relatedClaim.invoiceNo}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-1.5 py-0.5 font-semibold text-[10.5px] ${
                                p.paymentMethod === "Cash"
                                  ? "bg-amber-100 text-amber-800"
                                  : p.paymentMethod === "UPI / Digital"
                                    ? "bg-blue-100 text-blue-800"
                                    : "bg-purple-100 text-purple-800"
                              }`}
                            >
                              {p.paymentMethod}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-extrabold text-emerald-700 text-[13px]">
                            ₹{p.amount.toLocaleString("en-IN")}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                            {p.transactionRef || "N/A"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptModalData({
                                  claim: relatedClaim,
                                  payment: p,
                                })
                              }}
                              className="px-2.5 py-1 border border-[#CBD5E1] hover:border-[#0F172A] text-[#334155] font-semibold text-[11px] cursor-pointer transition-colors mx-auto"
                            >
                              View receipt
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Standardized Reference Hospital Receipt Modal */}
      {receiptModalData && (
        <HospitalReceiptModal
          claim={receiptModalData.claim}
          payment={receiptModalData.payment}
          onClose={() => setReceiptModalData(null)}
        />
      )}
    </div>
  )
}
