import React, { useState } from "react"
import {
  X,
  BookOpen,
  ShieldCheck,
  Clock,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Search,
  UserCheck,
  FileText,
  HelpCircle,
  Sparkles,
  PhoneCall,
  Printer
} from "lucide-react"

export interface SopCategory {
  id: string
  title: string
  icon: any
  badge: string
  rules: {
    id: string
    title: string
    summary: string
    details: string[]
    tag?: string
  }[]
}

export const DEPT_SOP_DATA: SopCategory[] = [
  {
    id: "eligibility",
    title: "1. Cashless Eligibility & Patient Intake Mandates",
    badge: "Core Mandate",
    icon: ShieldCheck,
    rules: [
      {
        id: "el-1",
        title: "Aadhaar / Government ID Verification",
        summary: "Patient ID verification is compulsory prior to cashless pre-authorization transmission.",
        details: [
          "Verify Govt photo ID (Aadhaar Card / PAN / Voter ID) against the member name on the insurance card.",
          "Ensure relationship proof is attached if beneficiary is a dependent (spouse/child/parent).",
          "Upload verified scanned copy into Intake Step 2."
        ],
        tag: "Mandatory"
      },
      {
        id: "el-2",
        title: "Initial 30-Day Waiting Period & PED Clauses",
        summary: "Standard 30-day waiting period applies to fresh policies; emergency accidents are exempt.",
        details: [
          "Fresh policies (< 30 days old): Cashless covers accidental emergencies ONLY. Planned illness admissions require 30-day waiting period clearance.",
          "Pre-Existing Diseases (PED): Standard 24 to 36 months waiting period applies unless specific waiver endorsement exists on brochure.",
          "Specific Disease Exclusions: Cataract, Hernia, Joint Replacements carry 24-month waiting periods."
        ],
        tag: "Policy Clause"
      }
    ]
  },
  {
    id: "preauth_sla",
    title: "2. Pre-Authorization Transmissions & Insurer SLAs",
    badge: "TAT Matrix",
    icon: Clock,
    rules: [
      {
        id: "pa-1",
        title: "Emergency vs Planned Pre-Auth Deadlines",
        summary: "Strict transmission timeframes must be maintained for ER vs Planned admissions.",
        details: [
          "Emergency ER Admissions: Transmit filled Pre-Auth Request (Part A & B) within 24 HOURS of patient bed allocation.",
          "Planned IP Admissions: Transmit Pre-Auth dossier at least 48 HOURS prior to scheduled admission date.",
          "Initial Sanction Expected TAT: Care Health (2 hrs), Star Health (3 hrs), Medi Assist TPA (2 hrs), ICICI Lombard (4 hrs)."
        ],
        tag: "SLA Matrix"
      },
      {
        id: "pa-2",
        title: "Dossier Document Package Requirements",
        summary: "No pre-authorization is sent to the insurer without verified essential documents.",
        details: [
          "Part A (Patient Requisition) + Part B (Treating Doctor Clinical Form).",
          "Doctor's Admission Note with chief complaints, duration, and clinical findings.",
          "Itemized Cost Estimation breakdown signed by Nodal NHP officer."
        ],
        tag: "Checklist"
      }
    ]
  },
  {
    id: "room_capping",
    title: "3. Room Rent & ICU Tariff Capping Rules",
    badge: "Financial Rule",
    icon: Building2,
    rules: [
      {
        id: "rc-1",
        title: "Room Rent & ICU Capping Limits",
        summary: "Dynamic capping limits based on policy sum insured.",
        details: [
          "Single Private AC Room: Capped at 1% of Sum Insured per day (e.g. ₹5,000/day for 5 Lakh policy).",
          "ICU / ICCU Bed: Capped at 2% of Sum Insured per day (e.g. ₹10,000/day for 5 Lakh policy).",
          "Proportional Deduction: Room rent overage triggers proportionate reduction on doctor visit & OT charges."
        ],
        tag: "Tariff Rule"
      },
      {
        id: "rc-2",
        title: "Co-Payment Deductible Clauses",
        summary: "Mandatory co-pay percentage deduction rules at final settlement.",
        details: [
          "Senior Citizen / Specified Zone Co-Pay: Typically 10% to 20% mandatory.",
          "Co-pay applies to the final net admissible claim amount after non-payable deductions.",
          "Inform patient/relatives in writing during intake regarding estimated patient share."
        ],
        tag: "Deductible"
      }
    ]
  },
  {
    id: "leave_protocol",
    title: "4. Officer On-Leave Duty Coverage & Emergency Handover",
    badge: "Leave Protocol",
    icon: UserCheck,
    rules: [
      {
        id: "lp-1",
        title: "Duty Handover Protocol During Primary Manager Leave",
        summary: "Instructions for covering staff when primary Insurance Officer is away.",
        details: [
          "Monitor the Email & TPA Decision Hub (/insurance_emails) every 2 hours for inbound approval mails.",
          "When TPA email arrives: Copy the Authorization Code and Sanctioned Limit.",
          "Open the active thread, click 'Update Status: Approved', enter the code & amount, and save.",
          "For Deficiency Queries: Respond within 48 hours to prevent claim rejection due to delay.",
          "Escalation Hotline: Contact Nodal TPA Manager at 1800-425-9999 for stuck approvals (> 6 hours)."
        ],
        tag: "SOP Handover"
      }
    ]
  }
]

export default function InsuranceSopModal({
  isOpen,
  onClose
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState<string>("all")

  if (!isOpen) return null

  const filteredCategories = DEPT_SOP_DATA.map((cat) => {
    const rules = cat.rules.filter(
      (r) =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.details.some((d) => d.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    return { ...cat, rules }
  }).filter((cat) => (activeTab === "all" || cat.id === activeTab) && cat.rules.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200/90 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 text-emerald-400 flex items-center justify-center shrink-0 border border-white/10">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold tracking-tight">Insurance Dept Operational Rules &amp; SOP Knowledge Base</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Duty Coverage Standard
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Official hospital insurance guidelines, pre-auth SLAs, room capping rules, and leave coverage SOPs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Print SOP Document"
            >
              <Printer size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Category Pills */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search rules, SLAs, capping, leave protocols…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 h-8.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
              }`}
            >
              All Guidelines
            </button>
            {DEPT_SOP_DATA.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === cat.id ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200"
                }`}
              >
                {cat.badge}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body: Rules List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/30">
          {filteredCategories.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No department rules found matching your search.
            </div>
          ) : (
            filteredCategories.map((cat) => {
              const Icon = cat.icon
              return (
                <div key={cat.id} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80">
                    <Icon size={16} className="text-blue-600" />
                    <h3 className="text-sm font-extrabold text-slate-900">{cat.title}</h3>
                    <span className="ml-auto text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      {cat.badge}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {cat.rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:border-blue-300 transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                            {rule.title}
                          </h4>
                          {rule.tag && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                              {rule.tag}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                          {rule.summary}
                        </p>

                        <ul className="space-y-1.5 pt-1 pl-1">
                          {rule.details.map((detail, idx) => (
                            <li key={idx} className="text-[11.5px] text-slate-700 flex items-start gap-2">
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200/90 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <UserCheck size={15} className="text-emerald-600" />
            <span>Approved by Hospital Nodal Officer &amp; Insurance Committee</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
          >
            Close SOP Viewer
          </button>
        </div>
      </div>
    </div>
  )
}
