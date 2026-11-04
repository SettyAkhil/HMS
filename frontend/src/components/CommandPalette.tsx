import React, { useState, useEffect, useRef, useMemo } from "react"
import { Icon } from "./icons"
import { db } from "../services/db"
import { ErDatabase } from "../services/erDb"
import { BedDatabase } from "../services/bedDb"

interface CommandItem {
  id: string
  label: string
  subLabel?: string
  icon: string
  key: string
  type: "patient" | "navigation" | "action"
  patientId?: string
  encounterId?: string
  badge?: string
  badgeColor?: string
}

const STATIC_NAVIGATION: CommandItem[] = [
  {
    id: "nav-dash",
    label: "Dashboard",
    subLabel: "Overview & Analytics",
    key: "dashboard",
    icon: "🏠",
    type: "navigation",
  },
  {
    id: "nav-pat",
    label: "Patient Directory & Search",
    subLabel: "Master patient records",
    key: "patients",
    icon: "🔍",
    type: "navigation",
  },
  {
    id: "nav-bill",
    label: "Billing & Revenue Cycle",
    subLabel: "Universal Central Billing & Claims",
    key: "billing",
    icon: "💳",
    type: "navigation",
  },
  {
    id: "nav-er",
    label: "Emergency Department",
    subLabel: "ED track board & triage",
    key: "emergency",
    icon: "🚨",
    type: "navigation",
  },
  {
    id: "nav-ip",
    label: "Inpatient Bed Management",
    subLabel: "Ward beds & transfers",
    key: "inpatient",
    icon: "🛏",
    type: "navigation",
  },
  {
    id: "nav-op",
    label: "OP Management",
    subLabel: "Consultation & queue tokens",
    key: "op_management",
    icon: "🩺",
    type: "navigation",
  },
  {
    id: "nav-app",
    label: "Appointments",
    subLabel: "Doctor scheduling & bookings",
    key: "appointments",
    icon: "📅",
    type: "navigation",
  },
  {
    id: "nav-lab",
    label: "Laboratory",
    subLabel: "Diagnostic orders & reports",
    key: "laboratory",
    icon: "🧪",
    type: "navigation",
  },
  {
    id: "nav-rad",
    label: "Radiology & Imaging",
    subLabel: "X-Ray, CT, MRI scans",
    key: "radiology",
    icon: "🩻",
    type: "navigation",
  },
  {
    id: "nav-icu",
    label: "Intensive Care Unit (ICU)",
    subLabel: "Ventilators & vital monitoring",
    key: "icu",
    icon: "❤️‍🩹",
    type: "navigation",
  },
  {
    id: "nav-ot",
    label: "Surgery & OT",
    subLabel: "Operating theater schedule",
    key: "surgery",
    icon: "⚕️",
    type: "navigation",
  },
  {
    id: "nav-pos",
    label: "Payment History & Collections",
    subLabel: "Cashier receipts & payment ledger",
    key: "payments",
    icon: "💵",
    type: "navigation",
  },
  {
    id: "nav-ocr",
    label: "Keppler OCR Document AI",
    subLabel: "Medical intelligence vault",
    key: "dpi_ocr",
    icon: "📄",
    type: "navigation",
  },
]

const STATIC_ACTIONS: CommandItem[] = [
  {
    id: "act-reg",
    label: "Register New Patient",
    subLabel: "Create permanent UMR & master chart",
    key: "register",
    icon: "👤",
    type: "action",
  },
  {
    id: "act-app",
    label: "Book New Appointment",
    subLabel: "Schedule specialist consultation",
    key: "appointments",
    icon: "➕",
    type: "action",
  },
  {
    id: "act-er",
    label: "Triage Emergency Patient",
    subLabel: "Red / Yellow / Green ED triage",
    key: "emergency",
    icon: "🚑",
    type: "action",
  },
  {
    id: "act-bed",
    label: "Allocate Inpatient Bed",
    subLabel: "Assign ward or ICU bed",
    key: "beds",
    icon: "🏥",
    type: "action",
  },
  {
    id: "act-bill",
    label: "New Central Invoice",
    subLabel: "Convert charges to claim",
    key: "billing",
    icon: "🧾",
    type: "action",
  },
]

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNavigate: (key: string) => void
  onSelectPatient?: (patientId: string, encounterId?: string) => void
}

export default function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSelectPatient,
}: CommandPaletteProps) {
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQ("")
      setCursor(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Dynamic Patient List (OP, ER, Inpatient)
  const patientItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []
    const seenIds = new Set<string>()

    // 1. OP Patients from db
    try {
      const opPatients = db.getPatients()
      const encounters = db.getEncounters()
      for (const p of opPatients) {
        if (!seenIds.has(p.umr)) {
          seenIds.add(p.umr)
          const pEnc = encounters.filter((e) => e.umr === p.umr)[0]
          items.push({
            id: `pat-op-${p.umr}`,
            label: p.name,
            subLabel: `${p.umr} · ${p.age}y ${p.sex} · ${p.phone} ${pEnc
                ? `· OP: ${pEnc.opNumber} (${pEnc.dept || "General Med"})`
                : ""
              }`,
            key: "chart",
            type: "patient",
            patientId: p.umr,
            encounterId: pEnc?.id,
            icon: "👤",
            badge: pEnc ? `OP · ${pEnc.dept || "Outpatient"}` : "OP Registered",
            badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
          })
        }
      }
    } catch (e) {
      console.error("Failed to load OP patients for CommandPalette", e)
    }

    // 2. ER Patients
    try {
      const erVisits = ErDatabase.getVisits("all")
      const erPatients = ErDatabase.getPatients()
      for (const v of erVisits) {
        const p = erPatients.find((ep) => ep.patient_id === v.patient_id)
        const pId = v.patient_id || `ER-${v.id}`
        if (!seenIds.has(pId)) {
          seenIds.add(pId)
          const name = p?.name || v.patient_name || "Emergency Patient"
          const category = v.triage?.category || "Yellow"
          items.push({
            id: `pat-er-${v.id}`,
            label: name,
            subLabel: `${pId} · ER Visit: ${v.visit_no} · ${v.condition_at_arrival || "Emergency"} · ${p?.emergency_contact || p?.phone || ""}`,
            key: "chart",
            type: "patient",
            patientId: pId,
            icon: "🚨",
            badge: `ER · ${category}`,
            badgeColor:
              category.toLowerCase() === "red"
                ? "bg-rose-100 text-rose-800 border-rose-300"
                : category.toLowerCase() === "yellow"
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300",
          })
        }
      }
    } catch (e) {
      console.error("Failed to load ER patients for CommandPalette", e)
    }

    // 3. Inpatient & ICU Beds
    try {
      const beds = BedDatabase.getBeds()
      for (const bed of beds) {
        if (bed.status === "Occupied" && (bed.patient_name || bed.patient_id)) {
          const pId = bed.patient_id || `IP-${bed.id}`
          if (!seenIds.has(pId)) {
            seenIds.add(pId)
            const isIcu =
              bed.bed_type === "ICU" || bed.ward.toLowerCase().includes("icu")
            items.push({
              id: `pat-bed-${bed.id}`,
              label:
                `${bed.patient_name} ${bed.patient_last_name || ""}`.trim(),
              subLabel: `${pId} · ${bed.ward} Bed ${bed.bed_no} · ${bed.patient_age || 45}y · ${bed.patient_phone || ""}`,
              key: "chart",
              type: "patient",
              patientId: pId,
              icon: isIcu ? "❤️‍🩹" : "🛏️",
              badge: isIcu ? "ICU Occupied" : `IP · ${bed.ward}`,
              badgeColor: isIcu
                ? "bg-purple-100 text-purple-800 border-purple-300"
                : "bg-indigo-50 text-indigo-700 border-indigo-200",
            })
          }
        }
      }
    } catch (e) {
      console.error("Failed to load Bed patients for CommandPalette", e)
    }

    return items
  }, [open])

  // Filter groups
  const query = q.trim().toLowerCase()

  const filteredPatients = useMemo(() => {
    if (!query) return patientItems.slice(0, 6)
    return patientItems.filter(
      (p) =>
        p.label.toLowerCase().includes(query) ||
        (p.subLabel && p.subLabel.toLowerCase().includes(query)) ||
        (p.patientId && p.patientId.toLowerCase().includes(query)) ||
        (p.badge && p.badge.toLowerCase().includes(query)),
    )
  }, [patientItems, query])

  const filteredActions = useMemo(() => {
    if (!query) return STATIC_ACTIONS
    return STATIC_ACTIONS.filter(
      (a) =>
        a.label.toLowerCase().includes(query) ||
        (a.subLabel && a.subLabel.toLowerCase().includes(query)),
    )
  }, [query])

  const filteredNavigation = useMemo(() => {
    if (!query) return STATIC_NAVIGATION
    return STATIC_NAVIGATION.filter(
      (n) =>
        n.label.toLowerCase().includes(query) ||
        (n.subLabel && n.subLabel.toLowerCase().includes(query)),
    )
  }, [query])

  const groups = useMemo(() => {
    const list: { group: string; items: CommandItem[] }[] = []
    if (filteredPatients.length > 0) {
      list.push({
        group: query
          ? `Matching Patients (${filteredPatients.length})`
          : "Active Hospital Patients (OP / IP / ER / ICU)",
        items: filteredPatients,
      })
    }
    if (filteredActions.length > 0) {
      list.push({ group: "Quick Actions", items: filteredActions })
    }
    if (filteredNavigation.length > 0) {
      list.push({
        group: "Hospital Modules & Navigation",
        items: filteredNavigation,
      })
    }
    return list
  }, [filteredPatients, filteredActions, filteredNavigation, query])

  const allFiltered = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const handleSelect = (item: CommandItem) => {
    if (item.type === "patient" && item.patientId) {
      if (onSelectPatient) {
        onSelectPatient(item.patientId, item.encounterId)
      } else {
        onNavigate("chart")
      }
    } else {
      onNavigate(item.key)
    }
    onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, allFiltered.length - 1))
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
      }
      if (e.key === "Enter") {
        const item = allFiltered[cursor]
        if (item) {
          handleSelect(item)
        }
      }
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [open, cursor, allFiltered, onClose])

  if (!open) return null

  let globalIdx = 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
        onClick={onClose}
      />
      <div className="relative w-[620px] max-w-[95vw] bg-white rounded-xl shadow-2xl border border-[#CBD5E1] overflow-hidden z-10 animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Search input bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
          <span className="text-gray-400 text-base">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setCursor(0)
            }}
            placeholder="Search patients by name, UMR, MRN, phone, doctor, ward, diagnosis..."
            className="flex-1 text-[13.5px] text-gray-900 placeholder:text-[#94A3B8] focus:outline-none bg-transparent font-medium"
          />
          {q && (
            <button
              onClick={() => {
                setQ("")
                setCursor(0)
              }}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          )}
          <div className="flex items-center gap-1">
            <kbd className="bg-white border border-[#CBD5E1] rounded text-[10px] px-1.5 py-0.5 text-[#64748B] font-mono shadow-xs">
              ESC
            </kbd>
          </div>
        </div>

        {/* Results Stream */}
        <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100">
          {groups.map((group) => (
            <div key={group.group}>
              <div className="px-4 py-2 text-[10.5px] font-bold text-[#64748B] uppercase tracking-wider bg-[#F1F5F9] sticky top-0 z-5 border-y border-[#E2E8F0]">
                {group.group}
              </div>
              {group.items.map((item) => {
                const idx = globalIdx++
                const active = idx === cursor
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setCursor(idx)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${active ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"
                      }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-lg w-6 text-center shrink-0">
                        {item.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[13px] font-semibold ${active ? "text-[#1B4FD8]" : "text-gray-900"
                              }`}
                          >
                            {item.label}
                          </span>
                          {item.badge && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.2 rounded border shadow-2xs ${item.badgeColor ||
                                "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.subLabel && (
                          <div className="text-[11.5px] text-[#64748B] truncate mt-0.5">
                            {item.subLabel}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {item.type === "patient" ? (
                        <span className="text-[11px] font-bold text-[#1B4FD8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          Open Chart ↵
                        </span>
                      ) : active ? (
                        <Icon.ChevronRight className="text-[#1B4FD8]" />
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}

          {allFiltered.length === 0 && (
            <div className="px-4 py-12 text-center">
              <div className="text-3xl mb-2">🔍</div>
              <div className="text-sm font-bold text-gray-800">
                No matching patients or commands found
              </div>
              <div className="text-[12px] text-[#64748B] mt-1">
                Try searching by patient name (e.g. "Ravi", "Zoro", "Sunita"),
                UMR number ("UMR10001"), or phone.
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B] bg-[#F8FAFC]">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-slate-900">↑↓</strong> Navigate
            </span>
            <span>
              <strong className="text-slate-900">↵</strong> Select / Open Chart
            </span>
            <span>
              <strong className="text-slate-900">ESC</strong> Close
            </span>
          </div>
          <span className="text-[10.5px] text-slate-400 font-mono">
            Real-Time Master Index Active
          </span>
        </div>
      </div>
    </div>
  )
}
