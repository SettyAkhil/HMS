/**
 * Keppler Healthcare Enterprise HMS - OP Reports Page
 * Location: Reports → General Reports → OP Reports
 * Breadcrumb: Home → Reports → General Reports → OP Reports
 *
 * Provides comprehensive enterprise-grade reporting for the Outpatient Department:
 * - Date Range Presets & Custom Pickers
 * - Department, Doctor, Visit Type, and Status filters
 * - 6 Executive KPI cards with actual period-over-period percentage trends
 * - 3-Column Analytics: Visits Trend Line, Department Bar, Visit Type Donut
 * - Paginated Recent OP Visits table with debounced search
 * - Detailed OP Visit Inspection Modal
 * - Full Export suite: PDF, Excel, CSV
 * - Clean isolated print optimization
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
  Users,
  UserPlus,
  UserCheck,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  Download,
  Printer,
  Calendar,
  Filter,
  RotateCcw,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ArrowUpDown,
  AlertCircle,
  Activity,
  Stethoscope,
  Building2,
  RefreshCw,
  X,
} from "lucide-react"
import {
  OpReportsService,
  OpReportFilters,
  DateRangePreset,
  VisitTypeFilter,
  StatusFilter,
  EnrichedOpVisit,
  OpReportKpis,
  OpTrendDataPoint,
  DepartmentStat,
  VisitTypeStat,
  VISIT_TYPE_COLORS,
} from "../../services/opReportsDb"
import {
  exportOpReportCsv,
  exportOpReportExcel,
  exportOpReportPdf,
  printOpReport,
} from "../../utils/opReportsExporter"
import {
  printPatientClinicalReport,
  downloadPatientClinicalPdf,
} from "../../utils/generalReportsExporter"
import {
  PatientDataPdfModal,
  InReportEncounterModal,
  ActiveFilterChips,
  resolvePatientClinicalRecord,
} from "./PatientReportModals"
import { RoleDatabase } from "../../services/roleDb"

interface OpReportsPageProps {
  userRole?: string
  onNavigate?: (module: string) => void
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

export default function OpReportsPage({
  userRole,
  onNavigate,
}: OpReportsPageProps) {
  // ── 1. RBAC Permission Verification ──────────────────────────────────────────
  const activeRole = userRole || "ROLE_ADMIN"
  const hasAccess = useMemo(() => {
    if (!activeRole) return true
    const roleUpper = activeRole.toUpperCase()
    if (
      roleUpper.includes("ADMIN") ||
      roleUpper.includes("DOCTOR") ||
      roleUpper.includes("STAFF") ||
      roleUpper.includes("LAB") ||
      roleUpper.includes("PHARMACY")
    )
      return true
    const roles = RoleDatabase.getRoles()
    const roleObj = roles.find(
      (r) =>
        r.id === activeRole ||
        r.name.toLowerCase() === activeRole.toLowerCase(),
    )
    const permissions = roleObj?.allowedModules || []
    return (
      permissions.includes("reports") ||
      permissions.includes("revenue_reports") ||
      permissions.includes("dashboard") ||
      permissions.includes("*")
    )
  }, [activeRole])

  const containerRef = useRef<HTMLDivElement>(null);

  // ── 2. Filters State ────────────────────────────────────────────────────────
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    const mainEl = document.querySelector("main");
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }, []);

  const [filters, setFilters] = useState<OpReportFilters>({
    dateRangePreset: "last30",
    department: "All",
    doctor: "All",
    visitType: "All",
    status: "All",
  })

  // Staged filter state (applied when user clicks "Generate Report")
  const [stagedFilters, setStagedFilters] = useState<OpReportFilters>({
    dateRangePreset: "last30",
    department: "All",
    doctor: "All",
    visitType: "All",
    status: "All",
  })

  // Custom date picker range modal
  const [showCustomDateModal, setShowCustomDateModal] = useState(false)
  const [tempCustomStart, setTempCustomStart] = useState(
    new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0],
  )
  const [tempCustomEnd, setTempCustomEnd] = useState(
    new Date().toISOString().split("T")[0],
  )

  // Export dropdown state
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  // Table search & pagination state
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  // Selected visit for inspection modal
  const [selectedVisit, setSelectedVisit] = useState<EnrichedOpVisit | null>(
    null,
  )
  const [reportModalItem, setReportModalItem] = useState<any | null>(null)
  const [pdfModalDetails, setPdfModalDetails] = useState<any | null>(null)

  // Analytics sub-selectors
  const [trendSubPreset, setTrendSubPreset] =
    useState<DateRangePreset>("last30")
  const [deptSubPreset, setDeptSubPreset] =
    useState<"thisWeek" | "thisMonth" | "lastMonth">("thisMonth")

  // Loading & error simulation states
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  // Close export dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Ensure longitudinal historical records exist in database
  useEffect(() => {
    OpReportsService.ensureLongitudinalData()
  }, [])

  // Available departments & dynamic doctors list
  const availableDepartments = useMemo(
    () => OpReportsService.getAvailableDepartments(),
    [],
  )
  const availableDoctors = useMemo(
    () => OpReportsService.getDoctorsByDepartment(stagedFilters.department),
    [stagedFilters.department],
  )

  // ── 3. Query & Aggregation Execution ────────────────────────────────────────
  const reportData = useMemo(() => {
    try {
      const { currentPeriodVisits, previousPeriodVisits } =
        OpReportsService.getFilteredVisits(filters)
      const kpis: OpReportKpis = OpReportsService.computeKpis(
        currentPeriodVisits,
        previousPeriodVisits,
      )

      const boundaries = OpReportsService.getDateRangeBoundaries(
        filters.dateRangePreset,
        filters.customStartDate,
        filters.customEndDate,
      )

      const trendData: OpTrendDataPoint[] = OpReportsService.computeTrendData(
        currentPeriodVisits,
        filters.dateRangePreset,
        boundaries.startDate,
        boundaries.endDate,
      )

      const deptStats: DepartmentStat[] =
        OpReportsService.computeDepartmentStats(currentPeriodVisits)
      const visitTypeStats: VisitTypeStat[] =
        OpReportsService.computeVisitTypeStats(currentPeriodVisits)

      return {
        currentPeriodVisits,
        previousPeriodVisits,
        kpis,
        trendData,
        deptStats,
        visitTypeStats,
        startDate: boundaries.startDate,
        endDate: boundaries.endDate,
      }
    } catch (e) {
      console.error("Failed to query OP reports data:", e)
      setHasError(true)
      return null
    }
  }, [filters])

  // Handle Generate Report action
  const handleGenerateReport = () => {
    setIsLoading(true)
    setHasError(false)
    setTimeout(() => {
      setFilters({ ...stagedFilters })
      setCurrentPage(1)
      setIsLoading(false)
    }, 280)
  }

  // Handle Reset Filters action
  const handleResetFilters = () => {
    const defaultFilters: OpReportFilters = {
      dateRangePreset: "last30",
      department: "All",
      doctor: "All",
      visitType: "All",
      status: "All",
    }
    setStagedFilters(defaultFilters)
    setFilters(defaultFilters)
    setSearchQuery("")
    setCurrentPage(1)
  }

  // Label for active date range
  const activeDateRangeLabel = useMemo(() => {
    if (
      filters.dateRangePreset === "custom" &&
      filters.customStartDate &&
      filters.customEndDate
    ) {
      return `${filters.customStartDate} to ${filters.customEndDate}`
    }
    return DATE_RANGE_LABELS[filters.dateRangePreset] || "Last 30 Days"
  }, [filters])

  const [dateTimeSortOrder, setDateTimeSortOrder] = useState<"desc" | "asc">("desc")

  // ── 4. Table Search & Pagination Filtering ──────────────────────────────────
  const filteredTableVisits = useMemo(() => {
    if (!reportData) return []
    let list = [...reportData.currentPeriodVisits]
    const q = searchQuery.toLowerCase().trim()
    if (q) {
      list = list.filter((v) => {
        const nameMatch = v.patientName.toLowerCase().includes(q)
        const umrMatch = v.umr.toLowerCase().includes(q)
        const opMatch = v.opNumber.toLowerCase().includes(q)
        const docMatch = (v.assignedDoctor || v.aiDoctor || "")
          .toLowerCase()
          .includes(q)
        const deptMatch = v.dept.toLowerCase().includes(q)
        return nameMatch || umrMatch || opMatch || docMatch || deptMatch
      })
    }

    list.sort((a, b) => {
      const msA = a.visitTimestampMs ?? OpReportsService.getVisitTimestampMs(a)
      const msB = b.visitTimestampMs ?? OpReportsService.getVisitTimestampMs(b)
      if (msA !== msB) {
        return dateTimeSortOrder === "desc" ? msB - msA : msA - msB
      }
      return dateTimeSortOrder === "desc"
        ? (b.opNumber || "").localeCompare(a.opNumber || "", undefined, { numeric: true })
        : (a.opNumber || "").localeCompare(b.opNumber || "", undefined, { numeric: true })
    })

    return list
  }, [reportData, searchQuery, dateTimeSortOrder])

  const totalTableRecords = filteredTableVisits.length
  const totalPages = Math.ceil(totalTableRecords / rowsPerPage) || 1
  const paginatedVisits = useMemo(() => {
    const startIdx = (currentPage - 1) * rowsPerPage
    return filteredTableVisits.slice(startIdx, startIdx + rowsPerPage)
  }, [filteredTableVisits, currentPage, rowsPerPage])

  // ── 5. Export Actions ───────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (!reportData) return
    exportOpReportCsv(
      filteredTableVisits,
      filters,
      reportData.kpis,
      activeDateRangeLabel,
    )
    setShowExportMenu(false)
  }

  const handleExportExcel = () => {
    if (!reportData) return
    exportOpReportExcel(
      filteredTableVisits,
      filters,
      reportData.kpis,
      activeDateRangeLabel,
    )
    setShowExportMenu(false)
  }

  const handleExportPdf = () => {
    if (!reportData) return
    exportOpReportPdf(
      filteredTableVisits,
      filters,
      reportData.kpis,
      activeDateRangeLabel,
    )
    setShowExportMenu(false)
  }

  const handlePrint = () => {
    if (!reportData) return
    printOpReport(
      filteredTableVisits,
      filters,
      reportData.kpis,
      activeDateRangeLabel,
    )
  }

  // ── 6. Unauthorized Access Screen ───────────────────────────────────────────
  if (!hasAccess) {
    return (
      <div className="flex-1 p-8 bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Access Restricted
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your assigned role (
            <strong className="text-slate-800">{activeRole}</strong>) does not
            have authorization to view hospital executive clinical reports.
            Please contact the Medical Records Director or System Administrator.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate("dashboard")}
              className="px-4 py-2 bg-[#1B4FD8] text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition"
            >
              Return to Clinical Dashboard
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full min-h-0 w-full overflow-y-auto bg-[#F8FAFC] text-slate-900 font-sans pb-16">
      {/* ── PAGE HEADER ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-5 shadow-2xs">
        <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              OP Reports
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              View OP department reports, patient visits, consultations and
              trends.
            </p>
          </div>

          {/* Right Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Date Range Selector Dropdown */}
            <div className="relative">
              <select
                value={stagedFilters.dateRangePreset}
                onChange={(e) => {
                  const val = e.target.value as DateRangePreset
                  if (val === "custom") {
                    setShowCustomDateModal(true)
                  } else {
                    setStagedFilters((prev) => ({
                      ...prev,
                      dateRangePreset: val,
                    }))
                    setFilters((prev) => ({ ...prev, dateRangePreset: val }))
                  }
                }}
                className="pl-8 pr-7 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-semibold text-slate-800 shadow-2xs hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1B4FD8] cursor-pointer"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last7">Last 7 Days</option>
                <option value="last30">Last 30 Days</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="custom">Custom Date Range...</option>
              </select>
              <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
              title="Print standard A4 landscape OP executive report"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print</span>
            </button>

            {/* Export Dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1542B8] text-white font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1 divide-y divide-slate-100 animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => {
                      const rec = selectedVisit || paginatedVisits?.[0] || null
                      if (rec) {
                        setPdfModalDetails(resolvePatientClinicalRecord(rec))
                      }
                      setShowExportMenu(false)
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4 text-rose-600" />
                    <span>Patient Data (PDF Form)</span>
                  </button>
                  <button
                    onClick={handleExportPdf}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-[#1B4FD8] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileText className="w-4 h-4 text-red-600" />
                    <span>Export PDF Report</span>
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export Excel (.xls)</span>
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Export CSV Data</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 sm:px-6 pt-5 space-y-6">
        {/* ── 3. HORIZONTAL FILTER PANEL ───────────────────────────────────── */}
        <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
              {/* 1. Department */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={stagedFilters.department}
                  onChange={(e) => {
                    const dept = e.target.value
                    setStagedFilters((prev) => ({
                      ...prev,
                      department: dept,
                      doctor: "All",
                    }))
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#1B4FD8] focus:outline-none transition cursor-pointer"
                >
                  <option value="All">All Departments</option>
                  {availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Doctor (dynamically loaded) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Doctor
                </label>
                <select
                  value={stagedFilters.doctor}
                  onChange={(e) =>
                    setStagedFilters((prev) => ({
                      ...prev,
                      doctor: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#1B4FD8] focus:outline-none transition cursor-pointer"
                >
                  <option value="All">
                    All Doctors ({availableDoctors.length})
                  </option>
                  {availableDoctors.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Visit Type */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Visit Type
                </label>
                <select
                  value={stagedFilters.visitType}
                  onChange={(e) =>
                    setStagedFilters((prev) => ({
                      ...prev,
                      visitType: e.target.value as VisitTypeFilter,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#1B4FD8] focus:outline-none transition cursor-pointer"
                >
                  <option value="All">All Visit Types</option>
                  <option value="New Consultation">New Consultation</option>
                  <option value="Follow-up Visit">Follow-up Visit</option>
                  <option value="Procedure">Procedure</option>
                  <option value="Health Checkup">Health Checkup</option>
                </select>
              </div>

              {/* 4. Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={stagedFilters.status}
                  onChange={(e) =>
                    setStagedFilters((prev) => ({
                      ...prev,
                      status: e.target.value as StatusFilter,
                    }))
                  }
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#1B4FD8] focus:outline-none transition cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Waiting">Waiting</option>
                  <option value="In Consultation">In Consultation</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isLoading}
                className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1542B8] text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition"
              >
                {isLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Filter className="w-3.5 h-3.5" />
                )}
                <span>Generate Report</span>
              </button>

              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition"
                title="Reset all filters to default"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Active Filter Badges */}
          <ActiveFilterChips
            dateRangeLabel={DATE_RANGE_LABELS[filters.dateRangePreset]}
            filters={[
              {
                key: "department",
                label: "Dept",
                value: filters.department,
                onRemove: () => {
                  setFilters((prev) => ({ ...prev, department: "All" }))
                  setStagedFilters((prev) => ({ ...prev, department: "All" }))
                  setCurrentPage(1)
                },
              },
              {
                key: "doctor",
                label: "Doctor",
                value: filters.doctor,
                onRemove: () => {
                  setFilters((prev) => ({ ...prev, doctor: "All" }))
                  setStagedFilters((prev) => ({ ...prev, doctor: "All" }))
                  setCurrentPage(1)
                },
              },
              {
                key: "visitType",
                label: "Type",
                value: filters.visitType,
                onRemove: () => {
                  setFilters((prev) => ({ ...prev, visitType: "All" }))
                  setStagedFilters((prev) => ({ ...prev, visitType: "All" }))
                  setCurrentPage(1)
                },
              },
              {
                key: "status",
                label: "Status",
                value: filters.status,
                onRemove: () => {
                  setFilters((prev) => ({ ...prev, status: "All" }))
                  setStagedFilters((prev) => ({ ...prev, status: "All" }))
                  setCurrentPage(1)
                },
              },
              {
                key: "search",
                label: "Search",
                value: searchQuery,
                onRemove: () => {
                  setSearchQuery("")
                  setCurrentPage(1)
                },
              },
            ]}
            onClearAll={handleResetFilters}
          />
        </div>

        {/* ── 4. ERROR STATE NOTICE ────────────────────────────────────────── */}
        {hasError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-red-900">
                  Unable to load OP reports
                </h4>
                <p className="text-[11px] text-red-700">
                  An error occurred while compiling encounter statistics.
                </p>
              </div>
            </div>
            <button
              onClick={handleGenerateReport}
              className="px-3 py-1 bg-white border border-red-300 text-red-700 font-bold rounded text-xs hover:bg-red-50 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── 5. SIX EXECUTIVE KPI SUMMARY CARDS ───────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse space-y-2"
              >
                <div className="w-6 h-6 bg-slate-200 rounded-full"></div>
                <div className="w-16 h-3 bg-slate-200 rounded"></div>
                <div className="w-10 h-6 bg-slate-300 rounded"></div>
              </div>
            ))}
          </div>
        ) : reportData ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5 animate-flow-in delay-75">
            {/* Card 1: Total OP Visits */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs hover:border-blue-300 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Total OP Visits
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1B4FD8] flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {reportData.kpis.totalVisits.value}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10.5px]">
                <span
                  className={`font-bold inline-flex items-center ${
                    reportData.kpis.totalVisits.pctChange >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {reportData.kpis.totalVisits.pctChange >= 0 ? "▲ +" : "▼ "}
                  {reportData.kpis.totalVisits.pctChange}%
                </span>
                <span className="text-slate-400">vs last period</span>
              </div>
            </div>

            {/* Card 2: New Patients */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs hover:border-emerald-300 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  New Patients
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {reportData.kpis.newPatients.value}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10.5px]">
                <span
                  className={`font-bold inline-flex items-center ${
                    reportData.kpis.newPatients.pctChange >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {reportData.kpis.newPatients.pctChange >= 0 ? "▲ +" : "▼ "}
                  {reportData.kpis.newPatients.pctChange}%
                </span>
                <span className="text-slate-400">vs last period</span>
              </div>
            </div>

            {/* Card 3: Existing Patients */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs hover:border-indigo-300 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Existing Patients
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {reportData.kpis.existingPatients.value}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10.5px]">
                <span
                  className={`font-bold inline-flex items-center ${
                    reportData.kpis.existingPatients.pctChange >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {reportData.kpis.existingPatients.pctChange >= 0
                    ? "▲ +"
                    : "▼ "}
                  {reportData.kpis.existingPatients.pctChange}%
                </span>
                <span className="text-slate-400">vs last period</span>
              </div>
            </div>

            {/* Card 4: Completed Consultations */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs hover:border-teal-300 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Completed
                </span>
                <div className="w-7 h-7 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {reportData.kpis.completedConsultations.value}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10.5px]">
                <span
                  className={`font-bold inline-flex items-center ${
                    reportData.kpis.completedConsultations.pctChange >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {reportData.kpis.completedConsultations.pctChange >= 0
                    ? "▲ +"
                    : "▼ "}
                  {reportData.kpis.completedConsultations.pctChange}%
                </span>
                <span className="text-slate-400">vs last period</span>
              </div>
            </div>

            {/* Card 5: Waiting Patients */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs hover:border-amber-300 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Waiting Patients
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {reportData.kpis.waitingPatients.value}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10.5px]">
                <span
                  className={`font-bold inline-flex items-center ${
                    reportData.kpis.waitingPatients.pctChange <= 0
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }`}
                >
                  {reportData.kpis.waitingPatients.pctChange >= 0
                    ? "▲ +"
                    : "▼ "}
                  {reportData.kpis.waitingPatients.pctChange}%
                </span>
                <span className="text-slate-400">vs last period</span>
              </div>
            </div>

            {/* Card 6: Cancelled Visits */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs hover:border-rose-300 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  Cancelled
                </span>
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <XCircle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 tracking-tight">
                {reportData.kpis.cancelledVisits.value}
              </div>
              <div className="mt-2 flex items-center gap-1 text-[10.5px]">
                <span
                  className={`font-bold inline-flex items-center ${
                    reportData.kpis.cancelledVisits.pctChange <= 0
                      ? "text-emerald-600"
                      : "text-rose-600"
                  }`}
                >
                  {reportData.kpis.cancelledVisits.pctChange >= 0
                    ? "▲ +"
                    : "▼ "}
                  {reportData.kpis.cancelledVisits.pctChange}%
                </span>
                <span className="text-slate-400">vs last period</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── 6. MAIN ANALYTICS SECTION (THREE-COLUMN LAYOUT) ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-flow-in delay-150">
          {/* LEFT: OP Visits Trend (Line Chart) */}
          <div className="lg:col-span-5 bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#1B4FD8]" />
                  <span>OP Visits Trend</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Daily volume, new vs existing patient trajectory
                </p>
              </div>

              {/* Trend Period Selector */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10.5px]">
                {([
                  { id: "last7", label: "7D" },
                  { id: "last30", label: "30D" },
                  { id: "thisMonth", label: "MTD" },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTrendSubPreset(t.id)
                      setStagedFilters((prev) => ({
                        ...prev,
                        dateRangePreset: t.id,
                      }))
                      setFilters((prev) => ({ ...prev, dateRangePreset: t.id }))
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                      filters.dateRangePreset === t.id
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-72 w-full">
              {reportData && reportData.trendData.length > 0 ? (
                <ResponsiveContainer
                  key={`op_trend_${filters.dateRangePreset}_${trendSubPreset}`}
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={reportData.trendData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={{ stroke: "#CBD5E1" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#0F172A",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "#FFFFFF",
                      }}
                      itemStyle={{ color: "#FFFFFF" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalVisits"
                      name="Total Visits"
                      stroke="#1B4FD8"
                      strokeWidth={2.5}
                      dot={{ r: 2, fill: "#1B4FD8" }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={true}
                      animationDuration={1400}
                      animationEasing="ease-out"
                      animationBegin={150}
                    />
                    <Line
                      type="monotone"
                      dataKey="newPatients"
                      name="New Patients"
                      stroke="#10B981"
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={true}
                      animationDuration={1400}
                      animationEasing="ease-out"
                      animationBegin={250}
                    />
                    <Line
                      type="monotone"
                      dataKey="existingPatients"
                      name="Existing Patients"
                      stroke="#6366F1"
                      strokeWidth={1.8}
                      dot={false}
                      isAnimationActive={true}
                      animationDuration={1400}
                      animationEasing="ease-out"
                      animationBegin={350}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No trend data available for current selection
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Department-wise OP Visits (Bar Chart) */}
          <div className="lg:col-span-4 bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#0284C7]" />
                  <span>Department-wise OP Visits</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Encounter load across clinical specialties
                </p>
              </div>

              {/* Sub-selector */}
              <select
                value={deptSubPreset}
                onChange={(e) => setDeptSubPreset(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-[10.5px] font-semibold rounded px-2 py-0.5 focus:outline-none cursor-pointer"
              >
                <option value="thisWeek">This Week</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
              </select>
            </div>

            <div className="h-72 w-full">
              {reportData && reportData.deptStats.length > 0 ? (
                <ResponsiveContainer
                  key={`op_dept_${deptSubPreset}`}
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={reportData.deptStats.slice(0, 6)}
                    margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#E2E8F0"
                    />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 9, fill: "#64748B" }}
                      axisLine={{ stroke: "#CBD5E1" }}
                      tickLine={false}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#0F172A",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "11px",
                        color: "#FFFFFF",
                      }}
                      formatter={(val: any) => [`${val} Visits`, "Count"]}
                    />
                    <Bar
                      dataKey="count"
                      fill="#0284C7"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={true}
                      animationDuration={1300}
                      animationEasing="ease-out"
                      animationBegin={200}
                    >
                      {reportData.deptStats.slice(0, 6).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No department breakdown for current selection
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Visit Type Distribution (Donut Chart) */}
          <div className="lg:col-span-3 bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs flex flex-col justify-between">
            <div className="mb-2 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-[#7C3AED]" />
                <span>Visit Type Distribution</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Breakdown by care appointment modality
              </p>
            </div>

            <div className="h-72 w-full relative flex items-center justify-center">
              {reportData &&
              reportData.visitTypeStats.some((s) => s.count > 0) ? (
                <>
                  <ResponsiveContainer
                    key={`op_pie_${filters.dateRangePreset}`}
                    width="100%"
                    height="100%"
                  >
                    <PieChart>
                      <Pie
                        data={reportData.visitTypeStats}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={54}
                        paddingAngle={3}
                        dataKey="count"
                        isAnimationActive={true}
                        animationDuration={1200}
                        animationEasing="ease-out"
                        animationBegin={250}
                      >
                        {reportData.visitTypeStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#0F172A",
                          border: "none",
                          borderRadius: "8px",
                          fontSize: "11px",
                          color: "#FFFFFF",
                        }}
                        formatter={(val: any, name: any) => [
                          `${val} (${reportData.visitTypeStats.find((s) => s.name === name)?.percentage}%)`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Counter */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-black text-slate-900 leading-none">
                      {reportData.kpis.totalVisits.value}
                    </span>
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      Total OP
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 text-center">
                  No visit type data recorded
                </div>
              )}
            </div>

            {/* Bottom Legend with counts & % */}
            {reportData && (
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100 text-[10.5px]">
                {reportData.visitTypeStats.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-slate-600 truncate">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-bold text-slate-800 shrink-0 ml-1">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── 7. RECENT OP VISITS SECTION (TABLE CARD) ──────────────────────── */}
        <div className="bg-white border border-[#DDE2EC] rounded-xl shadow-2xs overflow-hidden">
          {/* Table Header Bar */}
          <div className="p-5 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Recent OP Visits
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1B4FD8] border border-blue-200">
                  {totalTableRecords} Records
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Itemized outpatient clinical records and consultation statuses
                for the active period.
              </p>
            </div>

            {/* Table Search & Controls */}
            <div className="flex items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search Patient, UMR, OP#, Doctor..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-[#1B4FD8] focus:outline-none transition shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  handleResetFilters()
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer transition shrink-0"
              >
                View All
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {paginatedVisits.length > 0 ? (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[10.5px]">
                    <th className="py-3 px-3.5 text-center w-12">#</th>
                    <th
                      className="py-3 px-3.5 cursor-pointer hover:bg-slate-100 select-none transition-colors"
                      onClick={() => setDateTimeSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                      title={`Click to sort by Date & Time (${dateTimeSortOrder === "desc" ? "Newest first" : "Oldest first"})`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Date &amp; Time</span>
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[10px] font-normal text-slate-400 lowercase">
                          ({dateTimeSortOrder === "desc" ? "newest" : "oldest"})
                        </span>
                      </div>
                    </th>
                    <th className="py-3 px-3.5">OP Number</th>
                    <th className="py-3 px-3.5">UMR</th>
                    <th className="py-3 px-3.5">Patient Name</th>
                    <th className="py-3 px-3.5">Age / Gender</th>
                    <th className="py-3 px-3.5">Department</th>
                    <th className="py-3 px-3.5">Doctor</th>
                    <th className="py-3 px-3.5">Visit Type</th>
                    <th className="py-3 px-3.5">Status</th>
                    <th className="py-3 px-3.5 text-right w-44">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {paginatedVisits.map((visit, index) => {
                    const rowNum = (currentPage - 1) * rowsPerPage + index + 1
                    return (
                      <tr
                        key={visit.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="py-3 px-3.5 text-center text-slate-500 font-mono">
                          {rowNum}
                        </td>
                        <td className="py-3 px-3.5 font-medium whitespace-nowrap">
                          {visit.encounterDateTimeFormatted}
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-[#1B4FD8]">
                          {visit.opNumber}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-slate-600">
                          {visit.umr}
                        </td>
                        <td className="py-3 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                          {visit.patientName}
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">
                          {visit.age}y · {visit.sex}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                            {visit.dept}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-medium text-slate-900 whitespace-nowrap">
                          {visit.assignedDoctor ||
                            visit.aiDoctor ||
                            "Unassigned"}
                        </td>
                        <td className="py-3 px-3.5">
                          <span
                            className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                            style={{
                              backgroundColor: `${VISIT_TYPE_COLORS[visit.derivedVisitType]}15`,
                              color: VISIT_TYPE_COLORS[visit.derivedVisitType],
                              borderColor: `${VISIT_TYPE_COLORS[visit.derivedVisitType]}30`,
                            }}
                          >
                            {visit.derivedVisitType}
                          </span>
                        </td>
                        <td className="py-3 px-3.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 ${
                              visit.statusCategory === "Completed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : visit.statusCategory === "Waiting"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : visit.statusCategory === "Cancelled"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                visit.statusCategory === "Completed"
                                  ? "bg-emerald-500"
                                  : visit.statusCategory === "Waiting"
                                    ? "bg-amber-500"
                                    : visit.statusCategory === "Cancelled"
                                      ? "bg-red-500"
                                      : "bg-blue-500"
                              }`}
                            />
                            {visit.statusCategory}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedVisit(visit)}
                              className="px-2 py-1 text-slate-600 hover:text-[#1B4FD8] hover:bg-blue-50 rounded text-[11px] font-semibold transition cursor-pointer"
                              title="Quick View Visit Record"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = resolvePatientClinicalRecord(visit)
                                setPdfModalDetails(d)
                              }}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border border-rose-200"
                              title="Show Patient Data in PDF Form"
                            >
                              <FileText className="w-3 h-3 text-rose-600" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = resolvePatientClinicalRecord(visit)
                                printPatientClinicalReport(d)
                              }}
                              className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border border-slate-200"
                              title="Print Patient Medical Record"
                            >
                              <Printer className="w-3 h-3 text-slate-600" />
                              <span>Print</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setReportModalItem(visit)}
                              className="px-2.5 py-1 bg-[#1B4FD8] text-white hover:bg-blue-700 rounded text-[11px] font-semibold transition cursor-pointer"
                              title="Open Full Clinical Encounter & Department Report"
                            >
                              Open Report
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              /* Empty State */
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  No OP visits found
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Try changing the date range or filters. No encounters matched
                  the current criteria.
                </p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-2 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1B4FD8] font-bold rounded-lg text-xs cursor-pointer transition"
                >
                  Reset All Filters
                </button>
              </div>
            )}
          </div>

          {/* ── 8. PAGINATION FOOTER ────────────────────────────────────────── */}
          {totalTableRecords > 0 && (
            <div className="px-5 py-3.5 bg-white border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span>
                  Showing <strong>{(currentPage - 1) * rowsPerPage + 1}</strong>{" "}
                  to{" "}
                  <strong>
                    {Math.min(currentPage * rowsPerPage, totalTableRecords)}
                  </strong>{" "}
                  of <strong>{totalTableRecords}</strong> records
                </span>

                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-slate-400">Rows:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value))
                      setCurrentPage(1)
                    }}
                    className="bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-700 font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer transition"
                >
                  Previous
                </button>

                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let pageNum = i + 1
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 2 + i
                    if (pageNum > totalPages) pageNum = totalPages - 4 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 rounded font-bold transition cursor-pointer text-xs ${
                        currentPage === pageNum
                          ? "bg-[#1B4FD8] text-white shadow-2xs"
                          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer transition"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 9. VISIT DETAILS INSPECTION MODAL ──────────────────────────────── */}
      {selectedVisit && (
        <OpVisitDetailModal
          visit={selectedVisit}
          onClose={() => setSelectedVisit(null)}
        />
      )}

      {/* ── 10. CUSTOM DATE RANGE MODAL ────────────────────────────────────── */}
      {showCustomDateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4 border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1B4FD8]" />
                <span>Select Custom Date Range</span>
              </h3>
              <button
                onClick={() => setShowCustomDateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={tempCustomStart}
                  onChange={(e) => setTempCustomStart(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={tempCustomEnd}
                  onChange={(e) => setTempCustomEnd(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCustomDateModal(false)}
                className="px-3.5 py-1.5 bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setStagedFilters((prev) => ({
                    ...prev,
                    dateRangePreset: "custom",
                    customStartDate: tempCustomStart,
                    customEndDate: tempCustomEnd,
                  }))
                  setFilters((prev) => ({
                    ...prev,
                    dateRangePreset: "custom",
                    customStartDate: tempCustomStart,
                    customEndDate: tempCustomEnd,
                  }))
                  setShowCustomDateModal(false)
                }}
                className="px-4 py-1.5 bg-[#1B4FD8] text-white font-bold rounded-lg text-xs hover:bg-[#1542B8] cursor-pointer shadow-xs"
              >
                Apply Range
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
    </div>
  )
}

/**
 * Clean inspection modal for an individual OP visit
 */
function OpVisitDetailModal({
  visit,
  onClose,
}: {
  visit: EnrichedOpVisit
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 my-auto">
        {/* Modal Top Bar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
            <span className="font-extrabold text-xs uppercase tracking-wider">
              Outpatient Encounter Record · {visit.opNumber}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-800 font-sans">
          {/* Patient Card Banner */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  {visit.patientName}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800">
                  {visit.derivedVisitType}
                </span>
              </div>
              <div className="text-slate-600 font-medium mt-1 flex items-center gap-2">
                <span>
                  UMR: <strong>{visit.umr}</strong>
                </span>
                <span>•</span>
                <span>
                  {visit.age} yrs · {visit.sex}
                </span>
                <span>•</span>
                <span>
                  Blood: <strong>{visit.bloodGroup}</strong>
                </span>
              </div>
              <div className="text-slate-500 text-[11px] mt-0.5">
                📞 {visit.phone} · {visit.address}
              </div>
            </div>

            <div className="text-right shrink-0">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border inline-block ${
                  visit.statusCategory === "Completed"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : visit.statusCategory === "Waiting"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : visit.statusCategory === "Cancelled"
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                }`}
              >
                {visit.statusCategory}
              </span>
              <div className="text-[10.5px] font-mono text-slate-500 mt-1">
                {visit.encounterDateTimeFormatted}
              </div>
            </div>
          </div>

          {/* Department & Attending Doctor Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">
                Clinical Department
              </span>
              <p className="text-sm font-bold text-slate-900">{visit.dept}</p>
              <p className="text-[11px] text-slate-500">
                Room: {visit.room || "Room 102"}
              </p>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">
                Attending Physician
              </span>
              <p className="text-sm font-bold text-slate-900">
                {visit.assignedDoctor || visit.aiDoctor || "Dr. On Duty"}
              </p>
              <p className="text-[11px] text-slate-500">
                Queue Token: {visit.queueToken || "C-01"}
              </p>
            </div>
          </div>

          {/* Vitals Grid */}
          <div>
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
              Nurse Station Triage &amp; Vitals
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-center">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  Blood Pressure
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {visit.vitals?.bp || "—"}
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-center">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  Pulse Rate
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {visit.vitals?.pulse || "—"}
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-center">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  Temperature
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {visit.vitals?.temp || "—"}
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-center">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  Oxygen SpO₂
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {visit.vitals?.spo2 || "—"}
                </span>
              </div>
              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-500 font-semibold block">
                  Body Weight
                </span>
                <span className="text-xs font-bold text-slate-900">
                  {visit.vitals?.weight || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Chief Complaint & Diagnosis */}
          <div className="space-y-2">
            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">
                Chief Complaint &amp; Symptoms
              </span>
              <p className="font-semibold text-slate-900">
                {visit.chiefComplaint || "Routine Consultation"}
              </p>
              {visit.symptoms && visit.symptoms.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {visit.symptoms.map((s, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-slate-100 rounded text-[10.5px] text-slate-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-1">
              <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider block">
                Doctor Assessment &amp; Clinical Diagnosis
              </span>
              <p className="font-bold text-slate-900 text-[13px]">
                {visit.diagnosis ||
                  "Clinical evaluation completed in OP clinic."}
              </p>
              {visit.icd10 && (
                <span className="inline-block px-1.5 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded font-mono text-[10px]">
                  ICD-10: {visit.icd10}
                </span>
              )}
            </div>
          </div>

          {/* Prescriptions & Instructions */}
          {visit.prescription && visit.prescription.length > 0 && (
            <div>
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                Prescribed Medications ({visit.prescription.length})
              </span>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-3">Dosage</th>
                      <th className="py-2 px-3">Frequency</th>
                      <th className="py-2 px-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visit.prescription.map((rx, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 font-bold text-slate-900">
                          {rx.medicine}
                        </td>
                        <td className="py-1.5 px-3 text-slate-700">
                          {rx.dosage}
                        </td>
                        <td className="py-1.5 px-3 text-slate-700">
                          {rx.frequency}
                        </td>
                        <td className="py-1.5 px-3 text-slate-700">
                          {rx.duration}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Billing & Financial Snapshot */}
          <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                Billing Summary
              </span>
              <span className="text-sm font-black text-emerald-950">
                Total Fee: ₹{visit.billing?.total || 50}
              </span>
              <span className="text-[11px] text-slate-600 ml-2">
                (Consultation: ₹{visit.billing?.consultationFee || 50}, Lab: ₹
                {visit.billing?.labFee || 0})
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white uppercase">
              {visit.billing?.status || "Paid"}
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-3.5 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-[#1542B8] text-white font-bold rounded-lg text-xs cursor-pointer shadow-xs transition"
          >
            Close Visit Record
          </button>
        </div>
      </div>
    </div>
  )
}
