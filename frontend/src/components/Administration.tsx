import React, { useState, useEffect } from "react"
import {
  getDoctorMaster,
  addDoctorMaster,
  updateDoctorMaster,
  deleteDoctorMaster,
  MasterDoctor,
  DoctorSection,
  availabilityOf,
  DOCTOR_LOCAL_PASSWORD,
} from "../services/doctorMaster"
import {
  RoleDatabase,
  AppRole,
  AppUser,
  ALL_SYSTEM_MODULES,
  PermissionAction,
  getGrantedActionsForModule,
} from "../services/roleDb"
import { AuditDatabase, AuditLog, detectDevice } from "../services/auditDb"
import { apiFetch } from "../lib/api"
import {
  DiagnosticTariffDatabase,
  DiagnosticTariffItem,
  DiagnosticDepartment,
  RADIOLOGY_MODALITIES,
} from "../services/diagnosticTariffDb"

// System Module Categories for clean RBAC governance
const MODULE_CATEGORIES = [
  {
    id: "clinical",
    title: "Clinical Care & EMR",
    description:
      "Inpatient, Doctor, Nursing, ICU, ER, Triage & Surgery Workflows",
    modules: [
      "clinical",
      "doctor_workflow",
      "patients",
      "chart",
      "inpatient",
      "nursing",
      "icu",
      "emergency",
      "triage",
      "surgery",
      "discharge",
      "readmission",
      "admissions",
    ],
  },
  {
    id: "diagnostics",
    title: "Diagnostics & Pharmacy",
    description:
      "Pharmacy dispensing, Laboratory tests, Radiology imaging & Reports",
    modules: ["pharmacy", "laboratory", "radiology", "reports"],
  },
  {
    id: "frontoffice",
    title: "Front Desk & Revenue Cycle",
    description:
      "Patient Registration, Outpatient Queue, Scheduling, Billing, Payments & Insurance",
    modules: [
      "register",
      "appointments",
      "outpatient",
      "queue",
      "op_management",
      "op_registration",
      "op_workflow",
      "scheduling",
      "billing",
      "payments",
      "insurance",
      "revenue_reports",
    ],
  },
  {
    id: "ai_intelligence",
    title: "AI & Document Intelligence",
    description:
      "Keppler OCR, Medical Document Summaries, Clinical RAG & Symptom AI",
    modules: [
      "intelligence",
      "ocr",
      "dpi_ocr",
      "symptom_ai",
      "clinical_rag",
      "clinical_summaries",
      "bulk_ai",
      "nl_filtering",
    ],
  },
  {
    id: "workforce",
    title: "Staff & Workforce",
    description: "Human Resource Management, Employee Directory & Experience",
    modules: ["hrms", "employees", "patient_exp"],
  },
  {
    id: "platform",
    title: "Platform & Infrastructure",
    description: "Dashboard analytics, Bed management, System Administration",
    modules: ["dashboard", "admin", "beds", "analytics"],
  },
]

const ACTIONS_LIST: { key: PermissionAction ;label: string ;icon: string }[] = [
  { key: "read", label: "Read", icon: "👁️" },
  { key: "write", label: "Write", icon: "✍️" },
  { key: "delete", label: "Delete", icon: "🗑️" },
  { key: "export", label: "Export", icon: "📥" },
]

export default function Administration() {
  const [activeTab, setActiveTab] =
    useState<"roles" | "users" | "doctors" | "audit" | "settings" | "tariffs">("doctors")

  // Database States
  const [roles, setRoles] = useState<AppRole[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [doctors, setDoctors] = useState<MasterDoctor[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditLoadingMore, setAuditLoadingMore] = useState(false)

  // Roles Tab State
  const [selectedRoleId, setSelectedRoleId] = useState<string>("ROLE_DOCTOR")
  const [roleSearch, setRoleSearch] = useState("")
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false)
  const [showCloneRoleModal, setShowCloneRoleModal] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleDescription, setNewRoleDescription] = useState("")
  const [cloneSourceRoleId, setCloneSourceRoleId] = useState("ROLE_DOCTOR")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  )
  const [roleNotice, setRoleNotice] = useState("")
  const [expandedGranularModule, setExpandedGranularModule] =
    useState<string | null>(null)

  // Users Tab State
  const [userSearch, setUserSearch] = useState("")
  const [userRoleFilter, setUserRoleFilter] = useState("all")
  const [userStatusFilter, setUserStatusFilter] = useState("all")
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [resetPassUser, setResetPassUser] = useState<AppUser | null>(null)
  const [newPassInput, setNewPassInput] = useState("password123")

  // Doctor Master Tab State
  const [doctorSearch, setDoctorSearch] = useState("")
  const [doctorSectionFilter, setDoctorSectionFilter] = useState<string>("all")
  const [doctorStatusFilter, setDoctorStatusFilter] = useState<string>("all")
  const [showDoctorModal, setShowDoctorModal] = useState(false)
  const [editingDoctor, setEditingDoctor] = useState<MasterDoctor | null>(null)
  const [doctorNotice, setDoctorNotice] = useState("")

  // Credentials Editing Modal State
  const [showCredentialsModal, setShowCredentialsModal] = useState(false)
  const [credentialsForm, setCredentialsForm] = useState<{
    id: string
    name: string
    username: string
    password?: string
    roleId: string
    staffId: string
    status: "Active" | "Inactive"
    doctorId?: string
  } | null>(null)

  // Audit Tab State
  const [auditSearch, setAuditSearch] = useState("")
  const [auditActionFilter, setAuditActionFilter] = useState("all")
  const [auditUserFilter, setAuditUserFilter] = useState("all")
  const [auditDateFilter, setAuditDateFilter] = useState("all")
  const [auditStatusFilter, setAuditStatusFilter] = useState("all")
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(
    null,
  )

  // Settings State
  const [mfaEnforced, setMfaEnforced] = useState(true)
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number | "">(30)
  const [minPasswordLength, setMinPasswordLength] = useState<number | "">(10)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState("")

  // Diagnostic Tariffs Tab State
  const [tariffs, setTariffs] = useState<DiagnosticTariffItem[]>([])
  const [tariffSearch, setTariffSearch] = useState("")
  const [tariffDepartmentFilter, setTariffDepartmentFilter] = useState<
    "all" | "Radiology" | DiagnosticDepartment
  >("all")
  const [tariffSubCategoryFilter, setTariffSubCategoryFilter] = useState<string>("all")
  const [editingTariffId, setEditingTariffId] = useState<string | null>(null)
  const [editingTariffPrice, setEditingTariffPrice] = useState<number | "">("")
  const [showAddTariffModal, setShowAddTariffModal] = useState(false)
  const [newTariffForm, setNewTariffForm] = useState<{
    code: string
    name: string
    department: DiagnosticDepartment
    modality: string
    bodyRegion: string
    subCategory: string
    variantProtocol: string
    hospitalAvailability: string
    tariffReference: string
    responsibleInCharge: string
    reportTemplate: string
    price: number | ""
    tat: string
  }>({
    code: "",
    name: "",
    department: "CT Scan",
    modality: "CT Scan",
    bodyRegion: "Brain",
    subCategory: "Neuro / Head",
    variantProtocol: "Plain",
    hospitalAvailability: "Enabled",
    tariffReference: "Existing Billing tariff",
    responsibleInCharge: "Dr. Sunita Rao (Senior Radiologist)",
    reportTemplate: "Approved CT Brain Plain Template",
    price: "",
    tat: "2 Hours",
  })
  const [tariffNotice, setTariffNotice] = useState("")

  const refreshData = () => {
    setRoles(RoleDatabase.getRoles())
    setUsers(RoleDatabase.getUsers())
    setDoctors(getDoctorMaster())
    setAuditLogs(AuditDatabase.getLogs())
    setTariffs(DiagnosticTariffDatabase.getTariffs())
  }

  useEffect(() => {
    refreshData()

    const handleDoctorUpdate = () => refreshData()
    const handleUserUpdate = () => refreshData()
    const handleTariffUpdate = () => refreshData()

    window.addEventListener("doctor_master_updated", handleDoctorUpdate)
    window.addEventListener("rbac_users_updated", handleUserUpdate)
    window.addEventListener("diagnostic_tariffs_updated", handleTariffUpdate)
    return () => {
      window.removeEventListener("doctor_master_updated", handleDoctorUpdate)
      window.removeEventListener("rbac_users_updated", handleUserUpdate)
      window.removeEventListener("diagnostic_tariffs_updated", handleTariffUpdate)
    }
  }, [])

  const AUDIT_PAGE_SIZE = 50

  function mapAuditRow(row: any): AuditLog {
    let description = row.action
    if (row.entity_key) description += ` ${row.module_name} #${row.entity_key}`
    else description += ` ${row.module_name}`
    if (row.payload) {
      try {
        const parsed = JSON.parse(row.payload)
        description += ` -- ${JSON.stringify(parsed)}`
      } catch {
        // payload wasn't JSON -- leave description as-is
      }
    }
    return {
      id: String(row.id),
      userId: row.actor_username || "",
      username: row.actor_username || "system",
      action: row.action,
      module: row.module_name,
      description,
      timestamp: row.created_at,
      status: "Success",
    }
  }

  useEffect(() => {
    setAuditLogs(AuditDatabase.getLogs())
  }, [activeTab])

  const loadMoreAuditLogs = async () => {
    setAuditLoadingMore(true)
    try {
      const res = await apiFetch<{ logs: any[] ;total: number }>(
        `/api/audit/logs?limit=${AUDIT_PAGE_SIZE}&offset=${auditLogs.length}`,
      )
      setAuditLogs((prev) => [...prev, ...(res.logs || []).map(mapAuditRow)])
      setAuditTotal(res.total || 0)
    } catch {
      // Leave the already-loaded page in place on failure.
    } finally {
      setAuditLoadingMore(false)
    }
  }

  const selectedRole =
    roles.find((r) => r.id === selectedRoleId) || roles[0] || null

  // Role Operations
  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) return

    const roleId =
      "ROLE_" +
      newRoleName
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
    const existing = roles.find((r) => r.id === roleId)
    if (existing) {
      alert("A role with a similar identifier already exists.")
      return
    }

    const newRole: AppRole = {
      id: roleId,
      name: newRoleName.trim(),
      allowedModules: ["dashboard", "patients:read"],
    }

    const updated = [...roles, newRole]
    RoleDatabase.saveRoles(updated)

    AuditDatabase.logEvent(
      "Role Created",
      "Role Management",
      `Created custom role '${newRoleName}' (${roleId})`,
      "Success",
    )

    setRoles(updated)
    setSelectedRoleId(newRole.id)
    setShowCreateRoleModal(false)
    setNewRoleName("")
    setNewRoleDescription("")
    setRoleNotice(`Role "${newRole.name}" created successfully.`)
    setTimeout(() => setRoleNotice(""), 3000)
  }

  const handleCloneRole = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) return

    const sourceRole = roles.find((r) => r.id === cloneSourceRoleId)
    const sourceModules = sourceRole
      ? [...sourceRole.allowedModules]
      : ["dashboard"]

    const roleId =
      "ROLE_" +
      newRoleName
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "_")
    const newRole: AppRole = {
      id: roleId,
      name: newRoleName.trim(),
      allowedModules: sourceModules,
    }

    const updated = [...roles, newRole]
    RoleDatabase.saveRoles(updated)

    AuditDatabase.logEvent(
      "Role Cloned",
      "Role Management",
      `Cloned role '${newRoleName}' from '${sourceRole?.name || cloneSourceRoleId}'`,
      "Success",
    )

    setRoles(updated)
    setSelectedRoleId(newRole.id)
    setShowCloneRoleModal(false)
    setNewRoleName("")
    setRoleNotice(
      `Cloned role "${newRole.name}" created with ${sourceModules.length} permission rules.`,
    )
    setTimeout(() => setRoleNotice(""), 3000)
  }

  const handleSaveRoleModules = () => {
    if (!selectedRole) return
    const updated = roles.map((r) =>
      r.id === selectedRole.id ? selectedRole : r,
    )
    RoleDatabase.saveRoles(updated)
    setSaveStatus("saving")

    AuditDatabase.logEvent(
      "Role Permissions Updated",
      "Role Management",
      `Updated module permission matrix for role '${selectedRole.name}' (${selectedRole.allowedModules.length} active rules)`,
      "Success",
    )

    setTimeout(() => {
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    }, 400)
  }

  const toggleModuleForSelectedRole = (moduleKey: string) => {
    if (!selectedRole) return
    const currentModules = selectedRole.allowedModules
    const isCurrentlyActive =
      currentModules.includes(moduleKey) ||
      currentModules.includes("*") ||
      getGrantedActionsForModule(currentModules, moduleKey).length > 0

    let newModules: string[]
    if (isCurrentlyActive) {
      newModules = currentModules.filter(
        (m) => m !== moduleKey && !m.startsWith(`${moduleKey}:`),
      )
    } else {
      newModules = [...currentModules, moduleKey]
    }

    const updatedRole = { ...selectedRole, allowedModules: newModules }
    setRoles(roles.map((r) => (r.id === selectedRole.id ? updatedRole : r)))
  }

  const toggleActionForSelectedRole = (
    moduleKey: string,
    action: PermissionAction,
  ) => {
    if (!selectedRole) return
    let currentModules = [...selectedRole.allowedModules]

    // If top-level module permission exists, expand it into 4 granular actions first
    if (currentModules.includes(moduleKey)) {
      currentModules = currentModules.filter((m) => m !== moduleKey)
      ACTIONS_LIST.forEach((act) => {
        const key = `${moduleKey}:${act.key}`
        if (!currentModules.includes(key)) {
          currentModules.push(key)
        }
      })
    }

    const targetKey = `${moduleKey}:${action}`
    let newModules: string[]

    if (currentModules.includes(targetKey)) {
      newModules = currentModules.filter((m) => m !== targetKey)
    } else {
      newModules = [...currentModules, targetKey]
    }

    const updatedRole = { ...selectedRole, allowedModules: newModules }
    setRoles(roles.map((r) => (r.id === selectedRole.id ? updatedRole : r)))
  }

  const selectAllCategoryModules = (categoryModules: string[]) => {
    if (!selectedRole) return
    const combined = Array.from(
      new Set([...selectedRole.allowedModules, ...categoryModules]),
    )
    setRoles(
      roles.map((r) =>
        r.id === selectedRole.id
          ? { ...selectedRole, allowedModules: combined }
          : r,
      ),
    )
  }

  const clearCategoryModules = (categoryModules: string[]) => {
    if (!selectedRole) return
    const updated = selectedRole.allowedModules.filter((m) => {
      const baseMod = m.includes(":") ? m.split(":")[0] : m
      return !categoryModules.includes(baseMod)
    })
    setRoles(
      roles.map((r) =>
        r.id === selectedRole.id
          ? { ...selectedRole, allowedModules: updated }
          : r,
      ),
    )
  }

  // User Accounts Operations
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return

    const isNew = !users.some((u) => u.id === editingUser.id)
    const updatedUsers = RoleDatabase.upsertUser(editingUser)
    setUsers(updatedUsers)

    AuditDatabase.logEvent(
      isNew ? "User Created" : "User Updated",
      "User Management",
      `${
        isNew ? "Created new" : "Updated"
      } user account for '${editingUser.name}' (@${editingUser.username}) assigned to role ${editingUser.roleId}`,
      "Success",
    )

    setShowUserModal(false)
    setEditingUser(null)
  }

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPassUser || !newPassInput) return

    const updatedUser: AppUser = {
      ...resetPassUser,
      password: newPassInput,
    }

    const updatedUsers = RoleDatabase.upsertUser(updatedUser)
    setUsers(updatedUsers)

    AuditDatabase.logEvent(
      "Password Reset",
      "User Management",
      `Reset password for user account '${resetPassUser.name}' (@${resetPassUser.username})`,
      "Success",
    )

    setResetPassUser(null)
    setNewPassInput("password123")
  }

  const handleDeleteUser = (user: AppUser) => {
    if (
      !confirm(
        `Are you sure you want to delete account @${user.username} (${user.name})?`,
      )
    )
      return
    const updated = RoleDatabase.deleteUser(user.id)
    setUsers(updated)
    AuditDatabase.logEvent(
      "User Deleted",
      "User Management",
      `Deleted user account @${user.username} (${user.name})`,
      "Success",
    )
  }

  // ── Doctor Master Operations ─────────────────────────────────────────────

  const handleOpenAddDoctorModal = () => {
    const nextNum = doctors.length + 1
    const nextId = `IMP-${String(nextNum).padStart(3, "0")}`
    setEditingDoctor({
      id: nextId,
      name: "",
      qualification: "M.B.B.S.",
      specialty: "General Medicine",
      section: "Main",
      verified: true,
      username: "",
      room: `Room ${200 + nextNum}`,
      staffId: nextId,
      consultationFee: 500,
    })
    setShowDoctorModal(true)
  }

  const handleSaveDoctor = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingDoctor || !editingDoctor.name.trim()) return

    const isNew = !doctors.some((d) => d.id === editingDoctor.id)
    let updatedDocs: MasterDoctor[]

    // Generate clean username if verified and missing
    let finalDoc = {
      ...editingDoctor,
      consultationFee:
        editingDoctor.consultationFee !== undefined &&
        editingDoctor.consultationFee !== null &&
        (editingDoctor.consultationFee as any) !== "" &&
        !isNaN(Number(editingDoctor.consultationFee))
          ? Math.max(0, Number(editingDoctor.consultationFee))
          : 500,
    }

    if (finalDoc.verified && !finalDoc.username) {
      const cleanName = finalDoc.name
        .toLowerCase()
        .replace(/dr\.?\s*/, "")
        .replace(/[^a-z0-9]/g, "")
      finalDoc.username = cleanName || `doc_${finalDoc.id.toLowerCase()}`
    }

    if (isNew) {
      updatedDocs = addDoctorMaster(finalDoc)
    } else {
      updatedDocs = updateDoctorMaster(finalDoc)
    }
    setDoctors(updatedDocs)

    // Sync credentials to RoleDatabase if verified
    if (finalDoc.verified && finalDoc.username) {
      RoleDatabase.upsertUser({
        id: `U_${finalDoc.id}`,
        username: finalDoc.username,
        password: DOCTOR_LOCAL_PASSWORD,
        roleId: "ROLE_DOCTOR",
        name: finalDoc.name,
        staffId: finalDoc.staffId,
        status: "Active",
      })
    }

    AuditDatabase.logEvent(
      isNew ? "Doctor Added" : "Doctor Fee/Profile Updated",
      "Doctor Management",
      `${isNew ? "Added new doctor" : "Updated doctor profile"} '${finalDoc.name}' (${finalDoc.specialty}) — Consultation Fee: ₹${finalDoc.consultationFee}`,
      "Success",
    )

    setShowDoctorModal(false)
    setEditingDoctor(null)
    setDoctorNotice(
      `Doctor "${finalDoc.name}" ${isNew ? "added" : "updated"} successfully with fee ₹${finalDoc.consultationFee}.`,
    )
    setTimeout(() => setDoctorNotice(""), 3500)
  }

  const handleDeleteDoctor = (doc: MasterDoctor) => {
    if (
      !confirm(
        `Are you sure you want to remove ${doc.name} (${doc.id}) from the Doctor Master roster?`,
      )
    )
      return
    const updated = deleteDoctorMaster(doc.id)
    setDoctors(updated)
    RoleDatabase.deleteUser(`U_${doc.id}`)

    AuditDatabase.logEvent(
      "Doctor Deleted",
      "Doctor Management",
      `Removed doctor '${doc.name}' (${doc.id}) from Doctor Master`,
      "Success",
    )
    setDoctorNotice(`Doctor "${doc.name}" removed from roster.`)
    setTimeout(() => setDoctorNotice(""), 3500)
  }

  const handleOpenCredentialsModal = (doc: MasterDoctor) => {
    const existingUser = users.find(
      (u) =>
        u.id === `U_${doc.id}` ||
        u.username.toLowerCase() === (doc.username || "").toLowerCase(),
    )
    setCredentialsForm({
      id: existingUser?.id || `U_${doc.id}`,
      name: doc.name,
      username:
        doc.username ||
        doc.name
          .toLowerCase()
          .replace(/dr\.?\s*/, "")
          .replace(/[^a-z0-9]/g, ""),
      password: existingUser?.password || DOCTOR_LOCAL_PASSWORD,
      roleId: existingUser?.roleId || "ROLE_DOCTOR",
      staffId: doc.staffId || doc.id,
      status: existingUser?.status as any || "Active",
      doctorId: doc.id,
    })
    setShowCredentialsModal(true)
  }

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault()
    if (!credentialsForm) return

    // Save to RoleDatabase
    RoleDatabase.upsertUser({
      id: credentialsForm.id,
      username: credentialsForm.username.trim().toLowerCase(),
      password: credentialsForm.password || DOCTOR_LOCAL_PASSWORD,
      roleId: credentialsForm.roleId,
      name: credentialsForm.name,
      staffId: credentialsForm.staffId,
      status: credentialsForm.status,
    })

    // Also update DoctorMaster username & staffId if this was linked to a doctor
    if (credentialsForm.doctorId) {
      const doc = doctors.find((d) => d.id === credentialsForm.doctorId)
      if (doc) {
        updateDoctorMaster({
          ...doc,
          username: credentialsForm.username.trim().toLowerCase(),
          staffId: credentialsForm.staffId,
        })
        setDoctors(getDoctorMaster())
      }
    }

    AuditDatabase.logEvent(
      "Credentials Updated",
      "User & Credential Governance",
      `Updated login credentials and role assignment for '${credentialsForm.name}' (@${credentialsForm.username})`,
      "Success",
    )

    setShowCredentialsModal(false)
    setCredentialsForm(null)
    setDoctorNotice(
      `Credentials for "${credentialsForm.name}" updated successfully.`,
    )
    setTimeout(() => setDoctorNotice(""), 3500)
  }

  // Filters
  const filteredRoles = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
      r.id.toLowerCase().includes(roleSearch.toLowerCase()),
  )

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.staffId.toLowerCase().includes(userSearch.toLowerCase())
    const matchesRole = userRoleFilter === "all" || u.roleId === userRoleFilter
    const matchesStatus =
      userStatusFilter === "all" || (u.status || "Active") === userStatusFilter
    return matchesSearch && matchesRole && matchesStatus
  })

  const filteredDoctors = doctors.filter((d) => {
    const q = doctorSearch.toLowerCase()
    const matchesSearch =
      d.name.toLowerCase().includes(q) ||
      (d.specialty || "").toLowerCase().includes(q) ||
      d.qualification.toLowerCase().includes(q) ||
      d.staffId.toLowerCase().includes(q) ||
      d.room.toLowerCase().includes(q) ||
      (d.username || "").toLowerCase().includes(q)
    const matchesSection =
      doctorSectionFilter === "all" || d.section === doctorSectionFilter
    const matchesStatus =
      doctorStatusFilter === "all" ||
      (doctorStatusFilter === "active" && d.verified) ||
      (doctorStatusFilter === "unverified" && !d.verified)
    return matchesSearch && matchesSection && matchesStatus
  })

  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.description.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.username.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(auditSearch.toLowerCase())
    const matchesAction =
      auditActionFilter === "all" || log.action === auditActionFilter
    const matchesUser =
      auditUserFilter === "all" || log.username === auditUserFilter

    let matchesDate = true
    if (auditDateFilter === "today") {
      const today = new Date().toISOString().split("T")[0]
      matchesDate = log.timestamp.startsWith(today)
    } else if (auditDateFilter === "7days") {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      matchesDate = new Date(log.timestamp).getTime() >= sevenDaysAgo
    }

    return matchesSearch && matchesAction && matchesUser && matchesDate
  })

  const uniqueAuditActions = Array.from(
    new Set(auditLogs.map((l) => l.action)),
  ).sort()
  const uniqueAuditUsers = Array.from(
    new Set(auditLogs.map((l) => l.username)),
  ).sort()

  // ── Diagnostic Tariffs Operations ────────────────────────────────────────

  const handleSaveTariffPrice = (id: string) => {
    if (editingTariffPrice === "" || isNaN(Number(editingTariffPrice))) return
    const num = Math.max(0, Number(editingTariffPrice))
    const updated = DiagnosticTariffDatabase.updateTariffPrice(id, num)
    if (updated) {
      AuditDatabase.logEvent(
        "Diagnostic Tariff Updated",
        "Tariff Management",
        `Updated price for '${updated.name}' (${updated.code}) to ₹${num}`,
        "Success",
      )
      setTariffNotice(`Price for "${updated.name}" updated to ₹${num}.`)
      setTimeout(() => setTariffNotice(""), 3500)
    }
    setEditingTariffId(null)
    setEditingTariffPrice("")
    setTariffs(DiagnosticTariffDatabase.getTariffs())
  }

  const handleCreateTariff = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTariffForm.name.trim() || newTariffForm.price === "") return
    const isLab = newTariffForm.department === "Laboratory"
    const deptPrefix = isLab
      ? "LAB"
      : newTariffForm.department === "X-Ray"
      ? "XR"
      : newTariffForm.department === "CT Scan"
      ? "CT"
      : newTariffForm.department === "MRI"
      ? "MR"
      : newTariffForm.department === "Ultrasound (USG)"
      ? "USG"
      : newTariffForm.department === "Doppler"
      ? "DOP"
      : newTariffForm.department === "Mammography"
      ? "MAM"
      : newTariffForm.department === "Fluoroscopy / Contrast"
      ? "FL"
      : newTariffForm.department === "Nuclear Medicine"
      ? "NM"
      : newTariffForm.department === "DEXA"
      ? "DEXA"
      : newTariffForm.department === "Dental"
      ? "DNT"
      : newTariffForm.department === "Interventional Radiology"
      ? "IR"
      : "RAD"

    const code =
      newTariffForm.code.trim() ||
      `${deptPrefix}-${Math.floor(100 + Math.random() * 900)}`
    const category = isLab ? "Laboratory" : "Radiology"
    const item = DiagnosticTariffDatabase.addTariffItem({
      code,
      name: newTariffForm.name.trim(),
      category,
      department: newTariffForm.department,
      modality: isLab ? "Laboratory" : newTariffForm.modality || newTariffForm.department,
      bodyRegion: newTariffForm.bodyRegion.trim() || "General",
      subCategory: newTariffForm.subCategory.trim() || newTariffForm.bodyRegion.trim() || "General",
      variantProtocol: newTariffForm.variantProtocol.trim() || "Plain",
      hospitalAvailability: newTariffForm.hospitalAvailability || "Enabled",
      tariffReference: newTariffForm.tariffReference.trim() || "Existing Billing tariff",
      responsibleInCharge:
        newTariffForm.responsibleInCharge.trim() ||
        (isLab ? "Dr. Priya Patel (Pathologist)" : "Dr. Sunita Rao (Senior Radiologist)"),
      reportTemplate:
        newTariffForm.reportTemplate.trim() ||
        `Approved ${newTariffForm.name.trim()} Template`,
      price: Number(newTariffForm.price),
      tat: newTariffForm.tat.trim() || "2 Hours",
    })

    AuditDatabase.logEvent(
      "Diagnostic Tariff Added",
      "Tariff Management",
      `Added new ${item.department} investigation '${item.name}' (${item.code}) priced at ₹${item.price}`,
      "Success",
    )

    setShowAddTariffModal(false)
    setNewTariffForm({
      code: "",
      name: "",
      department: "CT Scan",
      modality: "CT Scan",
      bodyRegion: "Brain",
      subCategory: "Neuro / Head",
      variantProtocol: "Plain",
      hospitalAvailability: "Enabled",
      tariffReference: "Existing Billing tariff",
      responsibleInCharge: "Dr. Sunita Rao (Senior Radiologist)",
      reportTemplate: "Approved CT Brain Plain Template",
      price: "",
      tat: "2 Hours",
    })
    setTariffNotice(
      `Added new ${item.department} investigation "${item.name}" (₹${item.price}).`,
    )
    setTimeout(() => setTariffNotice(""), 3500)
    setTariffs(DiagnosticTariffDatabase.getTariffs())
  }

  const handleDeleteTariff = (item: DiagnosticTariffItem) => {
    if (
      !confirm(
        `Are you sure you want to delete ${item.name} (${item.code}) from the diagnostic price master?`,
      )
    )
      return
    DiagnosticTariffDatabase.deleteTariffItem(item.id)
    AuditDatabase.logEvent(
      "Diagnostic Tariff Deleted",
      "Tariff Management",
      `Deleted diagnostic test '${item.name}' (${item.code})`,
      "Success",
    )
    setTariffNotice(`Deleted test "${item.name}".`)
    setTimeout(() => setTariffNotice(""), 3500)
    setTariffs(DiagnosticTariffDatabase.getTariffs())
  }

  const handleResetTariffs = () => {
    if (
      !confirm(
        "Are you sure you want to reset all Diagnostic Tariffs to the official Hospital Rate Card prices? Any custom edits will be restored to default.",
      )
    )
      return
    const reset = DiagnosticTariffDatabase.resetToHospitalRateCard()
    setTariffs(reset)
    AuditDatabase.logEvent(
      "Diagnostic Tariffs Reset",
      "Tariff Management",
      "Reset all diagnostic prices to official Hospital Rate Card defaults",
      "Success",
    )
    setTariffNotice(
      "Diagnostic tariffs successfully reset to official Hospital Rate Card defaults.",
    )
    setTimeout(() => setTariffNotice(""), 3500)
  }

  const tariffSubCategories = Array.from(
    new Set(
      tariffs
        .filter(
          (t) =>
            tariffDepartmentFilter === "all" ||
            t.department === tariffDepartmentFilter ||
            (tariffDepartmentFilter === "Radiology" &&
              (t.category === "Radiology" || t.department !== "Laboratory")),
        )
        .map((t) => t.bodyRegion || t.subCategory),
    ),
  )
    .filter(Boolean)
    .sort()

  const filteredTariffs = tariffs.filter((t) => {
    const q = tariffSearch.toLowerCase()
    const matchesSearch =
      t.name.toLowerCase().includes(q) ||
      t.code.toLowerCase().includes(q) ||
      (t.subCategory || "").toLowerCase().includes(q) ||
      (t.bodyRegion || "").toLowerCase().includes(q) ||
      (t.modality || "").toLowerCase().includes(q) ||
      (t.variantProtocol || "").toLowerCase().includes(q) ||
      (t.responsibleInCharge || "").toLowerCase().includes(q) ||
      (t.reportTemplate || "").toLowerCase().includes(q) ||
      (t.department || "").toLowerCase().includes(q) ||
      (t.aliases && t.aliases.some((a) => a.toLowerCase().includes(q)))

    const matchesDept =
      tariffDepartmentFilter === "all" ||
      t.department === tariffDepartmentFilter ||
      (tariffDepartmentFilter === "Radiology" &&
        (t.category === "Radiology" || t.department !== "Laboratory"))

    const matchesSubCat =
      tariffSubCategoryFilter === "all" ||
      t.subCategory === tariffSubCategoryFilter ||
      t.bodyRegion === tariffSubCategoryFilter

    return matchesSearch && matchesDept && matchesSubCat
  })

  return (
    <div className="flex flex-col h-full bg-[#F4F7FB] text-[#0F172A] font-sans overflow-y-auto">
      {/* Executive Module Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-8 py-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-xl">⚙️</span>
              <h1 className="text-xl font-extrabold tracking-tight text-[#0F172A]">
                System Administration & Governance
              </h1>
              <span className="bg-[#DCFCE7] text-[#15803D] text-[11px] font-bold px-2.5 py-0.5 border border-[#BBF7D0]">
                ENTERPRISE ACTIVE
              </span>
            </div>
            <p className="text-[13px] text-[#64748B] mt-1">
              Manage doctor roster, staff credentials, RBAC module permissions,
              audit logging & hospital security policies.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                handleOpenAddDoctorModal()
                setActiveTab("doctors")
              }}
              className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-semibold text-[12.5px] px-3.5 py-1.5 transition-colors border border-blue-600 shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>+</span> Add Doctor
            </button>
            <button
              onClick={() => {
                setEditingUser({
                  id: "U_" + Date.now(),
                  username: "",
                  password: "password123",
                  roleId: "ROLE_DOCTOR",
                  name: "",
                  staffId: "EMP-" + Math.floor(100 + Math.random() * 900),
                  status: "Active",
                })
                setShowUserModal(true)
                setActiveTab("users")
              }}
              className="bg-white hover:bg-gray-50 text-[#0F172A] font-semibold text-[12.5px] px-3.5 py-1.5 transition-colors border border-[#CBD5E1] cursor-pointer shadow-2xs"
            >
              + Add User
            </button>
          </div>
        </div>

        {/* Clean Underline Tabs */}
        <div className="flex items-center gap-8 text-[13px] font-semibold border-t border-[#F1F5F9] pt-1">
          {[
            {
              id: "doctors",
              label: "Doctor Master & Roster",
              count: doctors.length,
            },
            {
              id: "tariffs",
              label: "Diagnostic Tariffs & Price Master",
              count: tariffs.length,
            },
            {
              id: "users",
              label: "User Accounts & Credentials",
              count: users.length,
            },
            {
              id: "roles",
              label: "Roles & Permissions Matrix",
              count: roles.length,
            },
            { id: "audit", label: "Audit Logs", count: auditLogs.length },
            { id: "settings", label: "System Settings" },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? "border-[#1B4FD8] text-[#1B4FD8] font-bold"
                    : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[11px] px-1.5 py-0.2 font-mono ${
                      isActive
                        ? "bg-blue-50 text-[#1B4FD8]"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main Tab Content Container ─────────────────────────────────── */}
      <div className="px-8 py-6 flex-1 flex flex-col min-h-0 bg-[#F4F7FB]">
        {/* ── TAB: DIAGNOSTIC TARIFFS & PRICE MASTER ─────────────────────── */}
        {activeTab === "tariffs" && (
          <div className="space-y-4">
            {tariffNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12.5px] p-3 rounded font-semibold flex items-center justify-between">
                <span>✓ {tariffNotice}</span>
                <button
                  onClick={() => setTariffNotice("")}
                  className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Diagnostic Tariffs Data Table Container */}
            <div className="bg-white border border-[#DDE2EC] shadow-2xs">
              {/* Toolbar & Filters */}
              <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC] space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-[14px] font-bold text-gray-900">
                      Hospital Diagnostic Investigation & Radiology Price Master
                    </h3>
                    <p className="text-[11.5px] text-[#64748B]">
                      Official Hospital Rate Card covering 184 Laboratory Tests and 173 Radiology Examinations across all 11 clinical modalities.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddTariffModal(true)}
                      className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold px-3.5 py-1.5 border border-blue-600 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>+</span> Add Investigation
                    </button>

                    <button
                      onClick={handleResetTariffs}
                      title="Reset all prices to official Imperial Hospital Rate Card defaults"
                      className="bg-white hover:bg-gray-50 text-slate-700 text-[12.5px] font-semibold px-3 py-1.5 border border-slate-300 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <span>🔄</span> Reset Rate Card
                    </button>
                  </div>
                </div>

                {/* Primary Category & Modality Filter Tabs */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
                  <div className="flex border border-[#CBD5E1] rounded overflow-hidden flex-wrap bg-white text-[12px]">
                    <button
                      onClick={() => {
                        setTariffDepartmentFilter("all")
                        setTariffSubCategoryFilter("all")
                      }}
                      className={`px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
                        tariffDepartmentFilter === "all"
                          ? "bg-[#1B4FD8] text-white font-bold"
                          : "bg-white text-[#334155] hover:bg-gray-50"
                      }`}
                    >
                      All ({tariffs.length})
                    </button>
                    <button
                      onClick={() => {
                        setTariffDepartmentFilter("Laboratory")
                        setTariffSubCategoryFilter("all")
                      }}
                      className={`px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
                        tariffDepartmentFilter === "Laboratory"
                          ? "bg-blue-600 text-white font-bold"
                          : "bg-white text-[#334155] hover:bg-gray-50"
                      }`}
                    >
                      Laboratory ({tariffs.filter((t) => t.category === "Laboratory" || t.department === "Laboratory").length})
                    </button>
                    <button
                      onClick={() => {
                        setTariffDepartmentFilter("Radiology")
                        setTariffSubCategoryFilter("all")
                      }}
                      className={`px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
                        tariffDepartmentFilter === "Radiology" ||
                        RADIOLOGY_MODALITIES.includes(tariffDepartmentFilter as any)
                          ? "bg-purple-700 text-white font-bold"
                          : "bg-white text-[#334155] hover:bg-gray-50"
                      }`}
                    >
                      Radiology ({tariffs.filter((t) => t.category === "Radiology" || t.department !== "Laboratory").length})
                    </button>
                  </div>

                  {/* Search Bar & Sub-Category */}
                  <div className="flex items-center gap-2 flex-1 max-w-xl justify-end">
                    {/* Sub-category / Body Region Filter */}
                    <select
                      value={tariffSubCategoryFilter}
                      onChange={(e) => setTariffSubCategoryFilter(e.target.value)}
                      className="bg-white border border-[#CBD5E1] px-2.5 py-1.5 text-[12px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                    >
                      <option value="all">All Anatomical Regions</option>
                      {tariffSubCategories.map((subCat) => (
                        <option key={subCat} value={subCat}>
                          {subCat}
                        </option>
                      ))}
                    </select>

                    <input
                      value={tariffSearch}
                      onChange={(e) => setTariffSearch(e.target.value)}
                      placeholder="Search code, exam name, modality, body region, in-charge..."
                      className="flex-1 bg-white border border-[#CBD5E1] px-3 py-1.5 text-[12px] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1B4FD8]"
                    />
                  </div>
                </div>

                {/* Modality Pills Strip - Only displayed when Radiology department is active */}
                {(tariffDepartmentFilter === "Radiology" ||
                  RADIOLOGY_MODALITIES.includes(tariffDepartmentFilter as any)) && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-2 pb-1 text-[11px] border-t border-purple-100 bg-purple-50/50 p-2.5 rounded-xs">
                    <span className="text-purple-900 font-bold uppercase tracking-wider text-[10px] mr-1 flex items-center gap-1">
                      <span>⚡</span> Modalities:
                    </span>
                    <button
                      onClick={() => {
                        setTariffDepartmentFilter("Radiology")
                        setTariffSubCategoryFilter("all")
                      }}
                      className={`px-2.5 py-0.5 border rounded cursor-pointer transition-colors font-medium flex items-center gap-1 ${
                        tariffDepartmentFilter === "Radiology"
                          ? "bg-purple-700 text-white border-purple-700 font-bold shadow-2xs"
                          : "bg-white text-purple-900 border-purple-200 hover:bg-purple-100/70"
                      }`}
                    >
                      <span>All Modalities</span>
                      <span
                        className={`px-1 py-0.2 rounded text-[9.5px] ${
                          tariffDepartmentFilter === "Radiology"
                            ? "bg-white/20 text-white"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {tariffs.filter((t) => t.category === "Radiology" || t.department !== "Laboratory").length}
                      </span>
                    </button>
                    {RADIOLOGY_MODALITIES.map((mod) => {
                      const count = tariffs.filter((t) => t.department === mod || t.modality === mod).length
                      const isSelected = tariffDepartmentFilter === mod
                      return (
                        <button
                          key={mod}
                          onClick={() => {
                            setTariffDepartmentFilter(mod)
                            setTariffSubCategoryFilter("all")
                          }}
                          className={`px-2 py-0.5 border rounded cursor-pointer transition-colors font-medium flex items-center gap-1 ${
                            isSelected
                              ? "bg-[#0F172A] text-white border-[#0F172A] font-bold shadow-2xs"
                              : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-slate-100"
                          }`}
                        >
                          <span>{mod}</span>
                          <span
                            className={`px-1 py-0.2 rounded text-[9.5px] ${
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px] border-collapse">
                  <thead>
                    <tr className="bg-[#F1F5F9] text-[#475569] font-bold text-[11px] uppercase tracking-wider border-b border-[#DDE2EC]">
                      <th className="py-3 px-3 w-32 font-mono">Test Code</th>
                      <th className="py-3 px-4">Examination Name & Protocol</th>
                      <th className="py-3 px-3 w-36">Modality</th>
                      <th className="py-3 px-3 w-32">Body Region</th>
                      <th className="py-3 px-2 w-28 text-center">Availability</th>
                      <th className="py-3 px-3 w-44">Responsible In-Charge</th>
                      <th className="py-3 px-3 w-44">Report Template</th>
                      <th className="py-3 px-3 w-32 text-right">Tariff (₹)</th>
                      <th className="py-3 px-3 w-28 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredTariffs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-[#64748B]">
                          No investigations found matching "{tariffSearch}".
                        </td>
                      </tr>
                    ) : (
                      filteredTariffs.map((item) => {
                        const isEditing = editingTariffId === item.id
                        const dept = item.department || (item.category === "Laboratory" ? "Laboratory" : "X-Ray")
                        const modality = item.modality || dept
                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-[#F8FAFC] transition-colors ${
                              isEditing ? "bg-amber-50/60" : ""
                            }`}
                          >
                            {/* Test Code */}
                            <td className="py-2.5 px-3 font-mono font-bold text-[#1B4FD8] text-[12px]">
                              {item.code}
                            </td>

                            {/* Examination Name & Variant Protocol */}
                            <td className="py-2.5 px-4">
                              <div className="font-bold text-[#0F172A] text-[13px]">{item.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {item.variantProtocol && (
                                  <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 border border-slate-200 rounded font-medium">
                                    {item.variantProtocol}
                                  </span>
                                )}
                                {item.aliases && item.aliases.length > 0 && (
                                  <span className="text-[10.5px] text-slate-500 italic">
                                    Alias: {item.aliases.join(", ")}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Modality */}
                            <td className="py-2.5 px-3">
                              <span
                                className={`text-[10.5px] font-bold px-2 py-0.5 border rounded ${
                                  modality === "Laboratory"
                                    ? "bg-blue-50 text-[#1B4FD8] border-blue-200"
                                    : modality === "X-Ray"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : modality === "CT Scan"
                                    ? "bg-amber-50 text-amber-800 border-amber-300"
                                    : modality === "MRI"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : modality === "Ultrasound (USG)"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : modality === "Doppler"
                                    ? "bg-cyan-50 text-cyan-800 border-cyan-200"
                                    : modality === "Mammography"
                                    ? "bg-pink-50 text-pink-700 border-pink-200"
                                    : modality === "Fluoroscopy / Contrast"
                                    ? "bg-sky-50 text-sky-800 border-sky-200"
                                    : modality === "Nuclear Medicine"
                                    ? "bg-violet-50 text-violet-800 border-violet-200"
                                    : modality === "DEXA"
                                    ? "bg-orange-50 text-orange-800 border-orange-200"
                                    : modality === "Dental"
                                    ? "bg-teal-50 text-teal-800 border-teal-200"
                                    : modality === "Interventional Radiology"
                                    ? "bg-rose-50 text-rose-800 border-rose-200"
                                    : "bg-slate-50 text-slate-700 border-slate-200"
                                }`}
                              >
                                {modality}
                              </span>
                            </td>

                            {/* Body Region */}
                            <td className="py-2.5 px-3 text-[#475569] font-medium text-[12px]">
                              {item.bodyRegion || item.subCategory || "General"}
                            </td>

                            {/* Hospital Availability */}
                            <td className="py-2.5 px-2 text-center">
                              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {item.hospitalAvailability || "Enabled"}
                              </span>
                            </td>

                            {/* Responsible In-Charge */}
                            <td className="py-2.5 px-3">
                              <div className="text-[12px] font-semibold text-[#1E293B]">
                                {item.responsibleInCharge || (dept === "Laboratory" ? "Dr. Priya Patel (Pathology)" : "Dr. Sunita Rao (Senior Radiologist)")}
                              </div>
                            </td>

                            {/* Report Template */}
                            <td className="py-2.5 px-3">
                              <div
                                className="text-[11px] text-[#475569] font-mono truncate max-w-[180px]"
                                title={item.reportTemplate || `Approved ${item.name} Template`}
                              >
                                {item.reportTemplate || `Approved ${item.name} Template`}
                              </div>
                            </td>

                            {/* Tariff Price (₹) */}
                            <td className="py-2.5 px-3 text-right font-mono">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-gray-500 font-bold">₹</span>
                                  <input
                                    type="number"
                                    min="0"
                                    autoFocus
                                    value={editingTariffPrice}
                                    onChange={(e) =>
                                      setEditingTariffPrice(
                                        e.target.value === "" ? "" : Number(e.target.value),
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveTariffPrice(item.id)
                                      if (e.key === "Escape") setEditingTariffId(null)
                                    }}
                                    className="w-24 bg-white border border-[#1B4FD8] px-2 py-1 text-right text-[13px] font-mono font-bold focus:outline-none"
                                  />
                                </div>
                              ) : (
                                <span className="font-extrabold text-[#0F172A] text-[13px]">
                                  ₹{Number(item.price ?? 0).toLocaleString("en-IN")}
                                </span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-2.5 px-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleSaveTariffPrice(item.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 border border-emerald-700 cursor-pointer rounded-xs"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingTariffId(null)}
                                    className="bg-white hover:bg-gray-100 text-gray-700 text-[11px] font-semibold px-2 py-1 border border-gray-300 cursor-pointer rounded-xs"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingTariffId(item.id)
                                      setEditingTariffPrice(item.price ?? 0)
                                    }}
                                    className="text-[#1B4FD8] hover:text-[#1740B4] text-[12px] font-semibold cursor-pointer"
                                  >
                                    Edit Price
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTariff(item)}
                                    className="text-red-600 hover:text-red-800 text-[12px] font-semibold cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-3 bg-[#F8FAFC] border-t border-[#DDE2EC] text-[12px] text-[#64748B] flex items-center justify-between">
                <span>
                  Showing <strong>{filteredTariffs.length}</strong> of <strong>{tariffs.length}</strong> total diagnostic rate card entries (184 Laboratory, 173 Radiology)
                </span>
                <span>
                  Press <kbd className="bg-white border border-[#CBD5E1] px-1 py-0.5 text-[10px] font-mono font-bold">Enter</kbd> to save price edits
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 1: DOCTOR MASTER & ROSTER ─────────────────────────────── */}
        {activeTab === "doctors" && (
          <div className="space-y-4">
            {doctorNotice && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12.5px] p-3 rounded font-semibold flex items-center justify-between">
                <span>✓ {doctorNotice}</span>
                <button
                  onClick={() => setDoctorNotice("")}
                  className="text-emerald-600 hover:text-emerald-900"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="bg-white border border-[#DDE2EC] shadow-2xs">
              {/* Doctor Toolbar */}
              <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-[14px] font-bold text-gray-900">
                    Hospital Doctor Master Directory
                  </h3>
                  <p className="text-[11.5px] text-[#64748B]">
                    Active roster of physicians, consultants, rooms & login
                    credentials. Total {doctors.length} doctors onboarded.
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                  <input
                    value={doctorSearch}
                    onChange={(e) => setDoctorSearch(e.target.value)}
                    placeholder="Search doctor name, specialty, room, staff ID..."
                    className="w-full md:w-72 bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1B4FD8]"
                  />

                  <select
                    value={doctorSectionFilter}
                    onChange={(e) => setDoctorSectionFilter(e.target.value)}
                    className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    <option value="all">All Panels</option>
                    <option value="Main">Main Resident Panel</option>
                    <option value="Visiting">Visiting Consultants</option>
                  </select>

                  <select
                    value={doctorStatusFilter}
                    onChange={(e) => setDoctorStatusFilter(e.target.value)}
                    className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    <option value="all">All Verification Status</option>
                    <option value="active">Active & Verified</option>
                    <option value="unverified">Needs Verification</option>
                  </select>

                  <button
                    onClick={handleOpenAddDoctorModal}
                    className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold px-3.5 py-1.5 border border-blue-600 transition-colors cursor-pointer"
                  >
                    + Add New Doctor
                  </button>
                </div>
              </div>

              {/* Doctor Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#DDE2EC] text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                      <th className="text-left px-4 py-3">Doctor & Staff ID</th>
                      <th className="text-left px-4 py-3">Qualification</th>
                      <th className="text-left px-4 py-3">
                        Specialty / Department
                      </th>
                      <th className="text-left px-4 py-3">Panel</th>
                      <th className="text-left px-4 py-3">Consultation Fee</th>
                      <th className="text-left px-4 py-3">Availability</th>
                      <th className="text-left px-4 py-3">Login Username</th>
                      <th className="text-left px-4 py-3">Status</th>
                      <th className="text-right px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-[12.5px]">
                    {filteredDoctors.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-[#64748B]">
                          No doctors found matching the search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredDoctors.map((d) => {
                        const av = availabilityOf(d)
                        return (
                          <tr
                            key={d.id}
                            className="hover:bg-[#F8FAFC] transition-colors"
                          >
                            <td className="px-4 py-3">
                              <p
                                className={`text-[13px] ${
                                  d.verified
                                    ? "font-bold text-gray-900"
                                    : "italic text-[#92400E]"
                                }`}
                              >
                                {d.name}
                              </p>
                              <p className="text-[11px] font-mono text-[#64748B]">
                                {d.id} • {d.staffId} • {d.room}
                              </p>
                            </td>

                            <td className="px-4 py-3 text-[#475569] font-medium">
                              {d.qualification}
                            </td>

                            <td className="px-4 py-3 text-[#0F172A] font-semibold">
                              {d.specialty || (
                                <span className="italic text-[#94A3B8]">
                                  {d.specialtyNote || "Unspecified"}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-[#475569]">
                              <span
                                className={`px-2 py-0.5 text-[11px] font-semibold ${
                                  d.section === "Main"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-purple-50 text-purple-700"
                                }`}
                              >
                                {d.section}
                              </span>
                            </td>

                            <td className="px-4 py-3 font-mono font-bold text-[#15803D]">
                              ₹{d.consultationFee ?? 500}
                            </td>

                            <td className="px-4 py-3 text-[12px]">
                              <span
                                className={
                                  av.bookable
                                    ? av.onRequest
                                      ? "text-[#B45309] font-medium"
                                      : "text-[#15803D] font-medium"
                                    : "text-[#94A3B8]"
                                }
                              >
                                {av.label}
                              </span>
                            </td>

                            <td className="px-4 py-3 font-mono text-[#1B4FD8]">
                              {d.username ? (
                                `@${d.username}`
                              ) : (
                                <span className="text-[#94A3B8]">—</span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={`text-[10.5px] font-bold uppercase px-2 py-0.5 ${
                                  d.verified
                                    ? "bg-[#DCFCE7] text-[#15803D] border border-emerald-200"
                                    : "bg-[#FEF3C7] text-[#92400E] border border-amber-200"
                                }`}
                              >
                                {d.verified ? "Active" : "Unverified"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingDoctor(d)
                                    setShowDoctorModal(true)
                                  }}
                                  title="Edit Doctor Profile"
                                  className="bg-white hover:bg-gray-100 text-[#334155] border border-[#CBD5E1] px-2.5 py-1 text-[11.5px] font-semibold cursor-pointer"
                                >
                                  ✏️ Edit Profile
                                </button>

                                <button
                                  onClick={() => handleDeleteDoctor(d)}
                                  title="Delete Doctor"
                                  className="bg-white hover:bg-red-50 text-red-600 border border-red-200 px-2 py-1 text-[11.5px] cursor-pointer"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: USER ACCOUNTS & CREDENTIALS ─────────────────────────── */}
        {activeTab === "users" && (
          <div className="bg-white border border-[#DDE2EC] flex flex-col flex-1 overflow-hidden shadow-sm">
            {/* User Search & Filter Toolbar */}
            <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user name, username, or staff ID..."
                  className="w-full md:w-80 bg-white border border-[#DDE2EC] px-3.5 py-1.5 text-[13px] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1B4FD8]"
                />

                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="Active">Active Users</option>
                  <option value="Inactive">Inactive / Suspended</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingUser({
                      id: "U_" + Date.now(),
                      username: "",
                      password: "password123",
                      roleId: "ROLE_DOCTOR",
                      name: "",
                      staffId: "EMP-" + Math.floor(100 + Math.random() * 900),
                      status: "Active",
                    })
                    setShowUserModal(true)
                  }}
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[12.5px] font-semibold px-3.5 py-1.5 border border-blue-600 transition-colors shadow-2xs cursor-pointer"
                >
                  + Add User Account
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F1F5F9] border-b border-[#DDE2EC] text-[11.5px] text-[#475569] uppercase font-mono tracking-wider">
                    <th className="px-6 py-3">Staff Member Name</th>
                    <th className="px-6 py-3">Username</th>
                    <th className="px-6 py-3">Staff ID</th>
                    <th className="px-6 py-3">Assigned Role</th>
                    <th className="px-6 py-3">Password</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-[#334155]">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-[#64748B]"
                      >
                        No user accounts match the current filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const userRole = roles.find((r) => r.id === u.roleId)
                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-[#F8FAFC] transition-colors"
                        >
                          <td className="px-6 py-3 font-bold text-[#0F172A]">
                            {u.name}
                          </td>

                          <td className="px-6 py-3 font-mono text-[#1B4FD8]">
                            @{u.username}
                          </td>

                          <td className="px-6 py-3 font-mono text-[12px] text-[#64748B]">
                            {u.staffId}
                          </td>

                          <td className="px-6 py-3">
                            <span className="text-[11.5px] bg-blue-50 text-[#1B4FD8] px-2.5 py-0.5 border border-blue-200 font-semibold">
                              {userRole?.name || u.roleId}
                            </span>
                          </td>

                          <td className="px-6 py-3 font-mono text-[#475569]">
                            {u.password || "••••••••"}
                          </td>

                          <td className="px-6 py-3">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 border ${
                                (u.status || "Active") === "Active"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              }`}
                            >
                              {u.status || "Active"}
                            </span>
                          </td>

                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setEditingUser({ ...u })
                                  setShowUserModal(true)
                                }}
                                className="text-[12px] bg-white hover:bg-gray-100 text-[#334155] border border-[#CBD5E1] px-2.5 py-1 font-semibold cursor-pointer"
                              >
                                Edit User
                              </button>

                              <button
                                onClick={() => {
                                  setResetPassUser(u)
                                  setNewPassInput("password123")
                                }}
                                className="text-[12px] bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 px-2.5 py-1 font-semibold cursor-pointer"
                              >
                                Reset Pass
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="text-[12px] bg-white hover:bg-red-50 text-red-600 border border-red-200 px-2 py-1 cursor-pointer"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: ROLES & GRANULAR PERMISSION MATRIX ──────────────────── */}
        {activeTab === "roles" && (
          <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-[600px]">
            {/* Left Column: Roles Sidebar */}
            <div className="w-full lg:w-80 bg-white border border-[#DDE2EC] flex flex-col overflow-hidden shadow-sm">
              <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-bold text-[#0F172A] tracking-wider uppercase">
                    System Roles
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowCloneRoleModal(true)}
                      title="Clone selected role"
                      className="text-[11px] bg-white hover:bg-gray-50 text-[#334155] px-2 py-1 border border-[#CBD5E1] font-semibold cursor-pointer"
                    >
                      Clone
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateRoleModal(true)
                        setNewRoleName("")
                      }}
                      title="Create new role"
                      className="text-[11px] bg-[#1B4FD8] hover:bg-[#1740B4] text-white px-2 py-1 font-semibold cursor-pointer"
                    >
                      + New
                    </button>
                  </div>
                </div>

                <input
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  placeholder="Search roles..."
                  className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-2 divide-y divide-[#F1F5F9]">
                {filteredRoles.map((role) => {
                  const isSelected = selectedRoleId === role.id
                  const assignedCount = users.filter(
                    (u) => u.roleId === role.id,
                  ).length
                  const isProtected =
                    role.id === "ROLE_SUPERADMIN" || role.id === "ROLE_ADMIN"

                  return (
                    <div
                      key={role.id}
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`p-3 cursor-pointer transition-all flex items-start justify-between ${
                        isSelected
                          ? "bg-[#EFF6FF] border-l-4 border-[#1B4FD8] text-[#1B4FD8]"
                          : "hover:bg-gray-50 text-[#334155]"
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[13px] font-bold truncate ${
                              isSelected ? "text-[#1B4FD8]" : "text-[#0F172A]"
                            }`}
                          >
                            {role.name}
                          </span>
                          {isProtected && (
                            <span className="text-[9.5px] bg-gray-100 text-gray-600 px-1.5 py-0.2 border border-gray-200 font-mono">
                              SYSTEM
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-[#64748B] flex items-center gap-3 font-mono">
                          <span>{role.id}</span>
                          <span>• {assignedCount} users</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Column: Permission Matrix for Selected Role */}
            <div className="flex-1 bg-white border border-[#DDE2EC] flex flex-col overflow-hidden shadow-sm">
              {selectedRole ? (
                <>
                  <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-base font-bold text-[#0F172A]">
                          {selectedRole.name}
                        </h2>
                        <span className="text-[11px] font-mono text-[#64748B] bg-white px-2 py-0.5 border border-[#DDE2EC]">
                          {selectedRole.id}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#64748B] mt-0.5">
                        Configure module access rules and granular CRUD
                        permissions for this role.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {roleNotice && (
                        <span className="text-[12px] text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 border border-emerald-200">
                          ✓ {roleNotice}
                        </span>
                      )}

                      <button
                        onClick={handleSaveRoleModules}
                        disabled={saveStatus === "saving"}
                        className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-semibold text-[13px] px-4 py-1.5 transition-colors border border-blue-600 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {saveStatus === "saving"
                          ? "Saving..."
                          : saveStatus === "saved"
                            ? "✓ Saved!"
                            : "Save Permission Matrix"}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {MODULE_CATEGORIES.map((cat) => (
                      <div
                        key={cat.id}
                        className="border border-[#E2E8F0] p-4 bg-[#FAFCFF]"
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-4">
                          <div>
                            <h4 className="text-[14px] font-bold text-[#0F172A]">
                              {cat.title}
                            </h4>
                            <p className="text-[11.5px] text-[#64748B]">
                              {cat.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                selectAllCategoryModules(cat.modules)
                              }
                              className="text-[11px] text-[#1B4FD8] hover:underline font-semibold"
                            >
                              Select All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => clearCategoryModules(cat.modules)}
                              className="text-[11px] text-[#64748B] hover:underline"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {cat.modules.map((modKey) => {
                            const isModuleEnabled =
                              selectedRole.allowedModules.includes(modKey) ||
                              selectedRole.allowedModules.includes("*")
                            const grantedActions = getGrantedActionsForModule(
                              selectedRole.allowedModules,
                              modKey,
                            )
                            const isExpanded = expandedGranularModule === modKey

                            return (
                              <div
                                key={modKey}
                                className={`p-3 border transition-colors ${
                                  isModuleEnabled
                                    ? "bg-white border-[#1B4FD8]/40 shadow-2xs"
                                    : "bg-gray-50/50 border-gray-200"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2.5 cursor-pointer font-semibold text-[13px] text-[#0F172A]">
                                    <input
                                      type="checkbox"
                                      checked={isModuleEnabled}
                                      onChange={() =>
                                        toggleModuleForSelectedRole(modKey)
                                      }
                                      className="w-4 h-4 text-[#1B4FD8] rounded border-gray-300 focus:ring-[#1B4FD8]"
                                    />
                                    <span className="capitalize">
                                      {modKey.replace(/_/g, " ")}
                                    </span>
                                  </label>

                                  <button
                                    onClick={() =>
                                      setExpandedGranularModule(
                                        isExpanded ? null : modKey,
                                      )
                                    }
                                    className="text-[11px] text-[#64748B] hover:text-[#1B4FD8] px-1.5 py-0.5 border border-gray-200 bg-white"
                                  >
                                    {isExpanded ? "▲ Hide CRUD" : "▼ Granular"}
                                  </button>
                                </div>

                                {isExpanded && (
                                  <div className="mt-3 pt-2.5 border-t border-slate-200 grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xs">
                                    {ACTIONS_LIST.map((act) => {
                                      const hasAction = grantedActions.includes(
                                        act.key,
                                      )
                                      return (
                                        <button
                                          key={act.key}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleActionForSelectedRole(
                                              modKey,
                                              act.key,
                                            )
                                          }}
                                          className={`px-2.5 py-1.5 flex items-center justify-between text-[11.5px] font-bold border transition-all cursor-pointer rounded-xs shadow-2xs ${
                                            hasAction
                                              ? "bg-[#1B4FD8] text-white border-blue-700 shadow-xs"
                                              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-900"
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[12px]">{act.icon}</span>
                                            <span>{act.label}</span>
                                          </div>
                                          <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${hasAction ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-400"}`}>
                                            {hasAction ? "ON" : "OFF"}
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-gray-500">
                  Select a role from the sidebar to view permissions.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 4: AUDIT LOGS ─────────────────────────────────────────── */}
        {activeTab === "audit" && (
          <div className="bg-white border border-[#DDE2EC] flex flex-col flex-1 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                <input
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search log description, user, or action..."
                  className="w-full md:w-80 bg-white border border-[#DDE2EC] px-3.5 py-1.5 text-[13px] text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:border-[#1B4FD8]"
                />

                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                >
                  <option value="all">All Event Actions</option>
                  {uniqueAuditActions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>

                <select
                  value={auditUserFilter}
                  onChange={(e) => setAuditUserFilter(e.target.value)}
                  className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                >
                  <option value="all">All Users</option>
                  {uniqueAuditUsers.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>

                <select
                  value={auditDateFilter}
                  onChange={(e) => setAuditDateFilter(e.target.value)}
                  className="bg-white border border-[#DDE2EC] px-3 py-1.5 text-[12.5px] text-[#334155] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="7days">Last 7 Days</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => alert("Audit log report exported to CSV.")}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[12.5px] font-semibold px-3 py-1.5 border border-[#CBD5E1] transition-colors shadow-sm cursor-pointer"
                >
                  Export Audit CSV
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F1F5F9] border-b border-[#DDE2EC] text-[11.5px] text-[#475569] uppercase font-mono tracking-wider whitespace-nowrap">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Action Event</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Login Time</th>
                    <th className="px-4 py-3">Logout Time</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[13px] text-[#334155]">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-[#64748B]">
                        No audit log records match the selected search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => {
                      const isLoginSession =
                        log.action.toLowerCase().includes("login") || log.module === "Authentication"

                      return (
                        <tr 
                          key={log.id} 
                          onClick={() => setSelectedAuditLog(log)}
                          className="hover:bg-[#F8FAFC] cursor-pointer transition-colors text-[12.5px]"
                        >
                          <td className="px-4 py-3 font-mono text-[11.5px] text-[#64748B] whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>

                          <td className="px-4 py-3 font-bold text-[#0F172A] whitespace-nowrap">
                            {log.username}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-[11.5px] bg-blue-50 text-[#1B4FD8] px-2 py-0.5 border border-blue-200 font-semibold">
                              {log.action}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-[#64748B] font-medium whitespace-nowrap">
                            {log.module}
                          </td>

                          <td className="px-4 py-3 text-[#334155] max-w-xs truncate">
                            {log.description}
                          </td>

                          <td className="px-4 py-3 font-medium text-[#0F172A] whitespace-nowrap">
                            {log.device || detectDevice()}
                          </td>

                          <td className="px-4 py-3 font-mono text-[12px] text-[#334155] whitespace-nowrap">
                            {log.loginTime || "—"}
                          </td>

                          <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                            {log.logoutTime === "Active" ? (
                              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200 font-bold rounded">
                                Active
                              </span>
                            ) : log.logoutTime === "Session Expired" ? (
                              <span className="text-amber-800 bg-amber-50 px-2 py-0.5 border border-amber-200 font-semibold rounded">
                                Session Expired
                              </span>
                            ) : (
                              log.logoutTime || "—"
                            )}
                          </td>

                          <td className="px-4 py-3 font-mono font-bold text-[#1B4FD8] whitespace-nowrap">
                            {log.duration || "—"}
                          </td>

                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 border ${
                                log.status === "Success"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {auditLogs.length < auditTotal && (
              <div className="p-3 border-t border-[#DDE2EC] flex items-center justify-center">
                <button
                  onClick={loadMoreAuditLogs}
                  disabled={auditLoadingMore}
                  className="text-[12.5px] font-semibold text-[#1B4FD8] hover:text-[#1E40AF] disabled:opacity-50 cursor-pointer"
                >
                  {auditLoadingMore
                    ? "Loading..."
                    : `Load more (${auditLogs.length} of ${auditTotal})`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 5: SYSTEM & GOVERNANCE SETTINGS ────────────────────────── */}
        {activeTab === "settings" && (
          <div className="space-y-6 w-full">
            <div className="bg-white border border-[#DDE2EC] p-6 space-y-6 shadow-sm">
              <div className="border-b border-[#E2E8F0] pb-4">
                <h3 className="text-base font-bold text-[#0F172A]">
                  Hospital System Security Policies
                </h3>
                <p className="text-[12.5px] text-[#64748B]">
                  Configure global authentication requirements, session expiry,
                  and access limits.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between p-4 bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div>
                    <div className="font-bold text-[#0F172A] text-[13.5px]">
                      Enforce Multi-Factor Auth (MFA)
                    </div>
                    <div className="text-[11.5px] text-[#64748B]">
                      Require OTP code on unknown device logins
                    </div>
                  </div>
                  <button
                    onClick={() => setMfaEnforced(!mfaEnforced)}
                    className={`w-12 h-6 flex items-center p-1 border transition-colors cursor-pointer ${
                      mfaEnforced
                        ? "bg-[#1B4FD8] border-blue-600 justify-end"
                        : "bg-gray-200 border-gray-300 justify-start"
                    }`}
                  >
                    <div className="w-4 h-4 bg-white shadow"></div>
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div>
                    <div className="font-bold text-[#0F172A] text-[13.5px]">
                      Maintenance Mode
                    </div>
                    <div className="text-[11.5px] text-[#64748B]">
                      Restrict logins to Super Admins only
                    </div>
                  </div>
                  <button
                    onClick={() => setMaintenanceMode(!maintenanceMode)}
                    className={`w-12 h-6 flex items-center p-1 border transition-colors cursor-pointer ${
                      maintenanceMode
                        ? "bg-amber-600 border-amber-500 justify-end"
                        : "bg-gray-200 border-gray-300 justify-start"
                    }`}
                  >
                    <div className="w-4 h-4 bg-white shadow"></div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Session Idle Timeout (Minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 30"
                    value={sessionTimeoutMinutes}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === "") {
                        setSessionTimeoutMinutes("")
                      } else {
                        const val = parseInt(raw, 10)
                        if (isNaN(val)) {
                          setSessionTimeoutMinutes("")
                        } else {
                          setSessionTimeoutMinutes(Math.max(0, Math.abs(val)))
                        }
                      }
                    }}
                    onBlur={() => {
                      if (sessionTimeoutMinutes === "") {
                        setSessionTimeoutMinutes(0)
                      }
                    }}
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Minimum Password Length
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 10"
                    value={minPasswordLength}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === "") {
                        setMinPasswordLength("")
                      } else {
                        const val = parseInt(raw, 10)
                        if (isNaN(val)) {
                          setMinPasswordLength("")
                        } else {
                          setMinPasswordLength(Math.max(0, Math.abs(val)))
                        }
                      }
                    }}
                    onBlur={() => {
                      if (minPasswordLength === "") {
                        setMinPasswordLength(0)
                      }
                    }}
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[#E2E8F0]">
                <button
                  onClick={() => {
                    setSettingsNotice(
                      "System governance security policy saved successfully.",
                    )
                    setTimeout(() => setSettingsNotice(""), 3000)
                  }}
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white font-semibold text-[13px] px-5 py-2 transition-colors border border-blue-600 shadow-sm cursor-pointer"
                >
                  Save Governance Policies
                </button>
              </div>

              {settingsNotice && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12.5px] p-3 font-semibold">
                  ✓ {settingsNotice}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────── */}

      {/* 1. Add / Edit Doctor Modal */}
      {showDoctorModal && editingDoctor && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                {doctors.some((d) => d.id === editingDoctor.id)
                  ? "Edit Doctor Profile"
                  : "Add New Doctor to Roster"}
              </h3>
              <button
                onClick={() => setShowDoctorModal(false)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveDoctor} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Doctor Full Name
                </label>
                <input
                  required
                  autoFocus
                  value={editingDoctor.name}
                  onChange={(e) =>
                    setEditingDoctor({ ...editingDoctor, name: e.target.value })
                  }
                  placeholder="e.g. Dr. P. R. K. Varma"
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Qualifications & Degrees
                  </label>
                  <input
                    required
                    value={editingDoctor.qualification}
                    onChange={(e) =>
                      setEditingDoctor({
                        ...editingDoctor,
                        qualification: e.target.value,
                      })
                    }
                    placeholder="e.g. M.D., D.M. (Cardiology)"
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Specialty / Department
                  </label>
                  <input
                    required
                    value={editingDoctor.specialty || ""}
                    onChange={(e) =>
                      setEditingDoctor({
                        ...editingDoctor,
                        specialty: e.target.value,
                      })
                    }
                    placeholder="e.g. Cardiology"
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Panel Category
                  </label>
                  <select
                    value={editingDoctor.section}
                    onChange={(e) =>
                      setEditingDoctor({
                        ...editingDoctor,
                        section: e.target.value as DoctorSection,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-semibold cursor-pointer"
                  >
                    <option value="Main">Main Resident Panel</option>
                    <option value="Visiting">Visiting Consultant</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Consultation Room
                  </label>
                  <input
                    required
                    value={editingDoctor.room}
                    onChange={(e) =>
                      setEditingDoctor({
                        ...editingDoctor,
                        room: e.target.value,
                      })
                    }
                    placeholder="e.g. Room 201"
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">Consultation Fee (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={
                      editingDoctor.consultationFee === undefined ||
                      editingDoctor.consultationFee === null ||
                      (editingDoctor.consultationFee as any) === "" ||
                      isNaN(editingDoctor.consultationFee as any)
                        ? ""
                        : editingDoctor.consultationFee
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingDoctor({
                        ...editingDoctor,
                        consultationFee: val === "" ? ("" as any) : Number(val),
                      });
                    }}
                    placeholder="e.g. 500"
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[13px] text-[#0F172A] font-semibold focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Staff Employee ID
                  </label>
                  <input
                    required
                    value={editingDoctor.staffId}
                    onChange={(e) =>
                      setEditingDoctor({
                        ...editingDoctor,
                        staffId: e.target.value,
                      })
                    }
                    placeholder="e.g. IMP-201"
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Login Username ID
                  </label>
                  <input
                    value={editingDoctor.username || ""}
                    onChange={(e) =>
                      setEditingDoctor({
                        ...editingDoctor,
                        username: e.target.value.toLowerCase().trim(),
                      })
                    }
                    placeholder="e.g. prkvarma"
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="doctorVerifiedCheck"
                  checked={editingDoctor.verified}
                  onChange={(e) =>
                    setEditingDoctor({
                      ...editingDoctor,
                      verified: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-[#1B4FD8] rounded cursor-pointer"
                />
                <label
                  htmlFor="doctorVerifiedCheck"
                  className="text-[12.5px] font-semibold text-[#0F172A] cursor-pointer"
                >
                  Verified Doctor (Enable for appointment booking & portal
                  login)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowDoctorModal(false)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold px-5 py-2 border border-blue-600 shadow-sm cursor-pointer"
                >
                  Save Doctor Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Edit Credentials Modal */}
      {showCredentialsModal && credentialsForm && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                Edit Login Credentials
              </h3>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveCredentials} className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-3 text-[12.5px] text-[#1B4FD8] font-semibold">
                Editing credentials for <strong>{credentialsForm.name}</strong>{" "}
                ({credentialsForm.staffId})
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Username (Login ID)
                </label>
                <input
                  required
                  value={credentialsForm.username}
                  onChange={(e) =>
                    setCredentialsForm({
                      ...credentialsForm,
                      username: e.target.value.toLowerCase().trim(),
                    })
                  }
                  placeholder="e.g. prkvarma"
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Account Password
                </label>
                <input
                  required
                  type="text"
                  value={credentialsForm.password || "password123"}
                  onChange={(e) =>
                    setCredentialsForm({
                      ...credentialsForm,
                      password: e.target.value,
                    })
                  }
                  placeholder="password123"
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Assigned System Role
                  </label>
                  <select
                    value={credentialsForm.roleId}
                    onChange={(e) =>
                      setCredentialsForm({
                        ...credentialsForm,
                        roleId: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-semibold cursor-pointer"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Account Status
                  </label>
                  <select
                    value={credentialsForm.status}
                    onChange={(e) =>
                      setCredentialsForm({
                        ...credentialsForm,
                        status: e.target.value as any,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-semibold cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Staff ID
                </label>
                <input
                  required
                  value={credentialsForm.staffId}
                  onChange={(e) =>
                    setCredentialsForm({
                      ...credentialsForm,
                      staffId: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowCredentialsModal(false)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold px-5 py-2 border border-blue-600 shadow-sm cursor-pointer"
                >
                  Update Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Create Role Modal */}
      {showCreateRoleModal && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                Create New Custom Role
              </h3>
              <button
                onClick={() => setShowCreateRoleModal(false)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateRole} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Role Name
                </label>
                <input
                  required
                  autoFocus
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Senior Critical Care Registrar"
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newRoleDescription}
                  onChange={(e) => setNewRoleDescription(e.target.value)}
                  placeholder="Responsibilities and access scope..."
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowCreateRoleModal(false)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold px-5 py-2 border border-blue-600 shadow-sm cursor-pointer"
                >
                  Create & Configure Modules
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Clone Role Modal */}
      {showCloneRoleModal && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                Clone Existing Role
              </h3>
              <button
                onClick={() => setShowCloneRoleModal(false)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCloneRole} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Source Role to Copy Permissions From
                </label>
                <select
                  value={cloneSourceRoleId}
                  onChange={(e) => setCloneSourceRoleId(e.target.value)}
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.allowedModules.length} Rules)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  New Role Name
                </label>
                <input
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. ICU Charge Nurse"
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowCloneRoleModal(false)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold px-5 py-2 border border-blue-600 shadow-sm cursor-pointer"
                >
                  Clone Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Create / Edit User Account Modal */}
      {showUserModal && editingUser && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                {users.some((u) => u.id === editingUser.id)
                  ? "Edit Staff User Account"
                  : "Create New Staff Account"}
              </h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Full Name
                </label>
                <input
                  required
                  value={editingUser.name}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, name: e.target.value })
                  }
                  placeholder="e.g. Dr. Robert Miller"
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Username ID
                  </label>
                  <input
                    required
                    value={editingUser.username}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        username: e.target.value.toLowerCase().trim(),
                      })
                    }
                    placeholder="e.g. rmiller"
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Staff Employee ID
                  </label>
                  <input
                    required
                    value={editingUser.staffId}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        staffId: e.target.value,
                      })
                    }
                    placeholder="e.g. DOC-901"
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Assigned System Role
                  </label>
                  <select
                    value={editingUser.roleId}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, roleId: e.target.value })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-semibold cursor-pointer"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                    Account Status
                  </label>
                  <select
                    value={editingUser.status || "Active"}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        status: e.target.value as any,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-semibold cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  Initial Account Password
                </label>
                <input
                  required
                  type="text"
                  value={editingUser.password || "password123"}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, password: e.target.value })
                  }
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold px-5 py-2 border border-blue-600 shadow-sm cursor-pointer"
                >
                  Save User Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Reset Password Modal */}
      {resetPassUser && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                Reset Account Password
              </h3>
              <button
                onClick={() => setResetPassUser(null)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div className="text-[12.5px] text-[#334155]">
                Resetting password for staff member{" "}
                <strong className="text-[#0F172A]">{resetPassUser.name}</strong>{" "}
                (@{resetPassUser.username}).
              </div>

              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1.5">
                  New Password
                </label>
                <input
                  required
                  type="text"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8] font-mono"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setResetPassUser(null)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white text-[13px] font-semibold px-4 py-2 border border-amber-600 shadow-sm cursor-pointer"
                >
                  Confirm Password Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Audit Detail Modal */}
      {selectedAuditLog && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F172A]">
                Security Event Log Inspector
              </h3>
              <button
                onClick={() => setSelectedAuditLog(null)}
                className="text-[#64748B] hover:text-black"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-[13px]">
              <div className="grid grid-cols-2 gap-4 bg-[#F8FAFC] p-4 border border-[#E2E8F0]">
                <div>
                  <div className="text-[11px] text-[#64748B] uppercase font-mono">
                    Event ID
                  </div>
                  <div className="font-mono text-[#0F172A] text-[12px]">
                    {selectedAuditLog.id}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B] uppercase font-mono">
                    Timestamp
                  </div>
                  <div className="font-mono text-[#0F172A] text-[12px]">
                    {new Date(selectedAuditLog.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-[#64748B] uppercase font-mono">
                    Executing User
                  </div>
                  <div className="font-bold text-[#0F172A]">
                    {selectedAuditLog.username}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#64748B] uppercase font-mono">
                    Event Action
                  </div>
                  <div className="font-semibold text-[#1B4FD8]">
                    {selectedAuditLog.action}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-[#64748B] uppercase font-mono mb-1">
                  Target Module
                </div>
                <div className="text-[#0F172A] font-mono">
                  {selectedAuditLog.module}
                </div>
              </div>

              {(selectedAuditLog.device || selectedAuditLog.action.toLowerCase().includes("login") || selectedAuditLog.module === "Authentication") && (
                <div className="grid grid-cols-2 gap-4 bg-[#F8FAFC] p-3.5 border border-[#E2E8F0]">
                  <div>
                    <div className="text-[11px] text-[#64748B] uppercase font-mono mb-0.5">Device</div>
                    <div className="font-bold text-[#0F172A]">{selectedAuditLog.device || detectDevice()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#64748B] uppercase font-mono mb-0.5">Session Duration</div>
                    <div className="font-mono text-[#1B4FD8] font-bold text-[12px]">{selectedAuditLog.duration || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#64748B] uppercase font-mono mb-0.5">Login Time</div>
                    <div className="font-mono text-[#0F172A] text-[12px]">{selectedAuditLog.loginTime || "—"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#64748B] uppercase font-mono mb-0.5">Logout Time</div>
                    <div className="font-mono text-[#0F172A] text-[12px]">
                      {selectedAuditLog.logoutTime === "Active" ? (
                        <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200 font-bold rounded">
                          Active
                        </span>
                      ) : selectedAuditLog.logoutTime === "Session Expired" ? (
                        <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 border border-amber-200 font-semibold rounded">
                          Session Expired
                        </span>
                      ) : (
                        selectedAuditLog.logoutTime || "—"
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="text-[11px] text-[#64748B] uppercase font-mono mb-1">
                  Event Description
                </div>
                <div className="bg-[#F8FAFC] p-3 border border-[#E2E8F0] text-[#334155] font-mono text-[12px]">
                  {selectedAuditLog.description}
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-[#E2E8F0]">
                <button
                  onClick={() => setSelectedAuditLog(null)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Close Inspector
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Add New Diagnostic Tariff Modal */}
      {showAddTariffModal && (
        <div className="fixed inset-0 bg-gray-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#DDE2EC] shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#F8FAFC] border-b border-[#DDE2EC] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  Add Investigation to Diagnostic Price Master
                </h3>
                <p className="text-[12px] text-[#64748B]">
                  Configure catalogue test code, modality, anatomy, variant protocol & tariff.
                </p>
              </div>
              <button
                onClick={() => setShowAddTariffModal(false)}
                className="text-[#64748B] hover:text-black cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTariff} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Department / Modality */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Department / Modality <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newTariffForm.department}
                    onChange={(e) => {
                      const dept = e.target.value as DiagnosticDepartment
                      let defRegion = "General"
                      let defInCharge = "Dr. Sunita Rao (Senior Radiologist)"
                      let defVariant = "Standard"

                      if (dept === "Laboratory") {
                        defRegion = "Haematology"
                        defInCharge = "Dr. Priya Patel (Pathology)"
                        defVariant = "Standard Lab Profile"
                      } else if (dept === "X-Ray") {
                        defRegion = "Chest"
                        defInCharge = "Dr. Sunita Rao (Senior Radiologist)"
                        defVariant = "PA View"
                      } else if (dept === "CT Scan") {
                        defRegion = "Brain"
                        defInCharge = "Dr. Sunita Rao (Senior Radiologist)"
                        defVariant = "Plain"
                      } else if (dept === "MRI") {
                        defRegion = "Brain"
                        defInCharge = "Dr. Sunita Rao (Senior Radiologist)"
                        defVariant = "Plain Multiplanar"
                      } else if (dept === "Ultrasound (USG)" || dept === "Doppler") {
                        defRegion = dept === "Doppler" ? "Cardiovascular" : "Abdomen & Pelvis"
                        defInCharge = "Dr. Amit Roy (USG In-Charge)"
                        defVariant = dept === "Doppler" ? "Color Duplex" : "Transabdominal"
                      } else {
                        defRegion = dept === "Dental" ? "Dental / Maxillofacial" : dept === "Mammography" ? "Breast" : "Special Procedures"
                        defInCharge = "Dr. Rajesh Sharma (HOD Radiology)"
                        defVariant = "Diagnostic Protocol"
                      }

                      setNewTariffForm({
                        ...newTariffForm,
                        department: dept,
                        modality: dept === "Laboratory" ? "Laboratory" : dept,
                        bodyRegion: defRegion,
                        subCategory: defRegion,
                        responsibleInCharge: defInCharge,
                        variantProtocol: defVariant,
                        reportTemplate: `Approved ${dept} Template`,
                      })
                    }}
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    <option value="Laboratory">Laboratory</option>
                    {RADIOLOGY_MODALITIES.map((mod) => (
                      <option key={mod} value={mod}>
                        Radiology: {mod}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Test Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. CT-BRAIN-PLAIN or XR-CHEST-PA"
                    value={newTariffForm.code}
                    onChange={(e) =>
                      setNewTariffForm({ ...newTariffForm, code: e.target.value.toUpperCase() })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] font-mono font-bold focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              {/* Examination Name */}
              <div>
                <label className="block text-[12px] font-bold text-[#334155] mb-1">
                  Examination / Investigation Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. CT Scan Brain Plain"
                  value={newTariffForm.name}
                  onChange={(e) => {
                    const name = e.target.value
                    setNewTariffForm({
                      ...newTariffForm,
                      name,
                      reportTemplate: `Approved ${name || "Examination"} Template`,
                    })
                  }}
                  className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] font-bold focus:outline-none focus:border-[#1B4FD8]"
                />
              </div>

              {/* Body Region & Variant Protocol */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Body Region
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Brain, Chest, Spine, Abdomen"
                    value={newTariffForm.bodyRegion}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        bodyRegion: e.target.value,
                        subCategory: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Variant / Protocol
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Plain, Contrast, PA View"
                    value={newTariffForm.variantProtocol}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        variantProtocol: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              {/* Hospital Availability & Tariff Reference */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Hospital Availability
                  </label>
                  <select
                    value={newTariffForm.hospitalAvailability}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        hospitalAvailability: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] font-semibold focus:outline-none focus:border-[#1B4FD8] cursor-pointer"
                  >
                    <option value="Enabled">Enabled (In-House)</option>
                    <option value="Unavailable">Unavailable</option>
                    <option value="Referred Externally">Referred Externally</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Tariff Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Existing Billing tariff"
                    value={newTariffForm.tariffReference}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        tariffReference: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              {/* Responsible In-Charge & Report Template */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Responsible In-Charge
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Sunita Rao (Senior Radiologist)"
                    value={newTariffForm.responsibleInCharge}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        responsibleInCharge: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Report Template
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Approved CT Brain Template"
                    value={newTariffForm.reportTemplate}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        reportTemplate: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              {/* Price & Turnaround Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    placeholder="e.g. 2800"
                    value={newTariffForm.price}
                    onChange={(e) =>
                      setNewTariffForm({
                        ...newTariffForm,
                        price: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3.5 py-2 text-[13px] text-[#0F172A] font-mono font-bold focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>

                <div>
                  <label className="block text-[12px] font-bold text-[#334155] mb-1">
                    Turnaround Time (TAT)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2 Hours, 4 Hours"
                    value={newTariffForm.tat}
                    onChange={(e) =>
                      setNewTariffForm({ ...newTariffForm, tat: e.target.value })
                    }
                    className="w-full bg-white border border-[#DDE2EC] px-3 py-2 text-[12.5px] text-[#0F172A] focus:outline-none focus:border-[#1B4FD8]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowAddTariffModal(false)}
                  className="bg-white hover:bg-gray-50 text-[#334155] text-[13px] font-semibold px-4 py-2 border border-[#CBD5E1] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-semibold px-5 py-2 border border-blue-600 shadow-2xs cursor-pointer"
                >
                  Save Catalogue Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
