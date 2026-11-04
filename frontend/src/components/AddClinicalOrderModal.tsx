import { useState } from "react"
import type { FormEvent } from "react"
import { FiClipboard } from "react-icons/fi"
import { apiFetch, reportError } from "../lib/api"
import type { Notice } from "../types"
import { db } from "../services/db"
import { BillingDatabase } from "../services/billingDb"
import { priceForTest } from "../services/labOrdersDb"
import {
  isRadiologyTest,
  getModalityForTest,
  getRoomForModality,
} from "../utils/testClassifier"

const ORDER_TYPES = [
  { value: "radiology", label: "Radiology" },
  { value: "nursing", label: "Nursing" },
  { value: "dietary", label: "Dietary" },
  { value: "referral", label: "Referral" },
] as const

const PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
] as const

// New order -> POST /api/clinical/<patientId>/orders (modules/clinical/routes.py).
// Deliberately covers only the order types with no dedicated flow elsewhere --
// lab and pharmacy already have their own queues (LabOrderDatabase / PharmacyDatabase).
export default function AddClinicalOrderModal({
  patientId,
  admissionId,
  setNotice,
  onClose,
  onSaved,
}: {
  patientId: string
  admissionId?: number
  setNotice: (n: Notice | null) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [orderType, setOrderType] =
    useState<typeof ORDER_TYPES[number]["value"]>("radiology")
  const [priority, setPriority] =
    useState<typeof PRIORITIES[number]["value"]>("routine")
  const [description, setDescription] = useState("")
  const [notes, setNotes] = useState("")
  const [orderedBy, setOrderedBy] = useState("")
  const [saving, setSaving] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!description.trim()) {
      setNotice({ type: "error", message: "Order description is required." })
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/clinical/${patientId}/orders`, {
        method: "POST",
        body: JSON.stringify({
          admission_id: admissionId,
          order_type: orderType,
          description: description.trim(),
          priority,
          notes: notes.trim() || undefined,
          ordered_by: orderedBy.trim() || undefined,
        }),
      })

      if (orderType === "radiology" || isRadiologyTest(description)) {
        const modality = getModalityForTest(description)
        const price = priceForTest(description)
        const p =
          db.getPatientByUmr(patientId) ||
          db
            .getPatients()
            .find((pt) => pt.umr === patientId || pt.name === patientId)
        const resolvedPatientName = p ? p.name : patientId
        const resolvedMrn = p ? p.umr : patientId

        BillingDatabase.createRadiologyStudy({
          patient: resolvedPatientName,
          mrn: resolvedMrn,
          umr: resolvedMrn,
          study: description.trim(),
          modality,
          priority: priority === "stat" ? "STAT" : priority === "urgent" ? "Routine" : "Routine",
          ordered: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          provider: orderedBy.trim() || "Attending Nurse / Doctor",
          status: "Orders",
          room: getRoomForModality(modality),
          price,
          paymentStatus: "Payment Pending",
          indication: notes.trim() || description.trim(),
          technique: `Diagnostic ${modality} imaging scan`,
        })
      }

      onSaved()
    } catch (error: any) {
      reportError(setNotice, error, "Failed to place this order.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#DDE2EC] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#1B4FD8] text-white px-5 py-3.5 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-[14px]">New Order</h3>
            <p className="text-[11px] text-white/75 mt-0.5">
              Radiology, nursing, dietary, or referral -- lab and pharmacy
              orders go through their own queues.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg flex-shrink-0"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-[12px]">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                <FiClipboard aria-hidden /> Order Type
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {ORDER_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setOrderType(t.value)}
                    className={`px-2 py-2 rounded border text-[11.5px] font-semibold transition-colors ${
                      orderType === t.value
                        ? "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                        : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                Description *
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Chest X-ray (PA view), strict input/output monitoring, diabetic diet, cardiology referral"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-[#DDE2EC] p-2 rounded"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                  Priority
                </label>
                <div className="flex gap-1.5">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={`flex-1 px-2 py-1.5 rounded border text-[11.5px] font-semibold transition-colors ${
                        priority === p.value
                          ? p.value === "stat"
                            ? "bg-[#DC2626] text-white border-[#DC2626]"
                            : p.value === "urgent"
                              ? "bg-[#D97706] text-white border-[#D97706]"
                              : "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                          : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                  Ordered By (optional)
                </label>
                <input
                  className="w-full border border-[#DDE2EC] p-2 rounded"
                  placeholder="Doctor name"
                  value={orderedBy}
                  onChange={(e) => setOrderedBy(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                Notes (optional)
              </label>
              <textarea
                rows={2}
                placeholder="Additional instructions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-[#DDE2EC] p-2 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#DDE2EC] bg-[#F8FAFC] flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-[#DDE2EC] rounded bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-[#1B4FD8] text-white font-bold rounded disabled:opacity-60"
            >
              {saving ? "Placing Order..." : "✓ Place Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
