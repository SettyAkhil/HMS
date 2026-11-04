import React, { useState, useEffect } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  FileText,
  Shield,
  CheckCircle2,
  User,
  CreditCard,
  Trash2,
  Eye,
  Calendar,
  Search,
  RefreshCw,
  FileUp,
  UserPlus,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Plus,
  Phone,
  Mail,
  MapPin,
  Hash,
  Activity,
  Sparkles,
  QrCode,
  Bed,
  IdCard,
} from "lucide-react"
import { useNotify } from "./ui"
import PhoneInput from "../ui/PhoneInput"
import { InsuranceEngineService } from "../../services/insuranceDb"
import type { InsuranceCompanyConfig } from "../../types/insurance"
import PatientProfileModal from "./PatientProfileModal"

// Pure 0 border-radius field styles with crisp standard enterprise scale and subtle focus
const sqField = "h-9 px-3 bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 rounded-none w-full transition-colors shadow-xs"

export default function InsuranceIntakeView({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (caseId: string) => void
}) {
  const { notify, toastNode } = useNotify()
  const [step, setStep] = useState(1) // Step 1: Patient Identity & EMR, Step 2: Policy & Card Upload, Step 3: Verify & Handover
  const [patientModalOpen, setPatientModalOpen] = useState(false)

  // Search tab state
  const [searchTab, setSearchTab] = useState<"uhid" | "name" | "mobile" | "ip">("uhid")
  const [searchQuery, setSearchQuery] = useState("UH001256")

  // ── PATIENT DEMOGRAPHICS ──
  const [uhid, setUhid] = useState("UH001256")
  const [patientName, setPatientName] = useState("Ramesh Kumar")
  const [age, setAge] = useState("45")
  const [gender, setGender] = useState("Male")
  const [dob, setDob] = useState("12-03-1981")
  const [contact, setContact] = useState("9876543210")
  const [email, setEmail] = useState("ramesh.kumar@gmail.com")
  const [address, setAddress] = useState("Flat 402, Sea Pearl Apartments, MVP Colony, Visakhapatnam - 530017")
  const [admissionType, setAdmissionType] = useState<string>("Planned Surgical / Medical")
  const [ipNo, setIpNo] = useState("IP20250928012")
  const [department, setDepartment] = useState("General Surgery")
  const [admittedOn, setAdmittedOn] = useState("28 Sep 2026")

  // ── LOAD & LIVE-SYNC 30+ INSURERS FROM MASTER DATA ──
  const [masterInsurers, setMasterInsurers] = useState<InsuranceCompanyConfig[]>(() => InsuranceEngineService.getInsurers())
  useEffect(() => {
    const unsub = InsuranceEngineService.subscribe(() => {
      setMasterInsurers(InsuranceEngineService.getInsurers())
    })
    return unsub
  }, [])

  // ── INSURANCE & POLICY DETAILS ──
  const [insurerName, setInsurerName] = useState("Care Health Insurance")
  const [tpaName, setTpaName] = useState("Medi Assist TPA / Direct")
  const [policyNo, setPolicyNo] = useState("CH1234567890")
  const [memberId, setMemberId] = useState("GHTPA-982142")
  const [policyType, setPolicyType] = useState<"Corporate / Group" | "Individual" | "Floater">("Corporate / Group")
  const [relation, setRelation] = useState("Self")
  const [startDate, setStartDate] = useState("2026-01-01")
  const [endDate, setEndDate] = useState("2026-12-31")
  const [sumInsured, setSumInsured] = useState("500000")
  const [copayPercent, setCopayPercent] = useState("0")
  const [roomRentLimit, setRoomRentLimit] = useState("Single Private AC (No Capping)")
  const [corporate, setCorporate] = useState("TECHCORP SOLUTIONS PVT LTD")

  const [cardFileName, setCardFileName] = useState<string | null>("care_health_ecard_ramesh.jpg")
  const [cardFileSize, setCardFileSize] = useState<string | null>("245 KB")
  const [idProofFileName, setIdProofFileName] = useState<string | null>("aadhaar_ramesh_kumar.pdf")
  const [idProofFileSize, setIdProofFileSize] = useState<string | null>("420 KB")
  const [isScanningOcr, setIsScanningOcr] = useState(false)
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(99.4)
  
  // Brochure upload
  const [brochureFileName, setBrochureFileName] = useState<string | null>(null)
  const [isSummarizingBrochure, setIsSummarizingBrochure] = useState(false)
  const [brochureSummary, setBrochureSummary] = useState(false)


  // ── QUICK TEST CASES ──
  const samplePatients = [
    {
      uhid: "UH001256",
      name: "Ramesh Kumar",
      age: "45",
      gender: "Male",
      dob: "12-03-1981",
      phone: "9876543210",
      email: "ramesh.kumar@gmail.com",
      address: "Flat 402, Sea Pearl Apartments, MVP Colony, Visakhapatnam - 530017",
      ip: "IP20250928012",
      dept: "General Surgery",
      admission: "Planned Surgical / Medical",
      insurer: "Care Health Insurance",
      tpa: "Medi Assist TPA / Direct",
      policy: "CH1234567890",
      member: "GHTPA-982142",
      corporate: "TECHCORP SOLUTIONS PVT LTD",
      sum: "500000",
    },
    {
      uhid: "UH001257",
      name: "Priya Sharma",
      age: "34",
      gender: "Female",
      dob: "24-08-1992",
      phone: "9123456789",
      email: "priya.sharma@outlook.com",
      address: "Plot 88, Madhavadhara, Visakhapatnam - 530018",
      ip: "IP20250928015",
      dept: "Orthopaedics",
      admission: "Planned Surgical / Medical",
      insurer: "Star Health & Allied Insurance",
      tpa: "Star Health In-House TPA",
      policy: "SH8877665544",
      member: "STAR-992810",
      corporate: "INFOSYS TECHNOLOGIES LTD",
      sum: "750000",
    },
    {
      uhid: "UH001258",
      name: "Venkat Rao",
      age: "58",
      gender: "Male",
      dob: "05-11-1967",
      phone: "9988776655",
      email: "venkat.rao@corporate.in",
      address: "House 12, Gajuwaka Main Road, Visakhapatnam - 530026",
      ip: "IP20250928019",
      dept: "Cardiology",
      admission: "Emergency Admission",
      insurer: "HDFC ERGO General Insurance",
      tpa: "FHPL TPA Desk",
      policy: "HD9988771122",
      member: "FHPL-448102",
      corporate: "WIPRO ENTERPRISES",
      sum: "1000000",
    },
  ]

  const handleSelectSample = (p: typeof samplePatients[0]) => {
    setUhid(p.uhid)
    setSearchQuery(p.uhid)
    setPatientName(p.name)
    setAge(p.age)
    setGender(p.gender)
    setDob(p.dob)
    setContact(p.phone)
    setEmail(p.email)
    setAddress(p.address)
    setIpNo(p.ip)
    setDepartment(p.dept)
    setAdmissionType(p.admission)
    setInsurerName(p.insurer)
    setTpaName(p.tpa)
    setPolicyNo(p.policy)
    setMemberId(p.member)
    setCorporate(p.corporate)
    setSumInsured(p.sum)
    notify(`Loaded EMR records for ${p.name} (${p.uhid})`, "success")
  }

  const handleSimulateCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setCardFileName(file.name)
      setCardFileSize(`${Math.round(file.size / 1024)} KB`)
      setIsScanningOcr(true)
      setTimeout(() => {
        setIsScanningOcr(false)
        setOcrConfidence(99.4)
        notify(`Uploaded ${file.name} — OCR verified and extracted Policy & Member ID!`, "success")
      }, 900)
    }
  }

  const handleSimulateOcrScan = () => {
    setIsScanningOcr(true)
    setTimeout(() => {
      setIsScanningOcr(false)
      setOcrConfidence(99.4)
      notify("Medical AI OCR scan complete! 6 insurance parameters verified with 99.4% accuracy.", "success")
    }, 900)
  }

  const handleSubmit = () => {
    try {
      const claims = InsuranceEngineService.getClaims()
      const existing = claims[0]
      if (existing) {
        InsuranceEngineService.updatePolicy(existing.id, {
          insurerName,
          policyNumber: policyNo,
          memberId,
          sumInsured: parseInt(sumInsured) || 500000,
        })
        notify("Insurance intake registered & verified successfully!", "success")
        onComplete(existing.id)
      } else {
        notify("Intake registered & case created successfully", "success")
        onComplete("INS20250928056")
      }
    } catch (e) {
      notify((e as Error).message || "Failed to save intake", "error")
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f4f7fb] overflow-y-auto font-sans text-slate-800 rounded-none">
      {toastNode}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER & BREADCRUMB (SQUARED & ENHANCED SHADOW)        */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-300 px-6 py-4 sticky top-0 z-30 rounded-none shadow-md shadow-slate-200/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-none bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm shadow-blue-300">
              <IdCard size={22} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span className="hover:text-slate-700 cursor-pointer" onClick={onBack}>Home</span>
                <span>›</span>
                <span className="hover:text-slate-700 cursor-pointer">Insurance</span>
                <span>›</span>
                <span className="text-slate-900 font-bold">New Patient / Intake</span>
              </div>
              <div className="flex items-center gap-2.5 mt-0.5">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Patient Intake &amp; Card Capture
                </h1>
                <span className="px-2.5 py-0.5 rounded-none text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                  Registration Desk
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Search or create patient, capture insurance details and upload card for verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-sky-50 text-xs font-mono text-sky-800 border border-sky-200 shadow-xs">
              <Hash size={13} className="text-sky-600" />
              <span>Case ID:</span>
              <span className="font-bold text-sky-950">INS20250928056</span>
            </div>

            <button
              type="button"
              className="h-9 px-3.5 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow"
              onClick={() => notify("Intake draft saved successfully", "success")}
            >
              <FileText size={14} className="text-slate-500" /> Save Draft
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="h-9 px-4 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-500/20 hover:shadow-lg"
              >
                <span>Continue to Step {step + 1}</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                className="h-9 px-5 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-500/20 hover:shadow-lg"
              >
                <CheckCircle2 size={14} /> Save &amp; Generate Pre-Auth Form
              </button>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* HORIZONTAL STEPPER WITH ACTIVE UNDERLINE                   */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 max-w-5xl mx-auto pt-5 pb-1 text-xs">
          {[
            { n: 1, label: "Patient Identity & EMR", sub: "UHID, demographics, admission type" },
            { n: 2, label: "Policy & Card Upload", sub: "Upload TPA card, OCR scan, limits" },
            { n: 3, label: "Verify & Handover", sub: "Pre-eligibility & generate pre-auth form" },
          ].map((s, idx) => (
            <div
              key={s.n}
              onClick={() => setStep(s.n)}
              className="flex flex-col cursor-pointer group relative pb-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-none flex items-center justify-center font-bold text-xs transition-all border ${
                      step === s.n
                        ? "bg-blue-600 text-white border-blue-700 shadow-sm"
                        : step > s.n
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-slate-100 text-slate-500 border-slate-300 group-hover:bg-slate-200"
                    }`}
                  >
                    {step > s.n ? <Check size={14} /> : s.n}
                  </div>
                  <div>
                    <span
                      className={`font-bold block tracking-tight ${
                        step === s.n ? "text-slate-900" : "text-slate-600 group-hover:text-slate-900"
                      }`}
                    >
                      {s.label}
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:block">{s.sub}</span>
                  </div>
                </div>
                {idx < 2 && (
                  <ChevronRight size={16} className="text-slate-300 hidden md:block" />
                )}
              </div>
              {/* Active Step Indicator Underline */}
              {step === s.n && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. MAIN CONTENT (STEP 1: PATIENT IDENTITY & EMR)              */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* ══════════════════════════════════════════════════════════ */}
            {/* LEFT COLUMN: 8 COLS (SEARCH & PATIENT INFORMATION)         */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-8 space-y-6">
              {/* CARD 1: SEARCH EXISTING PATIENT (EMR) */}
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-none bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold">
                      <Search size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Search Existing Patient (EMR)</h2>
                      <p className="text-xs text-slate-500">Lookup by UHID, Patient Name, Mobile or IP number</p>
                    </div>
                  </div>

                  {/* Quick Test Cases Chips */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[11px] text-slate-500 font-semibold">Quick Test Cases:</span>
                    {samplePatients.map((p) => (
                      <button
                        key={p.uhid}
                        type="button"
                        onClick={() => handleSelectSample(p)}
                        className={`px-2.5 py-1 rounded-none font-mono text-[11px] border transition-all cursor-pointer shadow-2xs ${
                          uhid === p.uhid
                            ? "bg-blue-600 text-white border-blue-700 font-bold shadow-xs"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300"
                        }`}
                      >
                        {p.uhid}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Sub-Tabs */}
                <div className="space-y-3 pt-1 text-xs">
                  <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-semibold pb-1">
                    {[
                      { id: "uhid", label: "Search by UHID" },
                      { id: "name", label: "Search by Name" },
                      { id: "mobile", label: "Search by Mobile" },
                      { id: "ip", label: "Search by IP No." },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSearchTab(tab.id as any)}
                        className={`pb-2 transition-colors cursor-pointer relative ${
                          searchTab === tab.id
                            ? "text-blue-700 font-bold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {tab.label}
                        {searchTab === tab.id && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Big Search Input Field */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Search size={16} />
                      </div>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Enter UHID (e.g. UH001256)"
                        className="w-full h-11 pl-10 pr-4 bg-white border border-slate-300 rounded-none text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-blue-600 shadow-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const match = samplePatients.find(p => p.uhid.toLowerCase() === searchQuery.toLowerCase() || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        if (match) {
                          handleSelectSample(match)
                        } else {
                          notify(`Searched EMR database for "${searchQuery}"`, "success")
                        }
                      }}
                      className="h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-none flex items-center justify-center cursor-pointer transition-all shadow-md shadow-blue-500/20 hover:shadow-lg"
                      title="Search patient"
                    >
                      <Search size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* CARD 2: PATIENT INFORMATION FORM */}
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-none bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold">
                      <User size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Patient Information</h2>
                      <p className="text-xs text-slate-500">Enter basic patient details from EMR or register new patient</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      handleSelectSample(samplePatients[0])
                      notify("Patient details auto-populated from Hospital EMR!", "success")
                    }}
                    className="h-8 px-3 rounded-none bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <RefreshCw size={13} /> Auto Fill from EMR
                  </button>
                </div>

                <div className="space-y-4 pt-1 text-xs">
                  {/* Row 1: Name, UHID, IP No */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Full Patient Name <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <User size={14} />
                        </div>
                        <input
                          type="text"
                          value={patientName}
                          onChange={(e) => setPatientName(e.target.value)}
                          className={`${sqField} pl-9 font-bold text-slate-900`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Hospital UHID <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <Hash size={14} />
                        </div>
                        <input
                          type="text"
                          value={uhid}
                          onChange={(e) => setUhid(e.target.value)}
                          className={`${sqField} pl-9 font-mono font-bold text-blue-900`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        IP / Admission No.
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <FileText size={14} />
                        </div>
                        <input
                          type="text"
                          value={ipNo}
                          onChange={(e) => setIpNo(e.target.value)}
                          className={`${sqField} pl-9 font-mono font-semibold text-slate-800`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Age, Gender, DOB */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Age (Years) <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <Calendar size={14} />
                        </div>
                        <input
                          type="number"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          className={`${sqField} pl-9 font-bold`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Gender <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="h-9 px-3 bg-white border border-slate-300 rounded-none flex items-center gap-4 text-xs shadow-xs">
                        {["Male", "Female", "Other"].map((g) => (
                          <label key={g} className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                            <input
                              type="radio"
                              name="gender"
                              value={g}
                              checked={gender === g}
                              onChange={() => setGender(g)}
                              className="accent-blue-600"
                            />
                            <span>{g}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Date of Birth <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <Calendar size={14} />
                        </div>
                        <input
                          type="text"
                          value={dob}
                          onChange={(e) => setDob(e.target.value)}
                          className={`${sqField} pl-9 font-semibold`}
                          placeholder="DD-MM-YYYY"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Mobile, Email, Admission Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Mobile Contact <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <PhoneInput
                        value={contact}
                        onChange={setContact}
                        placeholder="98765 43210"
                      />
                    </div>

                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <Mail size={14} />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`${sqField} pl-9 font-medium`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                        Admission Type <span className="text-rose-500 ml-0.5">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                          <Bed size={14} />
                        </div>
                        <select
                          value={admissionType}
                          onChange={(e) => setAdmissionType(e.target.value)}
                          className={`${sqField} pl-9 pr-8 font-bold text-slate-900 appearance-none cursor-pointer`}
                        >
                          <option value="Planned Surgical / Medical">Planned Surgical / Medical</option>
                          <option value="Emergency Admission">Emergency Admission</option>
                          <option value="Daycare Procedure">Daycare Procedure</option>
                        </select>
                        <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Residential Address */}
                  <div>
                    <div className="h-5 flex items-center justify-between mb-1.5">
                      <label className="text-[11.5px] font-bold text-slate-700 block whitespace-nowrap">
                        Residential Address
                      </label>
                      <span className="text-[11px] text-slate-400 font-mono">56/200</span>
                    </div>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 pointer-events-none">
                        <MapPin size={14} />
                      </div>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className={`${sqField} pl-9 font-medium text-slate-800`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* RIGHT COLUMN: 4 COLS (REGISTER NEW & PATIENT SUMMARY)      */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-4 space-y-6">
              {/* CARD A: NO PATIENT FOUND? REGISTER NEW */}
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 z-10 max-w-[210px]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-none bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold">
                        <UserPlus size={16} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">No Patient Found?</h3>
                    </div>
                    <p className="text-xs text-slate-500 pt-1">
                      Create a new patient and proceed with insurance intake.
                    </p>
                    <div className="pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          const nextId = `UH${Math.floor(100000 + Math.random() * 900000)}`
                          const nextIp = `IP2025${Math.floor(10000000 + Math.random() * 90000000)}`
                          setUhid(nextId)
                          setIpNo(nextIp)
                          setPatientName("")
                          setAge("")
                          setContact("")
                          setEmail("")
                          setAddress("")
                          notify(`Created new EMR intake profile: ${nextId}`, "success")
                        }}
                        className="h-8 px-3.5 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow"
                      >
                        <Plus size={14} /> Register New Patient
                      </button>
                    </div>
                  </div>

                  {/* Decorative Card Illustration on Right */}
                  <div className="w-20 h-24 bg-gradient-to-br from-emerald-50 to-teal-100 rounded-none border border-emerald-200 p-2 flex flex-col justify-between items-center shadow-sm shrink-0">
                    <div className="w-8 h-8 rounded-none bg-emerald-200/70 border border-emerald-300 flex items-center justify-center text-emerald-800">
                      <User size={16} />
                    </div>
                    <div className="w-full space-y-1">
                      <div className="w-full h-1.5 bg-emerald-200" />
                      <div className="w-3/4 h-1.5 bg-emerald-200/70" />
                    </div>
                    <div className="w-5 h-5 rounded-none bg-emerald-700 text-white flex items-center justify-center self-end -mr-1 -mb-1 shadow-xs">
                      <Plus size={12} />
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD B: PATIENT SUMMARY CARD */}
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-none bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
                      <FileText size={16} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Patient Summary Card</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientModalOpen(true)}
                    className="text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <ExternalLink size={13} /> View Full Profile
                  </button>
                </div>

                {/* Patient Monogram Avatar & Header */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-none bg-blue-700 text-white font-black text-sm flex items-center justify-center font-mono shadow-sm shadow-blue-300 shrink-0">
                    {patientName ? patientName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "PT"}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{patientName || "New Patient"}</h4>
                      <span className="text-xs text-slate-500 font-semibold">{age}Y</span>
                      <span className="text-xs text-slate-500 font-semibold">{gender}</span>
                      <span className="px-2 py-0.5 rounded-none bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[10.5px] flex items-center gap-1">
                        <Check size={11} /> Active Patient
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      UHID: <strong className="text-slate-800">{uhid}</strong> <span className="text-slate-300">|</span> IP No: <strong className="text-slate-800">{ipNo}</strong>
                    </div>
                  </div>
                </div>

                {/* 2-Column Summary Details */}
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Mobile</span>
                    <span className="font-semibold text-slate-900 font-mono">{contact || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Admission Type</span>
                    <span className="font-semibold text-slate-900">{admissionType.split(" ")[0]}</span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Email</span>
                    <span className="font-medium text-slate-800 truncate block max-w-[130px]" title={email}>{email || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Department</span>
                    <span className="font-semibold text-slate-900">{department}</span>
                  </div>

                  <div className="col-span-2">
                    <span className="text-[11px] text-slate-400 block font-medium">Address</span>
                    <span className="font-medium text-slate-800 leading-snug">{address || "—"}</span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Admitted On</span>
                    <span className="font-semibold text-slate-900">{admittedOn}</span>
                  </div>
                </div>

                {/* Verification Confirmation Callout */}
                <div className="p-3 bg-emerald-50 rounded-none border border-emerald-300 text-xs text-emerald-900 flex items-start gap-2.5 shadow-xs">
                  <CheckCircle2 size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                  <span className="text-xs leading-relaxed text-emerald-900">
                    Patient details verified from EMR. Proceed to next step for insurance and card upload.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────── */}
          {/* BOTTOM ACTION BAR                                           */}
          {/* ─────────────────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-300/80 rounded-none p-4 flex flex-wrap items-center justify-between gap-3 shadow-md shadow-slate-200/60">
            <button
              type="button"
              onClick={onBack}
              className="h-9 px-4 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow"
            >
              <ArrowLeft size={14} /> Cancel
            </button>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="h-10 px-6 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20 hover:shadow-lg"
            >
              <span>Next: Policy &amp; Card Upload</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. STEP 2: POLICY & INSURANCE CARD UPLOAD WITH AI OCR         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="p-6 max-w-[1600px] mx-auto w-full space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column (7 cols): Insurer & Policy Limits */}
            <div className="lg:col-span-7 space-y-6">
              {/* Select Insurer Partner Card */}
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-none bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
                      <Shield size={18} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Select Insurance Partner</h3>
                  </div>
                  <span className="text-xs text-emerald-900 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-none border border-emerald-300">
                    ✓ Tier-1 Cashless Empanelled
                  </span>
                </div>

                {/* Quick 4 Popular Partner Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { name: "Care Health Insurance", tpa: "Medi Assist TPA / Direct", badge: "CARE" },
                    { name: "Good Health Insurance TPA", tpa: "GHPL Cashless Desk", badge: "GHPL" },
                    { name: "Star Health & Allied Insurance", tpa: "In-House TPA", badge: "STAR" },
                    { name: "HDFC ERGO General Insurance", tpa: "FHPL TPA", badge: "HDFC" },
                  ].map((ins) => (
                    <button
                      key={ins.name}
                      type="button"
                      onClick={() => {
                        setInsurerName(ins.name)
                        setTpaName(ins.tpa)
                        notify(`Selected ${ins.name}`, "success")
                      }}
                      className={`p-3 rounded-none border text-left transition-all cursor-pointer shadow-xs ${
                        insurerName.toLowerCase().includes(ins.badge.toLowerCase()) || insurerName === ins.name
                          ? "bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-sm"
                          : "bg-white border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-black text-slate-900 text-xs font-mono">{ins.badge}</div>
                      <div className="text-[11px] font-bold text-slate-700 truncate mt-0.5">{ins.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{ins.tpa}</div>
                    </button>
                  ))}
                </div>

                {/* Form Fields for Insurer & Policy */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Insurance Company (Master Data) <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={insurerName}
                        onChange={(e) => {
                          setInsurerName(e.target.value)
                          const matched = masterInsurers.find(i => i.companyName === e.target.value)
                          if (matched?.tpaName) setTpaName(matched.tpaName)
                        }}
                        className={`${sqField} font-bold pr-8 appearance-none`}
                      >
                        {masterInsurers.map((ins) => (
                          <option key={ins.id} value={ins.companyName}>
                            {ins.companyName} ({ins.companyCode})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      TPA Processing Desk <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      value={tpaName}
                      onChange={(e) => setTpaName(e.target.value)}
                      className={sqField}
                    />
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Policy / Card Number <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      value={policyNo}
                      onChange={(e) => setPolicyNo(e.target.value)}
                      className={`${sqField} font-mono font-bold text-blue-900`}
                    />
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      TPA Card ID / Member ID <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      value={memberId}
                      onChange={(e) => setMemberId(e.target.value)}
                      className={`${sqField} font-mono font-bold text-slate-900`}
                    />
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Policy Type
                    </label>
                    <select
                      value={policyType}
                      onChange={(e) => setPolicyType(e.target.value as any)}
                      className={`${sqField} font-semibold`}
                    >
                      <option value="Corporate / Group">Corporate / Group</option>
                      <option value="Individual">Individual Retail</option>
                      <option value="Floater">Family Floater</option>
                    </select>
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Corporate / Employer Name
                    </label>
                    <input
                      type="text"
                      value={corporate}
                      onChange={(e) => setCorporate(e.target.value)}
                      className={`${sqField} font-semibold`}
                    />
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Total Sum Insured (₹) <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      type="text"
                      value={sumInsured}
                      onChange={(e) => setSumInsured(e.target.value)}
                      className={`${sqField} font-mono font-bold text-emerald-800`}
                    />
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Policy Validity Expiry <span className="text-rose-500 ml-0.5">*</span>
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={sqField}
                    />
                  </div>
                </div>
              </div>

              {/* Policy Limits & Co-pay */}
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 flex items-center gap-2">
                  <Activity size={16} className="text-blue-700" /> Capping &amp; Co-Pay Clauses
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Co-Payment (% Patient Share)
                    </label>
                    <select
                      value={copayPercent}
                      onChange={(e) => setCopayPercent(e.target.value)}
                      className={sqField}
                    >
                      <option value="0">0% Co-Pay (Full Coverage)</option>
                      <option value="10">10% Co-Pay</option>
                      <option value="15">15% Co-Pay</option>
                      <option value="20">20% Co-Pay</option>
                    </select>
                  </div>

                  <div>
                    <label className="h-5 flex items-center text-[11.5px] font-bold text-slate-700 mb-1.5 whitespace-nowrap truncate">
                      Room Category Capping
                    </label>
                    <select
                      value={roomRentLimit}
                      onChange={(e) => setRoomRentLimit(e.target.value)}
                      className={sqField}
                    >
                      <option value="Single Private AC (No Capping)">Single Private AC (No Capping)</option>
                      <option value="1% of Sum Insured (₹5,000/day)">1% of Sum Insured (₹5,000/day)</option>
                      <option value="Semi-Private Twin Sharing">Semi-Private Twin Sharing</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Dual File Upload Dropzone & OCR */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-slate-300/80 rounded-none p-5 shadow-md shadow-slate-200/60 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-none bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
                      <FileUp size={18} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">Card Upload &amp; OCR Engine</h3>
                  </div>
                  {ocrConfidence && (
                    <span className="text-xs font-mono text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-none border border-emerald-300 font-bold">
                      OCR: {ocrConfidence}% Match
                    </span>
                  )}
                </div>

                {/* 1. Insurance Card Upload Box */}
                <div className="space-y-1.5">
                  <label className="h-5 flex items-center justify-between text-[11.5px] font-bold text-slate-700">
                    <span>1. Physical TPA Card / E-Card <span className="text-rose-500">*</span></span>
                    {cardFileName && <span className="text-emerald-700 font-bold text-xs">✓ Uploaded</span>}
                  </label>

                  {cardFileName ? (
                    <div className="p-3 bg-blue-50/70 border border-blue-300 rounded-none flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <CreditCard size={20} className="text-blue-700 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900 font-mono text-xs">{cardFileName}</div>
                          <div className="text-[11px] text-slate-500">{cardFileSize} · Verified with Medical OCR</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => notify("Card preview opened", "success")}
                          className="p-1 hover:bg-blue-100 text-blue-700 rounded-none cursor-pointer"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCardFileName(null)}
                          className="p-1 hover:bg-rose-100 text-rose-600 rounded-none cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-none p-5 flex flex-col items-center justify-center cursor-pointer bg-blue-50/30 hover:bg-blue-50/60 transition-colors text-center shadow-xs">
                      <Upload size={22} className="text-blue-600 mb-1.5" />
                      <span className="text-xs font-bold text-blue-900">Click to Upload TPA Card / E-Card</span>
                      <span className="text-[11px] text-slate-500 mt-0.5">JPG, PNG, PDF up to 10 MB</span>
                      <input type="file" accept="image/*,.pdf" onChange={handleSimulateCardUpload} className="hidden" />
                    </label>
                  )}
                </div>

                {/* 2. Patient ID Proof Upload Box */}
                <div className="space-y-1.5 pt-1">
                  <label className="h-5 flex items-center justify-between text-[11.5px] font-bold text-slate-700">
                    <span>2. Patient ID Proof (Aadhaar / PAN Card) <span className="text-rose-500">*</span></span>
                    {idProofFileName && <span className="text-emerald-700 font-bold text-xs">✓ Uploaded</span>}
                  </label>

                  {idProofFileName ? (
                    <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-none flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <FileText size={20} className="text-emerald-700 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900 font-mono text-xs">{idProofFileName}</div>
                          <div className="text-[11px] text-slate-500">{idProofFileSize} · KYC ID Verified</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => notify("ID Proof preview opened", "success")}
                          className="p-1 hover:bg-emerald-100 text-emerald-700 rounded-none cursor-pointer"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIdProofFileName(null)}
                          className="p-1 hover:bg-rose-100 text-rose-600 rounded-none cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-slate-300 hover:border-slate-400 rounded-none p-5 flex flex-col items-center justify-center cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors text-center shadow-xs">
                      <Upload size={22} className="text-slate-500 mb-1.5" />
                      <span className="text-xs font-bold text-slate-800">Upload Aadhaar / PAN PDF</span>
                      <span className="text-[11px] text-slate-500 mt-0.5">Mandatory for KYC identification</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setIdProofFileName(e.target.files[0].name)
                            setIdProofFileSize("380 KB")
                            notify("Aadhaar ID Proof uploaded!", "success")
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* 3. Insurance Brochure Upload Box */}
                <div className="space-y-1.5 pt-1">
                  <label className="h-5 flex items-center justify-between text-[11.5px] font-bold text-slate-700">
                    <span>3. Insurance Policy Brochure PDF <span className="text-slate-400 font-normal">(Optional)</span></span>
                    {brochureFileName && <span className="text-emerald-700 font-bold text-xs">✓ Uploaded</span>}
                  </label>

                  {brochureFileName ? (
                    <div className="p-3 bg-indigo-50/70 border border-indigo-300 rounded-none flex items-center justify-between text-xs shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <FileText size={20} className="text-indigo-700 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900 font-mono text-xs">{brochureFileName}</div>
                          <div className="text-[11px] text-slate-500">{isSummarizingBrochure ? "Hosp AI is summarizing..." : brochureSummary ? "AI Summary Ready" : "4.2 MB"}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setBrochureFileName(null)}
                          className="p-1 hover:bg-rose-100 text-rose-600 rounded-none cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-indigo-300 hover:border-indigo-400 rounded-none p-5 flex flex-col items-center justify-center cursor-pointer bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors text-center shadow-xs">
                      <Upload size={22} className="text-indigo-500 mb-1.5" />
                      <span className="text-xs font-bold text-indigo-900">Upload Brochure PDF</span>
                      <span className="text-[11px] text-slate-500 mt-0.5">Extract room rent, co-pays &amp; rules automatically</span>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setBrochureFileName(e.target.files[0].name)
                            setIsSummarizingBrochure(true)
                            notify("Brochure uploaded! AI is analyzing...", "success")
                            setTimeout(() => {
                              setIsSummarizingBrochure(false)
                              setBrochureSummary(true)
                              notify("Hosp AI has extracted policy limits!", "success")
                            }, 2500)
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* AI Extracted Rules Display */}
                {brochureSummary && (
                  <div className="mt-4 bg-indigo-50/50 border border-indigo-200 rounded-none p-4 space-y-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-2 border-b border-indigo-100 pb-2">
                      <Sparkles size={16} className="text-indigo-600" />
                      <h4 className="text-xs font-bold text-indigo-900">Extracted Policy Rules</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="font-semibold text-slate-500 mb-0.5">Room Rent Limit</div>
                        <div className="font-bold text-slate-900">1% of Sum Insured (Single AC)</div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-500 mb-0.5">Co-Pay</div>
                        <div className="font-bold text-slate-900">10% Mandatory</div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-500 mb-0.5">Specific Waiting</div>
                        <div className="font-bold text-slate-900">24 Months</div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-500 mb-0.5">Maternity</div>
                        <div className="font-bold text-rose-600">Not Covered</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Digital Card Preview Box */}
                <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white rounded-none p-4 shadow-lg shadow-slate-900/30 space-y-3 border border-slate-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 rounded-none text-[10px] tracking-wider inline-block">
                        {insurerName.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-slate-300 mt-1">CASHLESS HEALTH INSURANCE CARD</div>
                    </div>
                    <div className="w-8 h-8 bg-white p-0.5 rounded-none shrink-0 flex items-center justify-center">
                      <QrCode size={26} className="text-slate-900" />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs font-mono pt-1">
                    <div><span className="text-slate-400 text-[11px]">Policy No:</span> <span className="font-bold text-white">{policyNo}</span></div>
                    <div><span className="text-slate-400 text-[11px]">TPA Card ID:</span> <span className="font-bold text-white">{memberId}</span></div>
                    <div><span className="text-slate-400 text-[11px]">Insured:</span> <span className="font-bold text-amber-300">{patientName}</span></div>
                    <div><span className="text-slate-400 text-[11px]">Sum Insured:</span> <span className="font-bold text-emerald-400">₹ {parseInt(sumInsured).toLocaleString()}</span></div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isScanningOcr}
                  onClick={handleSimulateOcrScan}
                  className="w-full h-9 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-500/20 hover:shadow-lg"
                >
                  {isScanningOcr ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Scanning with Medical AI OCR...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} /> Re-scan Card with AI OCR
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-300">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-9 px-4 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all cursor-pointer shadow-sm hover:shadow"
            >
              ← Back to Patient Identity
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="h-10 px-6 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20 hover:shadow-lg"
            >
              <span>Next: Review &amp; Handover</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. STEP 3: VERIFY & HANDOVER TO PRE-AUTHORIZATION             */}
      {/* ───────────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
          <div className="bg-white border border-slate-300/80 rounded-none p-6 space-y-5 shadow-md shadow-slate-200/60">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-none bg-emerald-50 border border-emerald-300 text-emerald-700 flex items-center justify-center font-bold text-xl shadow-xs">
                  <CheckCircle2 size={26} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">INTAKE &amp; CASHLESS PRE-ELIGIBILITY CONFIRMED</div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-0.5">
                    <span>{patientName}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-none bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold">
                      {insurerName}
                    </span>
                  </h2>
                </div>
              </div>

              <span className="text-xs font-bold text-emerald-900 bg-emerald-50 px-3 py-1.5 rounded-none border border-emerald-300 shadow-2xs">
                ✓ Eligibility Verified
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-slate-50 p-4 rounded-none border border-slate-200 shadow-2xs">
              <div>
                <span className="text-slate-500 font-bold text-[10.5px] uppercase block">UHID / IP Ref</span>
                <div className="font-bold text-slate-900 font-mono text-xs mt-0.5">{uhid} / {ipNo}</div>
              </div>
              <div>
                <span className="text-slate-500 font-bold text-[10.5px] uppercase block">TPA Card ID</span>
                <div className="font-bold text-slate-900 font-mono text-xs mt-0.5">{memberId}</div>
              </div>
              <div>
                <span className="text-slate-500 font-bold text-[10.5px] uppercase block">Sum Insured</span>
                <div className="font-bold text-emerald-800 font-mono text-xs mt-0.5">₹ {parseInt(sumInsured).toLocaleString()}</div>
              </div>
              <div>
                <span className="text-slate-500 font-bold text-[10.5px] uppercase block">Card &amp; ID Proof</span>
                <div className="font-bold text-emerald-700 text-xs mt-0.5">✓ Verified with OCR</div>
              </div>
            </div>

            {/* Handover Callout */}
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-none flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="text-xs font-bold text-sky-900 flex items-center gap-1.5">
                  <Sparkles size={15} className="text-sky-700" /> Ready to Formulate Pre-Authorization Requisition
                </div>
                <p className="text-xs text-slate-600">
                  All demographic fields, TPA card verification, and policy limits are captured. Proceed to generate the official <strong className="text-slate-900">{insurerName} 4-Page Pre-Auth Requisition</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                className="h-10 px-5 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20 hover:shadow-lg"
              >
                <span>Generate Pre-Auth Form</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-300">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="h-9 px-4 rounded-none bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all cursor-pointer shadow-sm hover:shadow"
            >
              ← Back to Card &amp; Policy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="h-9 px-5 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-500/20 hover:shadow-lg"
            >
              <Check size={14} /> Save Intake &amp; Open Pre-Auth Desk
            </button>
          </div>
        </div>
      )}

      {/* Patient Profile Pop-Up Card Modal */}
      <PatientProfileModal
        isOpen={patientModalOpen}
        onClose={() => setPatientModalOpen(false)}
        patient={{
          patientName,
          uhid,
          ipNo,
          gender,
          age,
          dob,
          contact,
          email,
          address,
          admissionType,
          department,
          admittedOn,
          insurerName,
          tpaName,
          policyNo,
          memberId,
          policyType,
          sumInsured,
          corporateName: corporate,
        }}
      />
    </div>
  )
}
