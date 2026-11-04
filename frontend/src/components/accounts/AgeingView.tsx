import { useState } from "react"
import { Download } from "lucide-react"
import type { AgeingBucket } from "../../types/accounts"
import { accountsApi } from "../../services/accounts/client"
import {
  Button, Card, DateRangeBar, Empty, Grid, Loaded, Money, PageHeader, Pill, Stat, Table, Td, Th, downloadCsv,
  formatDate, formatINRShort, today, useApi,
} from "./ui"

const BUCKETS: AgeingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"]
const BUCKET_LABEL: Record<AgeingBucket, string> = {
  current: "Not yet due", "1-30": "1–30 days", "31-60": "31–60 days", "61-90": "61–90 days", "90+": "Over 90 days",
}

/** Receivables (patients, insurers, corporates) or payables (suppliers), aged by days past due. */
export default function AgeingView({ ledger }: { ledger: "AR" | "AP" }) {
  const [asOf, setAsOf] = useState(today())
  const [view, setView] = useState<"party" | "document">("party")
  const [party, setParty] = useState<string | null>(null)
  const state = useApi(() => accountsApi.ageing(ledger, asOf), [ledger, asOf])
  const isAR = ledger === "AR"

  return (
    <div>
      <PageHeader
        title={isAR ? "Receivables" : "Payables"}
        subtitle={
          isAR
            ? "What patients, insurers and corporates owe, by bill. Bills open here when posted and close as receipts and settlements are allocated to them."
            : "What the hospital owes suppliers, by invoice. Invoices open from goods receipts and close when a payment voucher is approved."
        }
        actions={<DateRangeBar single to={asOf} onChange={(r) => setAsOf(r.to)} />}
      />
      <Loaded state={state}>
        {(data) => {
          const rawItems = Array.isArray(data?.items) ? data.items : []
          const totals = data?.totals || { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }
          const items = party ? rawItems.filter((i) => `${i.party_type}:${i.party_id}` === party) : rawItems
          return (
            <div className="space-y-4">
              <Grid cols={5}>
                {BUCKETS.map((b) => (
                  <Stat key={b} label={BUCKET_LABEL[b]} value={formatINRShort(totals[b] || 0)} tone={b === "90+" && (totals[b] || 0) > 0 ? "bad" : b === "61-90" && (totals[b] || 0) > 0 ? "warn" : "default"} />
                ))}
              </Grid>
              <div className="flex items-center justify-between gap-2">
                <div className="flex border border-[#D0D5DD] rounded-none overflow-hidden">
                  {(["party", "document"] as const).map((v) => (
                    <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 text-[12.5px] ${view === v ? "bg-[#1B4FD8] text-white" : "bg-white"}`}>
                      {v === "party" ? (isAR ? "By payer" : "By supplier") : "By document"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {party && <Button size="sm" onClick={() => setParty(null)}>Show all parties</Button>}
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadCsv(
                        `${ledger.toLowerCase()}-ageing-${asOf}.csv`,
                        ["Party", "Document", "Date", "Due", "Days overdue", "Amount", "Settled", "Outstanding"],
                        rawItems.map((i) => [i.party_name, i.document_no, i.document_date, i.due_date, i.days_overdue, i.amount, i.settled, i.outstanding]),
                      )
                    }
                  >
                    <Download size={13} /> CSV
                  </Button>
                </div>
              </div>
              <Card padded={false}>
                {rawItems.length === 0 ? (
                  <Empty>Nothing outstanding as of {formatDate(asOf)}.</Empty>
                ) : view === "party" && !party ? (
                  <Table dense>
                    <thead>
                      <tr>
                        <Th>{isAR ? "Payer" : "Supplier"}</Th>
                        <Th right>Docs</Th>
                        {BUCKETS.map((b) => <Th key={b} right>{BUCKET_LABEL[b]}</Th>)}
                        <Th right>Total</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.parties.map((p) => (
                        <tr key={`${p.party_type}:${p.party_id}`} className="hover:bg-[#F8FAFC] cursor-pointer" onClick={() => { setParty(`${p.party_type}:${p.party_id}`); setView("document") }}>
                          <Td>
                            <div className="font-medium text-gray-900">{p.party_name}</div>
                            <div className="text-[11px] text-[#64748B]">{p.party_type} · {p.party_id}</div>
                          </Td>
                          <Td right className="tabular-nums">{p.documents}</Td>
                          {BUCKETS.map((b) => <Td key={b} right><Money value={p[b]} blankZero /></Td>)}
                          <Td right><Money value={p.total} strong /></Td>
                        </tr>
                      ))}
                      <tr className="bg-[#F8FAFC]">
                        <Td className="font-semibold">Total</Td>
                        <Td />
                        {BUCKETS.map((b) => <Td key={b} right><Money value={data.totals[b]} strong /></Td>)}
                        <Td right><Money value={data.totals.total} strong /></Td>
                      </tr>
                    </tbody>
                  </Table>
                ) : (
                  <Table dense>
                    <thead>
                      <tr>
                        <Th>Document</Th>
                        <Th>{isAR ? "Payer" : "Supplier"}</Th>
                        <Th>Account</Th>
                        <Th>Dated</Th>
                        <Th>Due</Th>
                        <Th right>Amount</Th>
                        <Th right>Settled</Th>
                        <Th right>Outstanding</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id}>
                          <Td className="font-mono text-[11.5px]">{i.document_no}</Td>
                          <Td>{i.party_name}</Td>
                          <Td className="text-[#64748B]">{i.account_name}</Td>
                          <Td className="whitespace-nowrap">{formatDate(i.document_date)}</Td>
                          <Td className="whitespace-nowrap">{formatDate(i.due_date)}</Td>
                          <Td right><Money value={i.amount} /></Td>
                          <Td right><Money value={i.settled} blankZero /></Td>
                          <Td right><Money value={i.outstanding} strong /></Td>
                          <Td>
                            {i.days_overdue > 0 ? (
                              <Pill tone={i.days_overdue > 90 ? "red" : i.days_overdue > 60 ? "amber" : "neutral"}>{i.days_overdue}d overdue</Pill>
                            ) : (
                              <Pill tone="green">Not due</Pill>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          )
        }}
      </Loaded>
    </div>
  )
}
