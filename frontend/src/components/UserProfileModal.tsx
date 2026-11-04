import React, { useState } from "react"

export interface StaffProfileDetails {
  id: string
  name: string
  role: string
  title: string
  department: string
  email?: string
  phone?: string
  status?: string
  activeShift?: string
  joiningDate?: string
  location?: string
  emergencyContact?: string
  permissions?: string[]
  img?: string
}

interface UserProfileModalProps {
  isOpen: boolean
  onClose: () => void
  profile: StaffProfileDetails | null
  onSwitchRole?: () => void
  onSignOut?: () => void
  isCurrentUser?: boolean
}

export default function UserProfileModal({
  isOpen,
  onClose,
  profile,
  onSwitchRole,
  onSignOut,
  isCurrentUser = false,
}: UserProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "permissions" | "schedule">("overview")

  if (!isOpen || !profile) return null

  const initials = profile.img || profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const defaultEmail = profile.email || `${profile.name.toLowerCase().replace(/[^a-z0-9]/g, ".")}@kepplerhospital.org`
  const defaultPhone = profile.phone || "+1 (555) 019-2834"
  const defaultJoining = profile.joiningDate || "Jan 15, 2022"
  const defaultShift = profile.activeShift || "Morning Shift (08:00 AM - 04:30 PM)"
  const defaultLocation = profile.location || `Wing B, ${profile.department} Section, Room 302`
  const defaultEmergency = profile.emergencyContact || "Sarah Vance (Spouse) - +1 (555) 948-2910"
  const statusStr = profile.status || "On Duty"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#CBD5E1] overflow-hidden flex flex-col max-h-[90vh] transition-all transform scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Cover Banner */}
        <div className="relative h-32 bg-gradient-to-r from-[#0F172A] via-[#1E3A8A] to-[#1B4FD8] p-6 flex justify-between items-start">
          <div className="flex items-center gap-2 text-white/80 text-[11px] font-mono tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Hospital Staff Identification Card
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors text-sm font-bold cursor-pointer"
            title="Close Profile"
          >
            ✕
          </button>
        </div>

        {/* Profile Identity Bar */}
        <div className="relative px-6 pb-4 pt-0 bg-white border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-12">
          <div className="flex items-end gap-4">
            <div className="relative">
              <div className="w-24 h-24 rounded-2xl bg-[#1B4FD8] text-white flex items-center justify-center text-3xl font-extrabold shadow-xl border-4 border-white tracking-wider">
                {initials}
              </div>
              <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${
                statusStr === "On Duty" || statusStr === "Active" ? "bg-emerald-500" : "bg-amber-500"
              }`} />
            </div>
            <div className="pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">{profile.name}</h2>
                <span className="px-2.5 py-0.5 text-[11px] font-mono font-bold bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE] rounded-md">
                  {profile.id}
                </span>
              </div>
              <p className="text-[13px] font-medium text-[#475569]">{profile.title}</p>
              <div className="flex items-center gap-2 text-[12px] text-[#64748B] mt-0.5">
                <span className="font-semibold text-[#1E293B]">{profile.department}</span>
                <span>•</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {statusStr}
                </span>
              </div>
            </div>
          </div>

          {isCurrentUser && onSwitchRole && (
            <button
              onClick={() => {
                onClose()
                onSwitchRole()
              }}
              className="px-3.5 py-2 text-[12px] font-semibold bg-[#1B4FD8] text-white hover:bg-[#153eb2] rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span> Switch Active Role
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-6 flex gap-6 text-[13px] font-medium">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === "overview"
                ? "border-[#1B4FD8] text-[#1B4FD8] font-bold"
                : "border-transparent text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            📋 Overview & Details
          </button>
          <button
            onClick={() => setActiveTab("permissions")}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === "permissions"
                ? "border-[#1B4FD8] text-[#1B4FD8] font-bold"
                : "border-transparent text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            🔐 Access & Permissions
          </button>
          <button
            onClick={() => setActiveTab("schedule")}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === "schedule"
                ? "border-[#1B4FD8] text-[#1B4FD8] font-bold"
                : "border-transparent text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            ⏰ Duty & Shift Schedule
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-[13px] text-[#334155] space-y-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
                  <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">Employee ID</div>
                  <div className="text-[13px] font-bold text-[#0F172A] font-mono mt-0.5">{profile.id}</div>
                </div>
                <div className="p-3 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
                  <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">Department</div>
                  <div className="text-[13px] font-bold text-[#0F172A] truncate mt-0.5">{profile.department}</div>
                </div>
                <div className="p-3 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
                  <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">Security Tier</div>
                  <div className="text-[13px] font-bold text-[#15803D] mt-0.5">Tier-1 Authorized</div>
                </div>
                <div className="p-3 bg-[#F1F5F9] rounded-xl border border-[#E2E8F0]">
                  <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider">Joined Date</div>
                  <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">{defaultJoining}</div>
                </div>
              </div>

              {/* Detailed Fields */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-4">
                <h4 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider border-b border-[#F1F5F9] pb-2">
                  Contact Information & Location
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-medium text-[#64748B]">Official Email</label>
                    <div className="text-[13px] font-semibold text-[#0F172A] flex items-center gap-2 mt-0.5">
                      <span>✉️</span> {defaultEmail}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#64748B]">Phone Number</label>
                    <div className="text-[13px] font-semibold text-[#0F172A] flex items-center gap-2 mt-0.5">
                      <span>📞</span> {defaultPhone}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#64748B]">Office / Workstation</label>
                    <div className="text-[13px] font-semibold text-[#0F172A] flex items-center gap-2 mt-0.5">
                      <span>📍</span> {defaultLocation}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-[#64748B]">Emergency Contact</label>
                    <div className="text-[13px] font-semibold text-[#0F172A] flex items-center gap-2 mt-0.5">
                      <span>🚨</span> {defaultEmergency}
                    </div>
                  </div>
                </div>
              </div>

              {/* Role Summary */}
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 flex items-start gap-3">
                <div className="text-xl">ℹ️</div>
                <div className="text-[12.5px] text-[#1E3A8A]">
                  <span className="font-bold">{profile.name}</span> is designated as <span className="font-bold">{profile.title}</span> in <span className="font-bold">{profile.department}</span>. All clinical and operational actions performed under this staff ID are logged for audit compliance.
                </div>
              </div>
            </div>
          )}

          {activeTab === "permissions" && (
            <div className="space-y-4">
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
                <h4 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                  Assigned System Role
                </h4>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 font-mono font-bold bg-[#1B4FD8] text-white rounded-md text-[12px]">
                    {profile.role}
                  </span>
                  <span className="text-[12.5px] font-medium text-[#475569]">
                    Full Operational Access for {profile.department}
                  </span>
                </div>
              </div>

              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
                <h4 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider mb-3">
                  Granted Hospital System Modules
                </h4>
                <div className="flex flex-wrap gap-2">
                  {(profile.permissions || [
                    "Dashboard", "Patients", "Appointments", "EMR & Consultations",
                    "Billing & Revenue", "Pharmacy Management", "Laboratory Worklist",
                    "ICU Flowsheet", "Insurance Claims & Queries", "Reports & Analytics"
                  ]).map((mod, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 text-[11.5px] font-semibold bg-[#F1F5F9] text-[#1E293B] border border-[#CBD5E1] rounded-lg flex items-center gap-1.5"
                    >
                      <span className="text-emerald-600">✓</span> {mod.replace(/_/g, " ").toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "schedule" && (
            <div className="space-y-4">
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                <h4 className="text-[12px] font-bold text-[#64748B] uppercase tracking-wider">
                  Current Duty & Roster
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="text-[11px] font-medium text-[#64748B]">Assigned Shift</div>
                    <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">{defaultShift}</div>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="text-[11px] font-medium text-[#64748B]">Primary Station</div>
                    <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">{profile.department} Desk</div>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="text-[11px] font-medium text-[#64748B]">Attendance Status</div>
                    <div className="text-[13px] font-bold text-emerald-600 mt-0.5">Checked In (08:02 AM)</div>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                    <div className="text-[11px] font-medium text-[#64748B]">Supervisor / HOD</div>
                    <div className="text-[13px] font-bold text-[#0F172A] mt-0.5">Dr. Alexander Vance (Chief Admin)</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#F8FAFC] border-t border-[#E2E8F0] px-6 py-3.5 flex items-center justify-between">
          <div className="text-[11px] text-[#64748B]">
            System Time: <span className="font-mono">{new Date().toLocaleDateString()}</span>
          </div>
          <div className="flex gap-3 items-center">
            {isCurrentUser && onSignOut && (
              <button
                onClick={() => {
                  onClose()
                  onSignOut()
                }}
                className="px-3.5 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-[12px] font-bold bg-[#0F172A] text-white hover:bg-[#1E293B] rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Close Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
