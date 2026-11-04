import React, { useState, useEffect, useRef, useMemo } from "react"
import {
  FiAlertTriangle,
  FiBell,
  FiCheckCircle,
  FiClock,
  FiUsers,
  FiX,
  FiCheck,
  FiChevronRight,
  FiShield,
} from "react-icons/fi"
import { BedCardData } from "./BedCard"
import { formatDateTimeIST } from "../../lib/format"

export type Bed = BedCardData & {
  ward: string
  admission_id?: number | string | null
  allocation_id?: number | null
  allocated_at?: string | null
  expected_discharge_date?: string | null
  current_patient_name?: string | null
  occupied_by?: string | null
}

interface WardAlertsNotificationPanelProps {
  beds: Bed[]
  onSelectWard?: (ward: string) => void
  onViewPatientChart?: (patientId: string) => void
  onOpenBedManagement?: () => void
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

function bedGenderVariant(bed: Bed): "male" | "female" | "other" {
  const g = (bed.patient_gender || "").toLowerCase()
  if (g.startsWith("m")) return "male"
  if (g.startsWith("f")) return "female"
  return "other"
}

function findMixedGenderRooms(
  beds: Bed[],
): { ward: string; room_no: string; beds: Bed[] }[] {
  const rooms = new Map<string, Bed[]>()
  for (const bed of beds) {
    if (bed.status !== "Occupied") continue
    const key = `${bed.ward}||${bed.room_no}`
    if (!rooms.has(key)) rooms.set(key, [])
    rooms.get(key)!.push(bed)
  }
  const flagged: { ward: string; room_no: string; beds: Bed[] }[] = []
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

function isIcuBed(bed: Bed): boolean {
  return bed.ward.toUpperCase().includes("ICU")
}

function icuAdmissionKey(bed: Bed): string {
  return `${bed.id}:${bed.allocation_id ?? bed.admission_id ?? bed.admission_date ?? ""}`
}

function bedOccupantName(bed: Bed): string {
  return (
    bed.patient_name ||
    bed.current_patient_name ||
    bed.occupied_by ||
    "Admitted Patient"
  )
}

const ICU_ACK_STORAGE_KEY = "hms_icu_admission_acks"
const OVERDUE_ACK_STORAGE_KEY = "hms_overdue_stay_acks"
const MIXED_ACK_STORAGE_KEY = "hms_mixed_gender_acks"

function loadAckSet(storageKey: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveAckSet(storageKey: string, keys: Set<string>) {
  try {
    const arr = Array.from(keys).slice(-300)
    window.localStorage.setItem(storageKey, JSON.stringify(arr))
  } catch {}
}

export function WardAlertsNotificationPanel({
  beds,
  onSelectWard,
  onViewPatientChart,
  onOpenBedManagement,
}: WardAlertsNotificationPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "icu" | "overdue" | "mixed">("all")
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [ackedIcu, setAckedIcu] = useState<Set<string>>(() => loadAckSet(ICU_ACK_STORAGE_KEY))
  const [ackedOverdue, setAckedOverdue] = useState<Set<string>>(() => loadAckSet(OVERDUE_ACK_STORAGE_KEY))
  const [ackedMixed, setAckedMixed] = useState<Set<string>>(() => loadAckSet(MIXED_ACK_STORAGE_KEY))

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // ICU Admission Alerts
  const icuAdmissionAlerts = useMemo(
    () =>
      beds.filter(
        (b) =>
          b.status === "Occupied" &&
          isIcuBed(b) &&
          (b.allocated_at || b.admission_date) &&
          !ackedIcu.has(icuAdmissionKey(b)),
      ),
    [beds, ackedIcu],
  )

  // Overdue Stay Alerts
  const overdueBeds = useMemo(
    () => beds.filter((b) => isOverdue(b) && !ackedOverdue.has(String(b.id))),
    [beds, ackedOverdue],
  )

  // Mixed Gender Room Alerts
  const mixedGenderRooms = useMemo(
    () =>
      findMixedGenderRooms(beds).filter(
        (r) => !ackedMixed.has(`${r.ward}||${r.room_no}`),
      ),
    [beds, ackedMixed],
  )

  const totalAlertsCount =
    icuAdmissionAlerts.length + overdueBeds.length + mixedGenderRooms.length

  // Acknowledge Actions
  const acknowledgeIcu = (bed: Bed) => {
    const next = new Set(ackedIcu).add(icuAdmissionKey(bed))
    setAckedIcu(next)
    saveAckSet(ICU_ACK_STORAGE_KEY, next)
  }

  const acknowledgeOverdue = (bedId: string) => {
    const next = new Set(ackedOverdue).add(bedId)
    setAckedOverdue(next)
    saveAckSet(OVERDUE_ACK_STORAGE_KEY, next)
  }

  const acknowledgeMixed = (ward: string, roomNo: string) => {
    const next = new Set(ackedMixed).add(`${ward}||${roomNo}`)
    setAckedMixed(next)
    saveAckSet(MIXED_ACK_STORAGE_KEY, next)
  }

  const acknowledgeAll = () => {
    const nextIcu = new Set(ackedIcu)
    icuAdmissionAlerts.forEach((b) => nextIcu.add(icuAdmissionKey(b)))
    setAckedIcu(nextIcu)
    saveAckSet(ICU_ACK_STORAGE_KEY, nextIcu)

    const nextOverdue = new Set(ackedOverdue)
    overdueBeds.forEach((b) => nextOverdue.add(String(b.id)))
    setAckedOverdue(nextOverdue)
    saveAckSet(OVERDUE_ACK_STORAGE_KEY, nextOverdue)

    const nextMixed = new Set(ackedMixed)
    mixedGenderRooms.forEach((r) => nextMixed.add(`${r.ward}||${r.room_no}`))
    setAckedMixed(nextMixed)
    saveAckSet(MIXED_ACK_STORAGE_KEY, nextMixed)
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* ── Ward Alerts Button ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-none border text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-2xs ${
          totalAlertsCount > 0
            ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B] hover:bg-[#FEE2E2]"
            : "bg-white border-[#CBD5E1] text-slate-700 hover:bg-[#F8FAFC]"
        }`}
        title={`${totalAlertsCount} Active Ward Alerts`}
      >
        <div className="relative flex items-center justify-center">
          <FiBell
            className={
              totalAlertsCount > 0
                ? "text-[#B91C1C] animate-bounce text-sm font-bold"
                : "text-slate-500 text-sm"
            }
          />
          {totalAlertsCount > 0 && (
            <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-none bg-red-600 animate-ping" />
          )}
        </div>

        <span>Ward Alerts</span>

        <span
          className={`font-mono text-[11px] px-1.5 py-0.2 rounded-none font-extrabold ${
            totalAlertsCount > 0
              ? "bg-[#991B1B] text-white"
              : "bg-slate-200 text-slate-700"
          }`}
        >
          {totalAlertsCount}
        </span>
      </button>

      {/* ── Dropdown Flyout Panel ─────────────────────────────────────────── */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-none shadow-2xl border-2 border-slate-300 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Panel Header */}
          <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-none bg-red-500/20 text-red-400 flex items-center justify-center">
                <FiBell className="text-sm animate-bounce" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Ward Alerts &amp; Notifications
                </h3>
                <p className="text-[10.5px] text-slate-400">
                  {totalAlertsCount > 0
                    ? `${totalAlertsCount} active notification${totalAlertsCount > 1 ? "s" : ""} require attention`
                    : "All ward alerts acknowledged"}
                </p>
              </div>
            </div>

            {totalAlertsCount > 0 && (
              <button
                type="button"
                onClick={acknowledgeAll}
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white text-[10.5px] font-semibold rounded transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Category Tabs */}
          {totalAlertsCount > 0 && (
            <div className="flex border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer ${
                  activeTab === "all"
                    ? "border-red-600 text-red-700 font-bold bg-white"
                    : "border-transparent hover:text-slate-900"
                }`}
              >
                All ({totalAlertsCount})
              </button>
              {icuAdmissionAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("icu")}
                  className={`flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer ${
                    activeTab === "icu"
                      ? "border-red-600 text-red-700 font-bold bg-white"
                      : "border-transparent hover:text-slate-900"
                  }`}
                >
                  ICU ({icuAdmissionAlerts.length})
                </button>
              )}
              {overdueBeds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("overdue")}
                  className={`flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer ${
                    activeTab === "overdue"
                      ? "border-red-600 text-red-700 font-bold bg-white"
                      : "border-transparent hover:text-slate-900"
                  }`}
                >
                  Overdue ({overdueBeds.length})
                </button>
              )}
              {mixedGenderRooms.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("mixed")}
                  className={`flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer ${
                    activeTab === "mixed"
                      ? "border-amber-600 text-amber-700 font-bold bg-white"
                      : "border-transparent hover:text-slate-900"
                  }`}
                >
                  Mixed ({mixedGenderRooms.length})
                </button>
              )}
            </div>
          )}

          {/* Alert Content List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 p-1">
            {totalAlertsCount === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-lg">
                  <FiCheckCircle />
                </div>
                <h4 className="text-xs font-bold text-slate-800">
                  No Active Ward Alerts
                </h4>
                <p className="text-[11px] text-slate-500 max-w-[240px] mx-auto leading-relaxed">
                  All ICU admissions, extended stays, and ward compliance alerts are acknowledged.
                </p>
              </div>
            ) : (
              <>
                {/* 1. ICU Admission Alerts */}
                {(activeTab === "all" || activeTab === "icu") &&
                  icuAdmissionAlerts.map((bed) => (
                    <div
                      key={`icu-${icuAdmissionKey(bed)}`}
                      className="p-3 hover:bg-red-50/50 transition-colors rounded-lg flex items-start gap-2.5 group"
                    >
                      <div className="w-6 h-6 rounded bg-red-100 text-red-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                        🚨
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-bold text-slate-900 truncate">
                            {bedOccupantName(bed)}
                          </span>
                          <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                            ICU Admission
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                          {bed.ward} &middot; Room {bed.room_no} &middot; Bed {bed.bed_no}
                          {bed.patient_age ? ` · ${bed.patient_age}y` : ""}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Allocated {formatDateTimeIST(bed.allocated_at || bed.admission_date!)}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            acknowledgeIcu(bed)
                            if (onSelectWard) onSelectWard(bed.ward)
                          }}
                          className="px-2 py-1 bg-white border border-red-300 hover:bg-red-600 hover:text-white text-red-700 text-[10.5px] font-bold rounded shadow-2xs transition-colors cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  ))}

                {/* 2. Extended Stay Overdue Alerts */}
                {(activeTab === "all" || activeTab === "overdue") &&
                  overdueBeds.map((bed) => (
                    <div
                      key={`overdue-${bed.id}`}
                      className="p-3 hover:bg-amber-50/50 transition-colors rounded-lg flex items-start gap-2.5"
                    >
                      <div className="w-6 h-6 rounded bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 text-xs">
                        <FiClock />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-bold text-slate-900 truncate">
                            {bedOccupantName(bed)}
                          </span>
                          <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                            {overdueDays(bed)}d Overdue
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                          Extended stay &middot; {bed.ward} &middot; Room {bed.room_no} &middot; Bed {bed.bed_no}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          acknowledgeOverdue(String(bed.id))
                          if (onSelectWard) onSelectWard(bed.ward)
                        }}
                        className="px-2 py-1 bg-white border border-amber-300 hover:bg-amber-600 hover:text-white text-amber-800 text-[10.5px] font-bold rounded shadow-2xs transition-colors cursor-pointer shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  ))}

                {/* 3. Mixed Gender Room Alerts */}
                {(activeTab === "all" || activeTab === "mixed") &&
                  mixedGenderRooms.map(({ ward, room_no, beds: roomBeds }) => (
                    <div
                      key={`mixed-${ward}-${room_no}`}
                      className="p-3 hover:bg-amber-50/50 transition-colors rounded-lg flex items-start gap-2.5"
                    >
                      <div className="w-6 h-6 rounded bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 text-xs">
                        <FiUsers />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[12px] font-bold text-slate-900">
                            Mixed-Gender Room
                          </span>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                            Review
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 truncate mt-0.5">
                          {ward} &middot; Room {room_no} &middot;{" "}
                          {roomBeds.map((b) => bedOccupantName(b)).join(", ")}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          acknowledgeMixed(ward, room_no)
                          if (onSelectWard) onSelectWard(ward)
                        }}
                        className="px-2 py-1 bg-white border border-amber-300 hover:bg-amber-600 hover:text-white text-amber-800 text-[10.5px] font-bold rounded shadow-2xs transition-colors cursor-pointer shrink-0"
                      >
                        Clear
                      </button>
                    </div>
                  ))}
              </>
            )}
          </div>

          {/* Panel Footer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-medium">
              <FiShield className="text-emerald-600" /> Real-time Ward Sync
            </span>
            {onOpenBedManagement && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  onOpenBedManagement()
                }}
                className="text-blue-600 hover:underline font-bold cursor-pointer flex items-center gap-0.5"
              >
                Bed Management <FiChevronRight />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default WardAlertsNotificationPanel
