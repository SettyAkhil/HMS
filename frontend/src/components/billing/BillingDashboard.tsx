import { useEffect, useMemo, useState } from "react"
import {
  AlarmClock,
  ArrowRight,
  BedDouble,
  FlaskConical,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  Siren,
  Stethoscope,
  TrendingUp,
  Wallet,
} from "lucide-react"
import {
  BillingDatabase,
  type ClaimRecord,
  type DepartmentType,
} from "../../services/billingDb"
import { LabOrderDatabase, type LabOrder } from "../../services/labOrdersDb"
import { claimAmountOf, claimStage, isInsured } from "../insurance/ClaimPanel"
import {
  BillingHeader,
  KpiTile,
  PanelTitle,
  headerBtnSoft,
  headerBtnSolid,
} from "./BillingChrome"
import { MODE_ICON, type IconType, type Payment, ageDays, inr } from "./dashParts"

// The Billing landing page. It answers three questions, in reading order:
//   1. How much work is waiting?   -> four figures, each shown once
//   2. What do I collect next?     -> the "Needs collection" list
//   3. Where do I go?              -> counters and insurance, on the right
// Revenue figures live on Revenue & Dues, not here.

type CounterKey = "op" | "ip" | "er"

const COUNTERS: {
  key: CounterKey
  module: string
  label: string
  Icon: IconType
  departments: DepartmentType[]
}[] = [
  {
    key: "op",
    module: "billing_op",
    label: "OP Billing",
    Icon: Stethoscope,
    departments: ["Outpatient", "Laboratory", "Radiology", "Pharmacy"],
  },
  {
    key: "ip",
    module: "billing_ip",
    label: "IP Billing",
    Icon: BedDouble,
    departments: ["Inpatient", "ICU", "Surgery"],
  },
  {
    key: "er",
    module: "billing_er",
    label: "Emergency Billing",
    Icon: Siren,
    departments: ["Emergency"],
  },
]

const counterOf = (d: DepartmentType) => COUNTERS.find((c) => c.departments.includes(d)) ?? COUNTERS[0]

const STAGES = [
  { key: "To claim", label: "To claim", dot: "bg-blue-600" },
  { key: "With insurer", label: "With insurer", dot: "bg-sky-500" },
  { key: "Query", label: "Insurer query", dot: "bg-amber-500" },
  { key: "Approved", label: "Approved — awaiting payment", dot: "bg-violet-600" },
  { key: "Denied", label: "Denied / appeal", dot: "bg-rose-600" },
  { key: "Settled", label: "Settled", dot: "bg-emerald-600" },
] as const

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

export default function BillingDashboard({
  onNavigate,
}: {
  onNavigate: (module: string) => void
}) {
  const [claims, setClaims] = useState<ClaimRecord[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [labQueue, setLabQueue] = useState<LabOrder[]>([])
  const [filter, setFilter] = useState<"all" | CounterKey>("all")
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const load = () => {
      setClaims(BillingDatabase.getClaims())
      setPayments(BillingDatabase.getAllPayments() as Payment[])
    }
    load()
    const unBilling = BillingDatabase.onUpdate(load)
    const loadLab = () => setLabQueue(LabOrderDatabase.getBillingQueue())
    loadLab()
    const unLab = LabOrderDatabase.subscribe(loadLab)
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    return () => {
      unBilling()
      unLab()
      window.clearInterval(clock)
    }
  }, [])

  // Other screens (ER, registration, appointments) open Billing with a bill
  // preselected. The dashboard is not a counter, so hand the bill on to the
  // counter that settles it; the counter consumes the preselection.
  useEffect(() => {
    const pre = BillingDatabase.getPreselectedClaimForBilling()
    if (!pre || claims.length === 0) return
    const q = pre.toLowerCase()
    const found = claims.find(
      (c) =>
        c.id === pre ||
        c.invoiceNo === pre ||
        c.encounterId === pre ||
        c.patientId === pre ||
        c.patientName?.toLowerCase() === q,
    )
    if (!found) {
      // Unknown bill: drop it so it cannot bounce every later visit away.
      BillingDatabase.clearPreselectedClaimForBilling()
      return
    }
    onNavigate(counterOf(found.department).module)
  }, [claims, onNavigate])

  const unpaid = useMemo(
    () =>
      claims
        .filter((c) => (c.balanceDue || 0) > 0)
        .sort((a, b) => {
          const timeB = new Date(b.createdAt || b.dateOfService || 0).getTime()
          const timeA = new Date(a.createdAt || a.dateOfService || 0).getTime()
          return timeB - timeA || b.balanceDue - a.balanceDue
        }),
    [claims],
  )

  const kpi = useMemo(() => {
    const aged = unpaid.filter((c) => ageDays(c.dateOfService) > 30)
    const open = claims.filter((c) => isInsured(c) && claimStage(c) !== "Settled")
    return {
      waiting: unpaid.length,
      due: unpaid.reduce((a, c) => a + (c.balanceDue || 0), 0),
      agedCount: aged.length,
      agedAmount: aged.reduce((a, c) => a + (c.balanceDue || 0), 0),
      claimsOpen: open.length,
      toClaim: open.filter((c) => claimStage(c) === "To claim").length,
      labCount: labQueue.length,
      labAmount: labQueue.reduce((a, o) => a + (o.billing.total || 0), 0),
    }
  }, [claims, unpaid, labQueue])

  const counters = useMemo(
    () =>
      COUNTERS.map((c) => {
        const mine = unpaid.filter((x) => c.departments.includes(x.department))
        return {
          ...c,
          waiting: mine.length,
          due: mine.reduce((a, x) => a + (x.balanceDue || 0), 0),
          oldest: mine.reduce((m, x) => Math.max(m, ageDays(x.dateOfService)), 0),
        }
      }),
    [unpaid],
  )

  const stages = useMemo(() => {
    const counts = new Map<string, { n: number ;amount: number }>(STAGES.map((s) => [s.key, { n: 0, amount: 0 }]))
    for (const c of claims) {
      if (!isInsured(c)) continue
      const s = claimStage(c)
      const r = counts.get(s === "Appeal" ? "Denied" : s)
      if (r) {
        r.n++
        r.amount += claimAmountOf(c)
      }
    }
    return STAGES.map((s) => ({ ...s, ...counts.get(s.key)! }))
  }, [claims])

  const worklist = useMemo(
    () =>
      (filter === "all" ? unpaid : unpaid.filter((c) => counterOf(c.department).key === filter)).slice(0, 8),
    [unpaid, filter],
  )

  const recent = useMemo(
    () =>
      [...payments]
        .sort((a, b) => new Date(b.paymentDate || 0).getTime() - new Date(a.paymentDate || 0).getTime())
        .slice(0, 5),
    [payments],
  )

  const collect = (c: ClaimRecord) => {
    BillingDatabase.setPreselectedClaimForBilling(c.id)
    onNavigate(counterOf(c.department).module)
  }

  const tabCls = (active: boolean) =>
    `px-3 h-8 text-[12px] font-bold border whitespace-nowrap cursor-pointer transition-colors ${
      active ? "bg-blue-600 text-white border-blue-700" : "bg-white text-slate-700 border-[#CBD5E1] hover:bg-slate-50"
    }`

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F1F5F9] overflow-hidden">
      <BillingHeader
        icon={LayoutDashboard}
        title="Billing Dashboard"
        pill={`Live · ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
        subtitle="What is waiting at the counters, what to collect next, and where insurance stands."
        actions={
          <>
            <button type="button" className={headerBtnSoft} onClick={() => onNavigate("billing_revenue")}>
              <TrendingUp size={13} /> Revenue &amp; Dues
            </button>
            <button type="button" className={headerBtnSolid} onClick={() => onNavigate("billing_op")}>
              <Receipt size={13} /> Open OP Counter
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 1. How much work is waiting -- each figure appears once */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiTile
            tone="amber"
            icon={Wallet}
            label="Bills waiting"
            value={kpi.waiting}
            sub={`${inr(kpi.due)} to collect`}
            onClick={() => setFilter("all")}
          />
          <KpiTile
            tone="rose"
            icon={AlarmClock}
            label="Overdue (30+ days)"
            value={kpi.agedCount}
            sub={`${inr(kpi.agedAmount)} needs follow-up`}
            onClick={() => onNavigate("billing_revenue")}
          />
          <KpiTile
            tone="purple"
            icon={ShieldCheck}
            label="Insurance claims open"
            value={kpi.claimsOpen}
            sub={`${kpi.toClaim} still to be claimed`}
            onClick={() => onNavigate("insurance")}
          />
          <KpiTile
            tone="sky"
            icon={FlaskConical}
            label="Lab bills waiting"
            value={kpi.labCount}
            sub={`${inr(kpi.labAmount)} — tests held until paid`}
            onClick={() => onNavigate("lab_billing")}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
          {/* 2. What to collect next */}
          <div className="space-y-4 min-w-0">
            <section className="bg-white border border-[#CBD5E1] shadow-2xs">
              <PanelTitle title="Needs collection" count={kpi.waiting} />
              <div className="px-4 py-2.5 border-b border-[#E2E8F0] flex flex-wrap items-center gap-1.5">
                <button type="button" className={tabCls(filter === "all")} onClick={() => setFilter("all")}>
                  All counters · {kpi.waiting}
                </button>
                {counters.map((c) => (
                  <button key={c.key} type="button" className={tabCls(filter === c.key)} onClick={() => setFilter(c.key)}>
                    {c.label.replace(" Billing", "")} · {c.waiting}
                  </button>
                ))}
                <span className="ml-auto text-[11.5px] text-slate-500">Recent first</span>
              </div>

              {worklist.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="text-[13px] font-bold text-emerald-700">All clear</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">No unpaid bills at this counter.</div>
                </div>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#E2E8F0]">
                      {["Patient", "Counter", "Waiting", "Due", ""].map((h, i) => (
                        <th
                          key={i}
                          className={`px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 ${
                            h === "Due" || h === "Waiting" ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.map((c) => {
                      const age = ageDays(c.dateOfService)
                      const ageCls =
                        age > 30 ? "text-rose-700 bg-rose-50 border-rose-200" : age > 7 ? "text-amber-800 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200"
                      return (
                        <tr key={c.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-slate-50/70">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 bg-slate-100 text-slate-700 text-[11px] font-bold flex items-center justify-center shrink-0">
                                {initials(c.patientName)}
                              </span>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">{c.patientName}</div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {c.department} · <span className="font-mono">{c.invoiceNo}</span>
                                  {isInsured(c) && <span className="text-violet-700"> · {c.insuranceProvider}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{counterOf(c.department).label.replace(" Billing", "")}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`px-1.5 py-0.5 border text-[11px] font-bold font-mono ${ageCls}`}>{age}d</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{inr(c.balanceDue)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => collect(c)}
                              className="px-3 h-8 bg-blue-600 hover:bg-blue-700 border border-blue-700 text-white text-[12px] font-bold cursor-pointer transition-colors"
                            >
                              Collect
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {(filter === "all" ? kpi.waiting : counters.find((c) => c.key === filter)!.waiting) > worklist.length && (
                <button
                  type="button"
                  onClick={() => onNavigate(filter === "all" ? "billing_op" : counters.find((c) => c.key === filter)!.module)}
                  className="w-full px-4 py-2.5 border-t border-[#E2E8F0] text-[12px] font-bold text-blue-700 hover:bg-blue-50 cursor-pointer text-left"
                >
                  See all at the counter →
                </button>
              )}
            </section>

            <section className="bg-white border border-[#CBD5E1] shadow-2xs">
              <PanelTitle
                title="Latest receipts"
                actions={
                  <button type="button" onClick={() => onNavigate("payments")} className="text-[12px] font-bold text-blue-700 hover:underline cursor-pointer">
                    Payment History →
                  </button>
                }
              />
              {recent.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-slate-400">No receipts yet.</div>
              ) : (
                <ul className="divide-y divide-[#F1F5F9]">
                  {recent.map((p) => {
                    const MIcon = MODE_ICON[p.paymentMethod] ?? Wallet
                    return (
                      <li key={p.id} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                        <MIcon size={15} className="text-emerald-600 shrink-0" />
                        <span className="font-semibold text-slate-900 truncate flex-1">{p.patientName}</span>
                        <span className="text-slate-500 hidden sm:inline">{p.paymentMethod}</span>
                        <span className="font-mono text-[11.5px] text-slate-500 w-32 text-right">{p.receiptNo}</span>
                        <span className="text-[11px] text-slate-400 w-28 text-right whitespace-nowrap">
                          {p.paymentDate
                            ? new Date(p.paymentDate).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* 3. Where to go */}
          <div className="space-y-4 min-w-0">
            <section className="bg-white border border-[#CBD5E1] shadow-2xs">
              <PanelTitle title="Counters" />
              <ul className="divide-y divide-[#F1F5F9]">
                {counters.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => onNavigate(c.module)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 cursor-pointer group"
                    >
                      <span className="w-9 h-9 bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                        <c.Icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-slate-900">{c.label}</div>
                        <div className="text-[11.5px] text-slate-500">
                          {c.waiting === 0 ? (
                            <span className="text-emerald-700 font-semibold">Queue clear</span>
                          ) : (
                            <>
                              {c.waiting} waiting · oldest {c.oldest}d
                            </>
                          )}
                        </div>
                      </div>
                      <span className="font-mono text-[13px] font-bold text-slate-900">{inr(c.due)}</span>
                      <ArrowRight size={15} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => onNavigate("lab_billing")}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-50 cursor-pointer group"
                  >
                    <span className="w-9 h-9 bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                      <FlaskConical size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-slate-900">Lab Test Billing</div>
                      <div className="text-[11.5px] text-slate-500">
                        {kpi.labCount === 0 ? <span className="text-emerald-700 font-semibold">Queue clear</span> : `${kpi.labCount} order${kpi.labCount === 1 ? "" : "s"} waiting`}
                      </div>
                    </div>
                    <span className="font-mono text-[13px] font-bold text-slate-900">{inr(kpi.labAmount)}</span>
                    <ArrowRight size={15} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
                  </button>
                </li>
              </ul>
            </section>

            <section className="bg-white border border-[#CBD5E1] shadow-2xs">
              <PanelTitle
                title="Insurance claims"
                actions={
                  <button type="button" onClick={() => onNavigate("insurance")} className="text-[12px] font-bold text-blue-700 hover:underline cursor-pointer">
                    Claims Desk →
                  </button>
                }
              />
              <ul className="divide-y divide-[#F1F5F9]">
                {stages.map((s) => (
                  <li key={s.key} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                    <span className={`w-2.5 h-2.5 shrink-0 ${s.dot}`} />
                    <span className="text-slate-700 flex-1">{s.label}</span>
                    <span className="font-mono text-slate-500 text-[11.5px]">{inr(s.amount)}</span>
                    <span className={`font-mono font-bold w-6 text-right ${s.n ? "text-slate-900" : "text-slate-300"}`}>{s.n}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
