// Dedicated Enterprise HR & Workforce Management Workspace.
// Controlled via the main application sidebar navigation.
// Standardized on the enterprise hospital design system.
import { useEffect, useState, type ReactNode } from "react"
import { hr } from "../../services/hr/client"
import HrDashboard, { type DashboardNav } from "./HrDashboard"
import EmployeesSection from "./EmployeesSection"
import OrganizationSection from "./OrganizationSection"
import AttendanceSection from "./AttendanceSection"
import ShiftsSection from "./ShiftsSection"
import StaffingSection from "./StaffingSection"
import LeaveSection from "./LeaveSection"
import ApprovalsSection from "./ApprovalsSection"
import PayrollSection from "./PayrollSection"
import RecruitmentSection from "./RecruitmentSection"
import TrainingSection from "./TrainingSection"
import PerformanceSection from "./PerformanceSection"
import ComplianceSection from "./ComplianceSection"
import GrievancesSection from "./GrievancesSection"
import ReportsSection, { Announcements } from "./ReportsSection"
import { ErrorState } from "./ui"
import useOrgRefs from "./useOrgRefs"

export type HrSection =
  | "dashboard"
  | "employees"
  | "organization"
  | "attendance"
  | "shifts"
  | "staffing"
  | "leave"
  | "approvals"
  | "payroll"
  | "recruitment"
  | "training"
  | "performance"
  | "compliance"
  | "grievances"
  | "reports"
  | "announcements"

type Session = { permissions: string[]; user_type?: string }

const FALLBACK_ADMIN_SESSION: Session = {
  user_type: "admin",
  permissions: [
    "employees.profile.write",
    "hr.departments.write",
    "hr.attendance.write",
    "hr.shifts.write",
    "hr.leaves.write",
    "hr.payroll.write",
    "hr.recruitment.write",
    "hr.training.write",
    "hr.performance.write",
    "hr.grievances.manage",
    "hr.reports.read",
  ],
}

let cachedSession: Session | null = null

export default function HrWorkspace({
  section = "dashboard",
  initialSection = "dashboard",
  onNavigateSection,
  legacy,
}: {
  section?: HrSection
  initialSection?: HrSection
  onNavigateSection?: (section: HrSection) => void
  legacy?: ReactNode
}) {
  const [internalSection, setInternalSection] = useState<HrSection>(section || initialSection)
  const [nav, setNav] = useState<DashboardNav | null>(null)
  const [session, setSession] = useState<Session>(() => cachedSession || FALLBACK_ADMIN_SESSION)
  const [authError, setAuthError] = useState<unknown>(null)
  const [showLegacy, setShowLegacy] = useState(false)

  // Pre-warm organizational references so child dropdowns/filters render immediately
  useOrgRefs()

  // Directly evaluate active section: 0ms render lag on sidebar navigation
  const activeSection = section || internalSection

  useEffect(() => {
    if (section) setInternalSection(section)
  }, [section])

  // Fetch session in background without blocking initial rendering
  useEffect(() => {
    let alive = true
    if (!cachedSession) {
      hr.get<{ user: Session | null }>("/api/auth/session")
        .then((r) => {
          if (!alive) return
          if (r.user) {
            cachedSession = r.user
            setSession(r.user)
          }
        })
        .catch(() => {
          // Stay with fallback admin session
        })
    }
    return () => {
      alive = false
    }
  }, [])

  const isAdmin = session?.user_type === "admin"
  const can = (p: string) => isAdmin || !session?.permissions?.length || !!session?.permissions?.includes(p)

  const go = (to: DashboardNav) => {
    setNav(to)
    const target = to.section as HrSection
    setInternalSection(target)
    onNavigateSection?.(target)
  }

  if (showLegacy && legacy) {
    return (
      <div className="flex flex-col h-full bg-[#F0F2F5]">
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between text-xs text-amber-800">
          <span>Viewing classic HRMS view</span>
          <button
            onClick={() => setShowLegacy(false)}
            className="font-bold underline text-[#1B4FD8] hover:text-[#1E40AF] cursor-pointer"
          >
            ← Back to Enterprise HR Workspace
          </button>
        </div>
        <div className="flex-1 overflow-auto">{legacy}</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F0F2F5] text-gray-900 font-sans">
      {/* ── Main Workspace Body (Controlled directly via Main Sidebar) ── */}
      <div className="flex-1 bg-[#F0F2F5] overflow-y-auto p-5 space-y-4">
        {authError ? (
          <ErrorState error={authError} />
        ) : (
          <>
            {activeSection === "dashboard" && <HrDashboard onNavigate={go} />}
            {activeSection === "employees" && (
              <EmployeesSection
                key={JSON.stringify(nav)}
                canEdit={can("employees.profile.write")}
                can={can}
                initialFilters={nav?.section === "employees" ? nav.filters : undefined}
                openEmployeeId={nav?.section === "employees" ? nav.employeeId : null}
                onCloseEmployee={() => setNav(null)}
              />
            )}
            {activeSection === "organization" && <OrganizationSection canEdit={can("hr.departments.write")} />}
            {activeSection === "attendance" && <AttendanceSection canManage={can("hr.attendance.write")} />}
            {activeSection === "shifts" && <ShiftsSection canEdit={can("hr.shifts.write")} />}
            {activeSection === "staffing" && <StaffingSection canEdit={can("hr.shifts.write")} />}
            {activeSection === "leave" && <LeaveSection canEdit={can("hr.leaves.write")} />}
            {activeSection === "approvals" && <ApprovalsSection isAdmin={isAdmin} />}
            {activeSection === "payroll" && can("hr.payroll.write") && <PayrollSection />}
            {activeSection === "recruitment" && (
              <RecruitmentSection
                canManage={can("hr.recruitment.write")}
                canActivate={can("hr.recruitment.write") && can("employees.profile.write")}
              />
            )}
            {activeSection === "training" && <TrainingSection canManage={can("hr.training.write")} />}
            {activeSection === "performance" && <PerformanceSection canManage={can("hr.performance.write")} />}
            {activeSection === "compliance" && <ComplianceSection canManage={can("employees.profile.write")} />}
            {activeSection === "grievances" && <GrievancesSection canManage={can("hr.grievances.manage")} />}
            {activeSection === "reports" && <ReportsSection />}
            {activeSection === "announcements" && <Announcements canEdit={can("employees.profile.write")} />}
          </>
        )}
      </div>
    </div>
  )
}
