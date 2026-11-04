import React, { useState, useEffect } from "react"
import {
  HrmsDatabase,
  BiometricDevice,
  BiometricPunchLog,
  StaffMember,
} from "../../services/hrmsDb"
import {
  Activity,
  Cpu,
  RefreshCw,
  Search,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  UserCheck,
  Building,
  PlusCircle,
  Sliders,
  Send,
  Zap,
} from "lucide-react"

interface BiometricDeviceDashboardProps {
  onOpenManualPunch: () => void
  onOpenRecalculate: () => void
}

export default function BiometricDeviceDashboard({
  onOpenManualPunch,
  onOpenRecalculate,
}: BiometricDeviceDashboardProps) {
  const [devices, setDevices] = useState<BiometricDevice[]>([])
  const [punches, setPunches] = useState<BiometricPunchLog[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(false)
  const [pingingDeviceId, setPingingDeviceId] = useState<string | null>(null)

  // Filters
  const [selectedLocation, setSelectedLocation] = useState<string>("All")
  const [selectedStatus, setSelectedStatus] = useState<string>("All")
  const [autoRefreshInterval] = useState<number>(30)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30)

  // Simulator Modal
  const [isTestSimulatorOpen, setIsTestSimulatorOpen] = useState(false)
  const [simStaffId, setSimStaffId] = useState<string>("EMP-102")
  const [simDeviceId, setSimDeviceId] = useState<string>("BIO-02")
  const [simDirection, setSimDirection] = useState<"IN" | "OUT">("IN")
  const [simVerifyMode, setSimVerifyMode] = useState<"Fingerprint" | "Face ID" | "RFID Card">("Fingerprint")
  const [simulating, setSimulating] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await HrmsDatabase.getBiometricDevices(selectedLocation, selectedStatus)
      if (res && res.devices) {
        setDevices(res.devices)
      }
      const punchData = await HrmsDatabase.getBiometricPunches()
      setPunches(punchData)
      setStaffList(HrmsDatabase.getStaffList())
    } catch (err) {
      console.error("Error loading biometric data:", err)
    } finally {
      setLoading(false)
      setSecondsRemaining(autoRefreshInterval)
    }
  }

  useEffect(() => {
    loadData()
    const unsubscribe = HrmsDatabase.subscribe(() => {
      loadData()
    })
    return () => unsubscribe()
  }, [selectedLocation, selectedStatus])

  // Countdown timer for 30s auto-refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          loadData()
          return autoRefreshInterval
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [autoRefreshInterval, selectedLocation, selectedStatus])

  const handlePing = async (dev: BiometricDevice) => {
    setPingingDeviceId(dev.id)
    try {
      await HrmsDatabase.pingBiometricDevice(dev.id)
      await loadData()
    } finally {
      setPingingDeviceId(null)
    }
  }

  const handleCommand = async (deviceId: string, command: string) => {
    await HrmsDatabase.executeDeviceCommand(deviceId, command)
    await loadData()
  }

  const handleSimulatePunch = async () => {
    setSimulating(true)
    try {
      const staff = staffList.find((s) => s.id === simStaffId)
      const dev = devices.find((d) => d.id === simDeviceId)
      await HrmsDatabase.recordBiometricPunch({
        staffId: simStaffId,
        staffName: staff?.name || "Hospital Staff",
        company: staff?.company || "VH Care",
        department: staff?.department || "General",
        deviceId: simDeviceId,
        deviceName: dev?.deviceSName || "Biometric-2",
        location: dev?.location || "FRONT OFFICE",
        verifyMode: simVerifyMode,
        direction: simDirection,
      })
      await loadData()
      setIsTestSimulatorOpen(false)
    } finally {
      setSimulating(false)
    }
  }

  const onlineCount = devices.filter((d) => d.status === "online").length
  const offlineCount = devices.filter((d) => d.status === "offline").length
  const totalEmployees = staffList.length
  const presentEmployees = staffList.filter((s) => s.dutyStatus === "On Duty").length || punches.filter((p) => p.direction === "IN").length

  return (
    <div className="space-y-6">
      {/* ── Top Metric Cards (Enterprise Light Theme with High Contrast) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Registered Employees */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Workforce</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{totalEmployees}</h3>
              <p className="text-xs text-slate-500 mt-1">Registered Hospital Staff</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <UserCheck className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Clinical & Support</span>
            <span className="font-semibold text-slate-700">All Entities</span>
          </div>
        </div>

        {/* Card 2: Live On Duty */}
        <div className="bg-white rounded-xl border border-emerald-200/80 p-5 shadow-xs hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Live Clocked In</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{presentEmployees}</h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">Active on duty right now</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <Activity className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Live biometric sync active</span>
          </div>
        </div>

        {/* Card 3: Online Scanners */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Online Readers</p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-1">
                {onlineCount} <span className="text-lg font-normal text-slate-400">/ {devices.length}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">Biometric Terminals</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Wifi className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>ADMS Push & Port 4370 Live</span>
          </div>
        </div>

        {/* Card 4: Attention Required */}
        <div className="bg-white rounded-xl border border-rose-200/80 p-5 shadow-xs hover:border-rose-300 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Offline Scanners</p>
              <h3 className="text-3xl font-extrabold text-rose-600 mt-1">{offlineCount}</h3>
              <p className="text-xs text-slate-500 mt-1">Attention Required</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
              <WifiOff className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-xs text-rose-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{offlineCount > 0 ? `${offlineCount} scanner(s) unreachable` : "All scanners reachable"}</span>
          </div>
        </div>
      </div>

      {/* ── Control Bar & Action Bar ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Location Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Location:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
            >
              <option value="All">All Locations</option>
              <option value="FRONT OFFICE">Front Office</option>
              <option value="OT COMPLEX">OT Complex</option>
              <option value="ICU DOOR">ICU Door</option>
              <option value="CASUALTY">Casualty</option>
              <option value="CLINICAL PHARMACY">Clinical Pharmacy</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
            >
              <option value="All">All Status</option>
              <option value="online">Online Only</option>
              <option value="offline">Offline Only</option>
            </select>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <span>Auto refresh:</span>
            <span className="font-mono text-blue-600 font-bold">{secondsRemaining}s</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsTestSimulatorOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold shadow-xs transition-colors"
          >
            <Zap className="h-3.5 w-3.5 text-indigo-600" />
            <span>Simulate Scan</span>
          </button>

          <button
            onClick={onOpenManualPunch}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-semibold shadow-xs transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span>Manual Punch Entry</span>
          </button>

          <button
            onClick={onOpenRecalculate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors"
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>Re-calculate Attendance</span>
          </button>
        </div>
      </div>

      {/* ── Main Two-Column Layout: Hardware Monitor (Left) & Live Punch Feed (Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Biometric Hardware Terminals Table (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Biometric Hardware Readers</h4>
                <p className="text-[11px] text-slate-500">eSSL / ZKTeco TCP/IP Network Terminals</p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {devices.length} Devices
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">Device</th>
                  <th className="py-3 px-4">Serial No.</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">IP & Port</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {devices.map((dev) => (
                  <tr key={dev.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            dev.status === "online" ? "bg-emerald-500 shadow-xs" : "bg-rose-500"
                          }`}
                        />
                        {dev.deviceSName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{dev.deviceFName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{dev.serialNo}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 font-semibold text-slate-700 text-[11px]">
                        {dev.location}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {dev.ipAddress}:{dev.port}
                    </td>
                    <td className="py-3 px-4">
                      {dev.status === "online" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Online ({dev.latencyMs || 12}ms)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="h-3 w-3" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handlePing(dev)}
                          disabled={pingingDeviceId === dev.id}
                          className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-[11px] flex items-center gap-1 shadow-2xs"
                          title="Test Connection Ping"
                        >
                          <RefreshCw className={`h-3 w-3 ${pingingDeviceId === dev.id ? "animate-spin text-blue-600" : ""}`} />
                          <span>Ping</span>
                        </button>
                        <button
                          onClick={() => handleCommand(dev.id, "sync_time")}
                          className="p-1.5 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs"
                          title="Synchronize Time"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Live Punch Stream Feed (1 Col) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <h4 className="text-sm font-bold text-slate-900">Live Punch Stream</h4>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Live Feed
            </span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[460px] flex-1">
            {punches.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No punch logs recorded yet.</div>
            ) : (
              punches.map((punch) => (
                <div key={punch.id} className="p-3.5 px-4 flex items-center justify-between hover:bg-slate-50/70 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                      {punch.staffName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{punch.staffName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">({punch.staffId})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-medium text-slate-700">{punch.department}</span>
                        <span>•</span>
                        <span className="text-blue-600 font-medium">{punch.location}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 text-right">
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-800">{punch.punchTime.substring(11, 19)}</p>
                      <p className="text-[10px] text-slate-400">{punch.verifyMode}</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded text-[11px] font-bold border ${
                        punch.direction === "IN"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {punch.direction}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Test Simulator Modal (Light Theme) ── */}
      {isTestSimulatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Simulate Hardware Biometric Scan</h3>
              </div>
              <button
                onClick={() => setIsTestSimulatorOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Simulate an employee physically scanning their fingerprint, face, or tapping their RFID badge at a hospital reader.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Staff Member:</label>
                <select
                  value={simStaffId}
                  onChange={(e) => setSimStaffId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.department} • {s.company || "VH Care"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Biometric Scanner Device:</label>
                <select
                  value={simDeviceId}
                  onChange={(e) => setSimDeviceId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.deviceSName} — {d.location} ({d.ipAddress})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Punch Direction:</label>
                  <select
                    value={simDirection}
                    onChange={(e) => setSimDirection(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="IN">Clock IN</option>
                    <option value="OUT">Clock OUT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Method:</label>
                  <select
                    value={simVerifyMode}
                    onChange={(e) => setSimVerifyMode(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  >
                    <option value="Fingerprint">Fingerprint Scan</option>
                    <option value="Face ID">Face Recognition</option>
                    <option value="RFID Card">RFID Card Tap</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsTestSimulatorOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSimulatePunch}
                disabled={simulating}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{simulating ? "Transmitting..." : "Send Punch to Reader"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
