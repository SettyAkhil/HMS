import { useMemo, useState } from "react"
import { Btn } from "../shared"
import { BillingDatabase, InvoiceItem } from "../../services/billingDb"
import {
  MASTER_HOSPITAL_SERVICES,
  OrderedClinicalService,
} from "../DoctorWorkflow"
import type {
  DoctorNotification,
  DoctorAccount,
  ParsedLabTest,
} from "../../services/doctorPortalDb"

/**
 * Step 5 -- charges and the insurance claim.
 *
 * This is the half of the old hospital-wide Doctor Workflow screen that the
 * portal had no equivalent for: the procedures and nursing services performed
 * in the room, priced off the hospital tariff, raised as one invoice plus a
 * department charge so reception can take payment.
 *
 * It is deliberately *after* dispatch rather than part of it. Medicines and
 * investigations go to the pharmacy and the lab the moment the doctor sends the
 * sheet; billing is a separate act that must not hold either of them up, and a
 * consultation that bills nothing beyond the consultation fee is the normal
 * case rather than an error.
 */

const CONSULTATION_FEE = 100

// Same tariff the workflow screen used for an investigation with no explicit price.
function investigationPrice(name: string): number {
  if (name.includes("MRI")) return 350
  if (name.includes("Ultrasound")) return 100
  if (name.includes("X-Ray")) return 60
  return 50
}

function investigationCategory(name: string): InvoiceItem["category"] {
  return name.includes("MRI") ||
    name.includes("X-Ray") ||
    name.includes("Ultrasound")
    ? "Radiology / Imaging"
    : "Laboratory"
}

function investigationCpt(name: string): string {
  if (name.includes("MRI")) return "70551"
  if (name.includes("ECG")) return "93000"
  return "80050"
}

export default function ConsultationCharges({
  doctor,
  patient,
  investigations,
  diagnosis,
  icd10,
  onBack,
}: {
  doctor: DoctorAccount
  patient: DoctorNotification
  investigations: ParsedLabTest[]
  diagnosis: string
  icd10?: string
  onBack: () => void
}) {
  const [serviceId, setServiceId] = useState(MASTER_HOSPITAL_SERVICES[0].id)
  const [qty, setQty] = useState(1)
  const [ordered, setOrdered] = useState<OrderedClinicalService[]>([])
  const [sent, setSent] = useState<{ invoiceNo: string ;total: number } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  const addService = () => {
    const def = MASTER_HOSPITAL_SERVICES.find((s) => s.id === serviceId)
    if (!def) return
    setOrdered((prev) => {
      const existing = prev.find((s) => s.name === def.name)
      if (existing) {
        return prev.map((s) =>
          s.name === def.name ? { ...s, quantity: s.quantity + qty } : s,
        )
      }
      return [
        ...prev,
        {
          id: `svc-${Date.now()}-${Math.random().toString(36).slice(-4)}`,
          name: def.name,
          category: def.category,
          cptCode: def.cpt,
          price: def.price,
          quantity: qty,
        },
      ]
    })
    setQty(1)
  }

  const items: InvoiceItem[] = useMemo(() => {
    const stamp = Date.now()
    return [
      {
        id: `ITM-DOC-${stamp}`,
        description: `Specialist Outpatient Consultation (${doctor.name} - ${doctor.specialty})`,
        category: "Consultation",
        cptCode: "99205",
        quantity: 1,
        unitPrice: CONSULTATION_FEE,
        total: CONSULTATION_FEE,
        insuranceCovered: Math.round(CONSULTATION_FEE * 0.8),
        patientPayable: Math.round(CONSULTATION_FEE * 0.2),
      },
      ...ordered.map((svc, i) => ({
        id: `ITM-SVC-${i + 1}-${stamp}`,
        description: svc.name,
        category: svc.category,
        cptCode: svc.cptCode,
        quantity: svc.quantity,
        unitPrice: svc.price,
        total: svc.price * svc.quantity,
        insuranceCovered: Math.round(svc.price * svc.quantity * 0.8),
        patientPayable: Math.round(svc.price * svc.quantity * 0.2),
      })),
      ...investigations.map((test, i) => {
        const inv = test.name
        const price = investigationPrice(inv)
        return {
          id: `ITM-INV-${i + 1}-${stamp}`,
          description: `Diagnostic Investigation: ${inv}`,
          category: investigationCategory(inv),
          cptCode: investigationCpt(inv),
          quantity: 1,
          unitPrice: price,
          total: price,
          insuranceCovered: Math.round(price * 0.8),
          patientPayable: Math.round(price * 0.2),
        }
      }),
    ]
  }, [doctor.name, doctor.specialty, ordered, investigations])

  const total = items.reduce((a, it) => a + it.total, 0)
  const payable = items.reduce((a, it) => a + it.patientPayable, 0)

  const sendToBilling = () => {
    setError(null)
    try {
      const mrn = patient.umr.replace(/\D/g, "") || "10001"
      const common = {
        patientId: patient.umr,
        mrn,
        patientName: patient.patientName,
        age: patient.age,
        gender: patient.sex as "Male" | "Female" | "Other",
        phone: patient.phone || "",
        encounterId: patient.encounterId,
        department: "Outpatient" as const,
        carePathway: `OP Consultation & Procedures (${patient.dept || doctor.specialty})`,
        dateOfService: new Date().toISOString().split("T")[0],
        insuranceProvider: "Self-Pay",
        attendingDoctor: doctor.name,
        diagnosisCodes: [icd10 || diagnosis || "Z00.0"],
        items,
      }

      const claim = BillingDatabase.createClaim({
        ...common,
        status: "Accepted",
        finalizedByNurse: "Consulting Physician",
      })

      BillingDatabase.createDepartmentCharge({
        ...common,
        subtotal: total,
        totalAmount: total,
        status: "Invoiced in Central Billing",
        invoiceId: claim.id,
        verifiedByNurse: "Consulting Physician",
        notes: `Consultation finalised by ${doctor.name}. Sent to Central Billing as Invoice ${claim.invoiceNo} (Total: ₹${total}).`,
      })

      setSent({ invoiceNo: claim.invoiceNo, total })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not raise the invoice. Nothing was billed.",
      )
    }
  }

  if (sent) {
    return (
      <div className="p-6">
        <div className="max-w-2xl mx-auto bg-white border border-[#BBF7D0] rounded p-6 text-center">
          <div className="text-3xl mb-2">🧾</div>
          <h3 className="text-[15px] font-bold text-gray-900">
            Sent to billing
          </h3>
          <p className="text-[12.5px] text-[#475569] mt-2">
            Invoice{" "}
            <span className="font-mono font-semibold">{sent.invoiceNo}</span>{" "}
            raised for {patient.patientName}, total{" "}
            <span className="font-semibold">₹{sent.total}</span>. Reception can
            now take payment at the cashier desk.
          </p>
          <div className="mt-4">
            <Btn variant="outline" size="sm" onClick={onBack}>
              ← Back to review
            </Btn>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white border border-[#DDE2EC] rounded">
        <div className="px-4 py-3 border-b border-[#DDE2EC]">
          <h3 className="text-[13px] font-bold text-gray-900">
            Procedures and services performed
          </h3>
          <p className="text-[11.5px] text-[#64748B] mt-0.5">
            Anything done in the room. The consultation fee and the
            investigations you ordered are added automatically.
          </p>
        </div>

        <div className="p-4 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[260px]">
            <span className="block text-[11px] font-semibold text-[#475569] mb-1">
              Service
            </span>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px] bg-white"
            >
              {MASTER_HOSPITAL_SERVICES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — ₹{s.price}
                </option>
              ))}
            </select>
          </label>
          <label className="w-24">
            <span className="block text-[11px] font-semibold text-[#475569] mb-1">
              Qty
            </span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) =>
                setQty(Math.max(1, parseInt(e.target.value) || 1))
              }
              className="w-full border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12.5px]"
            />
          </label>
          <Btn variant="primary" size="sm" onClick={addService}>
            Add service
          </Btn>
        </div>

        {ordered.length > 0 && (
          <div className="border-t border-[#DDE2EC]">
            {ordered.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 px-4 py-2 border-b border-[#F1F5F9] last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-gray-900 truncate">
                    {s.name}
                  </p>
                  <p className="text-[11px] font-mono text-[#94A3B8]">
                    {s.category} · CPT {s.cptCode} · ₹{s.price}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOrdered((p) =>
                        p.map((x) =>
                          x.id === s.id
                            ? { ...x, quantity: Math.max(1, x.quantity - 1) }
                            : x,
                        ),
                      )
                    }
                    className="w-6 h-6 border border-[#DDE2EC] rounded text-[#475569]"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-[12.5px] font-semibold">
                    {s.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setOrdered((p) =>
                        p.map((x) =>
                          x.id === s.id
                            ? { ...x, quantity: x.quantity + 1 }
                            : x,
                        ),
                      )
                    }
                    className="w-6 h-6 border border-[#DDE2EC] rounded text-[#475569]"
                  >
                    +
                  </button>
                </div>
                <span className="w-20 text-right text-[12.5px] font-semibold text-gray-900">
                  ₹{s.price * s.quantity}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setOrdered((p) => p.filter((x) => x.id !== s.id))
                  }
                  className="text-[11px] text-[#B91C1C] font-semibold hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-[#DDE2EC] rounded">
        <div className="px-4 py-3 border-b border-[#DDE2EC]">
          <h3 className="text-[13px] font-bold text-gray-900">
            Invoice preview
          </h3>
        </div>
        <div className="divide-y divide-[#F1F5F9]">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-4 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] text-gray-900 truncate">
                  {it.description}
                </p>
                <p className="text-[11px] font-mono text-[#94A3B8]">
                  {it.category} · ×{it.quantity} @ ₹{it.unitPrice}
                </p>
              </div>
              <span className="text-[12.5px] font-semibold text-gray-900">
                ₹{it.total}
              </span>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-[#DDE2EC] flex items-center justify-between bg-[#F8FAFC]">
          <div className="text-[11.5px] text-[#64748B]">
            Patient payable{" "}
            <span className="font-semibold text-gray-900">₹{payable}</span> of ₹
            {total}
          </div>
          <div className="text-[14px] font-bold text-gray-900">₹{total}</div>
        </div>
      </div>

      {error && (
        <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded px-4 py-2.5 text-[12px] text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Btn variant="outline" size="sm" onClick={onBack}>
          ← Back to review
        </Btn>
        <Btn variant="primary" size="sm" onClick={sendToBilling}>
          Send ₹{total} to billing
        </Btn>
      </div>
    </div>
  )
}
