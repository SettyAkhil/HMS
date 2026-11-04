/**
 * Enterprise Hospital Management System - Global Reports Search Bar
 * Path: src/components/reports/GlobalReportsSearchBar.tsx
 *
 * Placed immediately below the "General Reports" header and directly above "Filter Overview".
 * Provides debounced global autocomplete for Patients, Doctors, and Staff with keyboard navigation.
 */

import React, { useState, useEffect, useRef, useTransition } from "react"
import {
  Search,
  X,
  User,
  Stethoscope,
  Users,
  ChevronRight,
  ArrowRight,
  Loader2,
  Building2,
  Phone,
  Hash,
} from "lucide-react"
import {
  GlobalSearchService,
  SearchResultItem,
  GroupedSearchResults,
} from "../../services/globalSearchService"

interface GlobalReportsSearchBarProps {
  onSelect: (item: SearchResultItem) => void
  className?: string
}

export const GlobalReportsSearchBar: React.FC<GlobalReportsSearchBarProps> = ({
  onSelect,
  className = "",
}) => {
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<GroupedSearchResults>({
    patients: [],
    doctors: [],
    staff: [],
    total: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [, startTransition] = useTransition()

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Flattened results list for keyboard arrow navigation
  const flattenedList: SearchResultItem[] = [
    ...results.patients,
    ...results.doctors,
    ...results.staff,
  ]

  // Debounced Search Execution (100ms)
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults({ patients: [], doctors: [], staff: [], total: 0 })
      setIsLoading(false)
      setSelectedIndex(-1)
      return
    }

    setIsLoading(true)
    const handler = setTimeout(() => {
      startTransition(() => {
        const searchRes = GlobalSearchService.searchAll(trimmed)
        setResults(searchRes)
        setIsLoading(false)
        setIsOpen(true)
        setSelectedIndex(-1)
      })
    }, 180)

    return () => clearTimeout(handler)
  }, [query])

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (flattenedList.length > 0) {
        setIsOpen(true)
        return
      }
    }

    if (e.key === "Escape") {
      setIsOpen(false)
      inputRef.current?.blur()
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (flattenedList.length === 0) return
      setSelectedIndex((prev) =>
        prev < flattenedList.length - 1 ? prev + 1 : 0,
      )
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (flattenedList.length === 0) return
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : flattenedList.length - 1,
      )
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (selectedIndex >= 0 && selectedIndex < flattenedList.length) {
        handleSelectItem(flattenedList[selectedIndex])
      } else if (flattenedList.length > 0) {
        // Select first result if enter pressed without highlighting
        handleSelectItem(flattenedList[0])
      }
    }
  }

  const handleSelectItem = (item: SearchResultItem) => {
    setIsOpen(false)
    setQuery("")
    onSelect(item)
  }

  const handleClear = () => {
    setQuery("")
    setResults({ patients: [], doctors: [], staff: [], total: 0 })
    setIsOpen(false)
    setSelectedIndex(-1)
    inputRef.current?.focus()
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full z-30 ${className}`}
    >
      {/* Search Input Bar */}
      <div className="relative flex items-center w-full bg-white border border-[#E2E8F0] hover:border-blue-400 focus-within:border-[#1B4FD8] focus-within:ring-2 focus-within:ring-blue-100 rounded-xl shadow-2xs transition-all duration-150">
        <div className="pl-3.5 pr-2.5 text-slate-400 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-[#1B4FD8] animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-slate-500" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!isOpen && e.target.value.trim().length >= 2) {
              setIsOpen(true)
            }
          }}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search patients, doctors, staff by name, ID, MRN..."
          className="w-full py-2.5 pr-9 text-xs sm:text-sm text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none font-medium"
        />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && query.trim().length >= 2 && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1.5 max-h-[460px] overflow-y-auto bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-50 divide-y divide-slate-100 animate-in fade-in-50 duration-100"
        >
          {results.total === 0 && !isLoading ? (
            <div className="p-6 text-center">
              <div className="w-9 h-9 mx-auto mb-2 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-slate-700">
                No matching patients, doctors, or staff found
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Try searching by full name, ID, phone number, or specialization.
              </p>
            </div>
          ) : (
            <>
              {/* Group 1: Patients */}
              {results.patients.length > 0 && (
                <div className="p-2">
                  <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                      <span>Patients</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full border border-blue-100">
                      {results.patients.length} found
                    </span>
                  </div>

                  <div className="space-y-0.5 mt-0.5">
                    {results.patients.map((item) => {
                      const itemIdx = flattenedList.findIndex(
                        (fl) => fl.id === item.id,
                      )
                      const isSelected = itemIdx === selectedIndex

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-blue-50/80 text-blue-900"
                              : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-blue-100/70 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                              {item.title.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate flex items-center gap-2">
                                <span>{item.subtitle}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                item.badgeColor ||
                                "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {item.badge}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Group 2: Physicians & Doctors */}
              {results.doctors.length > 0 && (
                <div className="p-2">
                  <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Stethoscope className="w-3.5 h-3.5 text-purple-600" />
                      <span>Physicians & Doctors</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full border border-purple-100">
                      {results.doctors.length} found
                    </span>
                  </div>

                  <div className="space-y-0.5 mt-0.5">
                    {results.doctors.map((item) => {
                      const itemIdx = flattenedList.findIndex(
                        (fl) => fl.id === item.id,
                      )
                      const isSelected = itemIdx === selectedIndex

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-purple-50/80 text-purple-900"
                              : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-purple-100/70 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                              <Stethoscope className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {item.subtitle}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                item.badgeColor ||
                                "bg-purple-50 text-purple-700 border-purple-200"
                              }`}
                            >
                              {item.badge}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Group 3: Hospital Staff */}
              {results.staff.length > 0 && (
                <div className="p-2">
                  <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-600" />
                      <span>Hospital Staff</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-100">
                      {results.staff.length} found
                    </span>
                  </div>

                  <div className="space-y-0.5 mt-0.5">
                    {results.staff.map((item) => {
                      const itemIdx = flattenedList.findIndex(
                        (fl) => fl.id === item.id,
                      )
                      const isSelected = itemIdx === selectedIndex

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-amber-50/80 text-amber-900"
                              : "hover:bg-slate-50 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-amber-100/70 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
                              <Users className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {item.subtitle}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                                item.badgeColor ||
                                "bg-amber-50 text-amber-700 border-amber-200"
                              }`}
                            >
                              {item.badge}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

