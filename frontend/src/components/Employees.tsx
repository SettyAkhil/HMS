import React, { useState, useEffect } from "react"
import {
  HrmsDatabase,
  StaffMember,
  StaffCategory,
  DutyStatus,
} from "../services/hrmsDb"
import EmployeeProfileModal from "./hrms/EmployeeProfileModal"
import ApplyLeaveModal from "./hrms/ApplyLeaveModal"
import {
  Users,
  Search,
  Filter,
  Calendar,
  Download,
  CheckCircle,
  LayoutGrid,
  List,
  Phone,
  Mail,
  Stethoscope,
  Briefcase,
  X,
  Eye,
  Clock,
  Building2,
} from "lucide-react"

interface EmployeesProps {
  onNavigate?: (module: string) => void
  activeStaff?: {
    id?: string
    name: string
    role?: string
    title?: string
    department?: string
  }
}

export default function Employees({ onNavigate, activeStaff }: EmployeesProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [search, setSearch] = useState("")
  const [department, setDepartment] = useState("All")
  const [category, setCategory] = useState("All")
  const [statusFilter, setStatusFilter] = useState("All")
  const [view, setView] = useState<"list" | "grid">("list")

  // Modals for Staff (Read-Only Directory & Leave Self-Service)
  const [viewingStaff, setViewingStaff] = useState<StaffMember | null>(null)
  const [isApplyLeaveOpen, setIsApplyLeaveOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(null), 3500)
  }

  useEffect(() => {
    // Automatically purge legacy demo cache once on mount for clean state
    const CLEAN_KEY = "imperial_hrms_clean_slate_executed_v5"
    if (typeof window !== "undefined" && !sessionStorage.getItem(CLEAN_KEY)) {
      sessionStorage.setItem(CLEAN_KEY, "true")
      HrmsDatabase.clearAllData()
    }
    setStaffList(HrmsDatabase.getStaffList())
    const unsubscribe = HrmsDatabase.subscribe(() => {
      setStaffList(HrmsDatabase.getStaffList())
    })
    return () => unsubscribe()
  }, [])

  const departments = ["All", ...Array.from(new Set(staffList.map((s) => s.department)))]
  const categories: ("All" | StaffCategory)[] = [
    "All",
    "Doctor",
    "Nursing",
    "Allied Health",
    "Administrative",
    "Support Staff",
  ]

  const filtered = staffList.filter((s) => {
    const q = search.toLowerCase()
    const matchesQuery =
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.department.toLowerCase().includes(q) ||
      s.designation.toLowerCase().includes(q) ||
      s.phone.includes(q) ||
      s.licenseNumber.toLowerCase().includes(q)

    const matchesDept = department === "All" || s.department === department
    const matchesCat = category === "All" || s.category === category
    const matchesDuty = statusFilter === "All" || s.dutyStatus === statusFilter

    return matchesQuery && matchesDept && matchesCat && matchesDuty
  })

  const handleExportCsv = () => {
    const headers = [
      "Staff ID,Name,Department,Designation,Category,Shift,Duty Status,Phone,Email\n",
    ]
    const rows = staffList.map(
      (s) =>
        `"${s.id}","${s.name}","${s.department}","${s.designation}","${s.category}","${s.shift}","${s.dutyStatus}","${s.phone}","${s.email}"`
    )
    const blob = new Blob([headers.join("") + rows.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `imperial_hospital_staff_directory_${new Date().toISOString().split("T")[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast("Staff phonebook exported to CSV")
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F8FAFC] overflow-hidden text-[#0F172A] font-sans">
      {/* Toast Notice */}
      {notice && (
        <div className="fixed top-4 right-4 z-50 bg-[#0F172A] text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs border border-slate-700 animate-in slide-in-from-top-2 duration-150">
          <CheckCircle className="w-4 h-4 text-[#22C55E]" />
          <span className="font-medium">{notice}</span>
        </div>
      )}

      {/* Top Header - Staff Directory & Self-Service Portal */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3.5 flex items-center justify-between flex-shrink-0 shadow-2xs">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] mb-1">
            <span>Hospital Portal</span>
            <span>/</span>
            <span>Staff Self-Service</span>
            <span>/</span>
            <span className="text-[#1B4FD8] font-semibold">Hospital Directory</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE] flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#0F172A] leading-tight">
                  Hospital Staff Directory & Intercom
                </h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                  Read-Only Directory
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Safe Actions for Regular Staff */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#475569] bg-white border border-[#DDE2EC] hover:bg-[#F8FAFC] rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download hospital phonebook directory"
          >
            <Download className="w-3.5 h-3.5 text-[#64748B]" /> Export Phonebook
          </button>

          <button
            onClick={() => setIsApplyLeaveOpen(true)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#1B4FD8] hover:bg-[#1541B8] rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Submit leave request for HR review"
          >
            <Calendar className="w-3.5 h-3.5 stroke-[2.5]" /> Apply Leave
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg px-3 py-1.5 flex-1 min-w-[240px] max-w-md">
          <Search size={14} className="text-[#94A3B8] flex-shrink-0" />
          <input
            type="text"
            placeholder="Search colleagues by name, role, department, or intercom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none w-full"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[#94A3B8] hover:text-[#0F172A] cursor-pointer">
              <X size={12} />
            </button>
          )}
        </div>

        {/* Clean Filter Dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Department Filter */}
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#DDE2EC] rounded-lg bg-white text-[#334155] focus:outline-none focus:border-[#1B4FD8] font-medium"
          >
            <option value="All">All Departments</option>
            {departments
              .filter((d) => d !== "All")
              .map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
          </select>

          {/* Role / Category Filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="text-xs px-2.5 py-1.5 border border-[#DDE2EC] rounded-lg bg-white text-[#334155] focus:outline-none focus:border-[#1B4FD8] font-medium"
          >
            <option value="All">All Roles / Categories</option>
            <option value="Doctor">Doctors</option>
            <option value="Nursing">Nursing</option>
            <option value="Allied Health">Allied Health</option>
            <option value="Administrative">Administrative</option>
            <option value="Support Staff">Support Staff</option>
          </select>

          {/* Duty Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 border border-[#DDE2EC] rounded-lg bg-white text-[#334155] focus:outline-none focus:border-[#1B4FD8] font-medium"
          >
            <option value="All">All Duty Statuses</option>
            <option value="On Duty">On Duty</option>
            <option value="In Surgery">In Surgery</option>
            <option value="Off Duty">Off Duty</option>
          </select>

          {/* View Toggler */}
          <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-lg border border-[#E2E8F0]">
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                view === "list" ? "bg-white text-[#1B4FD8] shadow-2xs" : "text-[#64748B]"
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                view === "grid" ? "bg-white text-[#1B4FD8] shadow-2xs" : "text-[#64748B]"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 w-full">
        {filtered.length === 0 ? (
          <div className="bg-white border border-[#DDE2EC] rounded-xl p-12 text-center shadow-2xs">
            <Users className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
            <h3 className="text-sm font-bold text-[#0F172A]">
              {staffList.length === 0 ? "No Hospital Staff Registered Yet" : "No staff members found"}
            </h3>
            <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
              {staffList.length === 0
                ? "The hospital staff directory is clean. Personnel can be registered by HR in the HRMS Suite."
                : "Try adjusting your search query or department filters."}
            </p>
            {staffList.length > 0 && (
              <button
                onClick={() => {
                  setSearch("")
                  setDepartment("All")
                  setCategory("All")
                  setStatusFilter("All")
                }}
                className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-[#1B4FD8] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] rounded-lg cursor-pointer"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          /* Grid View - Safe Colleague Contact Cards */
          <div className="grid grid-cols-4 gap-4">
            {filtered.map((emp) => (
              <div
                key={emp.id}
                onClick={() => setViewingStaff(emp)}
                className="bg-white border border-[#DDE2EC] hover:border-[#1B4FD8] rounded-xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F1F5F9] text-[#475569]">
                      {emp.category}
                    </span>
                    <span
                      className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${
                        emp.dutyStatus === "On Duty"
                          ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                          : emp.dutyStatus === "In Surgery"
                            ? "bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]"
                            : "bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]"
                      }`}
                    >
                      ● {emp.dutyStatus}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#1B4FD8] font-bold text-xs flex items-center justify-center border border-[#BFDBFE] flex-shrink-0">
                      {emp.avatarInitials}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A] group-hover:text-[#1B4FD8] transition-colors line-clamp-1">
                        {emp.name}
                      </h3>
                      <div className="text-[11px] text-[#64748B] line-clamp-1">{emp.designation}</div>
                      <div className="text-[10.5px] font-semibold text-[#1B4FD8] mt-0.5">{emp.department}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#F1F5F9] space-y-1.5 text-[11px] text-[#64748B]">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-[#1B4FD8]" />
                      <span className="font-mono text-[#334155]">{emp.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <Mail className="w-3 h-3 text-[#1B4FD8]" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-[#F1F5F9] text-[10.5px]">
                      <span className="text-[#94A3B8]">Shift:</span>
                      <span className="font-mono text-[#334155]">{emp.shift.split("(")[0]}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-[#F1F5F9] flex items-center justify-between text-xs" onClick={(e) => e.stopPropagation()}>
                  <span className="font-mono text-[10.5px] font-bold text-[#94A3B8]">{emp.id}</span>
                  <button
                    onClick={() => setViewingStaff(emp)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#1B4FD8] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded border border-[#BFDBFE] transition-colors cursor-pointer"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Table View - Safe Read-Only Colleague Directory */
          <div className="bg-white border border-[#DDE2EC] rounded-xl shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#DDE2EC] text-[#475569] font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Department & Specialty</th>
                  <th className="py-3 px-4">Shift Schedule</th>
                  <th className="py-3 px-4">Current Duty Status</th>
                  <th className="py-3 px-4">Hospital Contact</th>
                  <th className="py-3 px-4 text-right">Directory Card</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filtered.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => setViewingStaff(emp)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#1B4FD8] font-bold text-xs flex items-center justify-center border border-[#BFDBFE]">
                          {emp.avatarInitials}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-[#0F172A] flex items-center gap-1.5">
                            <span>{emp.name}</span>
                            <span className="font-mono text-[10.5px] font-normal text-[#94A3B8]">({emp.id})</span>
                          </div>
                          <div className="text-[11px] text-[#64748B]">{emp.qualification}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#0F172A]">{emp.department}</div>
                      <div className="text-[11px] text-[#64748B]">{emp.designation}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#334155]">{emp.shift.split("(")[0]}</div>
                      <div className="text-[10px] font-mono text-[#94A3B8]">{emp.shift.split("(")[1]?.replace(")", "") || ""}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          emp.dutyStatus === "On Duty"
                            ? "bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]"
                            : emp.dutyStatus === "In Surgery"
                              ? "bg-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE]"
                              : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            emp.dutyStatus === "On Duty"
                              ? "bg-[#16A34A]"
                              : emp.dutyStatus === "In Surgery"
                                ? "bg-[#7C3AED]"
                                : "bg-[#94A3B8]"
                          }`}
                        ></span>
                        {emp.dutyStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-[#0F172A]">{emp.phone}</div>
                      <div className="text-[10.5px] text-[#64748B] truncate max-w-[180px]">{emp.email}</div>
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setViewingStaff(emp)}
                        className="px-3 py-1 text-xs font-semibold text-[#1B4FD8] bg-[#EFF6FF] hover:bg-[#DBEAFE] rounded border border-[#BFDBFE] transition-colors cursor-pointer"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Read-Only Profile Modal for Staff Directory (NO SALARY, NO EDIT, NO DELETE) */}
      <EmployeeProfileModal
        isOpen={!!viewingStaff}
        staff={viewingStaff}
        isHrAdmin={false}
        onClose={() => setViewingStaff(null)}
        onEdit={() => {}}
        onViewPayslip={() => {}}
      />

      {/* Staff Self-Service Leave Modal */}
      <ApplyLeaveModal
        isOpen={isApplyLeaveOpen}
        onClose={() => setIsApplyLeaveOpen(false)}
        loggedInStaffId={activeStaff?.id}
        loggedInStaffName={activeStaff?.name}
        isSelfService={true}
        onSuccess={() => {
          showToast("Your leave request has been submitted to HR")
        }}
      />
    </div>
  )
}
