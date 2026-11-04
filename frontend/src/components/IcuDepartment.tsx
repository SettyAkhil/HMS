import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { LineChart, Line, Tooltip, ResponsiveContainer } from "recharts"
import {
  FiActivity,
  FiAlertCircle,
  FiArrowRight,
  FiDroplet,
  FiFileText,
  FiHeart,
  FiMoon,
  FiPlus,
  FiTrendingUp,
  FiUsers,
  FiWind,
  FiZap,
} from "react-icons/fi"
import { Btn, Card } from "./shared"
import AddEvaluationModal from "./AddEvaluationModal"
import {
  bedGenderVariant,
  bedOccupantName,
  type BedCardData,
} from "./bed/BedCard"
import { apiFetch, reportError } from "../lib/api"
import { formatDateTimeIST } from "../lib/format"
import type { Notice } from "../types"

// Same census-bar + 3-column flowsheet layout as the very first ICU page,
// restored on request -- but every field on it now comes from a real table
// a nurse/doctor actually recorded (see ensure_icu_tables() in the backend)
// instead of a hardcoded demo patient. Anything the old page showed with no
// real source (SOFA/APACHE, MRN, code status, fixed I&O line items) was
// dropped rather than faked; RASS/ventilator/infusions/I&O/labs/consults are
// now real, editable data entered right from this page.
type Bed = BedCardData & {
  ward: string
  room_no: string
  admission_id: number | null
}
type Summary = {
  total: number
  available: number
  occupied: number
  maintenance: number
}

type VitalRow = {
  id: number
  bp?: string | null
  pulse?: string | null
  temperature?: string | null
  spo2?: string | null
  respiratory_rate?: string | null
  created_at: string
}
type DiagnosisRow = {
  id: number
  diagnosis_name: string
  created_at: string
}
type ObservationNoteRow = {
  id: number
  role?: string | null
  doctor_name?: string | null
  note: string
  created_at: string
}
type AdmissionRow = { id: number ;admission_date: string }
type EmrSnapshot = {
  admissions: AdmissionRow[]
  vitals: VitalRow[]
  diagnoses: DiagnosisRow[]
  observation_notes: ObservationNoteRow[]
}

type VentilatorRow = {
  id: number
  mode?: string | null
  fio2?: string | null
  peep?: string | null
  tidal_volume?: string | null
  resp_rate?: string | null
  pip?: string | null
  created_at: string
}
type InfusionRow = {
  id: number
  medication_name: string
  rate?: string | null
  unit?: string | null
  status: string
  started_at: string
}
type IoRow = {
  id: number
  intake_ml?: number | null
  output_ml?: number | null
  recorded_at: string
}
type RassRow = { id: number ;score: number ;created_at: string }
type LabRow = {
  id: number
  test_name: string
  value?: string | null
  unit?: string | null
  flag?: string | null
  created_at: string
}
type ConsultRow = {
  id: number
  specialty: string
  consultant_name?: string | null
  status: string
  notes?: string | null
  created_at: string
}
type IcuSnapshot = {
  ventilator_settings: VentilatorRow[]
  infusions: InfusionRow[]
  io_records: IoRow[]
  rass_scores: RassRow[]
  lab_results: LabRow[]
  consults: ConsultRow[]
}

const RASS_SCALE = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4]
function rassLabel(score: number): string {
  if (score <= -4) return "Deep sedation"
  if (score <= -1) return "Light sedation"
  if (score === 0) return "Alert & calm"
  return "Agitated"
}

function losLabel(admissionDate: string): string {
  const ms = Math.max(0, Date.now() - new Date(admissionDate).getTime())
  const days = Math.floor(ms / 86400000)
  const hours = Math.floor((ms % 86400000) / 3600000)
  return `${days}d ${hours}h`
}

function VitalCell({
  label,
  value,
  sub,
  alert,
}: {
  label: string
  value: string
  sub?: string
  alert?: boolean
}) {
  return (
    <div
      className={`text-center p-2 border ${
        alert
          ? "border-[#FECACA] bg-[#FEF2F2]"
          : "border-[#DDE2EC] bg-[#F8FAFC]"
      }`}
    >
      <div className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wide mb-0.5">
        {label}
      </div>
      <div
        className={`font-mono font-bold text-[13px] ${
          alert ? "text-[#DC2626]" : "text-gray-900"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#94A3B8]">{sub}</div>}
    </div>
  )
}

function MiniTrend({
  data,
  color,
}: {
  data: { t: string ;v: number }[]
  color: string
}) {
  if (data.length < 2)
    return (
      <p className="text-[11px] text-[#94A3B8] py-3 text-center">
        Not enough readings yet for a trend.
      </p>
    )
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
        <Tooltip contentStyle={{ fontSize: 10, padding: "2px 6px" }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Custom-skinned room-scope dropdown -- tints itself by whichever room is
// selected (ICU/SICU/IICU) so the choice reads at a glance instead of
// disappearing into a plain browser <select>.
function RoomSelect({
  value,
  onChange,
}: {
  value: "ICU" | "SICU" | "IICU"
  onChange: (v: "ICU" | "SICU" | "IICU") => void
}) {
  const tint =
    value === "SICU"
      ? "icu-select-sicu"
      : value === "IICU"
        ? "icu-select-iicu"
        : "icu-select-icu"
  return (
    <div className="icu-select-wrap">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as "ICU" | "SICU" | "IICU")}
        className={`icu-select ${tint}`}
      >
        <option value="ICU">ICU (all)</option>
        <option value="SICU">SICU</option>
        <option value="IICU">IICU</option>
      </select>
    </div>
  )
}

// Colored, icon-labeled card shell for one flowsheet section -- a thin
// accent strip + icon give each section (vitals, ventilator, infusions...)
// its own identity at a glance, on top of the same white-card/Card styling
// used everywhere else in this app.
function SectionCard({
  icon,
  color,
  title,
  actions,
  children,
}: {
  icon: ReactNode
  color: string
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="bg-white border border-[#DDE2EC] overflow-hidden">
      <div className="icu-section-accent" style={{ background: color }} />
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#DDE2EC] flex-wrap gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider">
          <span style={{ color }}>{icon}</span> {title}
        </span>
        {actions}
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  )
}

// One small reusable "+ Add" control -- click to reveal a row of inputs,
// Save posts them and collapses back. Used for every ICU flowsheet section
// that needs real data entry (ventilator, infusions, I/O, labs, consults).
function QuickAddForm({
  fields,
  submitLabel,
  onSubmit,
}: {
  fields: { key: string ;label: string ;placeholder?: string }[]
  submitLabel: string
  onSubmit: (values: Record<string, string>) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <Btn variant="primary" size="xs" onClick={() => setOpen(true)}>
        <FiPlus aria-hidden /> {submitLabel}
      </Btn>
    )
  }
  return (
    <div className="flex items-end gap-1.5 flex-wrap justify-end">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="text-[10px] text-[#94A3B8] block mb-0.5">
            {f.label}
          </label>
          <input
            className="border border-[#DDE2EC] px-2 py-1 text-[11.5px] w-24"
            placeholder={f.placeholder}
            value={values[f.key] || ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [f.key]: e.target.value }))
            }
          />
        </div>
      ))}
      <Btn
        variant="primary"
        size="xs"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try {
            await onSubmit(values)
            setValues({})
            setOpen(false)
          } finally {
            setSaving(false)
          }
        }}
      >
        {saving ? "Saving..." : "Save"}
      </Btn>
      <Btn variant="ghost" size="xs" onClick={() => setOpen(false)}>
        Cancel
      </Btn>
    </div>
  )
}

type Props = {
  navigate?: (page: string, sub?: string) => void
  onOpenPatientClinical?: (patientId: string) => void
  permissions?: string[]
  // Set by Inpatient.tsx when this renders inline as the "ICU" ward's drill-
  // down instead of the plain bed board -- suppresses the page header/back
  // link since the surrounding ward page already has one.
  embedded?: boolean
}

export default function ICU({
  navigate,
  onOpenPatientClinical,
  permissions,
  embedded,
}: Props) {
  const [beds, setBeds] = useState<Bed[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [roomScope, setRoomScope] = useState<"ICU" | "IICU" | "SICU">("ICU")

  const [selectedBed, setSelectedBed] = useState<Bed | null>(null)
  const [emr, setEmr] = useState<EmrSnapshot | null>(null)
  const [icu, setIcu] = useState<IcuSnapshot | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [addEvalOpen, setAddEvalOpen] = useState(false)

  const canEdit =
    !permissions ||
    permissions.length === 0 ||
    permissions.includes("patients.clinical.write")

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await apiFetch<{ beds: Bed[] ;summary: Summary }>(
          "/api/beds",
        )
        setBeds((res.beds || []).filter((b) => b.ward === "ICU"))
      } catch (error: any) {
        reportError(setNotice, error, "Failed to load ICU beds.")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const scopedBeds = useMemo(
    () =>
      roomScope === "ICU" ? beds : beds.filter((b) => b.room_no === roomScope),
    [beds, roomScope],
  )
  const scopedSummary = useMemo(
    () =>
      scopedBeds.reduce(
        (acc, b) => {
          acc.total += 1
          if (b.status === "Available") acc.available += 1
          else if (b.status === "Occupied") acc.occupied += 1
          else acc.maintenance += 1
          return acc
        },
        { total: 0, available: 0, occupied: 0, maintenance: 0 } as Summary,
      ),
    [scopedBeds],
  )

  const loadDetail = async (bed: Bed) => {
    setSelectedBed(bed)
    setEmr(null)
    setIcu(null)
    if (!bed.patient_id) return
    setDetailLoading(true)
    try {
      const [emrRes, icuRes] = await Promise.all([
        apiFetch<EmrSnapshot>(`/api/emr/${bed.patient_id}`),
        apiFetch<IcuSnapshot>(`/api/icu/${bed.patient_id}`),
      ])
      setEmr(emrRes)
      setIcu(icuRes)
    } catch (error: any) {
      reportError(setNotice, error, "Failed to load this patient's ICU record.")
    } finally {
      setDetailLoading(false)
    }
  }
  const refreshDetail = () => selectedBed && loadDetail(selectedBed)

  const admission = emr?.admissions?.[0]
  const admissionId = admission?.id
  const vitalsHistory = emr?.vitals || []
  const latestVitals = vitalsHistory[0]
  const latestDiagnosis = emr?.diagnoses?.[0]
  const provider = emr?.observation_notes?.find((o) => o.role === "doctor")
    ?.doctor_name
  const nurse = emr?.observation_notes?.find((o) => o.role === "nurse")
    ?.doctor_name

  const hrTrend = useMemo(
    () =>
      vitalsHistory
        .filter((v) => v.pulse)
        .slice(0, 8)
        .reverse()
        .map((v) => ({
          t: new Date(v.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          v: parseInt(v.pulse!, 10),
        }))
        .filter((p) => !isNaN(p.v)),
    [vitalsHistory],
  )
  const bpTrend = useMemo(
    () =>
      vitalsHistory
        .filter((v) => v.bp)
        .slice(0, 8)
        .reverse()
        .map((v) => ({
          t: new Date(v.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          v: parseInt(v.bp!, 10),
        }))
        .filter((p) => !isNaN(p.v)),
    [vitalsHistory],
  )

  // Real alerts, not scripted ones -- derived the same way the mixed-gender
  // room alert on the Inpatient board is: read a real value, flag it if it
  // crosses a clinically standard threshold.
  const alerts = useMemo(() => {
    const list: string[] = []
    if (latestVitals?.spo2 && parseFloat(latestVitals.spo2) < 93)
      list.push(`⚠ SpO2 low -- ${latestVitals.spo2}%`)
    if (latestVitals?.pulse && parseInt(latestVitals.pulse, 10) > 110)
      list.push(`⚠ Heart rate elevated -- ${latestVitals.pulse} bpm`)
    if (latestVitals?.bp && parseInt(latestVitals.bp, 10) < 100)
      list.push(`⚠ BP trending low -- ${latestVitals.bp}`)
    for (const lab of icu?.lab_results || []) {
      if (lab.flag === "HH" || lab.flag === "H" || lab.flag === "L")
        list.push(
          `🧪 ${lab.test_name} ${
            lab.flag === "L" ? "low" : "critical"
          } -- ${lab.value ?? ""}${lab.unit || ""}`,
        )
    }
    return list
  }, [latestVitals, icu])

  const latestVent = icu?.ventilator_settings?.[0]
  const activeInfusions =
    icu?.infusions?.filter((i) => i.status === "active") || []
  const latestRass = icu?.rass_scores?.[0]
  const ioToday = (icu?.io_records || []).filter(
    (r) => new Date(r.recorded_at).toDateString() === new Date().toDateString(),
  )
  const totalIn = ioToday.reduce((sum, r) => sum + (r.intake_ml || 0), 0)
  const totalOut = ioToday.reduce((sum, r) => sum + (r.output_ml || 0), 0)

  const recordedBy = "Current user"

  return (
    <div className={embedded ? "" : "flex-1 bg-[#F0F2F5]"}>
      {notice && (
        <div
          className={`mx-4 mt-3 px-3.5 py-2.5 text-[12.5px] ${
            notice.type === "error"
              ? "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]"
              : "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]"
          }`}
        >
          {notice.message}
        </div>
      )}

      {!embedded && (
        <div className="bg-white border-b border-[#DDE2EC] px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              ICU Department
            </h1>
            <p className="text-[11.5px] text-[#64748B]">
              {scopedSummary.total} beds · {scopedSummary.occupied} occupied ·{" "}
              {scopedSummary.available} available
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RoomSelect value={roomScope} onChange={setRoomScope} />
            {navigate && (
              <Btn variant="outline" size="sm" onClick={() => navigate("beds")}>
                Bed Management <FiArrowRight aria-hidden />
              </Btn>
            )}
          </div>
        </div>
      )}
      {embedded && (
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] text-[#64748B]">
            {scopedSummary.total} beds · {scopedSummary.occupied} occupied ·{" "}
            {scopedSummary.available} available
          </span>
          <RoomSelect value={roomScope} onChange={setRoomScope} />
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-[#64748B] px-6 py-4">
          Loading ICU beds...
        </p>
      ) : scopedBeds.length === 0 ? (
        <p className="text-[13px] text-[#64748B] px-6 py-4">
          No beds in this scope.
        </p>
      ) : (
        <>
          {/* ICU census bar */}
          <div className="bg-[#0C1524] border-b border-[#1E2D42] px-6 py-2 flex items-center gap-3 overflow-x-auto">
            {scopedBeds.map((bed) => {
              const isSelected = selectedBed?.id === bed.id
              const hasPatient = !!bed.patient_id
              const genderAccent = hasPatient
                ? `icu-census-card-${bedGenderVariant(bed)}`
                : ""
              return (
                <div
                  key={bed.id}
                  onClick={() => loadDetail(bed)}
                  className={`icu-census-card flex-shrink-0 w-40 border p-2.5 cursor-pointer transition-colors ${genderAccent} ${
                    !hasPatient
                      ? "border-[#1E2D42] bg-[#0F1F30]"
                      : isSelected
                        ? "border-[#1B4FD8] bg-[#1B4FD8]/20"
                        : "border-[#1E2D42] bg-[#0F2040] hover:border-[#334155]"
                  }`}
                >
                  <div className="text-[10.5px] font-semibold text-[#64748B] mb-0.5">
                    {bed.room_no} · Bed {bed.bed_no}
                  </div>
                  {hasPatient ? (
                    <>
                      <div className="text-[12px] font-semibold text-white truncate">
                        {bedOccupantName(bed)}
                      </div>
                      <div className="text-[10.5px] text-[#64748B] truncate">
                        {bed.patient_age ? `${bed.patient_age}y` : ""}{" "}
                        {bed.patient_gender || ""}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-[#334155] mt-0.5">
                      {bed.status}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            {!selectedBed ? (
              <div className="lg:col-span-3">
                <Card>
                  <p className="text-[12.5px] text-[#64748B] text-center py-8">
                    Select a bed from the census above to view the flowsheet.
                  </p>
                </Card>
              </div>
            ) : !selectedBed.patient_id ? (
              <div className="lg:col-span-3">
                <Card>
                  <p className="text-[12.5px] text-[#64748B] text-center py-8">
                    {selectedBed.room_no} Bed {selectedBed.bed_no} is{" "}
                    {selectedBed.status.toLowerCase()} -- no patient to display.
                    {navigate && (
                      <>
                        {" "}
                        <button
                          className="text-[#1B4FD8] font-semibold hover:underline"
                          onClick={() => navigate("beds")}
                        >
                          Allocate in Bed Management
                        </button>
                      </>
                    )}
                  </p>
                </Card>
              </div>
            ) : detailLoading ? (
              <div className="lg:col-span-3">
                <Card>
                  <p className="text-[12.5px] text-[#64748B] text-center py-8">
                    Loading patient record...
                  </p>
                </Card>
              </div>
            ) : (
              <>
                {/* Left: Patient info + vitals + RASS */}
                <div className="space-y-3">
                  <div className="bg-white border border-[#DDE2EC] p-3.5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-[14px] font-bold text-gray-900">
                          {bedOccupantName(selectedBed)}
                        </div>
                        <div className="text-[11.5px] text-[#64748B]">
                          {selectedBed.patient_age
                            ? `${selectedBed.patient_age}y`
                            : "Age N/A"}{" "}
                          · {selectedBed.patient_gender || "Gender N/A"} ·{" "}
                          {selectedBed.patient_id}
                        </div>
                        <div className="text-[11.5px] font-medium text-gray-700 mt-0.5">
                          {latestDiagnosis?.diagnosis_name ||
                            "No diagnosis on record"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="bg-[#FEE2E2] text-[#B91C1C] text-[11px] font-semibold px-2 py-0.5 ">
                          ICU
                        </span>
                        <span className="text-[10.5px] text-[#64748B]">
                          {selectedBed.room_no}-{selectedBed.bed_no}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11.5px]">
                      {[
                        {
                          l: "LOS",
                          v: admission
                            ? losLabel(admission.admission_date)
                            : "—",
                        },
                        { l: "Attending", v: provider || "—" },
                        { l: "Nurse", v: nurse || "—" },
                        {
                          l: "Admitted",
                          v: admission
                            ? formatDateTimeIST(admission.admission_date)
                            : "—",
                        },
                      ].map(({ l, v }) => (
                        <div key={l}>
                          <div className="text-[#94A3B8] text-[10px] uppercase tracking-wide">
                            {l}
                          </div>
                          <div className="font-semibold text-gray-800">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {alerts.map((a, i) => (
                    <div
                      key={i}
                      className={`text-[12px] px-3 py-2 border font-medium ${
                        a.startsWith("⚠")
                          ? "bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]"
                          : "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                      }`}
                    >
                      {a}
                    </div>
                  ))}

                  <SectionCard
                    icon={<FiActivity aria-hidden />}
                    color="#059669"
                    title="Current Vitals"
                  >
                    {!latestVitals ? (
                      <p className="text-[12px] text-[#94A3B8]">
                        No vitals recorded yet.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-1.5">
                          <VitalCell
                            label="BP"
                            value={latestVitals.bp || "—"}
                            alert={
                              !!latestVitals.bp &&
                              parseInt(latestVitals.bp, 10) < 100
                            }
                          />
                          <VitalCell
                            label="Pulse"
                            value={latestVitals.pulse || "—"}
                            sub="bpm"
                            alert={
                              !!latestVitals.pulse &&
                              parseInt(latestVitals.pulse, 10) > 110
                            }
                          />
                          <VitalCell
                            label="Resp. Rate"
                            value={latestVitals.respiratory_rate || "—"}
                            sub="/min"
                          />
                          <VitalCell
                            label="SpO2"
                            value={
                              latestVitals.spo2 ? `${latestVitals.spo2}%` : "—"
                            }
                            alert={
                              !!latestVitals.spo2 &&
                              parseFloat(latestVitals.spo2) < 93
                            }
                          />
                          <VitalCell
                            label="Temp"
                            value={latestVitals.temperature || "—"}
                          />
                        </div>
                        <div className="text-[10.5px] text-[#94A3B8] text-right mt-2">
                          Updated {formatDateTimeIST(latestVitals.created_at)}
                        </div>
                      </>
                    )}
                  </SectionCard>

                  <SectionCard
                    icon={<FiMoon aria-hidden />}
                    color="#4F46E5"
                    title="Sedation -- RASS Score"
                  >
                    <div className="flex items-center justify-between">
                      {RASS_SCALE.map((score) => (
                        <button
                          key={score}
                          type="button"
                          disabled={!canEdit}
                          onClick={async () => {
                            try {
                              await apiFetch(
                                `/api/icu/${selectedBed.patient_id}/rass`,
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    admission_id: admissionId,
                                    score,
                                    recorded_by: recordedBy,
                                  }),
                                },
                              )
                              refreshDetail()
                            } catch (error: any) {
                              reportError(
                                setNotice,
                                error,
                                "Failed to record RASS score.",
                              )
                            }
                          }}
                          className={`w-7 h-7 text-[11px] font-bold flex items-center justify-center disabled:cursor-not-allowed ${
                            latestRass?.score === score
                              ? "bg-[#1B4FD8] text-white"
                              : score < 0
                                ? "bg-[#F1F5F9] text-[#94A3B8]"
                                : "bg-[#FEF3C7] text-[#B45309]"
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-2">
                      {latestRass ? (
                        <>
                          RASS {latestRass.score} --{" "}
                          {rassLabel(latestRass.score)} ·{" "}
                          {formatDateTimeIST(latestRass.created_at)}
                        </>
                      ) : (
                        "Not yet recorded -- click a score to record."
                      )}
                    </div>
                  </SectionCard>
                </div>

                {/* Center: Trends + Ventilator + I&O */}
                <div className="space-y-3">
                  <SectionCard
                    icon={<FiHeart aria-hidden />}
                    color="#DC2626"
                    title="Heart Rate Trend"
                  >
                    <MiniTrend data={hrTrend} color="#DC2626" />
                  </SectionCard>
                  <SectionCard
                    icon={<FiTrendingUp aria-hidden />}
                    color="#0284C7"
                    title="Blood Pressure (Systolic) Trend"
                  >
                    <MiniTrend data={bpTrend} color="#0284C7" />
                  </SectionCard>

                  <SectionCard
                    icon={<FiWind aria-hidden />}
                    color="#7C3AED"
                    title="Mechanical Ventilation"
                    actions={
                      canEdit ? (
                        <QuickAddForm
                          submitLabel="Record"
                          fields={[
                            {
                              key: "mode",
                              label: "Mode",
                              placeholder: "A/C-VC",
                            },
                            { key: "fio2", label: "FiO2", placeholder: "40%" },
                            { key: "peep", label: "PEEP", placeholder: "5" },
                            {
                              key: "tidal_volume",
                              label: "Tidal Vol",
                              placeholder: "450mL",
                            },
                            {
                              key: "resp_rate",
                              label: "Set RR",
                              placeholder: "14",
                            },
                            { key: "pip", label: "PIP", placeholder: "22" },
                          ]}
                          onSubmit={async (v) => {
                            await apiFetch(
                              `/api/icu/${selectedBed.patient_id}/ventilator`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  admission_id: admissionId,
                                  recorded_by: recordedBy,
                                  ...v,
                                }),
                              },
                            )
                            refreshDetail()
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {!latestVent ? (
                      <p className="text-[12px] text-[#94A3B8]">
                        No ventilator settings recorded.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { l: "Mode", v: latestVent.mode },
                          { l: "FiO2", v: latestVent.fio2 },
                          { l: "PEEP", v: latestVent.peep },
                          { l: "Tidal Vol", v: latestVent.tidal_volume },
                          { l: "Set RR", v: latestVent.resp_rate },
                          { l: "PIP", v: latestVent.pip },
                        ].map(({ l, v }) => (
                          <div key={l} className="bg-[#F8FAFC] p-2 text-center">
                            <div className="text-[10px] text-[#94A3B8] uppercase tracking-wide mb-0.5">
                              {l}
                            </div>
                            <div className="font-mono font-semibold text-[12px] text-gray-900">
                              {v || "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </SectionCard>

                  <SectionCard
                    icon={<FiDroplet aria-hidden />}
                    color="#D97706"
                    title="Intake / Output -- Today"
                    actions={
                      canEdit ? (
                        <QuickAddForm
                          submitLabel="Record"
                          fields={[
                            {
                              key: "intake_ml",
                              label: "Intake (mL)",
                              placeholder: "500",
                            },
                            {
                              key: "output_ml",
                              label: "Output (mL)",
                              placeholder: "300",
                            },
                          ]}
                          onSubmit={async (v) => {
                            await apiFetch(
                              `/api/icu/${selectedBed.patient_id}/io`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  admission_id: admissionId,
                                  recorded_by: recordedBy,
                                  intake_ml: v.intake_ml
                                    ? Number(v.intake_ml)
                                    : undefined,
                                  output_ml: v.output_ml
                                    ? Number(v.output_ml)
                                    : undefined,
                                }),
                              },
                            )
                            refreshDetail()
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {ioToday.length === 0 ? (
                      <p className="text-[12px] text-[#94A3B8]">
                        No intake/output recorded today.
                      </p>
                    ) : (
                      <div className="text-center text-[12px] font-semibold flex justify-around">
                        <span>
                          <span className="text-[#64748B]">In: </span>
                          <span className="font-mono text-[#1B4FD8]">
                            {totalIn} mL
                          </span>
                        </span>
                        <span>
                          <span className="text-[#64748B]">Out: </span>
                          <span className="font-mono text-[#DC2626]">
                            {totalOut} mL
                          </span>
                        </span>
                        <span>
                          <span className="text-[#64748B]">Net: </span>
                          <span className="font-mono text-[#D97706]">
                            {totalIn - totalOut >= 0 ? "+" : ""}
                            {totalIn - totalOut} mL
                          </span>
                        </span>
                      </div>
                    )}
                  </SectionCard>
                </div>

                {/* Right: Infusions + Labs + Consults */}
                <div className="space-y-3">
                  <SectionCard
                    icon={<FiZap aria-hidden />}
                    color="#E11D48"
                    title="Active Infusions"
                    actions={
                      canEdit ? (
                        <QuickAddForm
                          submitLabel="Add Drip"
                          fields={[
                            {
                              key: "medication_name",
                              label: "Medication",
                              placeholder: "Norepinephrine",
                            },
                            { key: "rate", label: "Rate", placeholder: "0.05" },
                            {
                              key: "unit",
                              label: "Unit",
                              placeholder: "mcg/kg/min",
                            },
                          ]}
                          onSubmit={async (v) => {
                            await apiFetch(
                              `/api/icu/${selectedBed.patient_id}/infusions`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  admission_id: admissionId,
                                  recorded_by: recordedBy,
                                  ...v,
                                }),
                              },
                            )
                            refreshDetail()
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {activeInfusions.length === 0 ? (
                      <p className="text-[12px] text-[#94A3B8]">
                        No active infusions.
                      </p>
                    ) : (
                      activeInfusions.map((inf) => (
                        <div
                          key={inf.id}
                          className="py-2.5 border-b border-[#F1F5F9] last:border-0"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-[12.5px] font-semibold text-gray-900">
                                {inf.medication_name}
                              </div>
                              <div className="font-mono text-[11.5px] text-[#DC2626] font-bold mt-0.5">
                                {inf.rate} {inf.unit}
                              </div>
                              <div className="text-[10.5px] text-[#94A3B8]">
                                Started {formatDateTimeIST(inf.started_at)}
                              </div>
                            </div>
                            {canEdit && (
                              <Btn
                                variant="ghost"
                                size="xs"
                                onClick={async () => {
                                  try {
                                    await apiFetch(
                                      `/api/icu/${selectedBed.patient_id}/infusions/${inf.id}/stop`,
                                      { method: "POST" },
                                    )
                                    refreshDetail()
                                  } catch (error: any) {
                                    reportError(
                                      setNotice,
                                      error,
                                      "Failed to stop infusion.",
                                    )
                                  }
                                }}
                              >
                                D/C
                              </Btn>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </SectionCard>

                  <SectionCard
                    icon={<FiAlertCircle aria-hidden />}
                    color="#EA580C"
                    title="Critical Labs"
                    actions={
                      canEdit ? (
                        <QuickAddForm
                          submitLabel="Add Result"
                          fields={[
                            {
                              key: "test_name",
                              label: "Test",
                              placeholder: "Lactate",
                            },
                            {
                              key: "value",
                              label: "Value",
                              placeholder: "2.1",
                            },
                            {
                              key: "unit",
                              label: "Unit",
                              placeholder: "mmol/L",
                            },
                            {
                              key: "flag",
                              label: "Flag (H/HH/L)",
                              placeholder: "H",
                            },
                          ]}
                          onSubmit={async (v) => {
                            await apiFetch(
                              `/api/icu/${selectedBed.patient_id}/labs`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  admission_id: admissionId,
                                  recorded_by: recordedBy,
                                  ...v,
                                }),
                              },
                            )
                            refreshDetail()
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {!icu?.lab_results?.length ? (
                      <p className="text-[12px] text-[#94A3B8]">
                        No lab results recorded.
                      </p>
                    ) : (
                      icu.lab_results.map((l) => (
                        <div
                          key={l.id}
                          className="flex items-center justify-between py-1.5 border-b border-[#F8FAFC] last:border-0"
                        >
                          <span className="text-[12px] text-gray-700 w-28 truncate">
                            {l.test_name}
                          </span>
                          <span
                            className={`font-mono font-bold text-[12px] ${
                              l.flag === "HH"
                                ? "text-[#B91C1C] bg-[#FEE2E2] px-1.5 py-0.5 "
                                : l.flag === "H"
                                  ? "text-[#D97706]"
                                  : l.flag === "L"
                                    ? "text-[#0284C7]"
                                    : "text-gray-900"
                            }`}
                          >
                            {l.value} {l.unit}
                          </span>
                          <span className="text-[10.5px] text-[#94A3B8] font-mono">
                            {new Date(l.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      ))
                    )}
                  </SectionCard>

                  <SectionCard
                    icon={<FiUsers aria-hidden />}
                    color="#0D9488"
                    title="Consults & Teams"
                    actions={
                      canEdit ? (
                        <QuickAddForm
                          submitLabel="Request Consult"
                          fields={[
                            {
                              key: "specialty",
                              label: "Specialty",
                              placeholder: "Cardiology",
                            },
                            {
                              key: "consultant_name",
                              label: "Consultant",
                              placeholder: "Dr. Rao",
                            },
                          ]}
                          onSubmit={async (v) => {
                            await apiFetch(
                              `/api/icu/${selectedBed.patient_id}/consults`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  admission_id: admissionId,
                                  requested_by: recordedBy,
                                  ...v,
                                }),
                              },
                            )
                            refreshDetail()
                          }}
                        />
                      ) : undefined
                    }
                  >
                    {!icu?.consults?.length ? (
                      <p className="text-[12px] text-[#94A3B8]">
                        No consults requested.
                      </p>
                    ) : (
                      icu.consults.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-start gap-2.5 py-2 border-b border-[#F1F5F9] last:border-0"
                        >
                          <div className="w-7 h-7 bg-[#E8EDF5] flex items-center justify-center text-[10px] font-bold text-[#1E3A6E] flex-shrink-0">
                            {c.specialty[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-medium text-gray-800">
                              {c.specialty}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {c.consultant_name || "Unassigned"}
                              {c.notes ? ` · ${c.notes}` : ""}
                            </div>
                          </div>
                          {canEdit && c.status !== "completed" ? (
                            <button
                              className="text-[11px] font-semibold text-[#D97706] hover:underline"
                              onClick={async () => {
                                try {
                                  await apiFetch(
                                    `/api/icu/${selectedBed.patient_id}/consults/${c.id}`,
                                    {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        status: "completed",
                                      }),
                                    },
                                  )
                                  refreshDetail()
                                } catch (error: any) {
                                  reportError(
                                    setNotice,
                                    error,
                                    "Failed to update consult.",
                                  )
                                }
                              }}
                            >
                              {c.status === "requested"
                                ? "Requested"
                                : c.status}{" "}
                              · Mark done
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-[#16A34A]">
                              {c.status}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </SectionCard>

                  <SectionCard
                    icon={<FiFileText aria-hidden />}
                    color="#1B4FD8"
                    title="Evaluations"
                    actions={
                      canEdit ? (
                        <Btn
                          variant="primary"
                          size="xs"
                          onClick={() => setAddEvalOpen(true)}
                        >
                          <FiPlus aria-hidden /> Add Evaluation
                        </Btn>
                      ) : undefined
                    }
                  >
                    <button
                      className="text-[#1B4FD8] text-[12px] font-semibold hover:underline"
                      onClick={() =>
                        onOpenPatientClinical?.(selectedBed.patient_id!)
                      }
                    >
                      Open Full Clinical Chart{" "}
                      <FiArrowRight className="inline" aria-hidden />
                    </button>
                  </SectionCard>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {addEvalOpen && selectedBed?.patient_id && (
        <AddEvaluationModal
          patientId={selectedBed.patient_id}
          admissionId={admissionId}
          setNotice={setNotice}
          onClose={() => setAddEvalOpen(false)}
          onSaved={() => {
            setAddEvalOpen(false)
            refreshDetail()
          }}
        />
      )}
    </div>
  )
}
