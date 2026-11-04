import React, { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { Btn, TabBar, StatusBadge } from "./shared";
import { SurgeryDatabase, SurgicalCase, SurgeryStatus } from "../services/surgeryDb";
import { OtPackageLink } from "./insurance/integrations";

// Subcomponents
import SurgicalFlowStepper, { SURGICAL_FLOW_STAGES } from "./surgery/SurgicalFlowStepper";
import OrLiveBoardView from "./surgery/OrLiveBoardView";
import PatientJourneyKanbanView from "./surgery/PatientJourneyKanbanView";
import LiveIntraOpMonitorView from "./surgery/LiveIntraOpMonitorView";
import PacuRecoveryView from "./surgery/PacuRecoveryView";
import WardPostOpCareView from "./surgery/WardPostOpCareView";
import ScheduleSurgeryModal from "./surgery/ScheduleSurgeryModal";
import { StatEmergencyModal } from "./surgery/StatEmergencyModal";
import TransferToWardModal from "./surgery/TransferToWardModal";
import TransferToIcuModal from "./surgery/TransferToIcuModal";
import SurgicalDischargeModal from "./surgery/SurgicalDischargeModal";
import SurgicalChargesModal from "./surgery/SurgicalChargesModal";
import { OtBookletModal } from "./surgery/OtBookletModal";

export default function Surgery() {
  const [cases, setCases] = useState<SurgicalCase[]>([]);
  const [activeTab, setActiveTab] = useState<string>("OR Live Board");
  const [searchQuery, setSearchQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("All Specialities");
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>("All");

  // Selection states for dedicated tab views
  const [selectedMonitorCase, setSelectedMonitorCase] = useState<SurgicalCase | undefined>(undefined);
  const [selectedPacuCase, setSelectedPacuCase] = useState<SurgicalCase | undefined>(undefined);
  const [selectedWardCase, setSelectedWardCase] = useState<SurgicalCase | undefined>(undefined);

  // Modals state
  const [bookingRoom, setBookingRoom] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isStatOpen, setIsStatOpen] = useState(false);

  const [activeBookletCase, setActiveBookletCase] = useState<SurgicalCase | null>(null);
  const [bookletPage, setBookletPage] = useState<number>(1);

  const [wardTransferCase, setWardTransferCase] = useState<SurgicalCase | null>(null);
  const [icuTransferCase, setIcuTransferCase] = useState<SurgicalCase | null>(null);
  const [dischargeCase, setDischargeCase] = useState<SurgicalCase | null>(null);
  const [chargesCase, setChargesCase] = useState<SurgicalCase | null>(null);

  // Load and subscribe to database
  useEffect(() => {
    SurgeryDatabase.refresh().then((loaded) => {
      setCases(loaded);
      initDefaults(loaded);
    });

    const unsubscribe = SurgeryDatabase.subscribe(() => {
      const updated = SurgeryDatabase.getCases();
      setCases(updated);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  const initDefaults = (currentCases: SurgicalCase[]) => {
    if (!selectedMonitorCase) {
      const inSurg = currentCases.find((c) => c.status === "In Surgery");
      if (inSurg) setSelectedMonitorCase(inSurg);
      else if (currentCases.length > 0) setSelectedMonitorCase(currentCases[0]);
    }
    if (!selectedPacuCase) {
      const pacu = currentCases.find((c) => c.status === "PACU Recovery");
      if (pacu) setSelectedPacuCase(pacu);
    }
    if (!selectedWardCase) {
      const ward = currentCases.find((c) => c.status === "Transferred to Ward");
      if (ward) setSelectedWardCase(ward);
    }
  };

  // Metrics computation
  const totalCases = cases.length;
  const inSurgeryCount = cases.filter((c) => c.status === "In Surgery").length;
  const preOpCount = cases.filter((c) => c.status === "Pre-Op Holding" || c.status === "PAC Cleared").length;
  const pacPendingCount = cases.filter((c) => c.status === "PAC Pending").length;
  const pacuCount = cases.filter((c) => c.status === "PACU Recovery").length;
  const wardCount = cases.filter((c) => c.status === "Transferred to Ward").length;
  const icuCount = cases.filter((c) => c.status === "Transferred to ICU").length;
  const dischargedCount = cases.filter((c) => c.status === "Discharged" || c.status === "Completed").length;

  // Filtered cases
  const filteredCases = cases.filter((c) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      (c.patientName || "").toLowerCase().includes(q) ||
      (c.mrn || "").toLowerCase().includes(q) ||
      (c.procedureName || "").toLowerCase().includes(q) ||
      (c.surgeon || "").toLowerCase().includes(q);

    const matchesSpecialty =
      specialtyFilter === "All Specialities" || c.specialty === specialtyFilter;

    const activeStage = SURGICAL_FLOW_STAGES.find((s) => s.id === selectedStageFilter);
    const matchesStage =
      !selectedStageFilter ||
      selectedStageFilter === "All" ||
      (activeStage ? (activeStage.matchStatuses as readonly string[]).includes(c.status) : c.status === selectedStageFilter);

    return matchesSearch && matchesSpecialty && matchesStage;
  });

  // Handlers for switching tabs with context
  const handleOpenIntraOpMonitor = (c: SurgicalCase) => {
    setSelectedMonitorCase(c);
    setActiveTab("Live Intra-Op Monitor");
  };

  const handleOpenPacu = (c: SurgicalCase) => {
    setSelectedPacuCase(c);
    setActiveTab("PACU Recovery");
  };

  const handleOpenWardPostOp = (c: SurgicalCase) => {
    setSelectedWardCase(c);
    setActiveTab("Ward Post-Op & Discharge");
  };

  const handleOpenBooklet = (c: SurgicalCase, page = 1) => {
    setActiveBookletCase(c);
    setBookletPage(page);
  };

  const handleStatusChange = async (caseId: string, newStatus: SurgeryStatus) => {
    try {
      await SurgeryDatabase.updateCaseStatus(caseId, newStatus);
      const allCases = SurgeryDatabase.getCases();
      setCases(allCases);
      initDefaults(allCases);
      toast.success(`Patient moved to ${newStatus}`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update status");
    }
  };

  const handleBookRoom = (room: string) => {
    setBookingRoom(room);
    setIsBookingOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] flex flex-col min-h-screen">
      {/* Top Header */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex items-center justify-between flex-wrap gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#1E3A6E] text-white flex items-center justify-center font-bold text-sm shadow-xs">
              OT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-[#1E3A6E]">
                  Surgical Services &amp; Peri-Operative Command
                </h1>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Theatre Telemetry Active
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Hospital Patient Journey: PAC Intake ➔ Holding Bay ➔ OR Suite ➔ PACU Recovery ➔ Inpatient Ward ➔ Discharge
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsStatOpen(true)}
            className="px-3.5 py-2 rounded-none bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>🚨</span>
            <span>Emergency STAT OT Reservation</span>
          </button>
          <button
            onClick={() => {
              setBookingRoom(null);
              setIsBookingOpen(true);
            }}
            className="px-3.5 py-2 rounded-none bg-[#1B4FD8] hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>📅</span>
            <span>+ Book Surgical Case</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricBox
            label="Total Census"
            count={totalCases}
            color="border-slate-200"
            icon="📋"
            subtext="All active cases"
          />
          <MetricBox
            label="PAC Intake"
            count={pacPendingCount}
            color="border-amber-200 bg-amber-50/40"
            icon="🩺"
            subtext="Clearance gate"
          />
          <MetricBox
            label="Holding Bay"
            count={preOpCount}
            color="border-indigo-200 bg-indigo-50/40"
            icon="🚪"
            subtext="Pre-op checklist"
          />
          <MetricBox
            label="In Surgery (OR)"
            count={inSurgeryCount}
            color="border-purple-200 bg-purple-50/40"
            icon="⚡"
            highlight={inSurgeryCount > 0}
            subtext="Operating theatre"
          />
          <MetricBox
            label="PACU Recovery"
            count={pacuCount}
            color="border-emerald-200 bg-emerald-50/40"
            icon="🛌"
            subtext="Aldrete monitoring"
          />
          <MetricBox
            label="Inpatient Ward"
            count={wardCount}
            color="border-sky-200 bg-sky-50/40"
            icon="🏥"
            subtext="POD &amp; Drain care"
          />
          <MetricBox
            label="Discharged / Done"
            count={dischargedCount}
            color="border-slate-200 bg-slate-50/40"
            icon="✅"
            subtext="Care completed"
          />
        </div>
      </div>

      {/* Interactive 7-Stage Visual Patient Pipeline */}
      <div className="px-6 py-2">
        <SurgicalFlowStepper
          cases={cases}
          activeStageFilter={selectedStageFilter === "All" ? null : selectedStageFilter}
          onSelectStage={(stage: string | null) =>
            setSelectedStageFilter(stage || "All")
          }
        />
      </div>

      {/* Search, Specialty Filters & Navigation Tabs */}
      <div className="px-6 py-2 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#DDE2EC] shadow-2xs">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
            {[
              { id: "OR Live Board", label: "OR Live Board", icon: "🏛️" },
              { id: "Patient Journey Flow", label: "Patient Journey Flow", icon: "🧭" },
              { id: "Live Intra-Op Monitor", label: "Live Intra-Op Monitor", icon: "📈", badge: inSurgeryCount },
              { id: "PACU Recovery", label: "PACU Recovery", icon: "🛌", badge: pacuCount },
              { id: "Ward Post-Op & Discharge", label: "Ward Post-Op & Discharge", icon: "🏥", badge: wardCount },
              { id: "14-Page OT Booklet", label: "14-Page OT Booklet", icon: "📘" },
              { id: "Surgeon Faculty", label: "Surgeon Faculty", icon: "👨‍⚕️" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#1E3A6E] text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search & Filter Bar */}
          <div className="flex items-center gap-2 text-xs">
            <div className="relative">
              <input
                type="text"
                placeholder="Search patient, UMR, surgeon..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-[#DDE2EC] rounded-lg w-48 sm:w-64 text-xs bg-[#F8FAFC] focus:bg-white focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8]"
              />
              <span className="absolute left-2.5 top-2 text-slate-400">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="border border-[#DDE2EC] rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700"
            >
              <option value="All Specialities">All Specialties</option>
              <option value="General Surgery">General Surgery</option>
              <option value="Orthopedic Surgery">Orthopedic Surgery</option>
              <option value="Cardiac Surgery">Cardiac Surgery</option>
              <option value="Neurosurgery">Neurosurgery</option>
              <option value="Gynecology & Obstetrics">Gynecology</option>
              <option value="Urology">Urology</option>
              <option value="ENT Surgery">ENT Surgery</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 px-6 pb-8">
        {/* TAB 1: OR LIVE BOARD */}
        {activeTab === "OR Live Board" && (
          <OrLiveBoardView
            cases={filteredCases}
            searchQuery={searchQuery}
            specialtyFilter={specialtyFilter}
            onOpenBooklet={handleOpenBooklet}
            onOpenCharges={(c: SurgicalCase) => setChargesCase(c)}
            onAdvanceStatus={handleStatusChange}
            onScheduleInRoom={handleBookRoom}
            onOpenLiveMonitor={(caseId: string) => {
              const target = cases.find((c) => c.id === caseId);
              if (target) handleOpenIntraOpMonitor(target);
            }}
            onTransferToWard={(c: SurgicalCase) => setWardTransferCase(c)}
            onInitiateDischarge={(c: SurgicalCase) => setDischargeCase(c)}
          />
        )}

        {/* TAB 2: PATIENT JOURNEY FLOW (KANBAN) */}
        {activeTab === "Patient Journey Flow" && (
          <PatientJourneyKanbanView
            cases={filteredCases}
            onOpenBooklet={handleOpenBooklet}
            onAdvanceStatus={handleStatusChange}
            onTransferToWard={(c: SurgicalCase) => setWardTransferCase(c)}
            onTransferToIcu={(c: SurgicalCase) => setIcuTransferCase(c)}
            onInitiateDischarge={(c: SurgicalCase) => setDischargeCase(c)}
            onOpenLiveMonitor={(caseId: string) => {
              const target = cases.find((c) => c.id === caseId);
              if (target) handleOpenIntraOpMonitor(target);
            }}
          />
        )}

        {/* TAB 3: LIVE INTRA-OP MONITOR */}
        {activeTab === "Live Intra-Op Monitor" && (
          <LiveIntraOpMonitorView
            cases={cases}
            initialCaseId={selectedMonitorCase?.id}
            onOpenBooklet={handleOpenBooklet}
            onAdvanceStatus={handleStatusChange}
          />
        )}

        {/* TAB 4: PACU RECOVERY */}
        {activeTab === "PACU Recovery" && (
          <PacuRecoveryView
            cases={cases}
            initialCaseId={selectedPacuCase?.id}
            onOpenBooklet={handleOpenBooklet}
            onTransferToWard={(c: SurgicalCase) => setWardTransferCase(c)}
            onTransferToIcu={(c: SurgicalCase) => setIcuTransferCase(c)}
          />
        )}

        {/* TAB 5: WARD POST-OP & DISCHARGE */}
        {activeTab === "Ward Post-Op & Discharge" && (
          <WardPostOpCareView
            cases={cases}
            initialCaseId={selectedWardCase?.id}
            onOpenBooklet={handleOpenBooklet}
            onInitiateDischarge={(c: SurgicalCase) => setDischargeCase(c)}
          />
        )}

        {/* TAB 6: 14-PAGE OT BOOKLET DIRECTORY */}
        {activeTab === "14-Page OT Booklet" && (
          <div className="space-y-4">
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-sm text-[#1E3A6E] flex items-center gap-2">
                    <span>Imperial Hospitals · Digitized 14-Page OT Booklet Suite</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
                      NABH &amp; JCI Compliant
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Comprehensive legal and clinical documentation spanning Pre-Op, Intra-Op, and PACU Recovery
                  </p>
                </div>
                <div className="text-xs text-slate-500 font-mono">
                  {filteredCases.length} Patients Recorded
                </div>
              </div>

              <div className="divide-y divide-slate-100 mt-2">
                {filteredCases.map((c) => (
                  <div
                    key={c.id}
                    className="py-3.5 flex items-center justify-between hover:bg-slate-50/80 px-3 rounded-lg transition-colors flex-wrap gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{c.patientName}</span>
                        <span className="text-[11px] font-mono text-slate-500">({c.mrn})</span>
                        <StatusBadge status={c.status} />
                        {c.urgency === "Emergency STAT" && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded font-bold">
                            STAT
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {c.procedureName} · Dr. {c.surgeon} · {c.orRoom} · Age {c.age}/{c.gender}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenBooklet(c, 1)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-[#1E3A6E] border border-[#DDE2EC] rounded-lg shadow-2xs cursor-pointer transition-colors"
                      >
                        P1 Demographics
                      </button>
                      <button
                        onClick={() => handleOpenBooklet(c, 2)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-[#1E3A6E] border border-[#DDE2EC] rounded-lg shadow-2xs cursor-pointer transition-colors"
                      >
                        P2 PAC Form
                      </button>
                      <button
                        onClick={() => handleOpenBooklet(c, 4)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-[#1E3A6E] border border-[#DDE2EC] rounded-lg shadow-2xs cursor-pointer transition-colors"
                      >
                        P4 Consents
                      </button>
                      <button
                        onClick={() => handleOpenBooklet(c, 10)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-[#1E3A6E] border border-[#DDE2EC] rounded-lg shadow-2xs cursor-pointer transition-colors"
                      >
                        P10 WHO Safety
                      </button>
                      <button
                        onClick={() => handleOpenBooklet(c, 12)}
                        className="px-2.5 py-1 text-xs font-semibold bg-white hover:bg-slate-100 text-[#1E3A6E] border border-[#DDE2EC] rounded-lg shadow-2xs cursor-pointer transition-colors"
                      >
                        P12 Operation Record
                      </button>
                      <button
                        onClick={() => handleOpenBooklet(c, 1)}
                        className="px-3 py-1 text-xs font-bold bg-[#1B4FD8] hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer transition-colors"
                      >
                        Open Full Booklet ➔
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: SURGEON FACULTY */}
        {activeTab === "Surgeon Faculty" && (
          <div className="bg-white border border-[#DDE2EC] rounded-xl p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-sm text-[#1E3A6E]">
                  Surgical Faculty &amp; Specialist Roster
                </h3>
                <p className="text-[11px] text-slate-500">
                  Operating surgeons, credentialed specialties, on-call assignments, and case volumes
                </p>
              </div>
              <div className="text-xs text-slate-600 font-mono">
                Department of Surgical Sciences
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              {[
                { name: "Dr. Adams", specialty: "Orthopedic & Trauma", count: 42, onCall: true, room: "OR 3" },
                { name: "Dr. Rodriguez", specialty: "Cardiothoracic Surgery", count: 38, onCall: true, room: "OR 1" },
                { name: "Dr. Chen", specialty: "General & Laparoscopic", count: 56, onCall: false, room: "OR 2" },
                { name: "Dr. Gupta", specialty: "Neurosurgery", count: 29, onCall: false, room: "OR 4" },
                { name: "Dr. Williams", specialty: "Urology & Renal Transplant", count: 35, onCall: false, room: "OR 2" },
                { name: "Dr. Shah", specialty: "ENT & Head-Neck Surgery", count: 48, onCall: false, room: "OR 3" },
              ].map((s, i) => (
                <div
                  key={i}
                  className="border border-[#DDE2EC] rounded-xl p-4 bg-[#F8FAFC] flex flex-col justify-between shadow-2xs hover:bg-white hover:border-blue-300 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#1E3A6E] text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-blue-100">
                      {s.name.split(" ")[1][0]}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        {s.name}
                        {s.onCall && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.2 rounded-full font-bold">
                            ON CALL
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 text-[11px]">{s.specialty}</div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Primary Suite: <strong className="text-slate-800">{s.room}</strong></span>
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {s.count} procedures
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {/* 1. Schedule Surgery Modal */}
      {isBookingOpen && (
        <ScheduleSurgeryModal
          initialOrRoom={bookingRoom}
          onClose={() => {
            setIsBookingOpen(false);
            setBookingRoom(null);
          }}
          onSuccess={() => {
            setCases(SurgeryDatabase.getCases());
          }}
        />
      )}

      {/* 2. Stat Emergency Modal */}
      <StatEmergencyModal
        isOpen={isStatOpen}
        onClose={() => setIsStatOpen(false)}
        onSuccess={(created: SurgicalCase) => {
          setCases(SurgeryDatabase.getCases());
          handleOpenIntraOpMonitor(created);
        }}
      />

      {/* 3. Transfer to Ward Modal (Linked to BedDatabase) */}
      {wardTransferCase && (
        <TransferToWardModal
          surgicalCase={wardTransferCase}
          onClose={() => setWardTransferCase(null)}
          onSuccess={() => {
            setCases(SurgeryDatabase.getCases());
            handleOpenWardPostOp(wardTransferCase);
          }}
        />
      )}

      {/* 4. Transfer to ICU Modal */}
      {icuTransferCase && (
        <TransferToIcuModal
          surgicalCase={icuTransferCase}
          onClose={() => setIcuTransferCase(null)}
          onSuccess={() => {
            setCases(SurgeryDatabase.getCases());
          }}
        />
      )}

      {/* 5. Surgical Discharge Modal (Releases BedDatabase bed) */}
      {dischargeCase && (
        <SurgicalDischargeModal
          surgicalCase={dischargeCase}
          onClose={() => setDischargeCase(null)}
          onSuccess={() => {
            setCases(SurgeryDatabase.getCases());
          }}
        />
      )}

      {/* 6. Surgical Charges Modal */}
      {chargesCase && (
        <SurgicalChargesModal
          surgicalCase={chargesCase}
          onClose={() => setChargesCase(null)}
        />
      )}

      {/* 7. Digitized 14-Page OT Booklet Modal */}
      {activeBookletCase && (
        <OtBookletModal
          activeCase={activeBookletCase}
          initialPage={bookletPage}
          onClose={() => setActiveBookletCase(null)}
          onStatusUpdate={() => {
            setCases(SurgeryDatabase.getCases());
          }}
        />
      )}
    </div>
  );
}

function MetricBox({ label, count, color, icon, subtext, highlight }: any) {
  return (
    <div
      className={`p-3 rounded-xl border ${color} shadow-2xs flex flex-col justify-between transition-all ${
        highlight ? "ring-2 ring-purple-400 bg-purple-50" : "bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <div className="mt-1">
        <div className="text-2xl font-bold font-mono text-slate-900 leading-tight">{count}</div>
        {subtext && <div className="text-[10px] text-slate-400 mt-0.5">{subtext}</div>}
      </div>
    </div>
  );
}
