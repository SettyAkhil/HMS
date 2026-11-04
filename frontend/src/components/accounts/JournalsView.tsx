import { useState } from "react"
import { Download } from "lucide-react"
import type { Journal } from "../../types/accounts"
import { accountsApi } from "../../services/accounts/client"
import AccountPicker from "./AccountPicker"
import {
  Button, Card, DateRangeBar, Empty, ErrorNote, Field, Input, Loaded, Modal, Money, PageHeader, Pill, Select, Table,
  Td, Textarea, Th, downloadCsv, formatDate, formatDateTime, fyStart, today, useAction, useApi,
} from "./ui"

export const VOUCHER_TYPES: Record<string, string> = {
  SI: "Sales invoice",
  RV: "Receipt",
  PV: "Payment",
  PI: "Purchase invoice",
  JV: "Journal",
  OB: "Opening balance",
  DEP: "Depreciation",
  RJ: "Reversal",
  YE: "Year-end close",
}

const SOURCES = ["billing", "pharmacy", "insurance", "hrms", "manual", "fixed_assets", "cash", "closing"]

export default function JournalsView() {
  const [tab, setTab] = useState<"register" | "statement">("register")
  return (
    <div>
      <PageHeader
        title="General ledger"
        subtitle="Every posted journal, in order. Posted entries cannot be edited or deleted — a mistake is corrected by a reversing entry, which keeps the audit trail intact."
        actions={
          <div className="flex border border-[#D0D5DD] rounded-none overflow-hidden">
            {(["register", "statement"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[12.5px] ${tab === t ? "bg-[#1B4FD8] text-white" : "bg-white text-[#344054]"}`}
              >
                {t === "register" ? "Journal register" : "Account statement"}
              </button>
            ))}
          </div>
        }
      />
      {tab === "register" ? <JournalRegister /> : <AccountStatement />}
    </div>
  )
}

function JournalRegister() {
  const [range, setRange] = useState<{ from?: string; to: string }>({ from: fyStart(), to: today() })
  const [filter, setFilter] = useState({ voucher_type: "", source: "", q: "" })
  const [openId, setOpenId] = useState<number | null>(null)
  const state = useApi(
    () => accountsApi.journals({ ...range, ...filter, limit: 500 }),
    [range.from, range.to, filter.voucher_type, filter.source, filter.q],
  )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <DateRangeBar from={range.from} to={range.to} onChange={setRange} />
        <Field label="Type">
          <Select value={filter.voucher_type} onChange={(e) => setFilter({ ...filter, voucher_type: e.target.value })}>
            <option value="">All types</option>
            {Object.entries(VOUCHER_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })}>
            <option value="">All sources</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <div className="w-64">
          <Field label="Search">
            <Input placeholder="Journal no, narration, document" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          </Field>
        </div>
      </div>
      <Loaded state={state}>
        {({ journals }) => (
          <Card padded={false}>
            {journals.length === 0 ? (
              <Empty>No journals match.</Empty>
            ) : (
              <Table dense>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Journal</Th>
                    <Th>Narration</Th>
                    <Th>Source</Th>
                    <Th right>Amount</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((j) => (
                    <tr key={j.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => setOpenId(j.id)}>
                      <Td className="whitespace-nowrap">{formatDate(j.journal_date)}</Td>
                      <Td className="font-mono text-[11.5px] whitespace-nowrap">{j.journal_no}</Td>
                      <Td>{j.narration}</Td>
                      <Td><span className="text-[#64748B]">{j.source_module}</span></Td>
                      <Td right><Money value={j.total} /></Td>
                      <Td><JournalStatus journal={j} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </Loaded>
      {openId !== null && <JournalDetailModal id={openId} onClose={() => setOpenId(null)} onChanged={state.reload} />}
    </div>
  )
}

function JournalStatus({ journal }: { journal: Journal }) {
  if (journal.status === "reversed") return <Pill tone="red">Reversed by {journal.reversed_by_no}</Pill>
  if (journal.reversal_of_no) return <Pill tone="amber">Reverses {journal.reversal_of_no}</Pill>
  return <Pill tone="green">Posted</Pill>
}

export function JournalDetailModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged?: () => void }) {
  const state = useApi(() => accountsApi.journal(id), [id])
  const [reversing, setReversing] = useState(false)
  const [reason, setReason] = useState("")
  const action = useAction()
  const j = state.data
  const canReverse = j && j.status === "posted" && !j.reversal_of_no && j.voucher_type !== "YE"
  return (
    <Modal
      title={j ? `${j.journal_no} · ${VOUCHER_TYPES[j.voucher_type] || j.voucher_type}` : "Journal"}
      onClose={onClose}
      wide
      footer={
        canReverse ? (
          reversing ? (
            <>
              <Button onClick={() => setReversing(false)}>Back</Button>
              <Button
                variant="danger"
                busy={action.busy}
                disabled={!reason.trim()}
                onClick={() =>
                  action.run(() => accountsApi.reverse(id, reason), () => {
                    onChanged?.()
                    onClose()
                  })
                }
              >
                Post reversal
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setReversing(true)}>Reverse this journal…</Button>
          )
        ) : undefined
      }
    >
      <Loaded state={state}>
        {(journal) => (
          <>
            <ErrorNote message={action.error} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
              <Meta label="Date" value={formatDate(journal.journal_date)} />
              <Meta label="Source" value={`${journal.source_module}${journal.source_ref ? ` · ${journal.source_ref}` : ""}`} />
              <Meta label="Prepared by" value={journal.created_by} />
              <Meta label="Approved by" value={journal.approved_by || "—"} />
            </div>
            <p className="text-[13px] text-gray-900">{journal.narration}</p>
            <Table dense>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Party / document</Th>
                  <Th>Cost centre</Th>
                  <Th right>Debit</Th>
                  <Th right>Credit</Th>
                </tr>
              </thead>
              <tbody>
                {journal.lines.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <div>{l.account_code} · {l.account_name}</div>
                      {l.narration && <div className="text-[11.5px] text-[#64748B]">{l.narration}</div>}
                    </Td>
                    <Td className="text-[#475569]">
                      {l.party_name}
                      {l.document_no && <span className="font-mono text-[11px] ml-1">{l.document_no}</span>}
                    </Td>
                    <Td className="text-[#475569]">{l.cost_centre}</Td>
                    <Td right><Money value={l.debit} blankZero /></Td>
                    <Td right><Money value={l.credit} blankZero /></Td>
                  </tr>
                ))}
                <tr>
                  <Td colSpan={3} className="font-semibold">Total</Td>
                  <Td right><Money value={journal.lines.reduce((s, l) => s + l.debit, 0)} strong /></Td>
                  <Td right><Money value={journal.lines.reduce((s, l) => s + l.credit, 0)} strong /></Td>
                </tr>
              </tbody>
            </Table>
            <p className="text-[11.5px] text-[#64748B]">Posted {formatDateTime(journal.created_at)}</p>
            {reversing && (
              <Field label="Reason for reversal" hint="Posts an equal and opposite journal dated today, and frees anything this journal settled.">
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            )}
          </>
        )}
      </Loaded>
    </Modal>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#64748B]">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  )
}

function AccountStatement() {
  const [accountId, setAccountId] = useState<number | "">("")
  const [range, setRange] = useState<{ from?: string; to: string }>({ from: fyStart(), to: today() })
  const [openId, setOpenId] = useState<number | null>(null)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80">
          <Field label="Account"><AccountPicker value={accountId} onChange={(id) => setAccountId(id)} /></Field>
        </div>
        <DateRangeBar from={range.from} to={range.to} onChange={setRange} />
      </div>
      {accountId === "" ? (
        <Card><Empty>Choose an account to see its statement.</Empty></Card>
      ) : (
        <StatementBody accountId={accountId} range={range} onOpen={setOpenId} />
      )}
      {openId !== null && <JournalDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function StatementBody({ accountId, range, onOpen }: { accountId: number; range: { from?: string; to: string }; onOpen: (id: number) => void }) {
  const state = useApi(() => accountsApi.accountStatement(accountId, range), [accountId, range.from, range.to])
  return (
    <Loaded state={state}>
      {(s) => (
        <Card
          padded={false}
          title={`${s.account.code} · ${s.account.name}`}
          actions={
            <Button
              size="sm"
              onClick={() =>
                downloadCsv(
                  `ledger-${s.account.code}-${s.from}-${s.to}.csv`,
                  ["Date", "Journal", "Narration", "Party", "Document", "Debit", "Credit", "Balance"],
                  s.entries.map((e) => [e.journal_date, e.journal_no, e.narration || e.journal_narration, e.party_name, e.document_no, e.debit, e.credit, e.balance]),
                )
              }
            >
              <Download size={13} /> CSV
            </Button>
          }
        >
          <Table dense>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Journal</Th>
                <Th>Particulars</Th>
                <Th right>Debit</Th>
                <Th right>Credit</Th>
                <Th right>Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-[#F8FAFC]">
                <Td>{formatDate(s.from)}</Td>
                <Td />
                <Td className="font-medium">Opening balance</Td>
                <Td />
                <Td />
                <Td right><Money value={s.opening} strong /></Td>
              </tr>
              {s.entries.map((e, i) => (
                <tr key={`${e.journal_id}-${i}`} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => onOpen(e.journal_id)}>
                  <Td className="whitespace-nowrap">{formatDate(e.journal_date)}</Td>
                  <Td className="font-mono text-[11.5px] whitespace-nowrap">{e.journal_no}</Td>
                  <Td>
                    {e.narration || e.journal_narration}
                    {(e.party_name || e.document_no) && (
                      <div className="text-[11.5px] text-[#64748B]">{[e.party_name, e.document_no].filter(Boolean).join(" · ")}</div>
                    )}
                  </Td>
                  <Td right><Money value={e.debit} blankZero /></Td>
                  <Td right><Money value={e.credit} blankZero /></Td>
                  <Td right><Money value={e.balance} /></Td>
                </tr>
              ))}
              <tr className="bg-[#F8FAFC]">
                <Td>{formatDate(s.to)}</Td>
                <Td />
                <Td className="font-medium">Closing balance</Td>
                <Td />
                <Td />
                <Td right><Money value={s.closing} strong /></Td>
              </tr>
            </tbody>
          </Table>
        </Card>
      )}
    </Loaded>
  )
}
