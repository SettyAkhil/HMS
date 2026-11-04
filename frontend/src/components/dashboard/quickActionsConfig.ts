import React from "react"
import {
  Users,
  Calendar,
  Siren,
  BedDouble,
  FlaskConical,
  Pill,
  Heart,
  CreditCard,
  Stethoscope,
  Activity,
  ScanLine,
  ShieldCheck,
  Clock,
  ClipboardList,
  BarChart3,
  UserCheck,
  Landmark,
  Package,
  AlertCircle,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react"

export interface QuickActionDef {
  id: string
  label: string
  desc: string
  module: string
  subModule?: string
  iconName: string
  bg: string
  hoverBg: string
  iconBg: string
  textColor: string
  category: "Clinical & Care" | "Emergency & Inpatient" | "Diagnostics & Pharmacy" | "Operations & Billing"
}

export const QUICK_ACTION_STORAGE_KEY = "hospai_dashboard_quick_actions_v1"

export const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Users,
  Calendar,
  Siren,
  BedDouble,
  FlaskConical,
  Pill,
  Heart,
  CreditCard,
  Stethoscope,
  Activity,
  ScanLine,
  ShieldCheck,
  Clock,
  ClipboardList,
  BarChart3,
  UserCheck,
  Landmark,
  Package,
  AlertCircle,
  Sparkles,
  SlidersHorizontal,
}

export const ALL_QUICK_ACTIONS: QuickActionDef[] = [
  {
    id: "register",
    label: "Patient Registration",
    desc: "OP registration, demographics & token generation",
    module: "register",
    iconName: "Users",
    bg: "#EFF6FF",
    hoverBg: "hover:bg-blue-100",
    iconBg: "bg-blue-500",
    textColor: "text-blue-900",
    category: "Clinical & Care",
  },
  {
    id: "appointments",
    label: "Schedule Appointment",
    desc: "Doctor OP booking, clinic schedules & time slots",
    module: "appointments",
    iconName: "Calendar",
    bg: "#F5F3FF",
    hoverBg: "hover:bg-purple-100",
    iconBg: "bg-purple-500",
    textColor: "text-purple-900",
    category: "Clinical & Care",
  },
  {
    id: "emergency",
    label: "ED Track Board",
    desc: "Emergency department census, bed board & intake",
    module: "emergency",
    iconName: "Siren",
    bg: "#FFF1F2",
    hoverBg: "hover:bg-rose-100",
    iconBg: "bg-rose-500",
    textColor: "text-rose-900",
    category: "Emergency & Inpatient",
  },
  {
    id: "inpatient",
    label: "Bed Allocation Board",
    desc: "Inpatient census, ward management & transfers",
    module: "inpatient",
    iconName: "BedDouble",
    bg: "#F5F3FF",
    hoverBg: "hover:bg-indigo-100",
    iconBg: "bg-indigo-500",
    textColor: "text-indigo-900",
    category: "Emergency & Inpatient",
  },
  {
    id: "laboratory",
    label: "Lab Orders & Diagnostics",
    desc: "Pathology tests, specimen accession & results",
    module: "laboratory",
    iconName: "FlaskConical",
    bg: "#FEF3C7",
    hoverBg: "hover:bg-amber-100",
    iconBg: "bg-amber-500",
    textColor: "text-amber-900",
    category: "Diagnostics & Pharmacy",
  },
  {
    id: "pharmacy_dispensing",
    label: "Pharmacy Dispensing",
    desc: "Rx verification, drug fulfillment & counter billing",
    module: "pharmacy_dispensing",
    iconName: "Pill",
    bg: "#ECFDF5",
    hoverBg: "hover:bg-emerald-100",
    iconBg: "bg-emerald-500",
    textColor: "text-emerald-900",
    category: "Diagnostics & Pharmacy",
  },
  {
    id: "surgery",
    label: "Surgery OR Board",
    desc: "Operating theater schedules, surgeons & anesthesia",
    module: "surgery",
    iconName: "Heart",
    bg: "#CCFBF1",
    hoverBg: "hover:bg-teal-100",
    iconBg: "bg-teal-500",
    textColor: "text-teal-900",
    category: "Emergency & Inpatient",
  },
  {
    id: "billing",
    label: "Billing & Claims",
    desc: "Unified invoices, counter payments & cashier queue",
    module: "billing",
    iconName: "CreditCard",
    bg: "#EEF2FF",
    hoverBg: "hover:bg-blue-100",
    iconBg: "bg-blue-600",
    textColor: "text-blue-900",
    category: "Operations & Billing",
  },
  {
    id: "doctor_portal",
    label: "My Doctor Portal",
    desc: "OP consultations, speech-to-note & digital prescriptions",
    module: "doctor_portal",
    iconName: "Stethoscope",
    bg: "#F0FDF4",
    hoverBg: "hover:bg-emerald-100",
    iconBg: "bg-emerald-600",
    textColor: "text-emerald-900",
    category: "Clinical & Care",
  },
  {
    id: "icu",
    label: "ICU Critical Care",
    desc: "Critical care bed board, 24-hr daily flowsheet & vitals",
    module: "icu",
    iconName: "Activity",
    bg: "#EFF6FF",
    hoverBg: "hover:bg-sky-100",
    iconBg: "bg-sky-500",
    textColor: "text-sky-900",
    category: "Emergency & Inpatient",
  },
  {
    id: "radiology",
    label: "Radiology & Imaging",
    desc: "X-Ray, CT, MRI, Ultrasound imaging worklist & PACS",
    module: "radiology",
    iconName: "ScanLine",
    bg: "#FAF5FF",
    hoverBg: "hover:bg-purple-100",
    iconBg: "bg-violet-600",
    textColor: "text-violet-900",
    category: "Diagnostics & Pharmacy",
  },
  {
    id: "insurance",
    label: "Insurance Desk",
    desc: "Cashless authorization, TPA claims & settlements",
    module: "insurance",
    iconName: "ShieldCheck",
    bg: "#F8FAFC",
    hoverBg: "hover:bg-slate-200",
    iconBg: "bg-slate-700",
    textColor: "text-slate-900",
    category: "Operations & Billing",
  },
  {
    id: "queue",
    label: "Patient Queue Board",
    desc: "OP token calling, clinic wait timers & lobby display",
    module: "queue",
    iconName: "Clock",
    bg: "#FFFBEB",
    hoverBg: "hover:bg-amber-100",
    iconBg: "bg-amber-600",
    textColor: "text-amber-900",
    category: "Clinical & Care",
  },
  {
    id: "nursing",
    label: "Nurse Station",
    desc: "Inpatient vitals charting, medication rounds & nursing handoff",
    module: "nursing",
    iconName: "ClipboardList",
    bg: "#F0FDF4",
    hoverBg: "hover:bg-green-100",
    iconBg: "bg-green-600",
    textColor: "text-green-900",
    category: "Clinical & Care",
  },
  {
    id: "reports",
    label: "Hospital Reports",
    desc: "Executive KPI dashboards, census reports & MIS analytics",
    module: "reports",
    iconName: "BarChart3",
    bg: "#EFF6FF",
    hoverBg: "hover:bg-blue-100",
    iconBg: "bg-blue-700",
    textColor: "text-blue-900",
    category: "Operations & Billing",
  },
  {
    id: "hrms",
    label: "HR & Staffing",
    desc: "Staff directory, duty rosters, attendance & shift scheduling",
    module: "hrms",
    iconName: "UserCheck",
    bg: "#FDF2F8",
    hoverBg: "hover:bg-pink-100",
    iconBg: "bg-pink-600",
    textColor: "text-pink-900",
    category: "Operations & Billing",
  },
  {
    id: "accounts",
    label: "Accounts & Finance",
    desc: "Chart of accounts, general ledger & daily revenue summary",
    module: "accounts",
    iconName: "Landmark",
    bg: "#F0FDF4",
    hoverBg: "hover:bg-teal-100",
    iconBg: "bg-teal-600",
    textColor: "text-teal-900",
    category: "Operations & Billing",
  },
  {
    id: "pharmacy_grn",
    label: "Inward Stock (GRN)",
    desc: "Pharmacy purchase orders, vendor invoices & batch inventory",
    module: "pharmacy_grn",
    iconName: "Package",
    bg: "#FEF3C7",
    hoverBg: "hover:bg-amber-100",
    iconBg: "bg-amber-600",
    textColor: "text-amber-900",
    category: "Diagnostics & Pharmacy",
  },
  {
    id: "triage",
    label: "Smart Triage",
    desc: "Emergency triage scoring, ESI acuity & fast-track routing",
    module: "triage",
    iconName: "AlertCircle",
    bg: "#FFF1F2",
    hoverBg: "hover:bg-rose-100",
    iconBg: "bg-red-500",
    textColor: "text-red-900",
    category: "Emergency & Inpatient",
  },
  {
    id: "patient_exp",
    label: "Patient Journey EMR",
    desc: "Longitudinal patient journey, clinical timeline & visit history",
    module: "patient_exp",
    iconName: "Sparkles",
    bg: "#EEF2FF",
    hoverBg: "hover:bg-indigo-100",
    iconBg: "bg-indigo-600",
    textColor: "text-indigo-900",
    category: "Clinical & Care",
  },
]

export const DEFAULT_QUICK_ACTION_IDS = [
  "register",
  "appointments",
  "emergency",
  "inpatient",
  "laboratory",
  "pharmacy_dispensing",
  "surgery",
  "billing",
]

export function loadQuickActionIds(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(QUICK_ACTION_STORAGE_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out any stale ids that don't exist in catalog
        const valid = parsed.filter((id) => ALL_QUICK_ACTIONS.some((a) => a.id === id))
        if (valid.length > 0) return valid
      }
    }
  } catch {}
  return [...DEFAULT_QUICK_ACTION_IDS]
}

export function saveQuickActionIds(ids: string[]): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(QUICK_ACTION_STORAGE_KEY, JSON.stringify(ids))
      try {
        new BroadcastChannel("hospai_dashboard_channel").postMessage({ type: "quick_actions_updated", ids })
      } catch {}
    }
  } catch (err) {
    console.warn("Failed to persist dashboard quick actions:", err)
  }
}
