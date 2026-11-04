import { useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { FaBed } from "react-icons/fa"
import {
  FiActivity,
  FiAlertTriangle,
  FiBell,
  FiCheckCircle,
  FiClipboard,
  FiDollarSign,
  FiEdit2,
  FiHome,
  FiPlus,
  FiRepeat,
  FiSearch,
  FiTrash2,
  FiTool,
  FiUser,
  FiX,
  FiZap,
} from "react-icons/fi"
import StatCard from "../components/StatCard"
import {
  Button,
  Input,
  Label,
  Modal,
  Table,
  TableCell,
  TableHead,
  TableRow,
  Textarea,
  PhoneInput,
} from "../components/ui"
import { apiFetch, reportError } from "../lib/api"
import { generateAndSaveDischargeSummary } from "../lib/dischargeSummary"
import { formatDateTimeIST } from "../lib/format"
import type { Notice, Patient } from "../types"
import DischargedDirectoryView from "../components/bed/DischargedDirectoryView"
import { WardBedBoard } from "../components/bed/WardBedBoard"
import { BedTransferNotificationPanel } from "../components/bed/BedTransferNotificationPanel"
import { WardAlertsNotificationPanel } from "../components/bed/WardAlertsNotificationPanel"
import {
  BedDatabase,
  type BedTransferNotification,
  type PendingBedAllocation,
} from "../services/bedDb"

type Props = {
  setNotice: (notice: Notice | null) => void
  // Lets a bed card's patient name jump straight to that patient's real
  // Clinical chart (Patient Chart) instead of just opening this page's own
  // bed-allocation modal.
  onOpenPatientClinical?: (patientId: string) => void
  // From the logged-in user's real backend permissions (see App.tsx's
  // handleLogin). The server already enforces beds.write on every mutating
  // route regardless of this -- this is purely UI: hide/disable actions a
  // receptionist-only or clinician-only account could never actually
  // complete, instead of letting them click through to a 403.
  permissions?: string[]
}

type BedStatus = "Available" | "Occupied" | "Maintenance"

type Bed = {
  id: number
  ward: string
  room_no: string
  bed_no: string
  bed_type: string
  status: BedStatus
  daily_rate: number | null
  allocation_id: number | null
  admission_id: number | null
  allocated_at: string | null
  admission_date: string | null
  expected_discharge_date: string | null
  patient_id: string | null
  patient_name: string | null
  patient_last_name: string | null
  patient_phone: string | null
  patient_age: number | null
  patient_gender: string | null
  admission_notes: string | null
  room_charges_so_far: number | null
}

type ErBedRequest = {
  id: number
  er_visit_id: number
  visit_no: string
  patient_id: string | null
  patient_name: string | null
  patient_last_name: string | null
  is_unknown_patient: boolean
  unknown_patient_label: string | null
  requested_level_of_care: string
  requested_specialty: string | null
  requested_at: string
  status?: string
}

function erRequestPatientLabel(req: ErBedRequest): string {
  if (req.is_unknown_patient)
    return req.unknown_patient_label || "Unknown patient"
  const name = `${req.patient_name || ""} ${req.patient_last_name || ""}`.trim()
  return name || req.patient_id || "Patient"
}

type RoomChargeSegment = {
  ward: string
  room_no: string
  bed_no: string
  days: number
  daily_rate: number
  amount: number
}

type Summary = {
  total: number
  available: number
  occupied: number
  maintenance: number
}

type DischargeChecklist = {
  billing: {
    ok: boolean
    pending_invoices: { invoice_no: string ;due_amount: number }[]
  }
  prescriptions: { ok: boolean ;pending_count: number }
  documents: { count: number }
  room_charges: { segments: RoomChargeSegment[] ;total: number }
  clear: boolean
}

const BED_TYPES = ["General", "ICU", "Private", "Semi-Private"]

// Starting per-day room rates by bed type -- mirrors
// BED_TYPE_DEFAULT_DAILY_RATE in backend/utils/database.py. Just a seed for
// the Add Bed form; every bed's rate is freely editable afterward.
const BED_TYPE_DEFAULT_DAILY_RATE: Record<string, number> = {
  General: 1500,
  "Semi-Private": 2500,
  Private: 4000,
  ICU: 8000,
}

function formatINR(amount: number) {
  return `₹${Math.round(amount || 0).toLocaleString("en-IN")}`
}

const EMPTY_NEW_BED = {
  ward: "",
  room_no: "",
  bed_no: "",
  bed_type: "General",
  daily_rate: String(BED_TYPE_DEFAULT_DAILY_RATE.General),
}
const EMPTY_BED_RANGE = {
  ward: "",
  room_no: "",
  from_bed: "",
  to_bed: "",
  bed_type: "General",
  daily_rate: String(BED_TYPE_DEFAULT_DAILY_RATE.General),
}

function bedOccupantName(bed: Bed) {
  return (
    `${bed.patient_name || ""} ${bed.patient_last_name || ""}`.trim() || "-"
  )
}

function statusCounts(bedsInGroup: Bed[]) {
  return {
    available: bedsInGroup.filter((b) => b.status === "Available").length,
    occupied: bedsInGroup.filter((b) => b.status === "Occupied").length,
    maintenance: bedsInGroup.filter((b) => b.status === "Maintenance").length,
  }
}

// Length-of-stay progress, derived purely from admission_date/expected_discharge_date
// so the "day X of N" figure can never drift out of sync with a separately-stored
// day count -- there isn't one, the date is the only source of truth.
function losProgress(bed: Bed) {
  if (!bed.admission_date) return null
  const start = new Date(bed.admission_date)
  const today = new Date()
  const dayNum = Math.max(
    1,
    Math.floor((today.getTime() - start.getTime()) / 86400000) + 1,
  )
  if (!bed.expected_discharge_date)
    return { dayNum, totalDays: null, overdue: false, pct: null }
  const end = new Date(bed.expected_discharge_date)
  const totalDays = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86400000),
  )
  const overdue = today.getTime() > end.getTime()
  const pct = Math.min(100, Math.round((dayNum / totalDays) * 100))
  return { dayNum, totalDays, overdue, pct }
}

function bedTypeStyle(bedType: string): CSSProperties {
  if (bedType === "ICU") {
    return {
      background: "#ede9fe",
      color: "#5b21b6",
      border: "1px solid #c4b5fd",
    }
  }
  if (bedType === "Private") {
    return {
      background: "#dbeafe",
      color: "#1e40af",
      border: "1px solid #93c5fd",
    }
  }
  if (bedType === "Semi-Private") {
    return {
      background: "#f0fdf4",
      color: "#166534",
      border: "1px solid #86efac",
    }
  }
  return {
    background: "#f1f5f9",
    color: "#334155",
    border: "1px solid #cbd5e1",
  }
}

export default function BedManagementPage({
  setNotice,
  onOpenPatientClinical,
  permissions,
}: Props) {
  // An empty/undefined permissions array means "not verified against the
  // real backend" (e.g. the offline login fallback) -- treat that as
  // allowed rather than locking everyone out; a logged-in account that HAS
  // a real permissions list but genuinely lacks beds.write is the actual
  // case this hides actions for.
  // `permissions` is the RBAC module list (dashboard, inpatient, beds, ...),
  // not granular action strings -- no role's allowedModules contains a dot, so
  // the old "beds.write" test could never match and every user, Super Admin
  // included, was locked out of adding, assigning, transferring or discharging.
  // Access to the beds module IS the grant to manage beds, same as every other
  // screen in this app.
  const canManageBeds =
    !permissions || permissions.length === 0 || permissions.includes("beds")
  const [beds, setBeds] = useState<Bed[]>([])
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
  })
  const [loading, setLoading] = useState(true)
  const [filterText, setFilterText] = useState("")
  const [selectedWard, setSelectedWard] = useState("all")

  const [selectedBed, setSelectedBed] = useState<Bed | null>(null)
  const [editingBedDetails, setEditingBedDetails] = useState(false)
  const [editBedForm, setEditBedForm] = useState(EMPTY_NEW_BED)
  const [savingBedEdit, setSavingBedEdit] = useState(false)
  const [confirmDeleteBed, setConfirmDeleteBed] = useState(false)

  const [patientQuery, setPatientQuery] = useState("")
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [assignNotes, setAssignNotes] = useState("")
  const [expectedLosDays, setExpectedLosDays] = useState("")
  const [assigning, setAssigning] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const [addBedOpen, setAddBedOpen] = useState(false)
  const [newBedRange, setNewBedRange] = useState(EMPTY_BED_RANGE)
  const [addingBed, setAddingBed] = useState(false)

  // Transfer (ward change / shift to ICU) -- moves the patient to a different
  // bed while keeping the same admission, unlike release-then-reassign.
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferFilter, setTransferFilter] = useState("")
  const [transferTargetId, setTransferTargetId] = useState<number | null>(null)
  const [transferReason, setTransferReason] = useState("")
  const [transferring, setTransferring] = useState(false)

  // Discharge checklist -- warns about pending dues/prescriptions but never
  // blocks; staff can confirm anyway with a reason (discharge-against-advice).
  const [dischargeOpen, setDischargeOpen] = useState(false)
  const [checklist, setChecklist] = useState<DischargeChecklist | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [dischargeReason, setDischargeReason] = useState("")
  const [roomChargeSegments, setRoomChargeSegments] =
    useState<RoomChargeSegment[]>([])

  // ER Bed Requests -- Reception's side of the ER handoff. This is
  // deliberately surfaced here rather than in the ER module's own page: the
  // ER doctor only ever records a clinical decision (Ward/ICU/OT/Observation
  // needed); picking the actual bed is a Bed Management action, gated on the
  // same beds.write permission as every other bed action on this page.
  const [erRequests, setErRequests] = useState<ErBedRequest[]>([])
  const [erRequestsLoading, setErRequestsLoading] = useState(false)
  const [allocatingRequest, setAllocatingRequest] =
    useState<ErBedRequest | null>(null)
  const [lamaRequest, setLamaRequest] = useState<ErBedRequest | null>(null)
  const [allocateFilter, setAllocateFilter] = useState("")
  const [allocateBedId, setAllocateBedId] = useState<number | null>(null)
  const [allocateNotes, setAllocateNotes] = useState("")
  const [printCensusOpen, setPrintCensusOpen] = useState(false)
  const [allocating, setAllocating] = useState(false)
  const [filterMatchingOnly, setFilterMatchingOnly] = useState(true)
  const [activePendingAllocation, setActivePendingAllocation] =
    useState<PendingBedAllocation | null>(null)

  // Discharged Directory View
  const [activeView, setActiveView] = useState<"bed_board" | "discharged">(
    "bed_board",
  )
  const [dischargedPatients, setDischargedPatients] = useState<any[]>([])
  const [dischargedLoading, setDischargedLoading] = useState(false)
  const [dischargedSearch, setDischargedSearch] = useState("")

  const loadDischarged = async () => {
    setDischargedLoading(true)
    try {
      const data = await apiFetch<{ discharged_patients: any[] }>(
        "/api/beds/discharged",
      )
      setDischargedPatients(data.discharged_patients || [])
    } catch {
      setDischargedPatients([])
    } finally {
      setDischargedLoading(false)
    }
  }

  const requestedCareType = useMemo(() => {
    if (!allocatingRequest) return null
    const loc = (allocatingRequest.requested_level_of_care || "").toLowerCase()
    const spec = (allocatingRequest.requested_specialty || "").toLowerCase()
    if (
      loc === "icu" ||
      spec.includes("icu") ||
      spec.includes("critical") ||
      spec.includes("cardiac")
    ) {
      return { type: "ICU", label: "ICU (Intensive Care Unit)" }
    }
    if (
      loc === "private" ||
      spec.includes("private") ||
      spec.includes("deluxe")
    ) {
      return { type: "Private", label: "Private Deluxe Ward" }
    }
    if (loc === "semi-private" || spec.includes("semi")) {
      return { type: "Semi-Private", label: "Semi-Private Ward" }
    }
    if (
      loc === "ward" ||
      loc === "general" ||
      loc === "observation" ||
      spec.includes("general") ||
      spec.includes("ward")
    ) {
      return { type: "General", label: "General Ward" }
    }
    return null
  }, [allocatingRequest])

  // The requested specialty (e.g. "Cardiology", from the doctor already
  // assigned to the patient in the ER) is free text, not one of the four
  // bed_type buckets above -- so it's matched separately against actual
  // ward names, letting a specialty-named ward (e.g. "Cardiology Ward")
  // surface as the top pick even though it isn't literally "ICU"/"General".
  const specialtyWardWords = useMemo(() => {
    const spec = (allocatingRequest?.requested_specialty || "")
      .trim()
      .toLowerCase()
    if (!spec) return []
    return spec.split(/[^a-z]+/).filter((w) => w.length > 3)
  }, [allocatingRequest])

  const bedMatchesSpecialtyWard = (bed: Bed): boolean => {
    if (specialtyWardWords.length === 0) return false
    const ward = bed.ward.toLowerCase()
    return specialtyWardWords.some((w) => ward.includes(w))
  }

  const loadErRequests = async () => {
    setErRequestsLoading(true)
    try {
      const data = await apiFetch<{ bed_requests: ErBedRequest[] }>(
        "/api/er/bed-requests?status=pending",
      )
      setErRequests(data.bed_requests || [])
    } catch {
      setErRequests([])
    } finally {
      setErRequestsLoading(false)
    }
  }

  const availableBedsForAllocation = useMemo(() => {
    const text = allocateFilter.trim().toLowerCase()
    const filtered = beds
      .filter((b) => b.status === "Available")
      .filter((b) => {
        if (filterMatchingOnly && requestedCareType) {
          const isMatch =
            b.bed_type.toLowerCase() === requestedCareType.type.toLowerCase() ||
            b.ward
              .toLowerCase()
              .includes(requestedCareType.type.toLowerCase()) ||
            bedMatchesSpecialtyWard(b)
          if (!isMatch) return false
        }
        if (!text) return true
        return [b.ward, b.room_no, b.bed_no, b.bed_type]
          .filter(Boolean)
          .some((field) => (field as string).toLowerCase().includes(text))
      })
    // Specialty-ward matches (e.g. a "Cardiology Ward" bed for a patient
    // assigned to Cardiology) are the most specific recommendation available,
    // so they're surfaced ahead of a same-bed_type bed in an unrelated ward.
    return [...filtered].sort((a, b) => {
      const aMatch = bedMatchesSpecialtyWard(a) ? 1 : 0
      const bMatch = bedMatchesSpecialtyWard(b) ? 1 : 0
      return bMatch - aMatch
    })
  }, [
    beds,
    allocateFilter,
    filterMatchingOnly,
    requestedCareType,
    specialtyWardWords,
  ])

  const closeAllocateModal = () => {
    setAllocatingRequest(null)
    setAllocateFilter("")
    setAllocateBedId(null)
    setAllocateNotes("")
    setFilterMatchingOnly(true)
  }

  const handleAllocateFromNotification = (notif: BedTransferNotification) => {
    setActiveView("bed_board")
    const pendingAlloc: PendingBedAllocation = {
      patient_id: notif.patient_id,
      name: notif.patient_name,
      last_name: notif.patient_last_name || undefined,
      phone: notif.patient_phone || undefined,
      age: notif.patient_age || undefined,
      gender: notif.patient_gender || undefined,
      source: "ER",
      visit_no: notif.er_visit_id
        ? `ER-${notif.er_visit_id}`
        : `TR-${notif.patient_id}`,
      er_bed_request_id: notif.er_bed_request_id,
      er_visit_id: notif.er_visit_id,
      notification_id: notif.id,
      requested_level_of_care:
        notif.target_bed_type === "ICU" ? "ICU" : notif.target_destination,
      requested_specialty: notif.target_ward || notif.target_destination,
      clinical_notes: `Admitted via Transfer from ${notif.source_department}. Clinical Notes: ${notif.clinical_reason}`,
      priority: notif.priority,
      timestamp: notif.sent_at,
    }
    setActivePendingAllocation(pendingAlloc)
    BedDatabase.setPendingAllocation(pendingAlloc)

    setAllocatingRequest({
      id: notif.er_bed_request_id || 1000 + Math.floor(Math.random() * 9000),
      er_visit_id: notif.er_visit_id || 1,
      visit_no: `ER-${notif.patient_id}`,
      patient_id: notif.patient_id,
      patient_name: notif.patient_name,
      patient_last_name: notif.patient_last_name || null,
      is_unknown_patient: false,
      unknown_patient_label: null,
      requested_level_of_care:
        notif.target_bed_type === "ICU" ? "ICU" : notif.target_destination,
      requested_specialty: notif.target_ward || notif.target_destination,
      requested_at: notif.sent_at,
    })
    setAllocateNotes(
      `Admitted via Transfer from ${notif.source_department}. Clinical Notes: ${notif.clinical_reason}`,
    )
    setAllocateFilter(notif.target_bed_type === "ICU" ? "ICU" : "")
  }

  const handleAllocateErBed = async () => {
    if (!allocatingRequest || !allocateBedId) return
    setAllocating(true)
    try {
      try {
        await apiFetch(`/api/er/bed-requests/${allocatingRequest.id}/allocate`, {
          method: "POST",
          body: JSON.stringify({ bed_id: allocateBedId, notes: allocateNotes }),
        })
      } catch {
        // Fallback to direct bed assignment if ER request ID was ad-hoc or from notification
        await apiFetch(`/api/beds/${allocateBedId}/assign`, {
          method: "POST",
          body: JSON.stringify({
            patient_id: allocatingRequest.patient_id,
            patient_name: allocatingRequest.patient_name,
            patient: {
              patient_id: allocatingRequest.patient_id,
              name: allocatingRequest.patient_name,
              last_name: allocatingRequest.patient_last_name || "",
              age:
                (allocatingRequest as any).patient_age ||
                (allocatingRequest as any).age,
              gender:
                (allocatingRequest as any).patient_gender ||
                (allocatingRequest as any).gender,
              phone:
                (allocatingRequest as any).patient_phone ||
                (allocatingRequest as any).phone,
            },
            notes: allocateNotes,
            expected_los_days:
              allocatingRequest.requested_level_of_care === "ICU" ? 7 : 4,
          }),
        })
      }

      // Synchronize Transfer Notification status
      const allocatedBed = beds.find((b) => b.id === allocateBedId)
      const bedLabel = allocatedBed
        ? `${allocatedBed.ward} (Room ${allocatedBed.room_no} / Bed ${allocatedBed.bed_no})`
        : `Bed #${allocateBedId}`

      const notifs = BedDatabase.getTransferNotifications()
      const matchNotif = notifs.find(
        (n) =>
          n.er_bed_request_id === allocatingRequest.id ||
          n.patient_id === allocatingRequest.patient_id,
      )
      if (matchNotif) {
        BedDatabase.updateNotificationStatus(
          matchNotif.id,
          "allocated",
          allocateBedId,
          bedLabel,
        )
      } else {
        const matchByPat = notifs.find(
          (n) =>
            n.patient_id === allocatingRequest.patient_id &&
            n.status !== "allocated",
        )
        if (matchByPat) {
          BedDatabase.updateNotificationStatus(
            matchByPat.id,
            "allocated",
            allocateBedId,
            bedLabel,
          )
        }
      }

      BedDatabase.clearPendingAllocation()
      setActivePendingAllocation(null)

      setNotice({
        type: "success",
        message: `Bed allocated for ${erRequestPatientLabel(allocatingRequest)} in ${bedLabel}.`,
      })
      closeAllocateModal()
      await Promise.all([loadBeds(), loadErRequests()])
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to allocate this bed.",
      )
    } finally {
      setAllocating(false)
    }
  }

  const loadBeds = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ beds: Bed[] ;summary: Summary }>("/api/beds")
      setBeds(data.beds || [])
      setSummary(
        data.summary || { total: 0, available: 0, occupied: 0, maintenance: 0 },
      )
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to load beds.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBeds()
    void loadErRequests()
    void loadDischarged()
    // ER bed requests poll interval
    const interval = window.setInterval(() => void loadErRequests(), 20000)
    return () => window.clearInterval(interval)
  }, [])

  // Auto-listen to pending allocation handovers from ER & other departments
  useEffect(() => {
    const existing = BedDatabase.getPendingAllocation()
    if (existing) {
      setActivePendingAllocation(existing)
      setActiveView("bed_board")
      if (
        existing.requested_level_of_care === "ICU" ||
        (existing.requested_specialty || "").toLowerCase().includes("icu")
      ) {
        setSelectedWard("ICU")
      }
    }

    const handleInitiate = (e: any) => {
      const alloc: PendingBedAllocation =
        e.detail || BedDatabase.getPendingAllocation()
      if (alloc) {
        setActivePendingAllocation(alloc)
        setActiveView("bed_board")
        if (
          alloc.requested_level_of_care === "ICU" ||
          (alloc.requested_specialty || "").toLowerCase().includes("icu")
        ) {
          setSelectedWard("ICU")
        }
      }
    }

    const handleClear = () => {
      setActivePendingAllocation(null)
    }

    window.addEventListener("bed:initiate_allocation", handleInitiate)
    window.addEventListener("bed:clear_allocation", handleClear)
    return () => {
      window.removeEventListener("bed:initiate_allocation", handleInitiate)
      window.removeEventListener("bed:clear_allocation", handleClear)
    }
  }, [])

  // Auto-open targeted bed from board click
  useEffect(() => {
    const targetBedId = sessionStorage.getItem("hospai_target_bed_id")
    if (targetBedId && beds.length > 0) {
      sessionStorage.removeItem("hospai_target_bed_id")
      const found = beds.find((b) => String(b.id) === targetBedId)
      if (found) {
        openBed(found)
      }
    }
  }, [beds])

  useEffect(() => {
    if (!patientQuery.trim()) {
      setPatientResults([])
      return
    }
    const handle = setTimeout(async () => {
      try {
        const data = await apiFetch<{ patients: Patient[] }>(
          `/api/patients?q=${encodeURIComponent(patientQuery.trim())}`,
        )
        setPatientResults((data.patients || []).slice(0, 8))
      } catch {
        setPatientResults([])
      }
    }, 120)
    return () => clearTimeout(handle)
  }, [patientQuery])

  const resetSelection = () => {
    setSelectedBed(null)
    setEditingBedDetails(false)
    setConfirmDeleteBed(false)
    setPatientQuery("")
    setPatientResults([])
    setSelectedPatient(null)
    setAssignNotes("")
    setExpectedLosDays("")
    setTransferOpen(false)
    setTransferFilter("")
    setTransferTargetId(null)
    setTransferReason("")
    setDischargeOpen(false)
    setChecklist(null)
    setDischargeReason("")
    setRoomChargeSegments([])
  }

  const openBed = (bed: Bed) => {
    setSelectedBed(bed)
    setEditingBedDetails(false)
    setEditBedForm({
      ward: bed.ward,
      room_no: bed.room_no,
      bed_no: bed.bed_no,
      bed_type: bed.bed_type,
      daily_rate: String(
        bed.daily_rate ??
          BED_TYPE_DEFAULT_DAILY_RATE[bed.bed_type] ??
          BED_TYPE_DEFAULT_DAILY_RATE.General,
      ),
    })

    // If an active pending allocation is present, AUTO-FETCH and pre-fill immediately!
    const pending = activePendingAllocation || BedDatabase.getPendingAllocation()
    if (bed.status === "Available" && pending) {
      const pat: Patient = {
        patient_id: pending.patient_id,
        name: pending.name,
        last_name: pending.last_name || "",
        phone: pending.phone || "",
        age: pending.age ?? undefined,
        gender: pending.gender || "Male",
      }
      setSelectedPatient(pat)
      setPatientQuery(`${pending.name} ${pending.last_name || ""}`.trim())
      setAssignNotes(
        pending.clinical_notes ||
          `Admitted from ${pending.source || "ER"} (${pending.visit_no || "Transfer"})`,
      )
      setExpectedLosDays(bed.bed_type === "ICU" ? "7" : "4")
    } else {
      setPatientQuery("")
      setPatientResults([])
      setSelectedPatient(null)
      setAssignNotes("")
      setExpectedLosDays("")
    }

    setTransferOpen(false)
    setDischargeOpen(false)
    setChecklist(null)
    setRoomChargeSegments([])
  }

  // All ward names, independent of the current search text or ward selection,
  // so the dropdown always lists every ward that exists.
  const wardOptions = useMemo(() => {
    const names = new Set(beds.map((bed) => bed.ward || "Unassigned Ward"))
    names.add("2nd Floor")
    names.add("3rd Floor")
    names.add("4th Floor")
    names.add("5th Floor")
    names.add("6th Floor")
    return Array.from(names).sort()
  }, [beds])

  // What "Add Beds" is actually about to create, read back to the user before
  // they commit. Also catches the cases the old form let through silently: a
  // reversed range, and a typo like "to bed 100" that would create 100 rows.
  const newBedPlan = useMemo(() => {
    const from = Number.parseInt(newBedRange.from_bed, 10)
    const toRaw = newBedRange.to_bed.trim()
    const to = toRaw ? Number.parseInt(toRaw, 10) : from
    const ward = newBedRange.ward.trim()
    const room = newBedRange.room_no.trim()

    if (!ward || !room) {
      return {
        count: 0,
        invalid: false,
        message: "Enter a ward and room number to continue.",
      }
    }
    if (!Number.isFinite(from) || from < 1) {
      return {
        count: 0,
        invalid: false,
        message: "Enter the first bed number.",
      }
    }
    if (!Number.isFinite(to) || to < from) {
      return {
        count: 0,
        invalid: true,
        message: `"To" bed number must be ${from} or higher.`,
      }
    }
    const count = to - from + 1
    if (count > 100) {
      return {
        count,
        invalid: true,
        message: `That range is ${count} beds — check the numbers before continuing.`,
      }
    }
    const existing = new Set(
      beds
        .filter((b) => b.ward === ward && b.room_no === room)
        .map((b) => String(b.bed_no)),
    )
    const clashes: string[] = []
    for (let n = from; n <= to; n += 1)
      if (existing.has(String(n))) clashes.push(String(n))
    if (clashes.length > 0) {
      return {
        count,
        invalid: true,
        message: `${ward} Room ${room} already has bed ${clashes.slice(0, 6).join(", ")}${
          clashes.length > 6 ? "…" : ""
        }.`,
      }
    }
    return {
      count,
      invalid: false,
      message:
        count === 1
          ? `Creates bed ${from} in ${ward}, Room ${room}.`
          : `Creates ${count} beds (${from}–${to}) in ${ward}, Room ${room}.`,
    }
  }, [newBedRange, beds])

  const wardScopedBeds = useMemo(() => {
    if (selectedWard === "all") return beds
    return beds.filter(
      (bed) => (bed.ward || "Unassigned Ward") === selectedWard,
    )
  }, [beds, selectedWard])

  // Stat cards reflect the selected ward (scope) but not the free-text search
  // (a further narrowing within that scope) -- same principle as before, just
  // now scoped to one ward at a time instead of always being hospital-wide.
  const displaySummary = useMemo(() => {
    if (selectedWard === "all") return summary
    const counts = statusCounts(wardScopedBeds)
    return { total: wardScopedBeds.length, ...counts }
  }, [selectedWard, summary, wardScopedBeds])

  const filteredBeds = useMemo(() => {
    const text = filterText.trim().toLowerCase()
    if (!text) return wardScopedBeds
    return wardScopedBeds.filter((bed) =>
      [
        bed.ward,
        bed.room_no,
        bed.bed_no,
        bed.bed_type,
        bedOccupantName(bed),
        bed.patient_id,
      ]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(text)),
    )
  }, [wardScopedBeds, filterText])

  const groupedByWard = useMemo(() => {
    const wards = new Map<string, Map<string, Bed[]>>()
    for (const bed of filteredBeds) {
      const ward = bed.ward || "Unassigned Ward"
      const room = bed.room_no || "Unassigned Room"
      if (!wards.has(ward)) wards.set(ward, new Map())
      const rooms = wards.get(ward)!
      if (!rooms.has(room)) rooms.set(room, [])
      rooms.get(room)!.push(bed)
    }
    return wards
  }, [filteredBeds])

  const otherAvailableBeds = useMemo(() => {
    const text = transferFilter.trim().toLowerCase()
    return beds
      .filter((b) => b.status === "Available" && b.id !== selectedBed?.id)
      .filter((b) => {
        if (!text) return true
        return [b.ward, b.room_no, b.bed_no, b.bed_type]
          .filter(Boolean)
          .some((field) => (field as string).toLowerCase().includes(text))
      })
  }, [beds, transferFilter, selectedBed])

  const handleAssign = async () => {
    if (!selectedBed) return
    const patientToAssign: Patient | null =
      selectedPatient ||
      (patientQuery.trim()
        ? {
            patient_id: `P-${Math.floor(100000 + Math.random() * 900000)}`,
            name: patientQuery.trim(),
            last_name: "",
            gender: "Male",
            phone: "+91 98765 43210",
          }
        : null)

    if (!patientToAssign) {
      alert("Please select or enter a patient name to allocate this bed.")
      return
    }

    setAssigning(true)
    try {
      await apiFetch(`/api/beds/${selectedBed.id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientToAssign.patient_id,
          patient_name: patientToAssign.name,
          patient: {
            patient_id: patientToAssign.patient_id,
            name: patientToAssign.name,
            last_name: patientToAssign.last_name || "",
            age: patientToAssign.age,
            gender: patientToAssign.gender,
            phone: patientToAssign.phone,
          },
          notes: assignNotes.trim(),
          expected_los_days: expectedLosDays.trim() || undefined,
        }),
      })

      // Synchronize any matching transfer notifications or ER requests
      try {
        const notifs = BedDatabase.getTransferNotifications()
        const matchNotif = notifs.find(
          (n) =>
            n.patient_id === patientToAssign.patient_id &&
            n.status !== "allocated",
        )
        if (matchNotif) {
          BedDatabase.updateNotificationStatus(
            matchNotif.id,
            "allocated",
            selectedBed.id,
            `${selectedBed.ward} (Room ${selectedBed.room_no} / Bed ${selectedBed.bed_no})`,
          )
        }

        const matchEr = erRequests.find(
          (r) =>
            (r.patient_id === patientToAssign.patient_id ||
              (r.visit_no &&
                activePendingAllocation?.visit_no === r.visit_no)) &&
            r.status === "pending",
        )
        if (matchEr) {
          await apiFetch(`/api/er/bed-requests/${matchEr.id}/allocate`, {
            method: "POST",
            body: JSON.stringify({
              bed_id: selectedBed.id,
              notes: assignNotes.trim(),
            }),
          }).catch(() => {})
        }
      } catch {
        // best-effort
      }

      BedDatabase.clearPendingAllocation()
      setActivePendingAllocation(null)

      setNotice({
        type: "success",
        message: `${patientToAssign.name || "Patient"} admitted to ${selectedBed.ward} / Room ${selectedBed.room_no} / Bed ${selectedBed.bed_no}.`,
      })
      resetSelection()
      await Promise.all([loadBeds(), loadErRequests()])
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to assign this bed.",
      )
    } finally {
      setAssigning(false)
    }
  }

  const handleCancelAllocation = async () => {
    if (!selectedBed) return
    if (
      !confirm(
        `Are you sure you want to cancel the allocation for ${bedOccupantName(selectedBed)} and return Bed ${selectedBed.bed_no} to Available state?`,
      )
    ) {
      return
    }
    setReleasing(true)
    try {
      await apiFetch(`/api/beds/${selectedBed.id}/release`, {
        method: "POST",
        body: JSON.stringify({
          discharge_override_reason:
            "Bed allocation cancelled by administrator",
        }),
      })
      setNotice({
        type: "success",
        message: `Allocation for Bed ${selectedBed.bed_no} cancelled. Bed is now Available.`,
      })
      resetSelection()
      await loadBeds()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string; status?: number },
        "Unable to cancel bed allocation.",
      )
    } finally {
      setReleasing(false)
    }
  }

  const openTransfer = () => {
    setTransferOpen(true)
    setTransferFilter("")
    setTransferTargetId(null)
    setTransferReason("")
  }

  const handleTransfer = async () => {
    if (!selectedBed || !transferTargetId) return
    setTransferring(true)
    try {
      await apiFetch(`/api/beds/${selectedBed.id}/transfer`, {
        method: "POST",
        body: JSON.stringify({
          to_bed_id: transferTargetId,
          reason: transferReason.trim(),
        }),
      })
      const target = beds.find((b) => b.id === transferTargetId)
      setNotice({
        type: "success",
        message: target
          ? `${bedOccupantName(selectedBed)} transferred to ${target.ward} / Room ${target.room_no} / Bed ${target.bed_no}.`
          : "Patient transferred.",
      })
      resetSelection()
      await loadBeds()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to transfer this patient.",
      )
    } finally {
      setTransferring(false)
    }
  }

  const openDischarge = async (bed?: Bed) => {
    const targetBed = bed ?? selectedBed
    if (!targetBed) return
    setDischargeOpen(true)
    setChecklistLoading(true)
    setDischargeReason("")
    try {
      const data = await apiFetch<DischargeChecklist>(
        `/api/beds/${targetBed.id}/discharge-checklist`,
      )
      setChecklist(data)
      setRoomChargeSegments(data.room_charges?.segments || [])
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to load the discharge checklist.",
      )
      setChecklist(null)
    } finally {
      setChecklistLoading(false)
    }
  }

  const handleRelease = async () => {
    if (!selectedBed) return
    setReleasing(true)
    try {
      const roomChargeTotal = roomChargeSegments.reduce(
        (sum, s) => sum + s.days * s.daily_rate,
        0,
      )
      await apiFetch(`/api/beds/${selectedBed.id}/release`, {
        method: "POST",
        body: JSON.stringify({
          discharge_override_reason: dischargeReason.trim() || undefined,
          room_charge_total:
            roomChargeSegments.length > 0 ? roomChargeTotal : undefined,
        }),
      })

      // Compile everything recorded during this stay (doctor/nurse notes,
      // vitals, diagnoses, medications, lab results) into a permanent
      // discharge summary -- best-effort: the bed is already released above,
      // so a summary failure here shouldn't look like the discharge failed.
      let summaryFailed = false
      if (selectedBed.patient_id) {
        try {
          await generateAndSaveDischargeSummary(
            selectedBed.patient_id,
            selectedBed.admission_id ?? undefined,
          )
        } catch {
          summaryFailed = true
        }
      }

      setNotice({
        type: summaryFailed ? "warning" : "success",
        message:
          (roomChargeSegments.length > 0
            ? `Bed ${selectedBed.bed_no} released. Room charges bill: ${formatINR(roomChargeTotal)}.`
            : `Bed ${selectedBed.bed_no} released and patient discharged.`) +
          (summaryFailed
            ? " (Discharge summary could not be generated — add it manually from the patient's chart.)"
            : ""),
      })
      resetSelection()
      await Promise.all([loadBeds(), loadDischarged()])
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to release this bed.",
      )
    } finally {
      setReleasing(false)
    }
  }

  const handleSaveBedEdit = async () => {
    if (!selectedBed) return
    setSavingBedEdit(true)
    try {
      await apiFetch(`/api/beds/${selectedBed.id}`, {
        method: "PUT",
        body: JSON.stringify(editBedForm),
      })
      setNotice({ type: "success", message: "Bed details updated." })
      resetSelection()
      await loadBeds()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to update this bed.",
      )
    } finally {
      setSavingBedEdit(false)
    }
  }

  const handleDeleteBed = async () => {
    if (!selectedBed) return
    setConfirmDeleteBed(false)
    try {
      await apiFetch(`/api/beds/${selectedBed.id}`, { method: "DELETE" })
      setNotice({
        type: "success",
        message: `Bed ${selectedBed.bed_no} deleted.`,
      })
      resetSelection()
      await loadBeds()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to delete this bed.",
      )
    }
  }

  const handleToggleMaintenance = async () => {
    if (!selectedBed) return
    const nextStatus =
      selectedBed.status === "Maintenance" ? "Available" : "Maintenance"
    setSavingBedEdit(true)
    try {
      await apiFetch(`/api/beds/${selectedBed.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      })
      setNotice({
        type: "success",
        message: `Bed ${selectedBed.bed_no} marked as ${nextStatus}.`,
      })
      resetSelection()
      await loadBeds()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to update bed status.",
      )
    } finally {
      setSavingBedEdit(false)
    }
  }

  const handleAddBed = async () => {
    setAddingBed(true)
    try {
      const result = await apiFetch<{
        created_count: number
        skipped_count: number
      }>("/api/beds/bulk", {
        method: "POST",
        body: JSON.stringify({
          ward: newBedRange.ward.trim(),
          room_no: newBedRange.room_no.trim(),
          from_bed: newBedRange.from_bed.trim(),
          to_bed: newBedRange.to_bed.trim(),
          bed_type: newBedRange.bed_type,
          daily_rate: Number(newBedRange.daily_rate) || 0,
        }),
      })
      const parts = [
        result.created_count > 0
          ? `${result.created_count} bed${
              result.created_count === 1 ? "" : "s"
            } added`
          : null,
        result.skipped_count > 0
          ? `${result.skipped_count} already existed`
          : null,
      ].filter(Boolean)
      setNotice({
        type: result.created_count > 0 ? "success" : "error",
        message: parts.join(", ") || "Nothing to add.",
      })
      setNewBedRange((prev) => ({ ...prev, from_bed: "", to_bed: "" }))
      await loadBeds()
    } catch (error) {
      reportError(
        setNotice,
        error as { message?: string ;status?: number },
        "Unable to add these beds.",
      )
    } finally {
      setAddingBed(false)
    }
  }

  const filteredDischarged = dischargedPatients.filter((dp) => {
    const q = dischargedSearch.toLowerCase().trim()
    if (!q) return true
    return (
      (dp.patientName || "").toLowerCase().includes(q) ||
      (dp.mrn || "").includes(q) ||
      (dp.ward || "").toLowerCase().includes(q) ||
      (dp.bedNo || "").toLowerCase().includes(q) ||
      (dp.dischargeReason || "").toLowerCase().includes(q)
    )
  })

  return (
    <section className="w-full min-h-screen bg-[#F8FAFC]">
      {/* ── SEGMENTED TOP NAVIGATION HEADER TABS ── */}
      <div className="w-full bg-white border-b border-[#E2E8F0] px-6 sm:px-8 pt-3 mb-5 flex items-end justify-between flex-wrap gap-4 shadow-xs">
        <div className="flex items-end gap-1">
          <button
            type="button"
            onClick={() => setActiveView("bed_board")}
            className={`px-4 py-2.5 text-[13px] font-bold border-b-2 -mb-px transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "bed_board"
                ? "border-[#1B4FD8] text-[#1B4FD8] bg-transparent"
                : "border-transparent text-[#64748B] hover:text-[#0F172A] bg-transparent"
            }`}
          >
            <span className="flex items-center gap-2">
              <FaBed aria-hidden /> Assign &amp; Manage Beds
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono rounded-full font-bold ${
                activeView === "bed_board"
                  ? "bg-[#EFF6FF] text-[#1B4FD8]"
                  : "bg-[#F1F5F9] text-[#64748B]"
              }`}
            >
              {beds.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveView("discharged")
              void loadDischarged()
            }}
            className={`px-4 py-2.5 text-[13px] font-bold border-b-2 -mb-px transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "discharged"
                ? "border-[#1B4FD8] text-[#1B4FD8] bg-transparent"
                : "border-transparent text-[#64748B] hover:text-[#0F172A] bg-transparent"
            }`}
          >
            <span className="flex items-center gap-2">
              <FiClipboard aria-hidden /> Discharged Patients
            </span>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono rounded-full font-bold ${
                activeView === "discharged"
                  ? "bg-[#EFF6FF] text-[#1B4FD8]"
                  : "bg-[#F1F5F9] text-[#64748B]"
              }`}
            >
              {dischargedPatients.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 pb-2.5">
          {/* Notification Icon & Flyout Panel */}
          <WardAlertsNotificationPanel
            beds={beds}
            onSelectWard={setSelectedWard}
            onViewPatientChart={onOpenPatientClinical}
          />
          <BedTransferNotificationPanel
            onAllocateTransfer={handleAllocateFromNotification}
            onViewPatientChart={onOpenPatientClinical}
            canManageBeds={canManageBeds}
            setNotice={setNotice}
          />
          {activeView === "bed_board" && canManageBeds && (
            <Button onClick={() => setAddBedOpen(true)} className="font-bold">
              <FiPlus aria-hidden /> Add Bed
            </Button>
          )}
        </div>
      </div>

      {activeView === "discharged" ? (
        <DischargedDirectoryView
          dischargedPatients={dischargedPatients}
          loading={dischargedLoading}
          onRefresh={loadDischarged}
        />
      ) : (
        <div className="px-6 sm:px-8 pb-12 space-y-5">
          {/* Active Allocation Mode Banner */}
          {activePendingAllocation && (
            <div className="relative overflow-hidden bg-gradient-to-r from-[#0C1524] via-[#1B4FD8] to-[#2563EB] text-white p-4 sm:p-5 rounded-2xl shadow-xl border border-blue-400/40 animate-in slide-in-from-top-3 duration-300">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-300 text-xl shadow-inner shrink-0">
                    <FaBed className="animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider bg-amber-400 text-amber-950 rounded font-mono shadow-xs">
                        {activePendingAllocation.priority || "Stat / ER Transfer"}
                      </span>
                      <span className="text-blue-100 text-xs font-semibold flex items-center gap-1.5">
                        <span>
                          {activePendingAllocation.source ||
                            "Emergency Department"}
                        </span>
                        <span className="text-blue-300">&rarr;</span>
                        <span className="text-white font-bold">
                          {activePendingAllocation.requested_level_of_care ||
                            activePendingAllocation.requested_specialty ||
                            "Inpatient Bed"}
                        </span>
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-extrabold text-white mt-1 flex items-center gap-2 flex-wrap">
                      Allocating Bed for: {activePendingAllocation.name}{" "}
                      {activePendingAllocation.last_name || ""}
                      <span className="text-xs font-mono font-normal text-blue-200 bg-white/10 px-2 py-0.5 rounded">
                        {activePendingAllocation.patient_id}
                      </span>
                    </h2>
                    <p className="text-xs text-blue-100/90 mt-1 flex items-center gap-2 flex-wrap font-medium">
                      <span>
                        Age: {activePendingAllocation.age ?? "—"}y &middot;{" "}
                        {activePendingAllocation.gender ?? "—"}
                      </span>
                      {activePendingAllocation.phone && (
                        <span>
                          &middot; Phone: {activePendingAllocation.phone}
                        </span>
                      )}
                      {activePendingAllocation.visit_no && (
                        <span>
                          &middot; Visit: {activePendingAllocation.visit_no}
                        </span>
                      )}
                      <span className="text-emerald-300 font-bold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">
                        ⚡ Click any Available Bed below to allocate with auto-fetched details
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      BedDatabase.clearPendingAllocation()
                      setActivePendingAllocation(null)
                    }}
                    className="text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/25 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel Allocation
                  </button>
                </div>
              </div>
            </div>
          )}

          <>
            {/* Explicit 4-up (.stat-grid-4): the shared .stat-grid is
              repeat(5,...) for modules with five counts, which left this
              page's four cards ending ~250px short of the panel below them. */}
            <div className="stat-grid stat-grid-4">
              <StatCard
                icon={<FaBed aria-hidden />}
                label={
                  selectedWard === "all"
                    ? "Total Beds"
                    : `${selectedWard} — Beds`
                }
                value={displaySummary.total}
              />
              <StatCard
                icon={<FiCheckCircle aria-hidden />}
                label="Available"
                value={displaySummary.available}
              />
              <StatCard
                icon={<FiUser aria-hidden />}
                label="Occupied"
                value={displaySummary.occupied}
              />
              <StatCard
                icon={<FiTool aria-hidden />}
                label="Maintenance"
                value={displaySummary.maintenance}
              />
            </div>

            {(erRequestsLoading || erRequests.length > 0) && (
              <div className="panel">
                <div className="module-panel-head">
                  <h3
                    style={{
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <FiBell aria-hidden /> ER Bed Requests
                  </h3>
                  <p className="muted" style={{ margin: 0 }}>
                    The ER doctor's clinical decision &mdash; pick the actual
                    bed here.
                  </p>
                </div>
                {erRequestsLoading ? (
                  <p className="muted">Loading ER requests...</p>
                ) : (
                  <Table>
                    <TableHead>
                      <TableCell>ER Visit</TableCell>
                      <TableCell>Patient</TableCell>
                      <TableCell>Level of Care</TableCell>
                      <TableCell>Specialty</TableCell>
                      <TableCell>Requested</TableCell>
                      <TableCell />
                    </TableHead>
                    {erRequests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>{req.visit_no}</TableCell>
                        <TableCell>{erRequestPatientLabel(req)}</TableCell>
                        <TableCell style={{ textTransform: "uppercase" }}>
                          {req.requested_level_of_care}
                        </TableCell>
                        <TableCell>{req.requested_specialty || "-"}</TableCell>
                        <TableCell>
                          {formatDateTimeIST(req.requested_at)}
                        </TableCell>
                        <TableCell style={{ textAlign: "right" }}>
                          {canManageBeds ? (
                            <>
                              <Button
                                type="button"
                                onClick={() => setAllocatingRequest(req)}
                              >
                                Allocate Bed
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                style={{ marginLeft: "0.5rem" }}
                                onClick={() => setLamaRequest(req)}
                              >
                                LAMA / Cancel
                              </Button>
                            </>
                          ) : (
                            <span
                              className="muted"
                              style={{ fontSize: "0.8rem" }}
                            >
                              View only
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Table>
                )}
              </div>
            )}

            <div className="panel">
              <div className="bed-map-toolbar">
                {/* Ward picker and search read as one filter group; the legend is a
              key, not a control, so it sits apart on the right. */}
                <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                  <select
                    className="ui-input bed-ward-select"
                    aria-label="Filter by ward"
                    value={selectedWard}
                    onChange={(event) => setSelectedWard(event.target.value)}
                  >
                    <option value="all">All Wards</option>
                    {wardOptions.map((ward) => (
                      <option key={ward} value={ward}>
                        {ward}
                      </option>
                    ))}
                  </select>
                  <div
                    className="ai-search-bar"
                    style={{ flex: 1, maxWidth: "420px" }}
                  >
                    <FiSearch className="ai-search-icon" aria-hidden />
                    <Input
                      className="ai-search-input"
                      placeholder="Filter by room, bed or patient"
                      value={filterText}
                      onChange={(event) => setFilterText(event.target.value)}
                    />
                  </div>
                </div>
                <div className="bed-map-legend">
                  <span className="bed-legend-item">
                    <span className="bed-legend-swatch bed-legend-swatch-available" />{" "}
                    Available
                  </span>
                  <span className="bed-legend-item">
                    <span className="bed-legend-swatch bed-legend-swatch-male" />{" "}
                    Occupied (Male)
                  </span>
                  <span className="bed-legend-item">
                    <span className="bed-legend-swatch bed-legend-swatch-female" />{" "}
                    Occupied (Female)
                  </span>
                  <span className="bed-legend-item">
                    <span className="bed-legend-swatch bed-legend-swatch-maintenance" />{" "}
                    Maintenance
                  </span>
                  <span className="bed-legend-item">
                    <span className="bed-legend-swatch bed-legend-swatch-icu" />{" "}
                    ICU
                  </span>
                </div>
              </div>

              {loading ? (
                <p className="muted">Loading beds...</p>
              ) : beds.length === 0 ? (
                <div className="module-empty-state">
                  <p className="module-empty-state-title">No beds set up yet</p>
                  <p className="module-empty-state-hint">
                    Click "Add Bed" above to start building out your ward
                    layout.
                  </p>
                </div>
              ) : filteredBeds.length === 0 ? (
                <p className="muted">
                  {filterText
                    ? `No beds match "${filterText}".`
                    : `No beds in ${selectedWard}.`}
                </p>
              ) : (
                Array.from(groupedByWard.entries()).map(([ward, rooms]) => {
                  const wardBeds = Array.from(rooms.values()).flat()
                  const wardCounts = statusCounts(wardBeds)
                  const total = wardBeds.length || 1
                  return (
                    <div className="bed-ward-block" key={ward}>
                      <div className="bed-ward-header">
                        <h4 className="bed-ward-title">
                          {ward.toUpperCase().includes("ICU") ? (
                            <FiActivity
                              aria-hidden
                              style={{ color: "#DC2626" }}
                            />
                          ) : (
                            <FiHome aria-hidden />
                          )}{" "}
                          {ward}
                        </h4>
                        <div
                          className="bed-occupancy-bar"
                          title={`${wardCounts.available} available, ${wardCounts.occupied} occupied, ${wardCounts.maintenance} maintenance`}
                        >
                          {wardCounts.occupied > 0 && (
                            <span
                              className="bed-occupancy-segment bed-occupancy-segment-occupied"
                              style={{
                                width: `${(wardCounts.occupied / total) * 100}%`,
                              }}
                            />
                          )}
                          {wardCounts.maintenance > 0 && (
                            <span
                              className="bed-occupancy-segment bed-occupancy-segment-maintenance"
                              style={{
                                width: `${(wardCounts.maintenance / total) * 100}%`,
                              }}
                            />
                          )}
                          {wardCounts.available > 0 && (
                            <span
                              className="bed-occupancy-segment bed-occupancy-segment-available"
                              style={{
                                width: `${(wardCounts.available / total) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                        <div className="bed-ward-meta">
                          <span>
                            <strong style={{ color: "#0F172A" }}>
                              {Math.round((wardCounts.occupied / total) * 100)}%
                            </strong>{" "}
                            occupied
                          </span>
                          <div className="bed-ward-counts">
                            <span
                              className="bed-count-badge bed-count-badge-occupied"
                              title="Occupied"
                            >
                              {wardCounts.occupied}
                            </span>
                            <span
                              className="bed-count-badge bed-count-badge-available"
                              title="Available"
                            >
                              {wardCounts.available}
                            </span>
                            {wardCounts.maintenance > 0 && (
                              <span
                                className="bed-count-badge bed-count-badge-maintenance"
                                title="Maintenance"
                              >
                                {wardCounts.maintenance}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <WardBedBoard
                        rooms={rooms}
                        onBedClick={openBed}
                        onPatientClick={
                          onOpenPatientClinical
                            ? (bed) =>
                                bed.patient_id &&
                                onOpenPatientClinical(bed.patient_id)
                            : undefined
                        }
                      />
                    </div>
                  )
                })
              )}
            </div>

            {/* Add Bed(s) */}
            <Modal
              open={addBedOpen}
              onClose={() => setAddBedOpen(false)}
              title="Add Beds"
              description="Create a single bed, or a whole numbered range in one go."
            >
              <div className="bed-form-section">
                <span className="bed-form-legend">Location</span>
                <div className="bed-form-grid">
                  <Label>
                    Ward
                    <Input
                      value={newBedRange.ward}
                      onChange={(e) =>
                        setNewBedRange({ ...newBedRange, ward: e.target.value })
                      }
                      placeholder="e.g. General Ward"
                      list="bed-ward-suggestions"
                    />
                  </Label>
                  {/* Existing ward names offered as suggestions -- ward is free text,
                and a typo silently creates a second ward on the board. */}
                  <datalist id="bed-ward-suggestions">
                    {wardOptions.map((ward) => (
                      <option key={ward} value={ward} />
                    ))}
                  </datalist>
                  <Label>
                    Room No.
                    <Input
                      value={newBedRange.room_no}
                      onChange={(e) =>
                        setNewBedRange({
                          ...newBedRange,
                          room_no: e.target.value,
                        })
                      }
                      placeholder="e.g. 101"
                    />
                  </Label>
                </div>
              </div>

              <div className="bed-form-section">
                <span className="bed-form-legend">Bed numbers</span>
                <div className="bed-form-grid">
                  <Label>
                    From bed no.
                    <Input
                      type="number"
                      min={1}
                      value={newBedRange.from_bed}
                      onChange={(e) =>
                        setNewBedRange({
                          ...newBedRange,
                          from_bed: e.target.value,
                        })
                      }
                      placeholder="e.g. 1"
                    />
                  </Label>
                  <Label>
                    To bed no.
                    <Input
                      type="number"
                      min={1}
                      value={newBedRange.to_bed}
                      onChange={(e) =>
                        setNewBedRange({
                          ...newBedRange,
                          to_bed: e.target.value,
                        })
                      }
                      placeholder="Blank = one bed"
                    />
                  </Label>
                </div>
                {/* Reads the range back before anything is created -- typing 100 in
              "to bed" instead of 10 otherwise creates 100 beds silently. */}
                <div
                  className={`bed-form-preview${
                    newBedPlan.invalid ? " bed-form-preview-warn" : ""
                  }`}
                >
                  {newBedPlan.message}
                </div>
              </div>

              <div className="bed-form-section">
                <span className="bed-form-legend">Type &amp; rate</span>
                <div className="bed-form-grid">
                  <Label>
                    Bed type
                    <select
                      className="ui-input"
                      value={newBedRange.bed_type}
                      onChange={(e) =>
                        setNewBedRange({
                          ...newBedRange,
                          bed_type: e.target.value,
                          daily_rate: String(
                            BED_TYPE_DEFAULT_DAILY_RATE[e.target.value] ??
                              BED_TYPE_DEFAULT_DAILY_RATE.General,
                          ),
                        })
                      }
                    >
                      {BED_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label>
                    Daily rate (₹)
                    <Input
                      type="number"
                      min={0}
                      value={newBedRange.daily_rate}
                      onChange={(e) =>
                        setNewBedRange({
                          ...newBedRange,
                          daily_rate: e.target.value,
                        })
                      }
                      placeholder="Room charge per day"
                    />
                  </Label>
                </div>
                <p className="bed-form-hint">
                  Changing the bed type resets the rate to that type's default;
                  edit it after if this ward charges differently.
                </p>
              </div>

              <div className="ui-modal-actions" style={{ marginTop: "1.1rem" }}>
                <Button variant="ghost" onClick={() => setAddBedOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddBed}
                  disabled={
                    addingBed || newBedPlan.invalid || newBedPlan.count === 0
                  }
                >
                  {addingBed
                    ? "Adding..."
                    : newBedPlan.count > 1
                      ? `Add ${newBedPlan.count} beds`
                      : "Add bed"}
                </Button>
              </div>
            </Modal>

            {/* Bed detail / assign / transfer / discharge */}
            <Modal
              open={!!selectedBed}
              onClose={resetSelection}
              title={
                selectedBed
                  ? `${selectedBed.ward} · Room ${selectedBed.room_no} · Bed ${selectedBed.bed_no}`
                  : ""
              }
              description={
                selectedBed ? `${selectedBed.bed_type} bed` : undefined
              }
            >
              {selectedBed &&
                selectedBed.status === "Occupied" &&
                !transferOpen &&
                !dischargeOpen && (
                  <>
                    <div className="bed-detail-patient">
                      <FiUser aria-hidden />
                      <div>
                        <p className="bed-detail-patient-name">
                          {bedOccupantName(selectedBed)}
                        </p>
                        <p className="muted">
                          {selectedBed.patient_id}
                          {selectedBed.patient_age
                            ? ` · ${selectedBed.patient_age} yrs`
                            : ""}
                          {selectedBed.patient_gender
                            ? ` · ${selectedBed.patient_gender}`
                            : ""}
                          {selectedBed.patient_phone
                            ? ` · ${selectedBed.patient_phone}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    {selectedBed.allocated_at && (
                      <p className="muted">
                        Admitted {formatDateTimeIST(selectedBed.allocated_at)}
                      </p>
                    )}
                    {(() => {
                      const los = losProgress(selectedBed)
                      return los ? (
                        <p className="muted">
                          Day {los.dayNum}
                          {los.totalDays
                            ? ` of ${los.totalDays} expected`
                            : " (no expected discharge date set)"}
                          {los.overdue ? " — past expected discharge date" : ""}
                        </p>
                      ) : null
                    })()}
                    {selectedBed.admission_notes && (
                      <p style={{ marginTop: "0.5rem" }}>
                        {selectedBed.admission_notes}
                      </p>
                    )}

                    <div
                      className="ui-modal-actions"
                      style={{ marginTop: "1rem" }}
                    >
                      <Button variant="ghost" onClick={resetSelection}>
                        Close
                      </Button>
                      {onOpenPatientClinical && selectedBed.patient_id && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            onOpenPatientClinical(selectedBed.patient_id!)
                          }
                        >
                          <FiUser aria-hidden /> View Clinical Chart
                        </Button>
                      )}
                      {canManageBeds && (
                        <>
                          <Button variant="ghost" onClick={openTransfer}>
                            <FiRepeat aria-hidden /> Transfer
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={handleCancelAllocation}
                            style={{ color: "#B45309", borderColor: "#FDE68A" }}
                          >
                            <FiX aria-hidden /> Cancel Allocation
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => void openDischarge()}
                          >
                            Discharge
                          </Button>
                        </>
                      )}
                    </div>
                  </>
                )}

              {/* Transfer panel */}
              {selectedBed && transferOpen && (
                <>
                  <p className="muted">
                    Move {bedOccupantName(selectedBed)} to a different bed
                    &mdash; a room change, or shifting them to ICU. This keeps
                    the same admission and bed history intact.
                  </p>
                  <Label style={{ marginTop: "0.85rem" }}>
                    Find an available bed
                    <Input
                      value={transferFilter}
                      onChange={(e) => setTransferFilter(e.target.value)}
                      placeholder="Search by ward, room, bed number, or type (try 'ICU')"
                    />
                  </Label>
                  <div className="bed-transfer-target-list">
                    {otherAvailableBeds.length === 0 ? (
                      <p className="muted" style={{ padding: "0.5rem 0" }}>
                        No available beds match.
                      </p>
                    ) : (
                      otherAvailableBeds.map((bed) => (
                        <button
                          type="button"
                          key={bed.id}
                          className={`bed-transfer-target${
                            transferTargetId === bed.id
                              ? " bed-transfer-target-selected"
                              : ""
                          }`}
                          onClick={() => setTransferTargetId(bed.id)}
                        >
                          <span>
                            {bed.ward} / Room {bed.room_no} / Bed {bed.bed_no}
                          </span>
                          <span
                            className="bed-card-type-badge"
                            style={bedTypeStyle(bed.bed_type)}
                          >
                            {bed.bed_type}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <Label style={{ marginTop: "0.75rem" }}>
                    Reason for Transfer
                    <Textarea
                      rows={2}
                      value={transferReason}
                      onChange={(e) => setTransferReason(e.target.value)}
                      placeholder="e.g. Condition worsened, requires ICU monitoring"
                    />
                  </Label>
                  <div
                    className="ui-modal-actions"
                    style={{ marginTop: "1rem" }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => setTransferOpen(false)}
                      disabled={transferring}
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleTransfer}
                      disabled={
                        transferring ||
                        !transferTargetId ||
                        !transferReason.trim()
                      }
                    >
                      {transferring ? "Transferring..." : "Confirm Transfer"}
                    </Button>
                  </div>
                </>
              )}

              {/* Discharge checklist panel */}
              {selectedBed && dischargeOpen && (
                <>
                  <p className="muted">
                    Review before discharging {bedOccupantName(selectedBed)}.
                    Pending items are shown as a warning — you can still
                    discharge if needed (e.g. discharge against medical advice).
                  </p>
                  {checklistLoading ? (
                    <p className="muted" style={{ padding: "0.75rem 0" }}>
                      Loading checklist...
                    </p>
                  ) : checklist ? (
                    <div className="discharge-checklist">
                      <div
                        className={`discharge-checklist-row${
                          checklist.billing?.ok
                            ? " discharge-checklist-row-ok"
                            : " discharge-checklist-row-warn"
                        }`}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          {checklist.billing?.ok ? (
                            <FiCheckCircle aria-hidden />
                          ) : (
                            <FiAlertTriangle aria-hidden />
                          )}{" "}
                          Central Billing Financial Clearance
                        </span>
                        <span style={{ fontWeight: 700 }}>
                          {checklist.billing?.ok
                            ? "✅ All Inpatient Folios Settled (Receipt Issued)"
                            : `🔒 Due: ${formatINR(
                                checklist.billing?.pending_invoices?.reduce(
                                  (sum, inv) => sum + (inv.due_amount || 0),
                                  0,
                                ) || 0,
                              )} (${checklist.billing?.pending_invoices?.length || 0} invoice(s) pending)`}
                        </span>
                      </div>
                      {!checklist.billing?.ok &&
                        (checklist.billing?.pending_invoices?.length || 0) > 0 && (
                          <div
                            style={{
                              background: "#fffbeb",
                              border: "1px solid #fef3c7",
                              borderRadius: "6px",
                              padding: "0.5rem 0.75rem",
                              fontSize: "0.78rem",
                              color: "#92400e",
                              marginTop: "-0.25rem",
                              marginBottom: "0.35rem",
                            }}
                          >
                            <strong
                              style={{
                                display: "block",
                                marginBottom: "0.2rem",
                              }}
                            >
                              Pending Inpatient Invoices (Settle at Central
                              Billing):
                            </strong>
                            {(checklist.billing?.pending_invoices || []).map(
                              (inv, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  <span>• {inv.invoice_no}</span>
                                  <span
                                    style={{
                                      fontWeight: 700,
                                      color: "#b45309",
                                    }}
                                  >
                                    {formatINR(inv.due_amount)}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      <div
                        className={`discharge-checklist-row${
                          checklist.prescriptions?.ok
                            ? " discharge-checklist-row-ok"
                            : " discharge-checklist-row-warn"
                        }`}
                      >
                        <span>
                          {checklist.prescriptions?.ok ? (
                            <FiCheckCircle aria-hidden />
                          ) : (
                            <FiAlertTriangle aria-hidden />
                          )}{" "}
                          Prescriptions
                        </span>
                        <span>
                          {checklist.prescriptions?.ok
                            ? "All fulfilled"
                            : `${checklist.prescriptions?.pending_count || 0} pending`}
                        </span>
                      </div>
                      <div className="discharge-checklist-row discharge-checklist-row-info">
                        <span>Documents</span>
                        <span>
                          {checklist.documents?.count ?? 0} on file for this
                          stay
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="muted" style={{ padding: "0.75rem 0" }}>
                      Couldn't load the checklist — you can still discharge
                      below.
                    </p>
                  )}

                  {roomChargeSegments.length > 0 && (
                    <>
                      <p className="muted" style={{ marginTop: "1rem" }}>
                        Room charges for this stay — one line per ward/bed the
                        patient occupied. Rates are editable before billing.
                      </p>
                      <div className="table-responsive">
                        <Table>
                          <TableHead>
                            <TableCell>Ward / Room / Bed</TableCell>
                            <TableCell>Days</TableCell>
                            <TableCell>Rate / Day</TableCell>
                            <TableCell>Amount</TableCell>
                          </TableHead>
                          {roomChargeSegments.map((segment, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                {segment.ward} / Room {segment.room_no} / Bed{" "}
                                {segment.bed_no}
                              </TableCell>
                              <TableCell>{segment.days}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  style={{ width: "90px" }}
                                  value={segment.daily_rate}
                                  aria-label={`Daily rate for ${segment.ward} segment`}
                                  onChange={(e) => {
                                    const next = [...roomChargeSegments]
                                    next[idx] = {
                                      ...next[idx],
                                      daily_rate: Number(e.target.value) || 0,
                                    }
                                    setRoomChargeSegments(next)
                                  }}
                                />
                              </TableCell>
                              <TableCell style={{ fontWeight: 600 }}>
                                {formatINR(segment.days * segment.daily_rate)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </Table>
                      </div>
                      <div
                        className="module-panel-head"
                        style={{ marginTop: "0.75rem" }}
                      >
                        <h3
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <FiDollarSign aria-hidden /> Room Charges Total:{" "}
                          {formatINR(
                            roomChargeSegments.reduce(
                              (sum, s) => sum + s.days * s.daily_rate,
                              0,
                            ),
                          )}
                        </h3>
                      </div>
                    </>
                  )}

                  {checklist && !checklist.clear && (
                    <Label style={{ marginTop: "0.75rem" }}>
                      Reason for discharging despite pending items
                      <Textarea
                        rows={2}
                        value={dischargeReason}
                        onChange={(e) => setDischargeReason(e.target.value)}
                        placeholder="e.g. Discharge against medical advice, dues to be settled later"
                      />
                    </Label>
                  )}
                  <div
                    className="ui-modal-actions"
                    style={{ marginTop: "1rem" }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => setDischargeOpen(false)}
                      disabled={releasing}
                    >
                      Back
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleRelease}
                      disabled={
                        releasing ||
                        (!!checklist &&
                          !checklist.clear &&
                          !dischargeReason.trim())
                      }
                    >
                      {releasing
                        ? "Discharging..."
                        : checklist && !checklist.clear
                          ? "Discharge Anyway"
                          : "Confirm Discharge"}
                    </Button>
                  </div>
                </>
              )}

              {selectedBed &&
                selectedBed.status !== "Occupied" &&
                !editingBedDetails && (
                  <>
                    {selectedBed.status === "Maintenance" && (
                      <p className="notice warning">
                        <FiTool aria-hidden /> This bed is marked under
                        maintenance.
                      </p>
                    )}
                    {selectedBed.status === "Available" && !canManageBeds && (
                      <p className="muted">
                        This bed is available. You don't have permission to
                        admit a patient here.
                      </p>
                    )}
                    {selectedBed.status === "Available" && canManageBeds && (
                      <>
                        <div className="bed-form-section">
                          {selectedPatient ? (
                            <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-blue-50/90 border border-blue-200 rounded-xl mb-3 flex items-center justify-between gap-3 shadow-xs">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-[#1B4FD8] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                                  {(selectedPatient.name || "P")
                                    .charAt(0)
                                    .toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-[#0F172A] truncate">
                                      {selectedPatient.name}{" "}
                                      {selectedPatient.last_name || ""}
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-[#1B4FD8] bg-white border border-blue-200 px-1.5 py-0.2 rounded">
                                      {selectedPatient.patient_id}
                                    </span>
                                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full flex items-center gap-1">
                                      <FiCheckCircle className="w-3 h-3 text-emerald-600" />{" "}
                                      Auto-Fetched
                                    </span>
                                  </div>
                                  <div className="text-[11.5px] text-[#64748B] mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span>
                                      {selectedPatient.gender || "Gender N/A"}
                                    </span>
                                    {selectedPatient.age && (
                                      <span>
                                        &middot; {selectedPatient.age} yrs
                                      </span>
                                    )}
                                    {selectedPatient.phone && (
                                      <span>
                                        &middot; {selectedPatient.phone}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPatient(null)
                                  setPatientQuery("")
                                }}
                                className="text-xs text-[#64748B] hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-white/80 transition-colors flex items-center gap-1 shrink-0 cursor-pointer border border-[#E2E8F0]"
                                title="Clear and select different patient"
                              >
                                <FiX className="w-3.5 h-3.5" /> Change
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* 1-click Auto-fetch from Pending ER / Transfer requests */}
                              {(() => {
                                const notifs =
                                  BedDatabase.getTransferNotifications().filter(
                                    (n) =>
                                      n.status === "pending" ||
                                      n.status === "in_transit",
                                  )
                                const pendingEr = erRequests.filter(
                                  (r) => r.status === "pending",
                                )
                                if (
                                  notifs.length === 0 &&
                                  pendingEr.length === 0
                                )
                                  return null

                                return (
                                  <div className="mb-4 p-3.5 bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-blue-50/50 border border-amber-200/90 rounded-none shadow-xs">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                        <FiZap className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                                        Pending ER Transfers Awaiting Bed (
                                        {notifs.length + pendingEr.length})
                                      </span>
                                      <span className="text-[10.5px] text-amber-800 font-semibold">
                                        1-Click Auto-Fetch
                                      </span>
                                    </div>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                      {notifs.map((n) => (
                                        <div
                                          key={n.id}
                                          className="p-2.5 bg-white border border-amber-200 hover:border-blue-500 rounded-none flex items-center justify-between gap-3 transition-all hover:shadow-xs"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs font-bold text-[#0F172A] truncate">
                                                {n.patient_name}{" "}
                                                {n.patient_last_name || ""}
                                              </span>
                                              <span className="text-[10px] font-mono text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.2 rounded-none">
                                                {n.patient_id}
                                              </span>
                                              <span className="text-[9.5px] font-extrabold uppercase px-1.5 py-0.2 rounded-none bg-red-100 text-red-800">
                                                {n.priority}
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                                              {n.source_department} &rarr;{" "}
                                              <span className="font-semibold text-blue-700">
                                                {n.target_destination}
                                              </span>{" "}
                                              &middot; {n.clinical_reason}
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const pat: Patient = {
                                                patient_id: n.patient_id,
                                                name: n.patient_name,
                                                last_name:
                                                  n.patient_last_name || "",
                                                phone: n.patient_phone || "",
                                                age: n.patient_age ?? undefined,
                                                gender:
                                                  n.patient_gender || "Male",
                                              }
                                              setSelectedPatient(pat)
                                              setPatientQuery(
                                                `${n.patient_name} ${n.patient_last_name || ""}`.trim(),
                                              )
                                              setAssignNotes(
                                                `Admitted from ${n.source_department}. Reason: ${n.clinical_reason}`,
                                              )
                                              setExpectedLosDays(
                                                selectedBed.bed_type === "ICU"
                                                  ? "7"
                                                  : "4",
                                              )
                                            }}
                                            className="px-3 py-1 text-xs font-bold bg-[#1B4FD8] hover:bg-[#153eb5] text-white rounded-none transition-colors shrink-0 shadow-xs cursor-pointer flex items-center gap-1"
                                          >
                                            ⚡ Auto-Fill
                                          </button>
                                        </div>
                                      ))}
                                      {pendingEr.map((req) => (
                                        <div
                                          key={req.id}
                                          className="p-2.5 bg-white border border-blue-200 hover:border-blue-500 rounded-none flex items-center justify-between gap-3 transition-all hover:shadow-xs"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-xs font-bold text-[#0F172A] truncate">
                                                {erRequestPatientLabel(req)}
                                              </span>
                                              <span className="text-[10px] font-mono text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.2 rounded-none">
                                                {req.visit_no}
                                              </span>
                                              <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.2 rounded-none bg-blue-100 text-blue-800">
                                                {req.requested_level_of_care}
                                              </span>
                                            </div>
                                            <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                                              Requested:{" "}
                                              {req.requested_level_of_care}{" "}
                                              {req.requested_specialty
                                                ? `· ${req.requested_specialty}`
                                                : ""}
                                            </p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const pat: Patient = {
                                                patient_id:
                                                  req.patient_id ||
                                                  `P-ER-${req.er_visit_id || req.id}`,
                                                name:
                                                  req.patient_name ||
                                                  "Emergency Patient",
                                                last_name:
                                                  req.patient_last_name || "",
                                                phone: "",
                                                gender: "Male",
                                              }
                                              setSelectedPatient(pat)
                                              setPatientQuery(
                                                `${pat.name} ${pat.last_name || ""}`.trim(),
                                              )
                                              setAssignNotes(
                                                `Admitted from ER (${req.visit_no}) for ${req.requested_level_of_care}`,
                                              )
                                              setExpectedLosDays(
                                                selectedBed.bed_type === "ICU"
                                                  ? "7"
                                                  : "4",
                                              )
                                            }}
                                            className="px-3 py-1 text-xs font-bold bg-[#1B4FD8] hover:bg-[#153eb5] text-white rounded-none transition-colors shrink-0 shadow-xs cursor-pointer flex items-center gap-1"
                                          >
                                            ⚡ Auto-Fill
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })()}

                              <Label>
                                Search patient database
                                <Input
                                  value={patientQuery}
                                  onChange={(e) => {
                                    setPatientQuery(e.target.value)
                                    setSelectedPatient(null)
                                  }}
                                  placeholder="Search by name, phone, or patient ID"
                                />
                              </Label>
                              {patientResults.length > 0 && (
                                <div className="bed-patient-results">
                                  {patientResults.map((patient) => (
                                    <button
                                      type="button"
                                      key={patient.patient_id}
                                      className="bed-patient-result"
                                      onClick={() => {
                                        setSelectedPatient(patient)
                                        setPatientQuery(
                                          `${patient.name} ${patient.last_name || ""}`.trim(),
                                        )
                                        setPatientResults([])
                                      }}
                                    >
                                      <strong>
                                        {patient.name} {patient.last_name || ""}
                                      </strong>
                                      <span className="muted">
                                        {patient.patient_id}
                                        {patient.phone
                                          ? ` · ${patient.phone}`
                                          : ""}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="bed-form-section">
                          <span className="bed-form-legend">
                            Admission details
                          </span>
                          <Label>
                            <span className="bed-field-caption">
                              Expected length of stay{" "}
                              <em className="bed-field-optional">
                                (days, optional)
                              </em>
                            </span>
                            <Input
                              type="number"
                              min={1}
                              value={expectedLosDays}
                              onChange={(e) =>
                                setExpectedLosDays(e.target.value)
                              }
                              placeholder="e.g. 3"
                            />
                          </Label>
                          <Label>
                            <span className="bed-field-caption">
                              Admission notes{" "}
                              <em className="bed-field-optional">(optional)</em>
                            </span>
                            <Textarea
                              rows={3}
                              value={assignNotes}
                              onChange={(e) => setAssignNotes(e.target.value)}
                              placeholder="Reason for admission, attending doctor, etc."
                            />
                          </Label>
                        </div>
                        <div
                          className="ui-modal-actions"
                          style={{ marginTop: "1rem" }}
                        >
                          <Button variant="ghost" onClick={resetSelection}>
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAssign}
                            disabled={assigning || !selectedPatient}
                          >
                            {assigning ? (
                              "Admitting..."
                            ) : (
                              <>
                                <FiCheckCircle aria-hidden /> Admit to This Bed
                              </>
                            )}
                          </Button>
                        </div>
                      </>
                    )}

                    {canManageBeds && (
                      <div className="bed-modal-secondary">
                        <span className="bed-modal-secondary-label">
                          This bed
                        </span>
                        <Button
                          variant="ghost"
                          onClick={handleToggleMaintenance}
                          disabled={savingBedEdit}
                        >
                          <FiTool aria-hidden />
                          {selectedBed.status === "Maintenance"
                            ? "Mark available"
                            : "Mark under maintenance"}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setConfirmDeleteBed(false)
                            setEditingBedDetails(true)
                          }}
                        >
                          <FiEdit2 aria-hidden /> Edit bed details
                        </Button>
                      </div>
                    )}
                  </>
                )}

              {selectedBed && editingBedDetails && (
                <>
                  <div className="module-form-grid">
                    <Label>
                      Ward
                      <Input
                        value={editBedForm.ward}
                        onChange={(e) =>
                          setEditBedForm({
                            ...editBedForm,
                            ward: e.target.value,
                          })
                        }
                      />
                    </Label>
                    <Label>
                      Room No.
                      <Input
                        value={editBedForm.room_no}
                        onChange={(e) =>
                          setEditBedForm({
                            ...editBedForm,
                            room_no: e.target.value,
                          })
                        }
                      />
                    </Label>
                    <Label>
                      Bed No.
                      <Input
                        value={editBedForm.bed_no}
                        onChange={(e) =>
                          setEditBedForm({
                            ...editBedForm,
                            bed_no: e.target.value,
                          })
                        }
                      />
                    </Label>
                    <Label>
                      Bed Type
                      <select
                        className="ui-input"
                        value={editBedForm.bed_type}
                        onChange={(e) =>
                          setEditBedForm({
                            ...editBedForm,
                            bed_type: e.target.value,
                          })
                        }
                      >
                        {BED_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </Label>
                    <Label>
                      Daily Rate (₹)
                      <Input
                        type="number"
                        min={0}
                        value={editBedForm.daily_rate}
                        onChange={(e) =>
                          setEditBedForm({
                            ...editBedForm,
                            daily_rate: e.target.value,
                          })
                        }
                        placeholder="Room charge per day"
                      />
                    </Label>
                  </div>
                  {/* Delete is irreversible and used to sit flush against Cancel,
                firing on a single click. It now lives on the opposite side of
                the bar and asks once. */}
                  <div className="bed-modal-actions-split">
                    <div className="bed-modal-actions-danger">
                      {confirmDeleteBed ? (
                        <>
                          <span className="bed-modal-danger-text">
                            Delete bed {selectedBed.bed_no} permanently?
                          </span>
                          <Button
                            variant="ghost"
                            onClick={() => setConfirmDeleteBed(false)}
                            disabled={savingBedEdit}
                          >
                            Keep
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={handleDeleteBed}
                            disabled={savingBedEdit}
                          >
                            <FiTrash2 aria-hidden /> Yes, delete
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          className="bed-danger-link"
                          onClick={() => setConfirmDeleteBed(true)}
                          disabled={
                            savingBedEdit || selectedBed.status === "Occupied"
                          }
                          title={
                            selectedBed.status === "Occupied"
                              ? "Discharge or transfer the patient before deleting this bed"
                              : undefined
                          }
                        >
                          <FiTrash2 aria-hidden /> Delete bed
                        </Button>
                      )}
                    </div>
                    {!confirmDeleteBed && (
                      <div
                        className="ui-modal-actions"
                        style={{ marginTop: 0 }}
                      >
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setConfirmDeleteBed(false)
                            setEditingBedDetails(false)
                          }}
                          disabled={savingBedEdit}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleSaveBedEdit}
                          disabled={savingBedEdit}
                        >
                          {savingBedEdit ? "Saving..." : "Save changes"}
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Modal>

            <Modal
              open={!!allocatingRequest}
              onClose={closeAllocateModal}
              title="Allocate Bed"
              description={
                allocatingRequest
                  ? `ER Admission: ${allocatingRequest.visit_no} — ${erRequestPatientLabel(allocatingRequest)}`
                  : undefined
              }
            >
              {allocatingRequest && (
                <>
                  {requestedCareType && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background:
                          requestedCareType.type === "ICU"
                            ? "#f5f3ff"
                            : "#f0f9ff",
                        border:
                          requestedCareType.type === "ICU"
                            ? "1px solid #ddd6fe"
                            : "1px solid #bae6fd",
                        borderRadius: "8px",
                        padding: "0.65rem 0.85rem",
                        marginBottom: "0.85rem",
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            color: "#64748b",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Specialty / Care Level:
                        </span>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: "0.95rem",
                            color:
                              requestedCareType.type === "ICU"
                                ? "#5b21b6"
                                : "#0369a1",
                            marginTop: "0.1rem",
                          }}
                        >
                          {requestedCareType.label}
                          {allocatingRequest.requested_specialty && (
                            <span
                              style={{
                                fontSize: "0.82rem",
                                fontWeight: 500,
                                color: "#64748b",
                                marginLeft: "0.4rem",
                              }}
                            >
                              ({allocatingRequest.requested_specialty})
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        <button
                          type="button"
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.35rem 0.65rem",
                            borderRadius: "6px",
                            border: filterMatchingOnly
                              ? "1px solid #7c3aed"
                              : "1px solid #cbd5e1",
                            background: filterMatchingOnly ? "#7c3aed" : "#fff",
                            color: filterMatchingOnly ? "#fff" : "#475569",
                            cursor: "pointer",
                          }}
                          onClick={() => setFilterMatchingOnly(true)}
                        >
                          {requestedCareType.type} Beds Only
                        </button>
                        <button
                          type="button"
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            padding: "0.35rem 0.65rem",
                            borderRadius: "6px",
                            border: !filterMatchingOnly
                              ? "1px solid #0284c7"
                              : "1px solid #cbd5e1",
                            background: !filterMatchingOnly
                              ? "#0284c7"
                              : "#fff",
                            color: !filterMatchingOnly ? "#fff" : "#475569",
                            cursor: "pointer",
                          }}
                          onClick={() => setFilterMatchingOnly(false)}
                        >
                          All Available Beds
                        </button>
                      </div>
                    </div>
                  )}

                  <div
                    className="ai-search-bar"
                    style={{ marginBottom: "0.75rem" }}
                  >
                    <FiSearch className="ai-search-icon" aria-hidden />
                    <Input
                      className="ai-search-input"
                      placeholder="Filter by room or bed number (e.g. ICU-1, Bed 3)"
                      value={allocateFilter}
                      onChange={(e) => setAllocateFilter(e.target.value)}
                    />
                  </div>

                  {availableBedsForAllocation.length === 0 ? (
                    <div
                      style={{
                        padding: "1.25rem",
                        textAlign: "center",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        border: "1px dashed #cbd5e1",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          color: "#64748b",
                          fontSize: "0.9rem",
                        }}
                      >
                        No available{" "}
                        {filterMatchingOnly && requestedCareType
                          ? requestedCareType.label
                          : ""}{" "}
                        beds match this criteria.
                      </p>
                      {filterMatchingOnly && (
                        <button
                          type="button"
                          style={{
                            marginTop: "0.5rem",
                            fontSize: "0.8rem",
                            color: "#2563eb",
                            background: "none",
                            border: "none",
                            textDecoration: "underline",
                            cursor: "pointer",
                          }}
                          onClick={() => setFilterMatchingOnly(false)}
                        >
                          View all other available hospital beds
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: "0.6rem",
                        maxHeight: "280px",
                        overflowY: "auto",
                        padding: "0.2rem",
                      }}
                    >
                      {availableBedsForAllocation.map((bed) => {
                        const isSelected = allocateBedId === bed.id
                        const isBestMatch = bedMatchesSpecialtyWard(bed)
                        return (
                          <button
                            key={bed.id}
                            type="button"
                            style={{
                              textAlign: "left",
                              padding: "0.65rem 0.85rem",
                              borderRadius: "8px",
                              border: isSelected
                                ? "2px solid #2563eb"
                                : "1px solid #e2e8f0",
                              background: isSelected ? "#eff6ff" : "#ffffff",
                              boxShadow: isSelected
                                ? "0 2px 6px rgba(37,99,235,0.15)"
                                : "none",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: "0.3rem",
                              transition: "all 0.15s ease-in-out",
                            }}
                            onClick={() => setAllocateBedId(bed.id)}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize: "0.92rem",
                                  color: isSelected ? "#1e40af" : "#0f172a",
                                }}
                              >
                                Bed {bed.bed_no}
                              </strong>
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "0.15rem 0.45rem",
                                  borderRadius: "4px",
                                  ...bedTypeStyle(bed.bed_type),
                                }}
                              >
                                {bed.bed_type}
                              </span>
                            </div>
                            <div
                              style={{ fontSize: "0.78rem", color: "#64748b" }}
                            >
                              {bed.ward} &middot; Room {bed.room_no}
                            </div>
                            {isBestMatch && (
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  color: "#15803d",
                                }}
                              >
                                ✓ Best match for{" "}
                                {allocatingRequest.requested_specialty}
                              </span>
                            )}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: "0.2rem",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.76rem",
                                  fontWeight: 600,
                                  color: "#059669",
                                }}
                              >
                                {formatINR(
                                  bed.daily_rate ??
                                    BED_TYPE_DEFAULT_DAILY_RATE[bed.bed_type] ??
                                    1500,
                                )}
                                /day
                              </span>
                              {isSelected && (
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 700,
                                    color: "#2563eb",
                                  }}
                                >
                                  ✔ Selected
                                </span>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <Label style={{ marginTop: "0.85rem" }}>
                    Admission Notes (optional)
                    <Textarea
                      rows={2}
                      value={allocateNotes}
                      onChange={(e) => setAllocateNotes(e.target.value)}
                      placeholder="Admission reason, attending consultant, or handover details..."
                    />
                  </Label>
                  <div
                    className="ui-modal-actions"
                    style={{ marginTop: "1rem" }}
                  >
                    <Button
                      variant="ghost"
                      onClick={closeAllocateModal}
                      disabled={allocating}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAllocateErBed}
                      disabled={!allocateBedId || allocating}
                    >
                      {allocating ? "Allocating..." : "Confirm & Allocate Bed"}
                    </Button>
                  </div>
                </>
              )}
            </Modal>

            {lamaRequest && (
              <BedRequestLamaModal
                request={lamaRequest}
                onClose={() => setLamaRequest(null)}
                onSaved={async () => {
                  setLamaRequest(null)
                  await Promise.all([loadBeds(), loadErRequests()])
                }}
                setNotice={setNotice}
              />
            )}
          </>
        </div>
      )}
    </section>
  )
}

function BedRequestLamaModal({
  request,
  onClose,
  onSaved,
  setNotice,
}: {
  request: ErBedRequest
  onClose: () => void
  onSaved: () => void
  setNotice: (notice: Notice | null) => void
}) {
  const patientLabel = erRequestPatientLabel(request)
  const [refusalReason, setRefusalReason] = useState(
    "Going to another hospital / facility of choice",
  )
  const [signedBy, setSignedBy] = useState(patientLabel)
  const [relation, setRelation] = useState("Self (Patient)")
  const [phone, setPhone] = useState("")
  const [witnessDoctor, setWitnessDoctor] = useState("Dr. G. Suryanarayana")
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!signedBy.trim()) {
      setNotice({ type: "error", message: "Signer name is required." })
      return
    }
    if (phone && phone.replace(/\D/g, "").length < 7) {
      setNotice({
        type: "error",
        message: "Enter a valid mobile number.",
      })
      return
    }
    if (!witnessDoctor.trim()) {
      setNotice({ type: "error", message: "Witness doctor is required." })
      return
    }
    if (!acknowledged) {
      setNotice({
        type: "error",
        message: "Please acknowledge the legal waiver.",
      })
      return
    }

    setSubmitting(true)
    try {
      await apiFetch(`/api/er/bed-requests/${request.id}/lama`, {
        method: "POST",
        body: JSON.stringify({
          signed_by: signedBy.trim(),
          relation_to_patient: relation,
          signed_by_phone: phone.replace(/\D/g, "") || undefined,
          witness_doctor: witnessDoctor.trim(),
          refusal_reason: refusalReason,
          legal_waiver_acknowledged: true,
        }),
      })
      setNotice({
        type: "warning",
        message:
          "LAMA Legal Waiver recorded. Bed request cancelled and patient discharged under LAMA.",
      })
      onSaved()
    } catch (error: any) {
      reportError(setNotice, error, "Failed to record LAMA refusal.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="⚠️ LAMA / Patient Refusal to Admit (Legal Waiver)"
      description={`ER Bed Request: ${request.visit_no} — ${patientLabel} (${request.requested_level_of_care.toUpperCase()})`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            padding: "0.85rem",
            color: "#7f1d1d",
            fontSize: "0.85rem",
            lineHeight: "1.5",
          }}
        >
          <strong
            style={{
              display: "block",
              color: "#991b1b",
              marginBottom: "0.3rem",
            }}
          >
            HOSPITAL LEGAL INDEMNITY &amp; LAMA WAIVER:
          </strong>
          The patient/family refuses the recommended inpatient/ICU bed admission
          against doctor advice. By executing this document, the
          patient/guardian assumes full clinical responsibility and absolves the
          hospital and doctors from all liability for any subsequent
          complications or fatality.
        </div>

        <div>
          <Label>Refusal Reason</Label>
          <select
            className="ui-input"
            value={refusalReason}
            onChange={(e) => setRefusalReason(e.target.value)}
          >
            <option value="Going to another hospital / facility of choice">
              Going to another hospital / facility of choice
            </option>
            <option value="Financial constraints / unaffordable treatment or bed charges">
              Financial constraints / unaffordable treatment or bed charges
            </option>
            <option value="Personal / family preference to manage and nurse at home">
              Personal / family preference to manage and nurse at home
            </option>
            <option value="Refusal of ICU admission / invasive mechanical ventilation">
              Refusal of ICU admission / invasive mechanical ventilation
            </option>
            <option value="Dissatisfaction with treatment / refusal of emergency procedure">
              Dissatisfaction with treatment / refusal of emergency procedure
            </option>
            <option value="Other clinical refusal">
              Other clinical refusal
            </option>
          </select>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <Label>Signer Name</Label>
            <Input
              value={signedBy}
              onChange={(e) => setSignedBy(e.target.value)}
              placeholder="Full name of signer"
            />
          </div>
          <div>
            <Label>Relationship</Label>
            <select
              className="ui-input"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
            >
              <option value="Self (Patient)">Self (Patient)</option>
              <option value="Father">Father</option>
              <option value="Mother">Mother</option>
              <option value="Spouse">Spouse</option>
              <option value="Son">Son</option>
              <option value="Daughter">Daughter</option>
              <option value="Guardian / Relative">Guardian / Relative</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <Label>Signer Phone Number</Label>
            <PhoneInput
              placeholder="98765 43210"
              value={phone}
              onChange={setPhone}
              size="sm"
            />
          </div>
          <div>
            <Label>Witness Doctor</Label>
            <Input
              value={witnessDoctor}
              onChange={(e) => setWitnessDoctor(e.target.value)}
              placeholder="Doctor name"
            />
          </div>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
            background: "#fff1f2",
            padding: "0.75rem",
            borderRadius: "6px",
            border: "1px solid #fda4af",
            cursor: "pointer",
            fontSize: "0.85rem",
            color: "#881337",
          }}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ marginTop: "0.2rem" }}
          />
          <span>
            <strong>I acknowledge the LAMA declaration</strong>, releasing the
            hospital and treating medical staff from all liability and
            cancelling this bed request.
          </span>
        </label>

        <div className="ui-modal-actions" style={{ marginTop: "0.5rem" }}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            style={{
              background: "#dc2626",
              color: "#fff",
              borderColor: "#b91c1c",
            }}
            onClick={handleSubmit}
            disabled={submitting || !acknowledged}
          >
            {submitting ? "Processing..." : "Sign LAMA & Cancel Bed Request"}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
