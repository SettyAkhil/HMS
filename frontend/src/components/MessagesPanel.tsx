import React, { useState } from "react"
import { CheckCheck, MessageSquare, Send, X, ArrowRight, User } from "lucide-react"

export interface ClinicalMessage {
  id: string
  senderName: string
  senderRole: string
  department: string
  avatarInitials: string
  avatarColor: string
  subject: string
  content: string
  timeAgo: string
  targetModule: string
  targetSubModule?: string
  priority: "STAT" | "Routine" | "Urgent"
  isRead: boolean
}

const INITIAL_MESSAGES: ClinicalMessage[] = [
  {
    id: "msg-1",
    senderName: "Dr. Priya Patel",
    senderRole: "Chief ER Physician",
    department: "Emergency",
    avatarInitials: "PP",
    avatarColor: "bg-rose-600",
    subject: "STAT Trauma Handover - Resuscitation Bay",
    content: "Patient UMR-4920 stabilized post-RTA. CT Head & Cervical Spine ordered in Radiology. Please review once scans upload.",
    timeAgo: "4m ago",
    targetModule: "emergency",
    priority: "STAT",
    isRead: false,
  },
  {
    id: "msg-2",
    senderName: "Sister Sunita Devi",
    senderRole: "ICU Head Nurse",
    department: "Critical Care (MICU)",
    avatarInitials: "SD",
    avatarColor: "bg-blue-600",
    subject: "Bed 04 MICU Transfer Ready",
    content: "Bed 04 MICU prepared for patient transfer. Arterial line transducer & ventilator primed. Nursing handover documented.",
    timeAgo: "14m ago",
    targetModule: "icu",
    targetSubModule: "icu_micu",
    priority: "Urgent",
    isRead: false,
  },
  {
    id: "msg-3",
    senderName: "Sneha Kulkarni",
    senderRole: "Chief Pharmacist",
    department: "Central Pharmacy",
    avatarInitials: "SK",
    avatarColor: "bg-emerald-600",
    subject: "STAT IV Antibiotics Dispensed",
    content: "Prescription verification for OP encounter OP-2026-881 completed. Inj. Meropenem 1g ready for counter collection.",
    timeAgo: "28m ago",
    targetModule: "pharmacy",
    targetSubModule: "pharmacy_dispensing",
    priority: "Routine",
    isRead: false,
  },
]

interface MessagesPanelProps {
  onClose: () => void
  onNavigate: (module: string, sub?: string) => void
  onUnreadChange?: (count: number) => void
}

export default function MessagesPanel({
  onClose,
  onNavigate,
  onUnreadChange,
}: MessagesPanelProps) {
  const [messages, setMessages] = useState<ClinicalMessage[]>(() => {
    try {
      const stored = localStorage.getItem("hospai_clinical_messages_v1")
      return stored ? JSON.parse(stored) : INITIAL_MESSAGES
    } catch {
      return INITIAL_MESSAGES
    }
  })

  const [activeTab, setActiveTab] = useState<"inbox" | "compose">("inbox")
  const [newRecipient, setNewRecipient] = useState("Nursing Station")
  const [newContent, setNewContent] = useState("")

  const unreadCount = messages.filter((m) => !m.isRead).length

  const markAllRead = () => {
    const updated = messages.map((m) => ({ ...m, isRead: true }))
    setMessages(updated)
    localStorage.setItem("hospai_clinical_messages_v1", JSON.stringify(updated))
    onUnreadChange?.(0)
  }

  const markOneRead = (id: string) => {
    const updated = messages.map((m) =>
      m.id === id ? { ...m, isRead: true } : m
    )
    setMessages(updated)
    localStorage.setItem("hospai_clinical_messages_v1", JSON.stringify(updated))
    const count = updated.filter((m) => !m.isRead).length
    onUnreadChange?.(count)
  }

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newContent.trim()) return

    const newMsg: ClinicalMessage = {
      id: `msg-${Date.now()}`,
      senderName: "Current User",
      senderRole: "Clinical Staff",
      department: newRecipient,
      avatarInitials: "ME",
      avatarColor: "bg-indigo-600",
      subject: `Handover / Note to ${newRecipient}`,
      content: newContent.trim(),
      timeAgo: "Just now",
      targetModule: "clinical",
      priority: "Routine",
      isRead: true,
    }

    const updated = [newMsg, ...messages]
    setMessages(updated)
    localStorage.setItem("hospai_clinical_messages_v1", JSON.stringify(updated))
    setNewContent("")
    setActiveTab("inbox")
  }

  return (
    <div
      className="fixed left-2 right-2 top-12 sm:absolute sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="bg-[#0B132B] text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
            <MessageSquare size={16} />
          </div>
          <div>
            <h3 className="font-bold text-sm leading-tight text-white flex items-center gap-2">
              Staff Messages & Handovers
              {unreadCount > 0 && (
                <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {unreadCount} new
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">Inter-department Communications</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-white/10 flex items-center gap-1 transition-colors"
              title="Mark all messages as read"
            >
              <CheckCheck size={14} />
              <span>Mark all read</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("inbox")}
          className={`flex-1 py-2 text-center transition-colors border-b-2 ${
            activeTab === "inbox"
              ? "border-blue-600 text-blue-600 bg-white"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Inbox ({messages.length})
        </button>
        <button
          onClick={() => setActiveTab("compose")}
          className={`flex-1 py-2 text-center transition-colors border-b-2 ${
            activeTab === "compose"
              ? "border-blue-600 text-blue-600 bg-white"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Send Handover / Note
        </button>
      </div>

      {/* Body */}
      {activeTab === "inbox" ? (
        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
          {messages.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No staff messages found.
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                onClick={() => {
                  markOneRead(msg.id)
                  if (msg.targetModule) {
                    onNavigate(msg.targetModule, msg.targetSubModule)
                    onClose()
                  }
                }}
                className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer group ${
                  !msg.isRead ? "bg-emerald-50/40" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-full ${msg.avatarColor} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm`}
                  >
                    {msg.avatarInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-xs text-slate-900 truncate">
                        {msg.senderName}
                      </span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {msg.timeAgo}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10.5px] text-slate-500 font-medium">
                        {msg.department}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span
                        className={`text-[9.5px] px-1.5 py-0.2 rounded font-semibold ${
                          msg.priority === "STAT"
                            ? "bg-rose-100 text-rose-700 font-bold"
                            : msg.priority === "Urgent"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {msg.priority}
                      </span>
                      {!msg.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto shrink-0 animate-pulse" />
                      )}
                    </div>

                    <p className="text-xs text-slate-700 font-medium line-clamp-2 leading-relaxed">
                      {msg.content}
                    </p>

                    <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-blue-600 group-hover:text-blue-700">
                      <span>Open in {msg.department}</span>
                      <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <form onSubmit={handleSendMessage} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Recipient Department / Station
            </label>
            <select
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="Emergency Department">Emergency Department</option>
              <option value="Intensive Care Unit (ICU)">Intensive Care Unit (ICU)</option>
              <option value="Inpatient Ward Nursing">Inpatient Ward Nursing</option>
              <option value="Central Pharmacy">Central Pharmacy</option>
              <option value="Radiology & Imaging">Radiology & Imaging</option>
              <option value="Clinical Laboratory">Clinical Laboratory</option>
              <option value="Billing & Reception">Billing & Reception</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Clinical Note / Handover Message
            </label>
            <textarea
              rows={3}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Type urgent handoff notes, diagnostic follow-ups, or bed readiness info..."
              className="w-full text-xs px-2.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab("inbox")}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Send size={13} />
              <span>Broadcast Note</span>
            </button>
          </div>
        </form>
      )}

      {/* Footer */}
      <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-center">
        <p className="text-[10px] text-slate-400">
          Encrypted Internal Healthcare Messaging (HIPAA Compliant)
        </p>
      </div>
    </div>
  )
}
