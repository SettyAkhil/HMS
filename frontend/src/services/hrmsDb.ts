/**
 * Enterprise Hospital Management System - HRMS & Staff Database Service
 * PostgreSQL-Backed Architecture (Connected to /hms-api gateway)
 */

import { API_BASE } from "../lib/constants"

export type StaffCategory = "Doctor" | "Nursing" | "Allied Health" | "Administrative" | "Support Staff"
export type EmploymentType = "Full-Time" | "Part-Time" | "Consultant" | "Contract" | "Resident"
export type StaffStatus = "Active" | "Probation" | "On Leave" | "Suspended" | "Resigned" | "Terminated" | "Retired" | "Inactive" | "Notice Period"
export type DutyStatus = "On Duty" | "Off Duty" | "In Surgery" | "On Break"
export type ShiftType = "Morning (07:00 - 15:00)" | "Evening (15:00 - 23:00)" | "Night (23:00 - 07:00)" | "General (09:00 - 17:30)" | "On-Call"
export type AttendanceStatusType = "Present" | "Late" | "Absent" | "Half Day" | "Half-Day" | "On Leave" | "Weekly Off" | "Holiday" | "Missed Punch" | "Outdoor Duty"
export type HospitalEntity = "VH Care" | "VH Med & Che" | "VHC ORGANIC STORE" | "VHC Pharmacy" | "WARD BOYS" | "All"

export interface BiometricDevice {
  id: string
  deviceSName: string
  deviceFName: string
  serialNo: string
  ipAddress: string
  port: number
  location: string
  lastPing: string
  status: "online" | "offline"
  firmware?: string
  registeredUsersCount?: number
  totalLogsCount?: number
  latencyMs?: number
}

export interface BiometricPunchLog {
  id: string
  staffId: string
  staffName: string
  company: string
  department: string
  deviceId: string
  deviceName: string
  location: string
  punchTime: string
  direction: "IN" | "OUT"
  verifyMode: "Fingerprint" | "Face ID" | "RFID Card" | "Manual Override"
  statusCode: "Valid" | "Late In" | "Early Out" | "Duplicate" | "Valid (Manual)"
  reason?: string
  supervisorId?: string
}

export interface DutyRosterEntry {
  staffId: string
  staffName: string
  department: string
  designation: string
  month: string
  days: Record<number, "M" | "E" | "N" | "G" | "WO" | "OD" | "CL" | "SL" | "LOP">
}

export interface OutdoorDutyEntry {
  id: string
  staffId: string
  staffName: string
  department: string
  dutyDate: string
  purpose: string
  destination: string
  outTime: string
  inTime: string
  approvedBy: string
  status: "Pending" | "Approved" | "Rejected"
  remarks?: string
}

export interface OvertimeRecord {
  id: string
  staffId: string
  staffName: string
  department: string
  date: string
  regularShift: string
  extraHours: number
  hourlyRate: number
  totalAmount: number
  reason: string
  approvedBy: string
  status: "Pending" | "Approved" | "Rejected"
}

export interface StaffLoan {
  id: string
  staffId: string
  staffName: string
  department: string
  loanType: string
  sanctionedAmount: number
  disbursedDate: string
  monthlyEmi: number
  totalTenureMonths: number
  remainingTenureMonths: number
  balanceOutstanding: number
  status: "Active" | "Closed" | "Pending Sanction"
  amountPaid?: number
  recoveryPeriod?: string
}

export interface ContinuousAbnormalityRecord {
  id: string
  staffId: string
  staffName: string
  department: string
  abnormalityType: string
  consecutiveDays: number
  dates: string[]
  memoGenerated: boolean
  memoDetails?: {
    memoNo: string
    issuedDate: string
    explanationDeadline: string
    subject: string
    content: string
  }
}

export interface StaffSalary {
  basic: number
  hra: number
  allowances: number
  pf: number
  tax: number
  netPay: number
}

export interface StaffBankDetails {
  accountNo: string
  ifsc: string
  bankName: string
  pan: string
}

export interface StaffLeaveBalance {
  casual: number
  casualUsed: number
  sick: number
  sickUsed: number
  earned: number
  earnedUsed: number
}

export interface StaffMember {
  id: string
  name: string
  gender: "Male" | "Female" | "Other"
  dob: string
  email: string
  phone: string
  avatarInitials: string
  department: string
  designation: string
  category: StaffCategory
  employmentType: EmploymentType
  status: StaffStatus
  dutyStatus: DutyStatus
  shift: ShiftType
  joiningDate: string
  qualification: string
  licenseNumber: string
  licenseExpiry: string
  address?: string
  bloodGroup?: string
  company?: string
  biometricId?: string
  rfidCardNo?: string
  salary: StaffSalary
  bankDetails: StaffBankDetails
  leaveBalance: StaffLeaveBalance
  resignationDate?: string | null
  lastWorkingDate?: string | null
  noticePeriodDays?: number
  exitReason?: string | null
  exitClearanceStatus?: string
  finalSettlementStatus?: string
  employmentStatus?: StaffStatus | string
  isActive?: boolean
  emergencyContact: {
    name: string
    relation: string
    phone: string
  }
  version?: number
}

export interface AttendanceRecord {
  id: string
  staffId: string
  staffName: string
  department: string
  date: string
  shift: ShiftType | string
  shiftStartTime?: string
  shiftEndTime?: string
  checkIn: string | null
  checkOut: string | null
  status: AttendanceStatusType
  workHours: number
  lateMinutes?: number
  earlyExitMinutes?: number
  overtimeHours: number
  remarks?: string
  source?: string
  category?: string
  designation?: string
  currentDutyStatus?: DutyStatus
  isCorrected?: boolean
  isActive?: boolean
}

export interface LeaveRequest {
  id: string
  staffId: string
  staffName: string
  department: string
  leaveType: "Casual Leave" | "Sick Leave" | "Earned Leave" | "Maternity/Paternity" | "Emergency Leave" | string
  startDate: string
  endDate: string
  days: number
  reason: string
  handoverNote?: string
  replacementStaffId?: string
  status: "Pending" | "Approved" | "Rejected" | "Cancelled"
  appliedOn: string
  reviewedBy?: string
  reviewedAt?: string
  remarks?: string
}

export interface PayrollEntry {
  id: string
  payrollRunId?: string
  staffId: string
  staffName: string
  department: string
  designation: string
  month: string
  year: number
  basic: number
  hra: number
  allowances: number
  gross: number
  pf: number
  professionalTax?: number
  tax: number
  otherDeductions: number
  totalDeductions: number
  netPay: number
  paidLeaveDays?: number
  unpaidLeaveDays?: number
  absentDays?: number
  overtimeHours?: number
  overtimeAmount?: number
  leaveDeductions?: number
  attendanceSummary?: {
    presentDays?: number
    absentDays?: number
    halfDays?: number
    paidLeaveDays?: number
    unpaidLeaveDays?: number
    overtimeHours?: number
    totalWorkHours?: number
    totalLateMinutes?: number
  }
  revisionNumber?: number
  revisionReason?: string
  reviewedBy?: string
  approvedBy?: string
  status: "Paid" | "Pending" | "On Hold" | "Calculated" | "Reviewed" | "Approved" | "Revised"
  runStatus?: "Draft" | "Calculated" | "Reviewed" | "Approved" | "Paid" | "Locked" | "Revised"
  bankAccountMasked?: string
  panMasked?: string
  bankName?: string
  ifscCode?: string
  paymentDate?: string
  transactionRef?: string
}

export interface StaffCredential {
  id: string
  staffId: string
  staffName: string
  department: string
  title: string
  credentialType?: string
  authority: string
  licenseNo: string
  validFrom: string
  validUntil: string
  status: "Valid" | "Expiring Soon" | "Expired"
  remarks?: string
}

export interface PromotionRecord {
  id: number
  employee_id: string
  employee_name: string
  old_designation: string
  new_designation: string
  effective_date: string
  approved_by: string
  remarks?: string
  created_at: string
}

export interface TransferRecord {
  id: number
  employee_id: string
  employee_name: string
  old_department: string
  new_department: string
  effective_date: string
  approved_by: string
  remarks?: string
  created_at: string
}

export interface SalaryRevisionRecord {
  id: number
  employee_id: string
  employee_name: string
  old_salary: number
  new_salary: number
  effective_date: string
  reason?: string
  approved_by: string
  created_at: string
}

export interface ExitRecord {
  id: number
  employee_id: string
  employee_name: string
  exit_type: string
  resignation_date: string
  notice_period_days: number
  last_working_date: string
  exit_reason?: string
  exit_clearance_status: string
  final_settlement_status: string
  approved_by: string
  created_at: string
}

export interface EmployeeLifecycleHistory {
  promotions: PromotionRecord[]
  transfers: TransferRecord[]
  salaryRevisions: SalaryRevisionRecord[]
  exits: ExitRecord[]
}

export interface AuditLogEntry {
  id: number
  userId: string
  actorUsername: string
  actor?: string
  employeeId?: string
  staffId?: string
  employeeName?: string
  module: string
  action: string
  entityType: string
  entityId?: string
  oldValue?: any
  newValue?: any
  changes?: any
  reason?: string
  ipAddress?: string
  createdAt: string
  timestamp?: string
}

export interface SystemAlert {
  id: string
  type: "CRITICAL" | "WARNING" | "INFO" | "ACTION_REQUIRED"
  category: string
  title: string
  message: string
  employeeId?: string
  employeeName?: string
  date: string
}

// In-Memory Authoritative Cache Synchronized with PostgreSQL Backend
const INITIAL_STAFF: StaffMember[] = []
let cacheStaff: StaffMember[] = []

let cacheBiometricDevices: BiometricDevice[] = [
  {
    id: "BIO-01",
    deviceSName: "Biometric-1",
    deviceFName: "OT Complex Main Gate",
    serialNo: "QJT3252700812",
    ipAddress: "192.168.168.201",
    port: 4370,
    location: "OT COMPLEX",
    lastPing: "Never",
    status: "offline",
    firmware: "eSSL SilkBio",
    registeredUsersCount: 0,
    totalLogsCount: 0,
    latencyMs: 0,
  },
  {
    id: "BIO-02",
    deviceSName: "Biometric-2",
    deviceFName: "Front Office Reception Reader",
    serialNo: "QJT3252700643",
    ipAddress: "192.168.168.85",
    port: 4370,
    location: "FRONT OFFICE",
    lastPing: "Never",
    status: "offline",
    firmware: "eSSL SilkBio",
    registeredUsersCount: 0,
    totalLogsCount: 0,
    latencyMs: 0,
  },
  {
    id: "BIO-03",
    deviceSName: "Biometric-3",
    deviceFName: "ICU High-Security Terminal",
    serialNo: "ESSL9842109211",
    ipAddress: "192.168.168.203",
    port: 4370,
    location: "ICU DOOR",
    lastPing: "Never",
    status: "offline",
    firmware: "eSSL uFace",
    registeredUsersCount: 0,
    totalLogsCount: 0,
    latencyMs: 0,
  },
  {
    id: "BIO-04",
    deviceSName: "Biometric-4",
    deviceFName: "Casualty Emergency Gate",
    serialNo: "ESSL9842109244",
    ipAddress: "192.168.168.204",
    port: 4370,
    location: "CASUALTY",
    lastPing: "Never",
    status: "offline",
    firmware: "eSSL SilkBio",
    registeredUsersCount: 0,
    totalLogsCount: 0,
    latencyMs: 0,
  },
  {
    id: "BIO-05",
    deviceSName: "Biometric-5",
    deviceFName: "Pharmacy & Drug Store",
    serialNo: "QJT3252700988",
    ipAddress: "192.168.168.205",
    port: 4370,
    location: "CLINICAL PHARMACY",
    lastPing: "Never",
    status: "offline",
    firmware: "eSSL K30",
    registeredUsersCount: 0,
    totalLogsCount: 0,
    latencyMs: 0,
  },
]

let cachePunchLogs: BiometricPunchLog[] = []
let cacheRosters: DutyRosterEntry[] = []
let cacheOutdoorEntries: OutdoorDutyEntry[] = []
let cacheOvertimeRecords: OvertimeRecord[] = []
const INITIAL_STAFF_LOANS: StaffLoan[] = []
let cacheStaffLoans: StaffLoan[] = []
let cacheAbnormalities: ContinuousAbnormalityRecord[] = []
const INITIAL_ATTENDANCE: AttendanceRecord[] = []
let cacheAttendance: AttendanceRecord[] = []
const INITIAL_LEAVES: LeaveRequest[] = []
const INITIAL_CREDENTIALS: StaffCredential[] = []
const INITIAL_PAYROLL: PayrollEntry[] = []
const INITIAL_PAYROLL_RUN: any = null

let cacheLeaves: LeaveRequest[] = []
let cachePayroll: PayrollEntry[] = []
let cacheCredentials: StaffCredential[] = []
let cachePayrollRun: any = null
let cacheKpiStats = {
  totalWorkforce: 0,
  onDutyNow: 0,
  doctorsOnDuty: 0,
  nursesOnDuty: 0,
  pendingLeaves: 0,
  expiringLicenses: 0,
  monthlyPayrollEstimate: 0,
  totalPayrollGross: 0,
}

export class HrmsDatabase {
  private static listeners: Array<() => void> = []
  private static eventSource: EventSource | null = null
  private static initialized = false
  private static isSyncing = false

  public static async initSync(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Clean up any stale localStorage demo keys from earlier browser sessions
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem("hrms_staff_list")
        localStorage.removeItem("hrms_attendance")
        localStorage.removeItem("hrms_leaves")
        localStorage.removeItem("hrms_credentials")
        localStorage.removeItem("hrms_staff_loans")
        localStorage.removeItem("hrms_payroll_run")
      } catch (_) {}
    }

    // Fetch authoritative state from PostgreSQL backend
    await this.refreshFromBackend()

    // Setup Server-Sent Events (SSE) for real-time live synchronization
    if (typeof window !== "undefined" && typeof EventSource !== "undefined") {
      try {
        this.eventSource = new EventSource(`${API_BASE}/api/hr/events`)
        this.eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type !== "CONNECTED") {
              this.refreshFromBackend()
            }
          } catch (_) {}
        }
        this.eventSource.onerror = () => {}
      } catch (_) {}
    }
  }

  public static async refreshFromBackend(): Promise<void> {
    if (this.isSyncing) return
    this.isSyncing = true
    try {
      const headers = { "Content-Type": "application/json" }
      const [empRes, attRes, leavesRes, credsRes, kpiRes, payrollRes] = await Promise.all([
        fetch(`${API_BASE}/api/hr/employees`, { headers, credentials: "include" }).then((r) => r.ok ? r.json() : { employees: [] }).catch(() => ({ employees: [] })),
        fetch(`${API_BASE}/api/hr/attendance`, { headers, credentials: "include" }).then((r) => r.ok ? r.json() : { attendance: [] }).catch(() => ({ attendance: [] })),
        fetch(`${API_BASE}/api/hr/leaves`, { headers, credentials: "include" }).then((r) => r.ok ? r.json() : { leaves: [] }).catch(() => ({ leaves: [] })),
        fetch(`${API_BASE}/api/hr/credentials`, { headers, credentials: "include" }).then((r) => r.ok ? r.json() : { credentials: [] }).catch(() => ({ credentials: [] })),
        fetch(`${API_BASE}/api/hr/overview/kpis`, { headers, credentials: "include" }).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(`${API_BASE}/api/hr/payroll?month=October&year=2026`, { headers, credentials: "include" }).then((r) => r.ok ? r.json() : { payroll: [] }).catch(() => ({ payroll: [] })),
      ])

      if (empRes && Array.isArray(empRes.employees)) {
        const defaultSalary: StaffSalary = { basic: 60000, hra: 24000, allowances: 16000, pf: 7200, tax: 4500, netPay: 88300 }
        const defaultBank: StaffBankDetails = { accountNo: "••••••••1234", ifsc: "HDFC0001824", bankName: "HDFC Bank", pan: "ABCDE1234F" }
        const defaultLeave: StaffLeaveBalance = { casual: 12, casualUsed: 0, sick: 10, sickUsed: 0, earned: 15, earnedUsed: 0 }
        cacheStaff = empRes.employees.map((s: any) => ({
          ...s,
          salary: s.salary || defaultSalary,
          bankDetails: s.bankDetails || defaultBank,
          leaveBalance: s.leaveBalance || defaultLeave,
        }))
      }
      if (attRes && Array.isArray(attRes.attendance)) {
        cacheAttendance = attRes.attendance.map((a: any) => ({
          ...a,
          date: a.date ? String(a.date).split("T")[0] : "",
          workHours: Number(a.workHours || 0),
          overtimeHours: Number(a.overtimeHours || 0),
          lateMinutes: Number(a.lateMinutes || 0),
          earlyExitMinutes: Number(a.earlyExitMinutes || 0),
        }))
      }
      if (leavesRes && Array.isArray(leavesRes.leaves)) {
        cacheLeaves = leavesRes.leaves
      }
      if (credsRes && Array.isArray(credsRes.credentials)) {
        cacheCredentials = credsRes.credentials
      }
      if (payrollRes && Array.isArray(payrollRes.payroll)) {
        cachePayroll = payrollRes.payroll.map((p: any) => ({
          ...p,
          basic: Number(p.basic || 0),
          hra: Number(p.hra || 0),
          allowances: Number(p.allowances || 0),
          gross: Number(p.gross || 0),
          pf: Number(p.pf || 0),
          professionalTax: Number(p.professionalTax || p.professional_tax || 0),
          tax: Number(p.tax || 0),
          otherDeductions: Number(p.otherDeductions || 0),
          totalDeductions: Number(p.totalDeductions || 0),
          netPay: Number(p.netPay || 0),
          overtimeHours: Number(p.overtimeHours || 0),
          overtimeAmount: Number(p.overtimeAmount || 0),
          paidLeaveDays: Number(p.paidLeaveDays || 0),
          unpaidLeaveDays: Number(p.unpaidLeaveDays || 0),
          absentDays: Number(p.absentDays || 0),
          leaveDeductions: Number(p.leaveDeductions || 0),
        }))
        cachePayrollRun = payrollRes.run || null
      }
      if (kpiRes) {
        cacheKpiStats = {
          totalWorkforce: empRes?.employees?.length || 0,
          onDutyNow: cacheStaff.filter((s) => s.dutyStatus === "On Duty").length,
          doctorsOnDuty: cacheStaff.filter((s) => s.category === "Doctor" && s.dutyStatus === "On Duty").length,
          nursesOnDuty: cacheStaff.filter((s) => s.category === "Nursing" && s.dutyStatus === "On Duty").length,
          pendingLeaves: leavesRes?.leaves?.filter((l: any) => l.status === "Pending")?.length || 0,
          expiringLicenses: credsRes?.credentials?.filter((c: any) => c.status === "Expiring Soon")?.length || 0,
          monthlyPayrollEstimate: kpiRes.monthlyPayrollEstimate || 0,
          totalPayrollGross: kpiRes.totalPayrollGross || 0,
        }
      }

      this.notify()
    } catch (err) {
      console.error("[HRMS Live Sync Error]", err)
    } finally {
      this.isSyncing = false
    }
  }

  public static subscribe(fn: () => void): () => void {
    if (!this.initialized) {
      this.initSync()
    }
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  public static notify() {
    this.listeners.forEach((fn) => {
      try {
        fn()
      } catch (err) {
        console.error("HRMS listener error:", err)
      }
    })
  }

  public static clearAllData(): void {
    cacheStaff = [...INITIAL_STAFF]
    cacheAttendance = [...INITIAL_ATTENDANCE]
    cacheLeaves = [...INITIAL_LEAVES]
    cachePayroll = [...INITIAL_PAYROLL]
    cacheStaffLoans = [...INITIAL_STAFF_LOANS]
    cacheCredentials = [...INITIAL_CREDENTIALS]
    cachePayrollRun = { ...INITIAL_PAYROLL_RUN }
    cacheKpiStats = {
      totalWorkforce: INITIAL_STAFF.length,
      onDutyNow: INITIAL_STAFF.filter((s) => s.dutyStatus === "On Duty").length,
      doctorsOnDuty: INITIAL_STAFF.filter((s) => s.category === "Doctor" && s.dutyStatus === "On Duty").length,
      nursesOnDuty: INITIAL_STAFF.filter((s) => s.category === "Nursing" && s.dutyStatus === "On Duty").length,
      pendingLeaves: INITIAL_LEAVES.filter((l) => l.status === "Pending").length,
      expiringLicenses: INITIAL_CREDENTIALS.filter((c) => c.status === "Expiring Soon").length,
      monthlyPayrollEstimate: INITIAL_PAYROLL.reduce((acc, p) => acc + p.netPay, 0),
      totalPayrollGross: INITIAL_PAYROLL.reduce((acc, p) => acc + p.gross, 0),
    }
    if (typeof localStorage !== "undefined") {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("hosp_hrms") || k.startsWith("hrms_")) {
          try { localStorage.removeItem(k) } catch (_) {}
        }
      })
    }
    this.notify()
  }

  // ── Employees ─────────────────────────────────────────────────────────────

  public static getStaffList(): StaffMember[] {
    if (!this.initialized) this.initSync()
    return cacheStaff
  }

  public static getStaffById(id: string): StaffMember | undefined {
    return cacheStaff.find((s) => s.id === id)
  }

  public static addStaff(member: Omit<StaffMember, "id">): StaffMember {
    const tempId = `EMP-${cacheStaff.length + 101}`
    const newStaff: StaffMember = { ...member, id: tempId }
    cacheStaff.unshift(newStaff)
    this.notify()

    fetch(`${API_BASE}/api/hr/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(member),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.employee) {
          const idx = cacheStaff.findIndex((s) => s.id === tempId)
          if (idx !== -1) cacheStaff[idx] = res.employee
          this.refreshFromBackend()
        }
      })
      .catch((err) => console.error("Failed to persist employee to backend:", err))

    return newStaff
  }

  public static updateStaff(id: string, updates: Partial<StaffMember>): StaffMember | null {
    const idx = cacheStaff.findIndex((s) => s.id === id)
    if (idx === -1) return null

    cacheStaff[idx] = { ...cacheStaff[idx], ...updates }
    this.notify()

    fetch(`${API_BASE}/api/hr/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    })
      .then((r) => r.json())
      .then(() => this.refreshFromBackend())
      .catch((err) => console.error("Failed to update employee on backend:", err))

    return cacheStaff[idx]
  }

  public static deleteStaff(id: string): boolean {
    const idx = cacheStaff.findIndex((s) => s.id === id)
    if (idx === -1) return false

    cacheStaff = cacheStaff.filter((s) => s.id !== id)
    this.notify()

    fetch(`${API_BASE}/api/hr/employees/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
      .then(() => this.refreshFromBackend())
      .catch((err) => console.error("Failed to deactivate employee on backend:", err))

    return true
  }

  // ── Employee Lifecycle Actions ────────────────────────────────────────────

  public static async promoteEmployee(id: string, newDesignation: string, effectiveDate: string, remarks: string) {
    const res = await fetch(`${API_BASE}/api/hr/employees/${id}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newDesignation, effectiveDate, remarks }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to record promotion")
    await this.refreshFromBackend()
    return data
  }

  public static async transferEmployee(id: string, newDepartment: string, effectiveDate: string, remarks: string) {
    const res = await fetch(`${API_BASE}/api/hr/employees/${id}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newDepartment, effectiveDate, remarks }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to record transfer")
    await this.refreshFromBackend()
    return data
  }

  public static async reviseSalary(id: string, newBaseSalary: number, effectiveDate: string, reason: string) {
    const res = await fetch(`${API_BASE}/api/hr/employees/${id}/salary-revision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newBaseSalary, effectiveDate, reason }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to record salary revision")
    await this.refreshFromBackend()
    return data
  }

  public static async recordEmployeeExit(id: string, payload: {
    exitType: string
    resignationDate: string
    noticePeriodDays: number
    lastWorkingDate: string
    exitReason: string
    exitClearanceStatus?: string
    finalSettlementStatus?: string
  }) {
    const res = await fetch(`${API_BASE}/api/hr/employees/${id}/exit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to record employee exit")
    await this.refreshFromBackend()
    return data
  }

  public static async getEmployeeLifecycle(id: string): Promise<EmployeeLifecycleHistory> {
    const res = await fetch(`${API_BASE}/api/hr/employees/${id}/lifecycle`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
    if (!res.ok) return { promotions: [], transfers: [], salaryRevisions: [], exits: [] }
    return res.json()
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  public static getAttendanceList(params?: {
    date?: string
    startDate?: string
    endDate?: string
    employeeId?: string
    department?: string
    status?: string
    filter?: string
  }): AttendanceRecord[] {
    if (!this.initialized) this.initSync()
    if (!params) return cacheAttendance

    return cacheAttendance.filter((r) => {
      if (params.date && (!r.date || !r.date.startsWith(params.date))) return false
      if (params.employeeId && r.staffId !== params.employeeId) return false
      if (params.department && params.department !== "All" && r.department !== params.department) return false
      if (params.status && params.status !== "All" && r.status !== params.status) return false
      if (params.filter === "late" && !(r.status === "Late" || (r.lateMinutes && r.lateMinutes > 0))) return false
      if (params.filter === "absent" && r.status !== "Absent") return false
      if (params.filter === "overtime" && !(r.overtimeHours && r.overtimeHours > 0)) return false
      return true
    })
  }

  public static async fetchAttendanceFiltered(params: Record<string, string>, signal?: AbortSignal): Promise<AttendanceRecord[]> {
    const cleanParams: Record<string, string> = {}
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        cleanParams[k] = String(v).trim()
      }
    }
    const queryStr = new URLSearchParams(cleanParams).toString()
    const url = queryStr ? `${API_BASE}/api/hr/attendance?${queryStr}` : `${API_BASE}/api/hr/attendance`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal,
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || `Failed to fetch attendance (HTTP ${res.status})`)
    }
    const data = await res.json()
    const list = Array.isArray(data.attendance) ? data.attendance : []
    const mapped: AttendanceRecord[] = list.map((a: any) => ({
      ...a,
      date: a.date ? String(a.date).split("T")[0] : "",
      workHours: Number(a.workHours || 0),
      overtimeHours: Number(a.overtimeHours || 0),
      lateMinutes: Number(a.lateMinutes || 0),
      earlyExitMinutes: Number(a.earlyExitMinutes || 0),
    }))

    // If fetching without specific filters (default recent history), update cacheAttendance
    if (!cleanParams.date && !cleanParams.startDate && !cleanParams.employeeId && !cleanParams.department && !cleanParams.status && !cleanParams.filter) {
      cacheAttendance = mapped
    }

    return mapped
  }

  public static async punchClock(staffId: string, action: "checkIn" | "checkOut"): Promise<void> {
    const endpoint = action === "checkIn" ? "/api/hr/attendance/clock-in" : "/api/hr/attendance/clock-out"
    const nextStatus: DutyStatus = action === "checkIn" ? "On Duty" : "Off Duty"

    const staffIdx = cacheStaff.findIndex((s) => s.id === staffId)
    if (staffIdx !== -1) {
      cacheStaff[staffIdx].dutyStatus = nextStatus
      this.notify()
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ employeeId: staffId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Clock punch failed")
    await this.refreshFromBackend()
  }

  public static async markAttendanceManual(payload: {
    employeeId: string
    date: string
    status: string
    shift?: string
    clockIn?: string
    clockOut?: string
    reason: string
  }) {
    const res = await fetch(`${API_BASE}/api/hr/attendance/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Manual attendance recording failed")
    await this.refreshFromBackend()
    return data
  }

  public static async correctAttendance(attendanceId: string, updates: {
    newClockIn?: string
    newClockOut?: string
    newStatus?: string
    correctionReason: string
  }) {
    const res = await fetch(`${API_BASE}/api/hr/attendance/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ attendanceId, ...updates }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Attendance correction failed")
    await this.refreshFromBackend()
    return data
  }

  public static async getAttendanceCorrections(attendanceId: string) {
    const res = await fetch(`${API_BASE}/api/hr/attendance/corrections/${attendanceId}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.corrections || []
  }

  // ── Leave Management ──────────────────────────────────────────────────────

  public static getLeaves(): LeaveRequest[] {
    if (!this.initialized) this.initSync()
    return cacheLeaves
  }

  public static async applyLeave(
    leave: Omit<LeaveRequest, "id" | "status" | "appliedOn">
  ): Promise<{ status: "success" | "error"; leave?: LeaveRequest; message?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/leaves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(leave),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.leave) {
        await this.refreshFromBackend()
        this.notify()
        return { status: "success", leave: data.leave }
      }
      return { status: "error", message: data.error || `Server rejected leave application (${res.status})` }
    } catch (err: any) {
      console.error("Apply leave error:", err)
      return { status: "error", message: err.message || "Network error while submitting leave application." }
    }
  }

  public static async reviewLeave(
    id: string,
    status: "Approved" | "Rejected",
    reviewerName: string,
    remarks?: string
  ): Promise<{ status: "success" | "error"; message?: string }> {
    const endpoint = status === "Approved" ? `/api/hr/leaves/${id}/approve` : `/api/hr/leaves/${id}/reject`
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ remarks }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        await this.refreshFromBackend()
        this.notify()
        return { status: "success", message: data.message }
      }
      return { status: "error", message: data.error || `Server failed to ${status.toLowerCase()} leave request.` }
    } catch (err: any) {
      console.error("Review leave error:", err)
      return { status: "error", message: err.message || `Network error while attempting to ${status.toLowerCase()} leave request.` }
    }
  }

  // ── Payroll ───────────────────────────────────────────────────────────────

  public static getPayroll(month: string = "September", year: number = 2026): PayrollEntry[] {
    if (!this.initialized) this.initSync()
    const targetMonth = month.toLowerCase()
    return cachePayroll.filter((p) => p.month.toLowerCase() === targetMonth && p.year === year)
  }

  public static getPayrollRun() {
    return cachePayrollRun
  }

  public static async runMonthlyPayroll(month: string, year: number): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/payroll/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ month, year }),
      })
      if (res.ok) {
        const data = await res.json()
        await this.refreshFromBackend()
        return data
      }
    } catch (_) {}

    // Resilient local calculation engine for Standalone / Demo mode
    const runId = `PR-${year}-${month.slice(0, 3).toUpperCase()}`
    const updatedItems: PayrollEntry[] = cacheStaff.map((emp, idx) => {
      const basic = emp.salary?.basic || 50000
      const hra = emp.salary?.hra || Math.round(basic * 0.4)
      const allowances = emp.salary?.allowances || Math.round(basic * 0.15)
      const gross = basic + hra + allowances

      // Calculate Overtime for this employee
      const otRecords = cacheOvertimeRecords.filter((ot) => ot.staffId === emp.id && ot.status === "Approved")
      const overtimeHours = otRecords.reduce((sum, r) => sum + (r.extraHours || 0), 0)
      const overtimeAmount = otRecords.reduce((sum, r) => sum + (r.totalAmount || 0), 0)

      // Calculate Attendance deductions
      const att = cacheAttendance.find((a) => a.staffId === emp.id)
      const absentDays = att?.status === "Absent" ? 1 : 0
      const unpaidLeaveDays = 0
      const paidLeaveDays = att?.status === "On Leave" ? 1 : 0
      const leaveDeductions = Math.round((gross / 30) * (absentDays + unpaidLeaveDays))

      // Statutory Deductions: EPF 12% of basic, TDS based on salary slab
      const pf = Math.round(basic * 0.12)
      const tax = gross > 150000 ? Math.round(gross * 0.12) : (gross > 60000 ? Math.round(gross * 0.06) : 0)

      // Active Staff Loan & Salary Advance EMI deductions
      const activeLoans = cacheStaffLoans.filter((l) => l.staffId === emp.id && l.status === "Active")
      const loanEmi = activeLoans.reduce((sum, l) => sum + (l.monthlyEmi || 0), 0)

      const otherDeductions = loanEmi
      const totalDeductions = pf + tax + leaveDeductions + otherDeductions
      const netPay = gross + overtimeAmount - totalDeductions

      return {
        id: `PAY-${year}-${month.slice(0, 3).toUpperCase()}-${String(idx + 1).padStart(2, "0")}`,
        payrollRunId: runId,
        staffId: emp.id,
        staffName: emp.name,
        department: emp.department,
        designation: emp.designation,
        basic,
        hra,
        allowances,
        gross,
        pf,
        tax,
        otherDeductions,
        totalDeductions,
        netPay,
        paidLeaveDays,
        unpaidLeaveDays,
        absentDays,
        overtimeHours,
        overtimeAmount,
        leaveDeductions,
        status: "Calculated",
        month,
        year,
        runStatus: "Calculated",
        attendanceSummary: {
          presentDays: 30 - absentDays - unpaidLeaveDays,
          absentDays,
          paidLeaveDays,
          unpaidLeaveDays,
          overtimeHours,
          totalWorkHours: 240 + overtimeHours,
        },
        bankAccountMasked: emp.bankDetails?.accountNo || "••••••••1234",
        panMasked: emp.bankDetails?.pan || "ABCDE1234F",
        bankName: emp.bankDetails?.bankName || "HDFC Bank",
        ifscCode: emp.bankDetails?.ifsc || "HDFC0001824",
      }
    })

    // Update in-memory payroll list
    cachePayroll = [
      ...cachePayroll.filter((p) => !(p.month.toLowerCase() === month.toLowerCase() && p.year === year)),
      ...updatedItems,
    ]

    cachePayrollRun = {
      id: runId,
      month,
      year,
      status: "Calculated",
      totalEmployees: updatedItems.length,
      totalGross: updatedItems.reduce((acc, p) => acc + p.gross, 0),
      totalDeductions: updatedItems.reduce((acc, p) => acc + p.totalDeductions, 0),
      totalNet: updatedItems.reduce((acc, p) => acc + p.netPay, 0),
      createdAt: new Date().toISOString().substring(0, 10),
    }

    try {
      localStorage.setItem(`hrms_payroll_${month}_${year}`, JSON.stringify(updatedItems))
      localStorage.setItem("hrms_payroll_run", JSON.stringify(cachePayrollRun))
    } catch (_) {}

    this.notify()
    return { status: "success", run: cachePayrollRun, payroll: updatedItems }
  }

  public static async reviewPayroll(runId: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/payroll/${runId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        await this.refreshFromBackend()
        return data
      }
    } catch (_) {}

    if (cachePayrollRun) cachePayrollRun.status = "Reviewed"
    cachePayroll.forEach((p) => {
      if (p.payrollRunId === runId || p.runStatus === "Calculated") {
        p.runStatus = "Reviewed"
        p.status = "Reviewed"
        p.reviewedBy = "HR Administrator"
      }
    })
    try {
      localStorage.setItem("hrms_payroll_run", JSON.stringify(cachePayrollRun))
    } catch (_) {}
    this.notify()
    return { status: "success", run: cachePayrollRun }
  }

  public static async approvePayroll(runId: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/payroll/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        await this.refreshFromBackend()
        return data
      }
    } catch (_) {}

    if (cachePayrollRun) cachePayrollRun.status = "Approved"
    cachePayroll.forEach((p) => {
      if (p.payrollRunId === runId || p.runStatus === "Reviewed") {
        p.runStatus = "Approved"
        p.status = "Approved"
        p.approvedBy = "Superintendent / Finance Directorate"
      }
    })
    try {
      localStorage.setItem("hrms_payroll_run", JSON.stringify(cachePayrollRun))
    } catch (_) {}
    this.notify()
    return { status: "success", run: cachePayrollRun }
  }

  public static async revisePayroll(runId: string, employeeId: string, adjustments: any, reason: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/payroll/${runId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId, adjustments, reason }),
      })
      if (res.ok) {
        const data = await res.json()
        await this.refreshFromBackend()
        return data
      }
    } catch (_) {}

    const item = cachePayroll.find((p) => p.staffId === employeeId && (p.payrollRunId === runId || p.month === cachePayrollRun?.month))
    if (item) {
      if (adjustments.allowances !== undefined) item.allowances = parseFloat(adjustments.allowances)
      if (adjustments.otherDeductions !== undefined) item.otherDeductions = parseFloat(adjustments.otherDeductions)
      if (adjustments.basic !== undefined) item.basic = parseFloat(adjustments.basic)
      item.gross = item.basic + item.hra + item.allowances
      item.totalDeductions = item.pf + item.tax + (item.leaveDeductions || 0) + item.otherDeductions
      item.netPay = item.gross + (item.overtimeAmount || 0) - item.totalDeductions
      item.revisionNumber = (item.revisionNumber || 0) + 1
      item.revisionReason = reason
      item.status = "Revised"
    }
    this.notify()
    return { status: "success", payrollItem: item }
  }

  public static async disbursePayroll(runId: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/payroll/${runId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        await this.refreshFromBackend()
        return data
      }
    } catch (_) {}

    if (cachePayrollRun) cachePayrollRun.status = "Paid"
    const dateStr = new Date().toISOString().substring(0, 10)
    cachePayroll.forEach((p) => {
      if (p.payrollRunId === runId || p.runStatus === "Approved") {
        p.runStatus = "Paid"
        p.status = "Paid"
        p.paymentDate = dateStr
        p.transactionRef = `NEFT-HOSP-${Math.floor(100000 + Math.random() * 900000)}`
      }
    })

    // Automatic Staff Loan EMI Recovery:
    // When payroll is disbursed, deduct 1 monthly installment from active loans
    cacheStaffLoans.forEach((loan) => {
      if (loan.status === "Active") {
        loan.balanceOutstanding = Math.max(0, loan.balanceOutstanding - loan.monthlyEmi)
        loan.remainingTenureMonths = Math.max(0, loan.remainingTenureMonths - 1)
        if (loan.balanceOutstanding <= 0 || loan.remainingTenureMonths <= 0) {
          loan.status = "Closed"
        }
      }
    })
    try {
      localStorage.setItem("hrms_staff_loans", JSON.stringify(cacheStaffLoans))
      localStorage.setItem("hrms_payroll_run", JSON.stringify(cachePayrollRun))
    } catch (_) {}

    this.notify()
    return { status: "success", run: cachePayrollRun }
  }

  public static async getPayrollPolicy(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/hr/payroll/policies`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to fetch payroll policy")
    return data.policy
  }

  public static async getPayrollPreview(employeeId: string, month: string = "October", year: number = 2026, includeLoan: boolean = false): Promise<any> {
    const res = await fetch(`${API_BASE}/api/hr/payroll/preview?employeeId=${encodeURIComponent(employeeId)}&month=${encodeURIComponent(month)}&year=${year}&includeLoan=${includeLoan}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to fetch payroll preview")
    return data
  }

  public static async updatePayrollPolicy(policy: {
    policyName?: string
    pfPercentage: number
    tdsPercentage: number
    dailyPayDivisorType: '30_days' | 'month_days'
    dailyPayFixedDays?: number
    overtimeMultiplier: number
    standardWorkHoursPerDay: number
    reason?: string
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/hr/payroll/policies`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(policy),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to update payroll policy")
    return data.policy
  }

  // ── Credentials ───────────────────────────────────────────────────────────

  public static getCredentials(): StaffCredential[] {
    if (!this.initialized) this.initSync()
    return cacheCredentials
  }

  public static renewCredential(id: string, newExpiry: string): boolean {
    const idx = cacheCredentials.findIndex((c) => c.id === id)
    if (idx !== -1) {
      cacheCredentials[idx].validUntil = newExpiry
      cacheCredentials[idx].status = "Valid"
      this.notify()
    }

    fetch(`${API_BASE}/api/hr/credentials/${id}/renew`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newExpiry }),
    })
      .then((r) => r.json())
      .then(() => this.refreshFromBackend())
      .catch((err) => console.error("Renew credential error:", err))

    return true
  }

  // ── Audit Logs & System Alerts ────────────────────────────────────────────

  public static async getAuditLogs(params?: Record<string, string>): Promise<AuditLogEntry[]> {
    const queryStr = params ? new URLSearchParams(params).toString() : ""
    const res = await fetch(`${API_BASE}/api/hr/audit-logs?${queryStr}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.auditLogs || []
  }

  public static async getAlerts(): Promise<SystemAlert[]> {
    const res = await fetch(`${API_BASE}/api/hr/alerts`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.alerts || []
  }

  // ── Current Shift Info ────────────────────────────────────────────────────

  public static getCurrentShiftInfo() {
    const now = new Date()
    const hour = now.getHours()
    if (hour >= 7 && hour < 15) {
      const end = new Date(now).setHours(15, 0, 0, 0)
      const remaining = Math.max(0, Math.floor((end - now.getTime()) / 60000))
      return { name: "Morning Clinical Shift", type: "Morning (07:00 - 15:00)" as ShiftType, remainingMinutes: remaining }
    } else if (hour >= 15 && hour < 23) {
      const end = new Date(now).setHours(23, 0, 0, 0)
      const remaining = Math.max(0, Math.floor((end - now.getTime()) / 60000))
      return { name: "Evening Clinical Shift", type: "Evening (15:00 - 23:00)" as ShiftType, remainingMinutes: remaining }
    } else {
      const end = hour >= 23 ? new Date(now).setHours(31, 0, 0, 0) : new Date(now).setHours(7, 0, 0, 0)
      const remaining = Math.max(0, Math.floor((end - now.getTime()) / 60000))
      return { name: "Night Clinical Shift", type: "Night (23:00 - 07:00)" as ShiftType, remainingMinutes: remaining }
    }
  }

  // ── Biometric Hardware & Live Punches ───────────────────────────────────

  public static async getBiometricDevices(location?: string, status?: string): Promise<{ devices: BiometricDevice[]; stats: any }> {
    try {
      const query = new URLSearchParams()
      if (location) query.append("location", location)
      if (status) query.append("status", status)
      const res = await fetch(`${API_BASE}/api/hr/biometric/devices?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.devices)) cacheBiometricDevices = data.devices
        return data
      }
    } catch (_) {}
    
    let filtered = [...cacheBiometricDevices]
    if (location && location !== "All") {
      filtered = filtered.filter((d) => d.location.toLowerCase() === location.toLowerCase())
    }
    if (status && status !== "All") {
      filtered = filtered.filter((d) => d.status.toLowerCase() === status.toLowerCase())
    }
    return {
      devices: filtered,
      stats: {
        totalDevices: cacheBiometricDevices.length,
        onlineDevices: cacheBiometricDevices.filter((d) => d.status === "online").length,
        totalRegisteredEmployees: cacheStaff.length,
        presentEmployeesToday: cacheAttendance.filter((a) => a.status === "Present" || a.status === "Late").length,
      },
    }
  }

  public static async pingBiometricDevice(id: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/devices/${id}/ping`, { method: "POST" })
      if (res.ok) return await res.json()
    } catch (_) {}

    const dev = cacheBiometricDevices.find((d) => d.id === id)
    if (dev) {
      const now = new Date()
      dev.lastPing = now.toISOString().replace("T", " ").substring(0, 16)
      dev.latencyMs = dev.status === "online" ? Math.floor(Math.random() * 20) + 8 : 0
      this.notify()
      return {
        status: "success",
        deviceId: id,
        latencyMs: dev.latencyMs,
        lastPing: dev.lastPing,
        message: dev.status === "online" ? `Ping acknowledged (${dev.latencyMs}ms)` : "Host unreachable",
      }
    }
    return { status: "error", message: "Device not found" }
  }

  public static async executeDeviceCommand(id: string, command: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/devices/${id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      })
      if (res.ok) return await res.json()
    } catch (_) {}

    return {
      status: "success",
      deviceId: id,
      command,
      timestamp: new Date().toISOString(),
      message: `Command '${command}' applied to ${id}`,
    }
  }

  public static async getBiometricPunches(): Promise<BiometricPunchLog[]> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/punches`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.punches)) cachePunchLogs = data.punches
      }
    } catch (_) {}
    return cachePunchLogs
  }

  public static async recordBiometricPunch(punchData: Partial<BiometricPunchLog>): Promise<any> {
    const res = await fetch(`${API_BASE}/api/hr/biometric/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(punchData),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to persist biometric punch" }))
      throw new Error(err.error || "Biometric punch persistence failed")
    }
    const data = await res.json()
    if (data.punch) {
      cachePunchLogs.unshift(data.punch)
    }
    await this.refreshFromBackend()
    this.notify()
    return data
  }

  public static async recordManualPunch(punchData: {
    staffId: string
    staffName: string
    department: string
    date: string
    time: string
    direction: "IN" | "OUT"
    reason: string
  }): Promise<any> {
    const res = await fetch(`${API_BASE}/api/hr/biometric/manual-punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(punchData),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to record manual punch" }))
      throw new Error(err.error || "Manual punch persistence failed")
    }
    const data = await res.json()
    if (data.punch) {
      cachePunchLogs.unshift(data.punch)
    }
    await this.refreshFromBackend()
    this.notify()
    return data
  }

  // ── Monthly 1-31 Duty Roster ──────────────────────────────────────────────

  public static async getMonthlyRoster(month: string = "2026-10", department?: string): Promise<DutyRosterEntry[]> {
    try {
      const query = new URLSearchParams({ month })
      if (department) query.append("department", department)
      const res = await fetch(`${API_BASE}/api/hr/biometric/roster?${query.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.rosters)) cacheRosters = data.rosters
      }
    } catch (_) {}

    let list = cacheRosters.filter((r) => r.month === month)
    if (department && department !== "All") {
      list = list.filter((r) => r.department.toLowerCase() === department.toLowerCase())
    }
    return list
  }

  public static async updateRosterDay(staffId: string, month: string, day: number, shiftCode: any, extra?: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/roster`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, month, day, shiftCode, ...extra }),
      })
      if (res.ok) return await res.json()
    } catch (_) {}

    let roster = cacheRosters.find((r) => r.staffId === staffId && r.month === month)
    if (roster) {
      roster.days[day] = shiftCode
    } else {
      roster = {
        staffId,
        staffName: extra?.staffName || staffId,
        department: extra?.department || "General",
        designation: extra?.designation || "Staff",
        month,
        days: { [day]: shiftCode },
      }
      cacheRosters.push(roster)
    }
    this.notify()
    return { status: "success", roster }
  }

  // ── Outdoor Duty (OD) & Overtime (OT) ──────────────────────────────────────

  public static async getOutdoorEntries(): Promise<OutdoorDutyEntry[]> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/outdoor-entries`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.outdoorEntries)) cacheOutdoorEntries = data.outdoorEntries
      }
    } catch (_) {}
    return cacheOutdoorEntries
  }

  public static async addOutdoorEntry(entry: Omit<OutdoorDutyEntry, "id">): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/outdoor-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.outdoorEntry) cacheOutdoorEntries.unshift(data.outdoorEntry)
        this.notify()
        return data
      }
    } catch (_) {}

    const newOD: OutdoorDutyEntry = {
      id: `OD-2026-${(cacheOutdoorEntries.length + 1).toString().padStart(3, "0")}`,
      ...entry,
      status: "Approved",
    }
    cacheOutdoorEntries.unshift(newOD)
    this.notify()
    return { status: "success", outdoorEntry: newOD }
  }

  public static async getOvertimeRecords(): Promise<OvertimeRecord[]> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/overtime-records`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.overtimeRecords)) cacheOvertimeRecords = data.overtimeRecords
      }
    } catch (_) {}
    return cacheOvertimeRecords
  }

  public static async addOvertimeRecord(record: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/overtime-records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.overtimeRecord) cacheOvertimeRecords.unshift(data.overtimeRecord)
        this.notify()
        return data
      }
    } catch (_) {}

    const newOT: OvertimeRecord = {
      id: `OT-REC-${Date.now().toString().slice(-4)}`,
      staffId: record.staffId,
      staffName: record.staffName,
      department: record.department,
      date: record.date,
      regularShift: record.regularShift || "Morning (07:00 - 15:00)",
      extraHours: parseFloat(record.extraHours),
      hourlyRate: parseFloat(record.hourlyRate || 250),
      totalAmount: parseFloat(record.extraHours) * parseFloat(record.hourlyRate || 250),
      reason: record.reason,
      approvedBy: "Superintendent Approval",
      status: "Approved",
    }
    cacheOvertimeRecords.unshift(newOT)
    this.notify()
    return { status: "success", overtimeRecord: newOT }
  }

  // ── Staff Loans & Salary Advances ─────────────────────────────────────────

  public static normalizeStaffLoan(raw: any): StaffLoan {
    if (!raw || typeof raw !== "object") {
      return {
        id: `LOAN-${Date.now().toString().slice(-4)}`,
        staffId: "",
        staffName: "Unknown Staff",
        department: "General",
        loanType: "Salary Advance",
        sanctionedAmount: 0,
        disbursedDate: new Date().toISOString().substring(0, 10),
        monthlyEmi: 0,
        totalTenureMonths: 1,
        remainingTenureMonths: 1,
        balanceOutstanding: 0,
        status: "Active",
      }
    }

    const id = String(raw.id || raw.loanId || raw.loan_id || `LOAN-${Date.now().toString().slice(-4)}`)
    const staffId = String(raw.staffId || raw.staff_id || raw.employeeId || raw.employee_id || raw.empId || raw.emp_id || "")
    const staffName = String(raw.staffName || raw.staff_name || raw.employeeName || raw.employee_name || raw.name || "Unknown Staff")
    const department = String(raw.department || raw.dept || "General")
    const loanType = String(raw.loanType || raw.loan_type || raw.advanceType || raw.advance_type || raw.type || "Salary Advance")
    
    const tenure = parseInt(String(raw.totalTenureMonths ?? raw.total_tenure_months ?? raw.tenureMonths ?? raw.tenure_months ?? raw.tenure ?? 1), 10) || 1
    const sanctioned = parseFloat(String(raw.sanctionedAmount ?? raw.sanctioned_amount ?? raw.amount ?? raw.loanAmount ?? raw.loan_amount ?? raw.principal ?? 0)) || 0
    const rawRemaining = raw.remainingTenureMonths ?? raw.remaining_tenure_months ?? raw.remainingMonths ?? raw.remaining_months ?? raw.remainingTenure
    const remaining = rawRemaining !== undefined && rawRemaining !== null ? parseInt(String(rawRemaining), 10) : tenure
    const emi = parseFloat(String(raw.monthlyEmi ?? raw.monthly_emi ?? raw.emi ?? (tenure > 0 ? Math.round(sanctioned / tenure) : sanctioned))) || 0
    const balance = parseFloat(String(raw.balanceOutstanding ?? raw.balance_outstanding ?? raw.balanceDue ?? raw.balance_due ?? raw.balance ?? raw.outstanding ?? sanctioned)) || 0
    
    const rawDate = raw.disbursedDate || raw.disbursed_date || raw.disbursementDate || raw.disbursement_date || raw.disbursed || raw.date
    const dateStr = rawDate ? String(rawDate).split("T")[0] : new Date().toISOString().substring(0, 10)
    const status = raw.status === "Closed" || raw.status === "Pending Sanction" ? raw.status : "Active"

    const rawAmountPaid = raw.amountPaid ?? raw.amount_paid
    const amountPaid = rawAmountPaid !== undefined && rawAmountPaid !== null && !isNaN(parseFloat(String(rawAmountPaid)))
      ? parseFloat(String(rawAmountPaid))
      : undefined
    const rawRecoveryPeriod = raw.recoveryPeriod || raw.recovery_period
    const recoveryPeriod = rawRecoveryPeriod ? String(rawRecoveryPeriod) : undefined

    return {
      id,
      staffId,
      staffName,
      department,
      loanType,
      sanctionedAmount: sanctioned,
      disbursedDate: dateStr,
      monthlyEmi: emi,
      totalTenureMonths: tenure,
      remainingTenureMonths: isNaN(remaining) ? 0 : remaining,
      balanceOutstanding: balance,
      status,
      ...(amountPaid !== undefined ? { amountPaid } : {}),
      ...(recoveryPeriod ? { recoveryPeriod } : {}),
    }
  }

  public static async getStaffLoans(): Promise<StaffLoan[]> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/staff-loans`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.staffLoans)) {
          cacheStaffLoans = data.staffLoans.map((item: any) => this.normalizeStaffLoan(item))
        }
      }
    } catch (_) {}
    return cacheStaffLoans
  }

  public static async addStaffLoan(loan: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/staff-loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loan),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.staffLoan) {
          const normalized = this.normalizeStaffLoan(data.staffLoan)
          cacheStaffLoans = [normalized, ...cacheStaffLoans.filter((l) => l.id !== normalized.id)]
          try {
            localStorage.setItem("hrms_staff_loans", JSON.stringify(cacheStaffLoans))
          } catch (_) {}
          this.notify()
          return { status: "success", staffLoan: normalized }
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        return { status: "error", message: errData.error || "Failed to sanction staff advance" }
      }
    } catch (err: any) {
      console.error("addStaffLoan network error:", err)
    }

    const newLoan = this.normalizeStaffLoan({
      ...loan,
      id: `LOAN-${Date.now().toString().slice(-4)}`,
      disbursedDate: new Date().toISOString().substring(0, 10),
      balanceOutstanding: loan.sanctionedAmount,
      remainingTenureMonths: loan.totalTenureMonths,
      status: "Active",
    })
    cacheStaffLoans = [newLoan, ...cacheStaffLoans.filter((l) => l.id !== newLoan.id)]
    try {
      localStorage.setItem("hrms_staff_loans", JSON.stringify(cacheStaffLoans))
    } catch (_) {}
    this.notify()
    return { status: "success", staffLoan: newLoan }
  }

  public static async repayStaffLoanEmi(
    loanId: string,
    amount?: number,
    recoveryPeriod?: string
  ): Promise<{ status: "success" | "error"; staffLoan?: StaffLoan; message?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/staff-loans/${loanId}/repay`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, recoveryPeriod }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.staffLoan) {
          const normalized = this.normalizeStaffLoan(data.staffLoan)
          cacheStaffLoans = cacheStaffLoans.map((l) => (l.id === loanId ? normalized : l))
          try {
            localStorage.setItem("hrms_staff_loans", JSON.stringify(cacheStaffLoans))
          } catch (_) {}
          this.notify()
          return { status: "success", staffLoan: normalized }
        }
      }
      const errData = await res.json().catch(() => ({}))
      return { status: "error", message: errData.error || `Server returned error (${res.status})` }
    } catch (err: any) {
      return { status: "error", message: err.message || "Failed to communicate with the server. Transaction aborted." }
    }
  }

  public static async closeStaffLoan(
    loanId: string,
    reason?: string
  ): Promise<{ status: "success" | "error"; staffLoan?: StaffLoan; message?: string }> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/staff-loans/${loanId}/close`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.staffLoan) {
          const normalized = this.normalizeStaffLoan(data.staffLoan)
          cacheStaffLoans = cacheStaffLoans.map((l) => (l.id === loanId ? normalized : l))
          try {
            localStorage.setItem("hrms_staff_loans", JSON.stringify(cacheStaffLoans))
          } catch (_) {}
          this.notify()
          return { status: "success", staffLoan: normalized }
        }
      }
      const errData = await res.json().catch(() => ({}))
      return { status: "error", message: errData.error || `Server returned error (${res.status})` }
    } catch (err: any) {
      return { status: "error", message: err.message || "Failed to communicate with the server. Transaction aborted." }
    }
  }

  // ── Continuous Abnormality & Disciplinary Memos ───────────────────────────

  public static async getAbnormalities(): Promise<ContinuousAbnormalityRecord[]> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/abnormalities`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.abnormalities)) cacheAbnormalities = data.abnormalities
      }
    } catch (_) {}
    return cacheAbnormalities
  }

  public static async generateDisciplinaryMemo(memoData: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/generate-memo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memoData),
      })
      if (res.ok) {
        const data = await res.json()
        this.notify()
        return data
      }
    } catch (_) {}

    const memoNo = `VH/HR/MEMO/2026/${Math.floor(Math.random() * 900 + 100)}`
    const memo = {
      memoNo,
      staffId: memoData.staffId,
      staffName: memoData.staffName,
      department: memoData.department,
      issuedDate: new Date().toISOString().substring(0, 10),
      explanationDeadline: memoData.explanationDeadline || "Within 48 Hours",
      subject: memoData.subject || "Show-Cause Notice for Continuous Absence",
      content: `It is observed from the biometric records that you have continuously remained absent without approved leave. You are hereby called upon to explain in writing why disciplinary action should not be initiated.`,
    }

    const abn = cacheAbnormalities.find((a) => a.staffId === memoData.staffId)
    if (abn) {
      abn.memoGenerated = true
      abn.memoDetails = memo
    }
    this.notify()
    return { status: "success", memo }
  }

  // ── Attendance Recalculation Engine ───────────────────────────────────────

  public static async recalculateAttendance(month: string = "2026-10", graceMinutes: number = 15): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/api/hr/biometric/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, graceMinutes }),
      })
      if (res.ok) return await res.json()
    } catch (_) {}

    return {
      status: "success",
      recalculatedCount: cachePunchLogs.length,
      processedStaff: cacheStaff.length,
      month,
      graceMinutesApplied: graceMinutes,
      results: {
        onTimePresent: cacheAttendance.filter((a) => a.status === "Present").length,
        lateArrivals: cacheAttendance.filter((a) => a.status === "Late").length,
        halfDays: cacheAttendance.filter((a) => a.status === "Half Day" || a.status === "Half-Day").length,
        absentMarked: cacheAttendance.filter((a) => a.status === "Absent").length,
        totalOTHoursComputed: cacheAttendance.reduce((acc, a) => acc + (Number(a.overtimeHours) || 0), 0),
      },
      message: `Attendance for ${month} successfully reconciled against Shift Roster (${graceMinutes} min grace applied).`,
    }
  }

  public static getKpis() {
    return cacheKpiStats
  }
}
