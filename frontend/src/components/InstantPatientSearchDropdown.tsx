import React, { useState, useEffect, useRef, useMemo } from "react"
import { FiSearch, FiX, FiShield, FiClock, FiActivity, FiUser, FiArrowRight, FiCheck } from "react-icons/fi"
import { apiFetch } from "../lib/api"
import { db, type DBPatient } from "../services/db"
import { ErDatabase, type ErVisitRecord } from "../services/erDb"
import { AcuityBadge, StatusBadge } from "./shared"

export interface SearchMatchItem {
  id: string
  visitId?: number
  patientId: string
  name: string
  age?: number | string | null
  gender?: string | null
  phone?: string | null
  visitNo?: string | null
  acuityLevel?: number
  status?: string
  bayOrRoom?: string
  chiefComplaint?: string | null
  source: "er_active" | "er_closed" | "hospital_db"
}

export function highlightMatch(text: string, query: string) {
  if (!query || !text) return text
  const cleanQ = query.trim().toLowerCase()
  if (!cleanQ) return text

  const at = text.toLowerCase().indexOf(cleanQ)
  if (at === -1) return text

  const before = text.slice(0, at)
  const match = text.slice(at, at + cleanQ.length)
  const after = text.slice(at + cleanQ.length)

  return (
    <>
      {before}
      <span className="font-extrabold text-[#1B4FD8] bg-blue-100/80 px-0.5 rounded text-inherit">
        {match}
      </span>
      {after}
    </>
  )
}

function parseAcuity(cat?: string | null): number {
  if (!cat) return 0
  const normalized = cat.toUpperCase()
  if (normalized.includes("ESI-1") || normalized.includes("B1") || normalized.includes("RESUS") || normalized === "1") return 1
  if (normalized.includes("ESI-2") || normalized.includes("B2") || normalized.includes("EMERG") || normalized === "2") return 2
  if (normalized.includes("ESI-3") || normalized.includes("B3") || normalized.includes("URGENT") || normalized === "3") return 3
  if (normalized.includes("ESI-4") || normalized.includes("B4") || normalized.includes("LESS") || normalized === "4") return 4
  if (normalized.includes("ESI-5") || normalized.includes("B5") || normalized.includes("NON") || normalized === "5") return 5
  return 0
}

interface InstantPatientSearchDropdownProps {
  value: string
  onChange: (val: string) => void
  onSelectVisit?: (visitId: number, item?: SearchMatchItem) => void
  onSelectPatient?: (patient: any) => void
  activeVisits?: any[]
  placeholder?: string
  className?: string
  onClear?: () => void
}

export default function InstantPatientSearchDropdown({
  value,
  onChange,
  onSelectVisit,
  onSelectPatient,
  activeVisits = [],
  placeholder = "Search patient by typing any letter (e.g. 'a', 'r')...",
  className = "",
  onClear,
}: InstantPatientSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [backendMatches, setBackendMatches] = useState<SearchMatchItem[]>([])
  const [isSearchingBackend, setIsSearchingBackend] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 1. Instant Local Matches (0ms latency, triggered on single character)
  const localMatches = useMemo<SearchMatchItem[]>(() => {
    const q = (value || "").trim().toLowerCase()
    if (!q) return []

    const items: SearchMatchItem[] = []
    const seenKeys = new Set<string>()

    // A. Check passed activeVisits first
    for (const v of activeVisits) {
      const name = (v.patient_name || v.patient?.name || v.unknown_patient_label || "").toLowerCase()
      const visitNo = (v.visit_no || "").toLowerCase()
      const uhid = (v.patient_id || "").toLowerCase()
      const phone = (v.patient_phone || v.patient?.phone || "").toLowerCase()
      const chief = (v.complaints?.[0]?.complaint || v.condition_at_arrival || "").toLowerCase()

      if (name.includes(q) || visitNo.includes(q) || uhid.includes(q) || phone.includes(q) || chief.includes(q)) {
        const key = `er-${v.id}`
        seenKeys.add(key)
        items.push({
          id: key,
          visitId: v.id,
          patientId: v.patient_id || v.visit_no || `PAT-${v.id}`,
          name: v.patient_name || v.patient?.name || v.unknown_patient_label || `Visit #${v.visit_no}`,
          age: v.patient_age ?? v.patient?.age,
          gender: v.patient_gender || v.patient?.gender,
          phone: v.patient_phone || v.patient?.phone,
          visitNo: v.visit_no,
          acuityLevel: parseAcuity(v.triage_category),
          status: v.status,
          bayOrRoom: v.triage_bed_label || "Waiting Area",
          chiefComplaint: v.complaints?.[0]?.complaint || v.condition_at_arrival,
          source: "er_active",
        })
      }
    }

    // B. Check all ErDatabase visits
    try {
      const allEr = ErDatabase.getVisits("all")
      for (const v of allEr) {
        const key = `er-${v.id}`
        if (seenKeys.has(key)) continue

        const name = (v.patient_name || v.patient?.name || v.unknown_patient_label || "").toLowerCase()
        const visitNo = (v.visit_no || "").toLowerCase()
        const uhid = (v.patient_id || "").toLowerCase()
        const phone = (v.patient_phone || v.patient?.phone || "").toLowerCase()

        if (name.includes(q) || visitNo.includes(q) || uhid.includes(q) || phone.includes(q)) {
          seenKeys.add(key)
          items.push({
            id: key,
            visitId: v.id,
            patientId: v.patient_id || v.visit_no || `PAT-${v.id}`,
            name: v.patient_name || v.patient?.name || v.unknown_patient_label || `Visit #${v.visit_no}`,
            age: v.patient_age ?? v.patient?.age,
            gender: v.patient_gender || v.patient?.gender,
            phone: v.patient_phone || v.patient?.phone,
            visitNo: v.visit_no,
            acuityLevel: parseAcuity(v.triage_category),
            status: v.status,
            bayOrRoom: v.triage_bed_label || (v.closed_at ? "Discharged" : "Waiting Area"),
            chiefComplaint: v.complaints?.[0]?.complaint || v.condition_at_arrival,
            source: v.closed_at || v.status === "closed" ? "er_closed" : "er_active",
          })
        }
      }
    } catch {
      // safe fallback
    }

    // C. Check Master Hospital Patients from local db
    try {
      const opPatients = db.getPatients()
      for (const p of opPatients) {
        const umrKey = (p.umr || "").toUpperCase()
        if (seenKeys.has(`umr-${umrKey}`)) continue

        const name = (p.name || "").toLowerCase()
        const umr = (p.umr || "").toLowerCase()
        const phone = (p.phone || "").toLowerCase()

        if (name.includes(q) || umr.includes(q) || phone.includes(q)) {
          seenKeys.add(`umr-${umrKey}`)
          items.push({
            id: `umr-${p.umr}`,
            patientId: p.umr,
            name: p.name,
            age: p.age,
            gender: p.sex,
            phone: p.phone,
            status: "Hospital Patient",
            source: "hospital_db",
          })
        }
      }
    } catch {
      // safe fallback
    }

    return items
  }, [value, activeVisits])

  // 2. Fast Backend Patient Fetch (80ms debounce on single alphabet)
  useEffect(() => {
    const q = (value || "").trim()
    if (!q) {
      setBackendMatches([])
      setIsSearchingBackend(false)
      return
    }

    setIsSearchingBackend(true)
    let isCancelled = false

    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ patients: any[] }>(
          `/api/patients?q=${encodeURIComponent(q)}`
        )
        if (!isCancelled && res?.patients) {
          const mapped: SearchMatchItem[] = res.patients.map((p) => ({
            id: `backend-${p.patient_id || p.id}`,
            patientId: p.patient_id || String(p.id),
            name: p.name || p.full_name || "Unknown",
            age: p.age,
            gender: p.gender,
            phone: p.phone,
            status: p.active_er_visit_no ? "ER Active" : "Master Patient",
            source: "hospital_db",
          }))
          setBackendMatches(mapped)
        }
      } catch {
        if (!isCancelled) setBackendMatches([])
      } finally {
        if (!isCancelled) setIsSearchingBackend(false)
      }
    }, 80)

    return () => {
      isCancelled = true
      clearTimeout(timer)
    }
  }, [value])

  // Combined and deduplicated suggestions list
  const allSuggestions = useMemo(() => {
    const combined = [...localMatches]
    const seenUhrs = new Set(localMatches.map((m) => m.patientId.toUpperCase()))

    for (const b of backendMatches) {
      if (!seenUhrs.has(b.patientId.toUpperCase())) {
        seenUhrs.add(b.patientId.toUpperCase())
        combined.push(b)
      }
    }
    return combined.slice(0, 8)
  }, [localMatches, backendMatches])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [allSuggestions])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || allSuggestions.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % allSuggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + allSuggestions.length) % allSuggestions.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = allSuggestions[selectedIndex]
      if (item) {
        handleSelectItem(item)
      }
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const handleSelectItem = async (item: SearchMatchItem) => {
    setIsOpen(false)
    onChange(item.name)

    if (item.visitId && onSelectVisit) {
      onSelectVisit(item.visitId, item)
    } else if (onSelectPatient) {
      onSelectPatient(item)
    } else if (onSelectVisit && item.source === "hospital_db") {
      // If patient exists in hospital DB but has no active ER visit, quick-create one so they can be triaged
      try {
        const res = await ErDatabase.createVisit({
          patientId: item.patientId,
          patientDetails: {
            name: item.name,
            age: typeof item.age === "number" ? item.age : 30,
            gender: item.gender || "Unknown",
            phone: item.phone || "",
          },
          arrivalMode: "Walk-in",
          conditionAtArrival: "Needs Triage Assessment",
        })
        onSelectVisit(res.visit.id, item)
      } catch {
        // Fallback
      }
    }
  }

  return (
    <div ref={dropdownRef} className={`relative flex-1 ${className}`}>
      {/* Search Input Box */}
      <div className="relative w-full">
        <FiSearch className="absolute left-2.5 top-2.5 text-gray-400 w-3.5 h-3.5 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (value.trim()) setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-[#DDE2EC] rounded shadow-2xs focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8] text-gray-800 transition-all placeholder:text-gray-400"
        />

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("")
              setIsOpen(false)
              onClear?.()
              inputRef.current?.focus()
            }}
            className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
            title="Clear search"
          >
            <FiX className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Google Search Style Instant Autocomplete Dropdown */}
      {isOpen && value.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-lg shadow-xl border border-[#DDE2EC] overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100 min-w-[340px]">
          {/* Header */}
          <div className="px-3.5 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B]">
            <span className="font-semibold flex items-center gap-1.5 text-gray-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Patient Matches ({allSuggestions.length})
            </span>
            {isSearchingBackend && (
              <span className="text-[10px] text-[#1B4FD8] flex items-center gap-1">
                Searching EMR...
              </span>
            )}
          </div>

          {/* Results List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F1F5F9]">
            {allSuggestions.length === 0 ? (
              <div className="p-5 text-center text-gray-500 space-y-1">
                <p className="text-xs font-semibold text-gray-700">
                  No patient found for "{value}"
                </p>
                <p className="text-[11px] text-gray-400">
                  Type any letter or number to instantly look up names, UHID, or visit numbers.
                </p>
              </div>
            ) : (
              allSuggestions.map((item, index) => {
                const isSelected = index === selectedIndex
                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleSelectItem(item)}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50/70 border-l-3 border-[#1B4FD8]"
                        : "hover:bg-gray-50 border-l-3 border-transparent"
                    }`}
                  >
                    {/* Left: Patient Icon & Details */}
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs shrink-0 mt-0.5">
                        {item.acuityLevel ? (
                          <AcuityBadge level={item.acuityLevel} />
                        ) : (
                          <FiUser className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-gray-900 truncate">
                            {highlightMatch(item.name, value)}
                          </span>
                          {item.visitNo && (
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                              {highlightMatch(item.visitNo, value)}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="font-mono text-gray-700">
                            {highlightMatch(item.patientId, value)}
                          </span>
                          <span>·</span>
                          <span>
                            {item.age ? `${item.age}y` : "—"} / {item.gender || "—"}
                          </span>
                          {item.phone && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{highlightMatch(item.phone, value)}</span>
                            </>
                          )}
                        </div>

                        {item.chiefComplaint && (
                          <div className="text-[10.5px] text-gray-500 truncate mt-0.5 italic">
                            Complaint: {item.chiefComplaint}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Badges & Action */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {item.source === "er_active" ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                          ER Bay: {item.bayOrRoom || "Wait"}
                        </span>
                      ) : item.source === "er_closed" ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                          ER Discharged
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                          Hospital EMR
                        </span>
                      )}

                      <span className="text-[10px] font-semibold text-[#1B4FD8] flex items-center gap-0.5 hover:underline">
                        Open <FiArrowRight className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-3.5 py-1.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between text-[10px] text-gray-400">
            <span>Use ↑↓ arrows to navigate, Enter to open</span>
            <span>Esc to close</span>
          </div>
        </div>
      )}
    </div>
  )
}
