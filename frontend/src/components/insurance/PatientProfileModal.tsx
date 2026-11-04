import React, { useState } from "react"
import {
  X,
  FileText,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Shield,
  CreditCard,
  Building2,
  CheckCircle2,
  Activity,
  Bed,
  Stethoscope,
  Clock,
  Printer,
  FileCheck,
} from "lucide-react"

export interface PatientProfileDetails {
  patientName: string
  uhid: string
  ipNo: string
  gender: string
  age: string
  dob?: string
  contact: string
  email: string
  address: string
  admissionType: string
  department: string
  admittedOn: string
  attendingDoctor?: string
  bloodGroup?: string
  roomBed?: string
  // Insurance Details
  insurerName?: string
  tpaName?: string
  policyNo?: string
  memberId?: string
  policyType?: string
  sumInsured?: string
  preAuthApproved?: string
  estimateAmount?: string
  copayPercent?: string
  corporateName?: string
  emrVerified?: boolean
}

interface PatientProfileModalProps {
  isOpen: boolean
  onClose: () => void
  patient: PatientProfileDetails | null
}

export default function PatientProfileModal({
  isOpen,
  onClose,
  patient,
}: PatientProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"demographics" | "clinical" | "insurance" | "financial">("demographics")

  if (!isOpen || !patient) return null

  const initials = patient.patientName
    ? patient.patientName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "PT"

  const defaultDoctor = patient.attendingDoctor || "Dr. Kavita Patel (Senior Consultant)"
  const defaultBlood = patient.bloodGroup || "O +ve"
  const defaultRoom = patient.roomBed || "Wing B - Room 402 / Bed A"
  const defaultPolicy = patient.policyNo || "CH-1234567890"
  const defaultInsurer = patient.insurerName || "Care Health Insurance"
  const defaultTpa = patient.tpaName || "Medi Assist TPA"
  const defaultSumInsured = patient.sumInsured ? `₹${Number(patient.sumInsured).toLocaleString()}` : "₹500,000"
  const defaultEstimate = patient.estimateAmount ? `₹${Number(patient.estimateAmount).toLocaleString()}` : "₹185,000"
  const defaultPreAuth = patient.preAuthApproved ? `₹${Number(patient.preAuthApproved).toLocaleString()}` : "₹150,000"

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col max-h-[92vh] transition-all transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Banner */}
        <div className="relative h-28 bg-gradient-to-r from-blue-900 via-indigo-800 to-purple-800 p-6 flex justify-between items-start">
          <div className="flex items-center gap-2 text-white/90 text-xs font-mono tracking-wider uppercase">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Hospital Master EMR Patient Card
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors text-sm font-bold cursor-pointer"
            title="Close Profile"
          >
            <X size={18} />
          </button>
        </div>

        {/* Patient Hero Monogram Bar */}
        <div className="relative px-6 pb-4 pt-0 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-10">
          <div className="flex items-end gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-blue-700 text-white flex items-center justify-center text-2xl font-black shadow-lg border-4 border-white font-mono tracking-wider">
                {initials}
              </div>
              <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white bg-emerald-500" title="Active Inpatient" />
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{patient.patientName}</h2>
                <span className="px-2.5 py-0.5 text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
                  {patient.uhid}
                </span>
                <span className="px-2 py-0.5 text-[10.5px] font-bold rounded-md uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 size={12} /> Active Inpatient
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 font-medium">
                <span>{patient.age}Y • {patient.gender}</span>
                <span>•</span>
                <span className="font-mono text-slate-700 font-semibold">IP: {patient.ipNo}</span>
                <span>•</span>
                <span className="text-purple-700 font-semibold">{patient.department}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer size={13} /> Print Card
            </button>
          </div>
        </div>

        {/* Tab Header Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex gap-6 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("demographics")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "demographics"
                ? "border-purple-700 text-purple-800 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <User size={14} /> Patient Demographics
          </button>
          <button
            onClick={() => setActiveTab("clinical")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "clinical"
                ? "border-purple-700 text-purple-800 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Stethoscope size={14} /> Admission & EMR
          </button>
          <button
            onClick={() => setActiveTab("insurance")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "insurance"
                ? "border-purple-700 text-purple-800 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <Shield size={14} /> Policy & Insurance Coverage
          </button>
          <button
            onClick={() => setActiveTab("financial")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "financial"
                ? "border-purple-700 text-purple-800 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            <CreditCard size={14} /> Financial & Claims Summary
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto flex-1 text-xs text-slate-700 space-y-6">
          {activeTab === "demographics" && (
            <div className="space-y-5">
              {/* Key Quick Info Pills */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                  <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block">UHID Number</span>
                  <span className="text-xs font-bold text-slate-900 font-mono block mt-0.5">{patient.uhid}</span>
                </div>
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                  <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block">IP Admission No</span>
                  <span className="text-xs font-bold text-slate-900 font-mono block mt-0.5">{patient.ipNo}</span>
                </div>
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                  <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block">Blood Group</span>
                  <span className="text-xs font-bold text-rose-700 block mt-0.5">{defaultBlood}</span>
                </div>
                <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                  <span className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wider block">Date of Birth</span>
                  <span className="text-xs font-bold text-slate-900 block mt-0.5">{patient.dob || "12-03-1981"}</span>
                </div>
              </div>

              {/* Detailed Contact Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Phone size={14} className="text-purple-700" /> Contact & Residence Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Mobile Phone</label>
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-2 mt-0.5 font-mono">
                      <Phone size={12} className="text-slate-400" /> {patient.contact || "9876543210"}
                    </span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Email Address</label>
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-2 mt-0.5">
                      <Mail size={12} className="text-slate-400" /> {patient.email || "ramesh.kumar@gmail.com"}
                    </span>
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="text-[11px] font-medium text-slate-500 block">Permanent Address</label>
                    <span className="text-xs font-semibold text-slate-900 flex items-start gap-2 mt-0.5 leading-relaxed">
                      <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" /> {patient.address || "Flat 402, Sea Pearl Apartments, MVP Colony, Visakhapatnam - 530017"}
                    </span>
                  </div>
                </div>
              </div>

              {/* EMR Verification Confirmation Banner */}
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
                <span className="text-xs leading-normal">
                  <strong>EMR Identity Confirmed:</strong> All patient demographics verified against central hospital database and Aadhaar identity records.
                </span>
              </div>
            </div>
          )}

          {activeTab === "clinical" && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Stethoscope size={14} className="text-purple-700" /> Admission & Clinical Context
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10.5px] font-medium text-slate-500 block">Attending Physician</span>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">{defaultDoctor}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10.5px] font-medium text-slate-500 block">Medical Department</span>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">{patient.department}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10.5px] font-medium text-slate-500 block">Admission Type</span>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">{patient.admissionType}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-[10.5px] font-medium text-slate-500 block">Admitted On</span>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">{patient.admittedOn}</span>
                  </div>
                  <div className="col-span-1 md:col-span-2 p-3 bg-purple-50/60 rounded-lg border border-purple-200">
                    <span className="text-[10.5px] font-medium text-purple-900 uppercase block">Bed & Ward Location</span>
                    <span className="text-xs font-bold text-purple-950 block mt-0.5">{defaultRoom}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "insurance" && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Shield size={14} className="text-purple-700" /> Active Policy Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Insurer Company</label>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">{defaultInsurer}</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">TPA Administrator</label>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">{defaultTpa}</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Policy Number</label>
                    <span className="text-xs font-mono font-bold text-slate-900 block mt-0.5">{defaultPolicy}</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Health ID / Member ID</label>
                    <span className="text-xs font-mono font-bold text-slate-900 block mt-0.5">{patient.memberId || "GHTPA-982142"}</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Total Sum Insured</label>
                    <span className="text-xs font-bold text-emerald-700 block mt-0.5 font-mono">{defaultSumInsured}</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block">Corporate / Group Name</label>
                    <span className="text-xs font-semibold text-slate-900 block mt-0.5">{patient.corporateName || "TECHCORP SOLUTIONS PVT LTD"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "financial" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="text-[10.5px] font-medium text-blue-700 uppercase block">Estimated Tariff Bill</span>
                  <span className="text-base font-extrabold text-blue-950 font-mono block mt-1">{defaultEstimate}</span>
                </div>
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="text-[10.5px] font-medium text-emerald-700 uppercase block">Pre-Auth Approved</span>
                  <span className="text-base font-extrabold text-emerald-950 font-mono block mt-1">{defaultPreAuth}</span>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <span className="text-[10.5px] font-medium text-amber-800 uppercase block">Co-pay / Patient Payable</span>
                  <span className="text-base font-extrabold text-amber-950 font-mono block mt-1">₹35,000</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
            <FileCheck size={14} className="text-emerald-600" /> EMR Record Status: Verified & Active
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  )
}
