import { usePharmacyData } from "../data/usePharmacyData"
import { useState, useEffect } from "react"
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Clock,
  Info,
  X,
  ArrowRight,
  PackageX,
  Calendar,
  FileText,
  Truck,
  RotateCcw,
} from "lucide-react"

import PageHeader from "../components/PageHeader"
import { PharmacyDatabase } from "../../../services/pharmacyDb"

interface NotificationsProps {
  onNavigate: (page: string) => void
}

const typeConfig = {
  critical: {
    icon: AlertTriangle,
    color: "#dc2626",
    bg: "#FEE2E2",
    border: "#fca5a5",
    dot: "#ef4444",
    badgeBg: "#FEF2F2",
    badgeText: "#991B1B",
  },
  warning: {
    icon: Clock,
    color: "#d97706",
    bg: "#FEF3C7",
    border: "#fcd34d",
    dot: "#f59e0b",
    badgeBg: "#FFFBEB",
    badgeText: "#92400E",
  },
  info: {
    icon: Info,
    color: "#0F766E",
    bg: "#E8EDF5",
    border: "#93c5fd",
    dot: "#0F766E",
    badgeBg: "#F0FDFA",
    badgeText: "#115E59",
  },
}

const categoryIcons: Record<string, any> = {
  stock: PackageX,
  expiry: Calendar,
  prescription: FileText,
  transfer: Truck,
  return: RotateCcw,
  general: Bell,
}

export default function Notifications({ onNavigate }: NotificationsProps) {
  const { notifications: notifs, refresh } = usePharmacyData()
  const [activeFilter, setActiveFilter] = useState("All")



  const markAll = () => {
    PharmacyDatabase.markAllNotificationsRead(notifs.map((n) => n.id))
  }

  const markOne = (id: string, read: boolean = true) => {
    PharmacyDatabase.markNotificationRead(id, read)
  }

  const remove = (id: string) => {
    PharmacyDatabase.dismissNotification(id)
  }

  const filtered = notifs.filter((n) => {
    if (activeFilter === "Unread") return !n.read
    if (activeFilter === "Critical") return n.type === "critical"
    if (activeFilter === "Warning") return n.type === "warning"
    if (activeFilter === "Info") return n.type === "info"
    return true
  })

  const unread = notifs.filter((n) => !n.read).length
  const criticalCount = notifs.filter((n) => n.type === "critical").length
  const warningCount = notifs.filter((n) => n.type === "warning").length

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Notifications" }]}
        title={
          <div className="flex items-center gap-2.5">
            <span>Notification Center</span>
            <span className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Hospital Feed
            </span>
          </div>
        }
        description={`${unread} unread · ${notifs.length} total operational alerts & notices`}
        actions={
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E2E8F0] bg-white text-[13px] font-medium text-[#334155] hover:bg-[#F8FAFC] shadow-xs transition-colors"
              >
                <CheckCheck size={15} className="text-[#0F766E]" />
                Mark all as read
              </button>
            )}
          </div>
        }
        onNavigate={onNavigate}
      />

      {/* Summary Stat Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center justify-between p-3.5 bg-red-50/60 border border-red-200/80 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-red-800">Critical Actions</p>
              <p className="text-[11px] text-red-600">Stockouts & Expired Batches</p>
            </div>
          </div>
          <span className="text-[18px] font-bold text-red-700">{criticalCount}</span>
        </div>

        <div className="flex items-center justify-between p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-amber-900">Urgent Warnings</p>
              <p className="text-[11px] text-amber-700">Low Stock & Near Expiry (&lt;30d)</p>
            </div>
          </div>
          <span className="text-[18px] font-bold text-amber-800">{warningCount}</span>
        </div>

        <div className="flex items-center justify-between p-3.5 bg-teal-50/60 border border-teal-200/80 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700">
              <FileText size={18} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-teal-900">Operational Unread</p>
              <p className="text-[11px] text-teal-700">Awaiting Pharmacist Action</p>
            </div>
          </div>
          <span className="text-[18px] font-bold text-teal-800">{unread}</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        {["All", "Unread", "Critical", "Warning", "Info"].map((f) => {
          const counts: Record<string, number> = {
            All: notifs.length,
            Unread: unread,
            Critical: notifs.filter((n) => n.type === "critical").length,
            Warning: notifs.filter((n) => n.type === "warning").length,
            Info: notifs.filter((n) => n.type === "info").length,
          }
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border text-[13px] font-medium transition-all"
              style={{
                background: activeFilter === f ? "#0F766E" : "#fff",
                color: activeFilter === f ? "#fff" : "#334155",
                borderColor: activeFilter === f ? "#0F766E" : "#E2E8F0",
              }}
            >
              {f}
              <span
                className="text-[11px] px-1.5 py-0.2 rounded-full font-semibold"
                style={{
                  background:
                    activeFilter === f
                      ? "rgba(255,255,255,0.25)"
                      : "#F1F5F9",
                  color: activeFilter === f ? "#fff" : "#475569",
                }}
              >
                {counts[f]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Notification Cards List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl shadow-xs border border-[#E2E8F0] py-16 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "#F0FDF4" }}
            >
              <CheckCheck size={22} className="text-[#059669]" />
            </div>
            <p className="font-semibold text-[#0F1624]">
              {activeFilter === "All"
                ? "No Notifications"
                : `No ${activeFilter} Notifications`}
            </p>
            <p className="text-[12px] text-[#64748B] mt-1 max-w-sm mx-auto">
              {activeFilter === "All"
                ? "All hospital systems are operating normally. Out of stock, near expiry, and prescription alerts will automatically display here."
                : `There are currently no items under the ${activeFilter} category.`}
            </p>
          </div>
        ) : (
          filtered.map((n) => {
            const cfg =
              typeConfig[(n.type as keyof typeof typeConfig)] || typeConfig.info
            const CategoryIcon =
              categoryIcons[(n as any).category] || categoryIcons.general
            const actionPage = (n as any).actionPage
            const actionLabel = (n as any).actionLabel

            return (
              <div
                key={n.id}
                className="bg-white rounded-xl border transition-all hover:shadow-sm overflow-hidden"
                style={{
                  borderColor: !n.read ? cfg.border : "#E2E8F0",
                  borderLeftWidth: !n.read ? 4 : 1,
                  borderLeftColor: !n.read ? cfg.color : "#CBD5E1",
                }}
              >
                <div className="flex items-start p-4 gap-3.5">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: cfg.bg }}
                  >
                    <CategoryIcon size={18} style={{ color: cfg.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                          style={{
                            background: cfg.badgeBg,
                            color: cfg.badgeText,
                          }}
                        >
                          {(n as any).category || n.type}
                        </span>
                        <p
                          className={`text-[14px] font-semibold ${
                            !n.read ? "text-[#0F1624]" : "text-[#475569]"
                          }`}
                        >
                          {n.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[11px] text-[#94A3B8] whitespace-nowrap">
                          {n.time}
                        </span>
                        {!n.read && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: cfg.dot }}
                            title="Unread"
                          />
                        )}
                      </div>
                    </div>

                    <p className="text-[13px] text-[#475569] mt-1.5 leading-relaxed">
                      {n.message}
                    </p>

                    <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-[#F8FAFC]">
                      <div className="flex items-center gap-2">
                        {actionPage && (
                          <button
                            onClick={() => {
                              markOne(n.id, true)
                              onNavigate(actionPage)
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] shadow-2xs transition-colors"
                          >
                            <span>{actionLabel || "Take Action"}</span>
                            <ArrowRight size={13} />
                          </button>
                        )}

                        {!n.read ? (
                          <button
                            onClick={() => markOne(n.id, true)}
                            className="text-[12px] font-medium text-[#64748B] hover:text-[#0F766E] transition-colors px-2 py-1 rounded hover:bg-[#F1F5F9]"
                          >
                            Mark as read
                          </button>
                        ) : (
                          <button
                            onClick={() => markOne(n.id, false)}
                            className="text-[12px] font-medium text-[#94A3B8] hover:text-[#475569] transition-colors px-2 py-1 rounded hover:bg-[#F1F5F9]"
                          >
                            Mark as unread
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => remove(n.id)}
                        className="p-1.5 rounded-md hover:bg-red-50 text-[#94A3B8] hover:text-[#DC2626] transition-colors"
                        title="Dismiss notification"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
