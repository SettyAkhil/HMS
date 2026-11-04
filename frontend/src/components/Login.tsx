import React, { useState, useMemo, useEffect } from "react"
import { apiFetch } from "../lib/api"
import { AuditDatabase } from "../services/auditDb"
import { RoleDatabase, ALL_SYSTEM_MODULES } from "../services/roleDb"
import { credentialsForRole } from "../lib/demoCredentials"
import { HrmsDatabase } from "../services/hrmsDb"
import {
  DOCTOR_ROSTER,
  getAllDoctorAccounts,
  normalizeDoctorName,
  resolveDoctorAccount,
} from "../services/doctorPortalDb"
import { HospAILogo } from "./HospAILogo"
import { KalpraLogo } from "./KalpraLogo"

interface StaffOption {
  id: string
  name: string
  subtitle: string
  department: string
}

interface LoginProps {
  onLogin: (userData: {
    user: string
    role: string
    staffId: string
    staffName?: string
    staffTitle?: string
    staffDepartment?: string
    permissions: string[]
    /** Which physician signed in -- each doctor gets their own portal. */
    doctorId?: string
  }) => void
}

const ROLES_LIST = [
  { value: "admin", label: "System Admin", sub: "IT Administration & Security" },
  { value: "doctor", label: "Doctor / Physician", sub: "Clinical Workspace, OPD & Inpatient" },
  { value: "nurse", label: "Registered Nurse", sub: "Nursing Station, Vitals & Bedside Care" },
  { value: "pharmacy", label: "Pharmacist", sub: "Inpatient & Retail Pharmacy" },
  { value: "lab", label: "Lab Technician", sub: "Pathology & Clinical Lab Diagnostics" },
  { value: "reception", label: "Receptionist / Front Desk", sub: "Patient Registration & OPD Queue" },
  { value: "billing", label: "Billing Specialist", sub: "Revenue Cycle & Invoices" },
  { value: "insurance", label: "Insurance Officer", sub: "TPA & Claims Desk" },
  { value: "finance", label: "Finance", sub: "Settlements & Accounts" },
  { value: "hr", label: "HR Administrator", sub: "People Operations, Staff & Payroll" },
  { value: "superadmin", label: "Super Admin", sub: "Executive Suite" },
]

export default function Login({ onLogin }: LoginProps) {
  const [user, setUser] = useState("")
  const [pass, setPass] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [doctorId, setDoctorId] = useState(DOCTOR_ROSTER[0]?.id || "")
  const [openRoleDropdown, setOpenRoleDropdown] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState("")

  const detectedDoctor = useMemo(() => {
    const k = user.trim().toLowerCase()
    if (!k || k === "admin" || k === "doctor" || k === "nurse" || k === "reception" || k === "pharmacy" || k === "lab" || k === "hr" || k === "billing") {
      return null
    }
    const all = getAllDoctorAccounts()
    return (
      all.find(
        (d) =>
          d.username.toLowerCase() === k ||
          d.id.toLowerCase() === k ||
          d.staffId.toLowerCase() === k ||
          normalizeDoctorName(d.name) === normalizeDoctorName(k),
      ) || null
    )
  }, [user])

  const isDoctorLogin =
    user.trim().toLowerCase() === "doctor" ||
    user.trim().toLowerCase().startsWith("doctor") ||
    Boolean(detectedDoctor)
  const activeRole = ROLES_LIST.find((r) => r.value === user)

  const availableStaffList: StaffOption[] = useMemo(() => {
    if (!user) return []
    if (detectedDoctor) {
      return [
        {
          id: detectedDoctor.id,
          name: detectedDoctor.name,
          subtitle: `${detectedDoctor.specialty} · ${detectedDoctor.room}`,
          department: detectedDoctor.specialty,
        },
      ]
    }
    const roleKey = user.trim().toLowerCase()
    const hrmsStaff = HrmsDatabase.getStaffList()

    if (roleKey === "doctor" || roleKey.startsWith("doctor")) {
      return getAllDoctorAccounts().map((d) => ({
        id: d.id,
        name: d.name,
        subtitle: `${d.specialty} · ${d.room}`,
        department: d.specialty,
      }))
    }

    if (roleKey === "nurse") {
      return hrmsStaff
        .filter((s) => s.category === "Nursing")
        .map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: `${s.designation} · ${s.department}`,
          department: s.department,
        }))
    }

    if (roleKey === "reception") {
      return hrmsStaff
        .filter((s) => s.department === "Administration" || s.category === "Administrative")
        .map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: `${s.designation} · ${s.department}`,
          department: s.department,
        }))
    }

    if (roleKey === "pharmacy") {
      return hrmsStaff
        .filter((s) => s.department === "Pharmacy")
        .map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: `${s.designation} · ${s.department}`,
          department: s.department,
        }))
    }

    if (roleKey === "lab") {
      return hrmsStaff
        .filter((s) => s.department === "Laboratory" || s.department === "Pathology")
        .map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: `${s.designation} · ${s.department}`,
          department: s.department,
        }))
    }

    if (roleKey === "hr") {
      return hrmsStaff
        .filter((s) => s.department === "Human Resources" || s.category === "Administrative")
        .map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: `${s.designation} · ${s.department}`,
          department: s.department,
        }))
    }

    if (roleKey === "billing") {
      return hrmsStaff
        .filter((s) => s.department.toLowerCase().includes("billing") || s.department.toLowerCase().includes("finance") || s.category === "Administrative")
        .map((s) => ({
          id: s.id,
          name: s.name,
          subtitle: `${s.designation} · ${s.department}`,
          department: s.department,
        }))
    }

    return []
  }, [user])

  useEffect(() => {
    if (availableStaffList.length > 0) {
      setSelectedStaffId(availableStaffList[0].id)
      if (isDoctorLogin) {
        setDoctorId(availableStaffList[0].id)
      }
    } else {
      setSelectedStaffId("")
    }
  }, [availableStaffList, isDoctorLogin])

  const submit = async (e?: React.FormEvent) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault()
    }
    const username = (user || "").trim() || "admin"
    const demo = credentialsForRole(username)
    const effectivePass = (pass || "").trim() || demo?.localPassword || "password123"

    setError("")
    setLoading(true)
    try {
      const local = RoleDatabase.authenticate(username, effectivePass)

      if (demo) {
        apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: demo.backendUsername,
            password: demo.backendPassword,
          }),
          timeoutMs: 800,
        }).catch(() => {})
      }

      const chosenMember =
        availableStaffList.find((s) => s.id === selectedStaffId) ||
        availableStaffList[0]

      try {
        AuditDatabase.logEvent(
          "Login Successful",
          "Authentication",
          `User ${chosenMember?.name || username} logged in successfully.`,
          "Success",
          chosenMember?.id || local.user.staffId,
          chosenMember?.name || username,
        )
      } catch (logErr) {
        console.warn("Audit log skipped:", logErr)
      }

      const effectiveDoctorId = isDoctorLogin
        ? (detectedDoctor?.id || chosenMember?.id || doctorId || "IMP-001")
        : undefined

      onLogin({
        user: username,
        role: isDoctorLogin ? "ROLE_DOCTOR" : local.role.id,
        staffId: chosenMember?.id || detectedDoctor?.staffId || local.user.staffId,
        staffName: chosenMember?.name || detectedDoctor?.name || local.user.name,
        staffTitle: chosenMember?.subtitle || detectedDoctor?.qualification || local.role.name,
        staffDepartment: chosenMember?.department || detectedDoctor?.specialty || "Hospital Operations",
        permissions: local.role.allowedModules || ALL_SYSTEM_MODULES,
        doctorId: effectiveDoctorId,
      })
    } catch (err) {
      console.error("Login submission error:", err)
      try {
        AuditDatabase.logEvent(
          "Login Failed",
          "Authentication",
          `Failed login attempt for user ${username}.`,
          "Failed",
          "system",
          username,
        )
      } catch {}
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please check your credentials.",
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="h-screen flex"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#0C1524] p-12 select-none relative overflow-hidden">
        {/* Bottom curve: white inside dark blue panel (lowered) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 500 1000"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M 0 920 C 130 860, 280 740, 500 840 L 500 1000 L 0 1000 Z"
            fill="#F0F2F5"
          />
        </svg>

        <div className="relative z-10">
          {/* Logo */}
          <div className="mb-6">
            <HospAILogo variant="horizontal" className="h-40" />
          </div>

          {/* Title & Subtitle directly below Logo */}
          <div className="mb-12">
            <h1 className="text-white text-3xl font-bold leading-snug mb-3">
              Universal Hospital
              <br />
              Management System
            </h1>
            <p className="text-[#94A3B8] text-[13.5px] leading-relaxed max-w-lg">
              Enterprise-grade clinical operations platform for physicians,
              nurses, pharmacists, laboratory staff, and administrators.
            </p>
          </div>

          {/* 4 Feature Boxes in 2x2 Grid Container */}
          <div className="grid grid-cols-2 gap-3.5 mb-10">
            {[
              {
                icon: "🏥",
                label: "16 Modules",
                sub: "End-to-end care workflow",
              },
              {
                icon: "👥",
                label: "428 Patients Today",
                sub: "Real-time census management",
              },
              {
                icon: "⚠",
                label: "7 Critical Alerts",
                sub: "Requires immediate attention",
              },
              {
                icon: "🔒",
                label: "HIPAA Compliant",
                sub: "Role-based access control",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3.5 p-3.5 rounded-none bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
              >
                <span className="text-xl flex-shrink-0">{f.icon}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate">
                    {f.label}
                  </div>
                  <div className="text-[11.5px] text-[#94A3B8] truncate">
                    {f.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer with Kalpra Tech logo at the complete bottom right (inside white curve) */}
        <div className="absolute bottom-2 right-8 z-10 flex items-center gap-2">
          <span className="text-[11.5px] text-[#475569] font-medium whitespace-nowrap mb-0.5">
            Powered by
          </span>
          <KalpraLogo className="h-25" />
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col justify-between bg-[#F0F2F5] px-8 py-10 relative overflow-hidden">
        {/* Bottom curve: #0C1524 dark blue inside white panel (lowered) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 500 1000"
          preserveAspectRatio="none"
          fill="none"
        >
          <path
            d="M 0 840 C 230 940, 370 820, 500 760 L 500 1000 L 0 1000 Z"
            fill="#0C1524"
          />
        </svg>

        <div className="w-full max-w-sm mx-auto my-auto relative z-10">
          <div className="flex justify-center mb-6 lg:hidden">
            <HospAILogo variant="horizontal" className="h-16 justify-center" />
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-1">
              Sign in
            </h2>
            <p className="text-[12.5px] text-[#64748B]">
              Select your system role to access the HMS
            </p>
          </div>

          {error && (
            <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] text-[12.5px] px-3.5 py-2.5 rounded-none mb-4 flex items-center gap-2">
              <span className="font-bold">⚠</span> {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                User ID / Employee Number
              </label>
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="Select role below or enter User ID"
                className="w-full border border-[#DDE2EC] rounded-none bg-white text-[13px] px-3.5 py-2.5 focus:outline-none focus:border-[#1B4FD8]"
              />
              <p className="text-[11px] text-[#94A3B8] mt-1">
                Select role from dropdown to auto-fill credentials
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[12px] font-semibold text-[#374151]">
                  Password
                </label>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    setPass("password123")
                  }}
                  className="text-[11.5px] text-[#64748B] hover:text-[#1B4FD8]"
                >
                  Reset password
                </a>
              </div>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-[#DDE2EC] rounded-none bg-white text-[13px] px-3.5 py-2.5 focus:outline-none focus:border-[#1B4FD8]"
              />
            </div>

            {/* Clean Minimalistic Custom Role Dropdown */}
            <div className="relative">
              <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">
                Role
              </label>

              <button
                type="button"
                onClick={() => setOpenRoleDropdown((prev) => !prev)}
                className="w-full border border-[#DDE2EC] rounded-none bg-white text-[13px] px-3.5 py-2.5 flex items-center justify-between text-left focus:outline-none focus:border-[#1B4FD8] hover:border-[#CBD5E1] transition-colors cursor-pointer"
              >
                <div className="min-w-0 pr-2 truncate">
                  {activeRole ? (
                    <>
                      <span className="font-semibold text-[#0F172A]">
                        {activeRole.label}
                      </span>
                      <span className="text-[11.5px] text-[#64748B] ml-2 font-normal">
                        — {activeRole.sub}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#94A3B8] font-medium">
                      Select Role
                    </span>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-[#64748B] transition-transform duration-150 flex-shrink-0 ${openRoleDropdown ? "rotate-180 text-[#1B4FD8]" : ""
                    }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {openRoleDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#CBD5E1] shadow-lg rounded-none z-50 max-h-60 overflow-y-auto py-1 divide-y divide-[#F1F5F9]">
                  <button
                    type="button"
                    onClick={() => {
                      setUser("")
                      setPass("")
                      setOpenRoleDropdown(false)
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${user === ""
                      ? "bg-[#EFF6FF] text-[#1B4FD8]"
                      : "hover:bg-[#F8FAFC] text-[#64748B]"
                      }`}
                  >
                    <span className="text-[12.5px] font-medium text-[#64748B]">
                      Select Role
                    </span>
                    {user === "" && (
                      <span className="text-[#1B4FD8] font-bold text-[12px] ml-2">
                        ✓
                      </span>
                    )}
                  </button>
                  {ROLES_LIST.map((r) => {
                    const isSelected = user === r.value
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => {
                          setUser(r.value)
                          setPass(
                            credentialsForRole(r.value)?.localPassword ||
                            "password123",
                          )
                          setOpenRoleDropdown(false)
                        }}
                        className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${isSelected
                          ? "bg-[#EFF6FF] text-[#1B4FD8]"
                          : "hover:bg-[#F8FAFC] text-[#334155]"
                          }`}
                      >
                        <div className="min-w-0 truncate">
                          <span
                            className={`text-[12.5px] ${isSelected
                              ? "font-bold text-[#1B4FD8]"
                              : "font-medium text-[#0F172A]"
                              }`}
                          >
                            {r.label}
                          </span>
                          <span className="text-[11px] text-[#64748B] ml-2 font-normal">
                            — {r.sub}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="text-[#1B4FD8] font-bold text-[12px] ml-2">
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {user && (
              availableStaffList.length > 0 ? (
                <div>
                  <label className="block text-[12px] font-semibold text-[#374151] mb-1.5 flex items-center justify-between">
                    <span>Select Staff Member / Identity</span>
                    <span className="text-[10.5px] font-mono text-[#1B4FD8] bg-blue-50 px-1.5 py-0.5 rounded">
                      {availableStaffList.length} registered
                    </span>
                  </label>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => {
                      setSelectedStaffId(e.target.value)
                      if (isDoctorLogin) setDoctorId(e.target.value)
                    }}
                    className="w-full border border-[#DDE2EC] rounded-none bg-white text-[13px] px-3.5 py-2.5 focus:outline-none focus:border-[#1B4FD8] cursor-pointer font-medium text-[#0F172A]"
                  >
                    {availableStaffList.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} — {st.subtitle} ({st.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-[#64748B] mt-1">
                    {isDoctorLogin
                      ? "Your portal lists only the patients appointed to you, and applies leave under your name."
                      : "Logging in as this individual connects your personal workspace, shifts, and leave quota."}
                  </p>
                </div>
              ) : (
                user.trim().toLowerCase() !== "admin" && (
                  <div className="bg-[#F8FAFC] border border-dashed border-[#CBD5E1] p-3 text-[11.5px] text-[#64748B] rounded">
                    ℹ️ No personnel registered in this role yet. Sign in as <span className="font-semibold text-[#1B4FD8]">HR Administrator</span> (username <code className="bg-slate-200 px-1 rounded">hr</code>) to add staff via the HRMS module.
                  </div>
                )
              )
            )}

            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="mfa"
                className="w-3.5 h-3.5 accent-[#1B4FD8] rounded-none"
                defaultChecked
              />
              <label htmlFor="mfa" className="text-[12px] text-[#64748B]">
                Remember this device for 8 hours
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-none text-white font-semibold text-[13px] transition-colors mt-3 ${loading
                ? "bg-[#94A3B8] cursor-not-allowed"
                : "bg-[#1B4FD8] hover:bg-[#1740B4]"
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="white"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="white"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                "Sign In to HMS"
              )}
            </button>
          </form>
        </div>

        {/* Footer on right side (inside dark blue curve) */}
        <div className="relative z-10 text-center">
          <div className="text-[11px] text-[#94A3B8]">
            © 2026 General Hospital · UHMS v4.2.1 · Build 20260823
          </div>
        </div>
      </div>
    </div>
  )
}
