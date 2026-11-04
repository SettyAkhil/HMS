import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { Activity, Fingerprint, Plug, Plus, RefreshCw, Search, Trash2, Wifi, WifiOff, X } from "lucide-react"
import { hr } from "../../services/hr/client"
import {
  EMPLOYEE_CATEGORIES,
  categoryLabel,
  type Device,
  type EmployeeListItem,
  type Integration,
  type LiveBoard,
  type Mapping,
  type Page,
  type Punch,
  type SyncLog,
  type SyncResult,
  type Unmapped,
} from "../../services/hr/types"
import { Btn, Drawer, Empty, ErrorState, Field, Kpi, Loading, PageHeader, Pager, Panel, StatusBadge, Table, Tabs, ago, errorText, fmtDate, fmtDateTime, fmtTime, filterCls, inputCls, useHr } from "./ui"
import useOrgRefs from "./useOrgRefs"
import { Corrections, DailyRegister, Exceptions, MonthlyCalendar, Overtime } from "./AttendanceRecords"

type Tab = "live" | "daily" | "monthly" | "exceptions" | "corrections" | "overtime" | "punches" | "devices" | "mappings" | "sync"

export default function AttendanceSection({ canManage, initialTab = "live" }: { canManage: boolean; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])
  return (
    <div>
      <PageHeader title="Attendance" subtitle="Live presence, calculated attendance, exceptions, corrections, overtime and eSSL devices" />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { id: "live", label: "Live attendance" },
          { id: "daily", label: "Daily register" },
          { id: "monthly", label: "Monthly" },
          { id: "exceptions", label: "Exceptions" },
          { id: "corrections", label: "Corrections" },
          { id: "overtime", label: "Overtime" },
          { id: "punches", label: "Punch log" },
          ...(canManage
            ? ([
                { id: "devices", label: "Devices & integrations" },
                { id: "mappings", label: "Biometric mapping" },
                { id: "sync", label: "Sync history" },
              ] as { id: Tab; label: string }[])
            : []),
        ]}
      />
      {tab === "live" && <Live />}
      {tab === "daily" && <DailyRegister canManage={canManage} />}
      {tab === "monthly" && <MonthlyCalendar />}
      {tab === "exceptions" && <Exceptions canManage={canManage} />}
      {tab === "corrections" && <Corrections />}
      {tab === "overtime" && <Overtime canManage={canManage} />}
      {tab === "punches" && <Punches />}
      {tab === "devices" && canManage && <Devices />}
      {tab === "mappings" && canManage && <Mappings />}
      {tab === "sync" && canManage && <SyncHistory />}
    </div>
  )
}

// ── live ────────────────────────────────────────────────────────────────────

function useLiveStream(onEvent: () => void) {
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (typeof EventSource === "undefined") return
    const es = new EventSource(hr.href("/api/v1/attendance/live/stream"), { withCredentials: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    // Several events can land together after a sync; refetch once.
    const kick = () => {
      clearTimeout(timer)
      timer = setTimeout(onEvent, 400)
    }
    es.addEventListener("ready", () => setConnected(true))
    for (const kind of ["punches", "sync", "device"]) es.addEventListener(kind, kick)
    es.onerror = () => setConnected(false)
    return () => {
      clearTimeout(timer)
      es.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return connected
}

function Live() {
  const refs = useOrgRefs()
  const today = new Date().toLocaleDateString("en-CA")
  const [day, setDay] = useState(today)
  const [filters, setFilters] = useState({ department_id: "", branch_id: "", employee_category: "", status: "" })
  const [query, setQuery] = useState("")
  const [tick, setTick] = useState(0)
  const board = useHr(() => hr.get<LiveBoard>("/api/v1/attendance/live", { day, ...filters }), [day, filters, tick])
  const connected = useLiveStream(() => setTick((t) => t + 1))
  const rows = (board.data?.rows ?? []).filter((r) => !query || `${r.full_name} ${r.employee_code}`.toLowerCase().includes(query.toLowerCase()))
  const c = board.data?.counts

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Checked in" value={c?.in ?? "—"} tone="good" onClick={() => setFilters({ ...filters, status: "in" })} />
        <Kpi label="Checked out" value={c?.out ?? "—"} onClick={() => setFilters({ ...filters, status: "out" })} />
        <Kpi label="Not arrived" value={c?.not_arrived ?? "—"} tone="warn" onClick={() => setFilters({ ...filters, status: "not_arrived" })} />
        <Kpi label="Active staff" value={c?.total ?? "—"} onClick={() => setFilters({ ...filters, status: "" })} />
        <Kpi label="Unmapped punches" value={c?.unmapped_punches ?? "—"} tone={c?.unmapped_punches ? "bad" : "neutral"} hint="Device PINs with no employee" />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            Presence {day === today ? "today" : `on ${fmtDate(day)}`}
            <span className={`inline-flex items-center gap-1 text-[11px] font-normal ${connected ? "text-[#16A34A]" : "text-[#64748B]"}`}>
              {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connected ? "Live" : "Not live — refresh manually"}
            </span>
          </span>
        }
        actions={
          <span className="text-[11px] text-[#64748B]">
            Last sync {ago(board.data?.last_sync_at)}
            <Btn variant="ghost" onClick={board.reload} aria-label="Refresh" className="ml-1">
              <RefreshCw className="w-3.5 h-3.5" />
            </Btn>
          </span>
        }
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#64748B]" />
            <input
              className={`${inputCls} pl-8 ${query ? "pr-8" : ""}`}
              placeholder="Find employee (instant)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-2.5 text-[#64748B] hover:text-gray-900 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input type="date" className={filterCls} value={day} max={today} onChange={(e) => setDay(e.target.value || today)} aria-label="Date" />
          <select className={filterCls} value={filters.department_id} onChange={(e) => setFilters({ ...filters, department_id: e.target.value })} aria-label="Department">
            <option value="">All departments</option>
            {refs.data?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.branch_id} onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })} aria-label="Branch">
            <option value="">All branches</option>
            {refs.data?.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.employee_category} onChange={(e) => setFilters({ ...filters, employee_category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {EMPLOYEE_CATEGORIES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select className={filterCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status">
            <option value="">Any status</option>
            <option value="in">Checked in</option>
            <option value="out">Checked out</option>
            <option value="not_arrived">Not arrived</option>
          </select>
        </div>
        <p className="text-[11px] text-[#64748B] mb-2">
          Presence is read from biometric checkpoint punches (an odd number of punches means the last one checked in). It is not location tracking. Calculated attendance against shifts — lateness, overtime, absences — is under Daily register.
        </p>
        {board.loading && !board.data ? (
          <Loading />
        ) : board.error ? (
          <ErrorState error={board.error} onRetry={board.reload} />
        ) : rows.length === 0 ? (
          <Empty title={board.data?.counts.total ? "No one matches these filters" : "No active employees yet"} />
        ) : (
          <Table head={["Employee", "Department", "Designation", "Branch", "First in", "Last out", "Punches", "Status", "Synced"]}>
            {rows.map((r) => (
              <tr key={r.employee_id}>
                <td className="px-4 py-2">
                  <div className="text-gray-900 font-semibold">{r.full_name}</div>
                  <div className="text-[11px] text-[#64748B] font-mono">{r.employee_code}</div>
                </td>
                <td className="px-4 py-2 text-gray-700">{r.department ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{r.designation ?? categoryLabel(r.category)}</td>
                <td className="px-4 py-2 text-gray-700">{r.branch ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">{fmtTime(r.first_check_in)}</td>
                <td className="px-4 py-2 tabular-nums">{fmtTime(r.last_check_out)}</td>
                <td className="px-4 py-2 tabular-nums font-mono">{r.punch_count}</td>
                <td className="px-4 py-2">
                  <StatusBadge value={r.status} />
                </td>
                <td className="px-4 py-2 text-[11px] text-[#64748B] whitespace-nowrap">{r.last_synced_at ? ago(r.last_synced_at) : "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  )
}

// ── punches ─────────────────────────────────────────────────────────────────

function Punches() {
  const [f, setF] = useState({ date_from: new Date().toLocaleDateString("en-CA"), date_to: "", device_user_id: "", mapped: "" })
  const [page, setPage] = useState(1)
  const devices = useHr(() => hr.get<Device[]>("/api/v1/attendance/devices"), [])
  const [deviceId, setDeviceId] = useState("")
  const list = useHr(
    () => hr.get<Page<Punch>>("/api/v1/attendance/punches", { ...f, device_id: deviceId, mapped: f.mapped === "" ? undefined : f.mapped, page, page_size: 50 }),
    [f, deviceId, page],
  )
  const set = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch })
    setPage(1)
  }
  return (
    <Panel title="Raw punch log" actions={<span className="text-[11px] text-[#64748B]">Exactly as received from the devices; never edited</span>}>
      <div className="flex flex-wrap gap-2 mb-3">
        <Field label="From">
          <input type="date" className={inputCls} value={f.date_from} onChange={(e) => set({ date_from: e.target.value })} />
        </Field>
        <Field label="To">
          <input type="date" className={inputCls} value={f.date_to} onChange={(e) => set({ date_to: e.target.value })} />
        </Field>
        <Field label="Device">
          <select className={inputCls} value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setPage(1) }}>
            <option value="">All devices</option>
            {devices.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Device user ID">
          <input className={inputCls} value={f.device_user_id} onChange={(e) => set({ device_user_id: e.target.value.trim() })} />
        </Field>
        <Field label="Mapping">
          <select className={inputCls} value={f.mapped} onChange={(e) => set({ mapped: e.target.value })}>
            <option value="">All</option>
            <option value="true">Mapped</option>
            <option value="false">Unmapped</option>
          </select>
        </Field>
      </div>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !list.data?.items.length ? (
        <Empty title="No punches in this range" />
      ) : (
        <>
          <Table head={["Punch time", "Employee", "Device user", "Device", "Source", "Received", "Raw"]}>
            {list.data.items.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 whitespace-nowrap tabular-nums">{fmtDateTime(p.punch_time)}</td>
                <td className="px-4 py-2 font-medium">{p.employee_name ? `${p.employee_name} (${p.employee_code})` : <StatusBadge value="pending" label="Unmapped" />}</td>
                <td className="px-4 py-2 font-mono text-xs">{p.device_user_id}</td>
                <td className="px-4 py-2 text-gray-700">{p.device_name ?? p.device_serial ?? "—"}</td>
                <td className="px-4 py-2 text-gray-700">{p.source}</td>
                <td className="px-4 py-2 text-[11px] text-[#64748B] whitespace-nowrap">{fmtDateTime(p.received_at)}</td>
                <td className="px-4 py-2 font-mono text-[11px] text-[#64748B] max-w-[220px] truncate" title={p.raw_payload}>
                  {p.raw_payload}
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={50} total={list.data.total} onPage={setPage} />
        </>
      )}
    </Panel>
  )
}

// ── devices & integrations ──────────────────────────────────────────────────

const PROVIDERS = [
  ["etimetracklite", "eTimeTrackLite Web"],
  ["ebioserver", "eBioServer"],
  ["simulator", "Simulator (test data only)"],
] as const

function Devices() {
  const [version, setVersion] = useState(0)
  const integrations = useHr(() => hr.get<Integration[]>("/api/v1/attendance/integrations"), [version])
  const devices = useHr(() => hr.get<Device[]>("/api/v1/attendance/devices"), [version])
  const refs = useOrgRefs()
  const [editing, setEditing] = useState<Integration | "new" | null>(null)
  const [addingDeviceFor, setAddingDeviceFor] = useState<Integration | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const bump = () => setVersion((v) => v + 1)

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(null)
      bump()
    }
  }
  const test = (i: Integration) =>
    act(`test-${i.id}`, async () => {
      const r = await hr.post<{ ok: boolean; message: string; operations: string[] }>(`/api/v1/attendance/integrations/${i.id}/test`)
      r.ok ? toast.success(r.message) : toast.error(r.message)
    })
  const sync = (i: Integration) =>
    act(`sync-${i.id}`, async () => {
      const r = await hr.post<SyncResult>(`/api/v1/attendance/integrations/${i.id}/sync`)
      const msg = `${r.inserted} new, ${r.duplicates} duplicates, ${r.unmapped} unmapped${r.rejected ? `, ${r.rejected} unreadable` : ""}`
      r.status === "failed" ? toast.error(`Sync failed: ${r.error}`) : toast.success(`Sync ${r.status}: ${msg}`)
    })

  if ((integrations.loading && !integrations.data) || (devices.loading && !devices.data)) return <Loading />
  if (integrations.error) return <ErrorState error={integrations.error} onRetry={integrations.reload} />

  return (
    <div className="space-y-4">
      <Panel
        title="eSSL integrations"
        actions={
          <Btn variant="primary" onClick={() => setEditing("new")}>
            <Plus className="w-3.5 h-3.5" /> Add integration
          </Btn>
        }
      >
        {!integrations.data?.length ? (
          <Empty
            title="No eSSL server connected"
            hint="Add your eTimeTrackLite Web or eBioServer address and web-API user. Test connection reads the server's own WSDL and enables only the operations it declares."
          />
        ) : (
          <div className="space-y-3">
            {integrations.data.map((i) => {
              const own = devices.data?.filter((d) => d.integration_id === i.id) ?? []
              return (
                <div key={i.id} className="border border-[#DDE2EC] rounded p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Plug className="w-4 h-4 text-[#1B4FD8]" />
                        <span className="font-semibold text-gray-900">{i.name}</span>
                        {i.is_simulator && <StatusBadge value="simulator" label="Simulator" />}
                        {!i.enabled && <StatusBadge value="archived" label="Disabled" />}
                        {i.consecutive_failures > 0 && <StatusBadge value="failed" label={`${i.consecutive_failures} failed syncs`} />}
                      </div>
                      <div className="text-xs text-[#64748B] mt-0.5">
                        {PROVIDERS.find(([k]) => k === i.provider)?.[1]} · <span className="font-mono">{i.base_url}</span> · polls every {Math.round(i.poll_interval_seconds / 60)} min
                      </div>
                      <div className="text-xs text-[#64748B]">
                        {i.verified_at ? `Verified ${ago(i.verified_at)} · ${i.operations.length} operations declared` : <span className="text-amber-700 font-medium">Not verified — run Test connection</span>}
                        {" · "}Last success {ago(i.last_success_at)}
                      </div>
                      {i.last_error && <div className="text-xs text-rose-700 mt-1">{i.last_error}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Btn busy={busy === `test-${i.id}`} onClick={() => test(i)}>
                        Test connection
                      </Btn>
                      <Btn variant="primary" busy={busy === `sync-${i.id}`} onClick={() => sync(i)} disabled={!own.length}>
                        <RefreshCw className="w-3.5 h-3.5" /> Sync now
                      </Btn>
                      <Btn onClick={() => setAddingDeviceFor(i)}>
                        <Plus className="w-3.5 h-3.5" /> Device
                      </Btn>
                      <Btn variant="ghost" onClick={() => setEditing(i)}>
                        Edit
                      </Btn>
                    </div>
                  </div>
                  <div className="mt-3">
                    {own.length === 0 ? (
                      <p className="text-xs text-amber-700">No devices registered. eTimeTrackLite fetches punches per device serial number, so add each device.</p>
                    ) : (
                      <Table head={["Device", "Serial", "Location", "Status", "Last data", "Last punch", ""]}>
                        {own.map((d) => (
                          <tr key={d.id}>
                            <td className="px-4 py-2 font-medium">{d.name}</td>
                            <td className="px-4 py-2 font-mono text-xs">{d.serial_number}</td>
                            <td className="px-4 py-2 text-gray-700">{d.location ?? "—"}</td>
                            <td className="px-4 py-2">
                              <StatusBadge value={d.enabled ? d.status : "archived"} label={d.enabled ? undefined : "Disabled"} />
                            </td>
                            <td className="px-4 py-2 text-xs text-[#64748B]">{ago(d.last_seen_at)}</td>
                            <td className="px-4 py-2 text-xs text-[#64748B]">{fmtDateTime(d.last_punch_at)}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              <Btn variant="ghost" onClick={() => act(`dev-${d.id}`, () => hr.patch(`/api/v1/attendance/devices/${d.id}`, { enabled: !d.enabled }))}>
                                {d.enabled ? "Disable" : "Enable"}
                              </Btn>
                              <Btn
                                variant="ghost"
                                aria-label={`Retire ${d.name}`}
                                onClick={() => window.confirm(`Retire device ${d.name}? Its past punches are kept.`) && act(`ret-${d.id}`, () => hr.del(`/api/v1/attendance/devices/${d.id}`))}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              </Btn>
                            </td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[11px] text-[#64748B] mt-3">
          Device status reflects whether the eSSL server returned data for that serial on the last sync, not a direct ping of the terminal. No fingerprint or face templates are read or stored.
        </p>
      </Panel>

      {editing && <IntegrationDrawer integration={editing === "new" ? null : editing} branches={refs.data?.branches ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); bump() }} />}
      {addingDeviceFor && <DeviceDrawer integration={addingDeviceFor} refs={refs.data} onClose={() => setAddingDeviceFor(null)} onSaved={() => { setAddingDeviceFor(null); bump() }} />}
    </div>
  )
}

function IntegrationDrawer({ integration, branches, onClose, onSaved }: { integration: Integration | null; branches: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: integration?.name ?? "",
    provider: integration?.provider ?? "etimetracklite",
    base_url: integration?.base_url ?? "",
    username: integration?.username ?? "",
    password: "",
    branch_id: integration?.branch_id ?? "",
    poll_minutes: String(Math.round((integration?.poll_interval_seconds ?? 300) / 60)),
    device_timezone: integration?.device_timezone ?? "Asia/Kolkata",
    enabled: integration?.enabled ?? true,
  })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const body: Record<string, unknown> = {
      name: f.name,
      base_url: f.base_url.trim(),
      username: f.username || null,
      branch_id: f.branch_id || null,
      poll_interval_seconds: Math.max(1, Number(f.poll_minutes) || 5) * 60,
      device_timezone: f.device_timezone,
      enabled: f.enabled,
    }
    if (f.password) body.password = f.password
    try {
      if (integration) await hr.patch(`/api/v1/attendance/integrations/${integration.id}`, body)
      else await hr.post("/api/v1/attendance/integrations", { ...body, provider: f.provider })
      toast.success("Integration saved")
      onSaved()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!integration || !window.confirm(`Remove ${integration.name}? Polling stops; received punches are kept.`)) return
    try {
      await hr.del(`/api/v1/attendance/integrations/${integration.id}`)
      toast.success("Integration removed")
      onSaved()
    } catch (e) {
      toast.error(errorText(e))
    }
  }
  return (
    <Drawer
      open
      title={integration ? `Edit ${integration.name}` : "Add eSSL integration"}
      onClose={onClose}
      footer={
        <>
          {integration && (
            <Btn variant="danger" onClick={remove} className="mr-auto">
              Remove
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.name || !f.base_url} onClick={save}>
            Save
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Main campus eTimeTrackLite" />
        </Field>
        <Field label="Product" hint="Check Help → About in the eSSL software to confirm which one is installed">
          <select className={inputCls} value={f.provider} disabled={!!integration} onChange={(e) => setF({ ...f, provider: e.target.value as Integration["provider"] })}>
            {PROVIDERS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Server URL"
          required
          hint={f.provider === "simulator" ? "sim://?pins=1001,1002 — generates test punches for those PINs" : "e.g. http://192.168.1.20:81 or http://host/iclock — /WebAPIService.asmx is added if missing"}
        >
          <input className={inputCls} value={f.base_url} onChange={(e) => setF({ ...f, base_url: e.target.value })} />
        </Field>
        {f.provider !== "simulator" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Web API user">
              <input className={inputCls} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Password" hint={integration?.has_password ? "Stored encrypted. Leave blank to keep it." : "Stored encrypted; never shown again"}>
              <input type="password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Poll every (minutes)">
            <input className={inputCls} inputMode="numeric" value={f.poll_minutes} onChange={(e) => setF({ ...f, poll_minutes: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Device clock time zone">
            <input className={inputCls} value={f.device_timezone} onChange={(e) => setF({ ...f, device_timezone: e.target.value })} />
          </Field>
        </div>
        <Field label="Branch">
          <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 font-medium">
          <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Poll automatically
        </label>
      </div>
    </Drawer>
  )
}

function DeviceDrawer({ integration, refs, onClose, onSaved }: { integration: Integration; refs: ReturnType<typeof useOrgRefs>["data"]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ serial_number: "", name: "", location: "", branch_id: integration.branch_id ?? "", department_id: "" })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await hr.post("/api/v1/attendance/devices", {
        integration_id: integration.id,
        serial_number: f.serial_number.trim(),
        name: f.name,
        location: f.location || null,
        branch_id: f.branch_id || null,
        department_id: f.department_id || null,
      })
      toast.success("Device registered")
      onSaved()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title={`Register device on ${integration.name}`}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.serial_number || !f.name} onClick={save}>
            Register
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Serial number" required hint="As shown in eTimeTrackLite → Devices, or on the terminal's info screen">
          <input className={inputCls} value={f.serial_number} onChange={(e) => setF({ ...f, serial_number: e.target.value })} />
        </Field>
        <Field label="Name" required>
          <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ICU entrance" />
        </Field>
        <Field label="Location">
          <input className={inputCls} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Branch">
            <select className={inputCls} value={f.branch_id} onChange={(e) => setF({ ...f, branch_id: e.target.value })}>
              <option value="">—</option>
              {refs?.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}>
              <option value="">—</option>
              {refs?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </Drawer>
  )
}

// ── mappings ────────────────────────────────────────────────────────────────

function Mappings() {
  const [version, setVersion] = useState(0)
  const [showEnded, setShowEnded] = useState(false)
  const integrations = useHr(() => hr.get<Integration[]>("/api/v1/attendance/integrations"), [])
  const mappings = useHr(() => hr.get<Mapping[]>("/api/v1/attendance/mappings", { include_ended: showEnded }), [version, showEnded])
  const unmapped = useHr(() => hr.get<Unmapped[]>("/api/v1/attendance/unmapped"), [version])
  const [mapping, setMapping] = useState<{ integration_id: string; device_user_id: string } | null>(null)
  const integName = (id: string) => integrations.data?.find((i) => i.id === id)?.name ?? "—"
  const bump = () => setVersion((v) => v + 1)

  const end = async (m: Mapping) => {
    if (!window.confirm(`End mapping of PIN ${m.device_user_id} to ${m.employee_name}? Later punches from this PIN will be unmapped.`)) return
    try {
      await hr.post(`/api/v1/attendance/mappings/${m.id}/end`, {})
      toast.success("Mapping ended")
      bump()
    } catch (e) {
      toast.error(errorText(e))
    }
  }

  return (
    <div className="space-y-4">
      <Panel title={<span className="flex items-center gap-2"><Activity className="w-4 h-4 text-rose-600" /> Unmapped device users</span>}>
        {unmapped.loading && !unmapped.data ? (
          <Loading />
        ) : unmapped.error ? (
          <ErrorState error={unmapped.error} onRetry={unmapped.reload} />
        ) : !unmapped.data?.length ? (
          <Empty title="Every punch is mapped to an employee" />
        ) : (
          <Table head={["Device user", "Integration", "Punches", "First", "Last", "Devices", ""]}>
            {unmapped.data.map((u) => (
              <tr key={`${u.integration_id}-${u.device_user_id}`}>
                <td className="px-4 py-2 font-mono text-sm">{u.device_user_id}</td>
                <td className="px-4 py-2 text-gray-700">{integName(u.integration_id)}</td>
                <td className="px-4 py-2 tabular-nums">{u.punch_count}</td>
                <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDateTime(u.first_punch)}</td>
                <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDateTime(u.last_punch)}</td>
                <td className="px-4 py-2 font-mono text-xs text-[#64748B]">{u.devices.join(", ")}</td>
                <td className="px-4 py-2 text-right">
                  <Btn variant="primary" onClick={() => setMapping({ integration_id: u.integration_id, device_user_id: u.device_user_id })}>
                    <Fingerprint className="w-3.5 h-3.5" /> Map to employee
                  </Btn>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel
        title="Mapped device users"
        actions={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
              <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> Show ended
            </label>
            <Btn variant="primary" onClick={() => setMapping({ integration_id: integrations.data?.[0]?.id ?? "", device_user_id: "" })} disabled={!integrations.data?.length}>
              <Plus className="w-3.5 h-3.5" /> New mapping
            </Btn>
          </div>
        }
      >
        {mappings.loading && !mappings.data ? (
          <Loading />
        ) : mappings.error ? (
          <ErrorState error={mappings.error} onRetry={mappings.reload} />
        ) : !mappings.data?.length ? (
          <Empty title="No biometric IDs mapped yet" />
        ) : (
          <Table head={["Device user", "Employee", "Integration", "From", "To", "Mapped by", ""]}>
            {mappings.data.map((m) => (
              <tr key={m.id} className={m.effective_to ? "text-gray-400" : ""}>
                <td className="px-4 py-2 font-mono">{m.device_user_id}</td>
                <td className="px-4 py-2">
                  <span className="font-medium text-gray-900">{m.employee_name}</span> <span className="font-mono text-[11px] text-[#64748B]">{m.employee_code}</span>
                </td>
                <td className="px-4 py-2 text-gray-700">{integName(m.integration_id)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(m.effective_from)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{m.effective_to ? fmtDate(m.effective_to) : "Current"}</td>
                <td className="px-4 py-2 text-xs text-[#64748B]">{m.created_by}</td>
                <td className="px-4 py-2 text-right">{!m.effective_to && <Btn variant="ghost" onClick={() => end(m)}>End</Btn>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {mapping && (
        <MapDrawer
          initial={mapping}
          integrations={integrations.data ?? []}
          onClose={() => setMapping(null)}
          onSaved={() => {
            setMapping(null)
            bump()
          }}
        />
      )}
    </div>
  )
}

function MapDrawer({ initial, integrations, onClose, onSaved }: { initial: { integration_id: string; device_user_id: string }; integrations: Integration[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ ...initial, employee_id: "", effective_from: "" })
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const people = useHr(
    () => (q.trim().length >= 1 ? hr.get<Page<EmployeeListItem>>("/api/v1/hr/employees", { search: q, status: "active", page_size: 10 }) : Promise.resolve(null)),
    [q],
  )
  const save = async () => {
    setBusy(true)
    try {
      const m = await hr.post<Mapping>("/api/v1/attendance/mappings", { ...f, effective_from: f.effective_from || null })
      toast.success(m.claimed_punches ? `Mapped; ${m.claimed_punches} earlier punches attributed` : "Mapped")
      onSaved()
    } catch (e) {
      toast.error(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Drawer
      open
      title="Map device user to employee"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" busy={busy} disabled={!f.integration_id || !f.device_user_id || !f.employee_id} onClick={save}>
            Map
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Integration" required>
          <select className={inputCls} value={f.integration_id} onChange={(e) => setF({ ...f, integration_id: e.target.value })}>
            {integrations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Device user ID (PIN)" required>
          <input className={inputCls} value={f.device_user_id} onChange={(e) => setF({ ...f, device_user_id: e.target.value.trim() })} />
        </Field>
        <Field label="Employee" required hint="Type at least one letter of the name or code">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search active employees (instant)" />
        </Field>
        {people.data?.items.length ? (
          <ul className="border border-[#DDE2EC] rounded divide-y divide-[#EEF1F6] max-h-56 overflow-y-auto">
            {people.data.items.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setF({ ...f, employee_id: p.id })}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer transition-colors ${f.employee_id === p.id ? "bg-blue-50" : ""}`}
                >
                  <span className="font-semibold text-gray-900">{p.full_name}</span> <span className="font-mono text-[11px] text-[#64748B]">{p.employee_code}</span>
                  {p.biometric_mapped && <span className="text-[11px] text-amber-700"> · already has a biometric ID</span>}
                  <div className="text-[11px] text-[#64748B]">{[p.designation, p.department].filter(Boolean).join(" · ")}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : q.trim().length >= 1 && !people.loading ? (
          <p className="text-xs text-[#64748B]">No active employee matches.</p>
        ) : null}
        <Field label="Valid from" hint="Defaults to the employee's joining date">
          <input type="date" className={inputCls} value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} />
        </Field>
      </div>
    </Drawer>
  )
}

// ── sync history ────────────────────────────────────────────────────────────

function SyncHistory() {
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<SyncLog | null>(null)
  const logs = useHr(() => hr.get<Page<SyncLog>>("/api/v1/attendance/sync-logs", { page, page_size: 25 }), [page])
  if (logs.loading && !logs.data) return <Loading />
  if (logs.error) return <ErrorState error={logs.error} onRetry={logs.reload} />
  return (
    <Panel title="Synchronisation history">
      {!logs.data?.items.length ? (
        <Empty title="No syncs have run yet" />
      ) : (
        <>
          <Table head={["Started", "Trigger", "Status", "Window", "Fetched", "New", "Duplicates", "Unmapped", "Unreadable", ""]}>
            {logs.data.items.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDateTime(l.started_at)}</td>
                <td className="px-4 py-2 text-gray-700">{l.trigger}</td>
                <td className="px-4 py-2">
                  <StatusBadge value={l.status} />
                </td>
                <td className="px-4 py-2 text-xs text-[#64748B] whitespace-nowrap">
                  {fmtDateTime(l.window_from)} → {fmtDateTime(l.window_to)}
                </td>
                <td className="px-4 py-2 tabular-nums">{l.fetched}</td>
                <td className="px-4 py-2 tabular-nums">{l.inserted}</td>
                <td className="px-4 py-2 tabular-nums">{l.duplicates}</td>
                <td className="px-4 py-2 tabular-nums">{l.unmapped}</td>
                <td className={`px-4 py-2 tabular-nums ${l.rejected ? "text-rose-700" : ""}`}>{l.rejected}</td>
                <td className="px-4 py-2 text-right">
                  <Btn variant="ghost" onClick={() => setOpen(l)}>
                    Details
                  </Btn>
                </td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={25} total={logs.data.total} onPage={setPage} />
        </>
      )}
      {open && (
        <Drawer open title={`Sync ${fmtDateTime(open.started_at)}`} onClose={() => setOpen(null)}>
          {open.error && <p className="text-sm text-rose-700 mb-3">{open.error}</p>}
          <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">Devices</h4>
          <ul className="text-sm space-y-1 mb-4">
            {open.details?.devices?.map((d) => (
              <li key={d.serial}>
                <span className="font-mono">{d.serial}</span> — {d.ok ? "ok" : <span className="text-rose-700">{d.error}</span>}
              </li>
            )) ?? <li className="text-[#64748B]">—</li>}
          </ul>
          {!!open.details?.rejected?.length && (
            <>
              <h4 className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wider mb-2">Rows the device sent that could not be read (kept verbatim)</h4>
              <pre className="text-[11px] bg-[#F8FAFC] border border-[#DDE2EC] rounded p-2 overflow-x-auto">{open.details.rejected.join("\n")}</pre>
            </>
          )}
          <p className="text-[11px] text-[#64748B] mt-4">Run by {open.created_by}</p>
        </Drawer>
      )}
    </Panel>
  )
}
