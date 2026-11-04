import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useBranding } from "../branding/DocumentBranding"
import { OpCardPreview, opCardDataFor, printOpCard } from "../opcard/OpCard"
import { useBarcodeScanner } from "../opcard/JourneyScan"
import { compileCardRecord, compilePatientRecord, fetchCardToken, patientPageUrl, toMs, type PatientRecord } from "./patientRecord"
import { downloadPatientHistory } from "./historyPdf"

/**
 * The page a scanned OP card opens (`#/patient/<code>`, in its own tab):
 * everything recorded about the patient end to end, a download of the whole
 * history as one PDF, and a print of the card alone.
 */

const fmt = (ms: number | null | undefined) =>
  ms == null ? "—" : new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const fmtDay = (ms: number | null | undefined) =>
  ms == null ? "—" : new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
const fmtIso = (iso: string | null | undefined) => {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? fmt(t) : iso
}
const money = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`

const STAGE: Record<string, { label: string ;color: string }> = {
  registration: { label: "Registration", color: "#475569" },
  op: { label: "OP visit", color: "#1B4FD8" },
  queue: { label: "Queue", color: "#64748B" },
  consultation: { label: "Consultation", color: "#1D4ED8" },
  er: { label: "Emergency", color: "#DC2626" },
  bed: { label: "Bed", color: "#0891B2" },
  icu: { label: "ICU", color: "#B91C1C" },
  ot: { label: "OT", color: "#7C3AED" },
  lab: { label: "Lab", color: "#D97706" },
  pharmacy: { label: "Pharmacy", color: "#DB2777" },
  billing: { label: "Billing", color: "#15803D" },
  clinical: { label: "Clinical", color: "#0F766E" },
  care_plan: { label: "Care plan", color: "#0F766E" },
  orders: { label: "Orders", color: "#9333EA" },
  documents: { label: "Documents", color: "#64748B" },
}

/** Set by the sign-in link; App opens this patient's page after login. */
export const PENDING_PATIENT_PAGE_KEY = "hospai_pending_patient_page"

function signedIn(): boolean {
  try {
    return Boolean(localStorage.getItem("hospai_current_user"))
  } catch {
    return false
  }
}

function Section({ id, title, count, children }: { id: string ;title: string ;count?: number ;children: React.ReactNode }) {
  return (
    <section id={id} className="bg-white border border-[#E2E8F0] rounded-[8px] scroll-mt-20">
      <div className="px-4 py-2.5 border-b border-[#EDF1F7] flex items-center gap-2">
        <h2 className="text-[13px] font-bold text-[#0F172A]">{title}</h2>
        {count != null && <span className="text-[11px] text-[#94A3B8]">{count}</span>}
      </div>
      <div className="p-4 overflow-x-auto">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-[#94A3B8]">{children}</div>
}

function Table({ head, rows }: { head: string[] ;rows: React.ReactNode[][] }) {
  return (
    <table className="w-full text-[12px] border-collapse min-w-[560px]">
      <thead>
        <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#64748B] border-b border-[#E2E8F0]">
          {head.map((h) => (
            <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-[#F1F5F9]">
        {rows.map((r, i) => (
          <tr key={i} className="align-top">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-3 text-[#1E293B]">{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * `code` (`#/patient/<UMR>`) is for signed-in staff only: UMRs are sequential,
 * so a page addressed by UMR must never open without a login. `cardToken`
 * (`#/card/<token>`, what the card's QR holds) opens with no login, because
 * the token is an unguessable secret only that card carries.
 */
export default function PatientRecordPage({ code = "", cardToken = null }: { code?: string ;cardToken?: string | null }) {
  const localBranding = useBranding()
  const [record, setRecord] = useState<PatientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardStatus, setCardStatus] = useState<"ok" | "unknown" | "offline">("ok")
  const [serverHospital, setServerHospital] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(cardToken)
  const [reissuing, setReissuing] = useState(false)
  const staff = signedIn()
  const allowed = staff || Boolean(cardToken)
  // Signed out on a phone, this browser has no hospital settings; use the server's name.
  const branding = useMemo(
    () => (!staff && serverHospital ? { ...localBranding, hospitalName: serverHospital } : localBranding),
    [staff, serverHospital, localBranding],
  )

  const load = useCallback(async () => {
    try {
      if (cardToken) {
        const res = await compileCardRecord(cardToken)
        setCardStatus(res.status)
        setServerHospital(res.hospitalName)
        if (res.record) setRecord(res.record)
      } else {
        setRecord(await compilePatientRecord(code))
      }
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the record")
    } finally {
      setLoading(false)
    }
  }, [code, cardToken])

  // Live: reload on focus, on any store write from another tab, and every 30 s.
  useEffect(() => {
    if (!allowed) return
    setLoading(true)
    load()
    const t = window.setInterval(load, 30_000)
    const onFocus = () => load()
    const onStorage = () => load()
    window.addEventListener("focus", onFocus)
    window.addEventListener("storage", onStorage)
    return () => {
      window.clearInterval(t)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("storage", onStorage)
    }
  }, [load, allowed])

  // Scanning another card on this page opens that patient here.
  useBarcodeScanner(
    useCallback((c: string) => {
      const link = /#\/card\/[A-Za-z0-9_-]+/.exec(c)
      window.location.assign(link ? `${window.location.origin}${window.location.pathname}${link[0]}` : patientPageUrl(c))
    }, []),
  )

  useEffect(() => {
    if (record?.patient.name) document.title = `${record.patient.name} · ${record.id} · Patient record`
  }, [record?.patient.name, record?.id])

  const card = useMemo(
    () =>
      record
        ? opCardDataFor(record.id, {
            patientName: record.patient.name || record.id,
            age: record.patient.age,
            sex: record.patient.sex,
            phone: record.patient.phone,
            bloodGroup: record.patient.bloodGroup,
            registeredOn: record.patient.registeredOn,
          })
        : null,
    [record],
  )

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center p-6">
        <div className="bg-white border border-[#E2E8F0] rounded-[8px] p-8 max-w-md text-center">
          <div className="text-[15px] font-bold text-[#0F172A]">Sign in to view patient records</div>
          <p className="text-[12.5px] text-[#64748B] mt-2">
            Patient records open only on a device signed in to the HMS. Sign in once on
            this device (phone or computer) and this patient opens automatically.
          </p>
          <a
            href={`${window.location.origin}${window.location.pathname}`}
            onClick={() => {
              // Come straight back to this patient once signed in.
              try {
                sessionStorage.setItem(PENDING_PATIENT_PAGE_KEY, code)
              } catch {}
            }}
            className="inline-block mt-4 px-4 py-2 bg-[#1B4FD8] text-white text-[12.5px] font-semibold rounded-[6px]"
          >
            Sign in and open {code}
          </a>
        </div>
      </div>
    )
  }

  const r = record
  const p = r?.patient
  const nav = [
    ["visits", "OP visits"],
    ["admissions", "Admissions"],
    ["consultations", "Consultations"],
    ["prescriptions", "Prescriptions"],
    ["labs", "Lab"],
    ["icu", "ICU"],
    ["billing", "Billing"],
    ["timeline", "Timeline"],
  ]

  return (
    <div className="min-h-screen bg-[#F5F7FB] text-[#0F172A]">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-[#E2E8F0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold truncate">{branding.hospitalName}</div>
            <div className="text-[10.5px] text-[#64748B] uppercase tracking-wider">Patient record</div>
          </div>
          {staff && r?.found && (
            <button
              type="button"
              disabled={reissuing}
              title="For a lost or replaced card: the old card's QR stops working and a new one is issued"
              onClick={async () => {
                if (!r) return
                if (!window.confirm("Cancel this patient's current card link and issue a new one? The old card's QR will stop working; print the new card.")) return
                setReissuing(true)
                try {
                  const t = await fetchCardToken(r.id, true)
                  if (!t) {
                    setError("Could not reissue the card link -- the clinical server did not accept the request.")
                    return
                  }
                  setToken(t)
                  if (cardToken) window.location.replace(`${window.location.pathname}#/card/${t}`)
                } finally {
                  setReissuing(false)
                }
              }}
              className="px-3 py-1.5 text-[12px] font-semibold border border-[#CBD5E1] rounded-[6px] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              {reissuing ? "Reissuing…" : "Reissue card link"}
            </button>
          )}
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-1.5 text-[12px] font-semibold border border-[#CBD5E1] rounded-[6px] hover:bg-slate-50 cursor-pointer"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={!card}
            onClick={() => card && printOpCard(card, branding, token)}
            className="px-3 py-1.5 text-[12px] font-semibold border border-[#CBD5E1] rounded-[6px] hover:bg-slate-50 cursor-pointer disabled:opacity-50"
          >
            Print card
          </button>
          <button
            type="button"
            disabled={!r?.found || downloading}
            onClick={async () => {
              if (!r) return
              setDownloading(true)
              try {
                await downloadPatientHistory(r)
              } finally {
                setDownloading(false)
              }
            }}
            className="px-3.5 py-1.5 text-[12px] font-semibold bg-[#1B4FD8] hover:bg-[#1740B4] text-white rounded-[6px] cursor-pointer disabled:opacity-50"
          >
            {downloading ? "Preparing PDF…" : "Download complete history"}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-4">
        {loading && !r && <div className="text-[13px] text-[#64748B]">Loading patient record…</div>}
        {error && <div className="text-[12.5px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 rounded-[6px]">{error}</div>}
        {cardToken && !r && !loading && cardStatus !== "ok" && (
          <div className="bg-white border border-[#E2E8F0] rounded-[8px] p-6">
            <div className="text-[15px] font-bold">
              {cardStatus === "unknown" ? "This card is no longer valid" : "The hospital server could not be reached"}
            </div>
            <p className="text-[12.5px] text-[#64748B] mt-1">
              {cardStatus === "unknown"
                ? "The card may have been replaced. Please ask at the reception desk for a new card."
                : "Check the connection and try again."}
            </p>
          </div>
        )}
        {r && !r.found && (
          <div className="bg-white border border-[#E2E8F0] rounded-[8px] p-6">
            <div className="text-[15px] font-bold">No patient found for {code}</div>
            <p className="text-[12.5px] text-[#64748B] mt-1">
              {r.backendReachable ? "Check the card, or search the patient at Reception." : "The clinical server could not be reached; only records on this computer were searched."}
            </p>
          </div>
        )}

        {r && r.found && p && card && (
          <>
            {!r.backendReachable && (
              <div className="text-[12px] text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-3 py-2 rounded-[6px]">
                The clinical server could not be reached. Showing records held on this computer; admissions and server-side events may be missing.
              </div>
            )}

            {/* Patient header */}
            <div className="bg-white border border-[#E2E8F0] rounded-[8px] p-4 sm:p-5 flex flex-col lg:flex-row gap-5">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[22px] font-extrabold tracking-tight">{p.name || r.id}</h1>
                  <span
                    className={`text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-[6px] border ${
                      r.status.kind === "IP"
                        ? "bg-[#ECFEFF] text-[#0E7490] border-[#A5F3FC]"
                        : r.status.kind === "OP"
                          ? "bg-[#EFF6FF] text-[#1B4FD8] border-[#BFDBFE]"
                          : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    {r.status.kind === "IP" ? (r.status.bed ? "Inpatient · in hospital" : "Inpatient · latest episode") : r.status.kind === "OP" ? "Outpatient" : "No visits yet"}
                  </span>
                </div>
                <div className="text-[13px] text-[#475569] mt-1">
                  UMR <span className="font-mono font-bold text-[#1B4FD8]">{r.id}</span>
                  {[p.age != null && p.age !== "" ? `${p.age} yrs` : null, p.sex, p.bloodGroup ? `Blood ${p.bloodGroup}` : null, p.phone]
                    .filter(Boolean)
                    .map((x) => ` · ${x}`)
                    .join("")}
                </div>
                {p.address && <div className="text-[12px] text-[#64748B] mt-0.5">{p.address}</div>}
                {p.registeredOn && <div className="text-[12px] text-[#64748B] mt-0.5">Registered {fmtIso(p.registeredOn)}</div>}

                {r.status.bed && (
                  <div className="mt-3 border border-[#A5F3FC] bg-[#ECFEFF] rounded-[6px] px-3 py-2 text-[12.5px]">
                    <span className="font-semibold text-[#0E7490]">Currently admitted: </span>
                    {r.status.bed.ward} / Room {r.status.bed.room_no} / Bed {r.status.bed.bed_no}
                    {r.status.bed.allocated_at ? ` · since ${fmtIso(r.status.bed.allocated_at)}` : ""}
                    {r.status.bed.admission_notes ? ` · ${r.status.bed.admission_notes}` : ""}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {[
                    ["OP visits", r.opVisits.length],
                    ["Admissions", r.stays.length],
                    ["Prescriptions", r.prescriptions.length],
                    ["Lab orders", r.labOrders.length],
                    ["Billed", money(r.billing.billed)],
                    ["Paid", money(r.billing.paid)],
                    ["Due", money(r.billing.due)],
                    ["ICU chart days", r.icuDays.length],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="border border-[#E2E8F0] rounded-[6px] px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{l}</div>
                      <div className={`text-[15px] font-bold mt-0.5 ${l === "Due" && r.billing.due > 0 ? "text-[#B45309]" : ""}`}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 shrink-0">
                <OpCardPreview card={card} branding={branding} zoom={1.1} cardToken={token} />
                <button type="button" onClick={() => printOpCard(card, branding, token)} className="text-[12px] font-semibold text-[#1B4FD8] hover:underline cursor-pointer">
                  Print this card
                </button>
              </div>
            </div>

            {/* Section nav */}
            <nav className="flex flex-wrap gap-1.5">
              {nav.map(([id, label]) => (
                <a key={id} href={`#/patient/${encodeURIComponent(code)}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }) }} className="px-2.5 py-1 text-[11.5px] font-semibold bg-white border border-[#E2E8F0] rounded-[6px] hover:border-[#1B4FD8] text-[#334155]">
                  {label}
                </a>
              ))}
            </nav>

            <Section id="visits" title="Outpatient visits" count={r.opVisits.length}>
              {r.opVisits.length === 0 ? (
                <Empty>No OP visits recorded.</Empty>
              ) : (
                <Table
                  head={["Date", "OP No.", "Department", "Doctor", "Complaint", "Diagnosis", "Prescribed", "Status"]}
                  rows={r.opVisits.map((v) => [
                    v.dateOnly ? fmtDay(v.at) : fmt(v.at),
                    <span className="font-mono font-semibold">{v.opNo}</span>,
                    v.dept || "—",
                    v.doctor || "—",
                    v.complaint || "—",
                    v.diagnosis || "—",
                    v.prescribed || "—",
                    v.status || "—",
                  ])}
                />
              )}
            </Section>

            <Section id="admissions" title="Admissions (IP)" count={r.stays.length}>
              {r.stays.length === 0 ? (
                <Empty>No admissions recorded.</Empty>
              ) : (
                <div className="space-y-3">
                  {r.stays.map((s, i) => (
                    <div key={i} className="border border-[#E2E8F0] rounded-[6px] p-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                        <span className="font-semibold">{fmt(s.admittedAt)}</span>
                        <span className="text-[#94A3B8]">→</span>
                        <span className={s.dischargedAt == null ? "font-semibold text-[#0E7490]" : ""}>
                          {s.dischargedAt == null ? "In hospital" : fmt(s.dischargedAt)}
                        </span>
                        <span className="text-[#64748B]">· {s.firstBed}{s.lastBed !== s.firstBed ? ` → ${s.lastBed}` : ""}</span>
                        {s.transfers > 0 && <span className="text-[#64748B]">· {s.transfers} transfer{s.transfers === 1 ? "" : "s"}</span>}
                      </div>
                      {s.events.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {s.events.map((e, j) => (
                            <li key={j} className="text-[12px] text-[#334155]">
                              <span className="font-mono text-[10.5px] text-[#94A3B8] mr-2">{fmt(toMs(e.timestamp))}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider mr-1.5" style={{ color: STAGE[e.stage]?.color ?? "#64748B" }}>
                                {STAGE[e.stage]?.label ?? e.stage}
                              </span>
                              {e.label}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section id="consultations" title="Doctor consultations" count={r.consultations.length}>
              {r.consultations.length === 0 ? (
                <Empty>No doctor-portal consultations recorded.</Empty>
              ) : (
                <Table
                  head={["Date", "Doctor", "Department", "Diagnosis", "Medicines", "Investigations", "Advice"]}
                  rows={r.consultations.map((c) => [
                    fmtIso(c.createdAt),
                    c.doctorName,
                    c.department || "—",
                    c.diagnosis || "—",
                    c.medications.map((m) => [m.name, m.strength, m.frequency].filter(Boolean).join(" ")).join("; ") || "—",
                    c.labTests.map((t) => t.name).join("; ") || "—",
                    c.advice || "—",
                  ])}
                />
              )}
            </Section>

            <Section id="prescriptions" title="Prescriptions" count={r.prescriptions.length}>
              {r.prescriptions.length === 0 ? (
                <Empty>No prescriptions recorded.</Empty>
              ) : (
                <Table
                  head={["Date", "Rx", "Doctor", "Department", "Medicines", "Status"]}
                  rows={r.prescriptions.map((x) => [
                    fmtIso(x.createdAt),
                    <span className="font-mono">{x.id}</span>,
                    x.doctorName,
                    x.department,
                    x.items.map((i) => [i.medicineName, i.dosage, i.frequency].filter(Boolean).join(" ")).join("; "),
                    x.status,
                  ])}
                />
              )}
            </Section>

            <Section id="labs" title="Laboratory" count={r.labOrders.length}>
              {r.labOrders.length === 0 ? (
                <Empty>No lab orders recorded.</Empty>
              ) : (
                <Table
                  head={["Ordered", "Order", "Test", "Result", "Status"]}
                  rows={r.labOrders.flatMap((o) =>
                    o.tests.map((t) => {
                      const params = t.results ? Object.entries(t.results).filter(([, v]) => v?.value) : []
                      const flagged = params.some(([, v]) => v.flag) || Boolean(t.flag)
                      const result = params.length
                        ? params.map(([k, v]) => `${k}: ${v.value}${v.unit ? ` ${v.unit}` : ""}${v.flag ? ` (${v.flag})` : ""}`).join("; ")
                        : t.result
                          ? `${t.result}${t.resultUnit ? ` ${t.resultUnit}` : ""}${t.flag ? ` (${t.flag})` : ""}`
                          : "—"
                      return [
                        fmtIso(o.createdAt),
                        <span className="font-mono">{o.id}</span>,
                        t.name,
                        <span className={flagged ? "font-semibold text-[#DC2626]" : ""}>{result}</span>,
                        t.status,
                      ]
                    }),
                  )}
                />
              )}
            </Section>

            <Section id="icu" title="ICU" count={r.icuDays.length + r.icuHandoffs.length}>
              {r.icuDays.length === 0 && r.icuHandoffs.length === 0 ? (
                <Empty>No ICU charts or hand-offs recorded.</Empty>
              ) : (
                <div className="space-y-3">
                  {r.icuDays.length > 0 && (
                    <Table
                      head={["Chart date", "Entries", "Last updated by", "Updated"]}
                      rows={r.icuDays.map((x) => [x.chart_date, x.entry_count ?? 0, x.updated_by || "—", fmtIso(x.updated_at)])}
                    />
                  )}
                  {r.icuHandoffs.length > 0 && (
                    <Table
                      head={["Hand-off", "From bed", "Type", "To", "Condition", "Doctor"]}
                      rows={r.icuHandoffs.map((h) => [fmtIso(h.dischargedAt), h.bed, h.dischargeType, h.destinationWard || "—", h.dischargeCondition, h.attendingDoctor || "—"])}
                    />
                  )}
                </div>
              )}
            </Section>

            <Section id="billing" title="Billing" count={r.bills.length}>
              {r.bills.length === 0 ? (
                <Empty>
                  {r.billing.billed ? `No invoices on this computer. Server summary: billed ${money(r.billing.billed)}, paid ${money(r.billing.paid)}, due ${money(r.billing.due)}.` : "No bills recorded."}
                </Empty>
              ) : (
                <Table
                  head={["Date", "Invoice", "Department", "Total", "Paid", "Due", "Status"]}
                  rows={r.bills.map((b) => [
                    b.dateOfService || "—",
                    <span className="font-mono">{b.invoiceNo}</span>,
                    String(b.department),
                    money(b.totalAmount),
                    money(b.amountPaid),
                    <span className={b.balanceDue > 0 ? "font-semibold text-[#B45309]" : ""}>{money(b.balanceDue)}</span>,
                    String(b.status),
                  ])}
                />
              )}
            </Section>

            <Section id="timeline" title="Complete timeline" count={r.timeline.length}>
              {r.timeline.length === 0 ? (
                <Empty>Nothing recorded yet.</Empty>
              ) : (
                <ol className="border-l-2 border-[#E2E8F0] ml-1.5 space-y-2">
                  {r.timeline.map((t, i) => {
                    const s = STAGE[t.stage] ?? { label: t.stage, color: "#64748B" }
                    return (
                      <li key={i} className="relative pl-4">
                        <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-mono text-[10.5px] text-[#94A3B8]">{fmt(t.at)}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</span>
                        </div>
                        <div className="text-[12.5px]">{t.label}</div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Section>

            <div className="text-[11px] text-[#94A3B8] text-center pb-4">
              Updated {fmtIso(r.compiledAt)} · refreshes automatically
            </div>
          </>
        )}
      </main>
    </div>
  )
}
