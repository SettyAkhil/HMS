import { useEffect, useMemo, useState } from "react"
import {
  BadgeIndianRupee,
  Download,
  FileMinus,
  Hourglass,
  IndianRupee,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  Wallet,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { BillingDatabase, type ClaimRecord } from "../../services/billingDb"
import { claimStage, isInsured } from "../insurance/ClaimPanel"
import {
  AXIS,
  BLUE,
  Card,
  ChartTip,
  Delta,
  HeroBand,
  LinkBtn,
  MODE_COLORS,
  MODE_ICON,
  ORANGE,
  OTHER,
  type Payment,
  Ring,
  Sparkline,
  ageDays,
  cardShadow,
  compact,
  dailyTotals,
  dayKey,
  dayWindow,
  inr,
} from "./dashParts"

// Revenue & Dues: every revenue figure of the billing department in one
// place -- what came in (today, by day, by method, by department), what is
// still owed and how old it is, and what insurance owes or wrote off.

export default function RevenueDashboard({
  onNavigate,
}: {
  onNavigate: (module: string) => void
}) {
  const [claims, setClaims] = useState<ClaimRecord[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [range, setRange] = useState<7 | 14 | 30>(30)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const load = () => {
      setClaims(BillingDatabase.getClaims())
      setPayments(BillingDatabase.getAllPayments() as Payment[])
    }
    load()
    const un = BillingDatabase.onUpdate(load)
    const clock = window.setInterval(() => setNow(new Date()), 30_000)
    return () => {
      un()
      window.clearInterval(clock)
    }
  }, [])

  const daily = useMemo(() => dailyTotals(payments), [payments])
  const trend = useMemo(() => dayWindow(daily, range, now), [daily, range, now])
  const trendTotal = trend.reduce((a, t) => a + t.amount, 0)
  const spark7 = useMemo(() => dayWindow(daily, 7, now).map((t) => t.amount), [daily, now])

  const totals = useMemo(() => {
    const billed = claims.reduce((a, c) => a + (c.totalAmount || 0), 0)
    const collected = claims.reduce((a, c) => a + (c.amountPaid || 0), 0)
    const outstanding = claims.reduce((a, c) => a + (c.balanceDue || 0), 0)
    const unpaid = claims.filter((c) => (c.balanceDue || 0) > 0).length
    const insured = claims.filter((c) => isInsured(c) && claimStage(c) !== "Settled")
    const receivable = insured.reduce((a, c) => a + (c.insurancePortion || 0), 0)
    const insurerSettled = claims.reduce((a, c) => a + (c.tpa?.settledAmount || 0), 0)
    const writeOffs = claims.reduce(
      (a, c) => a + (c.tpa?.shortfallTo === "patient" ? 0 : c.tpa?.deduction || 0),
      0,
    )
    return {
      billed,
      collected,
      outstanding,
      unpaid,
      receivable,
      receivableCount: insured.length,
      insurerSettled,
      writeOffs,
      rate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
      avgBill: claims.length ? Math.round(billed / claims.length) : 0,
    }
  }, [claims])

  const today = daily.get(dayKey(now)) ?? { amount: 0, count: 0 }
  const yesterday = daily.get(dayKey(new Date(now.getTime() - 86_400_000))) ?? { amount: 0, count: 0 }

  const mix = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of payments) m.set(p.paymentMethod, (m.get(p.paymentMethod) || 0) + (p.amount || 0))
    const sorted = Array.from(m, ([mode, amount]) => ({ mode, amount })).sort((a, b) => b.amount - a.amount)
    const top = sorted.slice(0, 5).map((x, i) => ({ ...x, color: MODE_COLORS[i] }))
    const rest = sorted.slice(5).reduce((a, x) => a + x.amount, 0)
    if (rest > 0) top.push({ mode: "Other", amount: rest, color: OTHER })
    const total = top.reduce((a, x) => a + x.amount, 0)
    return { rows: top.map((x) => ({ ...x, pct: total ? Math.round((x.amount / total) * 100) : 0 })), total }
  }, [payments])

  const byDept = useMemo(() => {
    const m = new Map<string, { bills: number ;billed: number ;collected: number ;outstanding: number }>()
    for (const c of claims) {
      const r = m.get(c.department) ?? { bills: 0, billed: 0, collected: 0, outstanding: 0 }
      r.bills++
      r.billed += c.totalAmount || 0
      r.collected += c.amountPaid || 0
      r.outstanding += c.balanceDue || 0
      m.set(c.department, r)
    }
    return Array.from(m, ([dept, r]) => ({
      dept,
      ...r,
      rate: r.billed > 0 ? Math.round((r.collected / r.billed) * 100) : 0,
    })).sort((a, b) => b.collected + b.outstanding - (a.collected + a.outstanding))
  }, [claims])

  const aging = useMemo(() => {
    const buckets = [
      { label: "0–15 days", max: 15, amount: 0, bills: 0 },
      { label: "16–30 days", max: 30, amount: 0, bills: 0 },
      { label: "31–60 days", max: 60, amount: 0, bills: 0 },
      { label: "60+ days", max: Infinity, amount: 0, bills: 0 },
    ]
    for (const c of claims) {
      const due = c.balanceDue || 0
      if (due <= 0) continue
      const b = buckets.find((x) => ageDays(c.dateOfService) <= x.max)!
      b.amount += due
      b.bills++
    }
    return buckets
  }, [claims])

  const topServices = useMemo(() => {
    const m = new Map<string, { category: string ;qty: number ;revenue: number }>()
    for (const c of claims)
      for (const it of c.items) {
        const r = m.get(it.description) ?? { category: it.category, qty: 0, revenue: 0 }
        r.qty += it.quantity || 1
        r.revenue += it.total || 0
        m.set(it.description, r)
      }
    return Array.from(m, ([name, r]) => ({ name, ...r }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
  }, [claims])

  const exportCsv = () => {
    const lines = [
      ["Department", "Bills", "Billed", "Collected", "Outstanding", "Collection %"].join(","),
      ...byDept.map((d) => [d.dept, d.bills, d.billed, d.collected, d.outstanding, d.rate].join(",")),
      "",
      ["Date", "Collected"].join(","),
      ...trend.map((t) => [t.d, t.amount].join(",")),
    ]
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `Revenue_and_Dues_${dayKey(now)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const th = "px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 text-left whitespace-nowrap"
  const td = "px-4 py-2.5 border-t border-[#F1F5F9]"

  return (
    <div className="flex-1 overflow-y-auto bg-[#F1F5F9]">
      <div className="p-5 space-y-5 max-w-[1680px] mx-auto">
        {/* ── Revenue hero ─────────────────────────────────────────────── */}
        <HeroBand>
          <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_auto] gap-6 items-center">
            <div className="min-w-0">
              <div className="text-[12px] text-blue-200">
                Billing · {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <h1 className="text-[22px] font-bold tracking-tight mt-1.5">Revenue &amp; Dues</h1>
              <p className="text-[12.5px] text-blue-100/80 mt-1">
                Collections, receivables and insurance across the billing department.
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="px-3.5 h-9 bg-white text-[#0B1B3F] text-[12.5px] font-bold hover:bg-blue-50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download size={14} /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("billing")}
                  className="px-3.5 h-9 bg-white/10 border border-white/20 text-white text-[12.5px] font-bold hover:bg-white/20 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <LayoutDashboard size={14} /> Billing Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("payments")}
                  className="px-3.5 h-9 bg-white/10 border border-white/20 text-white text-[12.5px] font-bold hover:bg-white/20 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Receipt size={14} /> Payment History
                </button>
              </div>
            </div>

            <div className="min-w-0 lg:border-l lg:border-white/10 lg:pl-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">Collected today</div>
              <div className="font-mono text-[34px] font-bold leading-none mt-1.5">{inr(today.amount)}</div>
              <div className="flex items-center gap-3 mt-2 text-[12px]">
                <span className="text-blue-100">
                  {today.count} receipt{today.count === 1 ? "" : "s"}
                </span>
                <Delta now={today.amount} before={yesterday.amount} onDark />
              </div>
              <div className="mt-3 flex items-end gap-3">
                <Sparkline values={spark7} color="#60A5FA" />
                <span className="text-[11px] text-blue-200">last 7 days · {inr(spark7.reduce((a, b) => a + b, 0))}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <Ring pct={totals.rate} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-[22px] font-bold leading-none">{totals.rate}%</span>
                  <span className="text-[10px] text-blue-200 mt-0.5">collected</span>
                </div>
              </div>
              <div className="text-[12px] space-y-1.5">
                <div>
                  <div className="text-blue-200 text-[10.5px] uppercase font-bold tracking-wider">Billed</div>
                  <div className="font-mono font-bold">{inr(totals.billed)}</div>
                </div>
                <div>
                  <div className="text-blue-200 text-[10.5px] uppercase font-bold tracking-wider">Received</div>
                  <div className="font-mono font-bold text-emerald-300">{inr(totals.collected)}</div>
                </div>
                <div>
                  <div className="text-blue-200 text-[10.5px] uppercase font-bold tracking-wider">Outstanding</div>
                  <div className="font-mono font-bold text-amber-300">{inr(totals.outstanding)}</div>
                </div>
              </div>
            </div>
          </div>
        </HeroBand>

        {/* ── Revenue KPIs ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {[
            { label: "Total collected", value: inr(totals.collected), foot: `of ${inr(totals.billed)} billed`, Icon: IndianRupee, tile: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { label: "Outstanding", value: inr(totals.outstanding), foot: `${totals.unpaid} unpaid bills`, Icon: Hourglass, tile: "bg-amber-50 text-amber-700 border-amber-200", to: "billing" },
            { label: "Insurer receivable", value: inr(totals.receivable), foot: `${totals.receivableCount} open claims · ${inr(totals.insurerSettled)} settled`, Icon: ShieldCheck, tile: "bg-violet-50 text-violet-700 border-violet-200", to: "insurance" },
            { label: "Insurance write-offs", value: inr(totals.writeOffs), foot: "deductions absorbed by hospital", Icon: FileMinus, tile: "bg-rose-50 text-rose-700 border-rose-200", to: "insurance" },
            { label: "Average bill", value: inr(totals.avgBill), foot: `${claims.length} bills · ${payments.length} payments`, Icon: BadgeIndianRupee, tile: "bg-sky-50 text-sky-700 border-sky-200" },
          ].map((k) => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{k.label}</div>
                    <div className="font-mono text-[22px] font-bold text-slate-900 leading-tight mt-1 truncate">{k.value}</div>
                  </div>
                  <span className={`w-10 h-10 border flex items-center justify-center shrink-0 ${k.tile}`}>
                    <k.Icon size={19} />
                  </span>
                </div>
                <div className="mt-2 text-[11.5px] text-slate-500 truncate">{k.foot}</div>
              </>
            )
            return k.to ? (
              <button
                key={k.label}
                type="button"
                onClick={() => onNavigate(k.to!)}
                className={`text-left bg-white border border-[#E2E8F0] p-4 ${cardShadow} hover:border-blue-300 hover:-translate-y-0.5 transition-all cursor-pointer`}
              >
                {body}
              </button>
            ) : (
              <div key={k.label} className={`bg-white border border-[#E2E8F0] p-4 ${cardShadow}`}>
                {body}
              </div>
            )
          })}
        </div>

        {/* ── Trend + mix ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card
            className="xl:col-span-2"
            title="Collections trend"
            subtitle={`${inr(trendTotal)} received in the last ${range} days`}
            action={
              <div className="flex border border-[#CBD5E1] text-[11.5px] font-bold">
                {([7, 14, 30] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={`px-3 h-7 cursor-pointer transition-colors ${
                      range === r ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {r}D
                  </button>
                ))}
              </div>
            }
          >
            <div className="px-3 pb-4">
              {/* Daily amounts are discrete, so bars: quiet days read as gaps, not as a slope. */}
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#EEF2F6" />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={range > 14 ? 3 : range > 7 ? 1 : 0} />
                  <YAxis tick={AXIS} tickFormatter={compact} axisLine={false} tickLine={false} width={52} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "#EFF6FF" }} />
                  <Bar dataKey="amount" name="Collected" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Payment mix" subtitle="Share of all collections by method">
            <div className="px-5 pb-5">
              {mix.total === 0 ? (
                <div className="py-16 text-center text-[12px] text-slate-400">No payments yet.</div>
              ) : (
                <>
                  <div className="relative h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mix.rows}
                          dataKey="amount"
                          nameKey="mode"
                          innerRadius={58}
                          outerRadius={82}
                          paddingAngle={1.5}
                          stroke="#fff"
                          strokeWidth={2}
                          isAnimationActive={false}
                        >
                          {mix.rows.map((r) => (
                            <Cell key={r.mode} fill={r.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => inr(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 0, border: "1px solid #E2E8F0" }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Total</span>
                      <span className="font-mono text-[18px] font-bold text-slate-900">{compact(mix.total)}</span>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {mix.rows.map((r) => {
                      const MIcon = MODE_ICON[r.mode] ?? Wallet
                      return (
                        <li key={r.mode} className="flex items-center gap-2 text-[12.5px]">
                          <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: r.color }} />
                          <MIcon size={14} className="text-slate-400 shrink-0" />
                          <span className="text-slate-700 truncate flex-1">{r.mode}</span>
                          <span className="font-mono font-bold text-slate-900">{compact(r.amount)}</span>
                          <span className="font-mono text-slate-500 w-10 text-right">{r.pct}%</span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </div>

        {/* ── By department ────────────────────────────────────────────── */}
        <Card
          title="Revenue by department"
          subtitle="Collected and still outstanding, per department"
          action={
            <div className="flex items-center gap-3 text-[11.5px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5" style={{ backgroundColor: BLUE }} />
                Collected
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5" style={{ backgroundColor: ORANGE }} />
                Outstanding
              </span>
            </div>
          }
        >
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2">
            <div className="px-3 pb-4">
              <ResponsiveContainer width="100%" height={Math.max(220, byDept.length * 42)}>
                <BarChart data={byDept} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={10}>
                  <CartesianGrid horizontal={false} stroke="#EEF2F6" />
                  <XAxis type="number" tick={AXIS} tickFormatter={compact} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="dept" tick={{ ...AXIS, fill: "#334155" }} width={92} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "#F1F5F9" }} />
                  <Bar dataKey="collected" name="Collected" stackId="r" fill={BLUE} stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="outstanding" name="Outstanding" stackId="r" fill={ORANGE} stroke="#fff" strokeWidth={2} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto pb-3">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr>
                    <th className={th}>Department</th>
                    <th className={`${th} text-right`}>Bills</th>
                    <th className={`${th} text-right`}>Billed</th>
                    <th className={`${th} text-right`}>Collected</th>
                    <th className={`${th} text-right`}>Outstanding</th>
                    <th className={`${th} text-right`}>Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {byDept.map((d) => (
                    <tr key={d.dept} className="hover:bg-slate-50/70">
                      <td className={`${td} font-semibold text-slate-900`}>{d.dept}</td>
                      <td className={`${td} text-right font-mono text-slate-600`}>{d.bills}</td>
                      <td className={`${td} text-right font-mono text-slate-600`}>{inr(d.billed)}</td>
                      <td className={`${td} text-right font-mono text-slate-900`}>{inr(d.collected)}</td>
                      <td className={`${td} text-right font-mono text-slate-900`}>{inr(d.outstanding)}</td>
                      <td className={`${td} text-right`}>
                        <div className="inline-flex items-center gap-2">
                          <div className="w-14 h-1.5 bg-amber-100 overflow-hidden" aria-hidden>
                            <div className="h-full bg-emerald-500" style={{ width: `${d.rate}%` }} />
                          </div>
                          <span className="font-mono text-slate-700 w-9">{d.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* ── Dues by age + top services ───────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Card
            title="Outstanding by age"
            subtitle="Unpaid balances by days since service"
            action={<LinkBtn label="Collect dues" onClick={() => onNavigate("billing")} />}
          >
            <div className="px-3 pb-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={aging} margin={{ top: 20, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#EEF2F6" />
                  <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} tickFormatter={compact} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "#F1F5F9" }} />
                  <Bar
                    dataKey="amount"
                    name="Outstanding"
                    fill={ORANGE}
                    radius={[4, 4, 0, 0]}
                    label={{ position: "top", fontSize: 11, fill: "#334155", formatter: (v: unknown) => (Number(v) > 0 ? compact(Number(v)) : "") }}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-4 gap-2 px-2 mt-1">
                {aging.map((b) => (
                  <div key={b.label} className="text-center text-[11px] text-slate-500">
                    {b.bills} bill{b.bills === 1 ? "" : "s"}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Top services by revenue" subtitle="Across all billed items">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  <th className={th}>Service</th>
                  <th className={`${th} text-right`}>Qty</th>
                  <th className={`${th} text-right`}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topServices.map((s, i) => (
                  <tr key={s.name} className="hover:bg-slate-50/70">
                    <td className={`${td} max-w-0 w-full`}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900" title={s.name}>{s.name}</div>
                          <div className="text-[11px] text-slate-500">{s.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${td} text-right font-mono text-slate-600`}>{s.qty}</td>
                    <td className={`${td} text-right font-mono font-bold text-slate-900`}>{inr(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  )
}
