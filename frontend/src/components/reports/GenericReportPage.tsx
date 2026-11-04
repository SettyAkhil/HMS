/**
 * Keppler Healthcare Enterprise HMS - Dedicated Specialized Report Page
 * Powering all 12 individual general reports with 100% dynamic, backend/database-driven
 * KPI calculations, synchronized multi-series charts, itemized tables, debounced search,
 * server-side pagination, and full export/print support.
 */

import React, { useState, useEffect, useMemo, useRef } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import {
  Calendar,
  Printer,
  Download,
  Filter,
  RotateCcw,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  X,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Activity,
  Users,
  Stethoscope,
  Bed,
  TestTube,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Pill,
  Building2,
  CreditCard,
  HeartPulse,
  UserPlus,
  Zap,
} from "lucide-react"
import {
  GeneralReportsService,
  DateRangePreset,
  ReportPayload,
  KpiMetric,
} from "../../services/generalReportsDb"
import {
  exportGenericReportCsv,
  exportGenericReportExcel,
  exportGenericReportPdf,
  printGenericReport,
  printPatientClinicalReport,
  downloadPatientClinicalPdf,
  DoctorReportData,
  resolveDoctorReportData,
  printDoctorReport,
  downloadDoctorReportPdf,
} from "../../utils/generalReportsExporter"
import { useLiveClinic } from "../../hooks/useLiveClinic"
import {
  PatientDataPdfModal,
  InReportEncounterModal,
  ActiveFilterChips,
  resolvePatientClinicalRecord,
} from "./PatientReportModals"
import { DoctorReportPdfModal, DoctorReportModal } from "./DoctorReportModals"
import {
  RevenueReceiptModal,
  DamagedStockModal,
  SupplierReturnModal,
  RevenueReceiptData,
  DamagedStockData,
  SupplierReturnData,
  printHtmlDocument,
  downloadPdfWindow,
} from "./FinancialReportModals"
import { PharmacyDatabase } from "../../services/pharmacyDb"
import { apiFetch } from "../../lib/api"

export type ReportType = "reports_patients" | "reports_er" | "reports_inpatient" | "reports_appointments" | "reports_doctors" | "reports_pharmacy" | "reports_laboratory" | "reports_radiology" | "reports_beds" | "reports_admissions" | "reports_discharges" | "reports_staff" | "revenue_reports" | "reports_pharmacy_damaged" | "reports_supplier_returns"

interface GenericReportPageProps {
  reportType: ReportType
  onNavigate?: (module: string) => void
}

interface ReportConfig {
  title: string
  subtitle: string
  tableColumns: { header: string ;key: string }[]
}

const REPORT_CONFIGS: Record<ReportType, ReportConfig> = {
  reports_patients: {
    title: "Patient Reports",
    subtitle:
      "Longitudinal patient registrations, demographics, age brackets and returning patient trends.",
    tableColumns: [
      { header: "UMR", key: "umr" },
      { header: "Patient Name", key: "name" },
      { header: "Age", key: "age" },
      { header: "Gender", key: "gender" },
      { header: "Registration Date", key: "registrationDate" },
      { header: "Patient Type", key: "patientType" },
      { header: "Last Visit", key: "lastVisit" },
      { header: "Department", key: "department" },
      { header: "Status", key: "status" },
    ],
  },
  reports_er: {
    title: "Emergency (ER) Reports",
    subtitle:
      "Emergency department volume, ESI triage severity, trauma bed utilization, and disposition outcomes.",
    tableColumns: [
      { header: "ER Number", key: "erNumber" },
      { header: "Date & Time", key: "dateTime" },
      { header: "UMR", key: "umr" },
      { header: "Patient Name", key: "patientName" },
      { header: "Priority", key: "priority" },
      { header: "Doctor", key: "doctor" },
      { header: "Bed", key: "bed" },
      { header: "Status", key: "status" },
      { header: "Disposition", key: "disposition" },
    ],
  },
  reports_inpatient: {
    title: "IP / Inpatient Reports",
    subtitle:
      "Inpatient census, admissions, ward occupancies, average length of stay (ALOS), and discharges.",
    tableColumns: [
      { header: "Admission Number", key: "admissionNumber" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Ward", key: "ward" },
      { header: "Bed", key: "bed" },
      { header: "Doctor", key: "doctor" },
      { header: "Admission Date", key: "admissionDate" },
      { header: "Discharge Date", key: "dischargeDate" },
      { header: "Status", key: "status" },
    ],
  },
  reports_appointments: {
    title: "Appointment Reports",
    subtitle:
      "Physician appointment scheduling, completion rates, department demand, and no-show statistics.",
    tableColumns: [
      { header: "Appointment ID", key: "appointmentId" },
      { header: "Date & Time", key: "dateTime" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Department", key: "department" },
      { header: "Doctor", key: "doctor" },
      { header: "Appointment Type", key: "appointmentType" },
      { header: "Status", key: "status" },
    ],
  },
  reports_doctors: {
    title: "Doctor Reports",
    subtitle:
      "Physician clinical productivity, outpatient consultations, emergency cases, and workload distribution.",
    tableColumns: [
      { header: "Doctor", key: "doctor" },
      { header: "Department", key: "department" },
      { header: "Qualification", key: "qualification" },
      { header: "OP Visits", key: "opVisits" },
      { header: "ER Cases", key: "erCases" },
      { header: "IP Patients", key: "ipPatients" },
      { header: "Total Consultations", key: "totalConsultations" },
      { header: "Status", key: "status" },
    ],
  },
  reports_pharmacy: {
    title: "Pharmacy Reports",
    subtitle:
      "Prescription fulfillment, medicine consumption, returns, stock reorder alerts, and expiry management.",
    tableColumns: [
      { header: "Prescription ID", key: "prescriptionId" },
      { header: "Date", key: "date" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Doctor", key: "doctor" },
      { header: "Medicines", key: "medicines" },
      { header: "Status", key: "status" },
    ],
  },
  reports_laboratory: {
    title: "Laboratory Reports",
    subtitle:
      "Diagnostic pathology test volume, STAT turnarounds, department orders, and verification statuses.",
    tableColumns: [
      { header: "Lab Order ID", key: "labOrderId" },
      { header: "Date", key: "date" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Doctor", key: "doctor" },
      { header: "Test", key: "test" },
      { header: "Status", key: "status" },
      { header: "Result Status", key: "resultStatus" },
    ],
  },
  reports_radiology: {
    title: "Radiology Reports",
    subtitle:
      "Diagnostic medical imaging, scan modalities (XR, CT, MR, US), reporting throughput, and PACS records.",
    tableColumns: [
      { header: "Order ID", key: "orderId" },
      { header: "Date", key: "date" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Doctor", key: "doctor" },
      { header: "Scan Type", key: "scanType" },
      { header: "Modality", key: "modality" },
      { header: "Status", key: "status" },
      { header: "Report Status", key: "reportStatus" },
    ],
  },
  reports_beds: {
    title: "Bed Reports",
    subtitle:
      "Inpatient bed census, ward occupancies, available beds, and maintenance decontaminations.",
    tableColumns: [
      { header: "Bed Number", key: "bedNumber" },
      { header: "Ward", key: "ward" },
      { header: "Bed Type", key: "bedType" },
      { header: "Patient", key: "patient" },
      { header: "UMR", key: "umr" },
      { header: "Admission Date", key: "admissionDate" },
      { header: "Status", key: "status" },
    ],
  },
  reports_admissions: {
    title: "Admission Reports",
    subtitle:
      "Inpatient admission patterns, emergency vs planned surgeries, ward and departmental intakes.",
    tableColumns: [
      { header: "Admission Number", key: "admissionNumber" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Admission Type", key: "admissionType" },
      { header: "Department", key: "department" },
      { header: "Doctor", key: "doctor" },
      { header: "Ward", key: "ward" },
      { header: "Date", key: "date" },
      { header: "Status", key: "status" },
    ],
  },
  reports_discharges: {
    title: "Discharge Reports",
    subtitle:
      "Inpatient discharges, recovery dispositions, average length of stay (ALOS), and discharge summaries.",
    tableColumns: [
      { header: "Discharge ID", key: "dischargeId" },
      { header: "UMR", key: "umr" },
      { header: "Patient", key: "patient" },
      { header: "Department", key: "department" },
      { header: "Doctor", key: "doctor" },
      { header: "Admission Date", key: "admissionDate" },
      { header: "Discharge Date", key: "dischargeDate" },
      { header: "Length of Stay", key: "lengthOfStay" },
      { header: "Discharge Type", key: "dischargeType" },
      { header: "Status", key: "status" },
    ],
  },
  reports_staff: {
    title: "Staff Reports",
    subtitle:
      "Hospital human resources, clinical roster, physician and nursing staffing distributions.",
    tableColumns: [
      { header: "Employee ID", key: "employeeId" },
      { header: "Employee Name", key: "employeeName" },
      { header: "Role", key: "role" },
      { header: "Department", key: "department" },
      { header: "Joining Date", key: "joiningDate" },
      { header: "Status", key: "status" },
    ],
  },
  revenue_reports: {
    title: "Revenue Reports",
    subtitle:
      "Hospital financial performance, realized collection streams, departmental revenue breakdown, and payment method analytics.",
    tableColumns: [
      { header: "Date", key: "date" },
      { header: "Transaction #", key: "transactionNumber" },
      { header: "Invoice #", key: "invoiceNumber" },
      { header: "UMR", key: "umr" },
      { header: "Patient Name", key: "patientName" },
      { header: "Department", key: "department" },
      { header: "Payment Method", key: "paymentMethod" },
      { header: "Amount", key: "amount" },
      { header: "Status", key: "status" },
    ],
  },
  reports_pharmacy_damaged: {
    title: "Pharmacy Damaged Stock",
    subtitle:
      "Pharmaceutical loss ledger, damaged/expired write-offs, disposal tracking, and financial loss impact.",
    tableColumns: [
      { header: "Date", key: "date" },
      { header: "Adjustment #", key: "adjustmentNumber" },
      { header: "Medicine", key: "medicineName" },
      { header: "Batch", key: "batchNumber" },
      { header: "Category", key: "category" },
      { header: "Reason", key: "reason" },
      { header: "Qty", key: "quantity" },
      { header: "Unit Cost", key: "unitCost" },
      { header: "Loss Value", key: "lossValue" },
      { header: "Location", key: "location" },
      { header: "Status", key: "status" },
    ],
  },
  reports_supplier_returns: {
    title: "Supplier Return Ledger",
    subtitle:
      "Vendor return transactions, debit note accounting, vendor credit tracking, and return status ledger.",
    tableColumns: [
      { header: "Date", key: "date" },
      { header: "Return #", key: "returnNumber" },
      { header: "Debit Note #", key: "debitNoteNumber" },
      { header: "Credit Note", key: "creditNoteId" },
      { header: "Supplier", key: "supplierName" },
      { header: "Medicine", key: "medicineName" },
      { header: "Batch", key: "batchNumber" },
      { header: "Reason", key: "reason" },
      { header: "Qty", key: "quantity" },
      { header: "Return Value", key: "returnAmount" },
      { header: "Status", key: "status" },
    ],
  },
}

const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 Days",
  last30: "Last 30 Days",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  custom: "Custom Date Range",
}

export default function GenericReportPage({
  reportType,
  onNavigate,
}: GenericReportPageProps) {
  const config = REPORT_CONFIGS[reportType] || REPORT_CONFIGS.reports_patients
  const containerRef = useRef<HTMLDivElement>(null);

  // Always scroll to top whenever a new report is opened / switched
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    const mainEl = document.querySelector("main");
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [reportType]);

  // Live clinic revision: automatically re-fetches report data whenever any patient, bed, or order is updated
  const { revision } = useLiveClinic();

  // Filter States
  const [dateRange, setDateRange] = useState<DateRangePreset>("last30")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  const [selectedDept, setSelectedDept] = useState("All")
  const [selectedDoctor, setSelectedDoctor] = useState("All")
  const [selectedStatus, setSelectedStatus] = useState("All")

  const [stagedDept, setStagedDept] = useState("All")
  const [stagedDoctor, setStagedDoctor] = useState("All")
  const [stagedStatus, setStagedStatus] = useState("All")

  // Specialized Financial Filter States
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("All")
  const [stagedPaymentMethod, setStagedPaymentMethod] = useState("All")
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState("All")
  const [stagedPaymentStatus, setStagedPaymentStatus] = useState("All")
  const [selectedSupplier, setSelectedSupplier] = useState("All")
  const [stagedSupplier, setStagedSupplier] = useState("All")
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [stagedCategory, setStagedCategory] = useState("All")
  const [selectedReason, setSelectedReason] = useState("All")
  const [stagedReason, setStagedReason] = useState("All")

  // Financial Modals
  const [revenueModalData, setRevenueModalData] =
    useState<RevenueReceiptData | null>(null)
  const [damagedModalData, setDamagedModalData] =
    useState<DamagedStockData | null>(null)
  const [supplierReturnModalData, setSupplierReturnModalData] =
    useState<SupplierReturnData | null>(null)

  // Search & Pagination
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Export & Modals
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState<any | null>(null)
  const [reportModalItem, setReportModalItem] = useState<any | null>(null)
  const [pdfModalDetails, setPdfModalDetails] = useState<any | null>(null)
  const [doctorModalItem, setDoctorModalItem] = useState<any | null>(null)
  const [doctorPdfData, setDoctorPdfData] = useState<DoctorReportData | null>(
    null,
  )

  // Data, Loading & Error
  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load Report Data via API
  const fetchReportData = async () => {
    setLoading(true)
    setError(null)
    try {
      const cleanKey = reportType.replace(/^reports_/, "")
      const params = new URLSearchParams({
        preset: dateRange,
        page: currentPage.toString(),
        limit: pageSize.toString(),
      })

      if (dateRange === "custom") {
        if (customStart) params.set("from", customStart)
        if (customEnd) params.set("to", customEnd)
      }
      if (selectedDept !== "All") params.set("department", selectedDept)
      if (selectedDoctor !== "All") params.set("doctor", selectedDoctor)
      if (selectedStatus !== "All") params.set("status", selectedStatus)
      if (selectedPaymentMethod !== "All")
        params.set("paymentMethod", selectedPaymentMethod)
      if (selectedPaymentStatus !== "All")
        params.set("paymentStatus", selectedPaymentStatus)
      if (selectedSupplier !== "All") params.set("supplier", selectedSupplier)
      if (selectedCategory !== "All") params.set("category", selectedCategory)
      if (selectedReason !== "All") params.set("reason", selectedReason)
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())

      const res = await apiFetch<ReportPayload>(
        `/api/reports/${cleanKey}?${params.toString()}`,
      )
      setData(res)
    } catch (err: any) {
      setError(err?.message || "Unable to load report data. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReportData()
  }, [
    revision,
    reportType,
    dateRange,
    customStart,
    customEnd,
    selectedDept,
    selectedDoctor,
    selectedStatus,
    selectedPaymentMethod,
    selectedPaymentStatus,
    selectedSupplier,
    selectedCategory,
    selectedReason,
    debouncedSearch,
    currentPage,
    pageSize,
  ])

  const departments = useMemo(() => GeneralReportsService.getDepartments(), [])
  const doctors = useMemo(
    () => GeneralReportsService.getDoctors(stagedDept),
    [stagedDept],
  )
  const pharmacySuppliers = useMemo(() => {
    try {
      return PharmacyDatabase.getSuppliers().map((s) => s.supplierName)
    } catch {
      return []
    }
  }, [])
  const pharmacyCategories = useMemo(() => {
    try {
      return PharmacyDatabase.getCategories().map((c) => c.categoryName)
    } catch {
      return []
    }
  }, [])

  const handleApplyFilters = () => {
    setSelectedDept(stagedDept)
    setSelectedDoctor(stagedDoctor)
    setSelectedStatus(stagedStatus)
    setSelectedPaymentMethod(stagedPaymentMethod)
    setSelectedPaymentStatus(stagedPaymentStatus)
    setSelectedSupplier(stagedSupplier)
    setSelectedCategory(stagedCategory)
    setSelectedReason(stagedReason)
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setStagedDept("All")
    setStagedDoctor("All")
    setStagedStatus("All")
    setSelectedDept("All")
    setSelectedDoctor("All")
    setSelectedStatus("All")
    setStagedPaymentMethod("All")
    setSelectedPaymentMethod("All")
    setStagedPaymentStatus("All")
    setSelectedPaymentStatus("All")
    setStagedSupplier("All")
    setSelectedSupplier("All")
    setStagedCategory("All")
    setSelectedCategory("All")
    setStagedReason("All")
    setSelectedReason("All")
    setDateRange("last30")
    setCustomStart("")
    setCustomEnd("")
    setShowCustomPicker(false)
    setSearchQuery("")
    setCurrentPage(1)
  }

  // Export handlers
  const prepareExportData = () => {
    return {
      reportTitle: config.title,
      dateRangeLabel: DATE_RANGE_LABELS[dateRange],
      departmentFilter: selectedDept,
      doctorFilter: selectedDoctor,
      statusFilter: selectedStatus,
      kpis: data?.kpis || [],
      columns: config.tableColumns,
      records: data?.records || [],
    }
  }

  const handleExportPdf = () => {
    exportGenericReportPdf(prepareExportData())
    setExportMenuOpen(false)
  }

  const handleExportExcel = () => {
    exportGenericReportExcel(prepareExportData())
    setExportMenuOpen(false)
  }

  const handleExportCsv = () => {
    exportGenericReportCsv(prepareExportData())
    setExportMenuOpen(false)
  }

  const handlePrint = () => {
    printGenericReport(prepareExportData())
  }

  // ── Render Charts Specific to Current Report Type ────────────────────────
  const renderVisualizations = () => {
    if (!data || !data.charts) {
      return (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center text-slate-500">
          No chart data available for the selected filters.
        </div>
      )
    }

    const charts = data.charts

    switch (reportType) {
      case "reports_patients": {
        const regTrend = charts.registrationTrend || []
        const deptPts = charts.deptPts || []
        const genderDist = charts.genderDist || []
        const ageDist = charts.ageDist || []

        return (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Registration Trend */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Patient Registration Trend
                </h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  Daily intake of new vs returning patients
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_1`} width="100%" height="100%">
                    <LineChart data={regTrend}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="period"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        domain={[0, (max: number) => Math.max(max, 4)]}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                      />
                      <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                        type="monotone"
                        dataKey="newPatients"
                        name="New Patients"
                        stroke="#1B4FD8"
                        strokeWidth={2.5}
                        dot={{ r: 2.5 }}
                        activeDot={{ r: 4 }}
                      />
                      <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                        type="monotone"
                        dataKey="returning"
                        name="Returning Patients"
                        stroke="#0284C7"
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Department Distribution */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Department-wise Patient Distribution
                </h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  Patient volume across hospital departments
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_2`} width="100%" height="100%">
                    <BarChart data={deptPts}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="department"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        domain={[0, (max: number) => Math.max(max, 4)]}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="count"
                        name="Patients"
                        fill="#1B4FD8"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Demographics: Gender Donut & Age Brackets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Gender Distribution
                </h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  Patient breakdown by gender
                </p>
                <div className="h-72 w-full flex items-center justify-center">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_3`} width="100%" height="100%">
                    <PieChart>
                      <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                        data={genderDist}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={56}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {genderDist.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color || "#1B4FD8"}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Age Demographics
                </h3>
                <p className="text-[11px] text-slate-500 mb-2">
                  Patient volume grouped by age brackets
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_4`} width="100%" height="100%">
                    <BarChart data={ageDist}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="bracket"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        domain={[0, (max: number) => Math.max(max, 4)]}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="count"
                        name="Patients"
                        fill="#0284C7"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )
      }

      case "reports_er": {
        const visitTrend = charts.erVisitTrend || []
        const priorityDist = charts.priorityDist || []
        const dispDist = charts.dispDist || []
        const bedUtil = charts.erBedUtilization || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                ER Visit Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Emergency case arrivals over the period
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_5`} width="100%" height="100%">
                  <LineChart data={visitTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="visits"
                      name="ER Visits"
                      stroke="#DC2626"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Emergency Priority Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Acuity levels across triage categories
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_6`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={priorityDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {priorityDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#DC2626"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                ER Disposition Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Patient discharge and admission outcomes
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_7`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={dispDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {dispDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#1B4FD8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                ER Bed Utilization
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Resuscitation and trauma bay demand
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_8`} width="100%" height="100%">
                  <BarChart data={bedUtil}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="bed"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="utilization"
                      name="Cases Handled"
                      fill="#EA580C"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_inpatient": {
        const admTrend = charts.admissionTrend || []
        const disTrend = charts.dischargeTrend || []
        const wardOcc = charts.wardOccupancy || []
        const deptAdm = charts.deptAdmissions || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Admission Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Daily inpatient admissions
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_9`} width="100%" height="100%">
                  <LineChart data={admTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="admissions"
                      name="Admissions"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Discharge Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Daily patient recovery discharges
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_10`} width="100%" height="100%">
                  <LineChart data={disTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="discharges"
                      name="Discharges"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Ward Occupancy
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Census across inpatient wards and units
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_11`} width="100%" height="100%">
                  <BarChart data={wardOcc}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="ward"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="occupied"
                      name="Occupied Beds"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Admissions
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Admissions partitioned by primary clinical service
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_12`} width="100%" height="100%">
                  <BarChart data={deptAdm}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="admissions"
                      name="Admissions"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_appointments": {
        const trend = charts.appointmentTrend || []
        const docAppts = charts.doctorAppts || []
        const deptAppts = charts.departmentAppts || []
        const statusDist = charts.apptStatusDist || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Appointment Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Daily booking volume over time
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_13`} width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="appointments"
                      name="Appointments"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Doctor-wise Appointments
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Patient bookings by physician
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_14`} width="100%" height="100%">
                  <BarChart data={docAppts.slice(0, 7)}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="doctor"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="appointments"
                      name="Appointments"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Appointments
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Specialty consultation demand
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_15`} width="100%" height="100%">
                  <BarChart data={deptAppts}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="appointments"
                      name="Appointments"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Appointment Status Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Completed, pending, cancelled and no-show shares
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_16`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={statusDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#1B4FD8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_doctors": {
        const docVisits = charts.doctorVisits || []
        const deptDoc = charts.departmentDoctorActivity || []
        const consultTrend = charts.consultationTrend || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Doctor-wise Patient Visits
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Clinical consultation throughput across top physicians
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_17`} width="100%" height="100%">
                  <BarChart data={docVisits}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="doctor"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="visits"
                      name="Consultations"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Consultation Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Aggregate doctor consultations over time
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_18`} width="100%" height="100%">
                  <LineChart data={consultTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="consultations"
                      name="Consultations"
                      stroke="#0284C7"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-3">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Doctor Activity
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Total consultations aggregated by medical specialty
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_19`} width="100%" height="100%">
                  <BarChart data={deptDoc}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="activity"
                      name="Activity Score"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_pharmacy": {
        const rxTrend = charts.prescriptionTrend || []
        const medCons = charts.medicineConsumption || []
        const deptUsage = charts.deptUsage || []
        const rxStatus = charts.rxStatusDist || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Prescription Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Prescription intake over the selected timeframe
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_20`} width="100%" height="100%">
                  <LineChart data={rxTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="prescriptions"
                      name="Prescriptions"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Medicine Consumption
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Top dispensed pharmaceuticals
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_21`} width="100%" height="100%">
                  <BarChart data={medCons}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="medicine"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="consumption"
                      name="Units Dispensed"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Medicine Usage
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Drug utilization by referring clinic
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_22`} width="100%" height="100%">
                  <BarChart data={deptUsage}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="usage"
                      name="Prescriptions"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Prescription Status Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Dispensed, preparing, pending verification shares
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_23`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={rxStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {rxStatus.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#1B4FD8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_laboratory": {
        const labTrend = charts.labOrderTrend || []
        const testVol = charts.testVolume || []
        const deptLab = charts.departmentLabOrders || []
        const resDist = charts.resultStatusDist || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Lab Orders Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Daily diagnostic pathology requests
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_24`} width="100%" height="100%">
                  <LineChart data={labTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="orders"
                      name="Lab Orders"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Test-wise Volume
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Highest volume ordered diagnostic assays
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_25`} width="100%" height="100%">
                  <BarChart data={testVol}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="test"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="volume"
                      name="Tests Run"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Lab Orders
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Test orders originating from clinical services
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_26`} width="100%" height="100%">
                  <BarChart data={deptLab}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="orders"
                      name="Orders"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Result Status Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Verified results vs pending and sample collection
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_27`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={resDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {resDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#10B981"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_radiology": {
        const radTrend = charts.radOrderTrend || []
        const scanDist = charts.scanTypeDist || []
        const modDist = charts.modalityDist || []
        const deptRad = charts.departmentRadOrders || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Radiology Order Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Diagnostic imaging orders over time
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_28`} width="100%" height="100%">
                  <LineChart data={radTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="orders"
                      name="Radiology Scans"
                      stroke="#7C3AED"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Scan Modality Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                X-Ray, CT, MRI, and Ultrasound proportions
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_29`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={modDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {modDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#7C3AED"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Scan Type Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Volume grouped by anatomical examination
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_30`} width="100%" height="100%">
                  <BarChart data={scanDist.slice(0, 6)}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="value"
                      name="Scans"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Radiology Orders
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Imaging requests per clinical department
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_31`} width="100%" height="100%">
                  <BarChart data={deptRad}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="orders"
                      name="Orders"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_beds": {
        const occTrend = charts.bedOccupancyTrend || []
        const wardOcc = charts.wardOccupancy || []
        const bedTypeDist = charts.bedTypeDist || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Bed Occupancy Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Census occupancy percentage over time
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_32`} width="100%" height="100%">
                  <LineChart data={occTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      unit="%"
                      domain={[0, 100]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="occupancyRate"
                      name="Occupancy %"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Bed Type Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                General, semi-private, private and ICU beds
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_33`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={bedTypeDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {bedTypeDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#1B4FD8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-3">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Ward-wise Occupancy Status
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Occupied beds count across individual wards
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_34`} width="100%" height="100%">
                  <BarChart data={wardOcc}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="ward"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="occupied"
                      name="Occupied Beds"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_admissions": {
        const admTrend = charts.admissionTrend || []
        const admTypeDist = charts.admTypeDist || []
        const deptAdm = charts.deptAdmissions || []
        const wardAdm = charts.wardAdmissions || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Admission Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Daily patient admission flow
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_35`} width="100%" height="100%">
                  <LineChart data={admTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="admissions"
                      name="Admissions"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Admission Type Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Emergency, planned, and direct ICU admissions
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_36`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={admTypeDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {admTypeDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#1B4FD8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Admissions
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Admissions per admitting specialty
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_37`} width="100%" height="100%">
                  <BarChart data={deptAdm}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="admissions"
                      name="Admissions"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Ward-wise Admissions
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Bed placement distribution across wards
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_38`} width="100%" height="100%">
                  <BarChart data={wardAdm}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="ward"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="admissions"
                      name="Admissions"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_discharges": {
        const disTrend = charts.dischargeTrend || []
        const disTypeDist = charts.dischargeTypeDist || []
        const deptDis = charts.departmentDischarges || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Discharge Trend
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Patient discharge clearance volume over time
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_39`} width="100%" height="100%">
                  <LineChart data={disTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                      type="monotone"
                      dataKey="discharges"
                      name="Discharges"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Discharge Type Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Routine, transfers, and LAMA dispositions
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_40`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={disTypeDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {disTypeDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#10B981"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-3">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Discharges
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Patient recovery clearances by ward
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_41`} width="100%" height="100%">
                  <BarChart data={deptDis}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="discharges"
                      name="Discharges"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "reports_staff": {
        const deptStaff = charts.deptStaff || []
        const staffDist = charts.staffDist || []
        const staffActivity = charts.staffActivity || []

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Department-wise Staff
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Personnel headcount across hospital units
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_42`} width="100%" height="100%">
                  <BarChart data={deptStaff}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="staff"
                      name="Headcount"
                      fill="#1B4FD8"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Staff Role Distribution
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Doctors, nurses, pharmacy and lab specialists
              </p>
              <div className="h-72 w-full flex items-center justify-center">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_43`} width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                      data={staffDist}
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={56}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {staffDist.map((entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || "#1B4FD8"}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10, paddingTop: 3 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs lg:col-span-3">
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                Staff Shift Activity
              </h3>
              <p className="text-[11px] text-slate-500 mb-2">
                Duty roster distribution across 24-hour shifts
              </p>
              <div className="h-72 w-full">
                <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_44`} width="100%" height="100%">
                  <BarChart data={staffActivity}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#F1F5F9"
                    />
                    <XAxis
                      dataKey="shift"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      domain={[0, (max: number) => Math.max(max, 4)]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 11,
                        border: "1px solid #E2E8F0",
                      }}
                    />
                    <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                      dataKey="activity"
                      name="Staff on Shift"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      minPointSize={3}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      }

      case "revenue_reports": {
        const rawTrend = charts.revenueTrend || []
        const trend = rawTrend.map((t: any) => ({
          ...t,
          date: t.date || t.period || "Day",
          revenue: Number(t.revenue ?? t.amount ?? 0),
          collections: Number(t.collections ?? t.paidAmount ?? t.revenue ?? 0),
        }))

        const deptRev = (charts.deptRevenue || []).map((d: any) => ({
          department: d.department || "General",
          revenue: Number(d.revenue ?? d.amount ?? 0),
          percentage: d.percentage ?? 0,
          count: d.count ?? 0,
        }))

        const serviceLines = (
          charts.serviceRevenue ||
          charts.serviceLineRevenue ||
          []
        ).map((s: any) => ({
          serviceLine:
            s.serviceLine || s.service || s.category || "Clinical Care",
          revenue: Number(s.revenue ?? s.amount ?? 0),
        }))

        const colors = [
          "#10B981",
          "#1B4FD8",
          "#0284C7",
          "#F59E0B",
          "#8B5CF6",
          "#EC4899",
        ]
        const payDist = (
          charts.paymentMethods ||
          charts.paymentMethodDist ||
          []
        )
          .map((p: any, idx: number) => ({
            name: p.name || p.method || "Payment",
            value: Number(p.value ?? p.amount ?? 0),
            color: p.color || colors[idx % colors.length],
          }))
          .filter((p: any) => p.value > 0)

        return (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Revenue & Collections Trend */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Revenue Realization Trend
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Daily Realized
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Recognized billed revenue vs settled cash/digital collections
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_45`} width="100%" height="100%">
                    <LineChart
                      data={trend}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Legend
                        iconType="circle"
                        wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
                      />
                      <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                        type="monotone"
                        dataKey="revenue"
                        name="Recognized Revenue"
                        stroke="#059669"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                        type="monotone"
                        dataKey="collections"
                        name="Settled Collections"
                        stroke="#1B4FD8"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Department Revenue Breakdown */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Department Revenue Breakdown
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    Contribution
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Total collection contribution across hospital clinical units
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_46`} width="100%" height="100%">
                    <BarChart
                      data={deptRev}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="department"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v: string) =>
                          v.length > 12 ? `${v.slice(0, 10)}...` : v
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) => `Department: ${label}`}
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Revenue",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="revenue"
                        name="Revenue"
                        fill="#1B4FD8"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Payment Methods */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Payment Method Distribution
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                    Settlement Channels
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Collections breakdown by payment channel (UPI, Cash, Cards,
                  Bank Transfer)
                </p>
                <div className="h-72 w-full flex items-center justify-center">
                  {payDist.length > 0 ? (
                    <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_47`} width="100%" height="100%">
                      <PieChart>
                        <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                          data={payDist}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={66}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {payDist.map((entry: any, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color || "#10B981"}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(val: any) => [
                            `₹${Number(val || 0).toLocaleString("en-IN")}`,
                            "Amount",
                          ]}
                          contentStyle={{
                            borderRadius: 8,
                            fontSize: 11,
                            border: "1px solid #E2E8F0",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                          }}
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No payment transaction distribution available
                    </div>
                  )}
                </div>
              </div>

              {/* Service Line Contribution */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Service Line Revenue Contribution
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Care Categories
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Revenue generated by clinical service category
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_48`} width="100%" height="100%">
                    <BarChart
                      data={serviceLines}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="serviceLine"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v: string) =>
                          v.length > 13 ? `${v.slice(0, 11)}...` : v
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) =>
                          `Service Line: ${label}`
                        }
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Revenue",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="revenue"
                        name="Service Revenue"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )
      }

      case "reports_pharmacy_damaged": {
        const dTrend = (charts.damageTrend || []).map((d: any) => ({
          ...d,
          date: d.date || "Period",
          lossValue: Number(d.lossValue ?? d.loss ?? d.amount ?? 0),
        }))
        const topProducts = (charts.lossByProduct || []).map((p: any) => ({
          product: p.product || p.medicineName || "Unknown",
          lossValue: Number(p.lossValue ?? p.loss ?? 0),
          units: p.units ?? p.quantity ?? 0,
        }))
        const lossReasons = (charts.lossByReason || []).map((r: any) => ({
          reason: r.reason || "Unspecified",
          lossValue: Number(r.lossValue ?? r.loss ?? 0),
          count: r.count ?? 1,
        }))
        const catLoss = (charts.lossByCategory || []).map((c: any) => ({
          category: c.category || "General",
          lossValue: Number(c.lossValue ?? c.loss ?? 0),
        }))

        return (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Damage Trend */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Damaged Stock Loss Trend
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                    Loss Valuation
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Write-off loss valuation over the reporting period
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_49`} width="100%" height="100%">
                    <LineChart
                      data={dTrend}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Loss Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                        type="monotone"
                        dataKey="lossValue"
                        name="Loss Valuation"
                        stroke="#DC2626"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Loss Products */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Highest Loss Medicine Products
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded">
                    High Impact
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Medicines with greatest cumulative write-off valuation
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_50`} width="100%" height="100%">
                    <BarChart
                      data={topProducts}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="product"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v: string) =>
                          v.length > 13 ? `${v.slice(0, 11)}...` : v
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) => `Medicine: ${label}`}
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Loss Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="lossValue"
                        name="Loss Value"
                        fill="#DC2626"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Loss by Reason */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Loss Valuation by Root Cause
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                    Audit Reason
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Transit, cold chain excursion, expired, or compromised
                  packaging
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_51`} width="100%" height="100%">
                    <BarChart
                      data={lossReasons}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="reason"
                        width={120}
                        tick={{ fontSize: 9.5, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) => `Reason: ${label}`}
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Loss Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="lossValue"
                        name="Loss Value"
                        fill="#EA580C"
                        radius={[0, 4, 4, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Loss by Category */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Loss by Therapeutic Category
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                    Drug Classes
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Category-level distribution of inventory write-offs
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_52`} width="100%" height="100%">
                    <BarChart
                      data={catLoss}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="category"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v: string) =>
                          v.length > 13 ? `${v.slice(0, 11)}...` : v
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) => `Category: ${label}`}
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Loss Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="lossValue"
                        name="Category Loss"
                        fill="#7C3AED"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )
      }

      case "reports_supplier_returns": {
        const rTrend = (charts.returnTrend || []).map((r: any) => ({
          ...r,
          date: r.date || "Period",
          returnAmount: Number(r.returnAmount ?? r.amount ?? 0),
        }))
        const supReturns = (
          charts.returnBySupplier ||
          charts.supplierReturns ||
          []
        ).map((s: any) => ({
          supplier: s.supplier || s.supplierName || "Vendor",
          returnAmount: Number(s.returnAmount ?? s.amount ?? 0),
          count: s.count ?? 1,
        }))
        const rReasons = (
          charts.returnByReason ||
          charts.returnReasons ||
          []
        ).map((r: any) => ({
          reason: r.reason || "Unspecified",
          returnAmount: Number(r.returnAmount ?? r.amount ?? 0),
          count: r.count ?? 1,
        }))
        const colorsSup = [
          "#059669",
          "#1B4FD8",
          "#F59E0B",
          "#64748B",
          "#8B5CF6",
        ]
        const rStatuses = (charts.returnByStatus || charts.returnStatuses || [])
          .map((s: any, idx: number) => ({
            name: s.status || s.name || "Status",
            value: Number(s.returnAmount ?? s.amount ?? s.value ?? 0),
            color: s.color || colorsSup[idx % colorsSup.length],
          }))
          .filter((s: any) => s.value > 0)

        return (
          <div className="space-y-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Supplier Return Trend */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Supplier Return Volume &amp; Value
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    Debit Notes
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Debit notes issued to pharmaceutical vendors over time
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_53`} width="100%" height="100%">
                    <LineChart
                      data={rTrend}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Return Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Line isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" animationBegin={150}
                        type="monotone"
                        dataKey="returnAmount"
                        name="Debit Note Value"
                        stroke="#2563EB"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Vendor-wise Returns */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Vendor-wise Debit Value
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    Supplier Claims
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Claimable return values by pharmaceutical supplier
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_54`} width="100%" height="100%">
                    <BarChart
                      data={supReturns}
                      margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        dataKey="supplier"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v: string) =>
                          v.length > 13 ? `${v.slice(0, 11)}...` : v
                        }
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) => `Supplier: ${label}`}
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Debit Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="returnAmount"
                        name="Debit Value"
                        fill="#2563EB"
                        radius={[4, 4, 0, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {/* Return Reasons */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Vendor Return Reason Classification
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">
                    Reason Code
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Near-expiry, packaging defects, batch recalls, or excess
                  orders
                </p>
                <div className="h-72 w-full">
                  <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_55`} width="100%" height="100%">
                    <BarChart
                      data={rReasons}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#F1F5F9"
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "#64748B" }}
                        tickLine={false}
                        tickFormatter={(v) =>
                          `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                        }
                      />
                      <YAxis
                        type="category"
                        dataKey="reason"
                        width={120}
                        tick={{ fontSize: 9.5, fill: "#64748B" }}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        labelFormatter={(label: any) =>
                          `Return Reason: ${label}`
                        }
                        formatter={(val: any) => [
                          `₹${Number(val || 0).toLocaleString("en-IN")}`,
                          "Return Value",
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          fontSize: 11,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                        }}
                      />
                      <Bar isAnimationActive={true} animationDuration={1300} animationEasing="ease-out" animationBegin={200}
                        dataKey="returnAmount"
                        name="Debit Value"
                        fill="#0891B2"
                        radius={[0, 4, 4, 0]}
                        minPointSize={3}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Return Status Distribution */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900">
                    Debit &amp; Credit Note Status
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    Settlement Status
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Resolution status across vendor return workflow
                </p>
                <div className="h-72 w-full flex items-center justify-center">
                  {rStatuses.length > 0 ? (
                    <ResponsiveContainer key={`rc_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}_56`} width="100%" height="100%">
                      <PieChart>
                        <Pie isAnimationActive={true} animationDuration={1200} animationEasing="ease-out" animationBegin={250}
                          data={rStatuses}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={66}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {rStatuses.map((entry: any, index: number) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color || "#2563EB"}
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(val: any) => [
                            `₹${Number(val || 0).toLocaleString("en-IN")}`,
                            "Value",
                          ]}
                          contentStyle={{
                            borderRadius: 8,
                            fontSize: 11,
                            border: "1px solid #E2E8F0",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                          }}
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No status distribution available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full min-h-0 w-full overflow-y-auto bg-[#F8FAFC] text-slate-900 font-sans pb-16">
      {/* ── 1. PAGE HEADER ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3.5 shadow-2xs">
        <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              {config.title}
            </h1>
            <p className="text-[11.5px] text-[#64748B]">{config.subtitle}</p>
          </div>

          {/* Header Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => {
                  const val = e.target.value as DateRangePreset
                  setDateRange(val)
                  if (val === "custom") setShowCustomPicker(true)
                  else setShowCustomPicker(false)
                  setCurrentPage(1)
                }}
                className="appearance-none bg-white border border-[#CBD5E1] hover:border-slate-400 text-slate-800 text-xs font-semibold py-1.5 pl-3 pr-8 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#1B4FD8] transition cursor-pointer"
              >
                {Object.entries(DATE_RANGE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B4FD8] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-white" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 text-white/80 ml-0.5" />
              </button>

              {exportMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in duration-100">
                  <button
                    onClick={() => {
                      const rec = selectedRow || data?.records?.[0] || null
                      if (rec) {
                        setPdfModalDetails(resolvePatientClinicalRecord(rec))
                      }
                      setExportMenuOpen(false)
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-rose-500" />
                    <span>Patient Data (PDF Form)</span>
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>All Records Table (PDF)</span>
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export as Excel</span>
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Export as CSV</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-6 py-4 space-y-3.5">
        {/* Custom Date Picker (when dateRange === "custom") */}
        {showCustomPicker && (
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
            <span className="text-xs font-bold text-blue-950">
              Custom Date Range:
            </span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-600">
                Start Date
              </label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-white border border-blue-200 text-xs font-semibold px-2.5 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-600">
                End Date
              </label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-white border border-blue-200 text-xs font-semibold px-2.5 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <button
              onClick={() => {
                setCurrentPage(1)
                fetchReportData()
              }}
              className="px-3 py-1 bg-[#1B4FD8] text-white text-xs font-semibold rounded-lg shadow-2xs hover:bg-blue-700 transition"
            >
              Apply Dates
            </button>
          </div>
        )}

        {/* ── 2. FILTER RECORDS BAR ────────────────────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[#1B4FD8]" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Filter Records
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-500">
                Active Range:{" "}
                <strong className="text-slate-700 font-semibold">
                  {DATE_RANGE_LABELS[dateRange]}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Reset</span>
              </button>
              <button
                onClick={handleApplyFilters}
                className="px-3 py-1 bg-[#1B4FD8] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1"
              >
                <span>Generate Report</span>
              </button>
            </div>
          </div>

          {/* Contextual Filter Controls based on Report Domain */}
          {reportType === "revenue_reports" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Department / Revenue Stream
                </label>
                <select
                  value={stagedDept}
                  onChange={(e) => setStagedDept(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Payment Method
                </label>
                <select
                  value={stagedPaymentMethod}
                  onChange={(e) => setStagedPaymentMethod(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Payment Methods</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI / Digital">UPI / Digital</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Settlement Status
                </label>
                <select
                  value={stagedPaymentStatus}
                  onChange={(e) => setStagedPaymentStatus(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed / Settled</option>
                  <option value="Pending">Pending Reconciliation</option>
                  <option value="Failed">Failed / Reversed</option>
                </select>
              </div>
            </div>
          ) : reportType === "reports_pharmacy_damaged" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Damage Reason / Root Cause
                </label>
                <select
                  value={stagedReason}
                  onChange={(e) => setStagedReason(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Root Causes</option>
                  <option value="Damaged in Transit">Damaged in Transit</option>
                  <option value="Cold Chain Failure">Cold Chain Failure</option>
                  <option value="Dropped / Broken Vials">
                    Dropped / Broken Vials
                  </option>
                  <option value="Expired on Shelf">Expired on Shelf</option>
                  <option value="Packaging Compromised">
                    Packaging Compromised
                  </option>
                  <option value="Spillage / Handling Loss">
                    Spillage / Handling Loss
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Therapeutic Category
                </label>
                <select
                  value={stagedCategory}
                  onChange={(e) => setStagedCategory(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Categories</option>
                  {pharmacyCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Origin Supplier
                </label>
                <select
                  value={stagedSupplier}
                  onChange={(e) => setStagedSupplier(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Suppliers</option>
                  {pharmacySuppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : reportType === "reports_supplier_returns" ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Pharmaceutical Supplier
                </label>
                <select
                  value={stagedSupplier}
                  onChange={(e) => setStagedSupplier(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Suppliers</option>
                  {pharmacySuppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Return Reason
                </label>
                <select
                  value={stagedReason}
                  onChange={(e) => setStagedReason(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Return Reasons</option>
                  <option value="Near Expiry Stock">Near Expiry Stock</option>
                  <option value="Packaging Defect / Seal Broken">
                    Packaging Defect / Seal Broken
                  </option>
                  <option value="Batch Quality Recall">
                    Batch Quality Recall
                  </option>
                  <option value="Wrong SKU Delivered">
                    Wrong SKU Delivered
                  </option>
                  <option value="Excess Order Reversal">
                    Excess Order Reversal
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Return Status
                </label>
                <select
                  value={stagedStatus}
                  onChange={(e) => setStagedStatus(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Credit Note Received">
                    Credit Note Received
                  </option>
                  <option value="Dispatched to Vendor">
                    Dispatched to Vendor
                  </option>
                  <option value="Vendor Approved">Vendor Approved</option>
                  <option value="Pending Approval">Pending Approval</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Department
                </label>
                <select
                  value={stagedDept}
                  onChange={(e) => setStagedDept(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Doctor / In-Charge
                </label>
                <select
                  value={stagedDoctor}
                  onChange={(e) => setStagedDoctor(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Doctors / In-Charges</option>
                  {doctors.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={stagedStatus}
                  onChange={(e) => setStagedStatus(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active / In Progress</option>
                  <option value="Completed">Completed / Discharged</option>
                  <option value="Cancelled">Cancelled / Pending</option>
                </select>
              </div>
            </div>
          )}

          {/* Active Filter Badges */}
          <ActiveFilterChips
            dateRangeLabel={DATE_RANGE_LABELS[dateRange]}
            filters={[
              {
                key: "department",
                label: "Dept",
                value: selectedDept,
                onRemove: () => {
                  setSelectedDept("All")
                  setStagedDept("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "doctor",
                label: "Doctor",
                value: selectedDoctor,
                onRemove: () => {
                  setSelectedDoctor("All")
                  setStagedDoctor("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "status",
                label: "Status",
                value: selectedStatus,
                onRemove: () => {
                  setSelectedStatus("All")
                  setStagedStatus("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "paymentMethod",
                label: "Method",
                value: selectedPaymentMethod,
                onRemove: () => {
                  setSelectedPaymentMethod("All")
                  setStagedPaymentMethod("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "paymentStatus",
                label: "Payment Status",
                value: selectedPaymentStatus,
                onRemove: () => {
                  setSelectedPaymentStatus("All")
                  setStagedPaymentStatus("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "supplier",
                label: "Supplier",
                value: selectedSupplier,
                onRemove: () => {
                  setSelectedSupplier("All")
                  setStagedSupplier("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "category",
                label: "Category",
                value: selectedCategory,
                onRemove: () => {
                  setSelectedCategory("All")
                  setStagedCategory("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "reason",
                label: "Reason",
                value: selectedReason,
                onRemove: () => {
                  setSelectedReason("All")
                  setStagedReason("All")
                  setCurrentPage(1)
                },
              },
              {
                key: "search",
                label: "Search",
                value: searchQuery,
                onRemove: () => {
                  setSearchQuery("")
                  setDebouncedSearch("")
                  setCurrentPage(1)
                },
              },
            ]}
            onClearAll={handleResetFilters}
          />
        </div>

        {/* Loading State Skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white border border-[#E2E8F0] rounded-xl p-3 h-20"
                />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 h-44" />
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 h-44" />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <AlertCircle className="w-7 h-7 text-red-500 mx-auto mb-1.5" />
            <h3 className="text-sm font-bold text-red-900 mb-1">
              Unable to load report data
            </h3>
            <p className="text-xs text-red-700 mb-3">{error}</p>
            <button
              onClick={fetchReportData}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-sm transition inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Request</span>
            </button>
          </div>
        )}

        {/* Main Content when loaded */}
        {!loading && !error && data && (
          <>
            {/* ── 3. KPI SUMMARY CARDS ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 animate-flow-in delay-75">
              {data.kpis.map((kpi) => {
                const isUp = kpi.trend === "up"
                return (
                  <div
                    key={kpi.id}
                    className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs hover:shadow-md transition duration-200"
                  >
                    <span
                      className="text-[10px] font-bold text-[#64748B] uppercase tracking-tight block truncate mb-1"
                      title={kpi.label}
                    >
                      {kpi.label}
                    </span>
                    <div className="text-xl font-black text-slate-900 tracking-tight leading-none">
                      {kpi.value}
                    </div>
                    {kpi.change && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px]">
                        <span
                          className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded ${
                            isUp
                              ? "text-emerald-700 bg-emerald-50"
                              : "text-slate-600 bg-slate-100"
                          }`}
                        >
                          {isUp ? (
                            <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
                          ) : (
                            <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />
                          )}
                          {kpi.change}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── 4. DATA VISUALIZATIONS ────────────────────────────────────── */}
            <div
              key={`vis_${reportType}_${dateRange}_${selectedDept}_${selectedDoctor}_${selectedStatus}`}
              className="animate-flow-in delay-150"
            >
              {renderVisualizations()}
            </div>

            {/* ── 5. DETAILED REPORT TABLE ──────────────────────────────────── */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden animate-flow-in delay-225">
              <div className="p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8FAFC]/50">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Detailed Report Records
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Itemized entries strictly filtered by applied parameters
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search patient, UMR, ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-white border border-[#CBD5E1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1B4FD8]"
                    />
                  </div>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="bg-white border border-[#CBD5E1] text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-700"
                  >
                    <option value={10}>10 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      {config.tableColumns.map((col) => (
                        <th
                          key={col.key}
                          className="px-4 py-3 whitespace-nowrap"
                        >
                          {col.header}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.records.length === 0 ? (
                      <tr>
                        <td
                          colSpan={config.tableColumns.length + 1}
                          className="px-4 py-12 text-center text-slate-400"
                        >
                          <p className="text-sm font-semibold text-slate-600 mb-1">
                            No records found
                          </p>
                          <p className="text-xs text-slate-400">
                            Try changing the date range or clearing filter
                            parameters.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      data.records.map((row, idx) => (
                        <tr
                          key={`${row.id || "rec"}_${idx}`}
                          className="hover:bg-slate-50/80 transition duration-150"
                        >
                          {config.tableColumns.map((col) => {
                            const val = row[col.key]
                            const isStatus =
                              col.key === "status" ||
                              col.key === "reportStatus" ||
                              col.key === "resultStatus"
                            return (
                              <td
                                key={col.key}
                                className="px-4 py-3 whitespace-nowrap"
                              >
                                {isStatus ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                                      String(val)
                                        .toLowerCase()
                                        .includes("complete") ||
                                      String(val)
                                        .toLowerCase()
                                        .includes("final") ||
                                      String(val)
                                        .toLowerCase()
                                        .includes("verified") ||
                                      String(val)
                                        .toLowerCase()
                                        .includes("active") ||
                                      String(val)
                                        .toLowerCase()
                                        .includes("dispensed")
                                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                        : String(val)
                                              .toLowerCase()
                                              .includes("cancel")
                                          ? "bg-red-50 text-red-700 border border-red-200"
                                          : "bg-blue-50 text-blue-700 border border-blue-200"
                                    }`}
                                  >
                                    {val || "—"}
                                  </span>
                                ) : (
                                  <span className="font-medium text-slate-800">
                                    {val || "—"}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => setSelectedRow(row)}
                                className="px-2 py-1 text-slate-600 hover:text-[#1B4FD8] hover:bg-blue-50 rounded text-[11px] font-semibold transition cursor-pointer"
                                title="Quick View Record Details"
                              >
                                View
                              </button>
                              <button
                                onClick={() => {
                                  if (reportType === "revenue_reports") {
                                    setRevenueModalData(row)
                                  } else if (
                                    reportType === "reports_pharmacy_damaged"
                                  ) {
                                    setDamagedModalData(row)
                                  } else if (
                                    reportType === "reports_supplier_returns"
                                  ) {
                                    setSupplierReturnModalData(row)
                                  } else if (reportType === "reports_doctors") {
                                    const d = resolveDoctorReportData(
                                      row,
                                      DATE_RANGE_LABELS[dateRange],
                                    )
                                    setDoctorPdfData(d)
                                  } else {
                                    const d = resolvePatientClinicalRecord(row)
                                    setPdfModalDetails(d)
                                  }
                                }}
                                className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border border-rose-200"
                                title={
                                  reportType === "revenue_reports"
                                    ? "Show Payment Receipt"
                                    : reportType === "reports_pharmacy_damaged"
                                      ? "Show Write-Off Certificate"
                                      : reportType ===
                                          "reports_supplier_returns"
                                        ? "Show Vendor Debit Note"
                                        : reportType === "reports_doctors"
                                          ? "Show Doctor Caseload PDF Form"
                                          : "Show Patient Data in PDF Form"
                                }
                              >
                                <FileText className="w-3 h-3 text-rose-600" />
                                <span>
                                  {reportType === "revenue_reports"
                                    ? "Receipt"
                                    : reportType === "reports_pharmacy_damaged"
                                      ? "Write-Off"
                                      : reportType ===
                                          "reports_supplier_returns"
                                        ? "Debit Note"
                                        : "PDF"}
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  if (reportType === "revenue_reports") {
                                    setRevenueModalData(row)
                                  } else if (
                                    reportType === "reports_pharmacy_damaged"
                                  ) {
                                    setDamagedModalData(row)
                                  } else if (
                                    reportType === "reports_supplier_returns"
                                  ) {
                                    setSupplierReturnModalData(row)
                                  } else if (reportType === "reports_doctors") {
                                    const d = resolveDoctorReportData(
                                      row,
                                      DATE_RANGE_LABELS[dateRange],
                                    )
                                    printDoctorReport(d)
                                  } else {
                                    const d = resolvePatientClinicalRecord(row)
                                    printPatientClinicalReport(d)
                                  }
                                }}
                                className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border border-slate-200"
                                title="Print Record"
                              >
                                <Printer className="w-3 h-3 text-slate-600" />
                                <span>Print</span>
                              </button>
                              <button
                                onClick={() => {
                                  if (reportType === "revenue_reports") {
                                    setRevenueModalData(row)
                                  } else if (
                                    reportType === "reports_pharmacy_damaged"
                                  ) {
                                    setDamagedModalData(row)
                                  } else if (
                                    reportType === "reports_supplier_returns"
                                  ) {
                                    setSupplierReturnModalData(row)
                                  } else if (reportType === "reports_doctors") {
                                    setDoctorModalItem(row)
                                  } else {
                                    setReportModalItem(row)
                                  }
                                }}
                                className="px-2.5 py-1 bg-[#1B4FD8] text-white hover:bg-blue-700 rounded text-[11px] font-semibold transition cursor-pointer"
                                title="Open Record Document"
                              >
                                {reportType === "revenue_reports"
                                  ? "Voucher"
                                  : reportType === "reports_pharmacy_damaged"
                                    ? "Certificate"
                                    : reportType === "reports_supplier_returns"
                                      ? "Debit Note"
                                      : "Open Report"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── 6. PAGINATION ────────────────────────────────────────────── */}
              <div className="px-4 py-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-2 bg-[#F8FAFC]/50 text-xs text-slate-600">
                <div>
                  Showing{" "}
                  <strong className="text-slate-800">
                    {data.pagination.total === 0
                      ? 0
                      : (data.pagination.page - 1) * data.pagination.limit + 1}
                  </strong>{" "}
                  to{" "}
                  <strong className="text-slate-800">
                    {Math.min(
                      data.pagination.page * data.pagination.limit,
                      data.pagination.total,
                    )}
                  </strong>{" "}
                  of{" "}
                  <strong className="text-slate-800">
                    {data.pagination.total}
                  </strong>{" "}
                  records
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 border border-[#CBD5E1] rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-3 py-1 font-semibold text-slate-800">
                    Page {currentPage} of {data.pagination.totalPages || 1}
                  </span>
                  <button
                    disabled={currentPage >= (data.pagination.totalPages || 1)}
                    onClick={() =>
                      setCurrentPage((p) =>
                        Math.min(data.pagination.totalPages, p + 1),
                      )
                    }
                    className="p-1.5 border border-[#CBD5E1] rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Row Inspection Modal */}
      {selectedRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Record Inspection
              </h3>
              <button
                onClick={() => setSelectedRow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-4 space-y-2.5 max-h-[60vh] overflow-y-auto">
              {Object.entries(selectedRow).map(([key, val]) => (
                <div
                  key={key}
                  className="flex items-start justify-between text-xs py-1 border-b border-slate-50"
                >
                  <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10.5px]">
                    {key.replace(/([A-Z])/g, " $1")}
                  </span>
                  <span className="font-medium text-slate-900 text-right max-w-[65%] break-words">
                    {typeof val === "object"
                      ? JSON.stringify(val)
                      : String(val || "—")}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Patient Clinical Record A4 PDF Form Modal */}
      <PatientDataPdfModal
        details={pdfModalDetails}
        onClose={() => setPdfModalDetails(null)}
      />

      {/* In-Report Interactive Clinical Encounter & Department Report Modal */}
      <InReportEncounterModal
        item={reportModalItem}
        onClose={() => setReportModalItem(null)}
        onNavigate={onNavigate}
        onOpenPdf={(d) => setPdfModalDetails(d)}
      />

      {/* Official Doctor Productivity & Caseload Report A4 PDF Form Modal */}
      <DoctorReportPdfModal
        data={doctorPdfData}
        onClose={() => setDoctorPdfData(null)}
      />

      {/* In-Report Interactive Doctor Productivity & Caseload Modal */}
      <DoctorReportModal
        item={doctorModalItem}
        dateRangeLabel={DATE_RANGE_LABELS[dateRange]}
        onClose={() => setDoctorModalItem(null)}
        onOpenPdf={(d) => setDoctorPdfData(d)}
      />

      {/* Financial Reports Modals */}
      <RevenueReceiptModal
        isOpen={Boolean(revenueModalData)}
        onClose={() => setRevenueModalData(null)}
        data={revenueModalData}
      />
      <DamagedStockModal
        isOpen={Boolean(damagedModalData)}
        onClose={() => setDamagedModalData(null)}
        data={damagedModalData}
      />
      <SupplierReturnModal
        isOpen={Boolean(supplierReturnModalData)}
        onClose={() => setSupplierReturnModalData(null)}
        data={supplierReturnModalData}
      />
    </div>
  )
}
