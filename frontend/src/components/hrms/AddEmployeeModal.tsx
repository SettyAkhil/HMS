import React, { useState } from "react"
import PhoneInput from "../ui/PhoneInput"
import {
  HrmsDatabase,
  StaffCategory,
  EmploymentType,
  ShiftType,
  StaffMember,
} from "../../services/hrmsDb"
import {
  X,
  UserPlus,
  Building2,
  Stethoscope,
  ShieldCheck,
  CreditCard,
  Phone,
  Check,
  Calendar,
  Mail,
  MapPin,
  ChevronRight,
  ChevronLeft,
  Award,
  Wallet,
  AlertCircle,
  FileText,
} from "lucide-react"

interface AddEmployeeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (newStaff: StaffMember) => void
  editStaff?: StaffMember | null
}

const DEPARTMENTS = [
  "Cardiology",
  "Orthopedics",
  "Emergency",
  "Nursing",
  "ICU",
  "Surgery",
  "Pediatrics",
  "Radiology",
  "Laboratory",
  "Pharmacy",
  "Gastroenterology",
  "Administration",
  "Support Staff",
]

const CATEGORIES: StaffCategory[] = [
  "Doctor",
  "Nursing",
  "Allied Health",
  "Administrative",
  "Support Staff",
]

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "Full-Time",
  "Part-Time",
  "Consultant",
  "Contract",
  "Resident",
]

const SHIFTS: ShiftType[] = [
  "Morning (07:00 - 15:00)",
  "Evening (15:00 - 23:00)",
  "Night (23:00 - 07:00)",
  "General (09:00 - 17:30)",
  "On-Call",
]

type StepId = "general" | "role" | "compensation" | "contact"

interface WizardStep {
  id: StepId
  stepNum: number
  title: string
  subtitle: string
  icon: React.ElementType
}

const STEPS: WizardStep[] = [
  { id: "general", stepNum: 1, title: "Personal & Identity", subtitle: "Basic demographic info", icon: Stethoscope },
  { id: "role", stepNum: 2, title: "Role & Licensure", subtitle: "Designation & credentials", icon: Building2 },
  { id: "compensation", stepNum: 3, title: "Payroll & Leave Quota", subtitle: "Salary structure & leave quotas", icon: CreditCard },
  { id: "contact", stepNum: 4, title: "Emergency & Finish", subtitle: "Next-of-kin & protocol", icon: Phone },
]

function AddEmployeeModalBody({
  isOpen,
  onClose,
  onSuccess,
  editStaff,
}: AddEmployeeModalProps) {

  const [activeTab, setActiveTab] = useState<StepId>("general")

  // Form State - Step 1: Personal
  const [name, setName] = useState(editStaff ? editStaff.name : "")
  const [gender, setGender] = useState<"Male" | "Female" | "Other">(editStaff ? editStaff.gender : "Male")
  const [dob, setDob] = useState(editStaff ? editStaff.dob : "1990-01-01")
  const [bloodGroup, setBloodGroup] = useState(editStaff ? editStaff.bloodGroup : "O+")
  const [email, setEmail] = useState(editStaff ? editStaff.email : "")
  const [phone, setPhone] = useState(editStaff ? editStaff.phone : "")
  const [address, setAddress] = useState(editStaff?.address || "")

  // Form State - Step 2: Role & Credentials
  const [department, setDepartment] = useState(editStaff ? editStaff.department : "Cardiology")
  const [designation, setDesignation] = useState(editStaff ? editStaff.designation : "")
  const [category, setCategory] = useState<StaffCategory>(editStaff ? editStaff.category : "Doctor")
  const [employmentType, setEmploymentType] = useState<EmploymentType>(editStaff ? editStaff.employmentType : "Full-Time")
  const [shift, setShift] = useState<ShiftType>(editStaff ? editStaff.shift : "Morning (07:00 - 15:00)")
  const [joiningDate, setJoiningDate] = useState(editStaff ? editStaff.joiningDate : new Date().toISOString().split("T")[0])
  const [qualification, setQualification] = useState(editStaff ? editStaff.qualification : "")
  const [licenseNumber, setLicenseNumber] = useState(editStaff ? editStaff.licenseNumber : "")
  const [licenseExpiry, setLicenseExpiry] = useState(editStaff ? editStaff.licenseExpiry : "2028-12-31")

  // Form State - Step 3: Compensation & Leave Quota
  const [basic, setBasic] = useState<number>(editStaff?.salary?.basic ?? 0)
  const [hra, setHra] = useState<number>(editStaff?.salary?.hra ?? 0)
  const [allowances, setAllowances] = useState<number>(editStaff?.salary?.allowances ?? 0)
  const [pf, setPf] = useState<number>(editStaff?.salary?.pf ?? 0)
  const [tax, setTax] = useState<number>(editStaff?.salary?.tax ?? 0)
  const [autoCalculateSalary, setAutoCalculateSalary] = useState<boolean>(!editStaff)

  const [bankName, setBankName] = useState(editStaff?.bankDetails?.bankName ?? "HDFC Bank")
  const [accountNo, setAccountNo] = useState(editStaff?.bankDetails?.accountNo ?? "")
  const [ifsc, setIfsc] = useState(editStaff?.bankDetails?.ifsc ?? "HDFC0001824")
  const [pan, setPan] = useState(editStaff?.bankDetails?.pan ?? "")

  // Form State - Annual Leave Quota Assignment (Days / Year)
  const [casualQuota, setCasualQuota] = useState<number>(editStaff?.leaveBalance?.casual ?? 12)
  const [sickQuota, setSickQuota] = useState<number>(editStaff?.leaveBalance?.sick ?? 10)
  const [earnedQuota, setEarnedQuota] = useState<number>(editStaff?.leaveBalance?.earned ?? 15)

  // Form State - Step 4: Emergency
  const [emName, setEmName] = useState(editStaff ? editStaff.emergencyContact.name : "")
  const [emRelation, setEmRelation] = useState(editStaff ? editStaff.emergencyContact.relation : "Spouse")
  const [emPhone, setEmPhone] = useState(editStaff ? editStaff.emergencyContact.phone : "")

  // Real-time enterprise statutory salary auto-calculation
  const handleBasicSalaryChange = (newBasic: number) => {
    setBasic(newBasic)
    if (autoCalculateSalary) {
      const calculatedHra = Math.round(newBasic * 0.40)
      const calculatedAllowances = Math.round(newBasic * 0.15)
      const calculatedPf = Math.round(newBasic * 0.12)
      const calculatedGross = newBasic + calculatedHra + calculatedAllowances
      const calculatedTax = Math.round(calculatedGross * 0.10)

      setHra(calculatedHra)
      setAllowances(calculatedAllowances)
      setPf(calculatedPf)
      setTax(calculatedTax)
    }
  }

  const grossPay = basic + hra + allowances
  const totalDeductions = pf + tax
  const netPay = Math.max(0, grossPay - totalDeductions)

  const getInitials = (fullName: string) => {
    const parts = fullName.replace(/^(Dr\.|Sister|Mr\.|Mrs\.|Ms\.)\s*/i, "").trim().split(" ")
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return fullName.slice(0, 2).toUpperCase()
  }

  const currentStepIndex = STEPS.findIndex((s) => s.id === activeTab)
  const progressPercent = Math.round(((currentStepIndex + 1) / STEPS.length) * 100)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setActiveTab("general")
      alert("Please enter the employee full name")
      return
    }

    const payload = {
      name: name.trim(),
      gender,
      dob,
      bloodGroup,
      email: email.trim() || `${name.toLowerCase().replace(/[^a-z]/g, "")}@imperialhospitals.org`,
      phone: phone.trim() || "+91 98480 00000",
      avatarInitials: getInitials(name),
      department,
      designation: designation.trim() || `${category} - ${department}`,
      category,
      employmentType,
      status: editStaff ? editStaff.status : ("Active" as const),
      dutyStatus: editStaff ? editStaff.dutyStatus : ("On Duty" as const),
      shift,
      joiningDate,
      qualification: qualification.trim() || "MBBS / Allied Health Degree",
      licenseNumber: licenseNumber.trim() || "MCI-PENDING",
      licenseExpiry,
      emergencyContact: {
        name: emName || "Primary Contact",
        relation: emRelation || "Relative",
        phone: emPhone || "+91 98480 00000",
      },
      address: address.trim() || "Hyderabad, Telangana",
      salary: {
        basic,
        hra,
        allowances,
        pf,
        tax,
        netPay,
      },
      bankDetails: {
        accountNo,
        ifsc,
        bankName,
        pan,
      },
      leaveBalance: {
        casual: casualQuota,
        casualUsed: editStaff?.leaveBalance?.casualUsed ?? 0,
        sick: sickQuota,
        sickUsed: editStaff?.leaveBalance?.sickUsed ?? 0,
        earned: earnedQuota,
        earnedUsed: editStaff?.leaveBalance?.earnedUsed ?? 0,
      },
    }

    if (editStaff) {
      const updated = HrmsDatabase.updateStaff(editStaff.id, payload)
      if (updated && onSuccess) onSuccess(updated)
    } else {
      const created = HrmsDatabase.addStaff(payload)
      if (onSuccess) onSuccess(created)
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F172A]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#DDE2EC] w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Clinical Header */}
        <div className="px-6 py-4 bg-[#1B4FD8] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shadow-2xs">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  {editStaff ? "Edit Employee Profile" : "Register New Hospital Employee"}
                </h2>
                <span className="text-[11px] font-semibold bg-white/20 px-2 py-0.5 rounded-full text-blue-100">
                  Step {currentStepIndex + 1} of 4
                </span>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5">
                {editStaff ? `Updating staff record ${editStaff.id} • ${editStaff.department}` : "Clinical onboarding, duty scheduling & regulatory credentialing"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
            title="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard Progress Indicator Bar */}
        <div className="bg-[#F8FAFC] border-b border-[#DDE2EC] px-6 py-3">
          <div className="grid grid-cols-4 gap-2">
            {STEPS.map((step, idx) => {
              const IconComp = step.icon
              const isCurrent = activeTab === step.id
              const isPast = idx < currentStepIndex
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveTab(step.id)}
                  className={`flex items-center gap-2.5 p-1.5 rounded-lg transition-all text-left cursor-pointer ${
                    isCurrent
                      ? "bg-white border border-[#BFDBFE] shadow-2xs"
                      : "hover:bg-slate-200/50"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors flex-shrink-0 ${
                      isPast
                        ? "bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]"
                        : isCurrent
                          ? "bg-[#1B4FD8] text-white shadow-2xs"
                          : "bg-[#E2E8F0] text-[#64748B]"
                    }`}
                  >
                    {isPast ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : step.stepNum}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-xs font-bold truncate leading-tight ${
                        isCurrent ? "text-[#1B4FD8]" : isPast ? "text-[#0F172A]" : "text-[#64748B]"
                      }`}
                    >
                      {step.title}
                    </div>
                    <div className="text-[10px] text-[#94A3B8] truncate hidden sm:block">
                      {step.subtitle}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Linear Progress Track */}
          <div className="w-full bg-[#E2E8F0] h-1 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-[#1B4FD8] h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 bg-white">
          {/* STEP 1: Personal & Basic Info */}
          {activeTab === "general" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-3 text-xs text-[#1B4FD8] flex items-center gap-2">
                <Stethoscope className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>Hospital Workforce Enrollment:</strong> Provide standard personnel details as per official government identification.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Full Name (with Professional Title) <span className="text-[#DC2626] font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. P. R. K. Varma / Sister Jessica Carter"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none transition-all placeholder:text-[#94A3B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Blood Group</label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  >
                    {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Hospital Email</label>
                  <input
                    type="email"
                    placeholder="doctor@imperialhospitals.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none transition-all placeholder:text-[#94A3B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Primary Mobile Phone <span className="text-[#DC2626] font-bold">*</span>
                  </label>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    placeholder="98480 12345"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Residential Address</label>
                  <input
                    type="text"
                    placeholder="Plot/Flat, Street, City"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none transition-all placeholder:text-[#94A3B8]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Hospital Role & Regulatory Credentials */}
          {activeTab === "role" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Clinical Department <span className="text-[#DC2626] font-bold">*</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Staff Category <span className="text-[#DC2626] font-bold">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Official Designation <span className="text-[#DC2626] font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Consultant / Head ICU Nurse"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none transition-all placeholder:text-[#94A3B8]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as any)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  >
                    {EMPLOYMENT_TYPES.map((et) => (
                      <option key={et} value={et}>
                        {et}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Primary Shift Assignment</label>
                  <select
                    value={shift}
                    onChange={(e) => setShift(e.target.value as any)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  >
                    {SHIFTS.map((sh) => (
                      <option key={sh} value={sh}>
                        {sh}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">Date of Joining</label>
                  <input
                    type="date"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                  />
                </div>
              </div>

              {/* Regulatory Licensure Card */}
              <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#1B4FD8]" />
                    <h3 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                      Medical Licensure & Regulatory Compliance
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-[#15803D] bg-[#DCFCE7] px-2 py-0.5 rounded border border-[#BBF7D0]">
                    Auto-Tracked in HRMS
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Educational & Clinical Qualifications
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. M.B.B.S., M.D., D.M. (Cardiology) / B.Sc Nursing"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none transition-all placeholder:text-[#94A3B8]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      Medical / Nursing License No.
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. APMC-48192 or INC-99412"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none font-mono text-[#0F172A] uppercase placeholder:text-[#94A3B8]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">
                      License Expiry Date
                    </label>
                    <input
                      type="date"
                      value={licenseExpiry}
                      onChange={(e) => setLicenseExpiry(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-[#64748B]">
                  * License registration will be automatically monitored in the <strong>Licenses & Compliance</strong> tab with automated 30-day renewal reminders.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Compensation & Leave Quota */}
          {activeTab === "compensation" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Executive Monthly Net Payout Card */}
              <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                    Calculated Monthly Net Take-Home
                  </div>
                  <div className="text-2xl font-bold text-[#0F172A] mt-0.5">
                    ₹{netPay.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="bg-[#EFF6FF] text-[#1B4FD8] px-3 py-1.5 rounded-lg border border-[#BFDBFE] font-medium">
                    Gross: <span className="font-bold">₹{grossPay.toLocaleString()}</span>
                  </div>
                  <div className="bg-[#FEF2F2] text-[#DC2626] px-3 py-1.5 rounded-lg border border-[#FECACA] font-medium">
                    Deductions: <span className="font-bold">₹{totalDeductions.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Statutory Formula Auto-Calculation Control */}
              <div className="flex items-center justify-between text-xs bg-[#EFF6FF] border border-[#BFDBFE] px-3.5 py-2 rounded-lg text-[#1E40AF]">
                <div className="flex items-center gap-2">
                  <span className="font-bold">⚡ Statutory Auto-Formulas:</span>
                  <span className="text-[#3B82F6]">HRA (40%), Allowances (15%), PF (12%), Estimated TDS (10%)</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold select-none text-[#1B4FD8]">
                  <input
                    type="checkbox"
                    checked={autoCalculateSalary}
                    onChange={(e) => setAutoCalculateSalary(e.target.checked)}
                    className="rounded border-[#BFDBFE] text-[#1B4FD8] focus:ring-0 cursor-pointer"
                  />
                  <span>Auto-Compute</span>
                </label>
              </div>

              {/* Salary Components */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Basic Salary (₹) <span className="text-[#1B4FD8]">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Enter basic salary"
                    value={basic || ""}
                    onChange={(e) => handleBasicSalaryChange(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none font-semibold text-[#0F172A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    House Rent Allowance (HRA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={hra || ""}
                    onChange={(e) => setHra(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Special / Medical Allowances
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={allowances || ""}
                    onChange={(e) => setAllowances(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#DC2626] mb-1">
                    Provident Fund (PF) (12%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pf || ""}
                    onChange={(e) => setPf(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#FECACA] rounded-lg focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/20 focus:outline-none text-[#DC2626] font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#DC2626] mb-1">
                    TDS / Income Tax (Estimated)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tax || ""}
                    onChange={(e) => setTax(Number(e.target.value) || 0)}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#FECACA] rounded-lg focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/20 focus:outline-none text-[#DC2626] font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    PAN Card Number
                  </label>
                  <input
                    type="text"
                    placeholder="ABCDE1234F"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none uppercase font-mono"
                  />
                </div>
              </div>

              {/* Annual Leave Quota Assignment */}
              <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#1B4FD8]" />
                    <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                      Annual Leave Entitlement & Quota Assignment
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold text-[#1B4FD8] bg-[#EFF6FF] px-2.5 py-0.5 rounded border border-[#BFDBFE]">
                    Total: {casualQuota + sickQuota + earnedQuota} Days / Year
                  </span>
                </div>

                <p className="text-[11.5px] text-[#64748B]">
                  Assign annual leave quotas for this employee. Once onboarded, these quotas are credited directly to their portal for self-service leave applications.
                </p>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#0F172A]">Casual Leave (CL)</label>
                      <span className="text-[10px] text-[#16A34A] font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">Standard</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={casualQuota}
                        onChange={(e) => setCasualQuota(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full text-xs px-3 py-2 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] font-bold text-[#0F172A]"
                      />
                      <span className="text-xs text-[#64748B] font-medium">Days</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-1">For unplanned personal needs</p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#0F172A]">Sick Leave (SL)</label>
                      <span className="text-[10px] text-[#2563EB] font-semibold bg-blue-50 px-1.5 py-0.5 rounded">Medical</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={sickQuota}
                        onChange={(e) => setSickQuota(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full text-xs px-3 py-2 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] font-bold text-[#0F172A]"
                      />
                      <span className="text-xs text-[#64748B] font-medium">Days</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-1">For illness & recovery</p>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-[#0F172A]">Earned Leave (EL)</label>
                      <span className="text-[10px] text-[#9333EA] font-semibold bg-purple-50 px-1.5 py-0.5 rounded">Annual</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={earnedQuota}
                        onChange={(e) => setEarnedQuota(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full text-xs px-3 py-2 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] font-bold text-[#0F172A]"
                      />
                      <span className="text-xs text-[#64748B] font-medium">Days</span>
                    </div>
                    <p className="text-[10px] text-[#94A3B8] mt-1">Planned vacation / privilege</p>
                  </div>
                </div>
              </div>

              {/* Bank Details */}
              <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
                  <Wallet className="w-4 h-4 text-[#1B4FD8]" />
                  <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Bank Disbursement Details (Direct Deposit)
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] mb-1">Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC Bank"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none bg-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] mb-1">Account Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 50100234567891"
                      value={accountNo}
                      onChange={(e) => setAccountNo(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none font-mono bg-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#475569] mb-1">IFSC Code</label>
                    <input
                      type="text"
                      placeholder="e.g. HDFC0001824"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                      className="w-full text-xs px-3 py-2 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none uppercase font-mono bg-white font-medium"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Emergency Contact & Confirmation */}
          {activeTab === "contact" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-[#E2E8F0]">
                  <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                  <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                    Designated Emergency Contact Person (Next-of-Kin)
                  </h4>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">Contact Name</label>
                    <input
                      type="text"
                      placeholder="Next of Kin Name"
                      value={emName}
                      onChange={(e) => setEmName(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">Relationship</label>
                    <input
                      type="text"
                      placeholder="e.g. Spouse / Parent / Sibling"
                      value={emRelation}
                      onChange={(e) => setEmRelation(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 border border-[#DDE2EC] rounded-lg focus:border-[#1B4FD8] focus:ring-2 focus:ring-[#1B4FD8]/20 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#334155] mb-1">Emergency Phone</label>
                    <PhoneInput
                      value={emPhone}
                      onChange={setEmPhone}
                      placeholder="98480 00000"
                    />
                  </div>
                </div>
              </div>

              {/* Onboarding Confirmation Summary Card */}
              <div className="border border-[#DDE2EC] rounded-xl p-4 bg-white shadow-2xs">
                <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider mb-2.5">
                  Enrollment Summary Preview
                </h4>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                    <span className="text-[#64748B] block text-[10.5px]">Employee:</span>
                    <span className="font-bold text-[#0F172A]">{name || "Not entered"}</span>
                  </div>
                  <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                    <span className="text-[#64748B] block text-[10.5px]">Assignment:</span>
                    <span className="font-bold text-[#1B4FD8]">{category} • {department}</span>
                  </div>
                  <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                    <span className="text-[#64748B] block text-[10.5px]">Leave Quotas:</span>
                    <span className="font-bold text-emerald-700">{casualQuota} CL • {sickQuota} SL • {earnedQuota} EL</span>
                  </div>
                  <div className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0]">
                    <span className="text-[#64748B] block text-[10.5px]">Net Take-Home:</span>
                    <span className="font-bold text-[#0F172A]">₹{netPay.toLocaleString()} / mo</span>
                  </div>
                </div>
              </div>

              {/* Official Hospital Protocol Banner */}
              <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl text-xs text-[#1E40AF] flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#1B4FD8] flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-[#1B4FD8]">Staff Onboarding Protocol:</span> Upon clicking "Complete Registration", this employee will be provisioned with an official Hospital ID, placed on the {shift.split("(")[0]} roster, and their medical license will be entered into continuous compliance tracking.
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="pt-4 border-t border-[#DDE2EC] flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#475569] hover:text-[#0F172A] bg-white border border-[#DDE2EC] hover:bg-[#F8FAFC] rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              {activeTab !== "general" && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === "contact") setActiveTab("compensation")
                    else if (activeTab === "compensation") setActiveTab("role")
                    else if (activeTab === "role") setActiveTab("general")
                  }}
                  className="px-4 py-2 text-xs font-semibold text-[#334155] bg-white border border-[#DDE2EC] hover:bg-[#F8FAFC] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous Step
                </button>
              )}

              {activeTab !== "contact" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTab === "general") setActiveTab("role")
                    else if (activeTab === "role") setActiveTab("compensation")
                    else if (activeTab === "compensation") setActiveTab("contact")
                  }}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-lg shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  Next Step <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-bold text-white bg-[#15803D] hover:bg-[#166534] rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  {editStaff ? "Save Profile Changes" : "Complete Registration"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// The hooks live in AddEmployeeModalBody. Returning null before them (as this did) gives
// closed and open renders a different hook count, and React throws "Rendered
// more hooks than during the previous render" the moment the modal opens.
export default function AddEmployeeModal(props: AddEmployeeModalProps) {
  if (!props.isOpen) return null
  return <AddEmployeeModalBody {...props} />
}
