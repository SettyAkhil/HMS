/**
 * Enterprise Hospital Management System - Patient Global Profile & Clinical Audit View
 * Path: src/components/reports/PatientGlobalProfileView.tsx
 *
 * Full-width multi-tab patient profile aggregating:
 * - Demographics & Financial Summary
 * - Complete Activity Timeline with category filtering & pagination
 * - Doctor Consultations & Vitals
 * - Prescriptions & Pharmacy Dispensing
 * - Diagnostics & Lab Orders
 * - Inpatient & Emergency Visits
 * - Billing Ledger & Receipts
 */

import React, { useState, useMemo } from "react"
import {
  ArrowLeft,
  Printer,
  User,
  Calendar,
  Phone,
  MapPin,
  HeartPulse,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Pill,
  TestTube,
  Bed,
  Building2,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  Download,
  Receipt,
  Layers,
  Sparkles,
  ShieldCheck,
} from "lucide-react"
import {
  GlobalSearchService,
  PatientActivityProfile,
  PatientTimelineCategory,
  PatientTimelineEvent,
} from "../../services/globalSearchService"

interface PatientGlobalProfileViewProps {
  patientIdOrUmr: string
  onBack: () => void
}

const TIMELINE_CATEGORIES: PatientTimelineCategory[] = [
  "All",
  "Consultations",
  "Prescriptions",
  "Diagnostics",
  "Inpatient",
  "Emergency",
  "Billing",
]

export const PatientGlobalProfileView: React.FC<PatientGlobalProfileViewProps> = ({
  patientIdOrUmr,
  onBack,
}) => {
  const profile: PatientActivityProfile = useMemo(() => {
    return GlobalSearchService.getPatientActivityProfile(patientIdOrUmr)
  }, [patientIdOrUmr])

  const [activeTab, setActiveTab] = useState<
    "timeline" | "consultations" | "pharmacy" | "diagnostics" | "inpatient_er" | "billing"
  >("timeline")

  // Timeline filters and pagination
  const [selectedTimelineCategory, setSelectedTimelineCategory] =
    useState<PatientTimelineCategory>("All")
  const [timelinePage, setTimelinePage] = useState<number>(1)
  const pageSize = 10
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null)

  const filteredTimeline = useMemo(() => {
    if (selectedTimelineCategory === "All") return profile.timeline
    return profile.timeline.filter((item) => item.category === selectedTimelineCategory)
  }, [profile.timeline, selectedTimelineCategory])

  const visibleTimeline = useMemo(() => {
    return filteredTimeline.slice(0, timelinePage * pageSize)
  }, [filteredTimeline, timelinePage])

  const handlePrint = () => {
    window.print()
  }

  const { demographics, financials } = profile

  return (
    <div className="w-full space-y-4 animate-in fade-in-50 duration-150">
      {/* ── 1. TOP ACTION BAR ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-[#E2E8F0] rounded-xl px-5 py-3.5 shadow-2xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Reports Overview</span>
          </button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-tight text-slate-900">
                Patient Clinical Audit File
              </span>
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                UMR: {demographics.umr}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Print Clinical Audit</span>
          </button>
        </div>
      </div>

      {/* ── 2. DEMOGRAPHIC HEADER CARD ────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-black text-xl shadow-md shadow-blue-500/20 shrink-0">
              {demographics.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-slate-900">
                  {demographics.name}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  {demographics.bloodGroup || "O+"}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                  {demographics.age} Yrs · {demographics.gender}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {demographics.phone}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {demographics.address}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Registered: {demographics.registrationDate.split("T")[0]}
                </span>
              </div>
            </div>
          </div>

          {/* Financial Ledger Mini-Card */}
          <div className="w-full lg:w-auto flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3 shrink-0">
            <div className="px-3 border-r border-slate-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total Charges
              </div>
              <div className="text-sm font-black text-slate-900">
                ₹{financials.totalCharges.toLocaleString("en-IN")}
              </div>
            </div>
            <div className="px-3 border-r border-slate-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Paid to Date
              </div>
              <div className="text-sm font-black text-emerald-600">
                ₹{financials.totalPaid.toLocaleString("en-IN")}
              </div>
            </div>
            <div className="px-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Balance Due
              </div>
              <div
                className={`text-sm font-black ${
                  financials.outstandingBalance > 0
                    ? "text-rose-600"
                    : "text-slate-700"
                }`}
              >
                ₹{financials.outstandingBalance.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. WORKSPACE SUB-TABS ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="flex border-b border-[#E2E8F0] overflow-x-auto bg-slate-50/70 p-1 gap-1">
          {[
            { id: "timeline", label: "Complete Activity Timeline", icon: Clock },
            { id: "consultations", label: `Doctor Visits (${profile.encounters.length})`, icon: Stethoscope },
            { id: "pharmacy", label: `Prescriptions & Pharmacy (${profile.prescriptions.length})`, icon: Pill },
            { id: "diagnostics", label: `Diagnostics & Lab (${profile.labOrders.length})`, icon: TestTube },
            { id: "inpatient_er", label: "Inpatient & ER Records", icon: Bed },
            { id: "billing", label: "Billing & Ledger", icon: CreditCard },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-white text-[#1B4FD8] shadow-2xs border border-[#E2E8F0]"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#1B4FD8]" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {/* ── TAB 1: COMPLETE ACTIVITY TIMELINE ──────────────────────────── */}
          {activeTab === "timeline" && (
            <div className="space-y-4">
              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 mr-1 uppercase tracking-wider">
                  Filter Category:
                </span>
                {TIMELINE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedTimelineCategory(cat)
                      setTimelinePage(1)
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition cursor-pointer ${
                      selectedTimelineCategory === cat
                        ? "bg-[#1B4FD8] text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Timeline Feed */}
              {visibleTimeline.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No activity events found in this category.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {visibleTimeline.map((item) => {
                    const isExpanded = expandedTimelineId === item.id

                    return (
                      <div key={item.id} className="relative group">
                        {/* Dot indicator */}
                        <div className="absolute -left-6 top-1.5 w-3 h-3 rounded-full bg-white border-2 border-[#1B4FD8] shadow-xs group-hover:scale-110 transition-transform" />

                        <div className="bg-white border border-[#E2E8F0] hover:border-blue-200 rounded-xl p-3.5 shadow-2xs transition-all">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                                  item.badgeColor ||
                                  "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {item.badge}
                              </span>
                              <span className="text-xs font-black text-slate-900">
                                {item.title}
                              </span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-400">
                              {item.dateTimeFormatted}
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 mt-1">
                            {item.description}
                          </p>

                          {/* Extra info footer */}
                          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                            <div className="flex items-center gap-3">
                              {item.doctor && (
                                <span className="flex items-center gap-1 text-slate-700 font-medium">
                                  <Stethoscope className="w-3 h-3 text-purple-600" />
                                  {item.doctor}
                                </span>
                              )}
                              {item.department && (
                                <span className="flex items-center gap-1 text-slate-500">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {item.department}
                                </span>
                              )}
                            </div>

                            {item.cost !== undefined && item.cost > 0 && (
                              <span className="font-bold text-slate-800">
                                ₹{item.cost.toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Load More Pagination */}
              {visibleTimeline.length < filteredTimeline.length && (
                <div className="pt-2 text-center">
                  <button
                    onClick={() => setTimelinePage((p) => p + 1)}
                    className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                  >
                    Load More Events ({filteredTimeline.length - visibleTimeline.length} remaining)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2: DOCTOR CONSULTATIONS ────────────────────────────────── */}
          {activeTab === "consultations" && (
            <div className="space-y-3">
              {profile.encounters.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  No outpatient visits on file.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3.5">Date & Time</th>
                        <th className="py-2.5 px-3.5">Doctor</th>
                        <th className="py-2.5 px-3.5">Department</th>
                        <th className="py-2.5 px-3.5">Complaint & Diagnosis</th>
                        <th className="py-2.5 px-3.5">Fee</th>
                        <th className="py-2.5 px-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {profile.encounters.map((enc) => (
                        <tr key={enc.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-3.5 font-medium text-slate-700 whitespace-nowrap">
                            {enc.dateTimeFormatted}
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">
                            {enc.doctor}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {enc.department}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="font-semibold text-slate-800">
                              {enc.diagnosis}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {enc.complaint}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-700">
                            ₹{enc.fee}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              {enc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 3: PRESCRIPTIONS & PHARMACY ────────────────────────────── */}
          {activeTab === "pharmacy" && (
            <div className="space-y-4">
              {profile.prescriptions.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  No active prescriptions or pharmacy records recorded.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profile.prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                          <div className="text-xs font-black text-slate-900">
                            {rx.doctor}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {rx.department} · {rx.date}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                          {rx.status}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Medications ({rx.items.length})
                        </div>
                        {rx.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-50 rounded-lg p-2 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-bold text-slate-800">
                                {item.medicine}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {item.dosage} · {item.frequency} · {item.duration}
                              </div>
                            </div>
                            <span className="text-[10px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                              Qty: {item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 4: DIAGNOSTICS & LAB ───────────────────────────────────── */}
          {activeTab === "diagnostics" && (
            <div className="space-y-3">
              {profile.labOrders.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs">
                  No diagnostic laboratory orders recorded.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3.5">Order ID</th>
                        <th className="py-2.5 px-3.5">Date</th>
                        <th className="py-2.5 px-3.5">Doctor</th>
                        <th className="py-2.5 px-3.5">Tests Ordered</th>
                        <th className="py-2.5 px-3.5">Billing</th>
                        <th className="py-2.5 px-3.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {profile.labOrders.map((lo) => (
                        <tr key={lo.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">
                            {lo.id}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {lo.date}
                          </td>
                          <td className="py-2.5 px-3.5 font-medium text-slate-800">
                            {lo.doctor}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <div className="flex flex-wrap gap-1">
                              {lo.tests.map((t, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold"
                                >
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 font-semibold text-slate-700">
                            ₹{lo.billingTotal} ({lo.billingStatus})
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {lo.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 5: INPATIENT & ER RECORDS ──────────────────────────────── */}
          {activeTab === "inpatient_er" && (
            <div className="space-y-5">
              {/* Active Bed Allocation */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Inpatient Bed Allocation
                </h3>
                {profile.inpatientRecords.currentBed ? (
                  <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-emerald-900">
                          Ward {profile.inpatientRecords.currentBed.ward} · Bed {profile.inpatientRecords.currentBed.bed_no}
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                          Currently Admitted
                        </span>
                      </div>
                      <div className="text-xs text-emerald-700 mt-1">
                        Type: {profile.inpatientRecords.currentBed.bed_type} · Room: {profile.inpatientRecords.currentBed.room_no} · Rate: ₹{profile.inpatientRecords.currentBed.daily_rate}/day
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-emerald-800">
                        Room Charges So Far
                      </div>
                      <div className="text-sm font-black text-emerald-950">
                        ₹{profile.inpatientRecords.currentBed.room_charges_so_far || 0}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                    No active inpatient bed currently allocated.
                  </div>
                )}
              </div>

              {/* Emergency Visits */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Emergency Room (ER) Encounters
                </h3>
                {profile.emergencyVisits.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                    No emergency encounters on record.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3.5">Visit No</th>
                          <th className="py-2.5 px-3.5">Admission Time</th>
                          <th className="py-2.5 px-3.5">Triage Level</th>
                          <th className="py-2.5 px-3.5">Chief Complaint</th>
                          <th className="py-2.5 px-3.5">Attending Doctor</th>
                          <th className="py-2.5 px-3.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {profile.emergencyVisits.map((er) => (
                          <tr key={er.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-2.5 px-3.5 font-bold text-slate-900">
                              {er.visitNo}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600">
                              {er.dateTimeFormatted}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                {er.triageCategory}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 font-medium text-slate-800">
                              {er.chiefComplaint}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-700 font-semibold">
                              {er.attendingPhysician}
                            </td>
                            <td className="py-2.5 px-3.5 font-semibold text-slate-700">
                              {er.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 6: BILLING & FINANCIAL LEDGER ──────────────────────────── */}
          {activeTab === "billing" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Total Invoiced Charges
                  </div>
                  <div className="text-lg font-black text-slate-900 mt-1">
                    ₹{financials.totalCharges.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Total Payments Received
                  </div>
                  <div className="text-lg font-black text-emerald-600 mt-1">
                    ₹{financials.totalPaid.toLocaleString("en-IN")}
                  </div>
                </div>
                <div className="bg-rose-50/50 border border-rose-200 rounded-xl p-3.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                    Outstanding Balance Due
                  </div>
                  <div className="text-lg font-black text-rose-600 mt-1">
                    ₹{financials.outstandingBalance.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              {/* Invoices List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Itemized Department Invoices
                </h4>
                {financials.invoices.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                    No central invoices created.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-[#E2E8F0] text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-2.5 px-3.5">Invoice No</th>
                          <th className="py-2.5 px-3.5">Date</th>
                          <th className="py-2.5 px-3.5">Department</th>
                          <th className="py-2.5 px-3.5">Amount</th>
                          <th className="py-2.5 px-3.5">Paid</th>
                          <th className="py-2.5 px-3.5">Balance</th>
                          <th className="py-2.5 px-3.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {financials.invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                            <td className="py-2.5 px-3.5 font-bold text-slate-900">
                              {inv.invoiceNo}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-600">
                              {inv.dateOfService}
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-700 font-semibold">
                              {inv.department}
                            </td>
                            <td className="py-2.5 px-3.5 font-bold text-slate-900">
                              ₹{inv.totalAmount}
                            </td>
                            <td className="py-2.5 px-3.5 text-emerald-600 font-semibold">
                              ₹{inv.amountPaid}
                            </td>
                            <td className="py-2.5 px-3.5 text-rose-600 font-semibold">
                              ₹{inv.balanceDue}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

