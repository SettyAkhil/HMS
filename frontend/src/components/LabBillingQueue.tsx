import React, { useEffect, useMemo, useState } from "react"
import { StatusBadge } from "./shared"
import { LabOrder, LabOrderDatabase } from "../services/labOrdersDb"
import { AuditDatabase } from "../services/auditDb"
import { ClaimRecord } from "../services/billingDb"
import HospitalReceiptModal from "./HospitalReceiptModal"
import { BillingHeader, KpiTile } from "./billing/BillingChrome"
import { FlaskConical, Hourglass } from "lucide-react"

/**
 * Reception's side of the doctor -> lab hand-off.
 *
 * Investigations a doctor ordered arrive here as unpaid lab orders carrying the
 * patient's details. Collecting payment is what releases the order to the
 * laboratory's worklist -- until then the lab cannot see it at all, which is the
 * rule `LabOrderDatabase` enforces.
 */

const PAYMENT_MODES: NonNullable<LabOrder["billing"]["mode"]>[] = [
  "Cash",
  "Card",
  "UPI",
  "Insurance",
  "Corporate",
]

export default function LabBillingQueue({
  collectedBy = "Reception",
}: {
  collectedBy?: string
}) {
  const [tick, setTick] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] =
    useState<NonNullable<LabOrder["billing"]["mode"]>>("Cash")
  const [discount, setDiscount] = useState(0)
  const [view, setView] = useState<"pending" | "settled">("pending")
  const [receipt, setReceipt] = useState<LabOrder | null>(null)
  const [showReceiptModal, setShowReceiptModal] = useState(false)

  useEffect(() => LabOrderDatabase.subscribe(() => setTick((t) => t + 1)), [])

  const pending = useMemo(
    () =>
      [...LabOrderDatabase.getBillingQueue()].sort((a, b) => {
        const timeB = new Date(b.createdAt || (b as any).orderedDate || 0).getTime()
        const timeA = new Date(a.createdAt || (a as any).orderedDate || 0).getTime()
        return timeB - timeA || (b.id || "").localeCompare(a.id || "")
      }),
    [tick],
  )
  const settled = useMemo(
    () =>
      LabOrderDatabase.getOrders()
        .filter((order) => order.billing.status === "Paid")
        .sort((a, b) => {
          const timeB = new Date(b.billing.paidAt || b.createdAt || 0).getTime()
          const timeA = new Date(a.billing.paidAt || a.createdAt || 0).getTime()
          return timeB - timeA || (b.id || "").localeCompare(a.id || "")
        }),
    [tick],
  )
  const list = view === "pending" ? pending : settled

  const selected = useMemo(
    () => list.find((order) => order.id === selectedId) || list[0],
    [list, selectedId],
  )

  useEffect(() => {
    // A fresh selection starts from its own subtotal, never the previous order's discount.
    setDiscount(0)
  }, [selected?.id])

  const collect = () => {
    if (!selected || selected.billing.status === "Paid") return
    const updated = LabOrderDatabase.markBilled(selected.id, {
      mode,
      discount,
      collectedBy,
    })
    if (!updated) return
    AuditDatabase.logEvent(
      "Lab Order Billed",
      "Billing",
      `${collectedBy} collected ₹${updated.billing.total.toLocaleString("en-IN")} (${mode}) for ${updated.id} — ` +
        `${updated.tests.length} investigation(s) for ${updated.patientName} (${updated.umr}) released to the laboratory.`,
      "Success",
    )
    setReceipt(updated)
    setSelectedId(null)
  }

  const pendingTotal = pending.reduce(
    (sum, order) => sum + order.billing.subtotal,
    0,
  )

  return (
    <div className="flex-1 overflow-y-auto bg-[#F1F5F9]">
      <BillingHeader
        icon={FlaskConical}
        title="Lab Test Billing"
        pill="Lab Desk"
        subtitle="Investigations ordered by doctors — payment releases them to the laboratory."
      />
      <div className="px-5 pt-5 grid grid-cols-2 gap-3">
        <KpiTile tone="amber" icon={Hourglass} label="Awaiting payment" value={pending.length} sub={`₹${pendingTotal.toLocaleString("en-IN")} to collect`} />
        <KpiTile tone="emerald" icon={FlaskConical} label="Settled" value={settled.length} sub="Released to the laboratory" />
      </div>

      <div className="mx-5 mt-4 bg-white border border-[#CBD5E1] shadow-2xs flex">
        {[
          {
            key: "pending" as const,
            label: "Awaiting Billing",
            count: pending.length,
          },
          { key: "settled" as const, label: "Settled", count: settled.length },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setView(tab.key)
              setSelectedId(null)
            }}
            className={`px-5 py-2.5 text-[12.5px] font-semibold border-b-2 transition-colors ${
              view === tab.key
                ? "border-[#1B4FD8] text-[#1B4FD8]"
                : "border-transparent text-[#64748B] hover:text-[#334155]"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] font-bold bg-[#F1F5F9] text-[#475569] px-1.5 py-0.5 rounded">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {receipt && (
        <div className="mx-5 mt-4 bg-[#F0FDF4] border border-[#BBF7D0] rounded px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12.5px] text-[#166534]">
            <span className="font-bold">✓ Payment collected</span> — receipt{" "}
            <span className="font-mono font-bold">
              {receipt.billing.receiptNo}
            </span>
            , ₹{receipt.billing.total.toLocaleString("en-IN")} for{" "}
            {receipt.patientName}. {receipt.id} is now on the laboratory
            worklist.
          </div>
          <button
            type="button"
            onClick={() => setReceipt(null)}
            className="text-[#15803D] font-bold text-[12px]"
          >
            ✕
          </button>
        </div>
      )}

      <div className="px-5 pb-5 pt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-[#DDE2EC] rounded">
          <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
            <h2 className="text-[13px] font-bold text-gray-900">
              {view === "pending"
                ? "Orders waiting on payment"
                : "Settled orders"}
            </h2>
          </div>

          {list.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-2xl mb-2">🧾</div>
              <p className="text-[12.5px] font-semibold text-[#334155]">
                {view === "pending"
                  ? "Nothing waiting on billing"
                  : "No settled orders yet"}
              </p>
              <p className="text-[11.5px] text-[#94A3B8] mt-1">
                Lab tests appear here the moment a doctor dispatches a
                consultation sheet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F1F5F9]">
              {list.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedId(order.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    selected?.id === order.id
                      ? "bg-[#EFF6FF]"
                      : "hover:bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[13px] text-gray-900">
                          {order.patientName}
                        </span>
                        <span className="text-[11px] font-mono text-[#64748B]">
                          {order.umr} · {order.opNumber}
                        </span>
                        {order.tests.some(
                          (test) => test.urgency === "STAT",
                        ) && (
                          <span className="text-[10px] font-bold bg-[#FEE2E2] text-[#B91C1C] px-1.5 py-0.5 rounded border border-[#FECACA]">
                            STAT
                          </span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-[#64748B] mt-0.5">
                        {order.doctorName} · {order.department} ·{" "}
                        {order.diagnosis || "No diagnosis recorded"}
                      </div>
                      <div className="text-[11.5px] text-[#475569] mt-1">
                        {order.tests.map((test) => test.name).join(" · ")}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[14px] font-bold text-gray-900 font-mono">
                        ₹{order.billing.total.toLocaleString("en-IN")}
                      </div>
                      <div className="text-[10.5px] text-[#94A3B8] font-mono">
                        {order.id}
                      </div>
                      <div className="mt-1">
                        <StatusBadge status={order.status} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="bg-white border border-[#DDE2EC] rounded">
              <div className="px-4 py-2.5 border-b border-[#DDE2EC]">
                <h2 className="text-[13px] font-bold text-gray-900">
                  {selected.billing.status === "Paid"
                    ? "Receipt"
                    : "Collect payment"}
                </h2>
                <p className="text-[11px] text-[#64748B] font-mono mt-0.5">
                  {selected.id} · invoice {selected.billing.invoiceNo}
                </p>
              </div>

              <div className="p-4 space-y-3">
                <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded p-3 space-y-1">
                  {[
                    [
                      "Patient",
                      `${selected.patientName} (${selected.age}${selected.sex?.[0] || ""})`,
                    ],
                    ["UMR / OP", `${selected.umr} · ${selected.opNumber}`],
                    ["Phone", selected.phone || "Not recorded"],
                    [
                      "Referred by",
                      `${selected.doctorName}, ${selected.department}`,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex justify-between gap-3 text-[11.5px]"
                    >
                      <span className="text-[#94A3B8]">{label}</span>
                      <span className="text-gray-900 font-medium text-right">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1">
                  {selected.tests.map((test) => (
                    <div
                      key={test.id}
                      className="flex justify-between gap-3 text-[12px] py-1 border-b border-[#F8FAFC] last:border-0"
                    >
                      <span className="text-[#475569]">
                        {test.name}
                        {test.urgency === "STAT" && (
                          <span className="text-[#DC2626] font-bold ml-1">
                            STAT
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-gray-900">
                        ₹{test.price.toLocaleString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>

                {selected.billing.status === "Paid" ? (
                  <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded p-3 text-[12px] text-[#166534] space-y-1">
                    <div className="flex justify-between">
                      <span>Paid</span>
                      <span className="font-mono font-bold">
                        ₹{selected.billing.total.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mode</span>
                      <span>{selected.billing.mode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Receipt</span>
                      <span className="font-mono">
                        {selected.billing.receiptNo}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Collected by</span>
                      <span>{selected.billing.collectedBy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>At</span>
                      <span>
                        {selected.billing.paidAt
                          ? new Date(selected.billing.paidAt).toLocaleString()
                          : "--"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowReceiptModal(true)}
                      className="w-full mt-2 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold rounded text-xs cursor-pointer shadow-2xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>🖨️</span> View &amp; Print Official Receipt
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-[12px] pt-1">
                      <span className="text-[#64748B]">Subtotal</span>
                      <span className="font-mono text-gray-900">
                        ₹{selected.billing.subtotal.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] mb-1">
                        Discount (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={selected.billing.subtotal}
                        value={
                          discount === undefined ||
                          discount === null ||
                          (discount as any) === ""
                            ? ""
                            : discount
                        }
                        onChange={event => {
                          const val = event.target.value;
                          if (val === "") {
                            setDiscount("" as any);
                          } else {
                            const parsed = parseInt(val, 10);
                            setDiscount(isNaN(parsed) ? ("" as any) : Math.max(0, Math.min(selected.billing.subtotal, parsed)));
                          }
                        }}
                        className="w-full border border-[#DDE2EC] rounded px-3 py-2 text-[13px] font-mono focus:outline-none focus:border-[#1B4FD8]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide text-[#94A3B8] mb-1">
                        Payment mode
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {PAYMENT_MODES.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setMode(option)}
                            className={`px-2.5 py-1 text-[11.5px] font-semibold rounded border transition-colors ${
                              mode === option
                                ? "bg-blue-600 text-white border-blue-700"
                                : "bg-white text-[#475569] border-[#CBD5E1] hover:border-[#94A3B8]"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-t border-[#DDE2EC] pt-3">
                      <span className="text-[12px] font-semibold text-[#334155]">
                        Amount due
                      </span>
                      <span className="text-[18px] font-bold text-gray-900 font-mono">
                        ₹
                        {(selected.billing.subtotal - discount).toLocaleString(
                          "en-IN",
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={collect}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white text-[13px] font-bold cursor-pointer transition-colors shadow-2xs"
                    >
                      Collect payment &amp; send to laboratory
                    </button>
                    <p className="text-[11px] text-[#94A3B8] text-center">
                      The laboratory only sees this order once it is paid.
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#DDE2EC] rounded p-6 text-center">
              <p className="text-[12.5px] text-[#94A3B8]">
                Select an order to take payment.
              </p>
            </div>
          )}
        </div>
      </div>

      {showReceiptModal && selected && (
        <HospitalReceiptModal
          claim={{
            id: `CLM-${selected.id}`,
            invoiceNo:
              selected.billing.invoiceNo || `INV-LAB-${selected.id.slice(-6)}`,
            patientId: selected.umr,
            patientName: selected.patientName,
            mrn: selected.umr,
            age: selected.age,
            gender: selected.sex === "Female" ? "Female" : "Male",
            phone: selected.phone || "",
            department: "Laboratory",
            dateOfService: selected.createdAt
              ? selected.createdAt.split("T")[0]
              : new Date().toISOString().split("T")[0],
            encounterId: selected.opNumber || selected.id,
            insuranceProvider: "Self-Pay",
            policyNumber: "N/A",
            status: "Paid",
            items: selected.tests.map((t, idx) => ({
              id: `ITEM-${t.id || idx}`,
              description: t.name,
              category: "Laboratory",
              cptCode: `LAB0${10 + idx}`,
              quantity: 1,
              unitPrice: t.price,
              total: t.price,
              insuranceCovered: 0,
              patientPayable: t.price,
            })),
            subtotal: selected.billing.subtotal,
            discount: selected.billing.discount || 0,
            tax: 0,
            totalAmount: selected.billing.total,
            insurancePortion: 0,
            patientPortion: selected.billing.total,
            amountPaid: selected.billing.total,
            balanceDue: 0,
            payments: selected.billing.receiptNo
              ? [
                  {
                    id: `PAY-${selected.id}`,
                    invoiceId: selected.billing.invoiceNo || selected.id,
                    receiptNo: selected.billing.receiptNo,
                    amount: selected.billing.total,
                    paymentDate:
                      selected.billing.paidAt || new Date().toISOString(),
                    paymentMethod:
                      selected.billing.mode === "Cash"
                        ? "Cash"
                        : selected.billing.mode === "UPI"
                          ? "UPI / Digital"
                          : "Credit Card",
                    collectedBy: selected.billing.collectedBy || collectedBy,
                    notes: "Laboratory Investigation Charges",
                  },
                ]
              : [],
            diagnosisCodes: ["Z01.89"],
            attendingDoctor: selected.doctorName,
            createdAt: selected.createdAt || new Date().toISOString(),
            updatedAt: selected.billing.paidAt || new Date().toISOString(),
          }}
          payment={
            selected.billing.receiptNo
              ? {
                  id: `PAY-${selected.id}`,
                  invoiceId: selected.billing.invoiceNo || selected.id,
                  receiptNo: selected.billing.receiptNo,
                  amount: selected.billing.total,
                  paymentDate:
                    selected.billing.paidAt || new Date().toISOString(),
                  paymentMethod:
                    selected.billing.mode === "Cash"
                      ? "Cash"
                      : selected.billing.mode === "UPI"
                        ? "UPI / Digital"
                        : "Credit Card",
                  collectedBy: selected.billing.collectedBy || collectedBy,
                  notes: "Laboratory Investigation Charges",
                }
              : null
          }
          onClose={() => setShowReceiptModal(false)}
        />
      )}
    </div>
  )
}
