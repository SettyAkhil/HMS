import React, { useState, useEffect, useRef } from "react"
import { SurgicalCase, SurgeryDatabase, TelemetryReading, SurgicalConsumableItem } from "../../services/surgeryDb"
import { Btn } from "../shared"
import { toast } from "react-hot-toast"

interface LiveIntraOpMonitorViewProps {
  cases: SurgicalCase[]
  initialCaseId?: string
  onOpenBooklet: (c: SurgicalCase, page?: number) => void
  onAdvanceStatus: (caseId: string, status: SurgicalCase["status"]) => void
}

export default function LiveIntraOpMonitorView({
  cases,
  initialCaseId,
  onOpenBooklet,
  onAdvanceStatus,
}: LiveIntraOpMonitorViewProps) {
  const activeCases = cases.filter(
    (c) => c.status === "In Surgery" || c.status === "Pre-Op Holding" || c.status === "PACU Recovery",
  )
  const defaultCase = (initialCaseId ? cases.find(c => c.id === initialCaseId) : null) || activeCases.find((c) => c.status === "In Surgery") || activeCases[0] || cases[0]
  const [selectedCaseId, setSelectedCaseId] = useState<string>(initialCaseId || defaultCase?.id || "")

  useEffect(() => {
    if (initialCaseId) setSelectedCaseId(initialCaseId)
  }, [initialCaseId])

  const currentCase = cases.find((c) => c.id === selectedCaseId) || defaultCase

  // Live telemetry state
  const [hr, setHr] = useState<number>(currentCase?.currentTelemetry?.hr || 74)
  const [bpSys, setBpSys] = useState<number>(currentCase?.currentTelemetry?.bpSys || 118)
  const [bpDia, setBpDia] = useState<number>(currentCase?.currentTelemetry?.bpDia || 76)
  const [spo2, setSpo2] = useState<number>(currentCase?.currentTelemetry?.spo2 || 99)
  const [etco2, setEtco2] = useState<number>(currentCase?.currentTelemetry?.etco2 || 36)
  const [temp, setTemp] = useState<number>(currentCase?.currentTelemetry?.temp || 36.8)
  const [agent, setAgent] = useState<string>(currentCase?.currentTelemetry?.anestheticAgent || "Sevoflurane")
  const [agentPct, setAgentPct] = useState<string>(currentCase?.currentTelemetry?.agentConcentration || "2.0%")
  const [bloodLoss, setBloodLoss] = useState<number>(currentCase?.operationRecord?.bloodLossMl || 65)
  const [ivFluidsInfused, setIvFluidsInfused] = useState<number>(850)
  const [urineOutput, setUrineOutput] = useState<number>(180)

  // Canvas waveform animation ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const offsetRef = useRef<number>(0)

  // WHO Checklist interactive state
  const [whoPhase, setWhoPhase] = useState<"signIn" | "timeOut" | "signOut">("timeOut")

  useEffect(() => {
    if (currentCase) {
      if (currentCase.currentTelemetry) {
        setHr(currentCase.currentTelemetry.hr || 74)
        setBpSys(currentCase.currentTelemetry.bpSys || 118)
        setBpDia(currentCase.currentTelemetry.bpDia || 76)
        setSpo2(currentCase.currentTelemetry.spo2 || 99)
        setEtco2(currentCase.currentTelemetry.etco2 || 36)
        setTemp(currentCase.currentTelemetry.temp || 36.8)
        setAgent(currentCase.currentTelemetry.anestheticAgent || "Sevoflurane")
        setAgentPct(currentCase.currentTelemetry.agentConcentration || "2.0%")
      }
      if (currentCase.whoChecklist) {
        setWhoForm(currentCase.whoChecklist)
      }
    }
  }, [currentCase?.id])
  const [whoForm, setWhoForm] = useState(
    currentCase?.whoChecklist || {
      signIn: {
        patientConfirmedIdConsent: true,
        siteMarked: true,
        anaesthesiaMachineCheckComplete: true,
        pulseOximeterFunctioning: true,
        allergiesChecked: true,
        difficultAirwayRisk: false,
        bloodLossRiskOver500ml: false,
        signedByNurse: "RN Murphy",
        completedAt: "10:55 AM",
      },
      timeOut: {
        teamMembersIntroduced: true,
        patientNameProcedureSiteConfirmed: true,
        antibioticProphylaxisWithin60min: true,
        surgeonCriticalStepsDiscussed: true,
        anaesthetistPatientConcernsDiscussed: true,
        nurseSterilityEquipmentVerified: true,
        imagingDisplayed: true,
        signedBySurgeon: currentCase?.surgeon || "Dr. Williams",
        completedAt: "11:05 AM",
      },
      signOut: {
        procedureNameRecorded: true,
        swabInstrumentNeedleCountCorrect: true,
        specimenLabeledAloud: true,
        equipmentProblemsNoted: false,
        postOpRecoveryConcernsDiscussed: true,
        signedByScrubNurse: "RN Murphy",
        completedAt: "11:40 AM",
      },
    },
  )

  // New consumable modal state
  const [showAddImplant, setShowAddImplant] = useState(false)
  const [implantForm, setImplantForm] = useState({
    name: "",
    category: "Implant" as SurgicalConsumableItem["category"],
    lotNumber: "",
    serialNumber: "",
    quantity: 1,
    unitCost: 5000,
  })

  // Sync state when selected case changes
  useEffect(() => {
    if (currentCase) {
      setHr(currentCase.currentTelemetry?.hr || 74)
      setBpSys(currentCase.currentTelemetry?.bpSys || 118)
      setBpDia(currentCase.currentTelemetry?.bpDia || 76)
      setSpo2(currentCase.currentTelemetry?.spo2 || 99)
      setEtco2(currentCase.currentTelemetry?.etco2 || 36)
      setTemp(currentCase.currentTelemetry?.temp || 36.8)
      setBloodLoss(currentCase.operationRecord?.bloodLossMl || 75)
      if (currentCase.whoChecklist) {
        setWhoForm(currentCase.whoChecklist)
      }
    }
  }, [selectedCaseId])

  // ECG real-time sweeping canvas animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let running = true

    const draw = () => {
      if (!running) return
      const width = canvas.width
      const height = canvas.height

      // Fade trail background
      ctx.fillStyle = "rgba(10, 15, 29, 0.25)"
      ctx.fillRect(0, 0, width, height)

      // Draw faint grid lines
      ctx.strokeStyle = "rgba(30, 58, 110, 0.2)"
      ctx.lineWidth = 0.5
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y < height; y += 20) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // ECG wave path
      ctx.strokeStyle = "#10B981" // Bright emerald neon
      ctx.lineWidth = 2
      ctx.beginPath()

      offsetRef.current = (offsetRef.current + 2.5) % 240

      for (let x = 0; x < width; x++) {
        const t = (x + offsetRef.current) % 120
        let y = height / 2

        // Simulated P-Q-R-S-T wave pattern
        if (t > 20 && t < 30) {
          y -= 8 * Math.sin(((t - 20) / 10) * Math.PI) // P wave
        } else if (t >= 35 && t < 38) {
          y += 5 // Q dip
        } else if (t >= 38 && t < 44) {
          y -= 45 // R spike
        } else if (t >= 44 && t < 48) {
          y += 12 // S dip
        } else if (t > 60 && t < 80) {
          y -= 14 * Math.sin(((t - 60) / 20) * Math.PI) // T wave
        }

        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Cyan SpO2 Plethysmography secondary wave
      ctx.strokeStyle = "#06B6D4" // Neon cyan
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let x = 0; x < width; x++) {
        const t = (x + offsetRef.current) % 120
        const y = height * 0.8 - 12 * Math.sin((t / 120) * Math.PI * 2) * Math.cos((t / 120) * Math.PI)
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      animationFrameRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      running = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [hr])

  const map = Math.round((2 * bpDia + bpSys) / 3)

  const handleSaveTelemetry = () => {
    if (!currentCase) return
    const reading: TelemetryReading = {
      id: `TEL-${Date.now()}`,
      timestamp: new Date().toISOString(),
      hr,
      bpSys,
      bpDia,
      map,
      spo2,
      etco2,
      temp,
      anestheticAgent: agent,
      agentConcentration: agentPct,
      respRate: 14,
      peep: 5,
      tidalVolume: 450,
    }
    SurgeryDatabase.updateTelemetry(currentCase.id, reading)
    toast.success("Telemetry vitals reading logged to anesthesia chart!")
  }

  const handleSaveWho = async () => {
    if (!currentCase) return
    try {
      await SurgeryDatabase.saveWhoChecklist(currentCase.id, whoForm)
      toast.success("WHO Surgical Safety Checklist verified & signed!")
    } catch {
      toast.error("Failed to save WHO checklist.")
    }
  }

  const handleAddConsumableSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentCase || !implantForm.name) return
    const item: SurgicalConsumableItem = {
      id: `IMPL-${Date.now()}`,
      name: implantForm.name,
      category: implantForm.category,
      lotNumber: implantForm.lotNumber || `LOT-${Math.floor(1000 + Math.random() * 9000)}`,
      serialNumber: implantForm.serialNumber || undefined,
      quantity: Number(implantForm.quantity) || 1,
      unitCost: Number(implantForm.unitCost) || 0,
      sterilityVerified: true,
    }
    SurgeryDatabase.addConsumableOrImplant(currentCase.id, item)
    toast.success(`Added ${item.name} to case & updated surgical invoice!`)
    setShowAddImplant(false)
    setImplantForm({
      name: "",
      category: "Implant",
      lotNumber: "",
      serialNumber: "",
      quantity: 1,
      unitCost: 5000,
    })
  }

  return (
    <div className="space-y-4">
      {/* Top Selector & Theatre Status */}
      <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-lg border border-purple-200">
            ✂️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#1E3A6E]">
                Operating Theatre Live Cockpit &amp; Intra-Op Telemetry
              </h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Multiparameter Stream Connected
              </span>
            </div>
            <p className="text-[11.5px] text-slate-500">
              Live cardiac rhythm, capnography, hemodynamic balance &amp; WHO Surgical Safety execution
            </p>
          </div>
        </div>

        {/* Case selector dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Select Theatre Case:</label>
          <select
            value={currentCase?.id}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="border border-[#DDE2EC] rounded-lg px-3 py-1.5 text-xs font-semibold bg-[#F8FAFC] text-slate-800 focus:outline-none focus:border-slate-800"
          >
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.orRoom} · {c.patientName} ({c.procedureName}) - {c.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {currentCase ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT 8 COLS: TELEMETRY DISPLAY & WAVEFORMS */}
          <div className="lg:col-span-8 space-y-4">
            {/* Real-time Multiparameter Monitor Screen */}
            <div className="bg-[#0B132B] rounded-2xl border border-slate-700/80 p-5 text-white shadow-xl overflow-hidden relative font-mono">
              {/* Monitor top banner */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800/60">
                    {currentCase.orRoom || "OR 1"} · LIVE MONITOR
                  </span>
                  <span className="text-xs text-slate-300 font-sans font-bold">
                    {currentCase.patientName} ({currentCase.age}y/{currentCase.gender}) · UMR: {currentCase.mrn}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>Lead II: 1.0mV</span>
                  <span>Filter: DIAG</span>
                  <span className="text-emerald-400 animate-pulse font-bold">● REC</span>
                </div>
              </div>

              {/* Animated Waveform Canvas */}
              <div className="relative rounded-xl overflow-hidden bg-black/60 border border-slate-800 mb-4 h-40">
                <canvas
                  ref={canvasRef}
                  width={680}
                  height={160}
                  className="w-full h-full block"
                />
                <div className="absolute top-2 left-3 flex items-center gap-4 text-[10px] text-emerald-400">
                  <span>ECG LEAD II: Normal Sinus Rhythm</span>
                  <span className="text-cyan-400">SpO2 Pleth: 99% Perfusion</span>
                </div>
              </div>

              {/* Vital Stat Dials Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                {/* Heart Rate */}
                <div className="bg-slate-900/90 border border-emerald-800/40 p-3 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex justify-between">
                    <span>HR (bpm)</span>
                    <span>❤️</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-400 mt-1">{hr}</div>
                  <div className="text-[10.5px] text-emerald-500/80 mt-0.5">Limits: 50 - 120</div>
                </div>

                {/* Arterial Blood Pressure & MAP */}
                <div className="bg-slate-900/90 border border-blue-800/40 p-3 rounded-xl">
                  <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider flex justify-between">
                    <span>NIBP / MAP</span>
                    <span>🩸</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">
                    {bpSys}/{bpDia}{" "}
                    <span className="text-xs font-normal text-blue-200">({map})</span>
                  </div>
                  <div className="text-[10.5px] text-blue-300 mt-0.5 font-sans">
                    MAP Target &gt; 65 mmHg
                  </div>
                </div>

                {/* SpO2 Pulse Ox */}
                <div className="bg-slate-900/90 border border-cyan-800/40 p-3 rounded-xl">
                  <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex justify-between">
                    <span>SpO2 %</span>
                    <span>💨</span>
                  </div>
                  <div className="text-3xl font-bold text-cyan-400 mt-1">{spo2}%</div>
                  <div className="text-[10.5px] text-cyan-300 mt-0.5">FiO2 45% · Normal</div>
                </div>

                {/* EtCO2 Capnography */}
                <div className="bg-slate-900/90 border border-amber-800/40 p-3 rounded-xl">
                  <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex justify-between">
                    <span>EtCO2 (mmHg)</span>
                    <span>🫁</span>
                  </div>
                  <div className="text-3xl font-bold text-amber-400 mt-1">{etco2}</div>
                  <div className="text-[10.5px] text-amber-300 mt-0.5">RR: 14 bpm</div>
                </div>
              </div>

              {/* Anesthesia Machine & Ventilator Summary Bar */}
              <div className="mt-3.5 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-300 gap-2">
                <div className="flex items-center gap-3">
                  <span>Agent: <strong className="text-white">{agent} {agentPct}</strong></span>
                  <span>·</span>
                  <span>Ventilator: <strong className="text-white">VCV (TV 450mL / PEEP 5)</strong></span>
                  <span>·</span>
                  <span>Core Temp: <strong className="text-white">{temp}°C</strong></span>
                </div>
                <button
                  onClick={handleSaveTelemetry}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-sans font-bold cursor-pointer transition-colors"
                >
                  📝 Log Reading to Anesthesia Chart
                </button>
              </div>
            </div>

            {/* Interactive Vitals Calibration & Fluid Balance */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-4">
              <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider border-b border-[#DDE2EC] pb-2 flex items-center justify-between">
                <span>Intra-Operative Hemodynamic &amp; Fluid Balance Controls</span>
                <span className="text-[11px] font-normal text-slate-500 font-sans">
                  Live Anesthesia Station Adjustment
                </span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                {/* Vitals quick adjust */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC] space-y-2">
                  <div className="font-bold text-slate-800">Adjust Vitals Calibration</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-[11px]">Heart Rate:</span>
                      <div className="flex items-center gap-1 font-mono">
                        <button onClick={() => setHr(Math.max(45, hr - 2))} className="px-1.5 py-0.5 bg-slate-200 rounded font-bold hover:bg-slate-300 cursor-pointer">-</button>
                        <span className="font-bold text-slate-900 w-8 text-center">{hr}</span>
                        <button onClick={() => setHr(Math.min(160, hr + 2))} className="px-1.5 py-0.5 bg-slate-200 rounded font-bold hover:bg-slate-300 cursor-pointer">+</button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-[11px]">Systolic BP:</span>
                      <div className="flex items-center gap-1 font-mono">
                        <button onClick={() => setBpSys(Math.max(70, bpSys - 5))} className="px-1.5 py-0.5 bg-slate-200 rounded font-bold hover:bg-slate-300 cursor-pointer">-</button>
                        <span className="font-bold text-slate-900 w-8 text-center">{bpSys}</span>
                        <button onClick={() => setBpSys(Math.min(200, bpSys + 5))} className="px-1.5 py-0.5 bg-slate-200 rounded font-bold hover:bg-slate-300 cursor-pointer">+</button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-[11px]">Sevoflurane %:</span>
                      <select
                        value={agentPct}
                        onChange={(e) => setAgentPct(e.target.value)}
                        className="border border-[#DDE2EC] rounded p-1 text-[11px] bg-white font-mono"
                      >
                        <option value="1.5%">1.5% (MAC 0.75)</option>
                        <option value="2.0%">2.0% (MAC 1.0)</option>
                        <option value="2.5%">2.5% (MAC 1.25)</option>
                        <option value="3.0%">3.0% (MAC 1.5)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Fluid Balance */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC] space-y-2">
                  <div className="font-bold text-slate-800">Fluid &amp; Blood Balance</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-[11px]">Blood Loss:</span>
                      <div className="flex items-center gap-1 font-mono">
                        <button onClick={() => setBloodLoss(Math.max(0, bloodLoss - 25))} className="px-1.5 py-0.5 bg-slate-200 rounded font-bold hover:bg-slate-300 cursor-pointer">-</button>
                        <span className="font-bold text-rose-700 w-12 text-center">{bloodLoss} mL</span>
                        <button onClick={() => setBloodLoss(bloodLoss + 25)} className="px-1.5 py-0.5 bg-slate-200 rounded font-bold hover:bg-slate-300 cursor-pointer">+</button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-[11px]">IV Crystalloid:</span>
                      <span className="font-mono font-bold text-blue-700">{ivFluidsInfused} mL</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 text-[11px]">Urine Output:</span>
                      <span className="font-mono font-bold text-amber-700">{urineOutput} mL</span>
                    </div>
                  </div>
                </div>

                {/* Safety Protocol Status */}
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#DDE2EC] space-y-2">
                  <div className="font-bold text-slate-800">Safety &amp; Warning Status</div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <span>✓</span> MAP &gt; 65 mmHg Adequate Perfusion
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <span>✓</span> Airway Pressure 18 cmH2O Normal
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <span>✓</span> Convective Warming Active (36.8°C)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 4 COLS: WHO CHECKLIST & IMPLANTS TRACKER */}
          <div className="lg:col-span-4 space-y-4">
            {/* WHO Surgical Safety Checklist Card */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#DDE2EC] pb-2">
                <div>
                  <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider">
                    WHO Surgical Safety Checklist
                  </h3>
                  <span className="text-[10px] text-slate-500 font-sans">
                    3-Phase Mandatory Protocol
                  </span>
                </div>
                <div className="flex gap-1 text-[10px] font-bold">
                  <button
                    onClick={() => setWhoPhase("signIn")}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      whoPhase === "signIn" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    1. Sign-In
                  </button>
                  <button
                    onClick={() => setWhoPhase("timeOut")}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      whoPhase === "timeOut" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    2. Time-Out
                  </button>
                  <button
                    onClick={() => setWhoPhase("signOut")}
                    className={`px-2 py-0.5 rounded cursor-pointer ${
                      whoPhase === "signOut" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    3. Sign-Out
                  </button>
                </div>
              </div>

              {/* Phase Content */}
              {whoPhase === "signIn" && (
                <div className="space-y-2 text-xs">
                  <div className="text-[11px] font-bold text-blue-900 bg-blue-50 p-2 rounded border border-blue-200">
                    Phase 1: Before Induction of Anesthesia
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signIn.patientConfirmedIdConsent}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signIn: { ...whoForm.signIn, patientConfirmedIdConsent: e.target.checked },
                        })
                      }
                      className="rounded text-blue-600"
                    />
                    <span>Patient identity, site &amp; consent confirmed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signIn.siteMarked}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signIn: { ...whoForm.signIn, siteMarked: e.target.checked },
                        })
                      }
                      className="rounded text-blue-600"
                    />
                    <span>Surgical site marked with indelible ink</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signIn.anaesthesiaMachineCheckComplete}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signIn: { ...whoForm.signIn, anaesthesiaMachineCheckComplete: e.target.checked },
                        })
                      }
                      className="rounded text-blue-600"
                    />
                    <span>Anesthesia machine &amp; medication check complete</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signIn.allergiesChecked}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signIn: { ...whoForm.signIn, allergiesChecked: e.target.checked },
                        })
                      }
                      className="rounded text-blue-600"
                    />
                    <span>Patient known allergies verified</span>
                  </label>
                </div>
              )}

              {whoPhase === "timeOut" && (
                <div className="space-y-2 text-xs">
                  <div className="text-[11px] font-bold text-amber-900 bg-amber-50 p-2 rounded border border-amber-200">
                    Phase 2: Before Skin Incision (Time-Out Pause)
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.timeOut.teamMembersIntroduced}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          timeOut: { ...whoForm.timeOut, teamMembersIntroduced: e.target.checked },
                        })
                      }
                      className="rounded text-amber-600"
                    />
                    <span>All team members introduced by name &amp; role</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.timeOut.patientNameProcedureSiteConfirmed}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          timeOut: {
                            ...whoForm.timeOut,
                            patientNameProcedureSiteConfirmed: e.target.checked,
                          },
                        })
                      }
                      className="rounded text-amber-600"
                    />
                    <span>Surgeon, Anesthetist &amp; Nurse confirm patient &amp; site</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.timeOut.antibioticProphylaxisWithin60min}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          timeOut: {
                            ...whoForm.timeOut,
                            antibioticProphylaxisWithin60min: e.target.checked,
                          },
                        })
                      }
                      className="rounded text-amber-600"
                    />
                    <span>Antibiotic prophylaxis administered within 60 minutes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.timeOut.nurseSterilityEquipmentVerified}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          timeOut: {
                            ...whoForm.timeOut,
                            nurseSterilityEquipmentVerified: e.target.checked,
                          },
                        })
                      }
                      className="rounded text-amber-600"
                    />
                    <span>Sterility indicator verified &amp; equipment concerns noted</span>
                  </label>
                </div>
              )}

              {whoPhase === "signOut" && (
                <div className="space-y-2 text-xs">
                  <div className="text-[11px] font-bold text-emerald-900 bg-emerald-50 p-2 rounded border border-emerald-200">
                    Phase 3: Before Patient Leaves Operating Room
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signOut.procedureNameRecorded}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signOut: { ...whoForm.signOut, procedureNameRecorded: e.target.checked },
                        })
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Name of procedure recorded aloud</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signOut.swabInstrumentNeedleCountCorrect}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signOut: {
                            ...whoForm.signOut,
                            swabInstrumentNeedleCountCorrect: e.target.checked,
                          },
                        })
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Instrument, sponge &amp; needle counts 100% correct</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signOut.specimenLabeledAloud}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signOut: { ...whoForm.signOut, specimenLabeledAloud: e.target.checked },
                        })
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Specimen labeled including patient name aloud</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whoForm.signOut.postOpRecoveryConcernsDiscussed}
                      onChange={(e) =>
                        setWhoForm({
                          ...whoForm,
                          signOut: {
                            ...whoForm.signOut,
                            postOpRecoveryConcernsDiscussed: e.target.checked,
                          },
                        })
                      }
                      className="rounded text-emerald-600"
                    />
                    <span>Key post-op concerns &amp; recovery plan reviewed</span>
                  </label>
                </div>
              )}

              <div className="pt-2 border-t border-[#DDE2EC] flex items-center justify-between">
                <Btn size="xs" variant="outline" onClick={() => onOpenBooklet(currentCase, 10)}>
                  Page 10 Booklet
                </Btn>
                <Btn size="xs" variant="primary" onClick={handleSaveWho}>
                  Save &amp; Sign Checklist
                </Btn>
              </div>
            </div>

            {/* Surgical Implants & Consumable Lot Tracking */}
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#DDE2EC] pb-2">
                <div>
                  <h3 className="font-bold text-xs text-[#1E3A6E] uppercase tracking-wider">
                    Implants &amp; Lot Tracking
                  </h3>
                  <p className="text-[10px] text-slate-500">Tracked for billing &amp; regulatory safety</p>
                </div>
                <button
                  onClick={() => setShowAddImplant(true)}
                  className="text-[11px] font-bold text-[#1B4FD8] hover:underline cursor-pointer"
                >
                  + Add Item
                </button>
              </div>

              <div className="space-y-2">
                {(currentCase.implantsAndConsumables || []).length > 0 ? (
                  currentCase.implantsAndConsumables?.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-[11.5px]">{item.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {item.category} · Lot: <strong>{item.lotNumber}</strong>
                          {item.serialNumber && ` · SN: ${item.serialNumber}`}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-bold text-slate-800">
                          ₹{(item.unitCost * item.quantity).toLocaleString()}
                        </div>
                        <div className="text-[9.5px] text-emerald-700 font-sans font-semibold">
                          ✓ Sterile Verified
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-3 text-center text-slate-400 text-xs bg-slate-50 rounded-lg">
                    No surgical implants or high-cost consumables logged yet.
                  </div>
                )}
              </div>

              {/* Transition to PACU Recovery button */}
              {currentCase.status === "In Surgery" && (
                <div className="pt-2 border-t border-[#DDE2EC]">
                  <button
                    onClick={() => onAdvanceStatus(currentCase.id, "PACU Recovery")}
                    className="w-full py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>➔ Transfer to PACU Recovery Bay</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-white rounded-xl border border-[#DDE2EC] text-slate-500 text-xs">
          No surgical cases active in operating rooms.
        </div>
      )}

      {/* Add Consumable Modal */}
      {showAddImplant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 border border-[#DDE2EC] space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
              <h3 className="font-bold text-sm text-slate-900">
                Log Surgical Implant or Energy Consumable
              </h3>
              <button
                onClick={() => setShowAddImplant(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddConsumableSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                  Device / Implant Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Stryker Triathlon Femoral Component R Size 4"
                  value={implantForm.name}
                  onChange={(e) => setImplantForm({ ...implantForm, name: e.target.value })}
                  className="w-full border border-[#DDE2EC] rounded p-2 text-xs bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Category
                  </label>
                  <select
                    value={implantForm.category}
                    onChange={(e) =>
                      setImplantForm({
                        ...implantForm,
                        category: e.target.value as SurgicalConsumableItem["category"],
                      })
                    }
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white"
                  >
                    <option value="Implant">Implant</option>
                    <option value="Suture">Suture</option>
                    <option value="Mesh">Mesh</option>
                    <option value="Drain">Drain</option>
                    <option value="Energy Device">Energy Device</option>
                    <option value="Hemostatic Agent">Hemostatic Agent</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Unit Cost (₹)
                  </label>
                  <input
                    type="number"
                    value={implantForm.unitCost}
                    onChange={(e) => setImplantForm({ ...implantForm, unitCost: Number(e.target.value) })}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Lot / Batch Number
                  </label>
                  <input
                    type="text"
                    placeholder="LOT-2026-9812"
                    value={implantForm.lotNumber}
                    onChange={(e) => setImplantForm({ ...implantForm, lotNumber: e.target.value })}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Serial Number (if implant)
                  </label>
                  <input
                    type="text"
                    placeholder="SN-449102"
                    value={implantForm.serialNumber}
                    onChange={(e) => setImplantForm({ ...implantForm, serialNumber: e.target.value })}
                    className="w-full border border-[#DDE2EC] rounded p-1.5 text-xs bg-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#DDE2EC] flex justify-end gap-2">
                <Btn type="button" variant="outline" size="xs" onClick={() => setShowAddImplant(false)}>
                  Cancel
                </Btn>
                <Btn type="submit" variant="primary" size="xs">
                  Save Item &amp; Add to Bill
                </Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
