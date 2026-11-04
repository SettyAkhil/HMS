import React, { useState } from "react"
import { Icon } from "./icons"
import { MessageCircle, X, Search } from "lucide-react"
import SendToPatientDialog from "./messaging/SendToPatientDialog"
import PhoneInput from "./ui/PhoneInput"
import { db } from "../services/db"

export default function PatientExperience() {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<{ name: string; phone: string; id?: string }>({
    name: "",
    phone: "",
    id: "",
  })
  const [search, setSearch] = useState("")

  const encounters = db.getEncounters().slice(0, 10)
  const filtered = encounters.filter(
    (e) =>
      !search ||
      e.patientName.toLowerCase().includes(search.toLowerCase()) ||
      (e.phone && e.phone.includes(search)) ||
      (e.umr && e.umr.toLowerCase().includes(search.toLowerCase())),
  )

  const handleStartFeedback = (p: { name: string; phone: string; id?: string }) => {
    setSelectedPatient(p)
    setPickerOpen(false)
    setDialogOpen(true)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Patient Experience
          </h1>
          <p className="text-[12.5px] text-[#64748B]">
            Monitor feedback, satisfaction scores, and patient relations.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium rounded transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <MessageCircle size={14} /> Request Feedback (WhatsApp)
          </button>
          <button className="h-8 px-3 bg-white border border-[#DDE2EC] text-[#1B4FD8] text-[12px] font-medium rounded hover:bg-[#F8FAFC] transition-colors flex items-center gap-2">
            <Icon.Download /> Export Data
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6 w-full">
        {/* Top Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Net Promoter Score (NPS)",
              val: "72",
              desc: "Excellent",
              color: "text-green-600",
            },
            {
              label: "CSAT (Out of 5)",
              val: "4.6",
              desc: "Based on 450 surveys",
              color: "text-[#1B4FD8]",
            },
            {
              label: "Open Grievances",
              val: "12",
              desc: "4 High Priority",
              color: "text-red-600",
            },
            {
              label: "Response Rate",
              val: "38%",
              desc: "+5% this month",
              color: "text-gray-900",
            },
          ].map((stat, i) => (
            <div
              key={i}
              className="bg-white border border-[#DDE2EC] p-4 rounded-xl shadow-sm"
            >
              <div className="text-[11.5px] font-semibold text-[#64748B] mb-2">
                {stat.label}
              </div>
              <div className={`text-3xl font-bold ${stat.color} mb-1`}>
                {stat.val}
              </div>
              <div className="text-[11px] text-gray-500">{stat.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-6">
          {/* Recent Feedback Feed */}
          <div className="flex-1 bg-white border border-[#DDE2EC] rounded-xl shadow-sm flex flex-col min-h-[400px]">
            <div className="px-5 py-3 border-b border-[#DDE2EC] bg-[#F8FAFC] flex justify-between items-center">
              <h2 className="text-[14px] font-semibold text-gray-900">
                Recent Survey Responses
              </h2>
              <div className="flex gap-2 text-[12px]">
                <select className="border border-[#DDE2EC] rounded bg-white text-[11px] px-2 py-1 focus:outline-none">
                  <option>All Departments</option>
                  <option>Emergency</option>
                  <option>Outpatient</option>
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {[
                {
                  rating: 5,
                  dept: "Cardiology (OPD)",
                  comment:
                    "Dr. Jenkins was extremely thorough and took the time to answer all my questions. Staff was friendly.",
                  patient: "M.G.",
                  date: "Today, 10:45 AM",
                },
                {
                  rating: 2,
                  dept: "Emergency",
                  comment:
                    "Wait times were incredibly long. We waited 4 hours just to be seen for a broken arm. Once we saw the doctor, care was fine.",
                  patient: "Anonymous",
                  date: "Yesterday",
                },
                {
                  rating: 5,
                  dept: "Orthopedics",
                  comment:
                    "Surgery went perfectly, nursing staff in 3N was so attentive and kind.",
                  patient: "E.W.",
                  date: "Aug 22",
                },
                {
                  rating: 4,
                  dept: "Pharmacy",
                  comment:
                    "Fast service but the waiting area was a bit crowded.",
                  patient: "R.L.",
                  date: "Aug 21",
                },
              ].map((fb, i) => (
                <div
                  key={i}
                  className="border border-[#DDE2EC] rounded-none p-4 hover:bg-[#F8FAFC] transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex text-yellow-400 text-[14px]">
                        {[...Array(5)].map((_, j) => (
                          <span key={j}>{j < fb.rating ? "★" : "☆"}</span>
                        ))}
                      </div>
                      <span className="text-[12px] font-semibold text-gray-900">
                        {fb.dept}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#64748B]">
                      {fb.date}
                    </span>
                  </div>
                  <p className="text-[13px] text-gray-700 italic mb-3">
                    "{fb.comment}"
                  </p>
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-[#64748B]">
                      Patient: {fb.patient}
                    </span>
                    {fb.rating <= 3 && (
                      <button className="text-[#1B4FD8] font-medium hover:underline">
                        Follow Up / Escalate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Grievances / Action Items */}
          <div className="w-80 bg-white border border-[#DDE2EC] rounded-xl shadow-sm flex flex-col">
            <div className="px-5 py-3 border-b border-[#DDE2EC] bg-[#F8FAFC]">
              <h2 className="text-[13px] font-semibold text-gray-900 flex items-center gap-2">
                <Icon.Alert /> Active Grievances
              </h2>
            </div>
            <div className="p-4 space-y-4">
              {[
                {
                  id: "G-9102",
                  issue: "Billing Dispute",
                  status: "In Review",
                  priority: "High",
                },
                {
                  id: "G-9088",
                  issue: "Rude Staff Behavior",
                  status: "Pending Interview",
                  priority: "High",
                },
                {
                  id: "G-9045",
                  issue: "Lost Patient Belongings",
                  status: "Investigation",
                  priority: "Medium",
                },
              ].map((g, i) => (
                <div
                  key={i}
                  className="border-l-4 border-red-500 bg-[#FAFBFF] border-t border-r border-b border-[#DDE2EC] rounded-r p-3"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[11px] font-mono text-[#64748B]">
                      {g.id}
                    </span>
                    <span className="text-[10px] font-bold text-red-600 uppercase">
                      {g.priority}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-gray-900 mb-1">
                    {g.issue}
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[11.5px] text-[#1B4FD8]">
                      {g.status}
                    </span>
                    <button className="text-[11px] font-medium text-gray-600 hover:text-gray-900">
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-[#DDE2EC] bg-[#F8FAFC] mt-auto">
              <button className="w-full text-center text-[12px] font-medium text-[#1B4FD8] hover:underline">
                View all 12 open grievances
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Pick patient to request feedback */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-[#DDE2EC] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 border-b border-[#DDE2EC] bg-[#F8FAFC] flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Request Feedback via WhatsApp
                </h3>
                <p className="text-[11.5px] text-[#64748B]">
                  Select a patient or enter details to request rating & review
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search recent patients by name, UMR, or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-[12.5px] border border-[#DDE2EC] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() =>
                      handleStartFeedback({
                        name: e.patientName,
                        phone: e.phone,
                        id: e.umr,
                      })
                    }
                    className="w-full text-left p-2.5 hover:bg-blue-50/50 transition-colors flex justify-between items-center group cursor-pointer"
                  >
                    <div>
                      <div className="text-[12.5px] font-semibold text-gray-800 group-hover:text-blue-600">
                        {e.patientName}
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono">
                        {e.umr || e.opNumber} · {e.phone || "No phone"}
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                      Select
                    </span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <div className="text-[11.5px] font-medium text-gray-700 mb-1.5">
                  Or enter mobile manually:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Patient Name"
                    value={selectedPatient.name}
                    onChange={(e) =>
                      setSelectedPatient((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="px-2.5 py-1.5 text-[12px] border border-[#DDE2EC] rounded-md focus:outline-none"
                  />
                  <PhoneInput
                    size="sm"
                    placeholder="98765 43210"
                    value={selectedPatient.phone}
                    onChange={(val) =>
                      setSelectedPatient((prev) => ({ ...prev, phone: val }))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPatient.name || selectedPatient.phone) {
                      setPickerOpen(false)
                      setDialogOpen(true)
                    }
                  }}
                  disabled={!selectedPatient.phone}
                  className="mt-2 w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[12px] font-medium rounded-md transition-colors cursor-pointer"
                >
                  Continue to WhatsApp Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actual Send to Patient Dialog */}
      <SendToPatientDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        patient={selectedPatient}
        kind="feedback_request"
        documentLabel="Feedback / Review Request"
      />
    </div>
  )
}
