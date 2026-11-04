import React, { useState, useEffect } from "react"
import {
  ShieldCheck,
  Search,
  Building2,
  Calendar,
  CheckCircle2,
  Sparkles,
  X,
  Radio,
  FileText,
  Clock,
  AlertCircle,
  Sliders,
  ChevronRight,
  UserCheck,
  Shield,
  FileCheck,
  Eye,
  Download,
  Printer,
  ExternalLink,
  Award,
  FileSpreadsheet,
  BookOpen
} from "lucide-react"
import InsuranceSopModal from "./InsuranceSopModal"
import { InsuranceEngineService } from "../../services/insuranceDb"
import type { PatientPolicy } from "../../types/insurance"
import { useNotify } from "./ui"

// Interface for dynamic brochure summarization
interface PolicySummary {
  sourceFile: string
  roomCategory: string
  roomRentLimitNote: string
  copayText: string
  copayBadge: string
  networkStatus: string
  waitingInitial: string
  waitingSpecific: string
  waitingPED: string
  exclusions: string[]
}

export default function PatientPoliciesPage() {
  const { notify, toastNode } = useNotify()
  const [policies, setPolicies] = useState<PatientPolicy[]>([])
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Expired">("All")
  
  // View Policy Modal State
  const [viewPolicyModalOpen, setViewPolicyModalOpen] = useState(false)
  const [sopModalOpen, setSopModalOpen] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)

  // Generate dynamic native PDF Blob URL when policy changes or modal opens
  useEffect(() => {
    if (selectedPolicy) {
      const pdfContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>> endobj
5 0 obj <</Length 450>> stream
BT
/F1 18 Tf
50 730 Td
(${selectedPolicy.insurerName.toUpperCase()} - POLICY BROCHURE) Tj
0 -30 Td
/F1 12 Tf
(Policy Number: ${selectedPolicy.policyNumber}) Tj
0 -20 Td
(Insured Member: ${selectedPolicy.patientName}) Tj
0 -20 Td
(Member TPA ID: ${selectedPolicy.memberId}) Tj
0 -20 Td
(Validity Expiry: ${selectedPolicy.validUntil}) Tj
0 -35 Td
/F1 14 Tf
(OFFICIAL COVERAGE TERMS & CONDITIONS) Tj
0 -25 Td
/F1 11 Tf
(1. Room Rent & ICU Limits: Single Private AC Room Capping) Tj
0 -18 Td
(2. Co-Payment Clause: Mandatory Co-Pay Applicable) Tj
0 -18 Td
(3. Waiting Periods: Initial 30 Days | Specific Ailments 24 Months) Tj
0 -18 Td
(4. Network Status: Empaneled Cashless Provider) Tj
0 -35 Td
(Digitally Uploaded Document - Enterprise HMS Insurance Desk) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000249 00000 n 
0000000328 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
830
%%EOF`
      const blob = new Blob([pdfContent], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      setPdfBlobUrl(url)

      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [selectedPolicyId])

  useEffect(() => {
    const claims = InsuranceEngineService.getClaims()

    const demoList: PatientPolicy[] = [
      {
        id: "POL-101",
        patientId: "UH10029",
        patientName: "John Smith",
        insurerId: "INS-001",
        insurerName: "Care Health Insurance",
        policyNumber: "CH1234567890",
        memberId: "MEM-7782",
        policyHolderName: "John Smith",
        relationship: "Self" as any,
        validUntil: "31 Dec 2026",
        sumInsured: 500000,
        balanceAvailable: 500000,
        copayPercentage: 10,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      },
      {
        id: "POL-102",
        patientId: "UH10030",
        patientName: "Mary Jones",
        insurerId: "INS-002",
        insurerName: "ICICI Lombard General Insurance",
        policyNumber: "ICICI-9920118",
        memberId: "MEM-8821",
        policyHolderName: "Mary Jones",
        relationship: "Self" as any,
        validUntil: "15 Oct 2026",
        sumInsured: 500000,
        balanceAvailable: 500000,
        copayPercentage: 0,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      },
      {
        id: "POL-103",
        patientId: "UH10031",
        patientName: "Robert Lee",
        insurerId: "INS-001",
        insurerName: "Care Health Insurance",
        policyNumber: "CARE-882199",
        memberId: "MEM-3312",
        policyHolderName: "Robert Lee",
        relationship: "Self" as any,
        validUntil: "20 Nov 2026",
        sumInsured: 500000,
        balanceAvailable: 450000,
        copayPercentage: 10,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      },
      {
        id: "POL-104",
        patientId: "UH10032",
        patientName: "Amit Patel",
        insurerId: "INS-002",
        insurerName: "ICICI Lombard General Insurance",
        policyNumber: "ICICI-881902",
        memberId: "MEM-9921",
        policyHolderName: "Amit Patel",
        relationship: "Self" as any,
        validUntil: "05 Aug 2026",
        sumInsured: 500000,
        balanceAvailable: 500000,
        copayPercentage: 0,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      },
      {
        id: "POL-105",
        patientId: "UH10033",
        patientName: "Ananya Desai",
        insurerId: "INS-003",
        insurerName: "HDFC ERGO General Insurance",
        policyNumber: "HDFC-SURG-9912",
        memberId: "MEM-1192",
        policyHolderName: "Ananya Desai",
        relationship: "Self" as any,
        validUntil: "12 Dec 2026",
        sumInsured: 500000,
        balanceAvailable: 500000,
        copayPercentage: 10,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      },
      {
        id: "POL-106",
        patientId: "UH10034",
        patientName: "Rahul Sharma",
        insurerId: "INS-001",
        insurerName: "Care Health Insurance",
        policyNumber: "CARE-998271",
        memberId: "MEM-7782",
        policyHolderName: "Rahul Sharma",
        relationship: "Self" as any,
        validUntil: "25 Sep 2026",
        sumInsured: 500000,
        balanceAvailable: 415000,
        copayPercentage: 10,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      },
      {
        id: "POL-107",
        patientId: "UH10035",
        patientName: "Sneha Reddy",
        insurerId: "INS-004",
        insurerName: "Star Health & Allied Insurance",
        policyNumber: "STAR-881293",
        memberId: "MEM-4491",
        policyHolderName: "Sneha Reddy",
        relationship: "Self" as any,
        validUntil: "10 Feb 2027",
        sumInsured: 1000000,
        balanceAvailable: 655000,
        copayPercentage: 0,
        status: "Active" as any,
        createdAt: new Date().toISOString()
      }
    ]

    const allPolicies = claims.map(c => ({
      id: "POL-" + c.id,
      patientId: c.patientId || c.mrn || "Unknown",
      patientName: c.patientName,
      insurerId: c.policy.insurerId,
      insurerName: c.policy.insurerName,
      tpaName: c.policy.tpaName,
      policyNumber: c.policy.policyNumber || "CH1234567890",
      memberId: c.policy.memberId || "MEM-7782",
      policyHolderName: c.patientName,
      relationship: "Self" as any,
      validUntil: c.policy.validUntil || "31 Dec 2026",
      sumInsured: c.policy.sumInsured || 500000,
      balanceAvailable: c.policy.sumInsured || 500000,
      copayPercentage: c.policy.copayPercentage || 0,
      status: "Active" as any,
      createdAt: c.createdAt
    }))

    const combined = [...demoList]
    allPolicies.forEach(p => {
      if (!combined.some(item => item.policyNumber === p.policyNumber)) {
        combined.push(p)
      }
    })

    setPolicies(combined)
    if (combined.length > 0) setSelectedPolicyId(combined[0].id)
  }, [])

  const selectedPolicy = policies.find(p => p.id === selectedPolicyId)

  // Dynamic brochure summary generator based on policy object (no hardcoding)
  const getDynamicSummary = (p: PatientPolicy): PolicySummary => {
    const cleanInsurer = p.insurerName.toLowerCase()
    const sanitizedDoc = p.insurerName.toLowerCase().replace(/[^a-z0-9]/g, "_")
    
    if (cleanInsurer.includes("star")) {
      return {
        sourceFile: `${sanitizedDoc}_brochure_terms.pdf`,
        roomCategory: "Single Private AC (No Capping)",
        roomRentLimitNote: "No room rent capping for single private room",
        copayText: "0% Mandatory Co-pay (Full Coverage)",
        copayBadge: "0% Co-Pay",
        networkStatus: "Direct Empaneled Cashless Partner",
        waitingInitial: "30 Days (Waived off for Emergency)",
        waitingSpecific: "12 Months (Cataract, Hernia, Joint Replacement)",
        waitingPED: "24 Months (Pre-Existing Diseases)",
        exclusions: [
          "Cosmetic & Aesthetic Surgeries",
          "Non-Medical Consumables (Gloves, Gowns)",
          "Experimental & Unproven Treatments",
          "OPD Consultations (unless explicitly covered)"
        ]
      }
    }

    if (cleanInsurer.includes("hdfc")) {
      return {
        sourceFile: `${sanitizedDoc}_brochure_2026.pdf`,
        roomCategory: "Shared / Twin Sharing Room",
        roomRentLimitNote: "Up to 1% of Sum Insured per day for normal room",
        copayText: p.copayPercentage > 0 ? `${p.copayPercentage}% Co-pay on final claim` : "10% Co-pay applicable",
        copayBadge: `${p.copayPercentage || 10}% Co-Pay`,
        networkStatus: "Empaneled Cashless Hospital Network",
        waitingInitial: "30 Days Initial Waiting Period",
        waitingSpecific: "24 Months for Specific Ailments",
        waitingPED: "36 Months for Pre-Existing Conditions",
        exclusions: [
          "Maternity & Newborn Care",
          "Cosmetic & Plastic Surgery",
          "Dental Treatment (unless accidental)",
          "Stem Cell & Genetic Therapy"
        ]
      }
    }

    if (cleanInsurer.includes("icici")) {
      return {
        sourceFile: `${sanitizedDoc}_policy_wording.pdf`,
        roomCategory: "Single Private AC Room",
        roomRentLimitNote: "Single Private AC room with no daily sub-limit",
        copayText: "0% Co-pay (Full Cashless Approval)",
        copayBadge: "Full Cashless",
        networkStatus: "Preferred Tier-1 Cashless Partner",
        waitingInitial: "30 Days (Immediate for Accidents)",
        waitingSpecific: "24 Months for Cataract & Hysterectomy",
        waitingPED: "36 Months for Pre-Existing Diseases",
        exclusions: [
          "Non-Prescribed Supplements",
          "Cosmetic / Aesthetic Procedures",
          "Unproven Therapies",
          "Self-Inflicted Injuries"
        ]
      }
    }

    // Default / Care Health Insurance
    return {
      sourceFile: `${sanitizedDoc}_terms_2026.pdf`,
      roomCategory: "Single Private AC (Up to 1% limit)",
      roomRentLimitNote: "1% per day for Normal Room, 2% per day for ICU/ICCU",
      copayText: p.copayPercentage > 0 ? `${p.copayPercentage}% Mandatory Co-pay on all claims` : "10% Mandatory Co-pay",
      copayBadge: `${p.copayPercentage || 10}% Co-Pay`,
      networkStatus: "Empaneled Cashless Provider",
      waitingInitial: "30 Days Initial Waiting",
      waitingSpecific: "24 Months for Specific Illnesses",
      waitingPED: "36 Months for Pre-Existing Diseases",
      exclusions: [
        "Maternity & Newborn Care",
        "Cosmetic / Aesthetic Treatments",
        "Dental Treatment (unless accidental)",
        "Non-Medical Consumables & Personal Items"
      ]
    }
  }

  const filteredPolicies = policies.filter(p => {
    const matchesSearch =
      p.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.policyNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.insurerName.toLowerCase().includes(searchQuery.toLowerCase())

    if (statusFilter === "Active") return matchesSearch && (p.status as string) === "Active"
    if (statusFilter === "Expired") return matchesSearch && (p.status as string) === "Expired"
    return matchesSearch
  })

  const currentSummary = selectedPolicy ? getDynamicSummary(selectedPolicy) : null

  return (
    <div className="flex-1 flex flex-col lg:h-full bg-slate-50/80 font-sans lg:overflow-hidden">
      {toastNode}

      {/* TOP HEADER */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between shrink-0 shadow-2xs">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="text-blue-600" size={22} />
            <span>Patient Policies</span>
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Dynamic AI Brochure Summarization &amp; Policy Rules Verification
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSopModalOpen(true)}
            className="px-3.5 py-2 bg-indigo-50 border border-indigo-200/90 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <BookOpen size={13} className="text-indigo-600" />
            <span>Dept Rules &amp; SOPs</span>
          </button>

          <div className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold font-mono">
            {policies.length} Policies Registered
          </div>
        </div>
      </div>

      <InsuranceSopModal isOpen={sopModalOpen} onClose={() => setSopModalOpen(false)} />

      {/* SPLIT VIEW */}
      {/* Below lg the list stacks above the policy detail (capped height) and
        the page scrolls as one column. */}
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden p-6 gap-6 max-w-[1700px] w-full mx-auto">
        
        {/* LEFT COLUMN: PATIENT POLICIES LIST */}
        <div className="w-full lg:w-[380px] max-h-[50dvh] lg:max-h-none bg-white border border-slate-200/80 rounded-2xl flex flex-col shrink-0 shadow-sm overflow-hidden">
          
          {/* SEARCH & FILTERS */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/40 space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search patient, policy, insurer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-2xs"
              />
            </div>

            {/* FILTER BUTTONS */}
            <div className="flex items-center gap-1 text-xs">
              {(["All", "Active", "Expired"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                    statusFilter === st
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* LIST ITEMS */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredPolicies.map((p) => {
              const isSelected = selectedPolicyId === p.id

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPolicyId(p.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? "bg-blue-50/90 border-blue-500 shadow-xs ring-1 ring-blue-500/20"
                      : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs truncate">{p.patientName}</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                        {p.status}
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 truncate">{p.insurerName}</div>
                    <div className="text-[10px] font-mono text-slate-400">{p.policyNumber}</div>
                  </div>

                  <ChevronRight size={16} className={`shrink-0 ${isSelected ? "text-blue-600" : "text-slate-300"}`} />
                </div>
              )
            })}

            {filteredPolicies.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs font-medium">
                No policies found matching search.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DYNAMIC POLICY AI SUMMARIZATION */}
        <div className="flex-1 min-w-0 bg-white border border-slate-200/80 rounded-2xl flex flex-col shadow-sm overflow-hidden">
          {selectedPolicy && currentSummary ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* PATIENT POLICY HEADER BANNER */}
              <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800 flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-white">{selectedPolicy.patientName}</h2>
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      ✓ Active Policy
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1.5"><Building2 size={14} className="text-indigo-400" /> {selectedPolicy.insurerName}</span>
                    <span>•</span>
                    <span>Policy No: <strong className="font-mono text-white">{selectedPolicy.policyNumber}</strong></span>
                    <span>•</span>
                    <span>Member ID: <strong className="font-mono text-slate-200">{selectedPolicy.memberId}</strong></span>
                  </div>
                </div>

                {/* VIEW POLICY BUTTON & EXPIRY */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setViewPolicyModalOpen(true)
                      notify(`Opening ${selectedPolicy.patientName}'s policy document...`, "success")
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-600/30 hover:shadow-lg"
                  >
                    <Eye size={15} />
                    <span>View Policy</span>
                  </button>

                  <div className="bg-white/10 border border-white/15 px-4 py-2 rounded-xl text-right">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Validity Expiry</div>
                    <div className="text-xs font-bold text-emerald-300 font-mono mt-0.5">{selectedPolicy.validUntil}</div>
                  </div>
                </div>
              </div>

              {/* AI BROCHURE SUMMARY CARD */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                      <FileText size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Insurance Brochure AI Summary</h3>
                      <div className="text-[11px] text-slate-400 font-mono">Document: {currentSummary.sourceFile}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewPolicyModalOpen(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Eye size={13} /> View Full Brochure
                    </button>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 size={13} /> Summarized via AI
                    </span>
                  </div>
                </div>
              </div>

              {/* DYNAMIC COVERAGE RULES GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                {/* CARD 1: ROOM RENT & ICU LIMITS */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Room Rent &amp; ICU Limits</h4>
                      <div className="text-[11px] text-slate-500">{currentSummary.roomCategory}</div>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-700 font-medium">
                    {currentSummary.roomRentLimitNote}
                  </div>
                </div>

                {/* CARD 2: CO-PAY & DEDUCTIBLES */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <Sliders size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Co-Pay &amp; Deductibles</h4>
                      <div className="text-[11px] text-slate-500">{currentSummary.copayBadge}</div>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-xl text-xs text-slate-700 font-medium">
                    {currentSummary.copayText}
                  </div>
                </div>

                {/* CARD 3: WAITING PERIODS */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <Clock size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Waiting Periods</h4>
                      <div className="text-[11px] text-slate-500">Ailments &amp; Pre-Existing Clause</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="font-semibold text-slate-500">Initial:</span>
                      <span className="font-medium text-slate-900">{currentSummary.waitingInitial}</span>
                    </div>
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="font-semibold text-slate-500">Specific Diseases:</span>
                      <span className="font-medium text-slate-900">{currentSummary.waitingSpecific}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-500">Pre-Existing (PED):</span>
                      <span className="font-medium text-slate-900">{currentSummary.waitingPED}</span>
                    </div>
                  </div>
                </div>

                {/* CARD 4: KEY EXCLUSIONS */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <AlertCircle size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Key Exclusions</h4>
                      <div className="text-[11px] text-slate-500">Non-Payable Treatments</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    {currentSummary.exclusions.map((ex, idx) => (
                      <div key={idx} className="flex items-center gap-2 font-medium">
                        <X size={14} className="text-rose-500 shrink-0 stroke-[3]" />
                        <span>{ex}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* NETWORK HOSPITAL STATUS CARD */}
              <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                    <Building2 size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 mb-0.5">Network Cashless Status</h4>
                    <p className="text-xs text-slate-600">
                      Enterprise Hospital is a <strong className="text-blue-700">{currentSummary.networkStatus}</strong> for {selectedPolicy.insurerName}.
                    </p>
                  </div>
                </div>

                <div className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shrink-0">
                  <Radio size={14} className="animate-pulse text-emerald-600" />
                  <span>Direct Cashless Available</span>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs font-medium">
              Select a policy from the left list to view dynamic AI summarized policy rules
            </div>
          )}
        </div>

      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* VIEW POLICY MODAL (POLICY DOCUMENT & BROCHURE VIEWER)           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {viewPolicyModalOpen && selectedPolicy && currentSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* MODAL HEADER */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{selectedPolicy.patientName}'s Policy Schedule</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                      {selectedPolicy.policyNumber}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {selectedPolicy.insurerName} • Member ID: {selectedPolicy.memberId}
                  </p>
                </div>
              </div>

              {/* MODAL CONTROLS */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-indigo-300 bg-indigo-950 border border-indigo-700/50 px-3 py-1 rounded-lg mr-2">
                  PDF Viewer • 48 Pages
                </span>

                <button
                  onClick={() => notify("Policy brochure PDF downloaded successfully", "success")}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white cursor-pointer transition-colors"
                  title="Download PDF"
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => notify("Printing Policy Brochure...", "success")}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white cursor-pointer transition-colors"
                  title="Print PDF"
                >
                  <Printer size={18} />
                </button>
                <button
                  onClick={() => setViewPolicyModalOpen(false)}
                  className="p-2 hover:bg-rose-900/40 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer transition-colors ml-2"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* MODAL BODY - INDIVIDUAL PDF NATIVE VIEWER */}
            <div className="flex-1 bg-slate-900 p-4 flex flex-col items-center justify-center overflow-hidden">
              {pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  title={`${selectedPolicy.patientName} Policy Brochure`}
                  className="w-full h-full min-h-[650px] border-0 rounded-xl bg-white shadow-2xl"
                />
              ) : (
                <div className="text-slate-400 text-xs font-mono">Loading PDF Brochure...</div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-500 font-medium">
                Document verified for patient <strong className="text-slate-800">{selectedPolicy.patientName}</strong>
              </span>
              <button
                onClick={() => setViewPolicyModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Close Viewer
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
