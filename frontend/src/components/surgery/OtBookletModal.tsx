import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { Btn } from "../shared";
import { SurgeryDatabase, SurgicalCase } from "../../services/surgeryDb";

interface OtBookletModalProps {
  activeCase: SurgicalCase;
  initialPage?: number;
  onClose: () => void;
  onStatusUpdate?: (caseId: string, newStatus: SurgicalCase["status"]) => void;
}

export const OtBookletModal: React.FC<OtBookletModalProps> = ({
  activeCase,
  initialPage = 1,
  onClose,
  onStatusUpdate,
}) => {
  const activeBookletCase = activeCase;
  const [bookletActivePage, setBookletActivePage] = useState<number>(initialPage);
  const [bookletRoleFilter, setBookletRoleFilter] = useState<"all" | "ward" | "ot_nurse" | "pacu">("all");
  const [saveStatusMsg, setSaveStatusMsg] = useState<string | null>(null);

  const [intraOpForm, setIntraOpForm] = useState({
    swabCount: true,
    needleCount: true,
    instrumentCount: true,
    bloodLossMl: 75,
    drainsCount: 1,
    suturesUsed: "Ethicon Vicryl 2-0, Monocryl 3-0",
    operativeNotes: "Procedure proceeded routinely. No intra-operative complications encountered.",
    bp: "120/80",
    hr: 72,
    spo2: 99,
    etco2: 35,
    aldreteActivity: 2,
    aldreteRespiration: 2,
    aldreteCirculation: 2,
    aldreteConsciousness: 2,
    aldreteO2Sat: 2,
    whoSignIn: true,
    whoTimeOut: true,
    whoSignOut: true,
  });

  const calculateTotalAldrete = () => {
    return (
      intraOpForm.aldreteActivity +
      intraOpForm.aldreteRespiration +
      intraOpForm.aldreteCirculation +
      intraOpForm.aldreteConsciousness +
      intraOpForm.aldreteO2Sat
    );
  };

  const handleUpdateStatus = async (caseId: string, newStatus: SurgicalCase["status"]) => {
    try {
      await SurgeryDatabase.updateCaseStatus(caseId, newStatus);
      if (onStatusUpdate) onStatusUpdate(caseId, newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const saveBookletProgress = async () => {
    if (!activeBookletCase) return;
    try {
      await SurgeryDatabase.saveFullBooklet(activeBookletCase.id, {
        operationRecord: {
          surgeonPreparedInOr: activeBookletCase.surgeon,
          preOpDiagnosis: "Symptomatic Cholelithiasis",
          postOpDiagnosis: "Chronic Calculous Cholecystitis",
          procedureProposed: activeBookletCase.procedureName,
          procedureExecuted: activeBookletCase.procedureName,
          asstSurgeons: ["Dr. Patel"],
          skinPreparation: "Betadine & Chlorhexidine",
          histopathologySent: true,
          photosVideosRecorded: true,
          swabCountCorrect: intraOpForm.swabCount,
          instrumentCountCorrect: intraOpForm.instrumentCount,
          suturesUsed: intraOpForm.suturesUsed,
          drainageCount: intraOpForm.drainsCount,
          bloodLossMl: intraOpForm.bloodLossMl,
          surgeryStartTime: "08:30 AM",
          surgeryEndTime: "10:15 AM",
          operatingTimeMins: 105,
          complications: "None",
          surgeonProcedureNotes: intraOpForm.operativeNotes,
          postOpInstructions: "NPO for 4 hours. Monitor vitals q15m x 1h then q30m x 2h.",
          surgeonSignature: activeBookletCase.surgeon,
        }
      });
      setSaveStatusMsg("Progress saved to clinical record!");
      toast.success("Progress saved to clinical record!");
      setTimeout(() => setSaveStatusMsg(null), 3000);
    } catch (err) {
      console.error("Failed to save booklet progress:", err);
      toast.error("Failed to save booklet progress.");
    }
  };

  return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 md:p-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col border border-[#DDE2EC] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#1E3A6E] text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-700 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white font-bold text-xs tracking-wider shadow-2xs border border-white/20 font-mono">
                  OT
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-white tracking-wide">
                      Imperial Hospitals · Digital OT Booklet
                    </h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                      OT Booklet Active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-mono">
                    Patient: <strong className="text-white">{activeBookletCase.patientName}</strong> ({activeBookletCase.age}y/{activeBookletCase.gender}) · UMR: <strong className="text-white">{activeBookletCase.mrn}</strong> · IP: <strong className="text-white">{activeBookletCase.ipNo || "IP-884920"}</strong> · {activeBookletCase.orRoom}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1 text-xs text-slate-200 bg-white/10 px-2.5 py-1 rounded-lg border border-white/15">
                  <span className="text-slate-300 text-[10.5px] mr-1">Role Filter:</span>
                  <button 
                    onClick={() => setBookletRoleFilter("all")}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${bookletRoleFilter === "all" ? "bg-white text-[#1E3A6E]" : "hover:bg-white/10 text-slate-200"}`}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => { setBookletRoleFilter("ward"); setBookletActivePage(1); }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${bookletRoleFilter === "ward" ? "bg-white text-[#1E3A6E]" : "hover:bg-white/10 text-slate-200"}`}
                  >
                    Ward
                  </button>
                  <button 
                    onClick={() => { setBookletRoleFilter("ot_nurse"); setBookletActivePage(8); }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${bookletRoleFilter === "ot_nurse" ? "bg-white text-[#1E3A6E]" : "hover:bg-white/10 text-slate-200"}`}
                  >
                    OT Nurse
                  </button>
                  <button 
                    onClick={() => { setBookletRoleFilter("pacu"); setBookletActivePage(14); }}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${bookletRoleFilter === "pacu" ? "bg-white text-[#1E3A6E]" : "hover:bg-white/10 text-slate-200"}`}
                  >
                    PACU
                  </button>
                </div>
                <button 
                  onClick={() => onClose()} 
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer text-sm font-bold border border-white/20"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Main Master-Detail Split Workspace */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden bg-[#F1F5F9]">
              {/* Left Sidebar Directory (stacks above the page on phones) */}
              <div className="w-full md:w-72 max-h-[32dvh] md:max-h-none bg-[#F8FAFC] border-b md:border-b-0 md:border-r border-[#DDE2EC] flex flex-col flex-shrink-0 text-slate-700 overflow-y-auto text-xs select-none">
                <div className="px-3.5 py-2.5 text-[10.5px] font-bold tracking-wider text-[#1E3A6E] uppercase border-b border-[#DDE2EC] bg-[#E2E8F0]/60">
                  OT Booklet Directory
                </div>

                <div className="p-2 space-y-3">
                  {/* Category 1: Ward & Pre-Op */}
                  <div>
                    <div className="px-2.5 py-1 bg-indigo-50 text-indigo-900 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between border-y border-indigo-100 rounded-md">
                      <span>I. Ward Pre-Op Desk</span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-semibold border border-indigo-200">8 Pages</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {[
                        { num: 1, title: "Demographics & Cover", tag: "Ward", icon: "✓" },
                        { num: 2, title: "PAC Assessment", tag: "PAC", icon: "✓" },
                        { num: 3, title: "Anaesthesia Plan", tag: "PAC", icon: "✓" },
                        { num: 4, title: "Surgery Consent (En)", tag: "Ward", icon: "✓" },
                        { num: 5, title: "Surgery Consent (Te)", tag: "Ward", icon: "✓" },
                        { num: 6, title: "Anaes Consent (En)", tag: "Ward", icon: "✓" },
                        { num: 7, title: "Anaes Consent (Te)", tag: "Ward", icon: "✓" },
                        { num: 9, title: "Pre-Prep 17-Item Form", tag: "Ward", icon: "✓" },
                      ].map((p) => (
                        <button
                          key={p.num}
                          onClick={() => setBookletActivePage(p.num)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11.5px] transition-all cursor-pointer ${
                            bookletActivePage === p.num
                              ? "bg-[#1B4FD8] text-white font-semibold shadow-xs"
                              : "hover:bg-slate-200/70 text-slate-700 font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={`text-[10px] font-mono px-1 rounded ${bookletActivePage === p.num ? "bg-white/20 text-white font-bold" : "bg-slate-200 text-slate-600"}`}>
                              P{p.num < 10 ? `0${p.num}` : p.num}
                            </span>
                            <span className="truncate">{p.title}</span>
                          </div>
                          <span className={`text-[10px] font-bold ml-1 ${bookletActivePage === p.num ? "text-white" : "text-emerald-600"}`}>{p.icon}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 2: OT Nurse & Surgical Suite */}
                  <div>
                    <div className="px-2.5 py-1 bg-amber-50 text-amber-900 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between border-y border-amber-100 rounded-md">
                      <span>II. OT Intra-Op Suite</span>
                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold border border-amber-200">5 Pages</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {[
                        { num: 8, title: "Master 21-Checklist", tag: "OT Nurse", icon: "⚡" },
                        { num: 10, title: "WHO 3-Phase Safety", tag: "OT Nurse", icon: "⚡" },
                        { num: 11, title: "Anaesthesia Intra-Op", tag: "Anaesthetist", icon: "⚡" },
                        { num: 12, title: "Operation Record", tag: "Surgeon", icon: "⚡" },
                        { num: 13, title: "Operation Notes", tag: "Surgeon", icon: "⚡" },
                      ].map((p) => (
                        <button
                          key={p.num}
                          onClick={() => setBookletActivePage(p.num)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11.5px] transition-all cursor-pointer ${
                            bookletActivePage === p.num
                              ? "bg-[#1B4FD8] text-white font-semibold shadow-xs"
                              : "hover:bg-slate-200/70 text-slate-700 font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={`text-[10px] font-mono px-1 rounded ${bookletActivePage === p.num ? "bg-white/20 text-white font-bold" : "bg-slate-200 text-slate-600"}`}>
                              P{p.num < 10 ? `0${p.num}` : p.num}
                            </span>
                            <span className="truncate">{p.title}</span>
                          </div>
                          <span className={`text-[10px] font-bold ml-1 ${bookletActivePage === p.num ? "text-white" : "text-amber-600"}`}>{p.icon}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category 3: PACU Recovery */}
                  <div>
                    <div className="px-2.5 py-1 bg-emerald-50 text-emerald-900 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between border-y border-emerald-100 rounded-md">
                      <span>III. PACU Recovery</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-semibold border border-emerald-200">1 Page</span>
                    </div>
                    <div className="mt-1">
                      {[
                        { num: 14, title: "Aldrete & Ward Transfer", tag: "PACU", icon: "🏥" },
                      ].map((p) => (
                        <button
                          key={p.num}
                          onClick={() => setBookletActivePage(p.num)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[11.5px] transition-all cursor-pointer ${
                            bookletActivePage === p.num
                              ? "bg-[#1B4FD8] text-white font-semibold shadow-xs"
                              : "hover:bg-slate-200/70 text-slate-700 font-medium"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={`text-[10px] font-mono px-1 rounded ${bookletActivePage === p.num ? "bg-white/20 text-white font-bold" : "bg-[#F8FAFC] text-slate-600"}`}>
                              P{p.num}
                            </span>
                            <span className="truncate">{p.title}</span>
                          </div>
                          <span className={`text-[10px] font-bold ml-1 ${bookletActivePage === p.num ? "text-white" : "text-blue-600"}`}>{p.icon}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-auto p-3 border-t border-[#DDE2EC] text-[10.5px] text-slate-600 bg-[#E2E8F0]/40 space-y-1">
                  <div className="flex justify-between">
                    <span>Synchronized:</span>
                    <span className="text-emerald-700 font-semibold">✓ EHR Real-Time</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Audit Trail:</span>
                    <span className="font-mono text-slate-800 font-semibold">#OT-2026-889</span>
                  </div>
                </div>
              </div>

              {/* Right Document Canvas (Digital Sheet Presentation) */}
              <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-5 md:p-6 bg-[#F8FAFC]">
                {/* Official Letterhead Container */}
                <div className="bg-white rounded-lg border border-[#DDE2EC] shadow-xs p-6 space-y-5 max-w-3xl mx-auto min-h-[500px]">
                  
                  {/* Page Header Letterhead */}
                  <div className="border-b border-[#DDE2EC] pb-4 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <span>IMPERIAL HOSPITALS</span>
                        <span className="text-[10px] font-normal text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          Bhimavaram · Andhra Pradesh
                        </span>
                      </h2>
                      <p className="text-[11px] text-[#64748B]">
                        Department of Surgical Services &amp; Anesthesiology
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-slate-800 font-mono">
                        OT BOOKLET PAGE {bookletActivePage} OF 14
                      </div>
                      <div className="text-[10px] text-[#64748B] font-mono">
                        FORM ID: IH-OT-2026-P{bookletActivePage < 10 ? `0${bookletActivePage}` : bookletActivePage}
                      </div>
                    </div>
                  </div>

                  {/* Departmental Data Source Banner */}
                  <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg px-3.5 py-2 flex items-center justify-between text-xs mb-3 shadow-2xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className={`px-2.5 py-0.5 rounded-md font-semibold text-[10px] uppercase tracking-wider border ${
                        bookletActivePage === 1 ? "bg-indigo-50 text-indigo-800 border-indigo-200" :
                        (bookletActivePage === 2 || bookletActivePage === 3) ? "bg-sky-50 text-sky-800 border-sky-200" :
                        (bookletActivePage >= 4 && bookletActivePage <= 7) ? "bg-indigo-50 text-indigo-800 border-indigo-200" :
                        (bookletActivePage === 8 || bookletActivePage === 9) ? "bg-indigo-50 text-indigo-800 border-indigo-200" :
                        (bookletActivePage >= 10 && bookletActivePage <= 12) ? "bg-purple-50 text-purple-800 border-purple-200" :
                        bookletActivePage === 13 ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                      }`}>
                        Source: {
                          bookletActivePage === 1 ? "Ward & Admission Census" :
                          (bookletActivePage === 2 || bookletActivePage === 3) ? "PAC Clinic & Central Lab" :
                          (bookletActivePage >= 4 && bookletActivePage <= 7) ? "Ward Nursing & Patient Consent" :
                          (bookletActivePage === 8 || bookletActivePage === 9) ? "Inpatient Ward Nursing Desk" :
                          (bookletActivePage >= 10 && bookletActivePage <= 12) ? "OT Suite (Scrub & Anaesthesia Desk)" :
                          bookletActivePage === 13 ? "Doctor Portal (Surgeon Notes)" : "PACU Recovery Desk"
                        }
                      </span>
                      <span className="text-slate-600 text-[11px] truncate hidden sm:inline">
                        {
                          (bookletActivePage >= 10 && bookletActivePage <= 12)
                            ? "Live Intra-Op Entry by Operating Room Staff"
                            : "Auto-populated from Department EHR Records"
                        }
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={saveBookletProgress}
                      className="text-[11px] font-semibold text-[#1E3A6E] hover:bg-[#F1F5F9] bg-white px-2.5 py-1 rounded-md border border-[#DDE2EC] cursor-pointer flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      🔄 Sync Dept Data
                    </button>
                  </div>

                  {/* PAGE 1: COVER & DEMOGRAPHICS */}
                  {bookletActivePage === 1 && (
                    <div className="space-y-4">
                      <div className="bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg p-4 text-center space-y-1">
                        <div className="text-xs font-bold tracking-widest text-slate-500 uppercase">
                          Official Medical Record
                        </div>
                        <h3 className="text-base font-bold text-slate-900">
                          OPERATION THEATRE CLINICAL BOOKLET
                        </h3>
                        <p className="text-[11px] text-slate-600">
                          Comprehensive Pre-Operative, Intra-Operative &amp; Recovery Documentation
                        </p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#DDE2EC]">
                          <span className="text-[#64748B] text-[11px] block">Patient Name</span>
                          <strong className="text-slate-900 font-semibold">{activeBookletCase.patientName}</strong>
                        </div>
                        <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#DDE2EC]">
                          <span className="text-[#64748B] text-[11px] block">UMR / MRN</span>
                          <strong className="font-mono text-slate-900">{activeBookletCase.mrn}</strong>
                        </div>
                        <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#DDE2EC]">
                          <span className="text-[#64748B] text-[11px] block">IP Number</span>
                          <strong className="font-mono text-slate-900">{activeBookletCase.ipNo || "IP-884920"}</strong>
                        </div>
                        <div className="bg-[#F8FAFC] p-2.5 rounded border border-[#DDE2EC]">
                          <span className="text-[#64748B] text-[11px] block">Age / Gender</span>
                          <strong className="text-slate-900">{activeBookletCase.age} yrs / {activeBookletCase.gender}</strong>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                        <h4 className="font-semibold text-slate-800 text-xs border-b border-slate-200 pb-1">Surgical Assignment Details</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-slate-800">
                          <div><strong>Proposed Surgery:</strong> {activeBookletCase.procedureName}</div>
                          <div><strong>Specialty:</strong> {activeBookletCase.specialty}</div>
                          <div><strong>Assigned Suite:</strong> {activeBookletCase.orRoom}</div>
                          <div><strong>Primary Surgeon:</strong> Dr. {activeBookletCase.surgeon}</div>
                          <div><strong>Anesthesiologist:</strong> Dr. {activeBookletCase.anesthesiologist}</div>
                          <div><strong>Case Urgency:</strong> <span className="text-slate-900 font-bold">{activeBookletCase.urgency}</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 2: PAC ASSESSMENT */}
                  {bookletActivePage === 2 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 2: Pre-Anaesthetic Assessment (PAC)
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Cleared by PAC Consultant
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-2">
                          <h4 className="font-semibold text-slate-900 border-b border-[#DDE2EC] pb-1">A. Medical History &amp; Habits</h4>
                          <ul className="space-y-1.5 text-slate-700">
                            <li className="flex justify-between"><span>Diabetes Mellitus:</span> <strong>No</strong></li>
                            <li className="flex justify-between"><span>Hypertension:</span> <strong className="text-slate-900">Yes (Controlled)</strong></li>
                            <li className="flex justify-between"><span>Ischaemic Heart Disease:</span> <strong>No</strong></li>
                            <li className="flex justify-between"><span>Known Drug Allergies:</span> <strong className="text-slate-900">None</strong></li>
                            <li className="flex justify-between"><span>Habits (Smoking / Alcohol):</span> <strong>Nil</strong></li>
                            <li className="flex justify-between"><span>Time of Last Meal:</span> <strong className="font-mono">10:00 PM (8h NPO)</strong></li>
                          </ul>
                        </div>

                        <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-2">
                          <h4 className="font-semibold text-slate-900 border-b border-[#DDE2EC] pb-1">B. Airway &amp; ASA Grade</h4>
                          <div className="space-y-1.5 text-slate-700">
                            <div className="flex justify-between"><span>Mallampati Score:</span> <strong className="text-slate-900">Class I</strong></div>
                            <div className="flex justify-between"><span>ASA Physical Status:</span> <strong className="text-slate-900">ASA II</strong></div>
                            <div className="flex justify-between"><span>Thyromental Distance:</span> <strong>&gt; 6.5 cm</strong></div>
                            <div className="flex justify-between"><span>Dentures / Loose Teeth:</span> <strong>None / Normal</strong></div>
                            <div className="flex justify-between"><span>Anaesthesia Planned:</span> <strong className="text-slate-900">General Anaesthesia (GA)</strong></div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-2 text-xs">
                        <h4 className="font-semibold text-slate-900 border-b border-[#DDE2EC] pb-1">C. Laboratory &amp; Diagnostic Investigations</h4>
                        <div className="grid grid-cols-4 gap-3 font-mono text-[11.5px]">
                          <div>Hb%: <strong className="text-slate-900 block">13.2 g/dL</strong></div>
                          <div>Blood Group: <strong className="text-slate-900 block">O Positive</strong></div>
                          <div>Bl. Sugar: <strong className="text-slate-900 block">104 mg/dL</strong></div>
                          <div>S. Creatinine: <strong className="text-slate-900 block">0.9 mg/dL</strong></div>
                          <div>ECG: <strong className="text-slate-900 block">Normal Sinus</strong></div>
                          <div>Chest X-Ray: <strong className="text-slate-900 block">Clear Fields</strong></div>
                          <div>PT / INR: <strong className="text-slate-900 block">12.1s / 1.05</strong></div>
                          <div>2D Echo: <strong className="text-slate-900 block">EF 62% Normal</strong></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 3: ANAESTHESIA PLAN */}
                  {bookletActivePage === 3 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 3: Anaesthesia Plan &amp; Immediate Pre-Op Re-Evaluation
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Verified by Anaesthesiologist
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-3 text-xs">
                        <h4 className="font-semibold text-slate-900 border-b border-[#DDE2EC] pb-1">Preoperative Instructions &amp; Orders</h4>
                        <div className="grid grid-cols-2 gap-3 text-slate-800">
                          <div><strong>Planned Technique:</strong> General Anaesthesia with ETT</div>
                          <div><strong>NPO Orders:</strong> Solids 8h, Clear Liquids 2h</div>
                          <div><strong>Premedication:</strong> Inj. Glycopyrrolate 0.2mg IV, Inj. Ondansetron 4mg IV</div>
                          <div><strong>Blood Products:</strong> 2 Units PRBC Crossmatched in Blood Bank</div>
                          <div><strong>Special Monitoring:</strong> ECG, SpO2, EtCO2, Invasive Arterial BP</div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                        <h4 className="font-semibold text-slate-800 border-b border-slate-200 pb-1">Immediate Preoperative Re-Evaluation (Ward to OT Handoff)</h4>
                        <div className="grid grid-cols-2 gap-2.5 text-slate-800">
                          <div><strong>Surgical Site Marked &amp; Identified:</strong> <span className="text-slate-900 font-bold">✓ Confirmed</span></div>
                          <div><strong>NPO Status Re-Verified:</strong> <span className="text-slate-900 font-bold">✓ 10 Hours NPO</span></div>
                          <div><strong>Pre-Op Re-Eval Vitals:</strong> <span className="font-mono font-semibold">BP 124/82 · HR 74 bpm</span></div>
                          <div><strong>Change of Plan Required:</strong> <span className="text-slate-600">None</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 4 & 5: SURGERY CONSENTS */}
                  {(bookletActivePage === 4 || bookletActivePage === 5) && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page {bookletActivePage}: Informed Consent for Surgery {bookletActivePage === 5 ? "(శస్త్ర చికిత్స అంగీకార పత్రము)" : "(English)"}
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          ✓ Legally Signed &amp; Sealed
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-3 text-xs text-slate-800">
                        {bookletActivePage === 4 ? (
                          <p className="leading-relaxed">
                            <strong>Authorisation of Patient / Representative:</strong> I hereby authorize the performance of the surgery / procedure 
                            <strong className="text-slate-900"> {activeBookletCase.procedureName}</strong> under Dr. <strong>{activeBookletCase.surgeon}</strong>.
                            I have been made aware of the potential risks (bleeding, infection, anesthesia complications, open procedure conversion) and willfully grant consent.
                          </p>
                        ) : (
                          <p className="leading-relaxed font-medium">
                            నేను ఈ క్రింద తెలిపిన శస్త్ర చికిత్స చేయించుకొనుటకు నా పూర్తి అంగీకారమును తెలుపుచున్నాను: 
                            <strong className="text-slate-900"> {activeBookletCase.procedureName}</strong>. 
                            ఈ చికిత్స వల్ల కలుగు ప్రమాదములు మరియు ఫలితముల గూర్చి డాక్టర్ <strong>{activeBookletCase.surgeon}</strong> గారు నాకు వివరించారు.
                          </p>
                        )}

                        <div className="pt-3 border-t border-[#DDE2EC] grid grid-cols-3 gap-3 text-center">
                          <div className="p-2 bg-white rounded border border-[#DDE2EC]">
                            <div className="text-[10px] text-slate-500">Patient / Relative</div>
                            <div className="text-slate-800 font-bold text-xs mt-0.5">✓ Signed</div>
                          </div>
                          <div className="p-2 bg-white rounded border border-[#DDE2EC]">
                            <div className="text-[10px] text-slate-500">Witness</div>
                            <div className="text-slate-800 font-bold text-xs mt-0.5">✓ Signed</div>
                          </div>
                          <div className="p-2 bg-white rounded border border-[#DDE2EC]">
                            <div className="text-[10px] text-slate-500">Lead Surgeon</div>
                            <div className="text-slate-900 font-bold text-xs mt-0.5">Dr. {activeBookletCase.surgeon}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 6 & 7: ANAESTHESIA CONSENTS */}
                  {(bookletActivePage === 6 || bookletActivePage === 7) && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page {bookletActivePage}: Consent for Anaesthesia &amp; Analgesia {bookletActivePage === 7 ? "(అనస్థీషియా అంగీకార పత్రము)" : "(English)"}
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          ✓ Signed &amp; Verified
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-3 text-xs text-slate-800">
                        {bookletActivePage === 6 ? (
                          <p className="leading-relaxed">
                            I give consent for General / Regional Anaesthesia and Post-Operative Analgesia to be administered by Dr. <strong>{activeBookletCase.anesthesiologist}</strong>. Potential risks including sore throat, nausea, and intravascular monitoring lines have been discussed.
                          </p>
                        ) : (
                          <p className="leading-relaxed font-medium">
                            నాకు అనస్థీషియా / మత్తు / నొప్పి నివారణ చికిత్సలు ఇచ్చుటకు డాక్టర్ <strong>{activeBookletCase.anesthesiologist}</strong> గారికి నా పూర్తి సమ్మతిని తెలియజేయుచున్నాను.
                          </p>
                        )}

                        <div className="pt-3 border-t border-[#DDE2EC] flex justify-between items-center text-xs font-semibold text-slate-700">
                          <span>✓ Patient Consent Confirmed</span>
                          <span>✓ Anaesthesiologist Signature Verified</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 8: MASTER 21-ITEM CHECKLIST */}
                  {bookletActivePage === 8 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 8: Check List for Surgery Patients (Master 21-Item Checklist)
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Live OT Nurse Verification
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-1.5">
                          <h4 className="font-bold text-slate-900 text-[11px] border-b border-[#DDE2EC] pb-1">Pre-Operative (1-10)</h4>
                          <ul className="space-y-1 text-slate-700 text-[11px]">
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 1. Blood Products</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 2. Financial Approval</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 3. PAC Completed</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 4. Patient Prep</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 5. Anaesthesia Consent</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 6. Surgery Consent</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 7. High Risk Consent</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 8. Transfusion Consent</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 9. Antibiotic Given</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 10. Pre-Prep Form</label></li>
                          </ul>
                        </div>

                        <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-1.5">
                          <h4 className="font-bold text-slate-900 text-[11px] border-b border-[#DDE2EC] pb-1">Intra-Operative (11-15)</h4>
                          <ul className="space-y-1 text-slate-700 text-[11px]">
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 11. Anaesthesia Notes</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 12. WHO Safety List</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 13. Operation Notes</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 14. Surgeon Notes</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 15. Medication Chart</label></li>
                          </ul>
                        </div>

                        <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#DDE2EC] space-y-1.5">
                          <h4 className="font-bold text-slate-900 text-[11px] border-b border-[#DDE2EC] pb-1">Post-Operative (16-21)</h4>
                          <ul className="space-y-1 text-slate-700 text-[11px]">
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 16. Recovery Eval</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 17. Anaes Record</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 18. Nurse Handover</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 19. Quality Indicators</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 20. Photos/Videos</label></li>
                            <li><label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" defaultChecked className="rounded text-slate-700" /> 21. Radiology Handover</label></li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 9: PRE-PREPARATION FORM */}
                  {bookletActivePage === 9 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 9: Pre-Preparation Form for Operation (17 Ward Items)
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Ward Handover Completed
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-[#F8FAFC] p-4 rounded-lg border border-[#DDE2EC] text-xs">
                        <div>1. Consent: <strong className="text-slate-900">Taken</strong></div>
                        <div>2. G.C.: <strong>Fair</strong></div>
                        <div>3. B.P.: <strong className="font-mono">124/80 mmHg</strong></div>
                        <div>4. Pulse: <strong className="font-mono">76 bpm</strong></div>
                        <div>5. Temp: <strong className="font-mono">98.4 °F</strong></div>
                        <div>6. ID Tag: <strong className="text-slate-900">Verified</strong></div>
                        <div>7. Weight: <strong>68 Kg</strong></div>
                        <div>8. Premedication: <strong>Given</strong></div>
                        <div>9. Ryles Tube: <strong>N/A</strong></div>
                        <div>10. Enema: <strong>Given</strong></div>
                        <div>11. Last Micturition: <strong>06:30 AM</strong></div>
                        <div>12. Last Feed: <strong>10:00 PM</strong></div>
                        <div>13. Nail Polish/Lipstick: <strong>Removed</strong></div>
                        <div>14. Dentures/Jewels: <strong>Removed</strong></div>
                        <div>15. Site Prep/Shave: <strong className="text-slate-900">Done</strong></div>
                        <div>16. X-Ray Reports: <strong>Enclosed</strong></div>
                        <div>17. Lab Reports: <strong>Enclosed</strong></div>
                      </div>

                      <div className="flex justify-between items-center text-xs font-semibold p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-700">
                        <div>Handed Over By: <span className="text-slate-900">RN Pham (Ward)</span></div>
                        <div>Taken Over By: <span className="text-slate-900">RN Murphy (OT Nurse)</span></div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 10: WHO SURGICAL SAFETY CHECKLIST */}
                  {bookletActivePage === 10 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 10: Surgical Safety Check List (WHO 3-Phase Checklist)
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Live OT Safety Check
                        </span>
                      </div>

                      <div className="space-y-3 text-xs">
                        <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={intraOpForm.whoSignIn} 
                            onChange={(e) => setIntraOpForm({...intraOpForm, whoSignIn: e.target.checked})}
                            className="mt-0.5 rounded text-slate-800" 
                          />
                          <div>
                            <span className="font-bold text-slate-900 block mb-0.5">Phase 1: Sign-In (Before Induction of Anaesthesia)</span>
                            <span className="text-slate-700">Patient identity, site, procedure &amp; consent confirmed. Anaesthesia machine &amp; medication check complete. Pulse oximeter on &amp; functioning. Airway &amp; allergy risk assessed.</span>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={intraOpForm.whoTimeOut} 
                            onChange={(e) => setIntraOpForm({...intraOpForm, whoTimeOut: e.target.checked})}
                            className="mt-0.5 rounded text-slate-800" 
                          />
                          <div>
                            <span className="font-bold text-slate-900 block mb-0.5">Phase 2: Time-Out (Before Skin Incision)</span>
                            <span className="text-slate-700">Confirm all team members introduced by name &amp; role. Confirm patient name, procedure &amp; incision site. Antibiotic prophylaxis given within last 60 minutes. Critical steps &amp; imaging reviewed.</span>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={intraOpForm.whoSignOut} 
                            onChange={(e) => setIntraOpForm({...intraOpForm, whoSignOut: e.target.checked})}
                            className="mt-0.5 rounded text-slate-800" 
                          />
                          <div>
                            <span className="font-bold text-slate-900 block mb-0.5">Phase 3: Sign-Out (Before Patient Leaves Operating Room)</span>
                            <span className="text-slate-700">Nurse verbally confirms: Name of procedure recorded, instrument/sponge/needle counts correct, specimen labelled aloud, equipment issues addressed, and recovery key concerns reviewed.</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* PAGE 11: ANAESTHESIA INTRA-OP RECORD */}
                  {bookletActivePage === 11 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 11: Anaesthesia Intra-Op Record &amp; Vitals Grid
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Live Intra-Op Vitals
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-3 text-xs">
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[#64748B] text-[11px] mb-1">BP (mmHg)</label>
                            <input type="text" value={intraOpForm.bp} onChange={(e) => setIntraOpForm({...intraOpForm, bp: e.target.value})} className="w-full border border-[#DDE2EC] rounded px-2.5 py-1.5 bg-white font-mono" />
                          </div>
                          <div>
                            <label className="block text-[#64748B] text-[11px] mb-1">Heart Rate (bpm)</label>
                            <input type="number" value={intraOpForm.hr} onChange={(e) => setIntraOpForm({...intraOpForm, hr: parseInt(e.target.value) || 72})} className="w-full border border-[#DDE2EC] rounded px-2.5 py-1.5 bg-white font-mono" />
                          </div>
                          <div>
                            <label className="block text-[#64748B] text-[11px] mb-1">SpO2 (%)</label>
                            <input type="number" value={intraOpForm.spo2} onChange={(e) => setIntraOpForm({...intraOpForm, spo2: parseInt(e.target.value) || 99})} className="w-full border border-[#DDE2EC] rounded px-2.5 py-1.5 bg-white font-mono" />
                          </div>
                          <div>
                            <label className="block text-[#64748B] text-[11px] mb-1">EtCO2 (mmHg)</label>
                            <input type="number" value={intraOpForm.etco2} onChange={(e) => setIntraOpForm({...intraOpForm, etco2: parseInt(e.target.value) || 35})} className="w-full border border-[#DDE2EC] rounded px-2.5 py-1.5 bg-white font-mono" />
                          </div>
                        </div>

                        <div className="bg-white p-3 rounded-lg border border-[#DDE2EC] space-y-1 font-mono text-[11.5px] text-slate-800">
                          <div className="text-slate-500 text-[10.5px] font-sans font-bold mb-1">INTRA-OPERATIVE DRUG LOG</div>
                          <div>08:30 AM — Induction: Propofol 140mg IV + Fentanyl 100mcg IV + Atracurium 35mg IV</div>
                          <div>09:00 AM — Maintenance: Sevoflurane 2.0% in O2/Air · BP {intraOpForm.bp} · HR {intraOpForm.hr} · SpO2 {intraOpForm.spo2}%</div>
                          <div>10:00 AM — Reversal: Neostigmine 2.5mg + Glycopyrrolate 0.5mg IV · Smooth Extubation</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 12: OPERATION RECORD */}
                  {bookletActivePage === 12 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 12: Operation Record (Surgeon &amp; Surgical Nurse Form)
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Surgical Nurse Verification
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-3 text-xs">
                        <div className="grid grid-cols-3 gap-3">
                          <label className="flex items-center gap-2 p-2.5 bg-white border border-[#DDE2EC] rounded-lg font-bold text-xs cursor-pointer">
                            <input type="checkbox" checked={intraOpForm.swabCount} onChange={(e) => setIntraOpForm({...intraOpForm, swabCount: e.target.checked})} className="rounded text-slate-800" />
                            <span>✓ Swab Count Correct</span>
                          </label>
                          <label className="flex items-center gap-2 p-2.5 bg-white border border-[#DDE2EC] rounded-lg font-bold text-xs cursor-pointer">
                            <input type="checkbox" checked={intraOpForm.needleCount} onChange={(e) => setIntraOpForm({...intraOpForm, needleCount: e.target.checked})} className="rounded text-slate-800" />
                            <span>✓ Needle Count Correct</span>
                          </label>
                          <label className="flex items-center gap-2 p-2.5 bg-white border border-[#DDE2EC] rounded-lg font-bold text-xs cursor-pointer">
                            <input type="checkbox" checked={intraOpForm.instrumentCount} onChange={(e) => setIntraOpForm({...intraOpForm, instrumentCount: e.target.checked})} className="rounded text-slate-800" />
                            <span>✓ Instrument Count Correct</span>
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-slate-700 font-semibold mb-1">Estimated Blood Loss (ml)</label>
                            <input 
                              type="number" 
                              value={intraOpForm.bloodLossMl} 
                              onChange={(e) => setIntraOpForm({...intraOpForm, bloodLossMl: parseInt(e.target.value) || 0})} 
                              className="w-full border border-[#DDE2EC] rounded p-2 bg-white font-mono font-bold" 
                            />
                          </div>
                          <div>
                            <label className="block text-slate-700 font-semibold mb-1">Sutures &amp; Staples Used</label>
                            <input 
                              type="text" 
                              value={intraOpForm.suturesUsed} 
                              onChange={(e) => setIntraOpForm({...intraOpForm, suturesUsed: e.target.value})} 
                              className="w-full border border-[#DDE2EC] rounded p-2 bg-white" 
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-slate-700 font-semibold mb-1">Operative Findings &amp; Procedure Executed</label>
                          <textarea 
                            rows={3} 
                            value={intraOpForm.operativeNotes} 
                            onChange={(e) => setIntraOpForm({...intraOpForm, operativeNotes: e.target.value})} 
                            className="w-full border border-[#DDE2EC] rounded p-2.5 bg-white"
                          ></textarea>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 13: OPERATION NOTES */}
                  {bookletActivePage === 13 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 13: Operation Notes (Contd...) &amp; Post-Op Orders
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          Surgeon Post-Op Orders
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-3 text-xs">
                        <div>
                          <label className="block font-semibold text-slate-900 mb-1">Surgeon Detailed Operative Summary</label>
                          <textarea 
                            rows={3}
                            defaultValue="Gallbladder dissected cleanly from hepatic bed. Cystic duct and artery double ligated with clips. Hemostasis achieved. Specimen retrieved in endo-bag and sent for histopathology."
                            className="w-full border border-[#DDE2EC] rounded p-2.5 bg-white"
                          ></textarea>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-900 mb-1">Post-Operative Nursing Instructions</label>
                          <textarea 
                            rows={2.5}
                            defaultValue="1. NPO for 4 hours. 2. Monitor vitals q15m x 1h then q30m x 2h. 3. Inj. Paracetamol 1g IV TDS for pain relief. 4. Inspect abdominal dressing for soakage."
                            className="w-full border border-[#DDE2EC] rounded p-2.5 bg-white"
                          ></textarea>
                        </div>
                        <div className="text-right text-slate-800 font-bold pt-1 border-t border-[#DDE2EC]">
                          Surgeon Signature: Dr. {activeBookletCase.surgeon}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PAGE 14: ALDRETE & PACU RECOVERY */}
                  {bookletActivePage === 14 && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-[#DDE2EC] pb-2">
                        <h3 className="font-bold text-sm text-slate-900">
                          Page 14: Recovery Evaluation &amp; Modified Aldrete Score
                        </h3>
                        <span className="text-[10.5px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                          PACU Discharge Clearance
                        </span>
                      </div>

                      <div className="p-4 bg-[#F8FAFC] border border-[#DDE2EC] rounded-lg space-y-4 text-xs">
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-[#DDE2EC]">
                          <div>
                            <span className="font-bold text-slate-900 text-xs block">Modified Aldrete Recovery Score</span>
                            <span className="text-[11px] text-slate-500">Threshold for Ward Transfer: $\ge 9 / 10$</span>
                          </div>
                          <span className={`px-3 py-1 text-white font-mono font-bold text-sm rounded-lg shadow-xs ${calculateTotalAldrete() >= 9 ? "bg-slate-800" : "bg-slate-700"}`}>
                            {calculateTotalAldrete()} / 10
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                            <label className="block text-slate-800 font-semibold mb-1">1. Activity (0-2)</label>
                            <select value={intraOpForm.aldreteActivity} onChange={(e) => setIntraOpForm({...intraOpForm, aldreteActivity: parseInt(e.target.value)})} className="w-full border border-[#DDE2EC] rounded p-1.5 bg-white">
                              <option value={2}>2 - Moves 4 extremities voluntarily</option>
                              <option value={1}>1 - Moves 2 extremities voluntarily</option>
                              <option value={0}>0 - Moves 0 extremities</option>
                            </select>
                          </div>

                          <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                            <label className="block text-slate-800 font-semibold mb-1">2. Respiration (0-2)</label>
                            <select value={intraOpForm.aldreteRespiration} onChange={(e) => setIntraOpForm({...intraOpForm, aldreteRespiration: parseInt(e.target.value)})} className="w-full border border-[#DDE2EC] rounded p-1.5 bg-white">
                              <option value={2}>2 - Deep breath &amp; cough freely</option>
                              <option value={1}>1 - Dyspneic or limited breathing</option>
                              <option value={0}>0 - Apneic</option>
                            </select>
                          </div>

                          <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                            <label className="block text-slate-800 font-semibold mb-1">3. Circulation / BP (0-2)</label>
                            <select value={intraOpForm.aldreteCirculation} onChange={(e) => setIntraOpForm({...intraOpForm, aldreteCirculation: parseInt(e.target.value)})} className="w-full border border-[#DDE2EC] rounded p-1.5 bg-white">
                              <option value={2}>2 - BP ± 20 mm Hg of preanesthetic level</option>
                              <option value={1}>1 - BP ± 20-50 mm Hg of preanesthetic level</option>
                              <option value={0}>0 - BP ± 50 mm Hg of preanesthetic level</option>
                            </select>
                          </div>

                          <div className="bg-white p-3 rounded-lg border border-[#DDE2EC]">
                            <label className="block text-slate-800 font-semibold mb-1">4. Consciousness (0-2)</label>
                            <select value={intraOpForm.aldreteConsciousness} onChange={(e) => setIntraOpForm({...intraOpForm, aldreteConsciousness: parseInt(e.target.value)})} className="w-full border border-[#DDE2EC] rounded p-1.5 bg-white">
                              <option value={2}>2 - Fully awake &amp; oriented</option>
                              <option value={1}>1 - Arousable on calling</option>
                              <option value={0}>0 - Unresponsive</option>
                            </select>
                          </div>
                        </div>

                        <div className="p-3 bg-white rounded-lg border border-[#DDE2EC] flex justify-between items-center">
                          <span className={`font-bold ${calculateTotalAldrete() >= 9 ? "text-slate-800" : "text-slate-600"}`}>
                            {calculateTotalAldrete() >= 9 ? "✓ Aldrete Target Met (≥9). Patient cleared for Ward Transfer." : "⚠️ Patient score < 9. Must remain in PACU."}
                          </span>
                          {calculateTotalAldrete() >= 9 && (
                            <Btn size="sm" variant="primary" onClick={() => {
                              handleUpdateStatus(activeBookletCase.id, "Completed");
                              onClose();
                            }}>
                              Authorize Ward Transfer ➔
                            </Btn>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>

            {/* Modal Bottom Action Footer */}
            <div className="bg-white border-t border-[#DDE2EC] px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Btn 
                  variant="outline" 
                  size="xs" 
                  onClick={() => setBookletActivePage(Math.max(1, bookletActivePage - 1))}
                  disabled={bookletActivePage === 1}
                >
                  ◀ Previous Page
                </Btn>
                <span className="text-xs font-mono text-slate-500 px-2">
                  Page {bookletActivePage} / 14
                </span>
                <Btn 
                  variant="outline" 
                  size="xs" 
                  onClick={() => setBookletActivePage(Math.min(14, bookletActivePage + 1))}
                  disabled={bookletActivePage === 14}
                >
                  Next Page ▶
                </Btn>
              </div>

              <div className="flex items-center gap-2">
                <Btn variant="outline" size="xs" onClick={saveBookletProgress}>
                  💾 Save Progress
                </Btn>
                <Btn variant="primary" size="xs" onClick={() => onClose()}>
                  Close Booklet
                </Btn>
              </div>
            </div>
          </div>
        </div>

  );
};
