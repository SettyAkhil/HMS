import React, { useState, useEffect, useRef, useMemo } from "react"
import {
  FiBell,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiAlertTriangle,
  FiAlertCircle,
  FiArrowRight,
  FiUser,
  FiX,
  FiExternalLink,
  FiRefreshCw,
  FiActivity,
  FiChevronRight,
  FiShield,
} from "react-icons/fi"
import { FaBed } from "react-icons/fa"
import { BedDatabase, type BedTransferNotification } from "../../services/bedDb"
import { formatDateTimeIST } from "../../lib/format"
import type { Notice } from "../../types"

interface BedTransferNotificationPanelProps {
  onAllocateTransfer?: (notif: BedTransferNotification) => void
  onViewPatientChart?: (patientId: string) => void
  canManageBeds?: boolean
  setNotice?: (notice: Notice | null) => void
}

function timeAgo(dateString: string): string {
  try {
    const diff = Math.floor(
      (Date.now() - new Date(dateString).getTime()) / 1000,
    )
    if (diff < 60) return "Just now"
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  } catch {
    return "Recent"
  }
}

export function BedTransferNotificationPanel({
  onAllocateTransfer,
  onViewPatientChart,
  canManageBeds = true,
  setNotice,
}: BedTransferNotificationPanelProps) {
  const [notifications, setNotifications] = useState<BedTransferNotification[]>(
    [],
  )
  const [isOpen, setIsOpen] = useState(false)
  const [activeFilter, setActiveFilter] =
    useState<"all" | "pending" | "in_transit" | "allocated">("all")
  const [toastNotif, setToastNotif] = useState<BedTransferNotification | null>(
    null,
  )
  const [searchQuery, setSearchQuery] = useState("")
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadNotifications = () => {
    try {
      const list = BedDatabase.getTransferNotifications()
      setNotifications(list)
    } catch {
      setNotifications([])
    }
  }

  useEffect(() => {
    loadNotifications()

    const handleUpdate = (e: any) => {
      if (e.detail?.notifications) {
        setNotifications(e.detail.notifications)
      } else {
        loadNotifications()
      }
    }

    const handleNewAlert = (e: any) => {
      if (e.detail) {
        setToastNotif(e.detail)
        loadNotifications()
      }
    }

    window.addEventListener("bed:transfer_notification_updated", handleUpdate)
    window.addEventListener("bed:new_transfer_alert", handleNewAlert)

    // Auto-dismiss toast after 6 seconds
    let toastTimer: any
    if (toastNotif) {
      toastTimer = setTimeout(() => setToastNotif(null), 6000)
    }

    return () => {
      window.removeEventListener(
        "bed:transfer_notification_updated",
        handleUpdate,
      )
      window.removeEventListener("bed:new_transfer_alert", handleNewAlert)
      if (toastTimer) clearTimeout(toastTimer)
    }
  }, [toastNotif])

  // Handle outside click to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read && n.status !== "dismissed")
      .length
  }, [notifications])

  const pendingCount = useMemo(() => {
    return notifications.filter((n) => n.status === "pending").length
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    let result = notifications.filter((n) => n.status !== "dismissed")
    if (activeFilter !== "all") {
      result = result.filter((n) => n.status === activeFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (n) =>
          n.patient_name.toLowerCase().includes(q) ||
          (n.patient_last_name || "").toLowerCase().includes(q) ||
          n.patient_id.toLowerCase().includes(q) ||
          n.target_destination.toLowerCase().includes(q) ||
          n.source_department.toLowerCase().includes(q) ||
          n.clinical_reason.toLowerCase().includes(q),
      )
    }
    return result
  }, [notifications, activeFilter, searchQuery])

  const handleMarkRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    BedDatabase.markNotificationRead(id)
    loadNotifications()
  }

  const handleMarkAllRead = () => {
    BedDatabase.markAllNotificationsRead()
    loadNotifications()
    setNotice?.({
      type: "success",
      message: "All transfer alerts marked as read.",
    })
  }

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    BedDatabase.dismissNotification(id)
    loadNotifications()
  }

  const handleStatusChange = (
    id: string,
    status: BedTransferNotification["status"],
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation()
    BedDatabase.updateNotificationStatus(id, status)
    loadNotifications()
    setNotice?.({
      type: "success",
      message: `Transfer status updated to ${
        status === "in_transit" ? "In-Transit" : status
      }.`,
    })
  }

  const handleAllocateClick = (
    notif: BedTransferNotification,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation()
    BedDatabase.markNotificationRead(notif.id)
    loadNotifications()
    setIsOpen(false)
    BedDatabase.setPendingAllocation({
      patient_id: notif.patient_id,
      name: notif.patient_name,
      last_name: notif.patient_last_name || undefined,
      phone: notif.patient_phone || undefined,
      age: notif.patient_age || undefined,
      gender: notif.patient_gender || undefined,
      source: "ER",
      visit_no: notif.er_visit_id
        ? `ER-${notif.er_visit_id}`
        : `TR-${notif.patient_id}`,
      er_bed_request_id: notif.er_bed_request_id,
      er_visit_id: notif.er_visit_id,
      notification_id: notif.id,
      requested_level_of_care:
        notif.target_bed_type === "ICU" ? "ICU" : notif.target_destination,
      requested_specialty: notif.target_ward || notif.target_destination,
      clinical_notes: `Transferred from ${notif.source_department}. Clinical reason: ${notif.clinical_reason}`,
      priority: notif.priority,
      timestamp: notif.sent_at,
    })
    onAllocateTransfer?.(notif)
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* ── Notification Bell Trigger Button ── */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen)
          if (toastNotif) setToastNotif(null)
        }}
        aria-label="Transfer & Bed Request Notifications"
        title="Patient Transfer & Bed Notifications"
        className={`relative p-2.5 rounded-none border transition-all flex items-center justify-center cursor-pointer shadow-xs ${
          unreadCount > 0
            ? "bg-gradient-to-br from-[#EFF6FF] via-[#DBEAFE] to-[#EFF6FF] border-[#93C5FD] text-[#1B4FD8] hover:border-[#1B4FD8] shadow-sm"
            : "bg-white border-[#CBD5E1] text-[#1B4FD8] hover:text-[#0C1524] hover:bg-[#EFF6FF] hover:border-[#93C5FD]"
        }`}
      >
        <FiBell
          className={`w-5 h-5 transition-transform ${
            unreadCount > 0 ? "text-[#1B4FD8] drop-shadow-xs" : "text-[#1B4FD8]"
          }`}
        />

        {/* Unread Numerical Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center px-1.5 rounded-none bg-gradient-to-r from-[#F59E0B] via-[#EAB308] to-[#D97706] text-white font-extrabold text-[11px] ring-2 ring-white shadow-md shadow-amber-500/40 animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Live Toast Notification Banner ── */}
      {toastNotif && !isOpen && (
        <div className="fixed top-20 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-md rounded-none p-4 shadow-2xl border-2 border-blue-200 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-none bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-[#1B4FD8] flex-shrink-0 shadow-xs">
              <FiBell className="w-5 h-5 animate-bounce text-[#1B4FD8]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-none border border-amber-200 font-mono">
                  {toastNotif.priority}
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  {timeAgo(toastNotif.sent_at)}
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#0F172A] mt-1 truncate">
                Incoming Transfer: {toastNotif.patient_name}{" "}
                {toastNotif.patient_last_name || ""}
              </h4>
              <p className="text-xs text-[#64748B] mt-0.5 flex items-center gap-1.5 font-medium">
                <span className="text-[#475569]">
                  {toastNotif.source_department}
                </span>
                <FiArrowRight className="w-3 h-3 text-[#1B4FD8]" />
                <span className="text-[#1B4FD8] font-bold">
                  {toastNotif.target_destination}
                </span>
              </p>

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => handleAllocateClick(toastNotif)}
                  className="px-3 py-1.5 text-xs font-bold bg-[#1B4FD8] hover:bg-[#153eb5] text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <FaBed className="w-3 h-3" /> Assign Bed Now
                </button>
                <button
                  type="button"
                  onClick={() => setToastNotif(null)}
                  className="px-2.5 py-1.5 text-xs font-medium text-[#64748B] hover:text-[#0F172A] bg-transparent hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setToastNotif(null)}
              className="text-[#94A3B8] hover:text-[#475569] p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Interactive Notifications Flyout Dropdown ── */}
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-[440px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-0 zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-[#0C1524] to-[#1E2D42] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-amber-300">
                <FiBell className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold tracking-tight text-white">
                    Transfer &amp; Bed Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-extrabold bg-red-600 text-white rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#94A3B8]">
                  Incoming Ward &amp; ICU Bed Transfers
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="px-2.5 py-1 text-[11px] font-medium text-[#93C5FD] hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-[#94A3B8] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center gap-1.5 overflow-x-auto text-xs">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeFilter === "all"
                  ? "bg-[#1B4FD8] text-white shadow-xs"
                  : "bg-white text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0]"
              }`}
            >
              All (
              {notifications.filter((n) => n.status !== "dismissed").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("pending")}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                activeFilter === "pending"
                  ? "bg-red-600 text-white shadow-xs"
                  : "bg-white text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0]"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("in_transit")}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeFilter === "in_transit"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-white text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0]"
              }`}
            >
              In-Transit (
              {notifications.filter((n) => n.status === "in_transit").length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter("allocated")}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeFilter === "allocated"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white text-[#64748B] hover:text-[#0F172A] border border-[#E2E8F0]"
              }`}
            >
              Allocated (
              {notifications.filter((n) => n.status === "allocated").length})
            </button>
          </div>

          {/* Search Box */}
          <div className="px-4 py-2 border-b border-[#E2E8F0] bg-white">
            <input
              type="text"
              placeholder="Search by patient, destination, or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B4FD8] focus:bg-white text-[#0F172A]"
            />
          </div>

          {/* Notification List Container */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0] max-h-[500px] bg-[#F8FAFC]">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-[#EFF6FF] text-[#1B4FD8] flex items-center justify-center mx-auto mb-3">
                  <FiCheckCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#0F172A]">
                  No transfers found
                </p>
                <p className="text-xs text-[#64748B] mt-1">
                  {searchQuery
                    ? "Try refining your search terms."
                    : "All patient transfer alerts are up to date."}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isIcu =
                  notif.target_destination.toLowerCase().includes("icu") ||
                  notif.target_bed_type === "ICU"
                const isStat =
                  notif.priority === "Stat / Emergency" ||
                  notif.priority === "Urgent" ||
                  notif.priority === "High Priority"

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleMarkRead(notif.id)}
                    className={`p-4 transition-colors cursor-pointer relative ${
                      !notif.is_read
                        ? "bg-gradient-to-r from-blue-50/50 to-white hover:bg-blue-50/80"
                        : "bg-white hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {/* Unread Left Border Stripe */}
                    {!notif.is_read && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#1B4FD8]"></div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      {/* Priority Tag & Badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            isStat
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}
                        >
                          {notif.priority}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isIcu
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {notif.target_bed_type} Bed
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            notif.status === "pending"
                              ? "bg-red-100 text-red-800"
                              : notif.status === "in_transit"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {notif.status === "pending"
                            ? "Awaiting Bed"
                            : notif.status === "in_transit"
                              ? "In-Transit"
                              : "Bed Allocated"}
                        </span>
                      </div>

                      {/* Time */}
                      <span className="text-[11px] text-[#94A3B8] font-medium whitespace-nowrap flex items-center gap-1">
                        <FiClock className="w-3 h-3" />
                        {timeAgo(notif.sent_at)}
                      </span>
                    </div>

                    {/* Patient Name & Details */}
                    <div className="mt-2 flex items-baseline justify-between">
                      <h4 className="text-sm font-extrabold text-[#0F172A] flex items-center gap-1.5">
                        <FiUser className="w-3.5 h-3.5 text-[#1B4FD8]" />
                        {notif.patient_name} {notif.patient_last_name || ""}
                        <span className="text-xs font-normal text-[#64748B]">
                          ({notif.patient_age ? `${notif.patient_age}y, ` : ""}
                          {notif.patient_gender || "Gender N/A"})
                        </span>
                      </h4>

                      <span className="text-[11px] font-mono font-bold text-[#64748B] bg-[#F1F5F9] px-1.5 py-0.5 rounded">
                        {notif.patient_id}
                      </span>
                    </div>

                    {/* Transfer Route Vector */}
                    <div className="mt-2 p-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center gap-2 text-xs">
                      <div className="flex-1 truncate">
                        <span className="text-[10px] font-bold uppercase text-[#64748B] block">
                          From
                        </span>
                        <span className="font-semibold text-[#0F172A] truncate block">
                          {notif.source_department}
                        </span>
                      </div>

                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-[#1B4FD8] flex-shrink-0">
                        <FiArrowRight className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex-1 truncate">
                        <span className="text-[10px] font-bold uppercase text-[#64748B] block">
                          Destination
                        </span>
                        <span
                          className={`font-bold truncate block ${
                            isIcu ? "text-purple-700" : "text-[#1B4FD8]"
                          }`}
                        >
                          {notif.target_destination}
                        </span>
                      </div>
                    </div>

                    {/* Footer Info & Handover Doctor */}
                    <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] flex items-center justify-between flex-wrap gap-2 text-[11px] text-[#64748B]">
                      <span>
                        Sent by:{" "}
                        <strong className="text-[#334155]">
                          {notif.sent_by}
                        </strong>
                      </span>

                      {notif.assigned_bed_label && (
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Assigned: {notif.assigned_bed_label}
                        </span>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        {canManageBeds && notif.status !== "allocated" && (
                          <button
                            type="button"
                            onClick={(e) => handleAllocateClick(notif, e)}
                            className="px-3 py-1.5 text-xs font-bold bg-[#1B4FD8] hover:bg-[#153eb5] text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            <FaBed className="w-3 h-3" /> Allocate Bed
                          </button>
                        )}

                        {notif.status === "pending" && (
                          <button
                            type="button"
                            onClick={(e) =>
                              handleStatusChange(notif.id, "in_transit", e)
                            }
                            className="px-2.5 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Mark In-Transit
                          </button>
                        )}

                        {onViewPatientChart && notif.patient_id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setIsOpen(false)
                              onViewPatientChart(notif.patient_id)
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <FiExternalLink className="w-3 h-3" /> Chart
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDismiss(notif.id, e)}
                        title="Dismiss notification"
                        className="text-[#94A3B8] hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <FiX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-white border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
            <span className="flex items-center gap-1 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              Live Bed Board Synced
            </span>
            <button
              type="button"
              onClick={loadNotifications}
              className="text-[#1B4FD8] font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <FiRefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BedTransferNotificationPanel
