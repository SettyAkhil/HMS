import { useMemo, useState } from "react"
import { InsuranceEngineService } from "../../services/insuranceDb"
import { BedDatabase } from "../../services/bedDb"
import type { ClaimEncounterType } from "../../types/insurance"
import { PolicyForm } from "./forms"
import { Choice, Empty, Field, Modal, attempt, fieldCls, fmtDate, inr, type Notify } from "./ui"

// Encounter -> Payment type = Insurance. Two ways in:
//  - an admission whose bill billing has already raised (still self-pay), or
//  - an admitted patient with no bill yet (bed board or typed in); the case
//    waits and links itself to the first bill billing raises for them.

type Mode = "bill" | "encounter"

export default function NewCaseModal({ onClose, notify, onOpened }: { onClose: () => void; notify: Notify; onOpened: (caseId: string) => void }) {
  const admissions = useMemo(() => InsuranceEngineService.admissionsWithoutInsurance(), [])
  const [mode, setMode] = useState<Mode>(admissions.length ? "bill" : "encounter")
  const [billId, setBillId] = useState(admissions[0]?.id ?? "")
  const bill = admissions.find((a) => a.id === billId)

  return (
    <Modal title="New insurance claim" onClose={onClose} wide>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Start from" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Choice active={mode === "bill"} emoji="" title={`From an open bill (${admissions.length})`} sub="Billing has raised the bill; it is still self-pay" onClick={() => setMode("bill")} />
          <Choice active={mode === "encounter"} emoji="" title="Admitted patient" sub="No bill yet — the case links to it when billing raises one" onClick={() => setMode("encounter")} />
        </div>

        {mode === "bill" &&
          (admissions.length === 0 ? (
            <Empty title="No self-pay admissions with a bill" hint="Use “Admitted patient” for a patient billing has not billed yet. OP visits are not claimed from insurance." />
          ) : (
            <>
              <div>
                <div className="text-[12px] font-medium text-slate-500 mb-1">Admission</div>
                <div className="border border-slate-100 max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {admissions.map((a) => (
                    <label key={a.id} className={`px-3 py-2 flex items-center gap-3 cursor-pointer text-[12.5px] ${billId === a.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <input type="radio" className="accent-blue-600" checked={billId === a.id} onChange={() => setBillId(a.id)} />
                      <span className="font-semibold text-slate-900 w-40 truncate"> {a.patientName}</span>
                      <span className="text-slate-500 flex-1 truncate">
                        {a.department} · {a.carePathway || a.invoiceNo} · admitted {fmtDate(a.dateOfService)}
                      </span>
                      <span className="tabular-nums text-slate-700">{inr(a.totalAmount)}</span>
                    </label>
                  ))}
                </div>
              </div>
              {bill && (
                <PolicyForm
                  key={bill.id}
                  initial={{ policyHolderName: bill.patientName }}
                  submitLabel="Open insurance case"
                  onSubmit={(p) => {
                    let id = ""
                    if (attempt(notify, () => (id = InsuranceEngineService.openCase(bill.id, p).id), `Insurance case opened for ${bill.patientName} — verify eligibility next.`)) onOpened(id)
                  }}
                />
              )}
            </>
          ))}

        {mode === "encounter" && <EncounterCase notify={notify} onOpened={onOpened} />}
      </div>
    </Modal>
  )
}

const deptOf: Record<ClaimEncounterType, string> = { IP: "Inpatient", ICU: "ICU", OT: "Surgery", ER: "Emergency", OP: "Outpatient" }

/** Admitted patient without a bill: pick from the bed board or type the details. */
export function EncounterCase({
  notify,
  onOpened,
  initial,
  quick,
}: {
  notify: Notify
  onOpened: (caseId: string) => void
  initial?: { patientId?: string; patientName?: string; encounterType?: ClaimEncounterType; department?: string; attendingDoctor?: string; age?: number; gender?: string }
  quick?: boolean
}) {
  const occupied = useMemo(
    () =>
      BedDatabase.getBeds()
        .filter((b) => b.status === "Occupied" && b.patient_name)
        .map((b) => ({
          key: String(b.id),
          patientId: b.patient_id || "",
          patientName: `${b.patient_name ?? ""} ${b.patient_last_name ?? ""}`.trim(),
          ward: b.ward,
          bed: `${b.room_no}-${b.bed_no}`,
          icu: b.bed_type === "ICU",
          admitted: b.admission_date,
        })),
    [],
  )
  const [f, setF] = useState({
    patientId: initial?.patientId ?? "",
    patientName: initial?.patientName ?? "",
    encounterType: initial?.encounterType ?? ("IP" as ClaimEncounterType),
    department: initial?.department ?? "",
    attendingDoctor: initial?.attendingDoctor ?? "",
  })
  const pickBed = (k: string) => {
    const b = occupied.find((x) => x.key === k)
    if (b) setF((x) => ({ ...x, patientId: b.patientId, patientName: b.patientName, encounterType: b.icu ? "ICU" : "IP", department: b.icu ? "ICU" : "Inpatient" }))
  }
  return (
    <div className="space-y-4">
      {!initial && occupied.length > 0 && (
        <Field label="From the bed board">
          <select className={fieldCls} defaultValue="" onChange={(e) => pickBed(e.target.value)}>
            <option value="">Choose an admitted patient…</option>
            {occupied.map((b) => (
              <option key={b.key} value={b.key}>
                {b.patientName} — {b.ward} {b.bed}
                {b.admitted ? ` · since ${fmtDate(b.admitted)}` : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="UHID / patient ID *">
          <input className={`${fieldCls} tabular-nums`} value={f.patientId} onChange={(e) => setF({ ...f, patientId: e.target.value })} />
        </Field>
        <Field label="Patient name *">
          <input className={fieldCls} value={f.patientName} onChange={(e) => setF({ ...f, patientName: e.target.value })} />
        </Field>
        <Field label="Encounter">
          <select className={fieldCls} value={f.encounterType} onChange={(e) => setF({ ...f, encounterType: e.target.value as ClaimEncounterType })}>
            <option value="IP">IP — admission</option>
            <option value="ICU">ICU</option>
            <option value="OT">OT — surgery</option>
            <option value="ER">ER — emergency</option>
          </select>
        </Field>
        <Field label="Attending doctor">
          <input className={fieldCls} value={f.attendingDoctor} onChange={(e) => setF({ ...f, attendingDoctor: e.target.value })} />
        </Field>
      </div>
      <PolicyForm
        initial={{ policyHolderName: f.patientName }}
        quick={quick}
        submitLabel={quick ? "Capture insurance" : "Open insurance case"}
        onSubmit={(p) => {
          if (!f.patientId.trim() || !f.patientName.trim()) return notify("Enter the patient's UHID and name.", "error")
          let id = ""
          if (
            attempt(
              notify,
              () =>
              (id = InsuranceEngineService.openEncounterCase(
                { patientId: f.patientId.trim(), patientName: f.patientName.trim(), encounterType: f.encounterType, department: f.department || deptOf[f.encounterType], attendingDoctor: f.attendingDoctor || undefined, age: initial?.age, gender: initial?.gender },
                p,
                { quick },
              ).id),
              `Insurance ${quick ? "captured" : "case opened"} for ${f.patientName} — verify eligibility next.`,
            )
          )
            onOpened(id)
        }}
      />
    </div>
  )
}
