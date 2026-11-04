import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import type { Account, AccountCategory } from "../../types/accounts"
import { accountsApi } from "../../services/accounts/client"
import { loadChart } from "./AccountPicker"
import {
  Button, Card, ErrorNote, Field, Input, Loaded, Modal, Money, Notice, PageHeader, Pill, Select, Table, Td, Th,
  useAction, useApi,
} from "./ui"

const CATEGORY_LABEL: Record<AccountCategory, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses",
}

function depthOf(account: Account, byId: Map<number, Account>) {
  let depth = 0
  let node = account
  while (node.parent_id && byId.has(node.parent_id)) {
    depth += 1
    node = byId.get(node.parent_id)!
  }
  return depth
}

export default function ChartOfAccountsView() {
  const state = useApi(() => accountsApi.chart(), [])
  const [query, setQuery] = useState("")
  const [showInactive, setShowInactive] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () => {
    loadChart(true)
    state.reload()
  }

  return (
    <div>
      <PageHeader
        title="Chart of accounts"
        subtitle="Balances are derived from posted journals. Control accounts (receivables, payables) are posted only through their sub-ledgers; accounts with a system role are used by posting rules and cannot be deactivated."
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> New account
          </Button>
        }
      />
      <div className="space-y-3">
        <Notice message={notice} onClose={() => setNotice(null)} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-72">
            <Input placeholder="Search code or name" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] text-[#475569]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
        </div>
        <Loaded state={state}>
          {(data) => {
            const list = Array.isArray((data as any)?.accounts)
              ? (data as any).accounts
              : Array.isArray(data)
                ? (data as any)
                : []
            return (
              <ChartTable
                accounts={list}
                query={query}
                showInactive={showInactive}
                onEdit={setEditing}
              />
            )
          }}
        </Loaded>
      </div>
      {adding && state.data && (
        <AddAccountModal
          accounts={
            Array.isArray((state.data as any)?.accounts)
              ? (state.data as any).accounts
              : Array.isArray(state.data)
                ? (state.data as any)
                : []
          }
          onClose={() => setAdding(false)}
          onSaved={(a) => {
            setAdding(false)
            setNotice(`Account ${a.code} ${a.name} created.`)
            refresh()
          }}
        />
      )}
      {editing && (
        <EditAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function ChartTable({
  accounts, query, showInactive, onEdit,
}: { accounts: Account[]; query: string; showInactive: boolean; onEdit: (a: Account) => void }) {
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  // Group balances roll up from their children.
  const rolled = useMemo(() => {
    const totals = new Map<number, number>()
    for (const a of accounts) {
      if (a.is_group) continue
      const signed = a.normal_balance === (a.category === "asset" || a.category === "expense" ? "debit" : "credit") ? a.balance : -a.balance
      let node: Account | undefined = a
      while (node?.parent_id) {
        totals.set(node.parent_id, (totals.get(node.parent_id) || 0) + signed)
        node = byId.get(node.parent_id)
      }
    }
    return totals
  }, [accounts, byId])
  const q = query.trim().toLowerCase()
  const visible = accounts.filter(
    (a) => (showInactive || a.is_active) && (!q || a.code.includes(q) || a.name.toLowerCase().includes(q)),
  )
  return (
    <Card padded={false}>
      <Table dense>
        <thead>
          <tr>
            <Th>Code</Th>
            <Th>Account</Th>
            <Th>Type</Th>
            <Th right>Balance</Th>
            <Th right>Lines</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {visible.map((a) => {
            const depth = q ? 0 : depthOf(a, byId)
            return (
              <tr key={a.id} className={a.is_group ? "bg-[#F8FAFC]" : ""}>
                <Td className="tabular-nums text-[#475569]">{a.code}</Td>
                <Td>
                  <span style={{ paddingLeft: depth * 16 }} className={a.is_group ? "font-semibold text-gray-900" : ""}>
                    {a.name}
                  </span>
                  {!a.is_active && <span className="ml-2"><Pill>Inactive</Pill></span>}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {!a.parent_id && <Pill tone="blue">{CATEGORY_LABEL[a.category]}</Pill>}
                    {a.party_type && <Pill tone="amber">Control · {a.party_type}</Pill>}
                    {a.is_bank && <Pill>Bank</Pill>}
                    {a.is_cash && <Pill>Cash</Pill>}
                    {a.normal_balance !== (a.category === "asset" || a.category === "expense" ? "debit" : "credit") && <Pill>Contra</Pill>}
                    {a.system_role && <span className="text-[10.5px] text-[#94A3B8] font-mono self-center">{a.system_role}</span>}
                  </div>
                </Td>
                <Td right>
                  {a.is_group ? (
                    <span className="text-[#475569]"><Money value={rolled.get(a.id) || 0} blankZero /></span>
                  ) : (
                    <Money value={a.balance} blankZero />
                  )}
                </Td>
                <Td right className="tabular-nums text-[#64748B]">{a.is_group ? "" : a.line_count || ""}</Td>
                <Td right>
                  <Button size="sm" variant="ghost" onClick={() => onEdit(a)}>Edit</Button>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </Card>
  )
}

function AddAccountModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: (a: Account) => void }) {
  const headings = accounts.filter((a) => a.is_group && a.is_active)
  const [form, setForm] = useState({ code: "", name: "", parent_code: headings[0]?.code || "", kind: "posting", description: "" })
  const action = useAction()
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const save = () =>
    action.run(
      () =>
        accountsApi.createAccount({
          code: form.code.trim(),
          name: form.name.trim(),
          parent_code: form.parent_code,
          is_group: form.kind === "heading",
          is_bank: form.kind === "bank",
          is_cash: form.kind === "cash",
          description: form.description || undefined,
        }),
      onSaved,
    )
  return (
    <Modal
      title="New account"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={action.busy} disabled={!form.code || !form.name} onClick={save}>Create account</Button>
        </>
      }
    >
      <ErrorNote message={action.error} />
      <Field label="Under heading" hint="The account takes its category (asset, income…) from the heading.">
        <Select value={form.parent_code} onChange={(e) => set({ parent_code: e.target.value })}>
          {headings.map((h) => (
            <option key={h.id} value={h.code}>{h.code} · {h.name}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Code"><Input value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="5340" /></Field>
        <div className="col-span-2">
          <Field label="Name"><Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Housekeeping services" /></Field>
        </div>
      </div>
      <Field label="Kind">
        <Select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
          <option value="posting">Posting account</option>
          <option value="heading">Heading (groups other accounts, takes no postings)</option>
          <option value="bank">Bank account</option>
          <option value="cash">Cash account / till</option>
        </Select>
      </Field>
      <Field label="Description (optional)"><Input value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
    </Modal>
  )
}

function EditAccountModal({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(account.name)
  const [description, setDescription] = useState(account.description || "")
  const [active, setActive] = useState(account.is_active)
  const action = useAction()
  return (
    <Modal
      title={`${account.code} · ${account.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={action.busy}
            onClick={() => action.run(() => accountsApi.updateAccount(account.id, { name, description, is_active: active }), onSaved)}
          >
            Save
          </Button>
        </>
      }
    >
      <ErrorNote message={action.error} />
      <p className="text-[12px] text-[#64748B]">
        Category, normal balance and system role are fixed once an account exists — changing them would restate history.
      </p>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={active} disabled={Boolean(account.system_role)} onChange={(e) => setActive(e.target.checked)} />
        Active {account.system_role && <span className="text-[#64748B]">(used by posting rules — always active)</span>}
      </label>
    </Modal>
  )
}
