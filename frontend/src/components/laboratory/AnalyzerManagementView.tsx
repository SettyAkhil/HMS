import React, { useState, useEffect } from "react"
import {
  Cpu,
  Activity,
  Wifi,
  WifiOff,
  Radio,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sliders,
  Server,
  Zap,
  RefreshCw,
  Search,
} from "lucide-react"
import { LabLisService, LabAnalyzer } from "../../services/labLisService"

export default function AnalyzerManagementView() {
  const [analyzers, setAnalyzers] = useState<LabAnalyzer[]>([])
  const [selectedAnalyzer, setSelectedAnalyzer] = useState<LabAnalyzer | null>(null)
  const [simulatedMessage, setSimulatedMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadData = () => {
    const list = LabLisService.getAnalyzers()
    setAnalyzers(list)
    if (!selectedAnalyzer && list.length > 0) {
      setSelectedAnalyzer(list[0])
    }
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

  const handleSimulateTransmission = (analyzer: LabAnalyzer) => {
    const { message, observationsCount } = LabLisService.simulateAnalyzerTransmission(analyzer.id)
    setSimulatedMessage(message)
    showToast(`Inbound transmission simulated! ${observationsCount} observations ingested from ${analyzer.name}.`)
  }

  const toggleConnection = (analyzer: LabAnalyzer) => {
    const nextStatus = analyzer.connectionStatus === "Connected" ? "Offline" : "Connected"
    LabLisService.updateAnalyzerStatus(analyzer.id, nextStatus)
    showToast(`Status updated: ${analyzer.name} is now ${nextStatus}`)
  }

  return (
    <div className="space-y-4">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3 bg-slate-900 text-white text-xs font-bold rounded-xl shadow-xl flex items-center gap-2 border border-slate-700">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── TOP BANNER ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-100 text-[#7552B8] rounded-xl">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Laboratory Analyzer & Instrument Management</h3>
            <p className="text-[11px] text-slate-500">
              HL7 v2.5.1 and ASTM 1394-97 bidirectional communication gateways, instrument drivers, and automated result mapping
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            4 Active Online
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg">
            <Radio className="w-3.5 h-3.5 text-blue-600" />
            559 Inbound Messages Today
          </span>
        </div>
      </div>

      {/* ── ANALYZER CARDS GRID ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {analyzers.map((ana) => {
          const isSelected = selectedAnalyzer?.id === ana.id
          const isOnline = ana.connectionStatus === "Connected" || ana.connectionStatus === "Transmitting"

          return (
            <div
              key={ana.id}
              onClick={() => setSelectedAnalyzer(ana)}
              className={`p-4 bg-white rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                isSelected
                  ? "border-[#7552B8] shadow-md ring-1 ring-[#7552B8]"
                  : "border-[#E2E8F0] hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-slate-400">{ana.id}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                      isOnline
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {isOnline ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                    {ana.connectionStatus}
                  </span>
                </div>

                <div className="font-black text-slate-900 text-sm mt-2">{ana.name}</div>
                <div className="text-[10.5px] text-slate-500 line-clamp-1">{ana.model}</div>

                <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Protocol:</span>
                    <strong className="text-purple-700 font-mono">{ana.interfaceProtocol}</strong>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>IP / Port:</span>
                    <span className="font-mono text-slate-800">{ana.ipAddress}:{ana.port}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Dept:</span>
                    <span className="font-medium text-slate-800">{ana.department}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">Seen: {ana.lastCommunication}</span>
                <span className="font-mono font-bold text-slate-700">{ana.messagesReceivedToday} msgs</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── DETAILED INSTRUMENT WORKSPACE ───────────────────────────────────── */}
      {selectedAnalyzer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Panel: Instrument Details & Code Mappings */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{selectedAnalyzer.name} Configuration</h4>
                <p className="text-[11px] text-slate-500">
                  {selectedAnalyzer.manufacturer} · {selectedAnalyzer.model}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleConnection(selectedAnalyzer)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  {selectedAnalyzer.connectionStatus === "Connected" ? "Set Offline" : "Connect"}
                </button>
                <button
                  onClick={() => handleSimulateTransmission(selectedAnalyzer)}
                  className="px-3 py-1.5 bg-[#7552B8] hover:bg-[#6240a3] text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Simulate Broadcast</span>
                </button>
              </div>
            </div>

            {/* Test Mapping Dictionary */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Vendor Test Code Mapping Dictionary
                </span>
                <span className="text-[11px] text-purple-700 font-bold">
                  {selectedAnalyzer.testMappings.length} Mappings Active
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="py-2 px-3">Analyzer Code</th>
                      <th className="py-2 px-3">Hospital Catalog Diagnostic Test</th>
                      <th className="py-2 px-3 text-right">Mapping Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedAnalyzer.testMappings.map((map, i) => (
                      <tr key={i} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-mono font-bold text-purple-800">{map.analyzerCode}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{map.catalogTestName}</td>
                        <td className="py-2 px-3 text-right">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                            Synchronized
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Panel: Inbound HL7 / ASTM Message Frame Viewer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xs space-y-3 text-white flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold font-mono tracking-wider text-slate-200">
                    INBOUND PROTOCOL STREAM ({selectedAnalyzer.interfaceProtocol})
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  LIVE SOCKET ACTIVE
                </span>
              </div>

              <div className="mt-3 bg-black/60 p-4 rounded-xl font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed border border-slate-800/80 min-h-[160px]">
                {simulatedMessage ||
                  `// Awaiting real-time serial or TCP transmission...\n// Click 'Simulate Broadcast' above to inject realistic HL7 v2.5.1 ORU^R01 or ASTM 1394 packet.\n\nMSH|^~\\&|${selectedAnalyzer.name}|HOSP_LAB|HOSPAI_HMS|MAIN|20261014120000||ORU^R01|MSG8921|P|2.5.1\nPID|1||UMR10001||Aditya Sharma||19850615|M\nOBR|1|ORD-2026-0001|${selectedAnalyzer.id}|${selectedAnalyzer.testMappings[0]?.analyzerCode}^${selectedAnalyzer.testMappings[0]?.catalogTestName}|||20261014120000`}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>Automatic observation parsing and validation enabled</span>
              <button
                onClick={() => setSimulatedMessage(null)}
                className="text-xs font-bold text-slate-400 hover:text-white underline cursor-pointer"
              >
                Clear Stream
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

