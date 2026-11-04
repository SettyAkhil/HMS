import { useEffect, useMemo, useState } from "react"
import { FiBell, FiClock, FiUsers } from "react-icons/fi"
import { Btn } from "./shared"
import { bedGenderVariant, bedOccupantName } from "./bed/BedCard"
import { WardBedBoard } from "./bed/WardBedBoard"
import { BedTransferNotificationPanel } from "./bed/BedTransferNotificationPanel"
import { WardAlertsNotificationPanel } from "./bed/WardAlertsNotificationPanel"
import IcuDepartment from "./IcuDepartment"
import { BedDatabase } from "../services/bedDb"
import { apiFetch } from "../lib/api"
import { formatDateTimeIST } from "../lib/format"

type BedStatus = "Available" | "Occupied" | "Maintenance"

type Bed = {
  id: number
  ward: string
  room_no: string
  bed_no: string
  bed_type: string
  status: BedStatus
  admission_date: string | null
  expected_discharge_date: string | null
  patient_id: string | null
  patient_name: string | null
  patient_last_name: string | null
  patient_phone: string | null
  patient_age: number | null
  patient_gender: string | null
  admission_id: number | null
  allocation_id: number | null
  allocated_at: string | null
}

type Summary = {
  total: number
  available: number
  occupied: number
  maintenance: number
}

type ErBedRequest = {
  id: number
  visit_no: string
  patient_id?: string | null
  er_visit_id?: number | null
  patient_name: string | null
  patient_last_name: string | null
  is_unknown_patient: boolean
  unknown_patient_label: string | null
  requested_level_of_care: string
  requested_specialty: string | null
  requested_at: string
}

type OtPacuReadyCase = {
  id: number
  case_no: string
  patient_id: string
  or_room: string | null
  procedure_name: string
  surgeon: string | null
  discharge_status: string
  updated_at: string
}

function erRequestPatientLabel(req: ErBedRequest): string {
  if (req.is_unknown_patient)
    return req.unknown_patient_label || "Unknown patient"
  const name = `${req.patient_name || ""} ${req.patient_last_name || ""}`.trim()
  return name || "Patient"
}

function isOverdue(bed: Bed): boolean {
  if (bed.status !== "Occupied" || !bed.expected_discharge_date) return false
  return Date.now() > new Date(bed.expected_discharge_date).getTime()
}

function overdueDays(bed: Bed): number {
  if (!bed.expected_discharge_date) return 0
  return Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(bed.expected_discharge_date).getTime()) / 86400000,
    ),
  )
}

// A room where an occupied male bed and an occupied female bed sit together
// is a real ward-compliance concern (most hospitals segregate rooms by
// gender) -- this reuses the same gender read as the bed card's color, so
// the alert and the color coding can never disagree with each other.
function findMixedGenderRooms(
  beds: Bed[],
): { ward: string ;room_no: string ;beds: Bed[] }[] {
  const rooms = new Map<string, Bed[]>()
  for (const bed of beds) {
    if (bed.status !== "Occupied") continue
    const key = `${bed.ward}||${bed.room_no}`
    if (!rooms.has(key)) rooms.set(key, [])
    rooms.get(key)!.push(bed)
  }
  const flagged: { ward: string ;room_no: string ;beds: Bed[] }[] = []
  for (const [key, roomBeds] of rooms) {
    const genders = new Set(
      roomBeds.map((b) => bedGenderVariant(b)).filter((g) => g !== "other"),
    )
    if (genders.size > 1) {
      const [ward, room_no] = key.split("||")
      flagged.push({ ward, room_no, beds: roomBeds })
    }
  }
  return flagged
}

// A patient is "in ICU" if their bed's ward name contains ICU -- covers the
// umbrella "ICU" ward plus its SICU/IICU rooms, since ward is free text the
// hospital names however it likes (see Bed Management's ward field).
function isIcuBed(bed: Bed): boolean {
  return bed.ward.toUpperCase().includes("ICU")
}

// Keyed on allocation_id, not admission_id -- a transfer INTO an ICU bed is
// its own new bed_allocations row (allocation_id changes) even though the
// underlying hospital admission_date doesn't, and a transfer is exactly the
// kind of event ICU staff need notified about, same as a fresh admission.
function icuAdmissionKey(bed: Bed): string {
  return `${bed.id}:${bed.allocation_id ?? bed.admission_id ?? bed.admission_date ?? ""}`
}

const ICU_ACK_STORAGE_KEY = "hms_icu_admission_acks"

function loadAckedIcuAdmissions(): Set<string> {
  try {
    const raw = window.localStorage.getItem(ICU_ACK_STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveAckedIcuAdmissions(keys: Set<string>) {
  try {
    // Cap stored history so this can't grow unbounded over months of use.
    window.localStorage.setItem(
      ICU_ACK_STORAGE_KEY,
      JSON.stringify(Array.from(keys).slice(-500)),
    )
  } catch {
    // Best-effort -- a private/blocked storage context just means the same
    // alert may resurface next visit, not a functional failure.
  }
}

function wardOccupancyLevel(
  occupied: number,
  total: number,
): "low" | "high" | "critical" {
  if (total === 0) return "low"
  const pct = (occupied / total) * 100
  if (pct >= 90) return "critical"
  if (pct >= 70) return "high"
  return "low"
}

type Props = {
  navigate?: (page: string, sub?: string) => void
  onOpenPatientClinical?: (patientId: string) => void
  permissions?: string[]
  initialWard?: string
}

export default function Inpatient({
  navigate,
  onOpenPatientClinical,
  permissions,
  initialWard,
}: Props) {
  const [beds, setBeds] = useState<Bed[]>([])
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
  })
  const [pendingRequests, setPendingRequests] = useState<ErBedRequest[]>([])
  const [pendingOtTransfers, setPendingOtTransfers] = useState<OtPacuReadyCase[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedWard, setSelectedWard] = useState<string | null>(initialWard || null)

  useEffect(() => {
    if (initialWard) {
      setSelectedWard(initialWard)
    }
  }, [initialWard])

  useEffect(() => {
    let cancelled = false
    const load = async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true)
      try {
        const [bedsRes, requestsRes, otRes] = await Promise.all([
          apiFetch<{ beds: Bed[] ;summary: Summary }>("/api/beds"),
          apiFetch<{ bed_requests: ErBedRequest[] }>(
            "/api/er/bed-requests?status=pending",
          ).catch(() => ({
            bed_requests: [] as ErBedRequest[],
          })),
          apiFetch<{ cases: OtPacuReadyCase[] }>(
            "/api/ot/cases/pacu-ready",
          ).catch(() => ({ cases: [] as OtPacuReadyCase[] })),
        ])
        if (cancelled) return
        setBeds(bedsRes.beds || [])
        setSummary(
          bedsRes.summary || {
            total: 0,
            available: 0,
            occupied: 0,
            maintenance: 0,
          },
        )
        setPendingRequests(requestsRes.bed_requests || [])
        setPendingOtTransfers(otRes.cases || [])
      } catch {
        if (!cancelled) setBeds([])
      } finally {
        if (!cancelled && showSpinner) setLoading(false)
      }
    }
    load(true)
    // Live-polled rather than one-shot -- a ward nurse should see a new ER bed
    // request or a PACU-cleared surgical case without a manual page reload.
    const interval = setInterval(() => load(false), 20000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const groupedByWard = useMemo(() => {
    const wards = new Map<string, Map<string, Bed[]>>()
    for (const bed of beds) {
      const ward = bed.ward || "Unassigned Ward"
      if (!wards.has(ward)) wards.set(ward, new Map())
      const rooms = wards.get(ward)!
      if (!rooms.has(bed.room_no)) rooms.set(bed.room_no, [])
      rooms.get(bed.room_no)!.push(bed)
    }
    return wards
  }, [beds])

  const wardNames = useMemo(
    () => Array.from(groupedByWard.keys()).sort(),
    [groupedByWard],
  )
  const activeWard =
    selectedWard
      ? (groupedByWard.has(selectedWard)
          ? selectedWard
          : wardNames.find((w) => w.toLowerCase().includes(selectedWard.toLowerCase())) || wardNames[0] || null)
      : wardNames[0] || null
  const activeRooms = activeWard
    ? groupedByWard.get(activeWard)!
    : new Map<string, Bed[]>()

  const overdueBeds = useMemo(() => beds.filter(isOverdue), [beds])
  const mixedGenderRooms = useMemo(() => findMixedGenderRooms(beds), [beds])
  const hasAlerts = overdueBeds.length > 0 || mixedGenderRooms.length > 0

  const [ackedIcuAdmissions, setAckedIcuAdmissions] = useState<Set<string>>(
    new Set(),
  )
  useEffect(() => {
    setAckedIcuAdmissions(loadAckedIcuAdmissions())
  }, [])
  const icuAdmissionAlerts = useMemo(
    () =>
      beds.filter(
        (b) =>
          b.status === "Occupied" &&
          isIcuBed(b) &&
          (b.allocated_at || b.admission_date) &&
          !ackedIcuAdmissions.has(icuAdmissionKey(b)),
      ),
    [beds, ackedIcuAdmissions],
  )
  const acknowledgeIcuAdmission = (bed: Bed) => {
    const next = new Set(ackedIcuAdmissions)
    next.add(icuAdmissionKey(bed))
    setAckedIcuAdmissions(next)
    saveAckedIcuAdmissions(next)
  }

  const goToBedManagement = () => navigate?.("beds")
  const openWard = (ward: string) => {
    setSelectedWard(ward)
    document
      .getElementById("ward-room-board")
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const boardStats = [
    { label: "Total beds", value: summary.total, tone: "#0F172A" },
    { label: "Occupied", value: summary.occupied, tone: "#1B4FD8" },
    { label: "Available", value: summary.available, tone: "#16A34A" },
    { label: "Maintenance", value: summary.maintenance, tone: "#D97706" },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      {/* Masthead -- title, the four counts and the colour legend are one
          block rather than two stacked white bands, and everything below
          shares its px-6 gutter so nothing steps in or out by a few pixels. */}
      <div className="bg-white border-b border-[#DDE2EC]">
        <div className="px-6 pt-4 pb-3 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-gray-900 leading-tight">
              Inpatient Bed Board
            </h1>
            <p className="text-[11.5px] text-[#64748B] mt-0.5">
              Hospital-wide occupancy &amp; alerts &middot; read-only &mdash;
              use Bed Management to allocate, transfer, or discharge
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <WardAlertsNotificationPanel
              beds={beds}
              onSelectWard={openWard}
              onViewPatientChart={onOpenPatientClinical}
              onOpenBedManagement={goToBedManagement}
            />
            <BedTransferNotificationPanel
              onAllocateTransfer={(notif) => {
                BedDatabase.setPendingAllocation({
                  patient_id: notif.patient_id,
                  name: notif.patient_name,
                  last_name: notif.patient_last_name || undefined,
                  phone: notif.patient_phone || undefined,
                  age: notif.patient_age || undefined,
                  gender: notif.patient_gender || undefined,
                  source: "ER",
                  visit_no: notif.er_visit_id ? `ER-${notif.er_visit_id}` : `TR-${notif.patient_id}`,
                  er_bed_request_id: notif.er_bed_request_id,
                  er_visit_id: notif.er_visit_id,
                  notification_id: notif.id,
                  requested_level_of_care: notif.target_bed_type === "ICU" ? "ICU" : notif.target_destination,
                  requested_specialty: notif.target_ward || notif.target_destination,
                  clinical_notes: `Transferred from ${notif.source_department}. Reason: ${notif.clinical_reason}`,
                  priority: notif.priority,
                  timestamp: notif.sent_at,
                })
                goToBedManagement()
              }}
              onViewPatientChart={onOpenPatientClinical}
              canManageBeds={!permissions || permissions.includes("beds")}
            />
            <Btn variant="primary" size="sm" onClick={goToBedManagement}>
              Open Bed Management →
            </Btn>
          </div>
        </div>        <div className="px-6 pb-3 flex items-end justify-between gap-3 sm:gap-6 flex-wrap">
          {/* gap-px over a border-coloured fill draws the dividers, so the
            strip reads the same as one row of four or a 2x2 on a phone. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#E2E8F0] border border-[#E2E8F0] rounded-none overflow-hidden w-full sm:w-auto">
            {boardStats.map((stat) => (
              <div key={stat.label} className="px-4 py-2 sm:min-w-[104px] bg-white">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  {stat.label}
                </div>
                <div
                  className="font-mono text-xl font-bold leading-tight mt-0.5"
                  style={{ color: stat.tone }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap pb-1">
            <span className="bed-legend-item">
              <span className="bed-legend-swatch bed-legend-swatch-available" />{" "}
              Available
            </span>
            <span className="bed-legend-item">
              <span className="bed-legend-swatch bed-legend-swatch-male" /> Male
            </span>
            <span className="bed-legend-item">
              <span className="bed-legend-swatch bed-legend-swatch-female" />{" "}
              Female
            </span>
            <span className="bed-legend-item">
              <span className="bed-legend-swatch bed-legend-swatch-maintenance" />{" "}
              Maintenance
            </span>
            <span className="bed-legend-item">
              <span className="bed-legend-swatch bed-legend-swatch-icu" /> ICU
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {loading ? (
          <p className="text-[12.5px] text-[#64748B]">Loading bed board...</p>
        ) : wardNames.length === 0 ? (
          <div className="bg-white border border-[#DDE2EC] rounded-none p-8 text-center">
            <p className="text-[13px] font-semibold text-gray-800">
              No beds set up yet
            </p>
            <p className="text-[12px] text-[#64748B] mt-1">
              Add wards and beds from Bed Management to populate this board.
            </p>
            <Btn
              variant="primary"
              size="sm"
              className="mt-3"
              onClick={goToBedManagement}
            >
              Go to Bed Management
            </Btn>
          </div>
        ) : (
          <>
            {/* Ward occupancy -- auto-fit tracks, so three wards fill the row
                instead of clustering at the left of a fixed 6-column grid. */}
            <section className="bg-white border border-[#DDE2EC] rounded-none p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Ward occupancy
                </h2>
                <span className="text-[11px] text-[#94A3B8]">
                  Click a ward to open its beds below
                </span>
              </div>
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(212px, 1fr))",
                }}
              >
                {wardNames.map((ward) => {
                  const wardBeds = Array.from(
                    groupedByWard.get(ward)!.values(),
                  ).flat()
                  const occupied = wardBeds.filter(
                    (b) => b.status === "Occupied",
                  ).length
                  const total = wardBeds.length
                  const pct = total ? Math.round((occupied / total) * 100) : 0
                  const level = wardOccupancyLevel(occupied, total)
                  const levelStyle =
                    level === "critical"
                      ? {
                          bg: "#FEF2F2",
                          border: "#FCA5A5",
                          text: "#B91C1C",
                          bar: "#DC2626",
                        }
                      : level === "high"
                        ? {
                            bg: "#FFFBEB",
                            border: "#FDE68A",
                            text: "#B45309",
                            bar: "#D97706",
                          }
                        : {
                            bg: "#F0FDF4",
                            border: "#BBF7D0",
                            text: "#15803D",
                            bar: "#16A34A",
                          }
                  const isActive = ward === activeWard
                  return (
                    <button
                      key={ward}
                      onClick={() => openWard(ward)}
                      className={`text-left rounded-none p-3 border transition-all hover:-translate-y-0.5 hover:shadow-sm${
                        isActive ? " ring-2 ring-[#1B4FD8] ring-offset-1" : ""
                      }`}
                      style={{
                        backgroundColor: levelStyle.bg,
                        borderColor: levelStyle.border,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-semibold text-gray-800 truncate">
                          {ward}
                        </span>
                        <span className="text-[10.5px] font-mono text-[#64748B] shrink-0">
                          {occupied}/{total}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-1 mt-1.5">
                        <span
                          className="text-xl font-mono font-bold leading-none"
                          style={{ color: levelStyle.text }}
                        >
                          {pct}%
                        </span>
                        <span className="text-[10.5px] text-[#64748B]">
                          occupied
                        </span>
                      </div>
                      <div className="h-1.5 rounded-none bg-white/70 mt-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-none transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: levelStyle.bar,
                          }}
                        />
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Ward board -- pick a ward, then a room within it */}
            <section
              className="bg-white border border-[#DDE2EC] rounded-none"
              id="ward-room-board"
            >
              <div className="px-4 py-3 border-b border-[#DDE2EC] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Ward
                  </span>
                  <select
                    className="ui-input bed-ward-select"
                    aria-label="Select ward"
                    value={activeWard || ""}
                    onChange={(e) => setSelectedWard(e.target.value)}
                  >
                    {wardNames.map((ward) => (
                      <option key={ward} value={ward}>
                        {ward}
                      </option>
                    ))}
                  </select>
                </div>
                {activeWard && (
                  <div className="flex items-center gap-4 text-[11.5px]">
                    <span className="flex items-center gap-1.5 text-[#64748B]">
                      <span className="w-2 h-2 rounded-none bg-[#1B4FD8]" />
                      <span className="font-mono font-bold text-gray-800">
                        {
                          Array.from(activeRooms.values())
                            .flat()
                            .filter((b) => b.status === "Occupied").length
                        }
                      </span>
                      occupied
                    </span>
                    <span className="flex items-center gap-1.5 text-[#64748B]">
                      <span className="w-2 h-2 rounded-none bg-[#16A34A]" />
                      <span className="font-mono font-bold text-gray-800">
                        {
                          Array.from(activeRooms.values())
                            .flat()
                            .filter((b) => b.status === "Available").length
                        }
                      </span>
                      available
                    </span>
                  </div>
                )}
              </div>
              <div className="p-4">
                {activeWard === "ICU" ? (
                  <IcuDepartment
                    embedded
                    navigate={navigate}
                    onOpenPatientClinical={onOpenPatientClinical}
                    permissions={permissions}
                  />
                ) : (
                  <WardBedBoard
                    rooms={activeRooms}
                    readOnly={false}
                    onBedClick={(bed) => {
                      sessionStorage.setItem("hospai_target_bed_id", String(bed.id))
                      goToBedManagement()
                    }}
                    onPatientClick={
                      onOpenPatientClinical
                        ? (bed) =>
                            bed.patient_id &&
                            onOpenPatientClinical(bed.patient_id)
                        : (bed) => goToBedManagement()
                    }
                  />
                )}
              </div>
            </section>
          </>
        )}

        {/* Pending Bed Assignments -- real ER bed requests awaiting allocation */}
        <section className="bg-white border border-[#DDE2EC] rounded-none overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Pending bed assignments
            </span>
            <span className="bg-[#FEF3C7] text-[#B45309] text-[11px] font-semibold px-2 py-0.5 rounded-none font-mono">
              {pendingRequests.length} awaiting
            </span>
          </div>
          {pendingRequests.length === 0 ? (
            <p className="text-[12px] text-[#94A3B8] px-4 py-4">
              No ER visits are currently awaiting a bed.
            </p>
          ) : (
            <ul className="divide-y divide-[#F1F5F9]">
              {pendingRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-gray-800 truncate">
                      {erRequestPatientLabel(req)}
                    </div>
                    <div className="text-[11px] text-[#64748B] truncate">
                      {req.visit_no} &middot;{" "}
                      {req.requested_level_of_care.toUpperCase()}
                      {req.requested_specialty
                        ? ` · ${req.requested_specialty}`
                        : ""}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-[#94A3B8]">
                    {formatDateTimeIST(req.requested_at)}
                  </span>
                  <Btn
                    variant="primary"
                    size="xs"
                    onClick={() => {
                      BedDatabase.setPendingAllocation({
                        patient_id:
                          req.patient_id ||
                          `P-ER-${req.er_visit_id || req.id}`,
                        name: req.patient_name || "Emergency Patient",
                        last_name: req.patient_last_name || undefined,
                        source: "ER",
                        visit_no: req.visit_no,
                        er_bed_request_id: req.id,
                        er_visit_id: req.er_visit_id || undefined,
                        requested_level_of_care: req.requested_level_of_care,
                        requested_specialty:
                          req.requested_specialty || undefined,
                        clinical_notes: `ER Admission Request (${req.visit_no}) for ${req.requested_level_of_care}`,
                        timestamp: req.requested_at,
                      })
                      goToBedManagement()
                    }}
                  >
                    Assign Bed
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending OT transfers -- cases cleared out of PACU awaiting a ward bed */}
        <section className="bg-white border border-[#DDE2EC] rounded-md overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
              Cleared from PACU
            </span>
            <span className="bg-[#DBEAFE] text-[#1D4ED8] text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {pendingOtTransfers.length} awaiting
            </span>
          </div>
          {pendingOtTransfers.length === 0 ? (
            <p className="text-[12px] text-[#94A3B8] px-4 py-4">
              No surgical cases are currently awaiting a ward bed.
            </p>
          ) : (
            <ul className="divide-y divide-[#F1F5F9]">
              {pendingOtTransfers.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-gray-800 truncate">
                      {c.procedure_name}
                    </div>
                    <div className="text-[11px] text-[#64748B] truncate">
                      {c.case_no} &middot; {c.patient_id}
                      {c.surgeon ? ` · ${c.surgeon}` : ""} · {c.discharge_status}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-[10.5px] text-[#94A3B8]">
                    {formatDateTimeIST(c.updated_at)}
                  </span>
                  <Btn variant="primary" size="xs" onClick={goToBedManagement}>
                    Assign Bed
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
