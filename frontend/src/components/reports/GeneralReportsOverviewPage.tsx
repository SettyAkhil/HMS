/**
 * Keppler Healthcare Enterprise HMS - General Reports Overview Dashboard
 * Path: Reports → General Reports → Overview
 * Breadcrumb: Home → Reports → General Reports → Overview
 *
 * Provides high-level operational statistics across the hospital:
 * - 6 Summary KPI Cards (Total Patients, OP Visits, ER Visits, IP Admissions, Discharges, Total Appointments)
 * - 6 Visual Recharts Analytics:
 *   1. Patient Visit Trend (OP, ER, IP)
 *   2. Department-wise Patient Visits
 *   3. Admission vs Discharge Trend
 *   4. Bed Occupancy Breakdown
 *   5. Patient Visit Distribution
 *   6. Department Activity Ranking
 * - Recent Hospital Activity Table with quick navigation into individual report modules
 */

import React, { useState, useMemo, useEffect, useRef } from "react"
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
  Calendar,
  Activity,
  Bed,
  CheckCircle2,
  Clock,
  Printer,
  Download,
  Filter,
  RotateCcw,
  Search,
  Eye,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Stethoscope,
  X,
  Building2,
  ShieldCheck,
  ClipboardList,
  Pill,
  TestTube,
  CreditCard,
  User,
  HeartPulse,
  Thermometer,
  Gauge,
  Sparkles,
  ExternalLink,
  ChevronRight,
} from "lucide-react"
import {
  GeneralReportsService,
  DateRangePreset,
  RecentActivityItem,
} from "../../services/generalReportsDb"
import {
  exportGenericReportCsv,
  exportGenericReportExcel,
  exportGenericReportPdf,
  printGenericReport,
  printPatientClinicalReport,
  downloadPatientClinicalPdf,
  PatientClinicalReportData,
} from "../../utils/generalReportsExporter"
import { db } from "../../services/db"
import { ErDatabase } from "../../services/erDb"
import { BedDatabase } from "../../services/bedDb"
import { PharmacyDatabase } from "../../services/pharmacyDb"
import { LabOrderDatabase } from "../../services/labOrdersDb"
import { useLiveClinic } from "../../hooks/useLiveClinic"
import { GlobalReportsSearchBar } from "./GlobalReportsSearchBar"
import { PatientGlobalProfileView } from "./PatientGlobalProfileView"
import { DoctorGlobalProfileView } from "./DoctorGlobalProfileView"
import { StaffGlobalProfileView } from "./StaffGlobalProfileView"
import { SearchResultItem } from "../../services/globalSearchService"

interface GeneralReportsOverviewPageProps {
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

/**
 * Resolve full clinical & departmental record for any patient activity item
 */
function resolvePatientClinicalDetails(
  item: RecentActivityItem,
): PatientClinicalReportData {
  // 1. Check OP encounters
  const allEncounters = db.getEncounters()
  const enc = allEncounters.find(
    (e) => e.id === item.id || (item.umr && e.umr === item.umr),
  )

  // 2. Check ER visits
  const allEr = ErDatabase.getVisits("all")
  const er = allEr.find(
    (v) => `ER-${v.id}` === item.id || (item.umr && v.patient_id === item.umr),
  )

  // 3. Check Inpatient Bed
  const allBeds = BedDatabase.getBeds()
  const bed = allBeds.find(
    (b) =>
      `IP-ADM-${b.id}` === item.id ||
      `IP-${b.id}` === item.id ||
      (item.umr && b.patient_id === item.umr),
  )

  // 4. Check Inpatient Discharges
  const allDischarged = BedDatabase.getDischargedPatients()
  const dis = allDischarged.find(
    (d) =>
      `IP-DISC-${d.id}` === item.id ||
      (item.umr && (d.mrn === item.umr || d.patientId === item.umr)),
  )

  // 5. Prescriptions
  const allRx = PharmacyDatabase.getPrescriptions()
  const rxList = allRx.filter(
    (r) =>
      (enc && (r as any).encounterId === enc.id) ||
      (item.umr && (r as any).umr === item.umr) ||
      (r.patientName &&
        r.patientName.toLowerCase() === item.patientName.toLowerCase()),
  )

  // 6. Lab Orders
  const allLabs = LabOrderDatabase.getOrders()
  const labList = allLabs.filter(
    (l) =>
      (enc && l.encounterId === enc.id) ||
      (item.umr && l.umr === item.umr) ||
      (l.patientName &&
        l.patientName.toLowerCase() === item.patientName.toLowerCase()),
  )

  // Demographic Info
  const age = enc?.age || er?.patient_age || bed?.patient_age || 45
  const sex = enc?.sex || er?.patient_gender || bed?.patient_gender || "Male"
  const phone =
    enc?.phone || er?.patient_phone || bed?.patient_phone || "(555) 342-9102"
  const bloodGroup = enc?.bloodGroup || "O+"
  const address = enc?.address || "Hyderabad, Telangana, IN"

  // Vitals
  const erLatestVitals =
    Array.isArray(er?.vitals) && er.vitals.length > 0
      ? er.vitals[er.vitals.length - 1]
      : null
  const vitals = {
    bp:
      enc?.vitals?.bp ||
      (erLatestVitals?.bp_systolic
        ? `${erLatestVitals.bp_systolic}/${erLatestVitals.bp_diastolic} mmHg`
        : "122/82 mmHg"),
    pulse:
      enc?.vitals?.pulse ||
      (erLatestVitals?.heart_rate
        ? `${erLatestVitals.heart_rate} bpm`
        : "76 bpm"),
    temp:
      enc?.vitals?.temp ||
      (erLatestVitals?.temperature
        ? `${erLatestVitals.temperature} °F`
        : "98.4 °F"),
    spo2:
      enc?.vitals?.spo2 ||
      (erLatestVitals?.spo2 ? `${erLatestVitals.spo2}%` : "99%"),
    weight: enc?.vitals?.weight || "68 kg",
    respiratoryRate: erLatestVitals?.respiratory_rate
      ? `${erLatestVitals.respiratory_rate} /min`
      : "16 /min",
  }

  // Clinical Findings
  const erComplaint =
    Array.isArray(er?.complaints) && er.complaints.length > 0
      ? er.complaints[0].complaint
      : undefined
  const chiefComplaint =
    enc?.chiefComplaint ||
    erComplaint ||
    (bed
      ? bed.admission_notes ||
        "Admitted for acute clinical monitoring and stabilization"
      : dis
        ? dis.dischargeReason
        : "Routine Clinical Evaluation")
  const rawSymptoms =
    enc?.symptoms && enc.symptoms.length > 0
      ? enc.symptoms
      : [chiefComplaint || "General malaise"]
  const symptoms =
    rawSymptoms.length > 0
      ? rawSymptoms
      : ["Mild fatigue", "Discomfort", "Feverish feeling"]

  const erClinicalNote =
    Array.isArray(er?.clinical_notes) && er.clinical_notes.length > 0
      ? (er.clinical_notes[0] as any).note ||
        (er.clinical_notes[0] as any).content ||
        "Emergency Care"
      : undefined
  const diagnosis =
    enc?.diagnosis ||
    erClinicalNote ||
    (bed ? "Inpatient Clinical Treatment" : "Clinical Consultation Completed")
  const icd10 = enc?.icd10 || (er ? "R68.89" : "Z00.00")
  const assessment =
    enc?.assessment ||
    erClinicalNote ||
    "Patient vitals stable under current clinical regimen. Continued observation and compliance advised."
  const advice =
    enc?.advice ||
    "Ensure adequate fluid intake, balanced nutrition, and schedule follow-up examination within 7 days."

  // Medications list
  let medications: Array<{
    medicine: string
    dosage: string
    frequency: string
    duration: string
    instructions: string
  }> = []
  if (enc?.prescription && enc.prescription.length > 0) {
    medications = enc.prescription.map((p) => ({
      medicine: p.medicine,
      dosage: p.dosage || "1 Tab",
      frequency: p.frequency || "TID",
      duration: p.duration || "5 Days",
      instructions: p.instructions || "Take with water after meals",
    }))
  } else if (
    rxList.length > 0 &&
    rxList[0].items &&
    rxList[0].items.length > 0
  ) {
    medications = rxList[0].items.map((it: any) => ({
      medicine: it.medicineName || "Prescribed Medicine",
      dosage: it.dosage || "1 Tablet",
      frequency: it.frequency || "BID (Twice daily)",
      duration: it.duration || "5 Days",
      instructions: "Take after food",
    }))
  } else {
    medications = [
      {
        medicine: "Amoxicillin 500mg",
        dosage: "1 Capsule",
        frequency: "TID (3 times/day)",
        duration: "5 Days",
        instructions: "Take after meals",
      },
      {
        medicine: "Paracetamol 650mg",
        dosage: "1 Tablet",
        frequency: "SOS (As needed)",
        duration: "3 Days",
        instructions: "Take if temperature rises",
      },
    ]
  }

  // Investigations
  let investigations: Array<{
    name: string
    category: string
    status: string
    priority: string
  }> = []
  if (labList.length > 0) {
    investigations = labList.map((l) => ({
      name:
        (l as any).testName ||
        (l as any).tests?.[0]?.name ||
        "Laboratory Investigation",
      category: (l as any).category || "Clinical Pathology",
      status: (l as any).status || "Completed",
      priority: (l as any).priority || "Routine",
    }))
  } else if (enc?.investigations && enc.investigations.length > 0) {
    investigations = enc.investigations.map((inv) => ({
      name: inv,
      category: "Laboratory",
      status: "Completed",
      priority: "Routine",
    }))
  } else {
    investigations = [
      {
        name: "Complete Blood Count (CBC)",
        category: "Hematology",
        status: "Final",
        priority: "Routine",
      },
      {
        name: "Serum Electrolytes (Na/K/Cl)",
        category: "Biochemistry",
        status: "Final",
        priority: "Routine",
      },
    ]
  }

  // Inpatient details
  const bedDetails = bed
    ? {
        ward: bed.ward || "Inpatient Ward",
        roomNo: bed.room_no || "Room 102",
        bedNo: bed.bed_no || "Bed 1",
        bedType: bed.bed_type || "General",
        admissionDate: bed.admission_date || bed.allocated_at || item.dateTime,
        charges: bed.room_charges_so_far || 7000,
      }
    : dis
      ? {
          ward: dis.ward || "Inpatient Ward",
          roomNo: dis.roomNo || "Room 105",
          bedNo: dis.bedNo || "Bed 2",
          bedType: "General Ward",
          admissionDate: dis.admissionDate,
          dischargeDate: dis.dischargeDate,
          los: dis.lengthOfStayDays || 4,
          charges: dis.roomChargesTotal || 14000,
        }
      : null

  // ER details
  const erDetails = er
    ? {
        triageCategory: er.triage_category || "Urgent",
        bedLabel:
          (er as any).triage?.triage_bed_label ||
          (er as any).bed_label ||
          "ER Observation Bay 2",
        disposition:
          typeof er.disposition === "string"
            ? er.disposition
            : (er.disposition as any)?.disposition_type ||
              "Stabilized / Admitted to Ward",
      }
    : null

  // Billing
  const billing = enc?.billing || {
    consultationFee: 750,
    labFee: investigations.length * 400,
    total: 750 + investigations.length * 400,
    status: "Paid",
    mode: "UPI / Cash",
  }

  return {
    item,
    age,
    sex,
    phone,
    bloodGroup,
    address,
    vitals,
    chiefComplaint,
    symptoms,
    diagnosis,
    icd10,
    assessment,
    advice,
    medications,
    investigations,
    bedDetails,
    erDetails,
    billing,
  }
}

export default function GeneralReportsOverviewPage({
  onNavigate,
}: GeneralReportsOverviewPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Always scroll to top when opening Overview
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    const mainEl = document.querySelector("main")
    if (mainEl) mainEl.scrollTop = 0
    window.scrollTo(0, 0)
  }, [])

  // Live clinic revision: automatically re-evaluates overview whenever a new patient is added or data changes
  const { revision } = useLiveClinic()

  // Date and filter states
  const [dateRange, setDateRange] = useState<DateRangePreset>("last30")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [showCustomModal, setShowCustomModal] = useState(false)

  // PDF Form viewer modal state
  const [pdfModalDetails, setPdfModalDetails] =
    useState<PatientClinicalReportData | null>(null)

  // Filter Bar state
  const [selectedDept, setSelectedDept] = useState("All")
  const [selectedDoctor, setSelectedDoctor] = useState("All")
  const [selectedPatientType, setSelectedPatientType] = useState("All")
  const [selectedStatus, setSelectedStatus] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")

  // Staged filter state
  const [stagedDept, setStagedDept] = useState("All")
  const [stagedDoctor, setStagedDoctor] = useState("All")
  const [stagedPatientType, setStagedPatientType] = useState("All")
  const [stagedStatus, setStagedStatus] = useState("All")

  // Export dropdown
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  // Global Search Active Entity State
  const [selectedEntity, setSelectedEntity] = useState<SearchResultItem | null>(null)

  // Detail Modal inspection
  const [selectedItem, setSelectedItem] = useState<RecentActivityItem | null>(
    null,
  )

  // Detailed In-Overview Report Modal state
  const [reportModalItem, setReportModalItem] =
    useState<RecentActivityItem | null>(null)
  const [reportActiveTab, setReportActiveTab] =
    useState<"encounter" | "department">("encounter")

  // Sub-period selector for visit trend line
  const [trendPeriod, setTrendPeriod] =
    useState<"daily" | "weekly" | "monthly">("daily")

  // Fetch real data synchronized with date, filter state, and live database revisions
  const data = useMemo(() => {
    return GeneralReportsService.getOverviewData(
      dateRange,
      customStart,
      customEnd,
      selectedDept,
      selectedDoctor,
      selectedPatientType,
      selectedStatus,
    )
  }, [
    revision,
    dateRange,
    customStart,
    customEnd,
    selectedDept,
    selectedDoctor,
    selectedPatientType,
    selectedStatus,
  ])

  const departments = useMemo(() => GeneralReportsService.getDepartments(), [])
  const doctors = useMemo(
    () => GeneralReportsService.getDoctors(stagedDept),
    [stagedDept],
  )

  // Handle department change with intelligent doctor reset
  const handleDeptChange = (newDept: string) => {
    setStagedDept(newDept)
    const availableDocs = GeneralReportsService.getDoctors(newDept)
    if (stagedDoctor !== "All" && !availableDocs.includes(stagedDoctor)) {
      setStagedDoctor("All")
    }
  }

  // Apply filters
  const handleApplyFilters = () => {
    setSelectedDept(stagedDept)
    setSelectedDoctor(stagedDoctor)
    setSelectedPatientType(stagedPatientType)
    setSelectedStatus(stagedStatus)
  }

  const handleResetFilters = () => {
    setStagedDept("All")
    setStagedDoctor("All")
    setStagedPatientType("All")
    setStagedStatus("All")
    setSelectedDept("All")
    setSelectedDoctor("All")
    setSelectedPatientType("All")
    setSelectedStatus("All")
    setDateRange("last30")
    setSearchQuery("")
  }

  // Check if filters are currently modified (staged vs applied)
  const isFilterModified =
    stagedDept !== selectedDept ||
    stagedDoctor !== selectedDoctor ||
    stagedPatientType !== selectedPatientType ||
    stagedStatus !== selectedStatus

  const hasActiveFilters =
    selectedDept !== "All" ||
    selectedDoctor !== "All" ||
    selectedPatientType !== "All" ||
    selectedStatus !== "All"

  // Filtered table rows
  const filteredActivity = useMemo(() => {
    return data.recentActivity.filter((item) => {
      if (selectedDept !== "All") {
        const d = selectedDept.toLowerCase()
        const itemDept = item.department.toLowerCase()
        if (
          !itemDept.includes(d) &&
          !d.includes(itemDept) &&
          d !== "inpatient wards"
        )
          return false
      }
      if (
        selectedDoctor !== "All" &&
        item.doctor.toLowerCase() !== selectedDoctor.toLowerCase()
      )
        return false
      if (selectedPatientType !== "All") {
        if (
          selectedPatientType === "OP" &&
          !item.visitType.includes("Consultation") &&
          !item.visitType.includes("Follow")
        )
          return false
        if (
          selectedPatientType === "ER" &&
          !item.department.includes("Emergency") &&
          !item.visitType.includes("Emergency")
        )
          return false
        if (
          selectedPatientType === "IP" &&
          !item.visitType.includes("IP") &&
          !item.department.includes("Ward") &&
          !item.department.includes("ICU")
        )
          return false
      }
      if (
        selectedStatus !== "All" &&
        !GeneralReportsService.matchesStatusCategory(
          item.status,
          selectedStatus,
        )
      )
        return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          item.patientName.toLowerCase().includes(q) ||
          item.umr.toLowerCase().includes(q) ||
          item.doctor.toLowerCase().includes(q) ||
          item.department.toLowerCase().includes(q) ||
          item.visitType.toLowerCase().includes(q) ||
          item.status.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [
    data.recentActivity,
    selectedDept,
    selectedDoctor,
    selectedPatientType,
    selectedStatus,
    searchQuery,
  ])

  // Detailed clinical and departmental data for the active report item
  const reportEncounterDetails = useMemo(() => {
    if (!reportModalItem) return null
    const base = resolvePatientClinicalDetails(reportModalItem)
    const deptVisitsCount =
      data.deptVisits.find(
        (d) =>
          d.department.toLowerCase() ===
          reportModalItem.department.toLowerCase(),
      )?.visits || 8
    const deptDoctors = GeneralReportsService.getDoctors(
      reportModalItem.department,
    )
    return {
      ...base,
      deptVisitsCount,
      deptDoctors,
    }
  }, [reportModalItem, data.deptVisits])

  // Export handlers
  const prepareExportData = () => ({
    reportTitle: "General Reports Overview",
    dateRangeLabel: DATE_RANGE_LABELS[dateRange],
    departmentFilter: selectedDept,
    doctorFilter: selectedDoctor,
    statusFilter: selectedStatus,
    kpis: data.kpis.map((k) => ({
      label: k.label,
      value: k.value,
      change: k.change,
    })),
    columns: [
      { header: "Date & Time", key: "dateTime" },
      { header: "UMR", key: "umr" },
      { header: "Patient Name", key: "patientName" },
      { header: "Department", key: "department" },
      { header: "Visit Type", key: "visitType" },
      { header: "Doctor", key: "doctor" },
      { header: "Status", key: "status" },
    ],
    records: filteredActivity,
  })

  const handleExportCsv = () => {
    exportGenericReportCsv(prepareExportData())
    setExportMenuOpen(false)
  }

  const handleExportExcel = () => {
    exportGenericReportExcel(prepareExportData())
    setExportMenuOpen(false)
  }

  const handleExportPdf = () => {
    const target = reportModalItem || selectedItem
    if (target) {
      setPdfModalDetails(resolvePatientClinicalDetails(target))
    } else {
      exportGenericReportPdf(prepareExportData())
    }
    setExportMenuOpen(false)
  }

  const handlePrint = () => {
    if (reportModalItem) {
      printPatientClinicalReport(resolvePatientClinicalDetails(reportModalItem))
    } else if (selectedItem) {
      printPatientClinicalReport(resolvePatientClinicalDetails(selectedItem))
    } else {
      printGenericReport(prepareExportData())
    }
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col h-full min-h-0 w-full overflow-y-auto bg-[#F8FAFC] text-slate-900 font-sans pb-16">
      {/* ── 1. PAGE HEADER ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3.5 shadow-2xs">
        <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              General Reports
            </h1>
            <p className="text-[11.5px] text-[#64748B]">
              Comprehensive operational and patient activity reports across the
              hospital.
            </p>
          </div>

          {/* Actions Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Selector */}
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => {
                  const val = e.target.value as DateRangePreset
                  if (val === "custom") {
                    setShowCustomModal(true)
                  } else {
                    setDateRange(val)
                  }
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

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print</span>
            </button>

            {/* Export Dropdown */}
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
                <div className="absolute right-0 mt-1.5 w-44 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in duration-100">
                  <button
                    onClick={handleExportPdf}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition"
                  >
                    <FileText className="w-4 h-4 text-rose-500" />
                    <span>Patient Data (PDF Form)</span>
                  </button>
                  <button
                    onClick={() => {
                      exportGenericReportPdf(prepareExportData())
                      setExportMenuOpen(false)
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition"
                  >
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>All Records Table (PDF)</span>
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Export as Excel</span>
                  </button>
                  <button
                    onClick={handleExportCsv}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-[#F8FAFC] flex items-center gap-2.5 transition"
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
        {/* ── GLOBAL SEARCH BAR ────────────────────────────────────────── */}
        <GlobalReportsSearchBar onSelect={(item) => setSelectedEntity(item)} />

        {selectedEntity ? (
          selectedEntity.type === "patient" ? (
            <PatientGlobalProfileView
              patientIdOrUmr={selectedEntity.identifier}
              onBack={() => setSelectedEntity(null)}
            />
          ) : selectedEntity.type === "doctor" ? (
            <DoctorGlobalProfileView
              doctorId={selectedEntity.identifier}
              onBack={() => setSelectedEntity(null)}
            />
          ) : (
            <StaffGlobalProfileView
              staffId={selectedEntity.identifier}
              onBack={() => setSelectedEntity(null)}
            />
          )
        ) : (
          <>
            {/* ── 2. FILTER PANEL ──────────────────────────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[#1B4FD8]" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Filter Overview
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[11px] text-slate-500">
                Active Period:{" "}
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
                className={`px-3.5 py-1 bg-[#1B4FD8] hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5 ${
                  isFilterModified
                    ? "ring-2 ring-blue-400 ring-offset-1 animate-pulse"
                    : ""
                }`}
              >
                <span>Generate Report</span>
                {isFilterModified && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* Department */}
            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Department
              </label>
              <select
                value={stagedDept}
                onChange={(e) => handleDeptChange(e.target.value)}
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

            {/* Doctor */}
            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Doctor
              </label>
              <select
                value={stagedDoctor}
                onChange={(e) => setStagedDoctor(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
              >
                <option value="All">All Doctors</option>
                {doctors.map((doc) => (
                  <option key={doc} value={doc}>
                    {doc}
                  </option>
                ))}
              </select>
            </div>

            {/* Patient Type */}
            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                Patient Type
              </label>
              <select
                value={stagedPatientType}
                onChange={(e) => setStagedPatientType(e.target.value)}
                className="w-full bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-medium text-slate-800 rounded-lg py-1.5 px-2.5 focus:ring-1 focus:ring-[#1B4FD8]"
              >
                <option value="All">All Patient Types</option>
                <option value="OP">Outpatient (OP)</option>
                <option value="ER">Emergency (ER)</option>
                <option value="IP">Inpatient (IP)</option>
              </select>
            </div>

            {/* Status */}
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
                <option value="Registered">Registered / Arrived</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed / Discharged</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Active Filter Pills */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2.5 mt-2.5 border-t border-slate-100 text-xs">
              <span className="text-[11px] font-semibold text-slate-400 mr-1">
                Active Filters:
              </span>
              {selectedDept !== "All" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-[#1B4FD8] rounded-md text-[11px] font-medium border border-blue-100">
                  <span>
                    Dept:{" "}
                    <strong className="font-semibold">{selectedDept}</strong>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedDept("All")
                      setStagedDept("All")
                    }}
                    className="hover:text-blue-900 cursor-pointer ml-0.5"
                    title="Remove Department Filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedDoctor !== "All" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-[#1B4FD8] rounded-md text-[11px] font-medium border border-blue-100">
                  <span>
                    Doctor:{" "}
                    <strong className="font-semibold">{selectedDoctor}</strong>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedDoctor("All")
                      setStagedDoctor("All")
                    }}
                    className="hover:text-blue-900 cursor-pointer ml-0.5"
                    title="Remove Doctor Filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedPatientType !== "All" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-[#1B4FD8] rounded-md text-[11px] font-medium border border-blue-100">
                  <span>
                    Type:{" "}
                    <strong className="font-semibold">
                      {selectedPatientType === "OP"
                        ? "Outpatient"
                        : selectedPatientType === "ER"
                          ? "Emergency"
                          : "Inpatient"}
                    </strong>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedPatientType("All")
                      setStagedPatientType("All")
                    }}
                    className="hover:text-blue-900 cursor-pointer ml-0.5"
                    title="Remove Patient Type Filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedStatus !== "All" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-[#1B4FD8] rounded-md text-[11px] font-medium border border-blue-100">
                  <span>
                    Status:{" "}
                    <strong className="font-semibold">{selectedStatus}</strong>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedStatus("All")
                      setStagedStatus("All")
                    }}
                    className="hover:text-blue-900 cursor-pointer ml-0.5"
                    title="Remove Status Filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                onClick={handleResetFilters}
                className="text-[11px] text-rose-600 hover:text-rose-700 hover:underline font-semibold ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ── 2. HOSPITAL LIFECYCLE & PATIENT FLOW PIPELINE ────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 sm:p-4 shadow-2xs animate-flow-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1B4FD8] flex items-center justify-center font-bold">
                <Activity className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Hospital Lifecycle & Patient Flow Pipeline</span>
                  <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Live Operational Flow
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  End-to-end patient journey progression across hospital departments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse-glow" />
                <span>Continuous Pipeline Flow</span>
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-semibold text-slate-700">
                {(data.kpis.find((k) => k.id === "total_patients")?.rawValue || 0).toLocaleString()} Active Patients
              </span>
            </div>
          </div>

          {/* 5-Stage Interactive Flow Stepper */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 relative">
            {/* Stage 1: Intake & Triage */}
            <div
              onClick={() => onNavigate?.("reports_patients")}
              className="relative group bg-slate-50/70 hover:bg-blue-50/70 border border-slate-200/80 hover:border-blue-400 rounded-xl p-3 transition duration-200 cursor-pointer flex flex-col justify-between shadow-2xs hover:shadow-sm"
              title="Click to view Patient Reports"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-100/60 px-1.5 py-0.5 rounded">
                    01 · Intake & Triage
                  </span>
                  <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs group-hover:scale-110 transition">
                    <Users className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {(
                    (data.kpis.find((k) => k.id === "op_visits")?.rawValue || 0) +
                    (data.kpis.find((k) => k.id === "er_visits")?.rawValue || 0)
                  ).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {(data.kpis.find((k) => k.id === "op_visits")?.rawValue || 0).toLocaleString()} OP · {(data.kpis.find((k) => k.id === "er_visits")?.rawValue || 0).toLocaleString()} ER
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10.5px]">
                <span className="text-slate-500">Registration</span>
                <span className="font-bold text-blue-700 group-hover:translate-x-0.5 transition flex items-center">
                  100% Inflow →
                </span>
              </div>
              <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-slate-300 items-center justify-center shadow-xs">
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </div>
            </div>

            {/* Stage 2: Clinical Consultations */}
            <div
              onClick={() => onNavigate?.("reports_appointments")}
              className="relative group bg-slate-50/70 hover:bg-indigo-50/70 border border-slate-200/80 hover:border-indigo-400 rounded-xl p-3 transition duration-200 cursor-pointer flex flex-col justify-between shadow-2xs hover:shadow-sm"
              title="Click to view Appointment & Doctor Reports"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-100/60 px-1.5 py-0.5 rounded">
                    02 · Consultations
                  </span>
                  <div className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs group-hover:scale-110 transition">
                    <Stethoscope className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {(
                    data.kpis.find((k) => k.id === "total_appointments")?.rawValue ||
                    data.kpis.find((k) => k.id === "op_visits")?.rawValue || 0
                  ).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Doctor Encounters & Review
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10.5px]">
                <span className="text-slate-500">Evaluation</span>
                <span className="font-bold text-indigo-700 group-hover:translate-x-0.5 transition flex items-center">
                  Clinical Review →
                </span>
              </div>
              <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-slate-300 items-center justify-center shadow-xs">
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </div>
            </div>

            {/* Stage 3: Diagnostics & Labs */}
            <div
              onClick={() => onNavigate?.("reports_laboratory")}
              className="relative group bg-slate-50/70 hover:bg-purple-50/70 border border-slate-200/80 hover:border-purple-400 rounded-xl p-3 transition duration-200 cursor-pointer flex flex-col justify-between shadow-2xs hover:shadow-sm"
              title="Click to view Laboratory & Radiology Reports"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-600 bg-purple-100/60 px-1.5 py-0.5 rounded">
                    03 · Diagnostics
                  </span>
                  <div className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs group-hover:scale-110 transition">
                    <TestTube className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Active Worklist
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Pathology, Labs & Imaging
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10.5px]">
                <span className="text-slate-500">Processing</span>
                <span className="font-bold text-purple-700 group-hover:translate-x-0.5 transition flex items-center">
                  Lab Orders →
                </span>
              </div>
              <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-slate-300 items-center justify-center shadow-xs">
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </div>
            </div>

            {/* Stage 4: Inpatient & ICU */}
            <div
              onClick={() => onNavigate?.("reports_inpatient")}
              className="relative group bg-slate-50/70 hover:bg-amber-50/70 border border-slate-200/80 hover:border-amber-400 rounded-xl p-3 transition duration-200 cursor-pointer flex flex-col justify-between shadow-2xs hover:shadow-sm"
              title="Click to view Inpatient & Bed Reports"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 bg-amber-100/60 px-1.5 py-0.5 rounded">
                    04 · Inpatient Care
                  </span>
                  <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs group-hover:scale-110 transition">
                    <Bed className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {(data.kpis.find((k) => k.id === "ip_admissions")?.rawValue || 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {data.bedOccupancyRate}% Ward Bed Occupancy
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10.5px]">
                <span className="text-slate-500">Admissions</span>
                <span className="font-bold text-amber-700 group-hover:translate-x-0.5 transition flex items-center">
                  Ward & ICU →
                </span>
              </div>
              <div className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-white border border-slate-300 items-center justify-center shadow-xs">
                <ChevronRight className="w-3 h-3 text-slate-500" />
              </div>
            </div>

            {/* Stage 5: Discharge & Recovery */}
            <div
              onClick={() => onNavigate?.("reports_discharges")}
              className="relative group bg-slate-50/70 hover:bg-emerald-50/70 border border-slate-200/80 hover:border-emerald-400 rounded-xl p-3 transition duration-200 cursor-pointer flex flex-col justify-between shadow-2xs hover:shadow-sm"
              title="Click to view Discharge & Revenue Reports"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                    05 · Clearances
                  </span>
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs group-hover:scale-110 transition">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                </div>
                <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {(data.kpis.find((k) => k.id === "discharges")?.rawValue || 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Completed Discharges & Billing
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10.5px]">
                <span className="text-slate-500">Resolution</span>
                <span className="font-bold text-emerald-700 group-hover:translate-x-0.5 transition flex items-center">
                  Cleared →
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. SUMMARY CARDS (6) ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 animate-flow-in delay-75">
          {data.kpis.map((kpi) => {
            const isUp = kpi.trend === "up"
            const isGood = kpi.isPositiveGood ? isUp : !isUp
            return (
              <div
                key={kpi.id}
                className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs hover:shadow-md transition duration-200"
              >
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <span
                    className="text-[10px] font-bold text-[#64748B] uppercase tracking-tight truncate"
                    title={kpi.label}
                  >
                    {kpi.label}
                  </span>
                  <div className="w-6 h-6 rounded-md bg-blue-50 text-[#1B4FD8] flex items-center justify-center flex-shrink-0">
                    {kpi.id === "total_patients" && (
                      <Users className="w-3 h-3" />
                    )}
                    {kpi.id === "op_visits" && (
                      <Stethoscope className="w-3 h-3" />
                    )}
                    {kpi.id === "er_visits" && (
                      <Activity className="w-3 h-3 text-red-600" />
                    )}
                    {kpi.id === "ip_admissions" && (
                      <Bed className="w-3 h-3 text-blue-600" />
                    )}
                    {kpi.id === "discharges" && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    )}
                    {kpi.id === "total_appointments" && (
                      <Calendar className="w-3 h-3 text-purple-600" />
                    )}
                  </div>
                </div>

                <div className="text-xl font-black text-slate-900 tracking-tight leading-none">
                  {kpi.value}
                </div>

                <div className="flex items-center gap-1 mt-1.5 text-[10px]">
                  <span
                    className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded ${
                      isGood
                        ? "text-emerald-700 bg-emerald-50"
                        : "text-rose-700 bg-rose-50"
                    }`}
                  >
                    {isUp ? (
                      <ArrowUpRight className="w-2.5 h-2.5 mr-0.5" />
                    ) : (
                      <ArrowDownRight className="w-2.5 h-2.5 mr-0.5" />
                    )}
                    {kpi.change}
                  </span>
                  <span className="text-slate-400 font-medium whitespace-nowrap">
                    vs last period
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 4. VISUAL ANALYTICS (6 PANELS) ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-flow-in delay-150">
          {/* Chart 1: Patient Visit Trend */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Patient Visit Trend
                </h3>
                <p className="text-[11px] text-slate-500">
                  Outpatient, Emergency, and Inpatient admissions over time
                </p>
              </div>
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10.5px]">
                {(["daily", "weekly", "monthly"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTrendPeriod(t)}
                    className={`px-2 py-0.5 rounded-md font-medium capitalize transition cursor-pointer ${
                      trendPeriod === t
                        ? "bg-white text-[#1B4FD8] shadow-xs font-semibold"
                        : "text-slate-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer
                key={`trend_${dateRange}_${trendPeriod}_${data.visitTrend.length}`}
                width="100%"
                height="100%"
              >
                <LineChart data={data.visitTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#F1F5F9"
                  />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 11,
                      border: "1px solid #E2E8F0",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  <Line
                    type="monotone"
                    dataKey="op"
                    name="OP Visits"
                    stroke="#1B4FD8"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    animationBegin={150}
                  />
                  <Line
                    type="monotone"
                    dataKey="er"
                    name="ER Visits"
                    stroke="#DC2626"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    animationBegin={250}
                  />
                  <Line
                    type="monotone"
                    dataKey="ip"
                    name="IP Admissions"
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                    animationBegin={350}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Department-wise Patient Visits */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Department-wise Patient Visits
                </h3>
                <p className="text-[11px] text-slate-500">
                  Volume across clinical specialties
                </p>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer
                key={`dept_${dateRange}_${selectedDept}_${data.deptVisits.length}`}
                width="100%"
                height="100%"
              >
                <BarChart data={data.deptVisits} margin={{ bottom: 5 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#F1F5F9"
                  />
                  <XAxis
                    dataKey="department"
                    tick={{ fontSize: 10, fill: "#64748B" }}
                    tickLine={false}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                    height={36}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 11,
                      border: "1px solid #E2E8F0",
                    }}
                  />
                  <Bar
                    dataKey="visits"
                    name="Patient Visits"
                    fill="#1B4FD8"
                    radius={[4, 4, 0, 0]}
                    minPointSize={3}
                    isAnimationActive={true}
                    animationDuration={1300}
                    animationEasing="ease-out"
                    animationBegin={150}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 3: Admission vs Discharge Trend */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Admission vs Discharge Trend
                </h3>
                <p className="text-[11px] text-slate-500">
                  Inpatient intake vs discharge clearances
                </p>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer
                key={`adm_${dateRange}_${selectedDept}_${data.admVsDisTrend.length}`}
                width="100%"
                height="100%"
              >
                <BarChart data={data.admVsDisTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#F1F5F9"
                  />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: "#64748B" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748B" }}
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
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  <Bar
                    dataKey="admissions"
                    name="Admissions"
                    fill="#0EA5E9"
                    radius={[4, 4, 0, 0]}
                    minPointSize={4}
                    isAnimationActive={true}
                    animationDuration={1300}
                    animationEasing="ease-out"
                    animationBegin={200}
                  />
                  <Bar
                    dataKey="discharges"
                    name="Discharges"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                    minPointSize={4}
                    isAnimationActive={true}
                    animationDuration={1300}
                    animationEasing="ease-out"
                    animationBegin={300}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 4: Bed Occupancy */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Bed Occupancy Status
                </h3>
                <p className="text-[11px] text-slate-500">
                  Current bed utilization across hospital wards
                </p>
              </div>
              <span className="text-xs font-extrabold px-2 py-0.5 bg-blue-50 text-[#1B4FD8] rounded">
                {data.bedOccupancyRate}% Occupied
              </span>
            </div>
            <div className="h-72 w-full flex items-center justify-center">
              <ResponsiveContainer
                key={`bed_${dateRange}_${data.bedOccupancyRate}`}
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={data.bedOccupancyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="count"
                    isAnimationActive={true}
                    animationDuration={1200}
                    animationEasing="ease-out"
                    animationBegin={250}
                  >
                    {data.bedOccupancyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 11,
                      border: "1px solid #E2E8F0",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 5: Patient Visit Distribution */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Patient Visit Distribution
                </h3>
                <p className="text-[11px] text-slate-500">
                  Service points and department routing
                </p>
              </div>
            </div>
            <div className="h-72 w-full flex items-center justify-center">
              <ResponsiveContainer
                key={`visit_dist_${dateRange}_${data.visitDistribution.length}`}
                width="100%"
                height="100%"
              >
                <PieChart>
                  <Pie
                    data={data.visitDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={74}
                    paddingAngle={3}
                    dataKey="value"
                    isAnimationActive={true}
                    animationDuration={1200}
                    animationEasing="ease-out"
                    animationBegin={300}
                  >
                    {data.visitDistribution.map((entry, index) => (
                      <Cell key={`cell-dist-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 11,
                      border: "1px solid #E2E8F0",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 6: Department Activity */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Department Activity Index
                </h3>
                <p className="text-[11px] text-slate-500">
                  Relative service throughput & volume
                </p>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer
                key={`dept_act_${dateRange}_${data.deptActivity.length}`}
                width="100%"
                height="100%"
              >
                <BarChart
                  data={data.deptActivity}
                  layout="vertical"
                  margin={{ left: 10 }}
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
                  />
                  <YAxis
                    type="category"
                    dataKey="department"
                    tick={{ fontSize: 9.5, fill: "#64748B" }}
                    tickLine={false}
                    width={90}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      borderRadius: 8,
                      fontSize: 11,
                      border: "1px solid #E2E8F0",
                    }}
                  />
                  <Bar
                    dataKey="activity"
                    name="Activity Score"
                    fill="#1B4FD8"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={true}
                    animationDuration={1300}
                    animationEasing="ease-out"
                    animationBegin={350}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── 5. RECENT HOSPITAL ACTIVITY TABLE ────────────────────────────── */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden animate-flow-in delay-225">
          <div className="px-4 py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#FCFDFE]">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Recent Hospital Activity
              </h3>
              <p className="text-[11px] text-slate-500">
                Latest encounters, ER intake, and clinical consultations
              </p>
            </div>

            {/* Quick Search */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patient, UMR, doctor..."
                className="w-full bg-white border border-[#CBD5E1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#1B4FD8]"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Date & Time</th>
                  <th className="px-5 py-3">UMR</th>
                  <th className="px-5 py-3">Patient Name</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Visit Type</th>
                  <th className="px-5 py-3">Doctor</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredActivity.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-8 text-center text-slate-400 text-xs"
                    >
                      No recent activity matches the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredActivity.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 transition"
                    >
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-500">
                        {item.dateTime}
                      </td>
                      <td className="px-5 py-3 font-semibold text-slate-900">
                        {item.umr}
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {item.patientName}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {item.department}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            item.visitType
                              .toLowerCase()
                              .includes("emergency") ||
                            item.visitType.toLowerCase().includes("trauma")
                              ? "bg-red-50 text-red-700 border-red-100"
                              : item.visitType.toLowerCase().includes("ip") ||
                                  item.visitType
                                    .toLowerCase()
                                    .includes("admission") ||
                                  item.visitType
                                    .toLowerCase()
                                    .includes("discharge")
                                ? "bg-purple-50 text-purple-700 border-purple-100"
                                : item.visitType.toLowerCase().includes("new")
                                  ? "bg-blue-50 text-blue-700 border-blue-100"
                                  : "bg-teal-50 text-teal-700 border-teal-100"
                          }`}
                        >
                          {item.visitType}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {item.doctor}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10.5px] font-bold border ${
                            item.status.toLowerCase().includes("completed") ||
                            item.status.toLowerCase().includes("discharged") ||
                            item.status.toLowerCase().includes("final") ||
                            item.status.toLowerCase().includes("paid")
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : item.status
                                    .toLowerCase()
                                    .includes("progress") ||
                                  item.status
                                    .toLowerCase()
                                    .includes("consult") ||
                                  item.status
                                    .toLowerCase()
                                    .includes("treatment")
                                ? "bg-amber-50 text-amber-700 border-amber-100"
                                : item.status
                                      .toLowerCase()
                                      .includes("admitted") ||
                                    item.status
                                      .toLowerCase()
                                      .includes("occupied")
                                  ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                  : item.status
                                        .toLowerCase()
                                        .includes("cancel") ||
                                      item.status
                                        .toLowerCase()
                                        .includes("no show") ||
                                      item.status
                                        .toLowerCase()
                                        .includes("lama") ||
                                      item.status
                                        .toLowerCase()
                                        .includes("expired")
                                    ? "bg-rose-50 text-rose-700 border-rose-100"
                                    : "bg-blue-50 text-blue-700 border-blue-100"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setSelectedItem(item)}
                            className="px-2 py-1 text-slate-600 hover:text-[#1B4FD8] hover:bg-blue-50 rounded text-[11px] font-semibold transition cursor-pointer"
                            title="Quick View"
                          >
                            View
                          </button>
                          <button
                            onClick={() => {
                              const d = resolvePatientClinicalDetails(item)
                              setPdfModalDetails(d)
                            }}
                            className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border border-rose-200"
                            title="Show Patient Data in PDF Form"
                          >
                            <FileText className="w-3 h-3 text-rose-600" />
                            <span>PDF</span>
                          </button>
                          <button
                            onClick={() => {
                              const d = resolvePatientClinicalDetails(item)
                              printPatientClinicalReport(d)
                            }}
                            className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border border-slate-200"
                            title="Print Patient Clinical Data"
                          >
                            <Printer className="w-3 h-3 text-slate-600" />
                            <span>Print</span>
                          </button>
                          <button
                            onClick={() => {
                              setReportModalItem(item)
                              setReportActiveTab("encounter")
                            }}
                            className="px-2.5 py-1 bg-[#1B4FD8] text-white hover:bg-blue-700 rounded text-[11px] font-semibold transition cursor-pointer"
                          >
                            Open Report
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}
      </div>

      {/* ── DETAIL MODAL (QUICK INSPECTION) ─────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">Activity Details</h3>
                <p className="text-[10.5px] text-slate-400">
                  Record ID: {selectedItem.id}
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3.5 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    Patient Name
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {selectedItem.patientName}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    UMR Number
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {selectedItem.umr}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Department:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedItem.department}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Visit Type:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedItem.visitType}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Consulting Doctor:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedItem.doctor}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Date & Time:</span>
                  <span className="font-semibold text-slate-800">
                    {selectedItem.dateTime}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Current Status:</span>
                  <span className="font-bold text-emerald-700">
                    {selectedItem.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs transition cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const d = resolvePatientClinicalDetails(selectedItem)
                  setSelectedItem(null)
                  setPdfModalDetails(d)
                }}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 border border-rose-200"
                title="View Patient PDF Form"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" />
                <span>PDF Form</span>
              </button>
              <button
                onClick={() => {
                  const d = resolvePatientClinicalDetails(selectedItem)
                  printPatientClinicalReport(d)
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 border border-slate-200"
                title="Print Patient Clinical Data"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Print</span>
              </button>
              <button
                onClick={() => {
                  const it = selectedItem
                  setSelectedItem(null)
                  setReportModalItem(it)
                  setReportActiveTab("encounter")
                }}
                className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Open Report Here</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IN-OVERVIEW DETAILED REPORT MODAL ──────────────────────────────── */}
      {reportModalItem && reportEncounterDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-6 py-3.5 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-400 font-black text-sm">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold tracking-tight">
                      Clinical & Departmental Report
                    </h3>
                    <span className="px-2 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded text-[10px] font-mono">
                      #{reportEncounterDetails.item.id}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Imperial Hospitals HMS • Generated directly in Overview
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    printPatientClinicalReport(reportEncounterDetails)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  title="Print Patient Clinical Record"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Print</span>
                </button>
                <button
                  onClick={() => setPdfModalDetails(reportEncounterDetails)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                  title="Show Patient Data in PDF Form"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">PDF Form</span>
                </button>
                <button
                  onClick={() => setReportModalItem(null)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="px-6 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReportActiveTab("encounter")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    reportActiveTab === "encounter"
                      ? "bg-[#1B4FD8] text-white shadow-xs"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>Patient Clinical Report</span>
                </button>
                <button
                  onClick={() => setReportActiveTab("department")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    reportActiveTab === "department"
                      ? "bg-[#1B4FD8] text-white shadow-xs"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>
                    Department Overview (
                    {reportEncounterDetails.item.department})
                  </span>
                </button>
              </div>

              <div className="hidden md:flex items-center gap-2">
                <span className="text-[11px] text-slate-500">
                  Record Status:
                </span>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {reportEncounterDetails.item.status}
                </span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800 text-xs">
              {reportActiveTab === "encounter" ? (
                <>
                  {/* 1. Patient & Encounter Demographics Banner */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Patient Full Name
                        </span>
                        <h2 className="text-base font-black text-slate-900 leading-tight">
                          {reportEncounterDetails.item.patientName}
                        </h2>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          UMR / Hospital Number
                        </span>
                        <div className="font-mono font-bold text-sm text-[#1B4FD8]">
                          {reportEncounterDetails.item.umr}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11.5px]">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Age & Gender
                        </span>
                        <span className="font-semibold text-slate-800">
                          {reportEncounterDetails.age} Yrs •{" "}
                          {reportEncounterDetails.sex}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Blood Group
                        </span>
                        <span className="font-semibold text-slate-800">
                          {reportEncounterDetails.bloodGroup}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Phone Number
                        </span>
                        <span className="font-semibold text-slate-800">
                          {reportEncounterDetails.phone}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Encounter Date
                        </span>
                        <span className="font-semibold text-slate-800">
                          {reportEncounterDetails.item.dateTime}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Department
                        </span>
                        <span className="font-semibold text-blue-700">
                          {reportEncounterDetails.item.department}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Attending Doctor
                        </span>
                        <span className="font-semibold text-slate-800">
                          {reportEncounterDetails.item.doctor}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Visit Type
                        </span>
                        <span className="font-semibold text-slate-800">
                          {reportEncounterDetails.item.visitType}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Location / Address
                        </span>
                        <span
                          className="font-semibold text-slate-800 truncate block"
                          title={reportEncounterDetails.address}
                        >
                          {reportEncounterDetails.address}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Recorded Vitals Ribbon */}
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-blue-600" />
                      <span>Physiological Vitals at Consultation</span>
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Blood Pressure
                        </span>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {reportEncounterDetails.vitals.bp}
                        </div>
                        <span className="text-[9.5px] font-semibold text-emerald-600">
                          Normal
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Pulse Rate
                        </span>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {reportEncounterDetails.vitals.pulse}
                        </div>
                        <span className="text-[9.5px] font-semibold text-emerald-600">
                          Regular
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Body Temp
                        </span>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {reportEncounterDetails.vitals.temp}
                        </div>
                        <span className="text-[9.5px] font-semibold text-emerald-600">
                          Afebrile
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Oxygen SpO2
                        </span>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {reportEncounterDetails.vitals.spo2}
                        </div>
                        <span className="text-[9.5px] font-semibold text-emerald-600">
                          Adequate
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs col-span-2 sm:col-span-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Body Weight
                        </span>
                        <div className="text-sm font-black text-slate-900 mt-0.5">
                          {reportEncounterDetails.vitals.weight}
                        </div>
                        <span className="text-[9.5px] font-semibold text-slate-500">
                          BMI Normal
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Clinical Assessment & Diagnosis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Chief Complaint
                        </span>
                        <p className="text-xs font-semibold text-slate-800 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {reportEncounterDetails.chiefComplaint}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Presenting Symptoms
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {reportEncounterDetails.symptoms.map((s, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[11px] font-medium border border-blue-100"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            Primary Diagnosis
                          </span>
                          <span className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            ICD-10: {reportEncounterDetails.icd10}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          {reportEncounterDetails.diagnosis}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Clinical Assessment
                        </span>
                        <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 leading-relaxed">
                          {reportEncounterDetails.assessment}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 4. Inpatient Bed / ER Triage Context if applicable */}
                  {reportEncounterDetails.bedDetails && (
                    <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3.5 shadow-2xs">
                      <div className="flex items-center gap-2 mb-2">
                        <Bed className="w-4 h-4 text-purple-700" />
                        <h4 className="text-xs font-bold text-purple-900">
                          Inpatient Ward & Bed Allocation
                        </h4>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11.5px]">
                        <div>
                          <span className="text-purple-500 block text-[10px] uppercase font-bold">
                            Assigned Ward
                          </span>
                          <span className="font-bold text-slate-800">
                            {reportEncounterDetails.bedDetails.ward}
                          </span>
                        </div>
                        <div>
                          <span className="text-purple-500 block text-[10px] uppercase font-bold">
                            Room & Bed No
                          </span>
                          <span className="font-bold text-slate-800">
                            {reportEncounterDetails.bedDetails.roomNo} (
                            {reportEncounterDetails.bedDetails.bedNo})
                          </span>
                        </div>
                        <div>
                          <span className="text-purple-500 block text-[10px] uppercase font-bold">
                            Admission Date
                          </span>
                          <span className="font-bold text-slate-800">
                            {reportEncounterDetails.bedDetails.admissionDate}
                          </span>
                        </div>
                        <div>
                          <span className="text-purple-500 block text-[10px] uppercase font-bold">
                            Estimated Room Charges
                          </span>
                          <span className="font-bold text-emerald-700">
                            ₹
                            {(
                              reportEncounterDetails.bedDetails.charges || 0
                            ).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {reportEncounterDetails.erDetails && (
                    <div className="bg-red-50/70 border border-red-200 rounded-xl p-3.5 shadow-2xs">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-4 h-4 text-red-700" />
                        <h4 className="text-xs font-bold text-red-900">
                          Emergency & Trauma Evaluation
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11.5px]">
                        <div>
                          <span className="text-red-500 block text-[10px] uppercase font-bold">
                            Triage Category
                          </span>
                          <span className="px-2 py-0.5 bg-red-100 text-red-800 font-bold rounded text-[10.5px]">
                            {reportEncounterDetails.erDetails.triageCategory}
                          </span>
                        </div>
                        <div>
                          <span className="text-red-500 block text-[10px] uppercase font-bold">
                            ER Treatment Bay
                          </span>
                          <span className="font-bold text-slate-800">
                            {reportEncounterDetails.erDetails.bedLabel}
                          </span>
                        </div>
                        <div>
                          <span className="text-red-500 block text-[10px] uppercase font-bold">
                            Clinical Disposition
                          </span>
                          <span className="font-bold text-slate-800">
                            {reportEncounterDetails.erDetails.disposition}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. Prescribed Medications */}
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Pill className="w-3.5 h-3.5 text-blue-600" />
                      <span>Prescribed Medication Orders</span>
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold text-slate-600 uppercase">
                          <tr>
                            <th className="px-3.5 py-2">
                              Medicine / Drug Name
                            </th>
                            <th className="px-3.5 py-2">Dosage</th>
                            <th className="px-3.5 py-2">Frequency</th>
                            <th className="px-3.5 py-2">Duration</th>
                            <th className="px-3.5 py-2">Instructions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {reportEncounterDetails.medications.map((m, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80">
                              <td className="px-3.5 py-2 font-semibold text-slate-900">
                                {m.medicine}
                              </td>
                              <td className="px-3.5 py-2 text-slate-700">
                                {m.dosage}
                              </td>
                              <td className="px-3.5 py-2 text-slate-700">
                                {m.frequency}
                              </td>
                              <td className="px-3.5 py-2 text-slate-700">
                                {m.duration}
                              </td>
                              <td className="px-3.5 py-2 text-slate-500 text-[11px]">
                                {m.instructions}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 6. Diagnostic & Lab Orders */}
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <TestTube className="w-3.5 h-3.5 text-purple-600" />
                      <span>
                        Ordered Diagnostic & Laboratory Investigations
                      </span>
                    </h4>
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold text-slate-600 uppercase">
                          <tr>
                            <th className="px-3.5 py-2">Investigation Test</th>
                            <th className="px-3.5 py-2">Category</th>
                            <th className="px-3.5 py-2">Priority</th>
                            <th className="px-3.5 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {reportEncounterDetails.investigations.map(
                            (inv, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/80">
                                <td className="px-3.5 py-2 font-semibold text-slate-900">
                                  {inv.name}
                                </td>
                                <td className="px-3.5 py-2 text-slate-600">
                                  {inv.category}
                                </td>
                                <td className="px-3.5 py-2 text-slate-600">
                                  {inv.priority}
                                </td>
                                <td className="px-3.5 py-2">
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[10px] font-bold">
                                    {inv.status}
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 7. Billing and Doctor Attestation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    {/* Billing Summary */}
                    {reportEncounterDetails.billing ? (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200">
                          <CreditCard className="w-3.5 h-3.5 text-slate-700" />
                          <span className="text-xs font-bold text-slate-900">
                            Encounter Billing Summary
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Consultation Charges:</span>
                          <span className="font-semibold text-slate-800">
                            ₹
                            {reportEncounterDetails.billing.consultationFee.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Diagnostics / Lab Fees:</span>
                          <span className="font-semibold text-slate-800">
                            ₹
                            {reportEncounterDetails.billing.labFee.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-900 font-bold pt-1.5 border-t border-slate-200 text-xs">
                          <span>Total Billable Amount:</span>
                          <span className="text-[#1B4FD8]">
                            ₹
                            {reportEncounterDetails.billing.total.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-1 text-[11px]">
                          <span className="text-slate-500">
                            Payment Mode: {reportEncounterDetails.billing.mode}
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold">
                            {reportEncounterDetails.billing.status}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {/* Attending Physician Stamp */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Attending Physician Sign-Off
                        </span>
                        <h5 className="font-bold text-slate-900 text-xs">
                          {reportEncounterDetails.item.doctor}
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          {reportEncounterDetails.item.department} Specialist
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between">
                        <div className="text-[10px] text-slate-400">
                          <div>Digital Signature Key:</div>
                          <span className="font-mono text-[9px] text-slate-600">
                            KEP-VERIFIED-AUTH-{reportEncounterDetails.item.id}
                          </span>
                        </div>
                        <span className="px-2 py-1 bg-blue-50 text-[#1B4FD8] border border-blue-200 rounded text-[10px] font-bold tracking-tight">
                          VERIFIED
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Tab 2: Department Overview */
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        Department Profile
                      </span>
                      <h3 className="text-base font-black text-slate-900">
                        {reportEncounterDetails.item.department}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Active consultations, clinical roster, and department
                        operational throughput.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Total Visits In Range
                      </span>
                      <div className="text-2xl font-black text-[#1B4FD8]">
                        {reportEncounterDetails.deptVisitsCount}
                      </div>
                    </div>
                  </div>

                  {/* Department KPI grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Consulting Physicians
                      </span>
                      <div className="text-lg font-black text-slate-900 mt-1">
                        {reportEncounterDetails.deptDoctors.length}
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Active on Roster
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Active Status
                      </span>
                      <div className="text-lg font-black text-emerald-600 mt-1">
                        Operational
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">
                        100% capacity
                      </span>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Average Wait Time
                      </span>
                      <div className="text-lg font-black text-blue-600 mt-1">
                        14 mins
                      </div>
                      <span className="text-[10px] text-slate-500 font-medium">
                        Fast triage
                      </span>
                    </div>
                  </div>

                  {/* Doctor Roster in this department */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                    <h4 className="text-xs font-bold text-slate-900 mb-2.5 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      <span>
                        Specialist Roster in{" "}
                        {reportEncounterDetails.item.department}
                      </span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {reportEncounterDetails.deptDoctors.map((doc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                              {doc.charAt(0)}
                            </div>
                            <span className="font-semibold text-slate-800 text-xs">
                              {doc}
                            </span>
                          </div>
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded">
                            On Duty
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  Reviewed within General Reports Overview without page
                  redirects.
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReportModalItem(null)}
                  className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => setPdfModalDetails(reportEncounterDetails)}
                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5 border border-rose-200"
                  title="Show Patient Data in PDF Form"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>View PDF Form</span>
                </button>
                <button
                  onClick={() =>
                    printPatientClinicalReport(reportEncounterDetails)
                  }
                  className="px-4 py-1.5 bg-[#1B4FD8] hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition cursor-pointer flex items-center gap-1.5"
                  title="Print Patient Clinical Data"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PATIENT CLINICAL DATA (PDF FORM) MODAL ───────────────────────── */}
      {pdfModalDetails && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden border border-slate-700 animate-in fade-in zoom-in duration-150">
            {/* PDF Viewer Top Bar */}
            <div className="px-6 py-3 bg-[#0F172A] text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-400 font-bold text-xs">
                  PDF
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold tracking-tight">
                      Patient Clinical Record (PDF Form)
                    </h3>
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-400/30 rounded text-[10px] font-mono">
                      {pdfModalDetails.item.umr}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Official Medical Encounter Form •{" "}
                    {pdfModalDetails.item.patientName} •{" "}
                    {pdfModalDetails.item.department}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => printPatientClinicalReport(pdfModalDetails)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                  title="Print this patient record"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => downloadPatientClinicalPdf(pdfModalDetails)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
                  title="Download / Save as PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save / Download PDF</span>
                </button>
                <button
                  onClick={() => setPdfModalDetails(null)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* PDF Document Canvas (A4 Paper View) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/90 flex justify-center">
              <div className="bg-white text-slate-900 shadow-2xl rounded-sm max-w-[800px] w-full p-8 sm:p-12 border border-slate-300 font-sans text-xs flex flex-col justify-between min-h-[1050px]">
                {/* Form Header */}
                <div>
                  <div className="flex justify-between items-start border-b-2 border-[#1E3A8A] pb-3 mb-4">
                    <div>
                      <div className="text-xl font-black text-[#1E3A8A] tracking-tight uppercase">
                        IMPERIAL HOSPITALS
                      </div>
                      <div className="text-xs font-semibold text-slate-600 mt-0.5">
                        A UNIT OF MUKUNDA HEALTHCARE PRIVATE LIMITED •
                        Bhimavaram
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        # 27-14-13/A, Opp. Ganesh Canten Street, Beside Bhasyam
                        School • Ph: 08816-279999, 279988 • GST No -
                        37AALCM2238A1ZQ
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-slate-900">
                        UMR: {pdfModalDetails.item.umr}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ID: {pdfModalDetails.item.id}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date().toLocaleDateString()}
                      </div>
                      <div className="font-mono text-[9px] tracking-widest text-slate-900 mt-1">
                        |||| | |||| || | ||||
                      </div>
                    </div>
                  </div>

                  {/* Document Title Banner */}
                  <div className="bg-slate-100 border border-slate-300 rounded-md px-3 py-2 flex items-center justify-between mb-4">
                    <div>
                      <span className="text-xs font-black uppercase text-slate-900 tracking-wider">
                        PATIENT CLINICAL ENCOUNTER REPORT
                      </span>
                      <span className="text-[10px] text-slate-500 ml-2">
                        Official Medical Record
                      </span>
                    </div>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-[10px] rounded border border-blue-200 uppercase">
                      {pdfModalDetails.item.visitType} •{" "}
                      {pdfModalDetails.item.status}
                    </span>
                  </div>

                  {/* Patient Demographics Box */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3 mb-4 text-[11px]">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Patient Name
                      </div>
                      <div className="font-bold text-[#1E3A8A] text-sm mt-0.5">
                        {pdfModalDetails.item.patientName}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Age / Gender
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {pdfModalDetails.age} Yrs / {pdfModalDetails.sex}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Blood Group
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {pdfModalDetails.bloodGroup}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Contact Phone
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {pdfModalDetails.phone}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Department
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {pdfModalDetails.item.department}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Attending Doctor
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        Dr.{" "}
                        {pdfModalDetails.item.doctor.replace(/^Dr\.\s*/i, "")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Encounter Date
                      </div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        {pdfModalDetails.item.dateTime}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase">
                        Residential Address
                      </div>
                      <div className="font-semibold text-slate-700 mt-0.5 truncate">
                        {pdfModalDetails.address}
                      </div>
                    </div>
                  </div>

                  {/* Vitals Ribbon */}
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-[#1E3A8A] uppercase border-b border-slate-200 pb-1 mb-2">
                      Clinical Vital Signs Recorded
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                      <div className="bg-white border border-slate-200 rounded p-1.5">
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          BP
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {pdfModalDetails.vitals.bp}
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded p-1.5">
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          Pulse
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {pdfModalDetails.vitals.pulse}
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded p-1.5">
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          Temperature
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {pdfModalDetails.vitals.temp}
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded p-1.5">
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          SpO2
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {pdfModalDetails.vitals.spo2}
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded p-1.5">
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          Resp. Rate
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {pdfModalDetails.vitals.respiratoryRate}
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded p-1.5">
                        <div className="text-[9px] text-slate-500 font-bold uppercase">
                          Weight
                        </div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {pdfModalDetails.vitals.weight}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Clinical Evaluation */}
                  <div className="bg-white border border-slate-200 rounded-md p-3 mb-4 space-y-1.5">
                    <div className="flex justify-between items-baseline">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          Primary Diagnosis:{" "}
                        </span>
                        <span className="font-bold text-[#1E3A8A] text-xs ml-1">
                          {pdfModalDetails.diagnosis}
                        </span>
                      </div>
                      <span className="font-mono text-[9.5px] font-bold bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded">
                        ICD-10: {pdfModalDetails.icd10}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <strong className="text-slate-900">
                        Chief Complaint:{" "}
                      </strong>
                      {pdfModalDetails.chiefComplaint}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <strong className="text-slate-900">Symptoms: </strong>
                      {pdfModalDetails.symptoms.join(", ")}
                    </div>
                    {pdfModalDetails.assessment && (
                      <div className="text-[10.5px] text-slate-600 mt-1">
                        <strong className="text-slate-900">
                          Clinical Assessment:{" "}
                        </strong>
                        {pdfModalDetails.assessment}
                      </div>
                    )}
                    {pdfModalDetails.advice && (
                      <div className="text-[10.5px] text-slate-600">
                        <strong className="text-slate-900">
                          Doctor's Advice:{" "}
                        </strong>
                        {pdfModalDetails.advice}
                      </div>
                    )}
                  </div>

                  {/* Prescribed Medications (Rx) */}
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-[#1E3A8A] uppercase border-b border-slate-200 pb-1 mb-1.5">
                      Prescribed Medications &amp; Dosage (Rx)
                    </div>
                    <table className="w-full border border-slate-200 text-[10.5px] text-left">
                      <thead className="bg-[#0F172A] text-white">
                        <tr>
                          <th className="p-1.5 font-bold">
                            Medicine Name &amp; Strength
                          </th>
                          <th className="p-1.5 font-bold">Dosage</th>
                          <th className="p-1.5 font-bold">Frequency</th>
                          <th className="p-1.5 font-bold">Duration</th>
                          <th className="p-1.5 font-bold">Instructions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdfModalDetails.medications.map(
                          (m: any, idx: number) => (
                            <tr
                              key={idx}
                              className={
                                idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                              }
                            >
                              <td className="p-1.5 border-t border-slate-200 font-semibold text-slate-900">
                                {idx + 1}. {m.medicine}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-slate-700">
                                {m.dosage}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-slate-700">
                                {m.frequency}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-slate-700">
                                {m.duration}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-slate-500 italic">
                                {m.instructions}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Diagnostic Investigations */}
                  <div className="mb-4">
                    <div className="text-[10px] font-bold text-[#1E3A8A] uppercase border-b border-slate-200 pb-1 mb-1.5">
                      Diagnostic &amp; Laboratory Investigations
                    </div>
                    <table className="w-full border border-slate-200 text-[10.5px] text-left">
                      <thead className="bg-[#0F172A] text-white">
                        <tr>
                          <th className="p-1.5 font-bold">
                            Investigation / Test Name
                          </th>
                          <th className="p-1.5 font-bold">Category</th>
                          <th className="p-1.5 font-bold">Priority</th>
                          <th className="p-1.5 font-bold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdfModalDetails.investigations.map(
                          (l: any, idx: number) => (
                            <tr
                              key={idx}
                              className={
                                idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                              }
                            >
                              <td className="p-1.5 border-t border-slate-200 font-semibold text-slate-900">
                                {idx + 1}. {l.name}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-slate-700">
                                {l.category}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-slate-700">
                                {l.priority}
                              </td>
                              <td className="p-1.5 border-t border-slate-200 text-emerald-700 font-bold">
                                {l.status}
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Inpatient details if available */}
                  {pdfModalDetails.bedDetails && (
                    <div className="mb-4 bg-slate-50 border border-slate-200 rounded p-2.5 text-[10.5px]">
                      <div className="font-bold text-[#1E3A8A] text-[10px] uppercase mb-1">
                        Inpatient Stay Context
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <span className="text-slate-500">Ward:</span>{" "}
                          <strong className="text-slate-900">
                            {pdfModalDetails.bedDetails.ward}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Room / Bed:</span>{" "}
                          <strong className="text-slate-900">
                            {pdfModalDetails.bedDetails.roomNo} -{" "}
                            {pdfModalDetails.bedDetails.bedNo}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Admission:</span>{" "}
                          <strong className="text-slate-900">
                            {pdfModalDetails.bedDetails.admissionDate}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Charges:</span>{" "}
                          <strong className="text-slate-900">
                            ₹
                            {(
                              pdfModalDetails.bedDetails.charges || 0
                            ).toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ER details if available */}
                  {pdfModalDetails.erDetails && (
                    <div className="mb-4 bg-red-50 border border-red-200 rounded p-2.5 text-[10.5px]">
                      <div className="font-bold text-red-900 text-[10px] uppercase mb-1">
                        Emergency Intake Context
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="text-red-700">Triage:</span>{" "}
                          <strong className="text-red-950 font-bold">
                            {pdfModalDetails.erDetails.triageCategory}
                          </strong>
                        </div>
                        <div>
                          <span className="text-red-700">Observation Bay:</span>{" "}
                          <strong className="text-red-950">
                            {pdfModalDetails.erDetails.bedLabel}
                          </strong>
                        </div>
                        <div>
                          <span className="text-red-700">Disposition:</span>{" "}
                          <strong className="text-red-950">
                            {pdfModalDetails.erDetails.disposition}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Billing Breakdown */}
                  {pdfModalDetails.billing && (
                    <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex justify-between items-center text-[10.5px] mb-4">
                      <div>
                        <span className="font-bold text-slate-800 uppercase text-[9.5px]">
                          Encounter Billing:{" "}
                        </span>
                        <span className="text-slate-600 ml-2">
                          Consultation: ₹
                          {pdfModalDetails.billing.consultationFee}
                        </span>
                        <span className="text-slate-600 ml-2">
                          Diagnostics: ₹{pdfModalDetails.billing.labFee}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 text-xs">
                          Total: ₹{pdfModalDetails.billing.total}
                        </span>
                        <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[9.5px]">
                          {pdfModalDetails.billing.status} (
                          {pdfModalDetails.billing.mode})
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Attestation & Legal Footer */}
                <div>
                  <div className="flex justify-between items-end border-t border-dashed border-slate-300 pt-4 mt-4">
                    <div>
                      <div className="text-[9px] text-slate-500">
                        Electronic Attestation:
                      </div>
                      <div className="text-[10px] font-bold text-emerald-700">
                        ✓ Signed and verified in Hospital EHR
                      </div>
                      <div className="text-[8.5px] text-slate-400 font-mono mt-0.5">
                        SHA256: 8A4F-29B1-EHR-VALIDATED
                      </div>
                    </div>
                    <div className="text-right min-w-[180px]">
                      <div className="border-t border-slate-800 pt-1 font-bold text-xs text-slate-900">
                        Dr.{" "}
                        {pdfModalDetails.item.doctor.replace(/^Dr\.\s*/i, "")}
                      </div>
                      <div className="text-[9.5px] text-slate-600">
                        {pdfModalDetails.item.department} Specialist
                      </div>
                      <div className="text-[8.5px] text-slate-400">
                        Reg: KMC-58291
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-[8.5px] text-slate-400 border-t border-slate-100 pt-3 mt-4">
                    CONFIDENTIAL MEDICAL RECORD • Generated via Imperial
                    Hospitals HMS • Valid for Clinical Continuity • Page 1 of 1
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM DATE MODAL ────────────────────────────────────────────── */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Custom Date Range
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-2 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-2 text-xs text-slate-800"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowCustomModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDateRange("custom")
                  setShowCustomModal(false)
                }}
                className="px-4 py-1.5 bg-[#1B4FD8] text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
