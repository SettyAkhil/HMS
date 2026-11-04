import React, { useState, useEffect, useMemo } from "react"
import {
  AlertTriangle,
  Phone,
  CheckCircle2,
  Clock,
  User,
  ShieldAlert,
  Search,
  Filter,
  X,
  MessageSquare,
  ArrowUpRight,
  Radio,
} from "lucide-react"
import { LabLisService, CriticalAlertRecord } from "../../services/labLisService"

export default function CriticalAlertsView() {
  const [alerts, setAlerts] = useState<CriticalAlertRecord[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [activeAlertToAcknowledge, setActiveAlertToAcknowledge] = useState<CriticalAlertRecord | null>(null)
  const [contactedDoctor, setContactedDoctor] = useState("")
  const [notifiedBy, setNotifiedBy] = useState("Lab Duty Technician")
  const [contactMethod, setContactMethod] = useState<CriticalAlertRecord["notificationMethod"]>("Phone Call")
  const [notes, setNotes] = useState("")
  const [readbackConfirmed, setReadbackConfirmed] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadData = () => {
    setAlerts(LabLisService.getCriticalAlerts())
  }

  useEffect(() => {
    loadData()
    const unsub = LabLisService.subscribe(loadData)
    return () => unsub()
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      const matchSearch =
        !searchQuery ||
        a.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.umr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.testName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.orderingDoctor.toLowerCase().includes(searchQuery.toLowerCase())

      return matchSearch
    })
  }, [alerts, searchQuery])

  const activeCount = alerts.filter((a) => a.status === "Active Alert" || a.status === "Escalated").length
  const acknowledgedCount = alerts.filter((a) => a.status === "Acknowledged" || a.status === "Resolved").length

  const handleOpenAcknowledge = (alert: CriticalAlertRecord) => {
    setActiveAlertToAcknowledge(alert)
    setContactedDoctor(alert.orderingDoctor || "Attending Physician")
    setReadbackConfirmed(false)
    setNotes("")
  }

  const handleSaveAcknowledgement = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeAlertToAcknowledge) return

    if (!readbackConfirmed) {
      showToast("Critical Safety Protocol: Verbal readback of panic value must be confirmed.")
      return
    }

    LabLisService.acknowledgeCriticalAlert(
      activeAlertToAcknowledge.id,
      notifiedBy,
      contactedDoctor,
      contactMethod,
      notes || "Verbal readback completed according to CAP / NABL clinical safety criteria."
    )

    showToast(`Panic value acknowledged and clinical call logged for ${activeAlertToAcknowledge.patientName}!`)
    setActiveAlertToAcknowledge(null)
  }

  const handleEscalate = (alert: CriticalAlertRecord) => {
    LabLisService.escalateCriticalAlert(
      alert.id,
      "Head of Clinical Department / Medical Superintendent",
      "Escalated due to 15-minute response SLA window expiration"
    )
    showToast(`Alert ${alert.id} escalated to Medical Superintendent!`)
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xl flex items-center gap-2 border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── TOP STATS & PROTOCOL BANNER ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-rose-800 uppercase">
            <span>Active Panic Alerts</span>
            <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
          </div>
          <div className="text-3xl font-black text-rose-900 mt-1">{activeCount}</div>
          <div className="text-[10px] text-rose-700 font-medium mt-0.5">
            Requires immediate verbal doctor callback
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Acknowledged Today</span>
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{acknowledgedCount}</div>
          <div className="text-[10px] text-teal-600 font-semibold mt-0.5">Clinician readback logged</div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase">
            <span>Response SLA Target</span>
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{"< 15"} mins</div>
          <div className="text-[10px] text-slate-400 font-semibold mt-0.5">NABL / CAP Panic Limits Standard</div>
        </div>
      </div>

      {/* ── ALERTS TABLE ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Critical Laboratory Panic Values Log</h3>
              <p className="text-[11px] text-slate-500">
                Life-threatening diagnostic thresholds requiring mandatory clinician notification & readback
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by patient, UMR, test..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E2E8F0] rounded-xl focus:outline-none w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-[#E2E8F0] text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Alert ID & Time</th>
                <th className="py-3 px-4">Patient Details</th>
                <th className="py-3 px-4">Critical Test & Analyte</th>
                <th className="py-3 px-4">Observed Panic Value</th>
                <th className="py-3 px-4">Ordering Clinician</th>
                <th className="py-3 px-4">Notification Status</th>
                <th className="py-3 px-4 text-right">Clinical Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    No active critical alerts in the laboratory system.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => {
                  const isActive = alert.status === "Active Alert"
                  const isEscalated = alert.status === "Escalated"

                  return (
                    <tr
                      key={alert.id}
                      className={isActive || isEscalated ? "bg-rose-50/40 hover:bg-rose-50/70" : "hover:bg-slate-50/70"}
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{alert.id}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {alert.detectedAt
                            ? new Date(alert.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : "Recent"}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{alert.patientName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{alert.umr}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{alert.testName}</div>
                        <div className="text-[10px] text-purple-700 font-medium">{alert.parameterName}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-mono font-black text-rose-700 text-sm bg-rose-100/80 px-2 py-0.5 rounded border border-rose-300">
                          {alert.observedValue}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">Limit: {alert.panicLimits}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{alert.orderingDoctor}</div>
                        <div className="text-[10px] text-slate-400">{alert.department}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isActive
                              ? "bg-rose-600 text-white border-rose-600 animate-pulse"
                              : isEscalated
                                ? "bg-amber-600 text-white border-amber-600"
                                : "bg-teal-50 text-teal-800 border-teal-200"
                          }`}
                        >
                          {alert.status}
                        </span>
                        {alert.acknowledgedAt && (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-xs">
                            Notified {alert.physicianNotified} via {alert.notificationMethod}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isActive ? (
                            <>
                              <button
                                onClick={() => handleOpenAcknowledge(alert)}
                                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs transition shadow-2xs flex items-center gap-1 cursor-pointer"
                              >
                                <Phone className="w-3 h-3" />
                                <span>Log Call</span>
                              </button>
                              <button
                                onClick={() => handleEscalate(alert)}
                                className="p-1 bg-slate-100 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition cursor-pointer"
                                title="Escalate to Department Head"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-teal-700 font-bold flex items-center gap-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Closed
                            </span>
                          )}
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

      {/* ── CLINICIAN CALL LOG MODAL ────────────────────────────────────────── */}
      {activeAlertToAcknowledge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-rose-600" />
                <h4 className="text-sm font-bold text-slate-900">Document Critical Doctor Notification</h4>
              </div>
              <button
                onClick={() => setActiveAlertToAcknowledge(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAcknowledgement} className="space-y-3 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-900">
                  {activeAlertToAcknowledge.patientName} ({activeAlertToAcknowledge.umr})
                </div>
                <div className="text-rose-700 font-bold">
                  {activeAlertToAcknowledge.testName}: {activeAlertToAcknowledge.observedValue}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Clinician Contacted</label>
                <input
                  type="text"
                  value={contactedDoctor}
                  onChange={(e) => setContactedDoctor(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Communication Channel</label>
                  <select
                    value={contactMethod}
                    onChange={(e: any) => setContactMethod(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Phone Call">Direct Phone Call</option>
                    <option value="Direct Hospital Pager">Hospital Pager</option>
                    <option value="Clinical Intercom">Clinical Intercom</option>
                    <option value="SMS Alert">SMS Alert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Calling Technician</label>
                  <input
                    type="text"
                    value={notifiedBy}
                    onChange={(e) => setNotifiedBy(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Call Notes & Observations</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Doctor acknowledged, instructed immediate IV calcium gluconate..."
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={readbackConfirmed}
                    onChange={(e) => setReadbackConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 mt-0.5"
                  />
                  <span className="text-[11px] font-bold text-amber-900 leading-tight">
                    I confirm that the doctor verbally read back the patient name, test, and critical panic value.
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveAlertToAcknowledge(null)}
                  className="px-3 py-1.5 text-slate-600 font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-2xs"
                >
                  Save Call Log & Close Alert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

