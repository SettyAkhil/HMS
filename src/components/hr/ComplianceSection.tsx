import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { hr } from "../../services/hr/client"
import { Btn, Empty, Kpi, Loading, PageHeader, Panel, StatusBadge, Table, Tabs, filterCls, fmtDate, fmtDateTime, humanize, useHr, useRun } from "./ui"

export default function ComplianceSection({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<"alerts" | "records">("alerts")
  const [version, setVersion] = useState(0)
  const [busy, run] = useRun()
  const scan = () => run("scan", () => hr.post<{ compliant: number; expiring: number; non_compliant: number; new_alerts: number }>("/api/v1/compliance/scan"), (r) => `Scan done: ${r.non_compliant} non-compliant, ${r.expiring} expiring, ${r.new_alerts} new alerts`).then(() => setVersion((v) => v + 1))
  return (
    <div>
      <PageHeader title="Compliance" subtitle="Registrations, licences, mandatory training, documents and contracts — expiry and verification" actions={canManage && <Btn variant="primary" busy={busy === "scan"} onClick={scan}><ShieldCheck className="w-3.5 h-3.5" /> Run compliance scan</Btn>} />
      <p className="text-[11px] text-gray-500 mb-3">A scan also runs automatically every night and raises one alert per item and expiry date.</p>
      <Tabs value={tab} onChange={setTab} items={[{ id: "alerts", label: "Expiry alerts" }, { id: "records", label: "Compliance status" }]} />
      {tab === "alerts" && <Alerts key={version} canManage={canManage} />}
      {tab === "records" && <Records key={version} />}
    </div>
  )
}

function Alerts({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState("open")
  const list = useHr(() => hr.get<any[]>("/api/v1/compliance/alerts", { status }), [status])
  const [busy, run] = useRun()
  return (
    <Panel title="Expiry alerts" actions={<select className={filterCls} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="open">Open</option><option value="acknowledged">Acknowledged</option></select>}>
      {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="No alerts" /> : (
        <Table head={["Due", "Employee", "Item", "Type", "Days left", ""]}>
          {list.data.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2 whitespace-nowrap">{fmtDate(a.due_date)}</td>
              <td className="px-4 py-2">{a.employee_name}</td>
              <td className="px-4 py-2">{a.title}</td>
              <td className="px-4 py-2">{humanize(a.source_type)}</td>
              <td className={`px-4 py-2 tabular-nums ${a.days_left < 15 ? "text-rose-700 font-medium" : ""}`}>{a.days_left}</td>
              <td className="px-4 py-2 text-right">{canManage && a.status === "open" && <Btn variant="ghost" busy={busy === a.id} onClick={() => run(a.id, () => hr.post(`/api/v1/compliance/alerts/${a.id}/acknowledge`), "Acknowledged").then(() => list.reload())}>Acknowledge</Btn>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  )
}

function Records() {
  const [status, setStatus] = useState("non_compliant")
  const list = useHr(() => hr.get<any[]>("/api/v1/compliance/records", { status: status || undefined }), [status])
  const all = useHr(() => hr.get<any[]>("/api/v1/compliance/records"), [])
  const count = (s: string) => all.data?.filter((r) => r.status === s).length ?? 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Compliant" value={count("compliant")} tone="good" onClick={() => setStatus("compliant")} />
        <Kpi label="Expiring soon" value={count("expiring")} tone="warn" onClick={() => setStatus("expiring")} />
        <Kpi label="Non-compliant" value={count("non_compliant")} tone="bad" onClick={() => setStatus("non_compliant")} />
      </div>
      <Panel title={`Compliance status${all.data?.[0] ? ` · last scan ${fmtDateTime(all.data[0].checked_at)}` : ""}`}>
        {list.loading && !list.data ? <Loading /> : !list.data?.length ? <Empty title="Nothing here" hint="Run a scan to evaluate everyone's requirements." /> : (
          <Table head={["Employee", "Requirement", "Status", "Detail", "Due"]}>
            {list.data.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2">{r.employee_name}</td>
                <td className="px-4 py-2">{humanize(r.requirement.replace(":", ": "))}</td>
                <td className="px-4 py-2"><StatusBadge value={r.status === "compliant" ? "success" : r.status === "expiring" ? "pending" : "failed"} label={humanize(r.status)} /></td>
                <td className="px-4 py-2 text-gray-600">{r.detail ?? "—"}</td>
                <td className="px-4 py-2">{fmtDate(r.due_date)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  )
}
