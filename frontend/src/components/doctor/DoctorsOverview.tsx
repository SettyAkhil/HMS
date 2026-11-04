import React, { useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FlaskConical,
  Inbox,
  Pill,
  Search,
  Send,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react"
import { useLiveClinic, formatElapsed } from "../../hooks/useLiveClinic"
import {
  doctorTimeline,
  getDoctorOversight,
  isOpenStage,
  type DoctorOversightRow,
  type DoctorPatientRow,
  type VisitStage,
} from "../../services/doctorOversight"
import {
  DOCTOR_ROSTER,
  DoctorPortalDatabase,
  getAllDoctorAccounts,
  type DoctorAccount,
} from "../../services/doctorPortalDb"
import { STAGE_HUES, TONE, band, gradient, specialtyHue, type Hue } from "./doctorTheme"

// ── Small pieces ─────────────────────────────────────────────────────────────

type IconType = React.ComponentType<{ size?: number ;className?: string }>

const initials = (name: string) =>
  name
    .replace(/^dr\.?\s*/i, "")
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "DR"

const when = (ms: number | null) =>
  ms === null
    ? "—"
    : new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

function Chip({ children, hue, className = "" }: { children: React.ReactNode ;hue?: Hue ;className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-[1px] rounded-[5px] border text-[10.5px] font-semibold whitespace-nowrap ${className}`}
      style={hue ? { backgroundColor: hue.soft, color: hue.text, borderColor: hue.border } : undefined}
    >
      {children}
    </span>
  )
}

const StageChip = ({ stage }: { stage: VisitStage }) => <Chip hue={STAGE_HUES[stage]}>{stage}</Chip>

function Avatar({ name, hue, size = 36, linked = true }: { name: string ;hue: Hue ;size?: number ;linked?: boolean }) {
  return (
    <span
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: linked ? gradient(hue) : "#F1F5F9",
        color: linked ? "#FFFFFF" : "#64748B",
      }}
    >
      {initials(name)}
    </span>
  )
}

function Kpi({ label, value, hue, icon: I }: { label: string ;value: number ;hue: Hue ;icon: IconType }) {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[12px] px-3.5 py-3 flex items-center gap-3 min-w-0" style={{ borderTop: `2px solid ${hue.solid}` }}>
      <span className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0 border" style={{ backgroundColor: hue.soft, borderColor: hue.border, color: hue.solid }}>
        <I size={17} />
      </span>
      <div className="min-w-0">
        <div className="text-[20px] font-bold leading-none tabular-nums text-[#0F172A]">{value}</div>
        <div className="text-[11px] text-[#64748B] mt-1 truncate">{label}</div>
      </div>
    </div>
  )
}

/** Five-step visit track: arrived → vitals → consultation → orders → completed, in the stage's colour. */
function Track({ row }: { row: DoctorPatientRow }) {
  const hue = STAGE_HUES[row.stage]
  return (
    <ol className="flex items-center gap-1" aria-label="Visit progress">
      {row.milestones.map((m, i) => (
        <li key={m.label} className="flex items-center gap-1" title={`${m.label}${m.at ? ` · ${when(m.at)}` : ""}`}>
          {i > 0 && <span className="w-3 sm:w-5 h-[2px] rounded" style={{ backgroundColor: m.done ? hue.solid : "#E2E8F0" }} />}
          <span
            className="w-2.5 h-2.5 rounded-full border-2"
            style={{ backgroundColor: m.done ? hue.solid : "#FFFFFF", borderColor: m.done ? hue.solid : "#CBD5E1" }}
          />
        </li>
      ))}
    </ol>
  )
}

function Empty({ icon: I, title, text }: { icon: IconType ;title: string ;text: string }) {
  return (
    <div className="py-12 text-center">
      <I size={26} className="mx-auto text-[#CBD5E1]" />
      <div className="mt-2 text-[13px] font-semibold text-[#334155]">{title}</div>
      <div className="mt-0.5 text-[12px] text-[#94A3B8]">{text}</div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = "patients" | "consultations" | "labs" | "pharmacy" | "activity"
const UNCLAIMED = "__unclaimed__"

/**
 * Administrator's view of every doctor: who they have waiting, what they have
 * seen, what they ordered and where each order is.
 */
export default function DoctorsOverview({
  onOpenWorkspace,
}: {
  onOpenWorkspace?: (doctor: DoctorAccount) => void
} = {}) {
  const { revision, now } = useLiveClinic()
  const data = useMemo(() => getDoctorOversight(), [revision])
  const [query, setQuery] = useState("")
  const [specialty, setSpecialty] = useState("All")
  const [show, setShow] = useState<"busy" | "all">("busy")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("patients")
  const [notice, setNotice] = useState<string | null>(null)

  const specialties = useMemo(
    () => ["All", ...Array.from(new Set(data.doctors.map((d) => d.specialty).filter(Boolean))).sort()],
    [data.doctors],
  )
  const hasWork = (d: DoctorOversightRow) => d.counts.patients + d.counts.labOrders + d.counts.prescriptions + d.counts.consultations > 0
  const list = data.doctors.filter((d) => {
    if (show === "busy" && !hasWork(d)) return false
    if (specialty !== "All" && d.specialty !== specialty) return false
    const q = query.trim().toLowerCase()
    return !q || d.name.toLowerCase().includes(q) || d.specialty.toLowerCase().includes(q) || d.account?.username.includes(q)
  })
  const selected = selectedKey && selectedKey !== UNCLAIMED ? data.doctors.find((d) => d.key === selectedKey) || null : null
  const showUnclaimed = selectedKey === UNCLAIMED
  const effective = selected || (showUnclaimed ? null : list[0] || null)

  const assign = (encounterId: string, doctorId: string) => {
    const result = DoctorPortalDatabase.claimEncounter(doctorId, encounterId)
    setNotice(result.message)
    window.setTimeout(() => setNotice(null), 3000)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F0F2F5]">
      <div className="px-5 lg:px-6 py-4 text-white flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-700/40" style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #29384E 100%)" }}>
        <span className="w-11 h-11 rounded-[12px] bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0">
          <Stethoscope size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold tracking-[-0.01em]">Doctors</h1>
          <p className="text-[12.5px] text-white/80">Every doctor's patients, consultations and orders, updated live.</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-white/90">
          <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse" />
          Live · {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col p-4 lg:p-5 gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 shrink-0">
          <Kpi label="Active doctors" value={data.totals.activeDoctors} icon={Stethoscope} hue={TONE.indigo} />
          <Kpi label="Waiting" value={data.totals.waiting} icon={Users} hue={TONE.orange} />
          <Kpi label="In consultation" value={data.totals.inConsultation} icon={Activity} hue={TONE.blue} />
          <Kpi label="Seen today" value={data.totals.seenToday} icon={ClipboardList} hue={TONE.green} />
          <Kpi label="Unclaimed" value={data.totals.unclaimed} icon={Inbox} hue={TONE.amber} />
          <Kpi label="Lab pending" value={data.totals.labPending} icon={FlaskConical} hue={TONE.violet} />
          <Kpi label="Critical results" value={data.totals.labCritical} icon={AlertTriangle} hue={TONE.red} />
          <Kpi label="At pharmacy" value={data.totals.rxAtPharmacy} icon={Pill} hue={TONE.teal} />
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
          {/* Doctor list */}
          <aside className={`lg:w-[330px] shrink-0 bg-white border border-[#DDE2EC] rounded-[12px] flex-col min-h-0 ${selectedKey ? "hidden lg:flex" : "flex"}`}>
            <div className="p-3 border-b border-[#EEF1F6] space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search doctor, specialty or username"
                  aria-label="Search doctors"
                  className="w-full h-9 pl-8 pr-3 rounded-[8px] border border-[#DDE2EC] bg-[#F8FAFC] text-[12.5px] focus:outline-none focus:border-[#1B4FD8] focus:bg-white"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  aria-label="Specialty"
                  className="flex-1 min-w-0 h-8 px-2 rounded-[7px] border border-[#DDE2EC] bg-white text-[12px] text-[#334155]"
                >
                  {specialties.map((s) => (
                    <option key={s} value={s}>{s === "All" ? "All specialties" : s}</option>
                  ))}
                </select>
                <div className="flex p-0.5 rounded-[8px] bg-[#F1F5F9]" role="tablist" aria-label="Which doctors">
                  {([["busy", "With activity"], ["all", "All"]] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={show === k}
                      onClick={() => setShow(k)}
                      className={`h-7 px-2.5 rounded-[6px] text-[11.5px] font-medium cursor-pointer ${show === k ? "bg-[#1B4FD8] text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]" : "text-[#64748B]"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 max-h-[60vh] lg:max-h-none">
              <button
                type="button"
                onClick={() => setSelectedKey(UNCLAIMED)}
                className="w-full text-left flex items-center gap-3 px-2.5 py-2.5 rounded-[9px] mb-1 cursor-pointer border transition-colors"
                style={
                  showUnclaimed
                    ? { backgroundColor: TONE.amber.soft, borderColor: TONE.amber.border }
                    : { backgroundColor: data.unclaimed.length ? "#FFFDF5" : "transparent", borderColor: data.unclaimed.length ? "#FEF3C7" : "transparent" }
                }
              >
                <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: gradient(TONE.amber) }}><Inbox size={16} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-[#0F172A]">Unclaimed patients</span>
                  <span className="block text-[11.5px] text-[#64748B]">Waiting with no doctor assigned</span>
                </span>
                <span
                  className="min-w-[24px] h-6 px-1.5 rounded-full text-[12px] font-bold tabular-nums flex items-center justify-center"
                  style={data.unclaimed.length ? { background: TONE.amber.solid, color: "#FFFFFF" } : { color: "#94A3B8" }}
                >
                  {data.unclaimed.length}
                </span>
              </button>
              {list.length === 0 ? (
                <Empty icon={Stethoscope} title="No doctors match" text={show === "busy" ? "Switch to All to see doctors with no activity yet." : "Try another name or specialty."} />
              ) : (
                list.map((d) => {
                  const active = effective?.key === d.key && !showUnclaimed
                  const hue = specialtyHue(d.specialty)
                  const inRoom = d.counts.inConsultation > 0
                  const queueCount = d.counts.open
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => {
                        setSelectedKey(d.key)
                        setTab("patients")
                      }}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[10px] cursor-pointer transition-all border-l-[4px] relative ${
                        active
                          ? "shadow-sm ring-1 ring-black/5"
                          : "hover:bg-[#F8FAFC]"
                      }`}
                      style={
                        active
                          ? { backgroundColor: "#F1F5F9", borderLeftColor: hue.solid }
                          : inRoom
                          ? { borderLeftColor: "#2563EB", backgroundColor: "#F0F7FF" }
                          : queueCount > 0
                          ? { borderLeftColor: "#F59E0B" }
                          : { borderLeftColor: "transparent" }
                      }
                    >
                      <Avatar name={d.name} hue={hue} linked={Boolean(d.account)} />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-[13px] font-bold text-[#0F172A] truncate">{d.name}</span>
                          {inRoom ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#DBEAFE] text-[#1D4ED8] animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                              In Room
                            </span>
                          ) : queueCount > 0 ? (
                            <span className="inline-flex items-center text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                              {queueCount} waiting
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-[#10B981] bg-[#ECFDF5] px-1.5 py-0.5 rounded-full">
                              Ready
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11.5px] truncate mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: hue.solid }} />
                          <span style={{ color: d.specialty ? hue.text : "#94A3B8" }} className="truncate font-medium">{d.specialty || "General"}</span>
                          {d.room && <span className="text-[#64748B] font-semibold text-[11px] bg-slate-100 px-1 py-0.2 rounded">R: {d.room}</span>}
                        </span>
                        <span className="flex flex-wrap gap-1 mt-1.5">
                          {d.counts.open > 0 && <Chip hue={TONE.amber}>{d.counts.open} in queue</Chip>}
                          {d.counts.labPending > 0 && <Chip hue={TONE.violet}>{d.counts.labPending} lab</Chip>}
                          {d.counts.rxAtPharmacy > 0 && <Chip hue={TONE.teal}>{d.counts.rxAtPharmacy} Rx</Chip>}
                          {d.counts.patients > 0 && d.counts.open === 0 && <Chip hue={TONE.green}>{d.counts.patients} seen today</Chip>}
                          {!d.account && <span className="text-[10px] text-[#94A3B8] italic">Unlinked</span>}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          {/* Detail */}
          <section className={`flex-1 min-w-0 min-h-0 flex-col lg:overflow-y-auto ${selectedKey ? "flex" : "hidden lg:flex"}`}>
            {notice && (
              <div role="status" className="mb-3 shrink-0 rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5 text-[12.5px] text-[#15803D]">{notice}</div>
            )}
            {showUnclaimed ? (
              <UnclaimedPanel rows={data.unclaimed} now={now} onBack={() => setSelectedKey(null)} onAssign={assign} />
            ) : effective ? (
              <DoctorDetail
                key={effective.key}
                row={effective}
                tab={tab}
                onTab={setTab}
                now={now}
                onBack={() => setSelectedKey(null)}
                onOpenWorkspace={onOpenWorkspace}
              />
            ) : (
              <div className="flex-1 bg-white border border-[#DDE2EC] rounded-[12px]">
                <Empty icon={Stethoscope} title="No doctor activity yet" text="Patients appear here as soon as reception assigns them to a doctor." />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

// ── One doctor ───────────────────────────────────────────────────────────────

function DoctorDetail({
  row,
  tab,
  onTab,
  now,
  onBack,
  onOpenWorkspace,
}: {
  row: DoctorOversightRow
  tab: Tab
  onTab: (t: Tab) => void
  now: number
  onBack: () => void
  onOpenWorkspace?: (doctor: DoctorAccount) => void
}) {
  const [onlyOpen, setOnlyOpen] = useState(false)
  const c = row.counts
  const hue = row.account ? specialtyHue(row.specialty) : TONE.slate
  const timeline = useMemo(() => doctorTimeline(row), [row])
  const tabs: { key: Tab ;label: string ;count: number }[] = [
    { key: "patients", label: "Patients", count: c.patients },
    { key: "consultations", label: "Consultations", count: c.consultations },
    { key: "labs", label: "Lab orders", count: c.labOrders },
    { key: "pharmacy", label: "Prescriptions", count: c.prescriptions },
    { key: "activity", label: "Activity", count: timeline.length },
  ]
  const patients = onlyOpen ? row.patients.filter((p) => isOpenStage(p.stage)) : row.patients
  const acc = row.account
  const stats: { label: string ;value: number ;hue: Hue ;icon: IconType }[] = [
    { label: "Waiting", value: c.waiting + c.withNurse, hue: TONE.orange, icon: Users },
    { label: "In consultation", value: c.inConsultation, hue: TONE.blue, icon: Activity },
    { label: "Seen today", value: c.seenToday, hue: TONE.green, icon: ClipboardList },
    { label: "Orders sent", value: c.dispatched, hue: TONE.indigo, icon: Send },
    { label: "Lab pending", value: c.labPending, hue: TONE.violet, icon: FlaskConical },
    { label: "At pharmacy", value: c.rxAtPharmacy, hue: TONE.teal, icon: Pill },
  ]

  return (
    <div className="bg-white border border-[#DDE2EC] rounded-[12px] flex flex-col min-h-0 lg:flex-1 overflow-hidden">
      {/* Coloured band in the doctor's specialty hue */}
      <div className="px-4 sm:px-5 pt-4 pb-4 text-white" style={{ background: band(hue) }}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onBack} className="lg:hidden h-9 w-9 -ml-1 rounded-[8px] text-white hover:bg-white/15 inline-flex items-center justify-center cursor-pointer" aria-label="Back to doctors">
            <ArrowLeft size={18} />
          </button>
          <span className="w-12 h-12 rounded-full bg-white/20 ring-2 ring-white/60 flex items-center justify-center text-[15px] font-bold shrink-0">{initials(row.name)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[18px] font-bold tracking-[-0.01em]">{row.name}</h2>
              {acc ? (
                <span className="text-[10.5px] font-semibold bg-white/20 ring-1 ring-white/30 px-2 py-[1px] rounded-full">{acc.specialty}</span>
              ) : (
                <span className="text-[10.5px] font-semibold bg-[#FEF3C7] text-[#92400E] px-2 py-[1px] rounded-full">No sign-in account</span>
              )}
            </div>
            <div className="text-[12px] text-white/85">
              {acc ? [acc.qualification, acc.room, `Staff ID ${acc.staffId}`].join(" · ") : `${row.specialty || "Specialty not recorded"} · records carry this name but match no doctor account`}
            </div>
            {acc && (
              <div className="text-[11.5px] text-white/70 mt-0.5">
                Signs in as <span className="font-mono text-white/90">{acc.username}</span>
                {row.lastActivity ? ` · last activity ${when(row.lastActivity)}` : ""}
              </div>
            )}
          </div>
          {acc && onOpenWorkspace && (
            <button
              type="button"
              onClick={() => onOpenWorkspace(acc)}
              className="px-3.5 py-2 rounded-[8px] bg-white text-[#1E293B] hover:bg-slate-100 text-[12px] font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ml-auto self-center"
            >
              <span>🩺</span>
              <span>Open Doctor Workspace</span>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 sm:px-5 py-3 border-b border-[#EEF1F6] grid grid-cols-3 sm:grid-cols-6 gap-2 bg-[#F8FAFC]">
        {stats.map((st) => (
          <div key={st.label} className="rounded-[9px] border border-[#E2E8F0] bg-white px-2.5 py-2 flex items-center gap-2.5 shadow-2xs">
            <span className="w-7 h-7 rounded-[7px] flex items-center justify-center shrink-0 border" style={{ backgroundColor: st.hue.soft, borderColor: st.hue.border, color: st.hue.solid }}>
              <st.icon size={13} />
            </span>
            <div className="min-w-0">
              <div className="text-[16px] font-bold tabular-nums leading-none text-[#0F172A]">{st.value}</div>
              <div className="text-[10.5px] mt-1 truncate text-[#64748B]">{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      <nav className="px-2 sm:px-3 flex overflow-x-auto border-b border-[#EEF1F6] shrink-0" aria-label="Doctor details">
        {tabs.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className="h-10 px-3 text-[12.5px] font-medium whitespace-nowrap border-b-2 -mb-px cursor-pointer inline-flex items-center gap-1.5"
              style={active ? { borderBottomColor: hue.solid, color: hue.text } : { borderBottomColor: "transparent", color: "#64748B" }}
            >
              {t.label}
              <span
                className="text-[10.5px] tabular-nums px-1.5 rounded-full"
                style={active ? { backgroundColor: hue.soft, color: hue.text } : { color: "#94A3B8" }}
              >
                {t.count}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
        {tab === "patients" &&
          (row.patients.length === 0 ? (
            <Empty icon={UserRound} title="No patients assigned" text="Visits assigned to this doctor appear here with their progress." />
          ) : (
            <>
              <label className="flex items-center gap-2 text-[12px] text-[#475569] mb-2.5 cursor-pointer w-fit">
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} style={{ accentColor: hue.solid }} />
                Only patients still waiting or in consultation
              </label>
              <div className="space-y-2">
                {patients.map((p) => (
                  <PatientRow key={p.encounter.id} row={p} now={now} />
                ))}
                {patients.length === 0 && <Empty icon={UserRound} title="Nobody waiting" text="Untick the filter to see finished visits." />}
              </div>
            </>
          ))}

        {tab === "consultations" &&
          (row.consultations.length === 0 ? (
            <Empty icon={ClipboardList} title="No consultations recorded" text="Consultations started in the doctor's workspace are listed here." />
          ) : (
            <Table
              hue={hue}
              head={["Opened", "Patient", "Diagnosis", "Medicines", "Tests", "Status"]}
              rows={[...row.consultations]
                .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
                .map((cons) => [
                  when(Date.parse(cons.createdAt) || null),
                  <span key="p"><span className="font-medium text-[#0F172A]">{cons.patientName}</span><span className="block text-[11px] text-[#94A3B8] font-mono">{cons.umr} · {cons.opNumber}</span></span>,
                  cons.diagnosis || <span className="text-[#94A3B8]">Not recorded</span>,
                  <Chip key="m" hue={TONE.teal}>{cons.medications.length}</Chip>,
                  <Chip key="t" hue={TONE.violet}>{cons.labTests.length}</Chip>,
                  cons.dispatch === "Dispatched" ? (
                    <Chip key="s" hue={TONE.green}>Sent {when(Date.parse(cons.dispatchedAt || "") || null)}</Chip>
                  ) : (
                    <Chip key="s" hue={TONE.amber}>Draft</Chip>
                  ),
                ])}
            />
          ))}

        {tab === "labs" &&
          (row.labOrders.length === 0 ? (
            <Empty icon={FlaskConical} title="No lab orders" text="Investigations this doctor orders are tracked here from billing to result." />
          ) : (
            <Table
              hue={hue}
              head={["Ordered", "Patient", "Tests", "Billing", "Status"]}
              rows={[...row.labOrders]
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                .map((o) => [
                  when(Date.parse(o.createdAt) || null),
                  <span key="p"><span className="font-medium text-[#0F172A]">{o.patientName}</span><span className="block text-[11px] text-[#94A3B8] font-mono">{o.id}</span></span>,
                  <span key="t" className="flex flex-wrap gap-1">
                    {o.tests.map((t) => (
                      <Chip key={t.id} hue={/critical/i.test(t.flag || "") ? TONE.red : t.flag ? TONE.amber : TONE.slate}>
                        {t.name}{t.result ? `: ${t.result}${t.resultUnit ? ` ${t.resultUnit}` : ""}` : ""}
                      </Chip>
                    ))}
                  </span>,
                  <Chip key="b" hue={o.billing?.status === "Paid" ? TONE.green : o.billing?.status === "Pending" ? TONE.amber : TONE.slate}>{o.billing?.status || "—"}</Chip>,
                  <Chip key="s" hue={o.status === "Completed" ? TONE.green : o.status === "Cancelled" ? TONE.slate : TONE.violet}>{o.status}</Chip>,
                ])}
            />
          ))}

        {tab === "pharmacy" &&
          (row.prescriptions.length === 0 ? (
            <Empty icon={Pill} title="No prescriptions" text="Prescriptions sent to the pharmacy are tracked here until dispensed." />
          ) : (
            <Table
              hue={hue}
              head={["Sent", "Patient", "Medicines", "Pharmacy status", "Dispensing"]}
              rows={[...row.prescriptions]
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
                .map((p) => [
                  when(Date.parse(p.createdAt) || null),
                  <span key="p"><span className="font-medium text-[#0F172A]">{p.patientName}</span><span className="block text-[11px] text-[#94A3B8] font-mono">{p.id}</span></span>,
                  <span key="m" className="text-[12px] text-[#334155]">{p.items.map((it) => it.medicineName).slice(0, 3).join(", ")}{p.items.length > 3 ? ` +${p.items.length - 3}` : ""}</span>,
                  <Chip key="s" hue={p.status === "Dispensed" ? TONE.green : /reject|cancel/i.test(p.status) ? TONE.red : TONE.blue}>{p.status}</Chip>,
                  <Chip key="d" hue={p.dispensingStatus === "Dispensed" ? TONE.green : p.dispensingStatus === "Cancelled" ? TONE.slate : TONE.teal}>{p.dispensingStatus}</Chip>,
                ])}
            />
          ))}

        {tab === "activity" &&
          (timeline.length === 0 ? (
            <Empty icon={Activity} title="No activity yet" text="Arrivals, consultations, orders and results appear here in order." />
          ) : (
            <ol className="relative border-l-2 border-[#EEF1F6] ml-2 space-y-3.5 py-1">
              {timeline.map((ev, i) => {
                const evHue = ev.kind === "lab" ? TONE.violet : ev.kind === "pharmacy" ? TONE.teal : ev.kind === "consultation" ? TONE.blue : TONE.orange
                return (
                  <li key={i} className="pl-4 relative">
                    <span className="absolute -left-[7px] top-[5px] w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: evHue.solid, boxShadow: `0 0 0 2px ${evHue.border}` }} />
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[12.5px] font-semibold" style={{ color: evHue.text }}>{ev.title}</span>
                      <span className="text-[12px] text-[#334155]">{ev.patient}</span>
                      <span className="text-[11px] text-[#94A3B8]">{when(ev.at)}</span>
                    </div>
                    {ev.detail && <div className="text-[11.5px] text-[#64748B] mt-0.5">{ev.detail}</div>}
                  </li>
                )
              })}
            </ol>
          ))}
      </div>
    </div>
  )
}

function PatientRow({ row, now }: { row: DoctorPatientRow ;now: number }) {
  const e = row.encounter
  const open = isOpenStage(row.stage)
  const hue = STAGE_HUES[row.stage]
  const elapsed = open && row.arrivalMs ? Math.max(0, Math.floor((now - row.arrivalMs) / 60000)) : 0
  const isOverdue = open && elapsed >= 25

  return (
    <div
      className="rounded-[10px] border px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-l-4 transition-all shadow-xs hover:shadow-md"
      style={{
        backgroundColor: open ? hue.soft : "#FFFFFF",
        borderColor: open ? hue.border : "#EEF1F6",
        borderLeftColor: hue.solid,
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] text-white shrink-0 shadow-xs"
          style={{ background: gradient(hue) }}
        >
          {initials(e.patientName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-bold text-[#0F172A]">{e.patientName}</span>
            <StageChip stage={row.stage} />
            {e.isNew ? (
              <span className="inline-flex items-center px-1.5 py-[1px] rounded-[5px] text-[10.5px] font-bold bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]">
                New
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-[1px] rounded-[5px] text-[10.5px] font-medium bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
                Revisit
              </span>
            )}
            {open && row.stage === "In consultation" && (
              <span className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                In Room
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-[#64748B] font-mono mt-0.5">
            {[e.umr, e.opNumber, e.age ? `${e.age}${e.sex?.[0] || ""}` : "", e.dept].filter(Boolean).join(" · ")}
          </div>
          <div className="text-[12px] text-[#334155] mt-1 line-clamp-1 font-medium">
            {e.chiefComplaint ? (
              <span className="text-[#1E293B] italic">"{e.chiefComplaint}"</span>
            ) : (
              <span className="text-[#94A3B8]">No complaint recorded</span>
            )}
            {e.diagnosis ? <span className="text-[#2563EB] font-semibold not-italic"> · Dx: {e.diagnosis}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-1.5 shrink-0">
        <Track row={row} />
        <span
          className={`text-[11px] tabular-nums font-bold px-2 py-0.5 rounded-full border ${
            open
              ? isOverdue
                ? "bg-red-100 text-red-800 border-red-200 animate-pulse"
                : row.stage === "In consultation"
                  ? "bg-blue-100 text-blue-800 border-blue-200"
                  : "bg-amber-100 text-amber-800 border-amber-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          {open && row.arrivalMs
            ? `${row.stage === "In consultation" ? "consulting" : "waiting"} ${formatElapsed(new Date(row.arrivalMs).toISOString(), now)}`
            : when(row.arrivalMs)}
        </span>
        {(row.labOrders.length > 0 || row.prescriptions.length > 0) && (
          <span className="flex gap-1">
            {row.labOrders.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-[#FAF5FF] text-[#7E22CE] border border-[#E9D5FF]">
                {row.labOrders.length} lab
              </span>
            )}
            {row.prescriptions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-[#F0FDFA] text-[#0F766E] border border-[#99F6E4]">
                {row.prescriptions.length} Rx
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

function Table({ head, rows, hue }: { head: string[] ;rows: React.ReactNode[][] ;hue: Hue }) {
  return (
    <div className="rounded-[10px] border border-[#EEF1F6] overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-[0.06em]" style={{ backgroundColor: hue.soft, color: hue.text }}>
            {head.map((h) => (
              <th key={h} className="text-left font-semibold px-3 py-2 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-[#F1F5F9] align-top hover:bg-[#FAFBFD]">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-[#334155]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Unclaimed ────────────────────────────────────────────────────────────────

function UnclaimedPanel({
  rows,
  now,
  onBack,
  onAssign,
}: {
  rows: DoctorPatientRow[]
  now: number
  onBack: () => void
  onAssign: (encounterId: string, doctorId: string) => void
}) {
  return (
    <div className="bg-white border border-[#DDE2EC] rounded-[12px] flex flex-col min-h-0 lg:flex-1 overflow-hidden">
      <div className="px-4 sm:px-5 py-4 flex items-center gap-3 text-white" style={{ background: band(TONE.amber) }}>
        <button type="button" onClick={onBack} className="lg:hidden h-9 w-9 -ml-1 rounded-[8px] text-white hover:bg-white/15 inline-flex items-center justify-center cursor-pointer" aria-label="Back to doctors">
          <ArrowLeft size={18} />
        </button>
        <span className="w-11 h-11 rounded-full bg-white/20 ring-2 ring-white/60 flex items-center justify-center shrink-0"><Inbox size={20} /></span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold">Unclaimed patients</h2>
          <p className="text-[12px] text-white/85">Waiting with no doctor assigned. Assign one here, or a doctor in the same specialty can take them from their workspace.</p>
        </div>
        <span className="ml-auto text-[22px] font-bold tabular-nums">{rows.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-2">
        {rows.length === 0 ? (
          <Empty icon={Inbox} title="Everyone has a doctor" text="Patients registered without a doctor appear here until someone takes them." />
        ) : (
          rows.map((r) => {
            const e = r.encounter
            const hue = STAGE_HUES[r.stage]
            const deptHue = specialtyHue(e.dept)
            const allDocs = getAllDoctorAccounts()
            const inDept = allDocs.filter((d) => d.specialty === e.dept)
            const others = allDocs.filter((d) => d.specialty !== e.dept)
            return (
              <div
                key={e.id}
                className="rounded-[10px] border border-[#FDE68A] bg-[#FFFDF5] border-l-4 border-l-[#D97706] px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-xs hover:shadow-sm transition-shadow"
              >
                <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] text-white shrink-0 shadow-xs" style={{ background: gradient(TONE.amber) }}>
                  {initials(e.patientName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13.5px] font-bold text-[#0F172A]">{e.patientName}</span>
                    <StageChip stage={r.stage} />
                    {e.dept && <Chip hue={deptHue}>{e.dept}</Chip>}
                    {e.isNew && <Chip hue={TONE.green}>New Patient</Chip>}
                  </div>
                  <div className="text-[11.5px] text-[#64748B] font-mono mt-0.5">{[e.umr, e.opNumber].filter(Boolean).join(" · ")}</div>
                  <div className="text-[12px] text-[#334155] mt-1 line-clamp-1 italic font-medium">"{e.chiefComplaint || "No complaint recorded"}"</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    {r.arrivalMs ? `waiting ${formatElapsed(new Date(r.arrivalMs).toISOString(), now)}` : ""}
                  </span>
                  <select
                    defaultValue=""
                    aria-label={`Assign a doctor to ${e.patientName}`}
                    onChange={(ev) => ev.target.value && onAssign(e.id, ev.target.value)}
                    className="h-9 px-3 rounded-[8px] border text-[12px] font-semibold max-w-[220px] cursor-pointer shadow-xs hover:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    style={{ borderColor: TONE.amber.border, backgroundColor: "#FFFFFF", color: TONE.amber.text }}
                  >
                    <option value="" disabled>Assign a doctor…</option>
                    {inDept.length > 0 && (
                      <optgroup label={e.dept}>
                        {inDept.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Other specialties">
                      {others.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialty}</option>)}
                    </optgroup>
                  </select>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
