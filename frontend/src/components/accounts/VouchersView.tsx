import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import type { Voucher, VoucherType } from "../../types/accounts"
import { accountsApi } from "../../services/accounts/client"
import AccountPicker, { CostCentrePicker } from "./AccountPicker"
import { JournalDetailModal } from "./JournalsView"
import {
  Button, Card, Empty, ErrorNote, Field, Input, Loaded, Modal, Money, Notice, PageHeader, Pill, Select, Table, Td,
  Th, formatDate, formatDateTime, formatINR, today, useAction, useApi,
} from "./ui"

const TYPE_LABEL: Record<VoucherType, string> = { PV: "Payment", JV: "Journal", OB: "Opening balances" }
const STATUS_TONE = { submitted: "amber", approved: "green", rejected: "red", cancelled: "neutral" } as const

/** Payments, manual journals and opening balances: prepared by one person, posted
 *  only when someone else approves. `focus="approvals"` opens on the queue. */
export default function VouchersView({ focus = "all" }: { focus?: "all" | "approvals" }) {
  const [status, setStatus] = useState(focus === "approvals" ? "submitted" : "")
  const [creating, setCreating] = useState<VoucherType | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [openJournal, setOpenJournal] = useState<number | null>(null)
  const state = useApi(() => accountsApi.vouchers(status || undefined), [status])

  return (
    <div>
      <PageHeader
        title={focus === "approvals" ? "Approvals" : "Payments & journals"}
        subtitle="Maker-checker: a voucher posts only when someone other than its preparer approves it. Each is validated against the books when prepared and again when approved."
        actions={
          <>
            <Button variant="primary" onClick={() => setCreating("PV")}><Plus size={14} /> Payment</Button>
            <Button onClick={() => setCreating("JV")}><Plus size={14} /> Journal</Button>
            <Button onClick={() => setCreating("OB")}>Opening balances</Button>
          </>
        }
      />
      <div className="space-y-3">
        <Notice message={notice} onClose={() => setNotice(null)} />
        <div className="w-56">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All vouchers</option>
            <option value="submitted">Awaiting approval</option>
            <option value="approved">Approved & posted</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Withdrawn</option>
          </Select>
        </div>
        <Loaded state={state}>
          {({ vouchers, me }) =>
            vouchers.length === 0 ? (
              <Card><Empty>{status === "submitted" ? "Nothing is waiting for approval." : "No vouchers yet."}</Empty></Card>
            ) : (
              <div className="space-y-2">
                {vouchers.map((v) => (
                  <VoucherRow
                    key={v.id}
                    voucher={v}
                    me={me}
                    onChanged={(message) => {
                      setNotice(message)
                      state.reload()
                    }}
                    onOpenJournal={setOpenJournal}
                  />
                ))}
              </div>
            )
          }
        </Loaded>
      </div>
      {creating === "PV" && (
        <PaymentVoucherModal
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null)
            setNotice("Payment voucher submitted for approval.")
            state.reload()
          }}
        />
      )}
      {(creating === "JV" || creating === "OB") && (
        <JournalVoucherModal
          type={creating}
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null)
            setNotice(`${TYPE_LABEL[creating]} voucher submitted for approval.`)
            state.reload()
          }}
        />
      )}
      {openJournal !== null && <JournalDetailModal id={openJournal} onClose={() => setOpenJournal(null)} />}
    </div>
  )
}

function VoucherRow({
  voucher: v, me, onChanged, onOpenJournal,
}: { voucher: Voucher; me: string; onChanged: (message: string) => void; onOpenJournal: (id: number) => void }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [expanded, setExpanded] = useState(false)
  const action = useAction()
  const mine = v.maker === me
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="blue">{TYPE_LABEL[v.voucher_type]}</Pill>
            <Pill tone={STATUS_TONE[v.status]}>{v.status === "submitted" ? "Awaiting approval" : v.status}</Pill>
            <span className="text-[13px] font-medium text-gray-900">{v.narration}</span>
          </div>
          <div className="text-[11.5px] text-[#64748B] mt-1">
            {formatDate(v.voucher_date)}
            {v.payee_name && ` · ${v.payee_name}`} · prepared by {v.maker} {formatDateTime(v.created_at)}
            {v.checker && ` · ${v.status} by ${v.checker}`}
            {v.reject_reason && ` — “${v.reject_reason}”`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold tabular-nums">{formatINR(v.amount)}</span>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((x) => !x)}>{expanded ? "Hide" : "Lines"}</Button>
          {v.journal_id && <Button size="sm" onClick={() => onOpenJournal(v.journal_id!)}>{v.journal_no}</Button>}
          {v.status === "submitted" && mine && (
            <Button size="sm" busy={action.busy} onClick={() => action.run(() => accountsApi.cancelVoucher(v.id), () => onChanged("Voucher withdrawn."))}>
              Withdraw
            </Button>
          )}
          {v.status === "submitted" && !mine && !rejecting && (
            <>
              <Button size="sm" variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
              <Button
                size="sm"
                variant="primary"
                busy={action.busy}
                onClick={() => action.run(() => accountsApi.approveVoucher(v.id), (r) => onChanged(`Approved and posted as ${r.journal_no}.`))}
              >
                Approve & post
              </Button>
            </>
          )}
          {v.status === "submitted" && mine && <span className="text-[11.5px] text-[#64748B]">Needs another approver</span>}
        </div>
      </div>
      {(action.error || rejecting) && (
        <div className="px-4 pb-3 space-y-2">
          <ErrorNote message={action.error} />
          {rejecting && (
            <div className="flex items-end gap-2">
              <div className="flex-1"><Field label="Reason for rejection"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
              <Button onClick={() => setRejecting(false)}>Cancel</Button>
              <Button
                variant="danger"
                busy={action.busy}
                disabled={!reason.trim()}
                onClick={() => action.run(() => accountsApi.rejectVoucher(v.id, reason), () => onChanged("Voucher rejected."))}
              >
                Reject
              </Button>
            </div>
          )}
        </div>
      )}
      {expanded && (
        <div className="border-t border-[#EEF1F6]">
          <Table dense>
            <thead>
              <tr><Th>Account</Th><Th>Party / document</Th><Th right>Debit</Th><Th right>Credit</Th></tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={i}>
                  <Td>{l.account.code || l.account.role || `#${l.account.id}`}{l.narration && <span className="text-[#64748B]"> — {l.narration}</span>}</Td>
                  <Td className="text-[#475569]">{[l.party?.name, l.document_no].filter(Boolean).join(" · ")}</Td>
                  <Td right><Money value={Number(l.debit || 0)} blankZero /></Td>
                  <Td right><Money value={Number(l.credit || 0)} blankZero /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  )
}

function PaymentVoucherModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"supplier" | "expense">("supplier")
  const [form, setForm] = useState({
    date: today(), narration: "", supplier_id: "", supplier_name: "", invoice: "", expense: "" as number | "",
    cost_centre: "", bank: "" as number | "", amount: "", tds: "", tds_section: "194C", method: "NEFT", reference: "", payee: "",
  })
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const action = useAction()
  const amount = Number(form.amount)
  const tds = Number(form.tds || 0)
  const ready =
    form.narration.trim() && amount > 0 && form.bank !== "" &&
    (mode === "supplier" ? form.supplier_id && form.supplier_name && form.invoice : form.expense !== "")

  const submit = () =>
    action.run(
      () =>
        accountsApi.submitVoucher({
          voucher_type: "PV",
          date: form.date,
          narration: form.narration,
          amount,
          tds,
          tds_section: tds ? form.tds_section : undefined,
          bank_account: { id: Number(form.bank) },
          method: form.method,
          reference: form.reference || undefined,
          ...(mode === "supplier"
            ? { supplier: { id: form.supplier_id, name: form.supplier_name }, supplier_invoice_no: form.invoice }
            : { expense_account: { id: Number(form.expense) }, cost_centre: form.cost_centre || undefined, payee_name: form.payee || undefined }),
        }),
      onSaved,
    )

  return (
    <Modal
      title="New payment voucher"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={action.busy} disabled={!ready} onClick={submit}>Submit for approval</Button></>}
    >
      <ErrorNote message={action.error} />
      <div className="flex border border-[#D0D5DD] rounded-none overflow-hidden w-fit">
        {(["supplier", "expense"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-[12.5px] ${mode === m ? "bg-[#1B4FD8] text-white" : "bg-white"}`}>
            {m === "supplier" ? "Pay a supplier invoice" : "Direct expense"}
          </button>
        ))}
      </div>
      {mode === "supplier" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier ID"><Input value={form.supplier_id} onChange={(e) => set({ supplier_id: e.target.value })} /></Field>
            <Field label="Supplier name"><Input value={form.supplier_name} onChange={(e) => set({ supplier_name: e.target.value })} /></Field>
          </div>
          <Field label="Supplier invoice no." hint="Must be an open invoice on the payables ledger (posted from its GRN).">
            <Input value={form.invoice} onChange={(e) => set({ invoice: e.target.value })} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Expense account"><AccountPicker value={form.expense} manual filter={(a) => a.category === "expense"} onChange={(id) => set({ expense: id })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payee"><Input value={form.payee} onChange={(e) => set({ payee: e.target.value })} /></Field>
            <Field label="Cost centre"><CostCentrePicker value={form.cost_centre} onChange={(c) => set({ cost_centre: c })} /></Field>
          </div>
        </>
      )}
      <Field label="Narration"><Input value={form.narration} onChange={(e) => set({ narration: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Gross amount (₹)"><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
        <Field label="TDS (₹)"><Input type="number" min="0" step="0.01" value={form.tds} onChange={(e) => set({ tds: e.target.value })} /></Field>
        <Field label="TDS section">
          <Select value={form.tds_section} onChange={(e) => set({ tds_section: e.target.value })}>
            {["194C", "194J", "194I", "194Q", "194H"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
      {amount > 0 && (
        <p className="text-[12px] text-[#475569]">
          Bank pays <strong>{formatINR(amount - tds)}</strong>{tds > 0 && <> · {formatINR(tds)} held as TDS payable</>}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Pay from"><AccountPicker value={form.bank} filter={(a) => a.is_bank || a.is_cash} onChange={(id) => set({ bank: id })} /></Field>
        <Field label="Method">
          <Select value={form.method} onChange={(e) => set({ method: e.target.value })}>
            {["NEFT", "RTGS", "IMPS", "Cheque", "Cash"].map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} /></Field>
      </div>
      <Field label="Reference"><Input value={form.reference} onChange={(e) => set({ reference: e.target.value })} placeholder="UTR / cheque no." /></Field>
    </Modal>
  )
}

interface DraftLine {
  account: number | ""
  debit: string
  credit: string
  cost_centre: string
  narration: string
  party_id: string
  party_name: string
}

const emptyLine = (): DraftLine => ({ account: "", debit: "", credit: "", cost_centre: "", narration: "", party_id: "", party_name: "" })

function JournalVoucherModal({ type, onClose, onSaved }: { type: "JV" | "OB"; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today())
  const [narration, setNarration] = useState(type === "OB" ? "Opening balances" : "")
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()])
  const action = useAction()
  const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0)
  const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const balanced = Math.round(debit * 100) === Math.round(credit * 100) && debit > 0
  const update = (i: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  const submit = () =>
    action.run(
      () =>
        accountsApi.submitVoucher({
          voucher_type: type,
          date,
          narration,
          lines: lines
            .filter((l) => l.account !== "")
            .map((l) => ({
              account: { id: Number(l.account) },
              debit: Number(l.debit || 0) || undefined,
              credit: Number(l.credit || 0) || undefined,
              cost_centre: l.cost_centre || undefined,
              narration: l.narration || undefined,
              party: l.party_id ? { id: l.party_id, name: l.party_name } : undefined,
              document_no: type === "OB" && l.party_id ? `OPENING-${l.party_id}` : undefined,
            })),
        }),
      onSaved,
    )

  return (
    <Modal
      wide
      title={type === "OB" ? "Opening balances" : "Journal voucher"}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={action.busy} disabled={!balanced || !narration.trim()} onClick={submit}>Submit for approval</Button></>}
    >
      <ErrorNote message={action.error} />
      {type === "OB" ? (
        <p className="text-[12px] text-[#475569]">
          Enter the closing trial balance carried over from the previous system, dated the day before the books start here. Receivable and payable lines need the party, so each opens on its sub-ledger. Opening balances can be posted once; correct them afterwards with a journal voucher.
        </p>
      ) : (
        <p className="text-[12px] text-[#475569]">
          Manual journals cannot touch receivable or payable control accounts — those move only through bills, receipts and payments.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Narration"><Input value={narration} onChange={(e) => setNarration(e.target.value)} /></Field>
      </div>
      <Table dense>
        <thead>
          <tr>
            <Th className="w-[34%]">Account</Th>
            {type === "OB" ? <Th>Party (receivables / payables)</Th> : <Th>Cost centre</Th>}
            <Th>Line narration</Th>
            <Th right>Debit</Th>
            <Th right>Credit</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <Td><AccountPicker value={l.account} manual={type === "JV"} onChange={(id) => update(i, { account: id })} /></Td>
              <Td>
                {type === "OB" ? (
                  <div className="flex gap-1">
                    <Input placeholder="ID" value={l.party_id} onChange={(e) => update(i, { party_id: e.target.value })} />
                    <Input placeholder="Name" value={l.party_name} onChange={(e) => update(i, { party_name: e.target.value })} />
                  </div>
                ) : (
                  <CostCentrePicker value={l.cost_centre} onChange={(c) => update(i, { cost_centre: c })} />
                )}
              </Td>
              <Td><Input value={l.narration} onChange={(e) => update(i, { narration: e.target.value })} /></Td>
              <Td><Input type="number" min="0" step="0.01" className="text-right" value={l.debit} onChange={(e) => update(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} /></Td>
              <Td><Input type="number" min="0" step="0.01" className="text-right" value={l.credit} onChange={(e) => update(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} /></Td>
              <Td>
                {lines.length > 2 && (
                  <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove line" className="text-[#94A3B8] hover:text-[#B42318] pt-1.5">
                    <Trash2 size={14} />
                  </button>
                )}
              </Td>
            </tr>
          ))}
          <tr>
            <Td colSpan={3}>
              <Button size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={13} /> Add line</Button>
            </Td>
            <Td right><Money value={debit} strong /></Td>
            <Td right><Money value={credit} strong /></Td>
            <Td />
          </tr>
        </tbody>
      </Table>
      {!balanced && debit + credit > 0 && (
        <p className="text-[12px] text-[#B42318]">Out of balance by {formatINR(Math.abs(debit - credit))}.</p>
      )}
    </Modal>
  )
}

