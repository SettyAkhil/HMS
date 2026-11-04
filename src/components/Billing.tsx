import React, { useState, useEffect, useMemo } from "react"
import {
  BillingDatabase,
  BILLING_PAYMENT_FAILED_EVENT,
  ClaimRecord,
  DepartmentType,
  isCashlessEligible,
  InvoiceItem,
  PaymentRecord,
} from "../services/billingDb"
import HospitalReceiptModal from "./HospitalReceiptModal"
import { SendToPatientButton } from "./messaging/SendToPatientDialog"
import { billMessageVars, buildBillDocument } from "../lib/patientDocuments"
import {
  BillingHeader,
  KpiTile,
  PanelTitle,
  headerBtnSoft,
  headerBtnSolid,
} from "./billing/BillingChrome"
import BillToInsurance from "./billing/BillToInsurance"
import ClaimPanel, {
  claimStage,
  isBilledToInsurance,
  isInsured,
} from "./insurance/ClaimPanel"
import {
  BedDouble,
  Download,
  FileStack,
  Hourglass,
  IndianRupee,
  Plus,
  Siren,
  Stethoscope,
  TrendingUp,
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Printer,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Users,
} from "lucide-react"
import { apiFetch } from "../lib/api"

const DEPARTMENTS: { label: string ;value: DepartmentType | "All" }[] = [
  { label: "All Departments", value: "All" },
  { label: "Emergency (ER)", value: "Emergency" },
  { label: "Inpatient Wards", value: "Inpatient" },
  { label: "ICU", value: "ICU" },
  { label: "Surgery & OT", value: "Surgery" },
  { label: "Outpatient (OP)", value: "Outpatient" },
  { label: "Radiology & Imaging", value: "Radiology" },
  { label: "Laboratory", value: "Laboratory" },
  { label: "Pharmacy", value: "Pharmacy" },
]

// ── Shared presentation helpers ─────────────────────────────────────────────

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`

const fmtDate = (iso?: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

const daysSince = (iso?: string) => {
  const t = iso ? new Date(iso).getTime() : NaN
  if (Number.isNaN(t)) return 1
  return Math.max(1, Math.ceil((Date.now() - t) / 86_400_000))
}

/** Which billing workflow a bill belongs to, whatever counter shows it. */
type BillKind = "op" | "ip" | "er" | "diag"
const billKind = (d: DepartmentType): BillKind =>
  d === "Inpatient" || d === "ICU" || d === "Surgery"
    ? "ip"
    : d === "Emergency"
      ? "er"
      : d === "Laboratory" || d === "Radiology" || d === "Pharmacy"
        ? "diag"
        : "op"

const KIND_LABEL: Record<BillKind, string> = {
  op: "Outpatient",
  ip: "Inpatient",
  er: "Emergency",
  diag: "Diagnostics",
}

/** Department colour, used consistently on badges, rails and actions. */
const deptTone = (d: DepartmentType): { color: string ;tint: string } => {
  switch (d) {
    case "Emergency":
      return { color: "#DC2626", tint: "#FEF2F2" }
    case "Inpatient":
    case "ICU":
    case "Surgery":
      return { color: "#7C3AED", tint: "#F5F3FF" }
    case "Laboratory":
      return { color: "#D97706", tint: "#FFFBEB" }
    case "Radiology":
      return { color: "#0D9488", tint: "#F0FDFA" }
    case "Pharmacy":
      return { color: "#059669", tint: "#ECFDF5" }
    default:
      return { color: "#0369A1", tint: "#F0F9FF" }
  }
}

/** One line of workflow context under each queue row. */
const queueMeta = (c: ClaimRecord) => {
  const kind = billKind(c.department)
  if (kind === "ip")
    return `${c.carePathway || c.department} · day ${daysSince(c.dateOfService)}`
  if (kind === "er") return c.carePathway || c.encounterId || "Emergency visit"
  return `${c.attendingDoctor || "OP visit"} · ${fmtDate(c.dateOfService)}`
}

const PAY_MODES: {
  id: PaymentRecord["paymentMethod"]
  label: string
  Icon: React.ComponentType<{ size?: number ;className?: string }>
}[] = [
  { id: "UPI / Digital", label: "UPI", Icon: Smartphone },
  { id: "Cash", label: "Cash", Icon: Banknote },
  { id: "Credit Card", label: "Credit card", Icon: CreditCard },
  { id: "Debit Card", label: "Debit card", Icon: Wallet },
  { id: "Bank Transfer", label: "Bank transfer", Icon: Landmark },
]

const fieldBase =
  "w-full px-3 py-2 bg-white border border-[#CBD5E1] text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
const fieldCls = `${fieldBase} font-mono`

export type BillingView = "counter" | "unified"
export type BillingScope = "all" | "op" | "ip" | "er"

// Each billing counter is its own sidebar page. A scope fixes which
// departments' bills that counter settles; "all" is the main cashier desk.
const SCOPES: Record<
  BillingScope,
  {
    title: string
    subtitle: string
    departments: DepartmentType[] | null
  }
> = {
  all: {
    title: "Billing Counter",
    subtitle: "Every department's pending bills, settled at one cashier desk.",
    departments: null,
  },
  op: {
    // Walk-in lab, radiology and pharmacy bills settle here too, so every
    // bill has a counter now that the all-departments counter is the dashboard.
    title: "OP Billing",
    subtitle: "Consultations, OP procedures and walk-in diagnostics — paid by the patient.",
    departments: ["Outpatient", "Laboratory", "Radiology", "Pharmacy"],
  },
  ip: {
    title: "IP Billing",
    subtitle: "Ward, ICU and surgery — running bills, advances, cashless insurance and final settlement.",
    departments: ["Inpatient", "ICU", "Surgery"],
  },
  er: {
    title: "Emergency Billing",
    subtitle: "Emergency department and trauma charges.",
    departments: ["Emergency"],
  },
}

const VIEW_HEADINGS: Record<Exclude<BillingView, "counter">, { title: string ;subtitle: string }> = {
  unified: {
    title: "Unified Patient Bill",
    subtitle: "One consolidated bill across every department a patient visited.",
  },
}

export default function Billing({
  view = "counter",
  scope = "all",
}: {
  view?: BillingView
  scope?: BillingScope
}) {
  // The sidebar picks the page; there is no in-page tab bar any more.
  const activeTab = view === "unified" ? "unified_bill" : "pos_counter"
  const scopeDef = SCOPES[view === "counter" ? scope : "all"]
  const heading = view === "counter" ? scopeDef : VIEW_HEADINGS[view]
  const headerIcon =
    view === "unified"
      ? FileStack
        : scope === "op"
          ? Stethoscope
          : scope === "ip"
            ? BedDouble
            : scope === "er"
              ? Siren
              : Receipt
  const headerPill =
    view === "unified"
      ? "Consolidated"
        : { all: "Live Cashier", op: "OP Counter", ip: "Running Bills", er: "Emergency Desk" }[scope]

  // ── Live Data Collections ───────────────────────────────────────────────────
  const [claims, setClaims] = useState<ClaimRecord[]>([])
  const [paymentsList, setPaymentsList] = useState<(PaymentRecord & {
    patientName: string;
    patientId: string;
    mrn: string;
    invoiceNo: string;
    department: DepartmentType;
  })[]>([])

  // ── Filters & Search ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("")
  const [deptFilter, setDeptFilter] = useState<DepartmentType | "All">("All")
  const [statusFilter, setStatusFilter] =
    useState<"all" | "unpaid" | "insurance" | "settled">("unpaid")

  // ── Selected Patient / Bill for POS Settlement ──────────────────────────────
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null)

  // ── POS Payment Form State ──────────────────────────────────────────────────
  const [payMode, setPayMode] =
    useState<PaymentRecord["paymentMethod"]>("UPI / Digital")
  const [payAmount, setPayAmount] = useState<number>(0)
  const [tenderedCash, setTenderedCash] = useState<number>(0)
  const [transactionRef, setTransactionRef] = useState<string>("")
  const [cashierNotes, setCashierNotes] = useState<string>("")

  // Split Payment Support
  const [isSplitPay, setIsSplitPay] = useState(false)
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0)
  const [splitDigitalAmount, setSplitDigitalAmount] = useState<number>(0)

  // Who settles the open bill: the patient at the counter, or insurance
  // (cashless -- the whole bill goes to the Insurance department's desk).
  const [payTarget, setPayTarget] = useState<"patient" | "insurance">("patient")

  // ── Receipt & Print Modals ──────────────────────────────────────────────────
  const [receiptData, setReceiptData] = useState<{
    claim: ClaimRecord
    payment?: PaymentRecord | null
  } | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  // ── Payment Confirmation & Post-Payment Clearance Modals ────────────────────
  const [showConfirmPayModal, setShowConfirmPayModal] = useState(false)
  const [postPayClearanceModal, setPostPayClearanceModal] = useState<{
    claim: ClaimRecord
    payment: PaymentRecord
  } | null>(null)

  // ── Quick Walk-In Invoice Modal ─────────────────────────────────────────────
  const [showQuickBillModal, setShowQuickBillModal] = useState(false)
  const [quickPatientName, setQuickPatientName] = useState("")
  const [quickUmr, setQuickUmr] = useState("")
  const [quickDept, setQuickDept] = useState<DepartmentType>("Outpatient")
  const [quickService, setQuickService] = useState("Specialist Consultation")
  const [quickAmount, setQuickAmount] = useState(500)

  // ── Notification Toast ──────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    message: string
    type: "success" | "info" | "error"
  } | null>(null)

  const showToast = (
    message: string,
    type: "success" | "info" | "error" = "success",
  ) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Manual Clearance Dispatch State & Handler ──────────────────────────────
  const [dispatchedClearances, setDispatchedClearances] = useState<{
    [key: string]: boolean
  }>({})

  const handleDispatchClearance = (
    patientNameOrUmr: string,
    department: "Laboratory" | "Radiology",
    receiptNo?: string,
    testName?: string,
  ) => {
    const res = BillingDatabase.dispatchClearanceToDepartment(
      patientNameOrUmr,
      department,
      receiptNo,
      testName,
    )
    if (res.success) {
      showToast(res.message, "success")
      setDispatchedClearances((prev) => ({
        ...prev,
        [`${patientNameOrUmr}_${department}`]: true,
      }))
      refreshData()
    } else {
      showToast(res.message, "error")
    }
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
    // A payment on a server bill is shown at once and confirmed by the server;
    // if the server refuses it, the bill reverts on the next sync -- say why.
    const onFailed = (e: Event) => {
      const d = (e as CustomEvent<{ invoiceNo?: string ;error?: string }>).detail || {}
      showToast(`Payment on ${d.invoiceNo || "the bill"} was NOT saved: ${d.error || "server refused it"}. Please collect again.`, "error")
    }
    window.addEventListener(BILLING_PAYMENT_FAILED_EVENT, onFailed)
    return () => {
      unsub()
      window.removeEventListener(BILLING_PAYMENT_FAILED_EVENT, onFailed)
    }
  }, [])

  // Set default selected claim if none selected or if preselected from ER
  useEffect(() => {
    if (claims.length > 0) {
      const preselected = BillingDatabase.getPreselectedClaimForBilling()
      if (preselected) {
        const found = claims.find(
          (c) =>
            c.id === preselected ||
            c.invoiceNo === preselected ||
            c.encounterId === preselected ||
            c.patientId === preselected ||
            (c.patientName && c.patientName.toLowerCase() === preselected.toLowerCase())
        )
        if (found) {
          BillingDatabase.clearPreselectedClaimForBilling()
          setSelectedClaimId(found.id)
          const bal = found.balanceDue || 0
          setPayAmount(bal)
          setTenderedCash(bal)
          setIsSplitPay(false)
          setSplitCashAmount(Math.floor(bal / 2))
          setSplitDigitalAmount(Math.ceil(bal / 2))
          setTransactionRef(`TXN-${Date.now().toString().slice(-6)}`)
          setDeptFilter("All")
          setStatusFilter("unpaid")
          return
        }
      }

      // Keep selectedClaimId null initially unless preselected, allowing staff to use Central Search or select from cards.
    }
  }, [claims, selectedClaimId])

  // Active Selected Claim Details
  const selectedClaim = useMemo(() => {
    return claims.find((c) => c.id === selectedClaimId) || null
  }, [claims, selectedClaimId])

  // Whatever selected the bill -- a click, the queue's auto-select or a deep
  // link -- the payment form starts from that bill's balance. Without this an
  // auto-selected bill opened with ₹0 to collect and a disabled Collect button.
  useEffect(() => {
    const c = claims.find((x) => x.id === selectedClaimId)
    if (!c) return
    const bal = c.balanceDue || 0
    setPayAmount(bal)
    setTenderedCash(bal)
    setIsSplitPay(false)
    setSplitCashAmount(Math.floor(bal / 2))
    setSplitDigitalAmount(Math.ceil(bal / 2))
    setTransactionRef(`TXN-${Date.now().toString().slice(-6)}`)
    setPayTarget(isCashlessEligible(c) && isInsured(c) ? "insurance" : "patient")
    // When the selection changes, or the bill's balance itself changes (a
    // payment, a hand-over to insurance, an edited insurance split) -- not on
    // every data refresh, which would wipe an amount the cashier is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClaimId, claims.find((x) => x.id === selectedClaimId)?.balanceDue])

  // When selected claim changes, update pay amount
  const handleSelectClaim = (claim: ClaimRecord) => {
    setSelectedClaimId(claim.id)
    const bal = claim.balanceDue || 0
    setPayAmount(bal)
    setTenderedCash(bal)
    setIsSplitPay(false)
    setSplitCashAmount(Math.floor(bal / 2))
    setSplitDigitalAmount(Math.ceil(bal / 2))
    setTransactionRef(`TXN-${Date.now().toString().slice(-6)}`)
    // An insured admission is billed to insurance by default.
    setPayTarget(
      isCashlessEligible(claim) && isInsured(claim) ? "insurance" : "patient",
    )
  }

  // Claims this page is responsible for (all of them on the main counter).
  const scopedClaims = useMemo(
    () =>
      scopeDef.departments
        ? claims.filter((c) =>
            scopeDef.departments!.includes(c.department as DepartmentType),
          )
        : claims,
    [claims, scopeDef],
  )

  // Department chips offered on this page: only the scope's own departments.
  const deptChoices = useMemo(
    () =>
      scopeDef.departments
        ? [
            { label: "All", value: "All" as const },
            ...DEPARTMENTS.filter((d) =>
              scopeDef.departments!.includes(d.value as DepartmentType),
            ),
          ]
        : DEPARTMENTS,
    [scopeDef],
  )

  // Moving between counters starts each one unfiltered, with a default
  // walk-in department that belongs to it.
  useEffect(() => {
    setDeptFilter("All")
    setQuickDept(scopeDef.departments?.[0] ?? "Outpatient")
  }, [scopeDef])

  // ── Filtered Claims for the POS Queue ───────────────────────────────────────
  const filteredClaims = useMemo(() => {
    const list = scopedClaims.filter((c) => {
      // Dept filter
      if (deptFilter !== "All" && c.department !== deptFilter) return false
      // Status filter
      if (statusFilter === "unpaid" && (c.balanceDue || 0) <= 0) return false
      if (statusFilter === "settled" && (c.balanceDue || 0) > 0) return false
      if (statusFilter === "insurance" && !isInsured(c)) return false
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = c.patientName.toLowerCase().includes(q)
        const matchUmr =
          c.patientId.toLowerCase().includes(q) ||
          c.mrn.toLowerCase().includes(q)
        const matchInv = c.invoiceNo.toLowerCase().includes(q)
        const matchDept = c.department.toLowerCase().includes(q)
        if (!matchName && !matchUmr && !matchInv && !matchDept) return false
      }
      return true
    })

    return list.sort((a, b) => {
      if (selectedClaimId) {
        if (a.id === selectedClaimId) return -1
        if (b.id === selectedClaimId) return 1
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
  }, [scopedClaims, deptFilter, statusFilter, searchQuery, selectedClaimId])

  // Auto-select the first matching patient in the scoped queue so the right-side billing section is immediately active
  useEffect(() => {
    if (filteredClaims.length > 0) {
      // Functional update: a bill preselected in this same render (a deep
      // link from the dashboard, ER or registration) must win over the
      // "first in queue" default, which only sees the previous state.
      setSelectedClaimId((prev) =>
        prev && filteredClaims.some((c) => c.id === prev) ? prev : filteredClaims[0].id,
      )
    } else {
      setSelectedClaimId(null)
    }
  }, [filteredClaims, selectedClaimId])

  // ── Financial Metrics Computation ───────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalCollected = scopedClaims.reduce(
      (sum, c) => sum + (c.amountPaid || 0),
      0,
    )
    const totalOutstanding = scopedClaims.reduce(
      (sum, c) => sum + (c.balanceDue || 0),
      0,
    )
    const totalBilled = scopedClaims.reduce((sum, c) => sum + (c.totalAmount || 0), 0)
    const pendingBillsCount = scopedClaims.filter(
      (c) => (c.balanceDue || 0) > 0,
    ).length

    // Today's stats
    const todayStr = new Date().toISOString().split("T")[0]
    const todayPayments = paymentsList.filter(
      (p) =>
        p.paymentDate &&
        p.paymentDate.startsWith(todayStr) &&
        (!scopeDef.departments ||
          scopeDef.departments.includes(p.department)),
    )
    const todayCollected = todayPayments.reduce((sum, p) => sum + p.amount, 0)

    return {
      totalCollected,
      totalOutstanding,
      totalBilled,
      pendingBillsCount,
      // Real figures only -- "today" used to fall back to 35% of all-time
      // collections when nothing had been paid today.
      todayCollected,
      todayReceiptsCount: todayPayments.length,
    }
  }, [scopedClaims, paymentsList, scopeDef])

  // ── Payment Processing Handlers ────────────────────────────────────────────
  const handleInitiatePayment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClaim) return

    if (payAmount <= 0) {
      showToast("Please enter a valid payment amount greater than ₹0", "error")
      return
    }
    setShowConfirmPayModal(true)
  }

  const executeConfirmedPayment = () => {
    if (!selectedClaim) return

    try {
      let finalMethod = payMode
      let notes = cashierNotes

      if (isSplitPay) {
        finalMethod = "UPI / Digital"
        notes = `Split Payment: Cash ₹${splitCashAmount.toLocaleString("en-IN")} + Digital ₹${splitDigitalAmount.toLocaleString("en-IN")}. ${cashierNotes}`
      }

      const { claim, payment } = BillingDatabase.recordPayment(
        selectedClaim.id,
        {
          amount: payAmount,
          paymentMethod: finalMethod,
          transactionRef:
            transactionRef || `TXN-${Date.now().toString().slice(-6)}`,
          collectedBy: "Central Cashier Desk",
          notes,
        },
      )

      setShowConfirmPayModal(false)

      const clearanceStatus = BillingDatabase.getDepartmentClearanceStatus(
        claim.patientName,
        claim,
      )
      const hasDiag =
        clearanceStatus.hasLabOrders || clearanceStatus.hasRadStudies

      if (hasDiag) {
        setPostPayClearanceModal({ claim, payment })
        showToast(
          `✓ Payment of ₹${payAmount.toLocaleString("en-IN")} confirmed! Receipt ${payment.receiptNo} generated. Transmit diagnostic orders to Lab / Radiology below.`,
          "success",
        )
      } else {
        setReceiptData({ claim, payment })
        setShowReceiptModal(true)
        showToast(
          `✓ Payment of ₹${payAmount.toLocaleString("en-IN")} recorded successfully! Receipt ${payment.receiptNo} generated.`,
          "success",
        )
      }

      // Reset form
      setCashierNotes("")
      setTenderedCash(0)
      refreshData()
    } catch (err: any) {
      showToast(err.message || "Failed to record payment", "error")
    }
  }

  // ── Date Formatter for Receipt ───────────────────────────────────────────────
  const formatReceiptDate = (dateString?: string) => {
    if (!dateString) return "12 Sept 2026 09:15 pm"
    try {
      const d = new Date(dateString)
      if (isNaN(d.getTime())) return dateString
      const day = d.getDate().toString().padStart(2, "0")
      const month = d.toLocaleString("en-IN", { month: "short" })
      const year = d.getFullYear()
      const hours = d.getHours()
      const minutes = d.getMinutes().toString().padStart(2, "0")
      const ampm = hours >= 12 ? "pm" : "am"
      const formattedHours = (hours % 12 || 12).toString().padStart(2, "0")
      return `${day} ${month} ${year} ${formattedHours}:${minutes} ${ampm}`
    } catch {
      return dateString
    }
  }

  // ── Diagnostic Clearance Widget Renderer ────────────────────────────────────
  const renderClearanceDispatchWidget = (
    claim: ClaimRecord,
    currentReceiptNo?: string,
  ) => {
    const effectiveReceiptNo =
      currentReceiptNo ||
      (claim.payments && claim.payments.length > 0
        ? claim.payments[claim.payments.length - 1].receiptNo
        : undefined)
    const clearanceStatus = BillingDatabase.getDepartmentClearanceStatus(
      claim.patientName,
      claim,
    )

    const isLabDispatched =
      dispatchedClearances[`${claim.patientName}_Laboratory`] ||
      clearanceStatus.labPendingCount === 0
    const isRadDispatched =
      dispatchedClearances[`${claim.patientName}_Radiology`] ||
      clearanceStatus.radPendingCount === 0

    return (
      <div className="border border-slate-200 bg-[#F8FAFC] p-2 sm:p-2.5 space-y-1.5 text-left">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-[10.5px] sm:text-[11px] text-[#0F2757] uppercase tracking-wider">
            Diagnostic Financial Clearance Routing
          </h4>
          <span className="text-[10px] font-medium text-slate-500">
            Manual Cashier Transmission
          </span>
        </div>

        {clearanceStatus.isNonDiagnostic ? (
          <div className="p-1.5 bg-emerald-50/80 border border-emerald-200 flex items-start gap-2">
            <span className="text-emerald-700 text-xs">ℹ️</span>
            <div>
              <div className="font-bold text-emerald-900 text-[10.5px] flex items-center gap-1.5">
                Non-Diagnostic Routine Bill
                <span className="px-1.5 py-0.2 rounded-full bg-emerald-200 text-emerald-800 text-[9px] font-bold">
                  No Tests
                </span>
              </div>
              <p className="text-[10px] text-emerald-700">
                Payment settled normally — patient is free to exit without
                department routing.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {clearanceStatus.hasLabOrders && (
              <div className="p-1.5 px-2 bg-white border border-slate-200/90 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 bg-[#E0F7F6] border border-teal-100 flex items-center justify-center shrink-0">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect
                        x="7"
                        y="2"
                        width="10"
                        height="2.5"
                        rx="1"
                        fill="#99F6E4"
                        stroke="#0D9488"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M8.5 4.5V16C8.5 17.933 10.067 19.5 12 19.5C13.933 19.5 15.5 17.933 15.5 16V4.5"
                        stroke="#0D9488"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <path
                        d="M8.5 11C10 12 14 10 15.5 11.5V16C15.5 17.933 13.933 19.5 12 19.5C10.067 19.5 8.5 17.933 8.5 16V11Z"
                        fill="#F97316"
                        fillOpacity="0.85"
                      />
                      <circle cx="12" cy="14" r="1" fill="#FFFFFF" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-[11px] leading-tight">
                      Laboratory Clearance
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium truncate">
                      Tests:{" "}
                      {clearanceStatus.labTestNames.join(", ") ||
                        "Daily Serum Electrolytes & Renal Function Panel"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 bg-[#E6FAEE] border border-emerald-200 text-emerald-800 font-semibold text-[10px] flex items-center gap-1">
                    <span>✓</span> Cleared &amp; Unlocked
                  </span>
                  {isLabDispatched ? (
                    <span className="px-2 py-0.5 bg-[#E6FAEE] border border-emerald-200 text-emerald-800 font-semibold text-[10px] flex items-center gap-1">
                      <span>✓</span> Clearance Sent{" "}
                      {effectiveReceiptNo ? `(${effectiveReceiptNo})` : ""}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        handleDispatchClearance(
                          claim.patientName,
                          "Laboratory",
                          effectiveReceiptNo,
                          clearanceStatus.labTestNames[0],
                        )
                      }
                      className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-[10px] shadow-2xs cursor-pointer flex items-center gap-1 transition-all"
                    >
                      <span>📤</span> Send to Lab
                    </button>
                  )}
                </div>
              </div>
            )}

            {clearanceStatus.hasRadStudies && (
              <div className="p-1.5 px-2 bg-white border border-slate-200/90 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 bg-[#14233C] border border-slate-700 flex items-center justify-center shrink-0">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        stroke="#38BDF8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      <path
                        d="M12 3V21M3 12H21M5.6 5.6L18.4 18.4M5.6 18.4L18.4 5.6"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <circle cx="12" cy="12" r="3" fill="#38BDF8" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-[11px] leading-tight">
                      Radiology &amp; Imaging Clearance
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium truncate">
                      Studies:{" "}
                      {clearanceStatus.radStudyNames.join(", ") ||
                        "Echocardiography Transthoracic Complete"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 bg-[#E6FAEE] border border-emerald-200 text-emerald-800 font-semibold text-[10px] flex items-center gap-1">
                    <span>✓</span> Cleared &amp; Unlocked
                  </span>
                  {isRadDispatched ? (
                    <span className="px-2 py-0.5 bg-[#E6FAEE] border border-emerald-200 text-emerald-800 font-semibold text-[10px] flex items-center gap-1">
                      <span>✓</span> Clearance Sent{" "}
                      {effectiveReceiptNo ? `(${effectiveReceiptNo})` : ""}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        handleDispatchClearance(
                          claim.patientName,
                          "Radiology",
                          effectiveReceiptNo,
                          clearanceStatus.radStudyNames[0],
                        )
                      }
                      className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-[10px] shadow-2xs cursor-pointer flex items-center gap-1 transition-all"
                    >
                      <span>📤</span> Send to Radiology
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Quick Walk-In Bill Creation Handler ──────────────────────────────────────
  const handleCreateQuickBill = (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickPatientName.trim()) {
      showToast("Patient name is required", "error")
      return
    }

    try {
      const umr =
        quickUmr.trim() || `UMR${Math.floor(100000 + Math.random() * 900000)}`
      const items: InvoiceItem[] = [
        {
          id: `ITEM-${Date.now()}`,
          description: quickService,
          category:
            quickDept === "Laboratory"
              ? "Laboratory"
              : quickDept === "Radiology"
                ? "Radiology / Imaging"
                : "Consultation",
          cptCode: "99213",
          quantity: 1,
          unitPrice: quickAmount,
          total: quickAmount,
          insuranceCovered: 0,
          patientPayable: quickAmount,
          orderedBy: "Attending Consultant",
          orderedAt: new Date().toISOString(),
        },
      ]

      const newClaim = BillingDatabase.createClaim({
        patientName: quickPatientName,
        patientId: umr,
        mrn: umr,
        age: 38,
        gender: "Male",
        phone: "+91 98765 43210",
        department: quickDept,
        insuranceProvider: "Self-Pay",
        policyNumber: "N/A",
        status: "Draft",
        items,
        subtotal: quickAmount,
        discount: 0,
        tax: 0,
        totalAmount: quickAmount,
        insurancePortion: 0,
        patientPortion: quickAmount,
        amountPaid: 0,
        balanceDue: quickAmount,
        dateOfService: new Date().toISOString().split("T")[0],
      })

      setShowQuickBillModal(false)
      setQuickPatientName("")
      setQuickUmr("")
      setSelectedClaimId(newClaim.id)
      setPayAmount(newClaim.balanceDue || 0)
      showToast(
        `Quick bill created for ${newClaim.patientName}! Ready for settlement.`,
        "success",
      )
      refreshData()
    } catch (err: any) {
      showToast(err.message || "Failed to create quick bill", "error")
    }
  }

  // ── Export CSV Handler ──────────────────────────────────────────────────────
  const handleExportCSV = () => {
    try {
      const csv = BillingDatabase.exportClaimsToCSV()
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute(
        "download",
        `Hospital_Billing_Report_${new Date().toISOString().split("T")[0]}.csv`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      showToast("Billing & Revenue CSV downloaded successfully!", "success")
    } catch {
      showToast("Failed to export CSV", "error")
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#F1F5F9] text-slate-900 overflow-hidden">
      {/* ── TOAST NOTIFICATION ── */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 shadow-xl flex items-center gap-3 text-xs font-bold border animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-900 text-emerald-100 border-emerald-700"
              : toast.type === "error"
                ? "bg-rose-900 text-rose-100 border-rose-700"
                : "bg-blue-900 text-blue-100 border-blue-700"
          }`}
        >
          <span>
            {toast.type === "success"
              ? "✓"
              : toast.type === "error"
                ? "✕"
                : "ℹ"}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      <BillingHeader
        icon={headerIcon}
        title={heading.title}
        pill={headerPill}
        subtitle={heading.subtitle}
        actions={
          view === "counter" ? (
            <>
              <button type="button" onClick={handleExportCSV} className={headerBtnSoft}>
                <Download size={13} /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => setShowQuickBillModal(true)}
                className={headerBtnSolid}
              >
                <Plus size={13} /> Walk-In Bill
              </button>
            </>
          ) : undefined
        }
      />

      {/* ── 4. MAIN CONTENT VIEWS ── */}
      <main className="flex-1 overflow-y-auto p-5 space-y-4">
        {view === "counter" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              tone="emerald"
              icon={IndianRupee}
              label="Collected"
              value={inr(metrics.totalCollected)}
              sub={`Today ${inr(metrics.todayCollected)}`}
            />
            <KpiTile
              tone="amber"
              icon={Hourglass}
              label="Outstanding dues"
              value={inr(metrics.totalOutstanding)}
              sub={`${metrics.pendingBillsCount} bill${metrics.pendingBillsCount === 1 ? "" : "s"} pending`}
              onClick={() => setStatusFilter("unpaid")}
            />
            <KpiTile
              tone="blue"
              icon={Receipt}
              label={scope === "all" ? "Active Patient Accounts" : "Bills to settle"}
              value={metrics.pendingBillsCount}
              sub={scopeDef.departments ? scopeDef.departments.join(" · ") : "All departments"}
            />
            {scope === "ip" ? (
              <KpiTile
                tone="purple"
                icon={ShieldCheck}
                label="Billed to insurance"
                value={inr(
                  scopedClaims
                    .filter((c) => isInsured(c) && claimStage(c) !== "Settled")
                    .reduce((a, c) => a + (c.insurancePortion || 0), 0),
                )}
                sub={`${scopedClaims.filter((c) => isInsured(c) && claimStage(c) !== "Settled").length} claims with Insurance dept`}
              />
            ) : (
            <KpiTile
              tone="purple"
              icon={TrendingUp}
              label="Billed gross"
              value={inr(metrics.totalBilled)}
              sub={`Settlement rate ${
                metrics.totalBilled > 0
                  ? Math.round((metrics.totalCollected / metrics.totalBilled) * 100)
                  : 100
              }%`}
            />
            )}
          </div>
        )}
        {/* =========================================================================
            TAB 1: HIGH-SPEED PAYMENT COUNTER (POS & DEPARTMENT BILLS QUEUE)
           ========================================================================= */}
        {activeTab === "pos_counter" && (
          <div className="space-y-3">
            {/* ── PATIENT SEARCH BAR ── */}
            <div className="bg-white border border-[#CBD5E1] shadow-2xs p-3 flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="flex items-center gap-2 text-blue-900 font-bold text-[13px] shrink-0">
                <Search size={17} className="text-blue-600" />
                <span>{scope === "all" ? "Central Billing Search" : `${heading.title} Search`}</span>
              </div>
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    scope === "all"
                      ? "Search any patient by Name, UMR ID, MRN, Invoice No, Room/Bed, or Phone..."
                      : `Search ${heading.title} patients by Name, UMR ID, MRN, Invoice No, or Phone...`
                  }
                  className="w-full pl-8 pr-8 h-9 bg-slate-50 border border-[#CBD5E1] text-[12.5px] font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 shadow-2xs"
                />
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {scope === "all" && (
                <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 mr-1">
                    Scope:
                  </span>
                  {(
                    [
                      ["All", "All Billing"],
                      ["Outpatient", "OP"],
                      ["Inpatient", "IP"],
                      ["Emergency", "ER"],
                      ["Laboratory", "Diagnostics"],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDeptFilter(val as DepartmentType | "All")}
                      className={`px-2.5 py-1 text-[11px] font-bold border transition-colors cursor-pointer ${
                        deptFilter === val
                          ? "bg-blue-600 border-blue-700 text-white"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── 2-COLUMN SPLIT MASTER-DETAIL POS COUNTER LAYOUT ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* ── LEFT SIDEBAR: PATIENT BILLS QUEUE (4 cols) ── */}
              <div className="lg:col-span-4 bg-white border border-[#CBD5E1] shadow-2xs flex flex-col max-h-[calc(100vh-210px)] overflow-hidden">
                <div className="p-3 border-b border-[#CBD5E1] bg-slate-50/90 flex items-center justify-between gap-2">
                  <h3 className="font-bold text-[12px] text-slate-900 uppercase tracking-wider">
                    {scope === "all" ? "Patient Queue" : `${heading.title} Queue`} ({filteredClaims.length})
                  </h3>
                  <div className="flex items-center gap-1">
                    {(scope === "op"
                      ? (["unpaid", "settled", "all"] as const)
                      : (["unpaid", "insurance", "settled", "all"] as const)
                    ).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`px-1.5 py-0.5 text-[9.5px] font-bold uppercase transition-colors cursor-pointer ${
                          statusFilter === st
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {st === "unpaid" ? "Dues" : st === "insurance" ? "Ins" : st}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Queue List of Patient Bills */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {filteredClaims.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-slate-500">
                      No matching patient bills found.
                    </div>
                  ) : (
                    filteredClaims.map((c) => {
                      const active = c.id === selectedClaimId
                      const kind = billKind(c.department)
                      const tone = deptTone(c.department)
                      const isIns = isInsured(c)
                      const bal = c.balanceDue || 0

                      return (
                        <div
                          key={c.id}
                          onClick={() => handleSelectClaim(c)}
                          className={`p-3 cursor-pointer transition-colors border-l-4 ${
                            active
                              ? "bg-blue-50/80 border-blue-600 shadow-2xs"
                              : "border-transparent hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-[13px] text-slate-900 truncate" title={c.patientName}>
                              {c.patientName}
                            </span>
                            <span
                              className="text-[9.5px] font-bold uppercase px-1.5 py-0.2 shrink-0 rounded-xs"
                              style={{ backgroundColor: tone.tint, color: tone.color }}
                            >
                              {KIND_LABEL[kind]}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                            UMR: {c.patientId} · Inv: {c.invoiceNo}
                          </div>
                          {kind === "ip" && (
                            <div className="text-[10.5px] text-indigo-900 font-medium mt-0.5 flex items-center gap-1">
                              <BedDouble size={11} className="text-indigo-600" />
                              {c.carePathway || "Inpatient Ward"} · Stay {daysSince(c.dateOfService)}d
                            </div>
                          )}
                          {isIns && (
                            <div className="text-[10.5px] text-purple-900 font-medium mt-0.5 flex items-center gap-1">
                              <ShieldCheck size={11} className="text-purple-600" />
                              {c.insuranceProvider} ({claimStage(c)})
                            </div>
                          )}
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-slate-500">
                              Billed: <span className="font-mono text-slate-700">{inr(c.totalAmount)}</span>
                            </span>
                            <span
                              className={`font-mono font-bold text-[12.5px] ${
                                bal > 0 ? "text-amber-900" : "text-emerald-700"
                              }`}
                            >
                              {bal > 0 ? inr(bal) : isBilledToInsurance(c) ? "Insurance" : "Settled"}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* ── RIGHT MAIN PANEL: ACTIVE PATIENT WORKSPACE (8 cols) ── */}
              <div className="lg:col-span-8 space-y-4 min-w-0">
                {!selectedClaim ? (
                  <div className="bg-white border border-[#CBD5E1] p-12 text-center shadow-2xs">
                    <div className="text-4xl mb-3">🧾</div>
                    <h3 className="font-bold text-slate-800 text-base">No Patient Selected</h3>
                    <p className="text-slate-500 text-xs mt-1">
                      Select a patient from the queue on the left or search by UMR/Name above to view and settle billing.
                    </p>
                  </div>
                ) : (
                  (() => {
                    const kind = billKind(selectedClaim.department)
                    // Only admissions can be billed to insurance; OP is patient-pay.
                    const cashless = isCashlessEligible(selectedClaim)
                    const tone = deptTone(selectedClaim.department)
                    const balance = selectedClaim.balanceDue || 0
                    const los = daysSince(selectedClaim.dateOfService)
                    const bedCharges = selectedClaim.items
                      .filter((i) => i.category === "Room / Bed Charges")
                      .reduce((a, i) => a + i.total, 0)
                    const groups = Array.from(
                      selectedClaim.items.reduce((m, it) => {
                        const list = m.get(it.category) ?? []
                        list.push(it)
                        m.set(it.category, list)
                        return m
                      }, new Map<string, InvoiceItem[]>()),
                    )
                    const context: { label: string; value: string }[] =
                      kind === "ip"
                        ? [
                            { label: "Admitted", value: fmtDate(selectedClaim.dateOfService) },
                            { label: "Length of stay", value: `${los} day${los === 1 ? "" : "s"}` },
                            { label: "Bed charges", value: inr(bedCharges) },
                            { label: "Care pathway", value: selectedClaim.carePathway || selectedClaim.department },
                            { label: "Payer", value: selectedClaim.insuranceProvider },
                            { label: "Pre-auth", value: selectedClaim.preAuthCode || "—" },
                          ]
                        : kind === "er"
                          ? [
                              { label: "Encounter", value: selectedClaim.encounterId || selectedClaim.invoiceNo },
                              { label: "Arrived", value: fmtDate(selectedClaim.dateOfService) },
                              { label: "Care pathway", value: selectedClaim.carePathway || "Emergency" },
                              { label: "Payer", value: selectedClaim.insuranceProvider },
                              { label: "Pre-auth", value: selectedClaim.preAuthCode || "—" },
                              { label: "Attending", value: selectedClaim.attendingDoctor || "—" },
                            ]
                          : [
                              { label: "Consultant", value: selectedClaim.attendingDoctor || "—" },
                              { label: "Visit date", value: fmtDate(selectedClaim.dateOfService) },
                              { label: "Services", value: String(selectedClaim.items.length) },
                              { label: "Payer", value: selectedClaim.insuranceProvider },
                            ]
                    const quick: { label: string; amount: number }[] =
                      kind === "ip"
                        ? [
                            { label: "Advance 50%", amount: Math.ceil(balance / 2) },
                            { label: "Final settlement", amount: balance },
                          ]
                        : kind === "er"
                          ? [
                              { label: "Emergency deposit", amount: Math.min(balance, 2000) },
                              { label: "Full settlement", amount: balance },
                            ]
                          : [{ label: "Full amount", amount: balance }]
                    const quickAmounts = quick.filter(
                      (q, i) => i === quick.length - 1 || (q.amount > 0 && q.amount < balance),
                    )

                    return (
                      <>
                        {/* Top Bar for Selected Patient Workspace */}
                        <div className="bg-white border border-[#CBD5E1] p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                          <div className="text-[12.5px] font-medium text-slate-600 truncate">
                            Currently Billing: <strong className="text-slate-900 font-bold">{selectedClaim.patientName}</strong> ({selectedClaim.patientId}) · Invoice <span className="font-mono text-blue-700 font-bold">{selectedClaim.invoiceNo}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedClaimId(null)}
                            className="px-3 py-1 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-700 text-[11.5px] font-bold rounded-xs transition-colors cursor-pointer shrink-0"
                          >
                            Deselect Patient
                          </button>
                        </div>
                      {/* Patient + balance */}
                      <section className="bg-white border border-[#CBD5E1] shadow-2xs">
                        <div className="px-5 py-4 flex flex-wrap items-start gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="text-[16px] font-bold text-[#0F172A]">
                                {selectedClaim.patientName}
                              </h2>
                              <span className="font-mono text-[11px] text-[#475569] bg-[#F1F5F9] px-1.5 py-0.5">
                                {selectedClaim.patientId}
                              </span>
                              <span
                                className="text-[10px] font-bold uppercase px-1.5 py-0.5"
                                style={{ backgroundColor: tone.tint, color: tone.color }}
                              >
                                {KIND_LABEL[kind]}
                              </span>
                            </div>
                            <div className="text-[12px] text-[#64748B] mt-1">
                              {selectedClaim.age}y · {selectedClaim.gender} ·{" "}
                              {selectedClaim.phone || "—"} · Invoice{" "}
                              <span className="font-mono">{selectedClaim.invoiceNo}</span>
                            </div>
                          </div>
                          <div className="ml-auto text-right flex items-center gap-3">
                            <div>
                              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                                {balance > 0
                                  ? "Balance due"
                                  : isBilledToInsurance(selectedClaim)
                                    ? "Billed to insurance"
                                    : "Settled"}
                              </div>
                              <div
                                className="font-mono text-[24px] font-bold leading-none mt-1"
                                style={{ color: balance > 0 ? "#78350F" : "#15803D" }}
                              >
                                {inr(balance)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptData({
                                  claim: selectedClaim,
                                  payment:
                                    selectedClaim.payments && selectedClaim.payments.length > 0
                                      ? selectedClaim.payments[selectedClaim.payments.length - 1]
                                      : null,
                                })
                                setShowReceiptModal(true)
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-[12px] font-bold rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5 shrink-0"
                              title="Print Tax Invoice / Receipt Slip"
                            >
                              <Printer size={14} /> Print Bill
                            </button>
                            <SendToPatientButton
                              label="Send to patient"
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5 shrink-0 shadow-xs"
                              kind="bill"
                              patient={{
                                name: selectedClaim.patientName,
                                phone: selectedClaim.phone,
                                email: selectedClaim.email,
                                id: selectedClaim.patientId,
                              }}
                              vars={billMessageVars(selectedClaim)}
                              buildDocument={() =>
                                buildBillDocument(
                                  selectedClaim,
                                  selectedClaim.payments && selectedClaim.payments.length > 0
                                    ? selectedClaim.payments[selectedClaim.payments.length - 1]
                                    : null,
                                )
                              }
                            />
                          </div>
                        </div>

                        {/* Category context */}
                        <div
                          className={`grid grid-cols-2 sm:grid-cols-3 ${
                            context.length > 4 ? "lg:grid-cols-6" : "lg:grid-cols-4"
                          } gap-px bg-[#E2E8F0] border-t border-[#E2E8F0]`}
                        >
                          {context.map((c) => (
                            <div key={c.label} className="bg-slate-50 px-4 py-2.5 min-w-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                                {c.label}
                              </div>
                              <div
                                className="text-[12.5px] font-semibold text-[#0F172A] truncate mt-0.5"
                                title={c.value}
                              >
                                {c.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Once billed to insurance, the counter only watches the
                          claim; the Insurance department works it. */}
                      {isBilledToInsurance(selectedClaim) && (
                        <div>
                          <ClaimPanel claim={selectedClaim} readOnly />
                          <section className="bg-white border border-t-0 border-[#CBD5E1] shadow-2xs">
                            <BillToInsurance
                              claim={selectedClaim}
                              onDone={(m) => showToast(m, "success")}
                              onError={(m) => showToast(m, "error")}
                            />
                          </section>
                        </div>
                      )}

                      {/* Charges, grouped by category */}
                      <section className="bg-white border border-[#CBD5E1] shadow-2xs">
                        <PanelTitle
                          title={kind === "ip" ? "Running bill" : "Charges"}
                          count={`${selectedClaim.items.length} items`}
                        />
                        <div className="overflow-x-auto">
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 border-b border-[#E2E8F0] bg-white">
                                <th className="text-left font-bold px-5 py-2">Service</th>
                                <th className="text-left font-bold px-2 py-2">Code</th>
                                <th className="text-right font-bold px-2 py-2">Qty</th>
                                <th className="text-right font-bold px-2 py-2">Rate</th>
                                <th className="text-right font-bold px-2 py-2">Amount</th>
                                {cashless && <th className="text-right font-bold px-2 py-2">Insurance</th>}
                                <th className="text-right font-bold px-5 py-2">Patient pays</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groups.map(([cat, items]) => (
                                <React.Fragment key={cat}>
                                  <tr className="bg-[#F8FAFC]">
                                    <td
                                      colSpan={5}
                                      className="px-5 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#475569]"
                                    >
                                      {cat}
                                    </td>
                                    {cashless && (
                                      <td className="px-2 py-1.5 text-right font-mono text-[11px] font-semibold text-blue-800">
                                        {inr(items.reduce((a, i) => a + (i.insuranceCovered || 0), 0))}
                                      </td>
                                    )}
                                    <td className="px-5 py-1.5 text-right font-mono text-[11px] font-semibold text-[#475569]">
                                      {inr(items.reduce((a, i) => a + i.patientPayable, 0))}
                                    </td>
                                  </tr>
                                  {items.map((item, idx) => (
                                    <tr
                                      key={item.id || `${cat}-${idx}`}
                                      className="border-b border-[#F1F5F9] last:border-0"
                                    >
                                      <td className="px-5 py-2 text-[#0F172A]">{item.description}</td>
                                      <td className="px-2 py-2 font-mono text-[11px] text-[#94A3B8]">{item.cptCode}</td>
                                      <td className="px-2 py-2 text-right font-mono text-[#475569]">{item.quantity}</td>
                                      <td className="px-2 py-2 text-right font-mono text-[#475569]">{inr(item.unitPrice)}</td>
                                      <td className="px-2 py-2 text-right font-mono text-[#0F172A]">{inr(item.total)}</td>
                                      {cashless && (
                                        <td className="px-2 py-2 text-right font-mono text-blue-800">
                                          {item.insuranceCovered ? inr(item.insuranceCovered) : "—"}
                                        </td>
                                      )}
                                      <td className="px-5 py-2 text-right font-mono font-semibold text-[#0F172A]">
                                        {inr(item.patientPayable)}
                                      </td>
                                    </tr>
                                  ))}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div
                          className={`grid grid-cols-2 ${cashless ? "sm:grid-cols-4" : "sm:grid-cols-3"} border-t border-[#E2E8F0] bg-slate-50/60`}
                        >
                          {[
                            { l: "Gross total", v: selectedClaim.totalAmount, c: "#0F172A" },
                            ...(cashless
                              ? [{ l: "Insurance covers", v: selectedClaim.insurancePortion || 0, c: "#1B4FD8" }]
                              : []),
                            { l: kind === "ip" ? "Advances paid" : "Paid to date", v: selectedClaim.amountPaid || 0, c: "#16A34A" },
                            { l: "Balance due", v: balance, c: balance > 0 ? "#78350F" : "#15803D" },
                          ].map((x) => (
                            <div key={x.l} className="px-5 py-3 border-r border-[#EDF1F7] last:border-r-0">
                              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                                {x.l}
                              </div>
                              <div className="font-mono text-[15px] font-bold mt-0.5" style={{ color: x.c }}>
                                {inr(x.v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Settle: the patient pays, or the bill goes to insurance.
                          After the hand-over only the co-pay is left, paid normally. */}
                      {balance > 0 && cashless && !isBilledToInsurance(selectedClaim) && (
                        <div className="bg-white border border-[#CBD5E1] shadow-2xs p-1.5 grid grid-cols-2 gap-1.5">
                          {(
                            [
                              ["patient", "Patient pays", "Cash, UPI, card or split"],
                              ["insurance", "Bill to insurance", "Cashless — set insurance vs co-pay"],
                            ] as const
                          ).map(([id, label, hint]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setPayTarget(id)}
                              className={`px-4 py-2.5 text-left border cursor-pointer transition-colors ${
                                payTarget === id
                                  ? "bg-blue-600 border-blue-700 text-white"
                                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              <div className="text-[13px] font-bold flex items-center gap-2">
                                {id === "insurance" ? <ShieldCheck size={15} /> : <Banknote size={15} />}
                                {label}
                              </div>
                              <div className={`text-[11px] ${payTarget === id ? "text-blue-100" : "text-slate-500"}`}>
                                {hint}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {balance > 0 && cashless && payTarget === "insurance" && !isBilledToInsurance(selectedClaim) ? (
                        <section className="bg-white border border-[#CBD5E1] shadow-2xs">
                          <PanelTitle title="Bill to insurance" />
                          <BillToInsurance
                            claim={selectedClaim}
                            onDone={(m) => {
                              showToast(m, "success")
                              setPayTarget("patient")
                            }}
                            onError={(m) => showToast(m, "error")}
                          />
                        </section>
                      ) : balance > 0 ? (
                        <form
                          onSubmit={handleInitiatePayment}
                          className="bg-white border border-[#CBD5E1] shadow-2xs"
                        >
                          <PanelTitle
                            title={
                              isBilledToInsurance(selectedClaim)
                                ? "Collect patient co-pay"
                                : "Collect payment"
                            }
                            actions={
                            <div className="flex flex-wrap gap-1.5">
                              {quickAmounts.map((q) => (
                                <button
                                  key={q.label}
                                  type="button"
                                  onClick={() => {
                                    setPayAmount(q.amount)
                                    setTenderedCash(q.amount)
                                    setSplitCashAmount(Math.floor(q.amount / 2))
                                    setSplitDigitalAmount(Math.ceil(q.amount / 2))
                                  }}
                                  className={`px-2.5 py-1 text-[11px] font-bold border cursor-pointer transition-colors ${
                                    payAmount === q.amount
                                      ? "bg-blue-600 border-blue-700 text-white"
                                      : "bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100"
                                  }`}
                                >
                                  {q.label} · {inr(q.amount)}
                                </button>
                              ))}
                            </div>
                            }
                          />

                          <div className="p-5 space-y-4">
                            <div>
                              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
                                Payment method
                              </div>
                              <div className="grid grid-cols-3 lg:grid-cols-5 gap-2">
                                {PAY_MODES.map((mode) => {
                                  const active = payMode === mode.id && !isSplitPay
                                  return (
                                    <button
                                      key={mode.id}
                                      type="button"
                                      onClick={() => {
                                        setPayMode(mode.id)
                                        setIsSplitPay(false)
                                      }}
                                      className={`px-2 py-2.5 border text-center cursor-pointer transition-colors ${
                                        active
                                          ? "bg-blue-50 border-blue-600 text-blue-800 ring-1 ring-blue-600"
                                          : "bg-white border-[#CBD5E1] text-slate-700 hover:bg-slate-50"
                                      }`}
                                    >
                                      <mode.Icon size={16} className="mx-auto" />
                                      <div className="text-[11px] font-semibold mt-1">
                                        {mode.label}
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                              <label className="mt-2.5 inline-flex items-center gap-2 text-[12px] text-[#475569] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isSplitPay}
                                  onChange={(e) => setIsSplitPay(e.target.checked)}
                                  className="accent-blue-600"
                                />
                                Split between cash and UPI
                              </label>
                            </div>

                            {isSplitPay ? (
                              <div className="grid grid-cols-2 gap-3 p-3 bg-[#F8FAFC] border border-[#E2E8F0]">
                                {(
                                  [
                                    ["Cash", splitCashAmount, (v: number) => {
                                      setSplitCashAmount(v)
                                      setSplitDigitalAmount(Math.max(0, payAmount - v))
                                    }],
                                    ["UPI / Digital", splitDigitalAmount, (v: number) => {
                                      setSplitDigitalAmount(v)
                                      setSplitCashAmount(Math.max(0, payAmount - v))
                                    }],
                                  ] as const
                                ).map(([label, value, set]) => (
                                  <label key={label} className="block">
                                    <span className="block text-[11px] font-semibold text-[#475569] mb-1">
                                      {label}
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={Number.isFinite(value) ? value : ""}
                                      onChange={(e) => set(Math.max(0, Number(e.target.value) || 0))}
                                      className={fieldCls}
                                    />
                                  </label>
                                ))}
                              </div>
                            ) : payMode === "Cash" ? (
                              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] space-y-2.5">
                                <div className="grid grid-cols-2 gap-3">
                                  <label className="block">
                                    <span className="block text-[11px] font-semibold text-[#475569] mb-1">
                                      Cash tendered
                                    </span>
                                    <input
                                      type="number"
                                      min={0}
                                      value={Number.isFinite(tenderedCash) ? tenderedCash : ""}
                                      onChange={(e) => setTenderedCash(Math.max(0, Number(e.target.value) || 0))}
                                      className={fieldCls}
                                    />
                                  </label>
                                  <div>
                                    <span className="block text-[11px] font-semibold text-[#475569] mb-1">
                                      Change to return
                                    </span>
                                    <div className="px-3 py-2 bg-white border border-[#E2E8F0] font-mono text-[14px] font-bold text-[#16A34A]">
                                      {inr(Math.max(0, (Number(tenderedCash) || 0) - payAmount))}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10.5px] text-[#94A3B8]">Tendered:</span>
                                  {Array.from(new Set([payAmount, 500, 1000, 2000, 5000]))
                                    .filter((a) => a > 0)
                                    .map((amt) => (
                                      <button
                                        key={amt}
                                        type="button"
                                        onClick={() => setTenderedCash(amt)}
                                        className="px-2 py-0.5 bg-white border border-[#CBD5E1] font-mono text-[11px] text-[#334155] hover:border-[#0F172A] cursor-pointer"
                                      >
                                        {inr(amt)}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            ) : payMode === "UPI / Digital" ? (
                              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-4">
                                <img
                                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=upi://pay?pa=hospital.cashier@hdfcbank&pn=CityCentralHospital&am=${payAmount}&cu=INR`}
                                  alt="UPI QR code for this amount"
                                  className="w-20 h-20 bg-white border border-[#E2E8F0] p-1 shrink-0"
                                />
                                <div className="text-[12px] text-[#475569]">
                                  <div className="font-semibold text-[#0F172A]">
                                    Scan to pay {inr(payAmount)}
                                  </div>
                                  <div className="font-mono text-[11.5px] mt-0.5">
                                    hospital.cashier@hdfcbank
                                  </div>
                                  <div className="text-[11px] text-[#94A3B8] mt-0.5">
                                    Any UPI app — BHIM, GPay, PhonePe, Paytm.
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="block">
                                <span className="block text-[11px] font-semibold text-[#475569] mb-1">
                                  Amount to collect
                                </span>
                                <input
                                  type="number"
                                  required
                                  min={1}
                                  max={balance}
                                  value={Number.isFinite(payAmount) ? payAmount : ""}
                                  onChange={(e) =>
                                    setPayAmount(Math.min(balance, Math.max(0, Number(e.target.value) || 0)))
                                  }
                                  className={`${fieldCls} text-[15px] font-bold`}
                                />
                              </label>
                              <label className="block">
                                <span className="block text-[11px] font-semibold text-[#475569] mb-1">
                                  Transaction reference
                                </span>
                                <input
                                  type="text"
                                  value={transactionRef}
                                  onChange={(e) => setTransactionRef(e.target.value)}
                                  placeholder="UPI ref / card approval code"
                                  className={fieldCls}
                                />
                              </label>
                            </div>
                            <label className="block">
                              <span className="block text-[11px] font-semibold text-[#475569] mb-1">
                                Remarks (optional)
                              </span>
                              <input
                                type="text"
                                value={cashierNotes}
                                onChange={(e) => setCashierNotes(e.target.value)}
                                placeholder={
                                  kind === "ip"
                                    ? "e.g. Advance against running bill"
                                    : kind === "er"
                                      ? "e.g. Deposit collected after stabilisation"
                                      : "e.g. Settled at OP counter"
                                }
                                className={fieldBase}
                              />
                            </label>

                            <button
                              type="submit"
                              disabled={payAmount <= 0}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white text-[14px] font-bold cursor-pointer transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Collect {inr(payAmount)}
                              {payAmount < balance && (
                                <span className="font-normal opacity-80">
                                  {" "}
                                  · {inr(balance - payAmount)} stays due
                                </span>
                              )}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <section className="bg-white border border-[#CBD5E1] shadow-2xs p-6 space-y-4">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 size={28} className="text-[#16A34A] shrink-0" />
                            <div className="min-w-0">
                              <h3 className="text-[14px] font-bold text-[#0F172A]">
                                {isBilledToInsurance(selectedClaim)
                                  ? "Billed to insurance — nothing to collect"
                                  : "Fully settled"}
                              </h3>
                              <p className="text-[12px] text-[#64748B]">
                                {isBilledToInsurance(selectedClaim)
                                  ? `${selectedClaim.insuranceProvider} pays this bill; the patient can be cleared for`
                                  : "No balance remains; financial clearance is granted for this"}{" "}
                                {kind === "ip" ? "discharge" : kind === "er" ? "the ER visit" : "the visit"}.
                              </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReceiptData({
                                    claim: selectedClaim,
                                    payment:
                                      selectedClaim.payments && selectedClaim.payments.length > 0
                                        ? selectedClaim.payments[selectedClaim.payments.length - 1]
                                        : null,
                                  })
                                  setShowReceiptModal(true)
                                }}
                                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold rounded-sm cursor-pointer inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                              >
                                <Printer size={15} /> Print Official Bill / Slip
                              </button>
                              <SendToPatientButton
                                label="Send to patient"
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold rounded-sm cursor-pointer inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                                kind="bill"
                                patient={{
                                  name: selectedClaim.patientName,
                                  phone: selectedClaim.phone,
                                  email: selectedClaim.email,
                                  id: selectedClaim.patientId,
                                }}
                                vars={billMessageVars(selectedClaim)}
                                buildDocument={() =>
                                  buildBillDocument(
                                    selectedClaim,
                                    selectedClaim.payments && selectedClaim.payments.length > 0
                                      ? selectedClaim.payments[selectedClaim.payments.length - 1]
                                      : null,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </section>
                      )}
                    </>
                  )
                })())}
              </div>
            </div>
          </div>
        )}

        {activeTab === "unified_bill" && <UnifiedBillView />}
      </main>

      {/* =========================================================================
          MODAL: OFFICIAL PAYMENT RECEIPT / TAX INVOICE SLIP (Standardized Reference)
         ========================================================================= */}
      {showReceiptModal && receiptData && (
        <HospitalReceiptModal
          claim={receiptData.claim}
          payment={receiptData.payment}
          onClose={() => setShowReceiptModal(false)}
        />
      )}

      {/* =========================================================================
          MODAL: PAYMENT CONFIRMATION DIALOG
         ========================================================================= */}
      {showConfirmPayModal && selectedClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="bg-white border-b border-[#E2E8F0] text-slate-900 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 bg-blue-600 text-white flex items-center justify-center">
                  <Receipt size={15} />
                </span>
                <h3 className="font-bold text-sm">
                  Confirm payment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmPayModal(false)}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Patient & Invoice Info Card */}
              <div className="bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Patient:</span>
                  <span className="font-bold text-slate-900 text-sm">
                    {selectedClaim.patientName}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">MRN / UMR:</span>
                  <span className="font-mono font-bold text-slate-700">
                    {selectedClaim.mrn || selectedClaim.patientId}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">
                    Invoice No:
                  </span>
                  <span className="font-mono font-bold text-blue-700">
                    {selectedClaim.invoiceNo}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">
                    Department:
                  </span>
                  <span className="font-semibold text-slate-700">
                    {selectedClaim.department}
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="bg-emerald-50/60 border border-emerald-200 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-900 font-bold">
                    Payment Amount:
                  </span>
                  <span className="font-mono font-bold text-emerald-800 text-base">
                    ₹{payAmount.toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-medium">
                    Payment Mode:
                  </span>
                  <span className="font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                    {isSplitPay ? "Split (Cash + Digital)" : payMode}
                  </span>
                </div>
                {payMode === "Cash" && !isSplitPay && (
                  <div className="flex justify-between items-center text-[11px] pt-1 border-t border-emerald-100">
                    <span className="text-slate-500">
                      Tendered: ₹{tenderedCash.toLocaleString("en-IN")}
                    </span>
                    <span className="text-emerald-700 font-bold">
                      Change Due: ₹
                      {Math.max(0, tenderedCash - payAmount).toLocaleString(
                        "en-IN",
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Diagnostic Orders Alert if applicable */}
              {(() => {
                const cs = BillingDatabase.getDepartmentClearanceStatus(
                  selectedClaim.patientName,
                  selectedClaim,
                )
                if (cs.hasLabOrders || cs.hasRadStudies) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2">
                      <span className="text-base text-amber-600">🔬</span>
                      <div>
                        <div className="font-bold text-amber-950 text-xs">
                          Diagnostic Clearance Included
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5">
                          {cs.hasLabOrders &&
                            `• ${cs.labTestNames.length} Lab Test(s) `}
                          {cs.hasRadStudies &&
                            `• ${cs.radStudyNames.length} Radiology Study `}
                          will be unlocked. You will be prompted to send the
                          cleared orders to departments upon confirming.
                        </p>
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmPayModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeConfirmedPayment}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>✓</span> Confirm &amp; Pay ₹
                  {payAmount.toLocaleString("en-IN")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: POST-PAYMENT DIAGNOSTIC CLEARANCE TRANSMISSION
         ========================================================================= */}
      {postPayClearanceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white shadow-xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="bg-white border-b border-[#E2E8F0] text-slate-900 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ✓
                </span>
                <div>
                  <h3 className="font-bold text-sm">Send Orders to Laboratory / Radiology?</h3>
                  <p className="text-[11px] text-slate-500">
                    Payment of ₹{postPayClearanceModal.payment.amount.toLocaleString("en-IN")} received • Receipt #{postPayClearanceModal.payment.receiptNo} • Billing Dept Action
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  showToast("Diagnostic transmission skipped. Orders remain pending clearance.", "info")
                  setReceiptData({ claim: postPayClearanceModal.claim, payment: postPayClearanceModal.payment })
                  setPostPayClearanceModal(null)
                  setShowReceiptModal(true)
                }}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
                title="Close & View Receipt"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
                <div>
                  <span className="text-slate-500 font-medium">Patient:</span>{" "}
                  <strong className="text-slate-900 text-sm">
                    {postPayClearanceModal.claim.patientName}
                  </strong>{" "}
                  <span className="text-slate-500 font-mono">
                    (
                    {postPayClearanceModal.claim.mrn ||
                      postPayClearanceModal.claim.patientId}
                    )
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-800 font-bold font-mono text-sm">
                    ₹
                    {postPayClearanceModal.payment.amount.toLocaleString(
                      "en-IN",
                    )}{" "}
                    PAID
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 text-slate-700 font-medium leading-relaxed">
                <p className="font-bold text-blue-900 mb-0.5">Diagnostic Tests Prescribed</p>
                The payment has been confirmed by Central Billing. Would you like to send these diagnostic test orders to the Laboratory and/or Radiology departments now so they appear on their worklists?
              </div>

              {/* Department Clearance Cards */}
              <div className="space-y-2.5">
                {(() => {
                  const cs = BillingDatabase.getDepartmentClearanceStatus(
                    postPayClearanceModal.claim.patientName,
                    postPayClearanceModal.claim,
                  )
                  const isLabSent =
                    dispatchedClearances[
                      `${postPayClearanceModal.claim.patientName}_Laboratory`
                    ] || cs.labPendingCount === 0
                  const isRadSent =
                    dispatchedClearances[
                      `${postPayClearanceModal.claim.patientName}_Radiology`
                    ] || cs.radPendingCount === 0

                  return (
                    <>
                      {cs.hasLabOrders && (
                        <div className="p-3 bg-white border border-teal-200 flex items-center justify-between gap-3 shadow-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0 text-teal-700 font-bold text-base">
                              🧪
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-xs">
                                Laboratory Department
                              </div>
                              <div className="text-[11px] text-teal-800 font-semibold truncate">
                                Tests: {cs.labTestNames.join(", ") || "Standard Lab Panel"}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isLabSent ? (
                              <span className="px-3 py-1.5 bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center gap-1">
                                ✓ Sent to Lab
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDispatchClearance(
                                    postPayClearanceModal.claim.patientName,
                                    "Laboratory",
                                    postPayClearanceModal.payment.receiptNo,
                                    cs.labTestNames.join(" + "),
                                  )
                                }
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                              >
                                <span>📤</span> Send to Lab
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {cs.hasRadStudies && (
                        <div className="p-3 bg-white border border-indigo-200 flex items-center justify-between gap-3 shadow-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0 text-indigo-700 font-bold text-base">
                              🩻
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-xs">
                                Radiology &amp; Imaging
                              </div>
                              <div className="text-[11px] text-indigo-800 font-semibold truncate">
                                Studies: {cs.radStudyNames.join(", ") || "Imaging Studies"}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isRadSent ? (
                              <span className="px-3 py-1.5 bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold text-xs flex items-center gap-1">
                                ✓ Sent to Radiology
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDispatchClearance(
                                    postPayClearanceModal.claim.patientName,
                                    "Radiology",
                                    postPayClearanceModal.payment.receiptNo,
                                    cs.radStudyNames.join(" + "),
                                  )
                                }
                                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                              >
                                <span>📤</span> Send to Radiology
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Modal Footer Actions: Prominent Yes Send / No Skip */}
              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    showToast("Diagnostic orders kept on hold. Showing payment receipt.", "info")
                    setReceiptData({
                      claim: postPayClearanceModal.claim,
                      payment: postPayClearanceModal.payment,
                    })
                    setPostPayClearanceModal(null)
                    setShowReceiptModal(true)
                  }}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer text-center transition-colors"
                >
                  ✕ No, Skip for Now
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const cs = BillingDatabase.getDepartmentClearanceStatus(
                        postPayClearanceModal.claim.patientName,
                        postPayClearanceModal.claim
                      );
                      if (cs.hasLabOrders) {
                        handleDispatchClearance(
                          postPayClearanceModal.claim.patientName,
                          "Laboratory",
                          postPayClearanceModal.payment.receiptNo,
                          cs.labTestNames.join(" + ")
                        );
                      }
                      if (cs.hasRadStudies) {
                        handleDispatchClearance(
                          postPayClearanceModal.claim.patientName,
                          "Radiology",
                          postPayClearanceModal.payment.receiptNo,
                          cs.radStudyNames.join(" + ")
                        );
                      }
                      showToast(
                        `✓ Diagnostic clearance dispatched by Billing Department! Receipt #${postPayClearanceModal.payment.receiptNo}.`,
                        "success"
                      );
                      setReceiptData({
                        claim: postPayClearanceModal.claim,
                        payment: postPayClearanceModal.payment,
                      })
                      setPostPayClearanceModal(null)
                      setShowReceiptModal(true)
                    }}
                    className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-bold text-xs cursor-pointer shadow-md flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>✓</span>
                    {(() => {
                      const cs = BillingDatabase.getDepartmentClearanceStatus(
                        postPayClearanceModal.claim.patientName,
                        postPayClearanceModal.claim
                      );
                      if (cs.hasLabOrders && cs.hasRadStudies) return "Yes, Send to Lab & Radiology";
                      if (cs.hasLabOrders) return "Yes, Send to Laboratory";
                      return "Yes, Send to Radiology";
                    })()}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: QUICK WALK-IN BILL CREATION
         ========================================================================= */}
      {showQuickBillModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="bg-white border-b border-[#E2E8F0] text-slate-900 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 bg-blue-600 text-white flex items-center justify-center">
                  <Plus size={15} />
                </span>
                <h3 className="font-bold text-sm">Walk-in bill</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickBillModal(false)}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleCreateQuickBill}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Patient Full Name:
                </label>
                <input
                  type="text"
                  required
                  value={quickPatientName}
                  onChange={(e) => setQuickPatientName(e.target.value)}
                  placeholder="e.g. Rahul Verma"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    UMR Number (Optional):
                  </label>
                  <input
                    type="text"
                    value={quickUmr}
                    onChange={(e) => setQuickUmr(e.target.value)}
                    placeholder="Auto-generated if blank"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Department:
                  </label>
                  <select
                    value={quickDept}
                    onChange={(e) => setQuickDept(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 text-xs font-semibold"
                  >
                    <option value="Outpatient">Outpatient</option>
                    <option value="Emergency">Emergency</option>
                    <option value="Inpatient">Inpatient Wards</option>
                    <option value="ICU">ICU</option>
                    <option value="Surgery">Surgery &amp; OT</option>
                    <option value="Laboratory">Laboratory</option>
                    <option value="Radiology">Radiology &amp; Imaging</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Service / Consultation:
                </label>
                <input
                  type="text"
                  required
                  value={quickService}
                  onChange={(e) => setQuickService(e.target.value)}
                  placeholder="e.g. General Physician Consultation, Blood Test"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Bill Amount (₹):
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={
                    quickAmount === undefined ||
                    quickAmount === null ||
                    (quickAmount as any) === ""
                      ? ""
                      : quickAmount
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuickAmount(val === "" ? ("" as any) : Number(val));
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 font-mono font-bold text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickBillModal(false)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                >
                  Create &amp; Settle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   UNIFIED PATIENT BILL -- real consolidated bill across every department
   that has invoiced this patient, backed by /api/billing/umr-ledger/<id>
   (hospital-backend/backend/modules/billing/routes.py). This is real data,
   not the local BillingDatabase mock the rest of this file still reads from.
   ========================================================================= */
interface RealInvoiceItem {
  id: number
  description: string
  category: string | null
  quantity: number
  unit_price: number
  total: number
  insurance_covered: number
  patient_payable: number
}

interface RealInvoice {
  id: number
  invoice_no: string
  module: string
  total_amount: number
  paid_amount: number
  due_amount: number
  payment_status: string
  created_at: string
  items: RealInvoiceItem[]
}

interface UmrLedger {
  patient_id: string
  invoices: RealInvoice[]
  totals: {
    total_amount: number
    paid_amount: number
    due_amount: number
    invoice_count: number
  }
}

function UnifiedBillView() {
  const [patientId, setPatientId] = useState("")
  const [ledger, setLedger] = useState<UmrLedger | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = async (id: string) => {
    if (!id.trim()) return
    setLoading(true)
    setError(null)
    // Local ledger (every bill raised in this app), shaped like the API's.
    const fromLocal = (): UmrLedger | null => {
      const l = BillingDatabase.getUmrLedger(id.trim())
      if (!l || !l.invoices.length) return null
      const invoices: RealInvoice[] = l.invoices.map((c, i) => ({
        id: i + 1,
        invoice_no: c.invoiceNo,
        module: c.department,
        total_amount: c.totalAmount,
        paid_amount: c.amountPaid || 0,
        due_amount: c.balanceDue || 0,
        payment_status: (c.balanceDue || 0) <= 0 ? "paid" : (c.amountPaid || 0) > 0 ? "partial" : "unpaid",
        created_at: c.createdAt || c.dateOfService,
        items: c.items.map((it, j) => ({
          id: j + 1,
          description: it.description,
          category: it.category,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          total: it.total,
          insurance_covered: it.insuranceCovered || 0,
          patient_payable: it.patientPayable,
        })),
      }))
      return {
        patient_id: l.umr,
        invoices,
        totals: {
          total_amount: invoices.reduce((a, x) => a + x.total_amount, 0),
          paid_amount: invoices.reduce((a, x) => a + x.paid_amount, 0),
          due_amount: invoices.reduce((a, x) => a + x.due_amount, 0),
          invoice_count: invoices.length,
        },
      }
    }
    try {
      const data = await apiFetch<UmrLedger>(
        `/api/billing/umr-ledger/${encodeURIComponent(id.trim())}`,
      )
      // The backend may not know bills raised in this browser; use the
      // local ledger when it has nothing.
      const best = data?.invoices?.length ? data : fromLocal()
      setLedger(best)
      if (!best?.invoices?.length) setError("No invoices found for this patient ID.")
    } catch {
      // Backend unreachable: the app works from its own records.
      const local = fromLocal()
      setLedger(local)
      if (!local) setError("No invoices found for this patient ID.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="bg-white border border-[#E2E8F0] p-4 shadow-xs">
        {/* The page header names this view; the card only needs the lookup. */}
        <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B] mb-2">
          Find patient
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Patient ID (e.g. PAT-1042 or ER-PAT-1008)"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(patientId)}
            className="flex-1 h-9 px-3 border border-slate-300 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => search(patientId)}
            disabled={loading}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600 font-medium mt-2">{error}</p>}
      </div>

      {ledger && ledger.invoices.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500 font-medium">Total Billed</div>
              <div className="text-lg font-bold text-slate-900 font-mono">
                ₹{ledger.totals.total_amount.toLocaleString("en-IN")}
              </div>
            </div>
            <div className="bg-white border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500 font-medium">Total Paid</div>
              <div className="text-lg font-bold text-emerald-700 font-mono">
                ₹{ledger.totals.paid_amount.toLocaleString("en-IN")}
              </div>
            </div>
            <div className="bg-white border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500 font-medium">Total Due</div>
              <div className="text-lg font-bold text-rose-700 font-mono">
                ₹{ledger.totals.due_amount.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {ledger.invoices.map((inv) => (
              <div key={inv.id} className="bg-white border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900">{inv.module}</span>
                    <span className="text-[11px] text-slate-500 font-mono ml-2">{inv.invoice_no}</span>
                    <span className="text-[11px] text-slate-400 ml-2">
                      {new Date(inv.created_at).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      inv.payment_status === "paid"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : inv.payment_status === "partial"
                        ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {inv.payment_status.toUpperCase()}
                  </span>
                </div>
                {inv.items.length > 0 && (
                  <table className="w-full text-[11px]">
                    <tbody>
                      {inv.items.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-1.5 text-slate-700">{item.description}</td>
                          <td className="px-4 py-1.5 text-slate-400">{item.category || ""}</td>
                          <td className="px-4 py-1.5 text-right font-mono font-semibold text-slate-800">
                            ₹{item.total.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="px-4 py-2 flex items-center justify-end gap-4 text-[11px] font-mono border-t border-slate-100">
                  <span>Total: <strong>₹{inv.total_amount.toLocaleString("en-IN")}</strong></span>
                  <span className="text-emerald-700">Paid: <strong>₹{inv.paid_amount.toLocaleString("en-IN")}</strong></span>
                  <span className="text-rose-700">Due: <strong>₹{inv.due_amount.toLocaleString("en-IN")}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
