import React, { useState, useMemo } from "react"
import {
  X,
  Search,
  Check,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  Info,
} from "lucide-react"
import {
  QuickActionDef,
  ALL_QUICK_ACTIONS,
  DEFAULT_QUICK_ACTION_IDS,
  ICON_MAP,
} from "./quickActionsConfig"

interface QuickActionsCustomizeModalProps {
  isOpen: boolean
  onClose: () => void
  currentActionIds: string[]
  onSave: (newActionIds: string[]) => void
}

const CATEGORIES = [
  "All",
  "Clinical & Care",
  "Emergency & Inpatient",
  "Diagnostics & Pharmacy",
  "Operations & Billing",
] as const

export default function QuickActionsCustomizeModal({
  isOpen,
  onClose,
  currentActionIds,
  onSave,
}: QuickActionsCustomizeModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [...currentActionIds])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<string>("All")
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Sync state whenever modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedIds([...currentActionIds])
      setSearchQuery("")
      setActiveCategory("All")
      setStatusMsg(null)
    }
  }, [isOpen, currentActionIds])

  // Filter available actions based on search and category
  const filteredCatalog = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return ALL_QUICK_ACTIONS.filter((action) => {
      const matchesCategory =
        activeCategory === "All" || action.category === activeCategory
      const matchesSearch =
        !q ||
        action.label.toLowerCase().includes(q) ||
        action.desc.toLowerCase().includes(q) ||
        action.module.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [searchQuery, activeCategory])

  // Handlers for active list manipulation
  const handleRemove = (idToRemove: string) => {
    setSelectedIds((prev) => prev.filter((id) => id !== idToRemove))
    setStatusMsg(null)
  }

  const handleAdd = (idToAdd: string) => {
    if (selectedIds.includes(idToAdd)) return
    if (selectedIds.length >= 8) {
      setStatusMsg("Maximum 8 shortcuts reached. Remove an item above to add another.")
      return
    }
    setSelectedIds((prev) => [...prev, idToAdd])
    setStatusMsg(null)
  }

  const handleMove = (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= selectedIds.length) return
    const updated = [...selectedIds]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    setSelectedIds(updated)
    setStatusMsg(null)
  }

  const handleResetToDefault = () => {
    setSelectedIds([...DEFAULT_QUICK_ACTION_IDS])
    setStatusMsg("Restored default 8 hospital shortcuts.")
  }

  const handleSave = () => {
    if (selectedIds.length === 0) {
      setStatusMsg("Please select at least 1 quick action shortcut.")
      return
    }
    onSave(selectedIds)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Customize Hospital Quick Actions
                </h3>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    selectedIds.length === 8
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-blue-50 text-blue-700 border-blue-200"
                  }`}
                >
                  {selectedIds.length} / 8 Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Organize and pick up to 8 instant shortcut tiles for your main dashboard.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status notification if any */}
        {statusMsg && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info size={14} className="text-amber-600 shrink-0" />
              <span>{statusMsg}</span>
            </div>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-amber-700 hover:text-amber-950 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Active Slots Section */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Dashboard Active Slots (4 × 2 Grid)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Use the left / right arrows to reorder slots, or click ✕ to remove a tile.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw size={12} />
                <span>Reset to Default</span>
              </button>
            </div>

            {/* Slots Visual Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
              {Array.from({ length: 8 }).map((_, slotIdx) => {
                const actionId = selectedIds[slotIdx]
                const action = ALL_QUICK_ACTIONS.find((a) => a.id === actionId)
                const IconComponent = action ? ICON_MAP[action.iconName] || SlidersHorizontal : null

                if (action && IconComponent) {
                  return (
                    <div
                      key={action.id}
                      className="relative p-2.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between group transition-all"
                      style={{ backgroundColor: action.bg }}
                    >
                      {/* Slot number badge */}
                      <span className="absolute top-1.5 left-2 text-[9px] font-mono font-bold text-slate-400">
                        #{slotIdx + 1}
                      </span>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => handleRemove(action.id)}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md bg-white/80 hover:bg-rose-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                        title="Remove from dashboard"
                      >
                        <X size={12} />
                      </button>

                      {/* Icon & Label */}
                      <div className="flex flex-col items-center text-center mt-2.5 mb-2">
                        <div
                          className={`w-7 h-7 rounded-lg ${action.iconBg} text-white flex items-center justify-center mb-1 shadow-2xs`}
                        >
                          <IconComponent size={14} />
                        </div>
                        <span
                          className={`text-[10.5px] font-bold ${action.textColor} leading-tight line-clamp-1`}
                        >
                          {action.label}
                        </span>
                      </div>

                      {/* Move controls */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50 mt-1">
                        <button
                          type="button"
                          disabled={slotIdx === 0}
                          onClick={() => handleMove(slotIdx, "left")}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                          title="Move Earlier"
                        >
                          <ArrowLeft size={11} />
                        </button>
                        <span className="text-[9px] text-slate-400 font-medium">Reorder</span>
                        <button
                          type="button"
                          disabled={slotIdx === selectedIds.length - 1}
                          onClick={() => handleMove(slotIdx, "right")}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                          title="Move Later"
                        >
                          <ArrowRight size={11} />
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={`empty-slot-${slotIdx}`}
                    className="p-3 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center text-slate-400 min-h-[96px] bg-white/50"
                  >
                    <span className="text-[10px] font-mono text-slate-300 mb-1">
                      Slot #{slotIdx + 1}
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">Empty Slot</span>
                    <span className="text-[9.5px] text-slate-400/80 mt-0.5">
                      Select an action below
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action Catalog Section */}
          <div className="pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Hospital Shortcuts Catalog ({ALL_QUICK_ACTIONS.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Click any action to toggle or add it to your dashboard shortcuts.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter shortcuts..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    activeCategory === cat
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Catalog Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
              {filteredCatalog.map((action) => {
                const isSelected = selectedIds.includes(action.id)
                const IconComponent = ICON_MAP[action.iconName] || SlidersHorizontal
                const slotIndex = selectedIds.indexOf(action.id)

                return (
                  <div
                    key={action.id}
                    onClick={() => {
                      if (isSelected) {
                        handleRemove(action.id)
                      } else {
                        handleAdd(action.id)
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? "border-emerald-300 bg-emerald-50/40 shadow-xs"
                        : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl ${action.iconBg} text-white flex items-center justify-center shrink-0 shadow-2xs`}
                      >
                        <IconComponent size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {action.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 text-slate-600 font-mono">
                            {action.module}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {action.desc}
                        </p>
                      </div>
                    </div>

                    {/* Toggle button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected) {
                          handleRemove(action.id)
                        } else {
                          handleAdd(action.id)
                        }
                      }}
                      disabled={!isSelected && selectedIds.length >= 8}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        isSelected
                          ? "bg-emerald-600 hover:bg-rose-600 text-white group/btn"
                          : "bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white border border-blue-200"
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check size={12} className="group-hover/btn:hidden" />
                          <Trash2 size={12} className="hidden group-hover/btn:inline" />
                          <span className="group-hover/btn:hidden">Slot #{slotIndex + 1}</span>
                          <span className="hidden group-hover/btn:inline">Remove</span>
                        </>
                      ) : (
                        <>
                          <Plus size={12} />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                )
              })}
            </div>

            {filteredCatalog.length === 0 && (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 mt-2">
                <Search size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">
                  No quick actions found matching "{searchQuery}"
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Try clearing the search or switching categories.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {selectedIds.length === 8 ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Check size={13} />
                <span>All 8 dashboard slots configured.</span>
              </span>
            ) : (
              <span>
                {8 - selectedIds.length} slot{8 - selectedIds.length === 1 ? "" : "s"} remaining
                (up to 8).
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
