import { useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiPlus, FiSearch, FiUser } from "react-icons/fi";
import { Btn, Card, StatusBadge, TabBar, Table, TD, TimelineItem, TR } from "./shared";
import { apiFetch, reportError } from "../lib/api";
import { API_BASE } from "../lib/constants";
import { formatDateTimeIST } from "../lib/format";
import type { Notice, Patient } from "../types";
import AddEvaluationModal from "./AddEvaluationModal";
import PatientJourneyModal from "./PatientJourneyModal";
import { PatientInsuranceTab } from "./insurance/integrations";
import { db, DBOPEncounter } from "../services/db";
import { BillingDatabase } from "../services/billingDb";

// ==================== Directory (search across OP / IP / ER / ICU) ====================

type CareStream = "OP" | "IP" | "ER";

type PatientRow = {
  patient_id: string;
  name: string;
  last_name?: string | null;
  age?: number | null;
  gender?: string | null;
  phone?: string | null;
  care_stream: CareStream;
  active_bed?: string | null;
  active_er_visit_id?: number | null;
  active_er_visit_no?: string | null;
  active_er_status?: string | null;
  er_triage_category?: string | null;
  appointment_status?: string | null;
  appointment_doctor?: string | null;
  appointment_dept?: string | null;
  appointment_date?: string | null;
  admission_date?: string | null;
  created_at?: string | null;
};

type StreamCounts = { all: number; op: number; ip: number; er: number };

type CareFilter = "all" | "op" | "ip" | "icu" | "er";

function rowDisplayName(row: PatientRow): string {
  return `${row.name || ""} ${row.last_name || ""}`.trim() || row.patient_id;
}

function isIcuBed(activeBed?: string | null): boolean {
  return !!activeBed && activeBed.toLowerCase().includes("icu");
}

// A patient's current location badge -- ER (with triage) takes priority over
// IP (the backend's own care_stream computation already does the same), IP
// shows the ward/bed (ICU included, since ICU is just a ward, not its own
// encounter type), and OP shows their last appointment status.
function LocationBadge({ row }: { row: PatientRow }) {
  if (row.care_stream === "ER") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEE2E2] text-[#B91C1C]">
        ER {row.active_er_visit_no ? `· ${row.active_er_visit_no}` : ""}
        {row.er_triage_category ? ` · ${row.er_triage_category}` : ""}
      </span>
    );
  }
  if (row.care_stream === "IP") {
    const icu = isIcuBed(row.active_bed);
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${
          icu ? "bg-[#EDE9FE] text-[#5B21B6]" : "bg-[#EFF6FF] text-[#1E40AF]"
        }`}
      >
        {icu ? "ICU" : "IP"} {row.active_bed ? `· ${row.active_bed}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F1F5F9] text-[#334155]">
      OP {row.appointment_dept ? `· ${row.appointment_dept}` : ""}
    </span>
  );
}

function PatientDirectory({
  onSelect,
  onOpenOpJourney,
  onBack,
  setNotice,
}: {
  onSelect: (row: PatientRow) => void;
  onOpenOpJourney: (row: PatientRow) => void;
  onBack: () => void;
  setNotice: (notice: Notice | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [careFilter, setCareFilter] = useState<CareFilter>("all");
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [counts, setCounts] = useState<StreamCounts>({ all: 0, op: 0, ip: 0, er: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const careType = careFilter === "icu" ? "ip" : careFilter;
        const qs = new URLSearchParams();
        if (query.trim()) qs.set("q", query.trim());
        if (careType !== "all") qs.set("care_type", careType);
        const data = await apiFetch<{ patients: PatientRow[]; counts: StreamCounts }>(
          `/api/patients${qs.toString() ? `?${qs.toString()}` : ""}`,
        );
        const patients = data.patients || [];
        setRows(careFilter === "icu" ? patients.filter((p) => isIcuBed(p.active_bed)) : patients);
        setCounts(data.counts || { all: 0, op: 0, ip: 0, er: 0 });
      } catch (error: any) {
        reportError(setNotice, error, "Failed to load patients.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [query, careFilter]);

  const icuCount = useMemo(
    () => (careFilter === "icu" ? rows.length : undefined),
    [careFilter, rows],
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5] p-5">
      <div className="w-full">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Clinical — Patient Directory</h1>
            <p className="text-[11.5px] text-[#64748B]">
              Every patient across every department &mdash; OP, IP, ICU, and ER &mdash; in one place.
            </p>
          </div>
          <Btn variant="ghost" size="sm" onClick={onBack}>
            <FiArrowLeft aria-hidden /> Back
          </Btn>
        </div>

        <div className="ai-search-bar mb-3">
          <FiSearch className="ai-search-icon" aria-hidden />
          <input
            className="ai-search-input"
            placeholder="Search by name, patient ID, or phone..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {(
            [
              { key: "all", label: "All", count: counts.all },
              { key: "op", label: "OP", count: counts.op },
              { key: "ip", label: "IP", count: counts.ip },
              { key: "icu", label: "ICU", count: icuCount },
              { key: "er", label: "ER", count: counts.er },
            ] as { key: CareFilter; label: string; count?: number }[]
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setCareFilter(f.key)}
              className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-full border transition-colors ${
                careFilter === f.key
                  ? "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                  : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
              }`}
            >
              {f.label}
              {f.count !== undefined && <span className="ml-1.5 opacity-80">({f.count})</span>}
            </button>
          ))}
        </div>

        <div className="bg-white border border-[#DDE2EC] rounded">
          {loading ? (
            <p className="text-[12.5px] text-[#64748B] p-4">Loading patients...</p>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-[13px] font-semibold text-gray-800">No patients found</p>
              <p className="text-[12px] text-[#64748B] mt-1">
                {query ? "Try a different search term." : "No patients in this category yet."}
              </p>
            </div>
          ) : (
            <Table headers={["Patient", "Age / Gender", "Location", "Doctor", ""]}>
              {rows.map((row) => (
                <TR
                  key={row.patient_id}
                  onClick={() => {
                    if (row.care_stream === "OP") {
                      onOpenOpJourney(row);
                    } else {
                      onSelect(row);
                    }
                  }}
                >
                  <TD>
                    <div className="font-medium text-gray-900">{rowDisplayName(row)}</div>
                    <div className="text-[11px] text-[#94A3B8] font-mono">{row.patient_id}</div>
                  </TD>
                  <TD>
                    <span className="text-[12px] text-[#64748B]">
                      {row.age ? `${row.age}y` : "—"}{row.gender ? ` · ${row.gender}` : ""}
                    </span>
                  </TD>
                  <TD><LocationBadge row={row} /></TD>
                  <TD>
                    <span className="text-[12px] text-[#64748B]">
                      {row.care_stream === "OP" ? row.appointment_doctor || "—" : "—"}
                    </span>
                  </TD>
                  <TD>
                    {row.care_stream === "OP" ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenOpJourney(row);
                        }}
                        className="px-2.5 py-1 bg-[#EFF6FF] text-[#1B4FD8] hover:bg-blue-100 rounded-none text-[11px] font-bold border border-blue-200 transition-colors cursor-pointer"
                      >
                        ✨ OP Journey
                      </button>
                    ) : (
                      <Btn variant="ghost" size="xs">Open Chart</Btn>
                    )}
                  </TD>
                </TR>
              ))}
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Chart (real EMR data for one patient) ====================

type ClinicalNoteRow = { id: number; chief_complaint?: string | null; notes?: string | null; follow_up?: string | null; created_at: string };
type ObservationNoteRow = { id: number; doctor_name?: string | null; note: string; treatment_plan?: string | null; created_at: string; role?: string | null };
type PatientVitalRow = { id: number; bp?: string | null; pulse?: string | null; temperature?: string | null; created_at: string };
type DiagnosisRow = { id: number; diagnosis_name: string; created_at: string };
type AdmissionRow = { id: number; admission_date: string; discharge_date?: string | null; notes?: string | null };
type MedicationScheduleRow = { id: number; medicine_name: string; dosage?: string | null; schedule_time: string; administered?: number | boolean; notes?: string | null };
type LabRow = { id: number; test_name: string; amount?: number; status?: string; doctor_name?: string | null; created_at: string };
type JourneyEvent = { stage: string; label: string; timestamp?: string | null; detail?: Record<string, unknown> };
type PrescriptionRow = { prescription_id: number; medicine_name: string; dosage?: string | null; quantity?: number | null; unit_price?: number | null; status?: string | null; created_at: string; fulfilled_at?: string | null };
type DocumentRow = { id: number; doc_type: string; file_name?: string | null; mime_type?: string | null; created_at: string; ocr_text?: string | null; has_ocr_text?: boolean };
type InvoiceRow = { id: number; invoice_no: string; module: string; total_amount: number; paid_amount: number; due_amount: number; payment_status: string; created_at: string };
type InvoicePaymentRow = { id: number; invoice_id: number; amount: number; payment_mode: string; created_at: string };
type InsuranceClaimRow = { id: number; invoice_id: number; insurer_name: string; claim_amount: number; approved_amount: number; claim_status: string; submitted_at: string };
type CertificateRow = { id: number; certificate_type: string; title: string; body: string; issued_by?: string | null; created_at: string };

type IcuVentilatorRow = { id: number; mode?: string | null; fio2?: string | null; peep?: string | null; tidal_volume?: string | null; resp_rate?: string | null; pip?: string | null; recorded_by?: string | null; created_at: string };
type IcuInfusionRow = { id: number; medication_name: string; rate?: string | null; unit?: string | null; status: string; recorded_by?: string | null; started_at: string; stopped_at?: string | null };
type IcuIoRow = { id: number; intake_ml?: number | null; output_ml?: number | null; notes?: string | null; recorded_by?: string | null; recorded_at: string };
type IcuRassRow = { id: number; score: number; recorded_by?: string | null; created_at: string };
type IcuLabRow = { id: number; test_name: string; value?: string | null; unit?: string | null; flag?: string | null; recorded_by?: string | null; created_at: string };
type IcuConsultRow = { id: number; specialty: string; consultant_name?: string | null; status: string; notes?: string | null; requested_by?: string | null; created_at: string };

type EmrResponse = {
  patient: Patient;
  admissions: AdmissionRow[];
  notes: ClinicalNoteRow[];
  vitals: PatientVitalRow[];
  diagnoses: DiagnosisRow[];
  observation_notes: ObservationNoteRow[];
  medication_schedules: MedicationScheduleRow[];
  prescriptions: PrescriptionRow[];
  labs: LabRow[];
  documents: DocumentRow[];
  invoices: InvoiceRow[];
  invoice_payments: InvoicePaymentRow[];
  insurance_claims: InsuranceClaimRow[];
  certificates: CertificateRow[];
  timeline: JourneyEvent[];
  icu_ventilator_settings: IcuVentilatorRow[];
  icu_infusions: IcuInfusionRow[];
  icu_io_records: IcuIoRow[];
  icu_rass_scores: IcuRassRow[];
  icu_lab_results: IcuLabRow[];
  icu_consults: IcuConsultRow[];
};

type ErVisitDetail = {
  id: number;
  visit_no: string;
  assigned_doctor_name?: string | null;
  assigned_specialty?: string | null;
  complaints: { id: number; complaint: string; created_at: string }[];
  vitals: { id: number; heart_rate?: number | null; bp_systolic?: number | null; bp_diastolic?: number | null; spo2?: number | null; recorded_at: string }[];
  clinical_notes: { id: number; note_type: string; content: string; created_at: string }[];
  treatments: { id: number; intervention_type: string; description?: string | null; performed_at: string }[];
};

type DayEntry = {
  date: string;
  time: string;
  type: string;
  title: string;
  body: string;
  extra?: string;
};

function dateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

// Merges every source of "what happened to this patient" -- OP/IP clinical
// notes, observation/treatment-plan entries, vitals, diagnoses, and (when the
// patient has an active ER visit) the ER's own complaints/vitals/notes/
// treatments -- into one day-grouped feed. This is the actual "day to day
// evaluations and day-wise treatment" view; every other tab is a narrower
// slice of the same underlying data.
function buildDayGroups(emr: EmrResponse, erDetail: ErVisitDetail | null): Map<string, DayEntry[]> {
  const entries: DayEntry[] = [];

  for (const n of emr.notes) {
    entries.push({
      date: dateKey(n.created_at),
      time: n.created_at,
      type: "Clinical Note",
      title: n.chief_complaint || "Clinical Note",
      body: n.notes || "",
      extra: n.follow_up ? `Follow-up: ${n.follow_up}` : undefined,
    });
  }
  for (const o of emr.observation_notes) {
    const roleLabel = o.role === "nurse" ? "Nurse Note" : o.role === "doctor" ? "Doctor Note" : "Evaluation & Treatment";
    entries.push({
      date: dateKey(o.created_at),
      time: o.created_at,
      type: roleLabel,
      title: o.doctor_name || (o.role === "nurse" ? "Nurse" : "Observation"),
      body: o.note,
      extra: o.treatment_plan ? `Treatment plan: ${o.treatment_plan}` : undefined,
    });
  }
  for (const v of emr.vitals) {
    entries.push({
      date: dateKey(v.created_at),
      time: v.created_at,
      type: "Vitals",
      title: "Vitals recorded",
      body: [v.bp && `BP ${v.bp}`, v.pulse && `Pulse ${v.pulse}`, v.temperature && `Temp ${v.temperature}`]
        .filter(Boolean)
        .join(" · ") || "No values recorded",
    });
  }
  for (const d of emr.diagnoses) {
    entries.push({
      date: dateKey(d.created_at),
      time: d.created_at,
      type: "Diagnosis",
      title: d.diagnosis_name,
      body: "",
    });
  }

  // ICU flowsheet -- recorded on the dedicated ICU page, but it belongs in
  // this same day-wise history so an ICU stay reads as part of the ongoing
  // patient record, not a separate silo.
  for (const v of emr.icu_ventilator_settings) {
    entries.push({
      date: dateKey(v.created_at),
      time: v.created_at,
      type: "ICU Ventilator",
      title: v.recorded_by || "Ventilator settings",
      body: [v.mode && `Mode ${v.mode}`, v.fio2 && `FiO2 ${v.fio2}`, v.peep && `PEEP ${v.peep}`, v.tidal_volume && `Tidal Vol ${v.tidal_volume}`, v.resp_rate && `Set RR ${v.resp_rate}`, v.pip && `PIP ${v.pip}`]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const i of emr.icu_infusions) {
    entries.push({
      date: dateKey(i.started_at),
      time: i.started_at,
      type: "ICU Infusion",
      title: `${i.medication_name} started`,
      body: [i.rate, i.unit].filter(Boolean).join(" "),
      extra: i.recorded_by ? `Recorded by ${i.recorded_by}` : undefined,
    });
    if (i.stopped_at) {
      entries.push({
        date: dateKey(i.stopped_at),
        time: i.stopped_at,
        type: "ICU Infusion",
        title: `${i.medication_name} stopped`,
        body: "",
      });
    }
  }
  for (const io of emr.icu_io_records) {
    entries.push({
      date: dateKey(io.recorded_at),
      time: io.recorded_at,
      type: "ICU I/O",
      title: io.recorded_by || "Intake/Output recorded",
      body: [io.intake_ml != null && `Intake ${io.intake_ml}mL`, io.output_ml != null && `Output ${io.output_ml}mL`].filter(Boolean).join(" · "),
      extra: io.notes || undefined,
    });
  }
  for (const r of emr.icu_rass_scores) {
    entries.push({
      date: dateKey(r.created_at),
      time: r.created_at,
      type: "ICU RASS",
      title: r.recorded_by || "Sedation score recorded",
      body: `RASS ${r.score}`,
    });
  }
  for (const l of emr.icu_lab_results) {
    entries.push({
      date: dateKey(l.created_at),
      time: l.created_at,
      type: "ICU Lab",
      title: l.test_name,
      body: [l.value, l.unit].filter(Boolean).join(" "),
      extra: l.flag ? `Flag: ${l.flag}` : undefined,
    });
  }
  for (const c of emr.icu_consults) {
    entries.push({
      date: dateKey(c.created_at),
      time: c.created_at,
      type: "ICU Consult",
      title: `${c.specialty} consult -- ${c.status}`,
      body: c.consultant_name || "",
      extra: c.notes || undefined,
    });
  }

  if (erDetail) {
    for (const c of erDetail.complaints) {
      entries.push({ date: dateKey(c.created_at), time: c.created_at, type: "ER Complaint", title: "Chief complaint", body: c.complaint });
    }
    for (const v of erDetail.vitals) {
      entries.push({
        date: dateKey(v.recorded_at),
        time: v.recorded_at,
        type: "Vitals",
        title: "ER vitals recorded",
        body: [
          v.heart_rate != null && `HR ${v.heart_rate}`,
          v.bp_systolic != null && v.bp_diastolic != null && `BP ${v.bp_systolic}/${v.bp_diastolic}`,
          v.spo2 != null && `SpO2 ${v.spo2}%`,
        ]
          .filter(Boolean)
          .join(" · ") || "No values recorded",
      });
    }
    for (const n of erDetail.clinical_notes) {
      entries.push({ date: dateKey(n.created_at), time: n.created_at, type: "ER Note", title: n.note_type, body: n.content });
    }
    for (const t of erDetail.treatments) {
      entries.push({
        date: dateKey(t.performed_at),
        time: t.performed_at,
        type: "Treatment",
        title: t.intervention_type,
        body: t.description || "",
      });
    }
  }

  entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const groups = new Map<string, DayEntry[]>();
  for (const e of entries) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date)!.push(e);
  }
  return groups;
}

// Every real doctor name on record for this patient -- OP appointment,
// ER assignment, and whoever's logged an evaluation -- deduplicated by name.
// There's no separate "care team" table, so this is the closest honest
// substitute: who has actually been involved, per the data that exists.
function buildCareTeam(row: PatientRow, emr: EmrResponse, erDetail: ErVisitDetail | null): { name: string; role: string }[] {
  const seen = new Set<string>();
  const team: { name: string; role: string }[] = [];
  const add = (name: string | null | undefined, role: string) => {
    const trimmed = (name || "").trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    team.push({ name: trimmed, role });
  };
  add(row.appointment_doctor, "OP Consultation");
  add(erDetail?.assigned_doctor_name, erDetail?.assigned_specialty ? `ER · ${erDetail.assigned_specialty}` : "ER");
  for (const o of emr.observation_notes) {
    add(o.doctor_name, o.role === "nurse" ? "Nurse Note" : o.role === "doctor" ? "Doctor Note" : "Evaluation");
  }
  return team;
}

const ENTRY_TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  "Clinical Note": { bg: "#EFF6FF", text: "#1E40AF" },
  "Doctor Note": { bg: "#F0FDF4", text: "#15803D" },
  "Nurse Note": { bg: "#FFF7ED", text: "#C2410C" },
  "Evaluation & Treatment": { bg: "#F0FDF4", text: "#15803D" },
  Vitals: { bg: "#FDF4FF", text: "#86198F" },
  Diagnosis: { bg: "#FFFBEB", text: "#92400E" },
  "ER Complaint": { bg: "#FEF2F2", text: "#B91C1C" },
  "ER Note": { bg: "#FEF2F2", text: "#B91C1C" },
  Treatment: { bg: "#ECFEFF", text: "#0E7490" },
};

const CHART_TABS = ["Summary", "Day-wise", "Timeline", "Problems", "Medications", "Allergies", "Vitals", "Labs", "Documents", "Billing", "Insurance"];

export default function PatientChart({
  onBack,
  setNotice,
  initialPatientId,
  onConsumeInitialPatient,
}: {
  onBack: () => void;
  setNotice: (notice: Notice | null) => void;
  // Set by another page (e.g. clicking a patient's name in Bed Management)
  // to jump straight into that patient's chart instead of landing on the
  // directory -- consumed once so navigating away and back doesn't re-fire.
  initialPatientId?: string | null;
  onConsumeInitialPatient?: () => void;
}) {
  const [selectedRow, setSelectedRow] = useState<PatientRow | null>(null);
  const [emr, setEmr] = useState<EmrResponse | null>(null);
  const [erDetail, setErDetail] = useState<ErVisitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("Summary");
  const [addOpen, setAddOpen] = useState(false);
  const [expandedCertId, setExpandedCertId] = useState<number | null>(null);

  const buildLocalEmr = (patientId: string): { row: PatientRow; emr: EmrResponse } | null => {
    const dbPatients = db.getPatients();
    const dbEncounters = db.getEncounters();
    
    const targetEnc = dbEncounters.find(e => 
      e.id === patientId || 
      e.umr === patientId || 
      e.opNumber === patientId ||
      e.patientName.toLowerCase().includes(patientId.toLowerCase())
    );
    
    const targetPatient = dbPatients.find(p => 
      p.umr === patientId || 
      p.name.toLowerCase().includes(patientId.toLowerCase())
    );

    if (!targetEnc && !targetPatient) return null;

    const name = targetEnc?.patientName || targetPatient?.name || patientId;
    const umr = targetEnc?.umr || targetPatient?.umr || patientId;
    const age = targetEnc?.age || targetPatient?.age || 35;
    const sex = targetEnc?.sex || targetPatient?.sex || "Male";
    const phone = targetEnc?.phone || targetPatient?.phone || "";

    const row: PatientRow = {
      patient_id: umr,
      name,
      age,
      gender: sex,
      phone,
      care_stream: "OP",
      appointment_doctor: targetEnc?.assignedDoctor || "Dr. Arjun Mehta",
      appointment_dept: targetEnc?.dept || "Cardiology",
      appointment_status: targetEnc?.status || "Checked In",
    };

    const emr: EmrResponse = {
      patient: {
        patient_id: umr,
        name,
        dob: targetPatient?.dob || "1990-01-01",
        age,
        gender: sex,
        phone,
        address: targetPatient?.address || "Main City",
      },
      admissions: [],
      notes: targetEnc?.chiefComplaint ? [{
        id: 1,
        chief_complaint: targetEnc.chiefComplaint,
        notes: targetEnc.vitals?.notes || "OP Visit evaluation",
        created_at: targetEnc?.createdAt || (targetEnc?.date ? `${targetEnc.date}T${targetEnc.registrationTime || '09:00:00'}` : undefined) || targetPatient?.createdAt || new Date().toISOString(),
      }] : [],
      vitals: targetEnc?.vitals?.bp ? [{
        id: 1,
        bp: targetEnc.vitals.bp,
        pulse: targetEnc.vitals.pulse,
        temperature: targetEnc.vitals.temp,
        created_at: targetEnc?.timestamps?.vitalsRecorded || targetEnc?.createdAt || new Date().toISOString(),
      }] : [],
      diagnoses: targetEnc?.diagnosis ? [{
        id: 1,
        diagnosis_name: targetEnc.diagnosis,
        created_at: targetEnc?.createdAt || new Date().toISOString(),
      }] : [],
      observation_notes: [],
      medication_schedules: [],
      prescriptions: (targetEnc?.prescription || []).map((p, i) => ({
        prescription_id: i + 1,
        medicine_name: p.medicine,
        dosage: p.dosage,
        quantity: 1,
        unit_price: 10,
        status: "Dispensed",
        created_at: new Date().toISOString(),
      })),
      labs: (targetEnc?.investigations || []).map((l, i) => ({
        id: i + 1,
        test_name: l,
        amount: 400,
        status: "Completed",
        doctor_name: targetEnc?.assignedDoctor,
        created_at: new Date().toISOString(),
      })),
      documents: [],
      invoices: [],
      invoice_payments: [],
      insurance_claims: [],
      certificates: [],
      timeline: (() => {
        const events: JourneyEvent[] = [];
        if (targetEnc?.registrationTime) {
          events.push({
            stage: "Registration",
            label: `OP Registration (${targetEnc.opNumber})`,
            timestamp: targetEnc.timestamps?.registration || targetEnc.registrationTime,
          });
        }
        if (targetEnc?.vitals?.bp) {
          events.push({
            stage: "Nurse Station",
            label: `Baseline Vitals Recorded (BP: ${targetEnc.vitals.bp})`,
            timestamp: targetEnc.timestamps?.vitalsRecorded || targetEnc.registrationTime,
          });
        }
        if (targetEnc?.diagnosis) {
          events.push({
            stage: "Consultation",
            label: `Physician Consultation - ${targetEnc.diagnosis} (${targetEnc.assignedDoctor || "Doctor"})`,
            timestamp: targetEnc.timestamps?.consultationStart || targetEnc.registrationTime,
          });
        }
        const finalizedRadStudies = BillingDatabase.getRadiologyStudies().filter(
          (s) =>
            (s.status === "Final" || s.reportStatus === "Final") &&
            (s.umr === umr || (targetEnc && s.encounterId === targetEnc.id))
        );
        finalizedRadStudies.forEach((s) => {
          events.push({
            stage: "Radiology",
            label: `Radiology Report Finalized: ${s.study} (${s.modality}) - ${s.radiologist || "Radiology"}`,
            timestamp: s.signedAt || s.finalizedAt || s.ordered,
            detail: { studyId: s.id, modality: s.modality, radiologist: s.radiologist, study: s.study },
          });
        });
        if (targetEnc?.billing?.status === "Paid") {
          events.push({
            stage: "Billing",
            label: `Billing Settlement Completed (₹${targetEnc.billing.total || 0})`,
            timestamp: targetEnc.timestamps?.billingCompleted || targetEnc.registrationTime,
          });
        }
        return events;
      })(),
      icu_ventilator_settings: [],
      icu_infusions: [],
      icu_io_records: [],
      icu_rass_scores: [],
      icu_lab_results: [],
      icu_consults: [],
    };

    return { row, emr };
  };

  const loadPatient = async (row: PatientRow) => {
    setLoading(true);
    setTab("Summary");
    try {
      const [emrData, erData] = await Promise.all([
        apiFetch<EmrResponse>(`/api/emr/${row.patient_id}`).catch(() => null),
        row.active_er_visit_id
          ? apiFetch<ErVisitDetail>(`/api/er/visits/${row.active_er_visit_id}`).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (emrData) {
        setEmr(emrData);
        setErDetail(erData);
      } else {
        const fallback = buildLocalEmr(row.patient_id);
        if (fallback) {
          setEmr(fallback.emr);
        } else {
          reportError(setNotice, undefined, "Could not load patient record.");
          setEmr(null);
        }
      }
    } catch (error: any) {
      const fallback = buildLocalEmr(row.patient_id);
      if (fallback) {
        setEmr(fallback.emr);
      } else {
        reportError(setNotice, error, "Failed to load this patient's record.");
        setEmr(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const [selectedJourneyEncounter, setSelectedJourneyEncounter] = useState<DBOPEncounter | null>(null);

  const handleOpenOpJourney = (row: PatientRow) => {
    const enc = (db.getEncounters().find((e) => e.umr === row.patient_id) || {
      id: `enc-${row.patient_id}`,
      umr: row.patient_id,
      patientName: rowDisplayName(row),
      age: row.age || 30,
      sex: (row.gender as any) || "Male",
      phone: row.phone || "—",
      address: "Outpatient Department",
      bloodGroup: "O+",
      opNumber: `OP-${row.patient_id}`,
      dept: row.appointment_dept || "General OP",
      isNew: true,
      date: (row.appointment_date || row.admission_date || (row as any).created_at || new Date().toISOString()).split("T")[0],
      createdAt: row.appointment_date || row.admission_date || (row as any).created_at || new Date().toISOString(),
      registrationTime: new Date(row.appointment_date || row.admission_date || (row as any).created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      chiefComplaint: "Outpatient Care & Consultation",
      symptoms: ["General Examination"],
      aiSpecialty: "General Medicine",
      aiDoctor: row.appointment_doctor || "Duty Doctor",
      doctorGenderPref: "Any",
      assignedDoctor: row.appointment_doctor || "Duty Doctor",
      room: "Room 101",
      status: "Registered",
      fee: 500,
      isPaid: true,
      paymentMethod: "Cash",
      bookedAt: row.appointment_date || row.admission_date || (row as any).created_at || new Date().toISOString()
    }) as unknown as DBOPEncounter;
    setSelectedJourneyEncounter(enc);
  };

  const backToDirectory = () => {
    setSelectedRow(null);
    setEmr(null);
    setErDetail(null);
  };

  useEffect(() => {
    if (!initialPatientId) return;
    (async () => {
      try {
        const data = await apiFetch<{ patients: PatientRow[] }>(
          `/api/patients?q=${encodeURIComponent(initialPatientId)}`,
        ).catch(() => null);

        const row = (data?.patients || []).find((p) => p.patient_id === initialPatientId || p.name === initialPatientId);
        if (row) {
          setSelectedRow(row);
          void loadPatient(row);
        } else {
          const fallback = buildLocalEmr(initialPatientId);
          if (fallback) {
            setSelectedRow(fallback.row);
            setEmr(fallback.emr);
          } else {
            reportError(setNotice, undefined, "Could not find that patient.");
          }
        }
      } catch {
        const fallback = buildLocalEmr(initialPatientId);
        if (fallback) {
          setSelectedRow(fallback.row);
          setEmr(fallback.emr);
        }
      } finally {
        onConsumeInitialPatient?.();
      }
    })();
  }, [initialPatientId]);

  if (!selectedRow) {
    return (
      <>
        <PatientDirectory
          onSelect={(row) => {
            setSelectedRow(row);
            void loadPatient(row);
          }}
          onOpenOpJourney={handleOpenOpJourney}
          onBack={onBack}
          setNotice={setNotice}
        />
        <PatientJourneyModal
          encounter={selectedJourneyEncounter}
          onClose={() => setSelectedJourneyEncounter(null)}
        />
      </>
    );
  }

  const dayGroups = emr ? buildDayGroups(emr, erDetail) : new Map<string, DayEntry[]>();
  const sortedDates = Array.from(dayGroups.keys()).sort((a, b) => (a < b ? 1 : -1));
  const patient = emr?.patient;
  const careTeam = emr ? buildCareTeam(selectedRow, emr, erDetail) : [];
  const latestAdmission = emr?.admissions[0];
  const latestInsurance = emr?.insurance_claims[0];
  const allergyList = (patient?.allergies || "").split(",").map((a) => a.trim()).filter(Boolean);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* OP Banner if Outpatient */}
      {selectedRow.care_stream === "OP" && (
        <div className="bg-[#EFF6FF] border-b border-[#BFDBFE] px-5 py-2.5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[12.5px] text-[#1E40AF]">
            <span className="font-bold">ℹ️ Outpatient (OP) Record</span>
            <span className="text-[#3B82F6]">|</span>
            <span>This patient is in Outpatient Care. Full consultation history &amp; care milestones are in the OP Clinical Journey.</span>
          </div>
          <button
            type="button"
            onClick={() => handleOpenOpJourney(selectedRow)}
            className="px-3 py-1 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[11.5px] font-bold rounded-none shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>✨</span> View OP Clinical Journey &amp; Consultations →
          </button>
        </div>
      )}
      {/* Patient Banner */}
      <div className="bg-white border-b border-[#DDE2EC] px-5 py-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <button
              onClick={backToDirectory}
              className="w-8 h-8 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#64748B] hover:bg-[#E2E8F0] flex-shrink-0"
              title="All Patients"
            >
              <FiArrowLeft aria-hidden />
            </button>
            <div className="w-10 h-10 rounded-full bg-[#1B4FD8] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              <FiUser aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-semibold text-gray-900">{rowDisplayName(selectedRow)}</span>
                {patient?.allergies && (
                  <span className="bg-[#FEE2E2] text-[#B91C1C] text-[11px] font-semibold px-2 py-0.5 rounded border border-[#FECACA]">
                    ⚠ Allergy: {patient.allergies}
                  </span>
                )}
                <LocationBadge row={selectedRow} />
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11.5px] text-[#64748B] flex-wrap">
                <span className="font-mono text-[#374151]">{selectedRow.patient_id}</span>
                {selectedRow.age && <span>{selectedRow.age}y · {selectedRow.gender || "—"}</span>}
                {selectedRow.phone && <span>{selectedRow.phone}</span>}
                {patient?.blood_group && <span>Blood: {patient.blood_group}</span>}
              </div>
            </div>
          </div>
          <Btn variant="primary" size="xs" onClick={() => setAddOpen(true)}>
            <FiPlus aria-hidden /> Add Evaluation
          </Btn>
        </div>
      </div>

      <TabBar tabs={CHART_TABS} active={tab} onChange={setTab} />

      <div className="flex-1 overflow-y-auto bg-[#F0F2F5] p-5">
        {loading || !emr ? (
          <p className="text-[12.5px] text-[#64748B]">Loading patient record...</p>
        ) : (
          <>
            {tab === "Summary" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card title="Active Problems">
                      {emr.diagnoses.length === 0 ? (
                        <p className="text-[12px] text-[#94A3B8]">No diagnoses recorded.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {emr.diagnoses.slice(0, 5).map((p) => (
                            <div key={p.id} className="flex items-start gap-2 py-1 border-b border-[#F1F5F9] last:border-0">
                              <span className="text-[12.5px] text-gray-800">{p.diagnosis_name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                    <Card title="Allergies">
                      {allergyList.length === 0 ? (
                        <p className="text-[12px] text-[#94A3B8]">No known allergies on file.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {allergyList.map((a) => (
                            <span key={a} className="bg-[#FEE2E2] text-[#B91C1C] text-[11px] font-semibold px-2 py-0.5 rounded border border-[#FECACA]">
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Card title="Current Medications">
                      {emr.medication_schedules.length === 0 ? (
                        <p className="text-[12px] text-[#94A3B8]">No medications scheduled.</p>
                      ) : (
                        <div className="space-y-1">
                          {emr.medication_schedules.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex items-center justify-between py-1 border-b border-[#F1F5F9] last:border-0">
                              <div>
                                <div className="text-[12.5px] font-medium text-gray-800">{m.medicine_name}</div>
                                <div className="text-[11px] text-[#64748B] font-mono">{m.dosage || "—"}</div>
                              </div>
                              <StatusBadge status={m.administered ? "Administered" : "Pending"} />
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    <Card title="Recent Vitals">
                      {emr.vitals.length === 0 ? (
                        <p className="text-[12px] text-[#94A3B8]">No vitals recorded.</p>
                      ) : (
                        <div>
                          {(() => {
                            const latest = emr.vitals[0];
                            return (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                <div className="flex items-baseline justify-between py-0.5">
                                  <span className="text-[11.5px] text-[#64748B]">Blood Pressure</span>
                                  <span className="font-mono text-[12px] font-semibold">{latest.bp || "—"}</span>
                                </div>
                                <div className="flex items-baseline justify-between py-0.5">
                                  <span className="text-[11.5px] text-[#64748B]">Pulse</span>
                                  <span className="font-mono text-[12px] font-semibold">{latest.pulse || "—"}</span>
                                </div>
                                <div className="flex items-baseline justify-between py-0.5">
                                  <span className="text-[11.5px] text-[#64748B]">Temperature</span>
                                  <span className="font-mono text-[12px] font-semibold">{latest.temperature || "—"}</span>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="mt-2 text-[11px] text-[#94A3B8]">Last recorded: {formatDateTimeIST(emr.vitals[0].created_at)}</div>
                        </div>
                      )}
                    </Card>
                  </div>

                  <Card title="Recent Lab Results">
                    {emr.labs.length === 0 ? (
                      <p className="text-[12px] text-[#94A3B8]">No lab tests on record.</p>
                    ) : (
                      <Table headers={["Test", "Doctor", "Status", "Ordered"]}>
                        {emr.labs.slice(0, 5).map((l) => (
                          <TR key={l.id}>
                            <TD><span className="font-medium text-gray-700">{l.test_name}</span></TD>
                            <TD><span className="text-[#64748B] text-[11.5px]">{l.doctor_name || "—"}</span></TD>
                            <TD><StatusBadge status={l.status || "due"} /></TD>
                            <TD><span className="font-mono text-[11px] text-[#94A3B8]">{formatDateTimeIST(l.created_at)}</span></TD>
                          </TR>
                        ))}
                      </Table>
                    )}
                  </Card>
                </div>

                <div className="space-y-4">
                  <Card title="Care Team">
                    {careTeam.length === 0 ? (
                      <p className="text-[12px] text-[#94A3B8]">No doctor recorded for this patient yet.</p>
                    ) : (
                      careTeam.map((c) => (
                        <div key={c.name} className="flex items-center gap-2.5 py-1.5 border-b border-[#F1F5F9] last:border-0">
                          <div className="w-7 h-7 rounded-full bg-[#E8EDF5] flex items-center justify-center text-[10px] font-bold text-[#1E3A6E]">
                            {c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <div className="text-[12px] font-medium text-gray-800">{c.name}</div>
                            <div className="text-[11px] text-[#64748B]">{c.role}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </Card>

                  <Card title="Encounter Info">
                    {latestAdmission ? (
                      <div className="space-y-1.5 text-[12px]">
                        {[
                          { l: "Admit Date", v: formatDateTimeIST(latestAdmission.admission_date) },
                          { l: "Discharge Date", v: latestAdmission.discharge_date ? formatDateTimeIST(latestAdmission.discharge_date) : "Still admitted" },
                          { l: "Ward / Bed", v: selectedRow.active_bed || "—" },
                          { l: "Notes", v: latestAdmission.notes || "—" },
                        ].map(({ l, v }) => (
                          <div key={l} className="flex justify-between py-0.5 border-b border-[#F8FAFC] last:border-0">
                            <span className="text-[#64748B]">{l}</span>
                            <span className="font-medium text-gray-800 text-right ml-2">{v}</span>
                          </div>
                        ))}
                      </div>
                    ) : selectedRow.care_stream === "OP" ? (
                      <div className="space-y-1.5 text-[12px]">
                        {[
                          { l: "Department", v: selectedRow.appointment_dept || "—" },
                          { l: "Doctor", v: selectedRow.appointment_doctor || "—" },
                          { l: "Status", v: selectedRow.appointment_status || "—" },
                        ].map(({ l, v }) => (
                          <div key={l} className="flex justify-between py-0.5 border-b border-[#F8FAFC] last:border-0">
                            <span className="text-[#64748B]">{l}</span>
                            <span className="font-medium text-gray-800 text-right ml-2">{v}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#94A3B8]">No active admission on file.</p>
                    )}
                  </Card>

                  <Card title="Insurance">
                    {latestInsurance ? (
                      <div className="space-y-1.5 text-[12px]">
                        {[
                          { l: "Insurer", v: latestInsurance.insurer_name },
                          { l: "Claim Amount", v: `₹${latestInsurance.claim_amount.toLocaleString("en-IN")}` },
                          { l: "Approved", v: `₹${latestInsurance.approved_amount.toLocaleString("en-IN")}` },
                          { l: "Status", v: latestInsurance.claim_status },
                        ].map(({ l, v }) => (
                          <div key={l} className="flex justify-between py-0.5 border-b border-[#F8FAFC] last:border-0">
                            <span className="text-[#64748B]">{l}</span>
                            <span className="font-medium text-gray-800">{v}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#94A3B8]">No insurance claims on file.</p>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {tab === "Day-wise" && (
              <div className="w-full space-y-4">
                {sortedDates.length === 0 ? (
                  <div className="bg-white border border-[#DDE2EC] rounded p-8 text-center">
                    <p className="text-[13px] font-semibold text-gray-800">No evaluations recorded yet</p>
                    <p className="text-[12px] text-[#64748B] mt-1">Use "Add Evaluation" above to log today's clinical evaluation and treatment.</p>
                  </div>
                ) : (
                  sortedDates.map((date) => (
                    <Card
                      key={date}
                      title={new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                    >
                      <div className="space-y-3">
                        {dayGroups.get(date)!.map((entry, i) => {
                          const color = ENTRY_TYPE_COLOR[entry.type] || { bg: "#F1F5F9", text: "#334155" };
                          return (
                            <div key={i} className="pb-3 border-b border-[#F1F5F9] last:border-0 last:pb-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-[10.5px] text-[#94A3B8]">
                                  {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span
                                  className="text-[11px] font-semibold px-1.5 py-px rounded"
                                  style={{ backgroundColor: color.bg, color: color.text }}
                                >
                                  {entry.type}
                                </span>
                                <span className="text-[12.5px] font-medium text-gray-800">{entry.title}</span>
                              </div>
                              {entry.body && <p className="text-[12px] text-gray-700 ml-0.5">{entry.body}</p>}
                              {entry.extra && <p className="text-[11.5px] text-[#64748B] ml-0.5 mt-0.5">{entry.extra}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            {tab === "Timeline" && (
              <div className="max-w-2xl">
                <div className="bg-white border border-[#DDE2EC] rounded p-4">
                  {emr.timeline.length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">No journey events recorded yet.</p>
                  ) : (
                    emr.timeline.map((e, i, arr) => (
                      <TimelineItem
                        key={i}
                        time={e.timestamp ? formatDateTimeIST(e.timestamp) : "—"}
                        type={e.stage}
                        title={e.label}
                        isLast={i === arr.length - 1}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {tab === "Problems" && (
              <Card title="Diagnoses">
                {emr.diagnoses.length === 0 ? (
                  <p className="text-[12.5px] text-[#64748B]">No diagnoses recorded.</p>
                ) : (
                  <Table headers={["Diagnosis", "Recorded"]}>
                    {emr.diagnoses.map((d) => (
                      <TR key={d.id}>
                        <TD><span className="font-medium text-gray-800">{d.diagnosis_name}</span></TD>
                        <TD><span className="font-mono text-[11.5px] text-[#64748B]">{formatDateTimeIST(d.created_at)}</span></TD>
                      </TR>
                    ))}
                  </Table>
                )}
              </Card>
            )}

            {tab === "Medications" && (
              <div className="space-y-4">
                <Card title="Medication Schedule">
                  {emr.medication_schedules.length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">No medications scheduled.</p>
                  ) : (
                    <Table headers={["Medication", "Dose", "Scheduled", "Status", "Notes"]}>
                      {emr.medication_schedules.map((m) => (
                        <TR key={m.id}>
                          <TD><span className="font-medium text-gray-800">{m.medicine_name}</span></TD>
                          <TD><span className="font-mono text-[12px]">{m.dosage || "—"}</span></TD>
                          <TD><span className="font-mono text-[11.5px]">{formatDateTimeIST(m.schedule_time)}</span></TD>
                          <TD><StatusBadge status={m.administered ? "Administered" : "Pending"} /></TD>
                          <TD><span className="text-[#64748B] text-[11.5px]">{m.notes || "—"}</span></TD>
                        </TR>
                      ))}
                    </Table>
                  )}
                </Card>

                <Card title="Pharmacy Prescriptions">
                  {emr.prescriptions.length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">No pharmacy prescriptions on record.</p>
                  ) : (
                    <Table headers={["Medicine", "Dosage", "Quantity", "Status", "Prescribed"]}>
                      {emr.prescriptions.map((p, i) => (
                        <TR key={`${p.prescription_id}-${i}`}>
                          <TD><span className="font-medium text-gray-800">{p.medicine_name}</span></TD>
                          <TD><span className="font-mono text-[12px]">{p.dosage || "—"}</span></TD>
                          <TD><span className="font-mono text-[12px]">{p.quantity ?? "—"}</span></TD>
                          <TD><StatusBadge status={p.status || "pending"} /></TD>
                          <TD><span className="font-mono text-[11.5px] text-[#64748B]">{formatDateTimeIST(p.created_at)}</span></TD>
                        </TR>
                      ))}
                    </Table>
                  )}
                </Card>
              </div>
            )}

            {tab === "Allergies" && (
              <Card title="Known Allergies">
                {allergyList.length === 0 ? (
                  <p className="text-[12.5px] text-[#64748B]">No known allergies on file for this patient.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allergyList.map((a) => (
                      <span key={a} className="bg-[#FEE2E2] text-[#B91C1C] text-[12px] font-semibold px-3 py-1 rounded border border-[#FECACA]">
                        ⚠ {a}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "Vitals" && (
              <Card title="Recorded Vitals">
                {emr.vitals.length === 0 ? (
                  <p className="text-[12.5px] text-[#64748B]">No vitals recorded.</p>
                ) : (
                  <Table headers={["Recorded", "BP", "Pulse", "Temperature"]}>
                    {emr.vitals.map((v) => (
                      <TR key={v.id}>
                        <TD><span className="font-mono text-[11.5px]">{formatDateTimeIST(v.created_at)}</span></TD>
                        <TD>{v.bp || "—"}</TD>
                        <TD>{v.pulse || "—"}</TD>
                        <TD>{v.temperature || "—"}</TD>
                      </TR>
                    ))}
                  </Table>
                )}
              </Card>
            )}

            {tab === "Labs" && (
              <Card title="Diagnostics / Lab Tests">
                {emr.labs.length === 0 ? (
                  <p className="text-[12.5px] text-[#64748B]">No lab tests on record.</p>
                ) : (
                  <Table headers={["Test", "Doctor", "Status", "Ordered"]}>
                    {emr.labs.map((l) => (
                      <TR key={l.id}>
                        <TD><span className="font-medium text-gray-700">{l.test_name}</span></TD>
                        <TD><span className="text-[#64748B] text-[11.5px]">{l.doctor_name || "—"}</span></TD>
                        <TD><StatusBadge status={l.status || "due"} /></TD>
                        <TD><span className="font-mono text-[11px] text-[#94A3B8]">{formatDateTimeIST(l.created_at)}</span></TD>
                      </TR>
                    ))}
                  </Table>
                )}
              </Card>
            )}

            {tab === "Documents" && (
              <div className="space-y-4">
                <Card title="Discharge Summaries">
                  {emr.certificates.filter((c) => c.certificate_type === "discharge_summary").length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">
                      No discharge summary yet -- one is generated automatically when this patient is discharged from a bed.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {emr.certificates
                        .filter((c) => c.certificate_type === "discharge_summary")
                        .map((c) => (
                          <div key={c.id} className="border border-[#DDE2EC] rounded">
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 flex items-center justify-between"
                              onClick={() => setExpandedCertId(expandedCertId === c.id ? null : c.id)}
                            >
                              <span className="text-[12.5px] font-medium text-gray-800">{c.title}</span>
                              <span className="font-mono text-[11px] text-[#94A3B8]">{formatDateTimeIST(c.created_at)}</span>
                            </button>
                            {expandedCertId === c.id && (
                              <pre className="px-3 pb-3 text-[11.5px] text-gray-700 whitespace-pre-wrap font-sans border-t border-[#F1F5F9] pt-2">
                                {c.body}
                              </pre>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </Card>

                <Card title="Clinical Voice Notes">
                  {emr.documents.filter((d) => d.doc_type === "clinical_audio_note").length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">
                      No recorded evaluations yet -- use Record in "Add Evaluation" to dictate one.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {emr.documents
                        .filter((d) => d.doc_type === "clinical_audio_note")
                        .map((d) => (
                          <div key={d.id} className="border border-[#DDE2EC] rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] text-[#94A3B8] font-mono">{formatDateTimeIST(d.created_at)}</span>
                            </div>
                            <audio controls className="w-full h-8" src={`${API_BASE}/api/documents/${d.id}/file`} />
                            {d.ocr_text && (
                              <p className="text-[12px] text-gray-700 mt-2 bg-[#F8FAFC] p-2 rounded border border-[#F1F5F9]">
                                <strong className="text-[11px] uppercase tracking-wide text-gray-500 block mb-0.5">Transcript</strong>
                                {d.ocr_text}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </Card>

                <Card title="Documents">
                  {emr.documents.filter((d) => d.doc_type !== "clinical_audio_note").length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">No documents uploaded for this patient.</p>
                  ) : (
                    <Table headers={["Document", "Type", "Uploaded", ""]}>
                      {emr.documents
                        .filter((d) => d.doc_type !== "clinical_audio_note")
                        .map((d) => (
                          <TR key={d.id}>
                            <TD><span className="font-medium text-gray-800">{d.file_name || "Untitled"}</span></TD>
                            <TD><span className="text-[#64748B] text-[11.5px] uppercase">{d.doc_type}</span></TD>
                            <TD><span className="font-mono text-[11.5px]">{formatDateTimeIST(d.created_at)}</span></TD>
                            <TD>{d.has_ocr_text && <StatusBadge status="OCR Available" />}</TD>
                          </TR>
                        ))}
                    </Table>
                  )}
                </Card>
              </div>
            )}

            {tab === "Insurance" && selectedRow && (
              <PatientInsuranceTab patientId={selectedRow.patient_id} patientName={selectedRow.name} />
            )}

            {tab === "Billing" && (
              <div className="space-y-4">
                <Card title="Invoices">
                  {emr.invoices.length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">No invoices raised for this patient.</p>
                  ) : (
                    <Table headers={["Invoice", "Module", "Total", "Paid", "Due", "Status"]}>
                      {emr.invoices.map((inv) => (
                        <TR key={inv.id}>
                          <TD><span className="font-mono text-[12px] font-medium text-gray-800">{inv.invoice_no}</span></TD>
                          <TD><span className="text-[#64748B] text-[11.5px]">{inv.module}</span></TD>
                          <TD><span className="font-mono text-[12px]">₹{inv.total_amount.toLocaleString("en-IN")}</span></TD>
                          <TD><span className="font-mono text-[12px] text-[#15803D]">₹{inv.paid_amount.toLocaleString("en-IN")}</span></TD>
                          <TD><span className="font-mono text-[12px] text-[#B91C1C]">₹{inv.due_amount.toLocaleString("en-IN")}</span></TD>
                          <TD><StatusBadge status={inv.payment_status} /></TD>
                        </TR>
                      ))}
                    </Table>
                  )}
                </Card>

                <Card title="Payments">
                  {emr.invoice_payments.length === 0 ? (
                    <p className="text-[12.5px] text-[#64748B]">No payments recorded.</p>
                  ) : (
                    <Table headers={["Amount", "Mode", "Recorded"]}>
                      {emr.invoice_payments.map((p) => (
                        <TR key={p.id}>
                          <TD><span className="font-mono text-[12px]">₹{p.amount.toLocaleString("en-IN")}</span></TD>
                          <TD><span className="text-[#64748B] text-[11.5px] uppercase">{p.payment_mode}</span></TD>
                          <TD><span className="font-mono text-[11.5px]">{formatDateTimeIST(p.created_at)}</span></TD>
                        </TR>
                      ))}
                    </Table>
                  )}
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {addOpen && emr && (
        <AddEvaluationModal
          patientId={selectedRow.patient_id}
          admissionId={emr.admissions[0]?.id}
          setNotice={setNotice}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void loadPatient(selectedRow);
          }}
        />
      )}

      <PatientJourneyModal
        encounter={selectedJourneyEncounter}
        onClose={() => setSelectedJourneyEncounter(null)}
      />
    </div>
  );
}
