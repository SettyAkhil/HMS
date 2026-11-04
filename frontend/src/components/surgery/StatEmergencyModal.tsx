import React, { useState } from "react";
import { toast } from "react-hot-toast";
import { Btn } from "../shared";
import { SurgeryDatabase, SurgicalCase } from "../../services/surgeryDb";

interface StatEmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (createdCase: SurgicalCase) => void;
}

export const StatEmergencyModal: React.FC<StatEmergencyModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [targetSuite, setTargetSuite] = useState("OR 4");
  const [patientName, setPatientName] = useState("Trauma / Acute STAT Patient");
  const [age, setAge] = useState("35");
  const [gender, setGender] = useState<"Male" | "Female" | "Other">("Male");
  const [procedureName, setProcedureName] = useState("Emergency Exploratory Laparotomy / Hemostasis");
  const [specialty, setSpecialty] = useState("General Surgery");
  const [primarySurgeon, setPrimarySurgeon] = useState("Dr. Chen");
  const [anesthesiologist, setAnesthesiologist] = useState("Dr. Rodriguez");
  const [urgencyReason, setUrgencyReason] = useState("Massive intra-abdominal hemorrhage / Polytrauma Code Red");
  const [bloodRequired, setBloodRequired] = useState("4 Units O-Neg PRBC requested STAT");
  const [bypassPac, setBypassPac] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirmStat = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const newCase = await SurgeryDatabase.createCase({
        patientId: `P-STAT-${randomNum}`,
        patientName: patientName.trim() || "Emergency Patient",
        mrn: `UMR-STAT-${randomNum}`,
        ipNo: `IP-STAT-${randomNum}`,
        age: parseInt(age) || 35,
        gender: gender as any,
        surgeon: primarySurgeon,
        anesthesiologist: anesthesiologist,
        scrubNurse: "RN Murphy (STAT Scrub)",
        circulatingNurse: "RN Davis (Emergency Lead)",
        cptCode: "49000",
        icd10Code: "S36.9XXA",
        procedureName: procedureName.trim() || "Emergency Exploratory Laparotomy",
        specialty: specialty,
        orRoom: targetSuite,
        scheduledTime: "IMMEDIATE STAT",
        durationEst: "180 mins",
        urgency: "Emergency STAT",
        insuranceProvider: "Emergency Trauma Pool",
        totalAmount: 75000,
        status: bypassPac ? "Pre-Op Holding" : "PAC Pending",
        currentTelemetry: {
          id: `tel-${Date.now()}`,
          timestamp: new Date().toISOString(),
          hr: 118,
          bpSys: 90,
          bpDia: 55,
          map: 67,
          spo2: 94,
          etco2: 32,
          temp: 36.1,
          respRate: 26,
          anestheticAgent: "Sevoflurane",
          agentConcentration: "1.8%",
          peep: 5,
          tidalVolume: 480,
        },
      });

      toast.success(`Emergency STAT OT reserved for ${patientName} in ${targetSuite}!`);
      if (onSuccess) onSuccess(newCase);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to reserve STAT OT.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-none shadow-2xl w-full max-w-xl overflow-hidden border border-rose-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-linear-to-r from-red-600 via-rose-600 to-red-700 text-white px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-none bg-white/20 flex items-center justify-center text-lg animate-pulse">
              🚨
            </span>
            <div>
              <h3 className="font-bold text-base tracking-wide flex items-center gap-2">
                Emergency STAT OT Reservation
                <span className="text-[10px] bg-white text-red-700 px-2 py-0.5 rounded-none font-black tracking-widest uppercase">
                  Code Red
                </span>
              </h3>
              <p className="text-[11px] text-red-100">
                Immediate suite override &amp; OT rapid response team dispatch
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-none bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleConfirmStat} className="p-5 space-y-3.5 text-xs max-h-[80vh] overflow-y-auto">
          <div className="p-3 bg-red-50 border border-red-200 rounded-none text-red-900 leading-relaxed text-[11.5px] flex items-start gap-2.5">
            <span className="text-red-600 text-base shrink-0 mt-0.5">⚠️</span>
            <div>
              <strong className="font-semibold block text-red-800">Hospital Critical Alert:</strong>
              STAT reservation instantly assigns the selected Operating Suite, notifies the Anesthesiologist-on-call, alerts Central Sterile Supply (CSSD), and initiates Rapid Sequence Induction readiness.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Target Operating Suite <span className="text-red-500">*</span>
              </label>
              <select
                value={targetSuite}
                onChange={(e) => setTargetSuite(e.target.value)}
                className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 bg-white font-semibold text-slate-900 focus:border-red-500 focus:ring-1 focus:ring-red-500"
              >
                <option value="OR 4">OR 4 (Dedicated Trauma / Emergency STAT)</option>
                <option value="OR 2">OR 2 (General Emergency Clean Suite)</option>
                <option value="OR 1">OR 1 (Cardiac / Vascular Emergency)</option>
                <option value="OR 3">OR 3 (Orthopedic / Neuro Emergency)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Surgical Specialty</label>
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 bg-white text-slate-900 focus:border-red-500"
              >
                <option value="General Surgery">General Surgery</option>
                <option value="Trauma & Orthopedics">Trauma & Orthopedics</option>
                <option value="Vascular Surgery">Vascular Surgery</option>
                <option value="Neurosurgery">Neurosurgery</option>
                <option value="Cardiothoracic">Cardiothoracic</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Emergency Procedure Proposed <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={procedureName}
              onChange={(e) => setProcedureName(e.target.value)}
              className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 text-slate-900 focus:border-red-500 font-medium"
              placeholder="e.g. Exploratory Laparotomy / Splenectomy STAT"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1 sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Patient Name / Identifier</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 text-slate-900 focus:border-red-500"
                placeholder="Name or Unknown Trauma John Doe"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Age &amp; Gender</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-16 border border-slate-300 rounded-none px-2 py-1.5 text-slate-900"
                  placeholder="35"
                />
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="flex-1 border border-slate-300 rounded-none px-1.5 py-1.5 bg-white text-slate-900"
                >
                  <option value="Male">M</option>
                  <option value="Female">F</option>
                  <option value="Other">O</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Lead On-Call Surgeon</label>
              <select
                value={primarySurgeon}
                onChange={(e) => setPrimarySurgeon(e.target.value)}
                className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 bg-white text-slate-900 font-medium"
              >
                <option value="Dr. Chen">Dr. Chen (General & Trauma)</option>
                <option value="Dr. Adams">Dr. Adams (Orthopedic Trauma)</option>
                <option value="Dr. Rodriguez">Dr. Rodriguez (Vascular/Cardiac)</option>
                <option value="Dr. Gupta">Dr. Gupta (Neurotrauma)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Anesthesiologist On-Call</label>
              <select
                value={anesthesiologist}
                onChange={(e) => setAnesthesiologist(e.target.value)}
                className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 bg-white text-slate-900 font-medium"
              >
                <option value="Dr. Rodriguez">Dr. Rodriguez (STAT Lead)</option>
                <option value="Dr. Patel">Dr. Patel (Cardiac Anesthesia)</option>
                <option value="Dr. Vance">Dr. Vance (Neuro Anesthesia)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Clinical Indication &amp; Nature of Trauma</label>
            <textarea
              rows={2}
              value={urgencyReason}
              onChange={(e) => setUrgencyReason(e.target.value)}
              className="w-full border border-slate-300 rounded-none p-2 text-slate-900 focus:border-red-500 text-xs"
              placeholder="e.g. Hemodynamically unstable, penetrating chest trauma, FAST positive"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Blood Bank / Transfusion STAT Requisition</label>
            <input
              type="text"
              value={bloodRequired}
              onChange={(e) => setBloodRequired(e.target.value)}
              className="w-full border border-slate-300 rounded-none px-2.5 py-1.5 text-slate-900 focus:border-red-500 font-mono text-[11px]"
              placeholder="e.g. 4 Units O-Neg PRBC + 4 FFP + 1 Platelet Pack"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-none p-2.5 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900">Bypass Elective PAC Clearance</div>
              <div className="text-[11px] text-slate-500">
                Move directly to Pre-Op Holding with Emergency Anesthetic Clearance recorded
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={bypassPac}
                onChange={(e) => setBypassPac(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Btn variant="outline" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Btn>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-none shadow-sm flex items-center gap-1.5 cursor-pointer text-xs transition-colors"
            >
              <span>🚨</span>
              <span>{isSubmitting ? "Dispatching..." : "Confirm STAT Reservation & Dispatch OT"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
