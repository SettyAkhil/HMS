import React, { useState, useEffect, useMemo } from "react"
import {
  FileText,
  Calculator,
  Package as PackageIcon,
  FileCheck2,
  History,
  TrendingUp,
  Filter,
  Search,
  Plus,
  Trash2,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Layers,
  Shield,
  Building2,
  DollarSign,
  Percent,
  Check,
  ChevronRight,
  Sparkles,
} from "lucide-react"
import { InsuranceEngineService } from "../../services/insuranceDb"
import type {
  PackageMaster,
  PackageComponent,
  PricingRuleSet,
  DocumentRule,
} from "../../types/insurance"
import { inr, useNotify, useCases, fieldCls, btn } from "./ui"
import InsuranceReportsView from "./InsuranceReportsView"

type AuditTab = "audit" | "rules" | "packages" | "reports"

export default function EnhancedAuditRulesPage({
  initialTab = "audit",
}: {
  initialTab?: AuditTab
}) {
  const { notify, toastNode } = useNotify()
  const cases = useCases()
  const [activeTab, setActiveTab] = useState<AuditTab>(initialTab)

  // ── AUDIT LOG STATE ──
  const [auditSearch, setAuditSearch] = useState("")
  const [auditFilter, setAuditFilter] = useState("all")

  // Mock initial audit logs combined with engine events
  const auditLogs = useMemo(() => {
    const list = [
      {
        id: "AUD-9081",
        timestamp: "2026-10-02 16:45:12",
        event: "Claim Dispatched",
        caseId: "CLM-2026-089",
        patient: "Ramesh Kumar (UH001256)",
        insurer: "Care Health Insurance",
        user: "Elena Torres (Billing)",
        status: "Success",
        details: "Dispatched initial claim batch totaling ₹185,000 via Medi Assist portal API.",
      },
      {
        id: "AUD-9080",
        timestamp: "2026-10-02 15:20:00",
        event: "Pre-Auth Approved",
        caseId: "CLM-2026-088",
        patient: "Sunita Sharma (UH001942)",
        insurer: "Star Health Insurance",
        user: "System Automator",
        status: "Success",
        details: "Pre-authorization approved for ₹250,000. Approval letter attached.",
      },
      {
        id: "AUD-9079",
        timestamp: "2026-10-02 14:10:45",
        event: "Document Rule Updated",
        caseId: "CONFIG-SYS",
        patient: "N/A",
        insurer: "HDFC ERGO Health",
        user: "Dr. Alexander Vance (Admin)",
        status: "Modified",
        details: "Updated mandatory document checklist: Added Discharge Summary & Implant Invoice.",
      },
      {
        id: "AUD-9078",
        timestamp: "2026-10-02 12:30:10",
        event: "Query Received",
        caseId: "CLM-2026-085",
        patient: "Vikram Reddy (UH002104)",
        insurer: "ICICI Lombard",
        user: "TPA Portal Ingestion",
        status: "Warning",
        details: "Insurer raised Query #2: Requested pre-admission Investigation reports & OT notes.",
      },
      {
        id: "AUD-9077",
        timestamp: "2026-10-02 10:15:30",
        event: "Package Tariff Modified",
        caseId: "PKG-SURG-002",
        patient: "N/A",
        insurer: "All Insurers",
        user: "Robert Williams (Pharmacy)",
        status: "Modified",
        details: "Updated Laparoscopic Cholecystectomy tariff package base price to ₹95,000.",
      },
      {
        id: "AUD-9076",
        timestamp: "2026-10-01 18:00:22",
        event: "Settlement Reconciled",
        caseId: "CLM-2026-072",
        patient: "Ananya Roy (UH001190)",
        insurer: "Max Bupa / Niva Bupa",
        user: "Accounts Desk",
        status: "Success",
        details: "Payment of ₹142,500 received via NEFT #984210. Claim closed.",
      },
    ]
    return list.filter((a) => {
      const matchesSearch =
        a.caseId.toLowerCase().includes(auditSearch.toLowerCase()) ||
        a.patient.toLowerCase().includes(auditSearch.toLowerCase()) ||
        a.insurer.toLowerCase().includes(auditSearch.toLowerCase()) ||
        a.event.toLowerCase().includes(auditSearch.toLowerCase())
      const matchesFilter =
        auditFilter === "all" ||
        (auditFilter === "claims" && (a.event.includes("Claim") || a.event.includes("Pre-Auth"))) ||
        (auditFilter === "rules" && (a.event.includes("Rule") || a.event.includes("Package"))) ||
        (auditFilter === "settlements" && a.event.includes("Settlement"))
      return matchesSearch && matchesFilter
    })
  }, [auditSearch, auditFilter])

  // ── PACKAGES & PRICING RULES STATE ──
  const [packages, setPackages] = useState<PackageMaster[]>(() => InsuranceEngineService.getPackages())
  const [pricingRules, setPricingRules] = useState<PricingRuleSet[]>(() => InsuranceEngineService.getPricingRuleSets())
  const [docRules, setDocRules] = useState<DocumentRule[]>(() => InsuranceEngineService.getDocumentRules())

  useEffect(() => {
    const unsub = InsuranceEngineService.subscribe(() => {
      setPackages(InsuranceEngineService.getPackages())
      setPricingRules(InsuranceEngineService.getPricingRuleSets())
      setDocRules(InsuranceEngineService.getDocumentRules())
    })
    return unsub
  }, [])

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-y-auto">
      {toastNode}

      <div className="p-6 max-w-[1750px] mx-auto w-full space-y-6">
        {/* Page Header */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-extrabold shadow-sm shrink-0 border border-slate-800">
              <Shield size={24} className="text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Audit Log, Billing Rules &amp; Compliance Hub
                </h1>
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-full">
                  Central Governance
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Unified control center for live system audit logs, package billing tariffs, compliance rules, and department analytics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => notify("Exporting full audit trail report to CSV...", "success")}
              className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Download size={14} /> Export Audit Log
            </button>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={14} /> Print Rules &amp; Logs
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-2 shadow-2xs">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none" role="tablist">
            <button
              onClick={() => setActiveTab("audit")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "audit"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <History size={15} />
              <span>📜 Audit Log &amp; Event Trace</span>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold ${activeTab === "audit" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                {auditLogs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("packages")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "packages"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <PackageIcon size={15} />
              <span>🏷️ Billing Tariffs &amp; Package Capping</span>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold ${activeTab === "packages" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                {packages.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("rules")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "rules"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <FileCheck2 size={15} />
              <span>⚖️ Document Compliance &amp; Pre-Auth Rules</span>
              <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold ${activeTab === "rules" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>
                {docRules.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "reports"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <TrendingUp size={15} />
              <span>📊 Performance Reports &amp; Analytics</span>
            </button>
          </div>
        </div>

        {/* Tab 1: AUDIT TRAIL */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            {/* Audit Toolbar */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search by Case ID, patient, insurer, or event..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50/50 focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
                />
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 font-medium">Filter by Event:</span>
                <select
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white font-medium focus:outline-none focus:border-blue-600"
                >
                  <option value="all">All System Events</option>
                  <option value="claims">Claims &amp; Pre-Auths</option>
                  <option value="rules">Rules &amp; Package Configs</option>
                  <option value="settlements">Settlements &amp; Payments</option>
                </select>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Log ID &amp; Timestamp</th>
                    <th className="px-5 py-3.5">Event Type</th>
                    <th className="px-5 py-3.5">Case Reference</th>
                    <th className="px-5 py-3.5">Insurer / TPA</th>
                    <th className="px-5 py-3.5">User / Desk</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Action Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-mono">
                        <div className="font-bold text-slate-900">{log.id}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock size={11} /> {log.timestamp}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">{log.event}</td>
                      <td className="px-5 py-3.5 font-mono">
                        <span className="font-bold text-blue-700">{log.caseId}</span>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{log.patient}</div>
                      </td>
                      <td className="px-5 py-3.5 font-medium">{log.insurer}</td>
                      <td className="px-5 py-3.5 text-slate-600 font-medium">{log.user}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2.5 py-0.5 text-[10.5px] font-bold rounded-md uppercase tracking-wider ${
                            log.status === "Success"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : log.status === "Modified"
                              ? "bg-blue-50 text-blue-700 border border-blue-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600 leading-relaxed max-w-xs">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: BILLING TARIFFS & PACKAGES */}
        {activeTab === "packages" && (
          <div className="space-y-6">
            {/* Packages Grid Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Surgical &amp; Procedure Package Tariffs</h3>
                <p className="text-xs text-slate-500">Fixed rate package pricing, component inclusions, and multi-procedure discount rules.</p>
              </div>
              <button
                onClick={() => { window.dispatchEvent(new CustomEvent("hms:open-insurance", { detail: { module: "insurance_masters", section: "packages" } })); notify("Opening Master Setup → Packages to add a package.", "success") }}
                className="px-3.5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> Add New Surgical Package
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {packages.map((pkg) => (
                <div key={pkg.id} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4 hover:border-blue-400 transition-all">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2 py-0.5 text-[10.5px] font-mono font-bold bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                        {pkg.code}
                      </span>
                      <h4 className="text-sm font-extrabold text-slate-900 mt-1.5">{pkg.procedureName}</h4>
                      <span className="text-xs text-slate-500 font-medium">{pkg.department}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-extrabold text-blue-900 font-mono">{inr(pkg.basePrice)}</div>
                      <span className="text-[10px] text-slate-400 font-semibold">+ {pkg.applicableGstRate}% GST</span>
                    </div>
                  </div>

                  {/* Components Included */}
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Included Components</span>
                    <div className="flex flex-wrap gap-1.5">
                      {pkg.includedComponents.map((c) => (
                        <span key={c} className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md flex items-center gap-1">
                          <Check size={11} className="text-emerald-600" /> {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Pricing Discount Schedule */}
                  <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Multi-Procedure Discount Rules</span>
                    {pkg.pricingRules.map((r) => (
                      <div key={r.sequenceOrder} className="flex items-center justify-between text-slate-700 font-medium bg-slate-50 px-2.5 py-1 rounded-lg">
                        <span>Seq #{r.sequenceOrder}: {r.description}</span>
                        <span className="font-bold font-mono text-blue-700">{r.discountPercentage}% Pay</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: DOCUMENT COMPLIANCE & RULES */}
        {activeTab === "rules" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Mandatory Document &amp; Checklist Rules</h3>
                <p className="text-xs text-slate-500">Configure pre-auth and claim filing compliance requirements per insurer / TPA.</p>
              </div>
              <button
                onClick={() => { window.dispatchEvent(new CustomEvent("hms:open-insurance", { detail: { module: "insurance_masters", section: "docrules" } })); notify("Opening Master Setup → Document Rules to add a rule.", "success") }}
                className="px-3.5 py-2 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> Add Document Rule
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {docRules.map((rule) => (
                <div key={rule.id} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck2 size={18} className="text-purple-700" />
                      <h4 className="text-sm font-bold text-slate-900">{rule.documentType}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-[10.5px] font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
                        {rule.stage}
                      </span>
                      <span className={`px-2 py-0.5 text-[10.5px] font-bold rounded-md uppercase tracking-wider ${
                        rule.mandatory ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-slate-100 text-slate-600"
                      }`}>
                        {rule.mandatory ? "Mandatory" : "Optional"}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span>Applicable Category: <strong className="text-slate-900">{rule.category}</strong></span>
                    <span className="text-[11px] font-mono text-slate-500">Status: {rule.status}</span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Applicable Wards &amp; Encounters</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(rule.encounterTypes.length > 0 ? rule.encounterTypes : ["IPD", "OPD", "ER", "ICU", "OT"]).map((enc: string) => (
                        <span key={enc} className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-emerald-600 shrink-0" /> {enc}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: REPORTS & PERFORMANCE ANALYTICS */}
        {activeTab === "reports" && (
          <div className="space-y-4">
            <InsuranceReportsView />
          </div>
        )}
      </div>
    </div>
  )
}
