import React, { useState } from "react"
import {
  HelpCircle,
  X,
  Keyboard,
  BookOpen,
  Command,
  Search,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  MessageSquare,
  Radio,
  Stethoscope,
  Siren,
  Pill,
} from "lucide-react"

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenCommandPalette: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomReset?: () => void
  currentZoom?: number
  onToggleFullscreen?: () => void
  isFullscreen?: boolean
  onNavigate?: (module: string) => void
  onOpenMessages?: () => void
}

export default function HelpModal({
  isOpen,
  onClose,
  onOpenCommandPalette,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  currentZoom = 1,
  onToggleFullscreen,
  isFullscreen = false,
  onNavigate,
  onOpenMessages,
}: HelpModalProps) {
  const [activeTab, setActiveTab] = useState<"shortcuts" | "emergency" | "workflows">("shortcuts")

  if (!isOpen) return null

  const zoomPercent = Math.round(currentZoom * 100)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0B132B] text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
              <HelpCircle size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Hospital System Help &amp; Commands
                <span className="text-[11px] bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                  Scale: {zoomPercent}%
                </span>
                {isFullscreen && (
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-mono font-bold">
                    FULLSCREEN
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Text Zoom, Fullscreen, Interactive Shortcuts &amp; Emergency Protocols
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Close Help (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("shortcuts")}
            className={`py-3 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === "shortcuts"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Keyboard size={15} />
            <span>Interactive Commands &amp; Shortcuts</span>
          </button>
          <button
            onClick={() => setActiveTab("emergency")}
            className={`py-3 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === "emergency"
                ? "border-rose-600 text-rose-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <ShieldAlert size={15} />
            <span>Hospital Emergency Codes</span>
          </button>
          <button
            onClick={() => setActiveTab("workflows")}
            className={`py-3 px-3 flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === "workflows"
                ? "border-blue-600 text-blue-600 bg-white"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen size={15} />
            <span>Department Guides</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          {activeTab === "shortcuts" && (
            <div className="space-y-3">
              {/* Universal Command Palette */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Command size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-blue-950">Universal Command Palette</h4>
                    <p className="text-[11px] text-blue-700">Quickly search patients, diagnostic tests, or jump to any module</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose()
                    onOpenCommandPalette()
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                >
                  <Search size={13} />
                  <span>Open Palette (Ctrl + K)</span>
                </button>
              </div>

              {/* Grid of Interactive Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* 1. Zoom Controls (A- / A / A+) */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <ZoomIn size={14} className="text-blue-600" />
                      <span>Text Size Zoom</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Current scale: {zoomPercent}%</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onZoomOut?.()}
                      title="Decrease text size (A-)"
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white rounded font-bold font-mono text-[11px] transition-colors cursor-pointer border border-slate-200"
                    >
                      A-
                    </button>
                    <button
                      onClick={() => onZoomReset?.()}
                      title="Reset text size to 100%"
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white rounded font-bold font-mono text-[11px] transition-colors cursor-pointer border border-slate-200"
                    >
                      {zoomPercent === 100 ? "100%" : "Reset"}
                    </button>
                    <button
                      onClick={() => onZoomIn?.()}
                      title="Increase text size (A+)"
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white rounded font-bold font-mono text-[11px] transition-colors cursor-pointer border border-slate-200"
                    >
                      A+
                    </button>
                  </div>
                </div>

                {/* 2. Fullscreen Display (F11) */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      {isFullscreen ? <Minimize2 size={14} className="text-emerald-600" /> : <Maximize2 size={14} className="text-blue-600" />}
                      <span>Toggle Fullscreen Display</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isFullscreen ? "Fullscreen is Active" : "Standard View"}
                    </div>
                  </div>
                  <button
                    onClick={() => onToggleFullscreen?.()}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded flex items-center gap-1 transition-colors cursor-pointer border ${
                      isFullscreen
                        ? "bg-emerald-600 text-white border-emerald-500"
                        : "bg-slate-100 hover:bg-blue-600 text-slate-800 hover:text-white border-slate-200"
                    }`}
                  >
                    <span>{isFullscreen ? "Exit F11" : "Enter F11"}</span>
                  </button>
                </div>

                {/* 3. Radiology Department */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Radio size={14} className="text-blue-600" />
                      <span>Radiology Department</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Scans, investigations &amp; PDF reports</div>
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      onNavigate?.("radiology")
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded border border-blue-200 hover:border-transparent transition-colors cursor-pointer"
                  >
                    Open (Alt+R)
                  </button>
                </div>

                {/* 4. Doctor Consultation Workspace */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Stethoscope size={14} className="text-blue-600" />
                      <span>Doctor Workspace</span>
                    </div>
                    <div className="text-[11px] text-slate-500">SOAP notes, e-Rx whiteboard &amp; split</div>
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      onNavigate?.("doctor_portal")
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded border border-blue-200 hover:border-transparent transition-colors cursor-pointer"
                  >
                    Open (Alt+D)
                  </button>
                </div>

                {/* 5. Emergency Track Board */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Siren size={14} className="text-rose-600" />
                      <span>Emergency Track Board</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Trauma bays &amp; Manchester triage</div>
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      onNavigate?.("emergency")
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white rounded border border-rose-200 hover:border-transparent transition-colors cursor-pointer"
                  >
                    Open (Alt+E)
                  </button>
                </div>

                {/* 6. Central Pharmacy Dispensing */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <Pill size={14} className="text-blue-600" />
                      <span>Pharmacy Dispensing</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Rx queue, stock &amp; barcode billing</div>
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      onNavigate?.("pharmacy_dispensing")
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded border border-blue-200 hover:border-transparent transition-colors cursor-pointer"
                  >
                    Open (Alt+P)
                  </button>
                </div>

                {/* 7. Staff Messages & Handovers */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs hover:border-blue-300 transition-colors">
                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-emerald-600" />
                      <span>Staff Messages</span>
                    </div>
                    <div className="text-[11px] text-slate-500">Clinical handovers &amp; notifications</div>
                  </div>
                  <button
                    onClick={() => {
                      onClose()
                      onOpenMessages?.()
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white rounded border border-emerald-200 hover:border-transparent transition-colors cursor-pointer"
                  >
                    Open (Ctrl+M)
                  </button>
                </div>

                {/* 8. Close Modal */}
                <div className="border border-slate-200 rounded-xl p-3 bg-white flex items-center justify-between shadow-2xs">
                  <div>
                    <span className="font-semibold text-slate-800">Close Active Modal / Drawer</span>
                    <div className="text-[11px] text-slate-500">Quick dismissal key</div>
                  </div>
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded shadow-2xs font-mono font-bold text-slate-800 text-[11px]">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>
          )}

          {activeTab === "emergency" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border-l-4 border-rose-500 bg-rose-50 p-3.5 rounded-r-xl border-y border-r border-rose-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-rose-900">CODE BLUE (Cardiac Arrest)</span>
                    <span className="font-mono font-bold text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-300 text-xs">
                      Ext: 2222
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    Immediate resuscitation team dispatch. Bring crash cart to stated bed/zone. CPR (30:2).
                  </p>
                </div>

                <div className="border-l-4 border-red-600 bg-red-50 p-3.5 rounded-r-xl border-y border-r border-red-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-red-900">CODE RED (Fire / Smoke)</span>
                    <span className="font-mono font-bold text-red-700 bg-white px-2 py-0.5 rounded border border-red-300 text-xs">
                      Ext: 1111
                    </span>
                  </div>
                  <p className="text-[11px] text-red-700 leading-relaxed">
                    RACE protocol: Rescue persons, Alarm &amp; notify, Confine smoke, Extinguish/evacuate.
                  </p>
                </div>

                <div className="border-l-4 border-amber-500 bg-amber-50 p-3.5 rounded-r-xl border-y border-r border-amber-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-amber-900">CODE YELLOW (Disaster / Mass Casualty)</span>
                    <span className="font-mono font-bold text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-300 text-xs">
                      Ext: 3333
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Emergency room surge protocol. All off-duty triage staff mobilize to Emergency Bay.
                  </p>
                </div>

                <div className="border-l-4 border-purple-500 bg-purple-50 p-3.5 rounded-r-xl border-y border-r border-purple-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-purple-900">STAT PHARMACY / CRITICAL LAB</span>
                    <span className="font-mono font-bold text-purple-700 bg-white px-2 py-0.5 rounded border border-purple-300 text-xs">
                      Ext: 4444
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-700 leading-relaxed">
                    Immediate antidote, inotropes, or verification of critical lab panic flags.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "workflows" && (
            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <Radio size={15} className="text-blue-600" />
                  <span>Radiology Department Workflow</span>
                </h4>
                <p className="text-slate-600 text-[11.5px] leading-relaxed">
                  Doctor Order prescribed &rarr; Nurse Verification dispatches simultaneously to Billing &amp; Radiology &rarr; Payment status displays live as PAID or PENDING &rarr; Staff completes scan &rarr; Reporting technician enters findings &amp; impressions &rarr; Generate official PDF report.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <Stethoscope size={15} className="text-blue-600" />
                  <span>Doctor Workspace &amp; Digital Prescription</span>
                </h4>
                <p className="text-slate-600 text-[11.5px] leading-relaxed">
                  Select appointed patient from Live Board &rarr; Voice consultation note (SOAP) &rarr; Upload or sketch Rx sheet &rarr; Split medicines and lab tests &rarr; Dispatch independently to Pharmacy and Reception/Lab.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <HelpCircle size={15} className="text-blue-600" />
                  <span>Role-Based Access Control</span>
                </h4>
                <p className="text-slate-600 text-[11.5px] leading-relaxed">
                  Click the avatar / role switcher in the top right header to instantly change active viewpoints (Doctor, Nurse, Pharmacist, Lab Tech, Billing Cashier, Admin).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Enterprise Hospital Management System • HospAI v1.0.4</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
