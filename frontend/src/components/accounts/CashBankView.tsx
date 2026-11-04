import { useState } from "react"
import type { CashSession } from "../../types/accounts"
import { accountsApi } from "../../services/accounts/client"
import AccountPicker from "./AccountPicker"
import {
  Button, Card, Empty, ErrorNote, Field, Grid, Input, Loaded, Money, Notice, PageHeader, Pill, Stat, Table, Td, Th,
  formatDate, formatDateTime, formatINR, formatINRShort, today, useAction, useApi,
} from "./ui"

export default function CashBankView() {
  return (
    <div className="space-y-6">
      <Tills />
      <BankReconciliation />
    </div>
  )
}

// ── Cashier tills ───────────────────────────────────────────────────────────

function Tills() {
  const state = useApi(() => accountsApi.cashSessions(), [])
  const [account, setAccount] = useState<number | "">("")
  const [float, setFloat] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()
  return (
    <div>
      <PageHeader
        title="Cashier tills"
        subtitle="Open a till with its float; at close the cashier counts the cash. Expected cash is the float plus everything the ledger posted to that till during the session. A supervisor — not the cashier — verifies, and any variance posts to cash over / short."
      />
      <div className="space-y-3">
        <Notice message={notice} onClose={() => setNotice(null)} />
        <ErrorNote message={action.error} />
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-72"><Field label="Till"><AccountPicker value={account} filter={(a) => a.is_cash} onChange={(id) => setAccount(id)} /></Field></div>
            <div className="w-40"><Field label="Opening float (₹)"><Input type="number" min="0" value={float} onChange={(e) => setFloat(e.target.value)} /></Field></div>
            <Button
              variant="primary"
              busy={action.busy}
              disabled={account === ""}
              onClick={() =>
                action.run(() => accountsApi.openCashSession({ cash_account: { id: Number(account) }, opening_float: Number(float || 0) }), () => {
                  setNotice("Till opened.")
                  setFloat("")
                  state.reload()
                })
              }
            >
              Open till
            </Button>
          </div>
        </Card>
        <Loaded state={state}>
          {(raw) => {
            const sessions = Array.isArray(raw?.sessions) ? raw.sessions : Array.isArray(raw) ? raw : []
            const me = raw?.me || ""
            return sessions.length === 0 ? (
              <Card><Empty>No till sessions yet.</Empty></Card>
            ) : (
              <Card padded={false}>
                <Table dense>
                  <thead>
                    <tr>
                      <Th>Till</Th><Th>Cashier</Th><Th>Opened</Th><Th right>Float</Th><Th right>Expected</Th><Th right>Counted</Th><Th right>Variance</Th><Th>Status</Th><Th />
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <TillRow key={s.id} session={s} me={me} onChanged={(m) => { setNotice(m); state.reload() }} />
                    ))}
                  </tbody>
                </Table>
              </Card>
            )
          }}
        </Loaded>
      </div>
    </div>
  )
}

function TillRow({ session: s, me, onChanged }: { session: CashSession; me: string; onChanged: (message: string) => void }) {
  const [counted, setCounted] = useState("")
  const action = useAction()
  return (
    <>
      <tr>
        <Td>{s.account_code} · {s.account_name}</Td>
        <Td>{s.cashier}</Td>
        <Td className="whitespace-nowrap">{formatDateTime(s.opened_at)}</Td>
        <Td right><Money value={s.opening_float} /></Td>
        <Td right>{s.expected === null ? "—" : <Money value={s.expected} />}</Td>
        <Td right>{s.counted === null ? "—" : <Money value={s.counted} />}</Td>
        <Td right>{s.variance === null ? "—" : <Money value={s.variance} strong />}</Td>
        <Td>
          <Pill tone={s.status === "open" ? "blue" : s.status === "closed" ? "amber" : "green"}>
            {s.status === "verified" ? `Verified by ${s.verified_by}` : s.status === "closed" ? "Awaiting verification" : "Open"}
          </Pill>
        </Td>
        <Td>
          {s.status === "open" && (
            <div className="flex items-center gap-1">
              <Input type="number" placeholder="Counted ₹" className="w-28" value={counted} onChange={(e) => setCounted(e.target.value)} />
              <Button size="sm" busy={action.busy} disabled={counted === ""} onClick={() => action.run(() => accountsApi.closeCashSession(s.id, Number(counted)), (r) => onChanged(`Till closed. Variance ${formatINR(r.variance)}.`))}>
                Close
              </Button>
            </div>
          )}
          {s.status === "closed" && (s.cashier === me ? (
            <span className="text-[11.5px] text-[#64748B]">Needs a supervisor</span>
          ) : (
            <Button size="sm" variant="primary" busy={action.busy} onClick={() => action.run(() => accountsApi.verifyCashSession(s.id), () => onChanged("Till verified."))}>
              Verify
            </Button>
          ))}
        </Td>
      </tr>
      {action.error && (
        <tr><Td colSpan={9}><ErrorNote message={action.error} /></Td></tr>
      )}
    </>
  )
}

// ── Bank reconciliation ─────────────────────────────────────────────────────

function BankReconciliation() {
  const [account, setAccount] = useState<number | "">("")
  return (
    <div>
      <PageHeader
        title="Bank reconciliation"
        subtitle="Tick the ledger lines that appear on the bank statement. What remains unticked explains the difference between the books and the bank."
        actions={<div className="w-72"><AccountPicker value={account} filter={(a) => a.is_bank} placeholder="Choose bank account" onChange={(id) => setAccount(id)} /></div>}
      />
      {account === "" ? <Card><Empty>Choose a bank account.</Empty></Card> : <ReconcileBody accountId={account} />}
    </div>
  )
}

function ReconcileBody({ accountId }: { accountId: number }) {
  const state = useApi(() => accountsApi.bankReconciliation(accountId), [accountId])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [statementDate, setStatementDate] = useState(today())
  const [ref, setRef] = useState("")
  const action = useAction()
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <Loaded state={state}>
      {(r) => (
        <div className="space-y-3">
          <Grid cols={4}>
            <Stat label="Balance per books" value={formatINRShort(r.book_balance)} />
            <Stat label="Cleared on statement" value={formatINRShort(r.cleared_balance)} />
            <Stat label="Receipts not yet on statement" value={formatINRShort(r.uncleared_receipts)} />
            <Stat label="Payments not yet on statement" value={formatINRShort(r.uncleared_payments)} />
          </Grid>
          <ErrorNote message={action.error} />
          <Card
            padded={false}
            title={`${r?.pending?.length || 0} unreconciled line(s)`}
            actions={
              <div className="flex items-end gap-2">
                <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
                <Input placeholder="Statement ref" value={ref} onChange={(e) => setRef(e.target.value)} />
                <Button
                  variant="primary"
                  size="sm"
                  busy={action.busy}
                  disabled={picked.size === 0}
                  onClick={() => action.run(() => accountsApi.reconcile(accountId, [...picked], statementDate, ref || undefined), () => { setPicked(new Set()); state.reload() })}
                >
                  Mark {picked.size || ""} cleared
                </Button>
              </div>
            }
          >
            {(!r?.pending || r.pending.length === 0) ? (
              <Empty>Everything on this account is reconciled.</Empty>
            ) : (
              <Table dense>
                <thead>
                  <tr><Th /><Th>Date</Th><Th>Journal</Th><Th>Narration</Th><Th right>Receipt</Th><Th right>Payment</Th></tr>
                </thead>
                <tbody>
                  {r.pending.map((l) => (
                    <tr key={l.id} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => toggle(l.id)}>
                      <Td><input type="checkbox" readOnly checked={picked.has(l.id)} /></Td>
                      <Td className="whitespace-nowrap">{formatDate(l.journal_date)}</Td>
                      <Td className="font-mono text-[11.5px]">{l.journal_no}</Td>
                      <Td>{l.line_narration || l.narration}</Td>
                      <Td right><Money value={l.debit} blankZero /></Td>
                      <Td right><Money value={l.credit} blankZero /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </Loaded>
  )
}
