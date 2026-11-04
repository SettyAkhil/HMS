// Mirrors backend/hr-api/app/schemas. Dates are ISO strings.

export type Page<T> = { items: T[]; total: number; page: number; page_size: number }

export const EMPLOYEE_CATEGORIES = [
  ["doctor", "Doctor"],
  ["consultant", "Consultant"],
  ["nurse", "Nurse"],
  ["radiologist", "Radiologist"],
  ["lab_technician", "Laboratory technician"],
  ["pharmacist", "Pharmacist"],
  ["ot_technician", "OT technician"],
  ["icu_technician", "ICU technician"],
  ["emergency_staff", "Emergency staff"],
  ["front_office", "Front office"],
  ["billing", "Billing"],
  ["administration", "Administration"],
  ["housekeeping", "Housekeeping"],
  ["security", "Security"],
  ["support", "Support"],
] as const
export type EmployeeCategory = (typeof EMPLOYEE_CATEGORIES)[number][0]

export const EMPLOYMENT_TYPES = [
  ["permanent", "Permanent"],
  ["contract", "Contract"],
  ["probation", "Probation"],
  ["visiting", "Visiting"],
  ["intern", "Intern"],
  ["part_time", "Part time"],
] as const

export const categoryLabel = (c?: string | null) =>
  EMPLOYEE_CATEGORIES.find(([k]) => k === c)?.[1] ?? (c ? c.replace(/_/g, " ") : "—")

export type Hospital = { id: string; code: string; name: string }
export type Branch = { id: string; hospital_id: string; code: string; name: string; city: string | null; address: string | null }
export type Department = {
  id: string
  code: string
  name: string
  branch_id: string | null
  parent_id: string | null
  kind: string
  head_employee_id: string | null
  head_name: string | null
  cost_center: string | null
  annual_budget: string | null
  status: string
  hms_module: string | null
  census_wards: string[]
  headcount: number
}
export type Unit = { id: string; department_id: string; code: string; name: string; unit_type: string | null; bed_capacity: number | null }
export type Designation = {
  id: string
  code: string
  title: string
  job_category: string
  grade: string | null
  is_clinical: boolean
  requires_registration: boolean
  headcount: number
}
export type TreeNode = {
  id: string
  type: "hospital" | "branch" | "department" | "unit"
  name: string
  code: string
  headcount: number
  head_name?: string | null
  children: TreeNode[]
}

export type EmployeeListItem = {
  id: string
  employee_code: string
  full_name: string
  employee_category: string
  employment_type: string
  status: string
  designation: string | null
  department: string | null
  branch: string | null
  phone: string | null
  joining_date: string | null
  biometric_mapped: boolean
}

export type Credential = {
  id: string
  credential_type: string
  number: string
  issuing_authority: string | null
  issued_on: string | null
  expires_on: string | null
  verification_status: string
  verified_by: string | null
  verified_at: string | null
  days_to_expiry: number | null
}

export type DepartmentAssignment = {
  id: string
  department_id: string
  department_name: string | null
  unit_id: string | null
  is_primary: boolean
  allocation_percent: number
  effective_from: string
  effective_to: string | null
}

export type Contact = { id: string; kind: string; name: string; relationship: string | null; phone: string | null; email: string | null }

export type EmployeeDetail = {
  id: string
  employee_code: string
  full_name: string
  first_name: string
  middle_name: string | null
  last_name: string | null
  gender: string | null
  email: string | null
  phone: string | null
  date_of_birth: string | null
  address_line: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  employee_category: string
  employment_type: string
  status: string
  joining_date: string | null
  exit_date: string | null
  contract_end_date: string | null
  branch_id: string | null
  branch: string | null
  designation_id: string | null
  designation: string | null
  reporting_manager_id: string | null
  reporting_manager: string | null
  salary_structure_ref: string | null
  hms_username: string | null
  profile: {
    qualification: string | null
    specialization: string | null
    blood_group: string | null
    clinical_competencies: string[]
    languages: string[]
  }
  departments: DepartmentAssignment[]
  contacts: Contact[]
  credentials: Credential[]
  biometric_ids: string[]
  personal_restricted: boolean
  created_at: string
  updated_at: string
}

export type EmploymentRecord = {
  id: string
  change_type: string
  effective_from: string
  effective_to: string | null
  employment_type: string
  status: string
  branch_id: string | null
  designation_id: string | null
  reporting_manager_id: string | null
  reason: string | null
  created_by: string | null
}

export type HistoryEntry = { id: string; event_type: string; summary: string; details: any; occurred_at: string; created_by: string | null }
export type AuditEntry = { id: string; actor: string; action: string; entity_type: string; changes: any; created_at: string }

export type Integration = {
  id: string
  name: string
  provider: "etimetracklite" | "ebioserver" | "simulator"
  base_url: string
  username: string | null
  has_password: boolean
  branch_id: string | null
  enabled: boolean
  poll_interval_seconds: number
  device_timezone: string
  operations: string[]
  verified_at: string | null
  synced_until: string | null
  last_success_at: string | null
  last_error: string | null
  consecutive_failures: number
  is_simulator: boolean
  created_at: string
}

export type Device = {
  id: string
  integration_id: string
  serial_number: string
  name: string
  location: string | null
  branch_id: string | null
  department_id: string | null
  direction_mode: string
  enabled: boolean
  status: "online" | "offline" | "unknown"
  last_seen_at: string | null
  last_punch_at: string | null
}

export type Mapping = {
  id: string
  integration_id: string
  employee_id: string
  employee_code: string | null
  employee_name: string | null
  device_user_id: string
  effective_from: string
  effective_to: string | null
  provisioning_status: string
  created_at: string
  created_by: string | null
  claimed_punches?: number | null
}

export type Unmapped = { integration_id: string; device_user_id: string; punch_count: number; first_punch: string; last_punch: string; devices: string[] }

export type Punch = {
  id: string
  integration_id: string
  device_id: string | null
  device_name: string | null
  device_serial: string | null
  device_user_id: string
  punch_time: string
  direction: string | null
  verify_mode: string | null
  source: string
  raw_payload: string
  received_at: string
  employee_id: string | null
  employee_code: string | null
  employee_name: string | null
}

export type SyncLog = {
  id: string
  integration_id: string
  trigger: string
  status: "running" | "success" | "partial" | "failed"
  started_at: string
  finished_at: string | null
  window_from: string | null
  window_to: string | null
  fetched: number
  inserted: number
  duplicates: number
  unmapped: number
  rejected: number
  error: string | null
  details: { devices?: { serial: string; ok: boolean; error?: string }[]; rejected?: string[] } | null
  created_by: string | null
}

export type SyncResult = {
  status: string
  error: string | null
  fetched: number
  inserted: number
  duplicates: number
  unmapped: number
  rejected: number
}

export type LiveRow = {
  employee_id: string
  employee_code: string
  full_name: string
  department: string | null
  designation: string | null
  branch: string | null
  category: string
  first_check_in: string | null
  last_check_out: string | null
  last_punch: string | null
  punch_count: number
  status: "in" | "out" | "not_arrived"
  last_synced_at: string | null
}

export type LiveBoard = {
  date: string
  rows: LiveRow[]
  counts: { in: number; out: number; not_arrived: number; total: number; unmapped_punches: number }
  devices: Record<string, number>
  last_sync_at: string | null
}

export type Dashboard = {
  as_of: string
  employees: {
    total: number
    active: number
    inactive: number
    by_status: Record<string, number>
    by_category: Record<string, number>
    by_branch: { branch: string; count: number }[]
    by_department: { department_id: string; department: string; count: number }[]
  }
  attendance_today: LiveBoard["counts"] & { devices: Record<string, number>; last_sync_at: string | null }
  credentials: {
    expiring: { employee_id: string; employee_code: string; employee_name: string; credential_type: string; number: string; expires_on: string; days_left: number }[]
    pending_verification: number
  }
  recent_activity: { employee_id: string; employee_name: string; event_type: string; summary: string; occurred_at: string; actor: string | null }[]
  workforce: {
    on_leave_today: number
    pending_leave: number
    pending_approvals: number
    open_exceptions: number
    open_vacancies: number
    candidates_in_pipeline: number
    training_gaps: number
    certificates_expiring_60d: number
    last_payroll: { period: string; status: string; employees: number; net?: string } | null
  }
}
