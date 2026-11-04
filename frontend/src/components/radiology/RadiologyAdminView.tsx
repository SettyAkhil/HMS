import React, { useState, useMemo, useEffect } from "react"
import {
  Settings,
  Layers,
  FileText,
  Users,
  ShieldCheck,
  Activity,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Edit2,
  ExternalLink,
  Power,
  Sliders,
  Check,
  Upload,
  Eye,
  Trash2,
} from "lucide-react"
import { UniversalRadiologyDb, RadiologySuite, RadiologyAuditEvent } from "../../services/universalRadiologyDb"
import { RadiologyTemplateDatabase, RadiologyTemplate } from "../../services/radiologyTemplateDb"
import { DiagnosticTariffDatabase, DiagnosticTariffItem } from "../../services/diagnosticTariffDb"
import { RADIOLOGY_MODALITIES } from "../../services/radiologyTariffsData"
import TemplateImporterModal from "./TemplateImporterModal"

interface RadiologyAdminViewProps {
  initialSubTab?: string
  currentRole?: string
  currentUserName?: string
}

export default function RadiologyAdminView({
  initialSubTab = "catalog",
  currentRole = "Senior Radiologist & HOD",
  currentUserName = "Dr. Rajesh Sharma, MD",
}: RadiologyAdminViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "catalog" | "templates" | "staff" | "equipment" | "rules" | "audit" | "integrations"
  >((initialSubTab as any) || "catalog")

  const [tick, setTick] = useState(0)
  const [catalogSearch, setCatalogSearch] = useState("")
  const [catalogModality, setCatalogModality] = useState("all")
  const [selectedSuite, setSelectedSuite] = useState<RadiologySuite | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null)

  // Template Importer State
  const [showImporterModal, setShowImporterModal] = useState(false)
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<RadiologyTemplate | null>(null)

  useEffect(() => {
    const unsub1 = UniversalRadiologyDb.subscribe(() => setTick((t) => t + 1))
    const unsub2 = RadiologyTemplateDatabase.onUpdate(() => setTick((t) => t + 1))
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const tariffs = useMemo(() => DiagnosticTariffDatabase.getRadiologyTariffs(), [tick])
  const templates = useMemo(() => RadiologyTemplateDatabase.getTemplates(), [tick])
  const suites = useMemo(() => UniversalRadiologyDb.getSuites(), [tick])
  const auditLogs = useMemo(() => UniversalRadiologyDb.getAuditEvents(), [tick])

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type })
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Filtered Examination Catalog
  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim()
    return tariffs.filter((t) => {
      if (catalogModality !== "all" && t.department !== catalogModality && t.modality !== catalogModality) {
        return false
      }
      if (q) {
        const matches =
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.bodyRegion || "").toLowerCase().includes(q) ||
          (t.responsibleInCharge || "").toLowerCase().includes(q) ||
          (t.reportTemplate || "").toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }, [tariffs, catalogSearch, catalogModality])

  // Staff Roster
  const staffRoster = [
    { name: "Dr. Rajesh Sharma, MD", role: "Senior Radiologist & HOD", id: "RAD-DOC-01", modalities: "Interventional, Fluoroscopy, Mammography, Nuclear Med, DEXA", status: "On Duty" },
    { name: "Dr. Sunita Rao, MD", role: "Senior Consultant Radiologist", id: "RAD-DOC-02", modalities: "CT Scan, MRI Suite, Digital Radiography", status: "On Duty" },
    { name: "Dr. Amit Roy, MD", role: "Consultant Radiologist", id: "RAD-DOC-03", modalities: "Ultrasound (USG), Vascular Doppler", status: "On Duty" },
    { name: "Alex Rivera, RT(R)", role: "Lead Imaging Technologist", id: "TECH-RAD-401", modalities: "64-Slice / 128-Slice CT, 3.0T MRI", status: "On Duty" },
    { name: "Priya Sharma, RT(R)", role: "Senior Radiographer", id: "TECH-RAD-402", modalities: "Digital X-Ray 1 & 2, Mammography", status: "On Duty" },
    { name: "Sunil Verma, RT(US)", role: "Diagnostic Sonographer", id: "TECH-RAD-403", modalities: "Ultrasound Suite, Doppler Bay", status: "On Duty" },
    { name: "Kavita Reddy, RT(R)", role: "Fluoroscopy & DEXA Specialist", id: "TECH-RAD-404", modalities: "Fluoroscopy Suite, DEXA Lab", status: "On Duty" },
  ]

  const handleToggleSuite = (suiteId: string, currentStatus: string) => {
    const newStatus = currentStatus === "Available" ? "Maintenance" : "Available"
    UniversalRadiologyDb.updateSuiteStatus(suiteId, newStatus as any)
    showToast(`Suite status updated to ${newStatus}.`, "info")
    setTick((t) => t + 1)
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3 rounded-md text-[13px] font-semibold border flex items-center justify-between shadow-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : toastMessage.type === "error"
              ? "bg-red-50 border-red-300 text-red-900"
              : "bg-blue-50 border-blue-300 text-blue-900"
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="cursor-pointer ml-3 font-bold">✕</button>
        </div>
      )}

      {/* ── Sub-navigation Header ── */}
      <div className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#1B4FD8]" />
              <span>Radiology Administration & Department Configuration</span>
            </h3>
            <p className="text-[12px] text-[#64748B]">
              Examination catalog master, template manager, staff assignments, imaging suites, and audit logs
            </p>
          </div>
        </div>

        {/* ── Sub-Tabs Strip ── */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-[#F1F5F9] pt-2 text-[12px] font-semibold">
          {[
            { id: "catalog", label: `Examination Master (${tariffs.length})` },
            { id: "templates", label: `Templates (${templates.length})` },
            { id: "staff", label: `Staff & Assignments (${staffRoster.length})` },
            { id: "equipment", label: `Suites & Equipment (${suites.length})` },
            { id: "rules", label: "Workflow Rules" },
            { id: "audit", label: `Audit Center (${auditLogs.length})` },
            { id: "integrations", label: "Integration Health" },
          ].map((tab) => {
            const isActive = activeSubTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-[#1B4FD8] text-white font-bold shadow-2xs"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── SUB-TAB 1: EXAMINATION MASTER (173 ITEMS) ── */}
      {activeSubTab === "catalog" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#DDE2EC] rounded-lg p-3.5 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#94A3B8]" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search examination code, name, body region, in-charge..."
                className="w-full pl-9 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[12.5px] text-slate-900 focus:outline-none focus:border-[#1B4FD8]"
              />
            </div>

            <select
              value={catalogModality}
              onChange={(e) => setCatalogModality(e.target.value)}
              className="bg-[#F8FAFC] border border-[#CBD5E1] px-3 py-1.5 rounded text-[12px] text-slate-700 font-semibold cursor-pointer focus:outline-none focus:border-[#1B4FD8]"
            >
              <option value="all">All 11 Modalities</option>
              {RADIOLOGY_MODALITIES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                  <th className="py-2.5 px-3 font-mono">Test Code</th>
                  <th className="py-2.5 px-4">Examination Name & Protocol</th>
                  <th className="py-2.5 px-3">Modality</th>
                  <th className="py-2.5 px-3">Body Region</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3">Responsible In-Charge</th>
                  <th className="py-2.5 px-3">Approved Template</th>
                  <th className="py-2.5 px-3 text-right">Tariff (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredCatalog.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-[#1B4FD8]">{item.code}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {item.name}
                      {item.variantProtocol && (
                        <span className="block text-[11px] text-slate-500 font-normal">
                          Protocol: {item.variantProtocol}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">{item.department || item.modality}</td>
                    <td className="py-2.5 px-3 text-slate-600">{item.bodyRegion || "General"}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {item.hospitalAvailability || "Enabled"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">{item.responsibleInCharge || "Dr. Rajesh Sharma"}</td>
                    <td className="py-2.5 px-3 text-purple-900 truncate max-w-xs">{item.reportTemplate || "Approved Template"}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹{item.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SUB-TAB 2: TEMPLATES ── */}
      {activeSubTab === "templates" && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h4 className="font-bold text-base text-[#0F172A] flex items-center gap-2">
                <span>Diagnostic Reporting Templates</span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  {templates.length} Registered
                </span>
              </h4>
              <p className="text-[12px] text-slate-500">Official approved report templates matching clinical examinations</p>
            </div>

            <button
              onClick={() => {
                setSelectedTemplateForEdit(null)
                setShowImporterModal(true)
              }}
              className="px-3.5 py-1.5 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>+ Upload Report Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {templates.map((tpl) => {
              const isApproved = tpl.approvalStatus === "Approved" || tpl.status === "Active"
              const isPending = tpl.approvalStatus === "Pending Review"
              const hasReconstructed = !!tpl.reconstructedDocument

              return (
                <div key={tpl.id} className="p-4 border border-slate-200 rounded-lg bg-[#FAFCFF] space-y-3 flex flex-col justify-between hover:border-blue-300 transition-colors shadow-2xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="text-[10.5px] font-mono text-purple-700 font-bold">{tpl.id}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-mono">
                          v{tpl.version}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isApproved
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : isPending
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}>
                          {tpl.approvalStatus || (tpl.status === "Active" ? "Approved" : "Inactive")}
                        </span>
                      </div>
                    </div>

                    <h5 className="font-bold text-[13.5px] text-slate-900 leading-snug">{tpl.testName}</h5>

                    <div className="text-[11.5px] text-slate-600 space-y-0.5">
                      <div>Modality: <span className="font-semibold text-slate-800">{tpl.modality || "XR"}</span> • Target: <span className="font-semibold">{tpl.genderTarget || "All"}</span></div>
                      {hasReconstructed && (
                        <div className="text-[11px] text-blue-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-blue-600" />
                          <span>Reconstructed Layout Active ({tpl.reconstructedDocument?.originalFileType?.toUpperCase() || "DOC"})</span>
                        </div>
                      )}
                      {tpl.originalFileDataUrl && (
                        <div className="text-[10.5px] text-slate-500 font-mono truncate" title={tpl.uploadedFileName}>
                          Source: {tpl.uploadedFileName || "Original file preserved"}
                        </div>
                      )}
                    </div>

                    {tpl.sections && (
                      <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                        Sections: {tpl.sections.map((s) => s.title).join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedTemplateForEdit(tpl)
                        setShowImporterModal(true)
                      }}
                      className="text-[11.5px] font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-50 px-2.5 py-1 rounded border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Compare / Edit</span>
                    </button>

                    {(!isApproved || isPending) && (
                      <button
                        onClick={() => {
                          try {
                            RadiologyTemplateDatabase.approveTemplate(tpl.id, currentUserName, currentRole)
                            showToast(`✓ Template "${tpl.testName}" approved and activated!`, "success")
                            setTick((t) => t + 1)
                          } catch (e: any) {
                            showToast(e.message || "Approval failed", "error")
                          }
                        }}
                        className="text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded border border-emerald-300 flex items-center gap-1 cursor-pointer transition-colors"
                        title="Approve for clinical reporting"
                      >
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>Approve</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (confirm(`Delete template "${tpl.testName}" (v${tpl.version})?`)) {
                          RadiologyTemplateDatabase.deleteTemplate(tpl.id)
                          showToast("Template removed.", "info")
                          setTick((t) => t + 1)
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      title="Delete Template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SUB-TAB 3: STAFF & ASSIGNMENTS ── */}
      {activeSubTab === "staff" && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
          <table className="w-full text-left text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                <th className="py-3 px-4">Staff Member & ID</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-4">Clinical Modality Responsibility</th>
                <th className="py-3 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {staffRoster.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{staff.name}</div>
                    <span className="text-[11px] font-mono text-slate-500">{staff.id}</span>
                  </td>
                  <td className="py-3 px-3 font-semibold text-slate-700">{staff.role}</td>
                  <td className="py-3 px-4 text-slate-600 font-medium">{staff.modalities}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      ● {staff.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUB-TAB 4: SUITES & EQUIPMENT ── */}
      {activeSubTab === "equipment" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {suites.map((suite) => (
            <div key={suite.id} className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold text-slate-600">{suite.code}</span>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
                  suite.status === "Available" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {suite.status}
                </span>
              </div>
              <div>
                <h4 className="font-bold text-[13.5px] text-slate-900">{suite.name}</h4>
                <div className="text-[11.5px] text-slate-600">{suite.room} • {suite.modality}</div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleToggleSuite(suite.id, suite.status)}
                  className="text-[11.5px] font-bold text-[#1B4FD8] hover:underline cursor-pointer"
                >
                  Toggle Maintenance / Service
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SUB-TAB 5: WORKFLOW RULES ── */}
      {activeSubTab === "rules" && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg p-5 shadow-2xs space-y-4 text-[13px]">
          <h4 className="font-bold text-base text-[#0F172A]">Department Operational Policy & Safety Rules</h4>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <span className="font-bold text-slate-900 block">1. Patient Safety Readiness Checklist</span>
              <p className="text-slate-600 text-[12px] mt-0.5">
                Before any scanning sequence begins, two-point patient identification, clinical indication check, and radiation safety clearance must be actively confirmed by the technologist.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <span className="font-bold text-slate-900 block">2. Billing Clearance & Emergency STAT Exception</span>
              <p className="text-slate-600 text-[12px] mt-0.5">
                Routine scans require verified financial clearance (Paid). Critical STAT orders from Emergency or ICU are permitted to scan immediately under Authorized Financial Exception.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
              <span className="font-bold text-slate-900 block">3. 24-Hour Diagnostic Reporting TAT Threshold</span>
              <p className="text-slate-600 text-[12px] mt-0.5">
                Completed scans without finalized reports after 24 hours automatically trigger High-Severity Report Overdue exceptions in the central exception management queue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-TAB 6: AUDIT CENTER ── */}
      {activeSubTab === "audit" && (
        <div className="bg-white border border-[#DDE2EC] rounded-lg shadow-2xs overflow-hidden">
          <table className="w-full text-left text-[12px] border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action Event</th>
                <th className="py-2.5 px-3">Actor & Role</th>
                <th className="py-2.5 px-4">Operation Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {auditLogs.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(ev.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">{ev.action}</td>
                  <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">{ev.actor} ({ev.role})</td>
                  <td className="py-2.5 px-4 text-slate-600">{ev.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SUB-TAB 7: INTEGRATION HEALTH ── */}
      {activeSubTab === "integrations" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { name: "Hospital Billing & Invoicing Engine", service: "BillingDatabase", status: "Connected (Live)", latency: "1ms", color: "emerald" },
            { name: "Patient Registry & Encounter History", service: "db Core Service", status: "Connected (Live)", latency: "1ms", color: "emerald" },
            { name: "Diagnostic Tariffs & Price Master", service: "DiagnosticTariffDatabase", status: "173 Tests Active", latency: "sub-ms", color: "emerald" },
            { name: "Clinical AI Impression Service", service: "Keppler vLLM / NLP Synthesizer", status: "Operational", latency: "42ms", color: "purple" },
            { name: "PDF Print & QR Accession Engine", service: "radiologyPrint.ts / jsPDF", status: "Active (Client-side)", latency: "instant", color: "emerald" },
            { name: "BroadcastChannel Multi-Tab Sync", service: "hospai_universal_radiology_channel", status: "Listening", latency: "realtime", color: "emerald" },
          ].map((int, i) => (
            <div key={i} className="bg-white border border-[#DDE2EC] rounded-lg p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-slate-900">{int.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  int.color === "purple" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
                }`}>
                  ● {int.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-mono">Service: {int.service}</div>
              <div className="text-[10.5px] text-slate-400">Response Latency: {int.latency}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Template Importer Modal ── */}
      {showImporterModal && (
        <TemplateImporterModal
          onClose={() => {
            setShowImporterModal(false)
            setSelectedTemplateForEdit(null)
          }}
          initialTemplate={selectedTemplateForEdit}
          currentRole={currentRole}
          currentUserName={currentUserName}
          onSuccess={(saved) => {
            setTick((t) => t + 1)
            showToast(`✓ Template "${saved.testName}" (v${saved.version}) saved.`, "success")
          }}
        />
      )}
    </div>
  )
}
