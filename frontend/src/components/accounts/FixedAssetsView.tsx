import React, { useState } from "react"
import { Calculator, Plus, RefreshCw, Search, Download, Layers, CheckCircle2 } from "lucide-react"
import { accountsApi } from "../../services/accounts/client"
import type { FixedAsset, Period } from "../../types/accounts"
import AccountPicker, { CostCentrePicker } from "./AccountPicker"
import {
  Button, Card, Empty, ErrorNote, Field, Input, Loaded, Modal, Money, Notice, PageHeader, Pill, Select, Table,
  Td, Th, downloadCsv, formatDate, formatINR, formatINRShort, today, useAction, useApi
} from "./ui"

export default function FixedAssetsView() {
  const assetsState = useApi(() => accountsApi.assets(), [])
  const periodsState = useApi(() => accountsApi.periods(), [])
  const [search, setSearch] = useState("")
  const [addingAsset, setAddingAsset] = useState(false)
  const [showDepModal, setShowDepModal] = useState(false)
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | "">("")
  const [notice, setNotice] = useState<string | null>(null)
  const action = useAction()

  const assets = assetsState.data?.assets || []
  const filtered = assets.filter((a) => {
    const q = search.trim().toLowerCase()
    return (
      !q ||
      a.asset_code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.asset_account_name.toLowerCase().includes(q) ||
      (a.cost_centre && a.cost_centre.toLowerCase().includes(q))
    )
  })

  const totalCost = assets.reduce((s, a) => s + (a.status === "active" ? a.cost : 0), 0)
  const totalAcc = assets.reduce((s, a) => s + (a.status === "active" ? a.accumulated : 0), 0)
  const totalNbv = assets.reduce((s, a) => s + (a.status === "active" ? a.net_book_value : 0), 0)

  // Find all open periods for the depreciation run
  const openPeriods: Period[] = (periodsState.data?.fiscal_years || []).flatMap((fy) =>
    (fy.periods || []).filter((p) => p.status === "open")
  )

  const handleRunDepreciation = () => {
    const periodId = selectedPeriodId || openPeriods[0]?.id
    if (!periodId) return
    action.run(
      () => accountsApi.runDepreciation(Number(periodId)),
      (res) => {
        setNotice(
          `Depreciation posted as ${res.journal_no || "journal"}. ₹${(res.total || 0).toLocaleString("en-IN")} across ${res.assets || 0} active assets.`
        )
        setShowDepModal(false)
        assetsState.reload()
      }
    )
  }

  const exportAssets = () => {
    downloadCsv(
      `fixed_assets_register_${today()}.csv`,
      ["Code", "Asset Name", "GL Account", "Cost Centre", "Method", "Cost", "Accumulated", "NBV", "Status"],
      assets.map((a) => [
        a.asset_code,
        a.name,
        `${a.asset_account_code} ${a.asset_account_name}`,
        a.cost_centre || "",
        a.method,
        a.cost,
        a.accumulated,
        a.net_book_value,
        a.status,
      ])
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fixed Assets Register & Depreciation Schedule"
        subtitle="Capitalized hospital equipment, buildings and fixtures tracked at cost, accumulated depreciation, and net carrying value."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={exportAssets}>
              <Download size={13} /> CSV
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelectedPeriodId(openPeriods[0]?.id || "")
                setShowDepModal(true)
              }}
            >
              <RefreshCw size={13} /> Run Depreciation
            </Button>
            <Button variant="primary" onClick={() => setAddingAsset(true)}>
              <Plus size={14} /> Capitalize Asset
            </Button>
          </div>
        }
      />

      <Notice message={notice} onClose={() => setNotice(null)} />
      <ErrorNote message={action.error} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Gross Fixed Asset Cost</span>
          <div className="text-xl font-bold text-[#0F172A] mt-1">{formatINRShort(totalCost)}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">{assets.length} Registered Assets</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Accumulated Depreciation</span>
          <div className="text-xl font-bold text-[#BE123C] mt-1">{formatINRShort(totalAcc)}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Contra-Asset Balance</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Net Book Value (NBV)</span>
          <div className="text-xl font-bold text-[#047857] mt-1">{formatINRShort(totalNbv)}</div>
          <div className="text-[11px] text-[#047857] mt-0.5 font-semibold">Carrying Value on Balance Sheet</div>
        </div>

        <div className="bg-white border border-[#DDE2EC] p-4 rounded-none shadow-xs">
          <span className="text-xs text-[#64748B] font-medium">Depreciation Methods</span>
          <div className="text-xl font-bold text-[#1B4FD8] mt-1">SLM &amp; WDV</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Automated Monthly Schedule</div>
        </div>
      </div>

      {/* Asset Table */}
      <div className="bg-white border border-[#DDE2EC] rounded-none overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#F1F5F9] bg-[#FAFAFA] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-2.5 text-[#94A3B8]" size={14} />
            <input
              type="text"
              placeholder="Search asset code, name or cost centre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded-none focus:outline-none focus:border-[#1B4FD8] bg-white"
            />
          </div>
          <span className="text-xs text-[#64748B]">Showing {filtered.length} assets</span>
        </div>

        <Loaded state={assetsState}>
          {() =>
            filtered.length === 0 ? (
              <Empty>
                {assets.length === 0
                  ? "No fixed assets capitalized in the ledger yet. Click 'Capitalize Asset' to register equipment or property."
                  : "No assets match search."}
              </Empty>
            ) : (
              <Table dense>
                <thead>
                  <tr>
                    <Th>Asset Code</Th>
                    <Th>Description</Th>
                    <Th>GL Account</Th>
                    <Th>Cost Centre</Th>
                    <Th>Method</Th>
                    <Th right>Cost</Th>
                    <Th right>Accumulated Dep.</Th>
                    <Th right>Net Book Value</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-2.5 px-3 font-mono font-bold text-xs text-[#1B4FD8]">
                        {a.asset_code}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-xs text-[#0F172A]">{a.name}</div>
                        {a.location && <div className="text-[11px] text-[#64748B]">Loc: {a.location}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        <span className="font-mono text-[11px] font-semibold text-[#334155]">{a.asset_account_code}</span>{" "}
                        {a.asset_account_name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-[#64748B]">
                        {a.cost_centre || "General Hospital"}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#475569]">
                        {a.method} ({Math.round(a.useful_life_months / 12)} yrs)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-medium">
                        {formatINR(a.cost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-medium text-[#BE123C]">
                        {formatINR(a.accumulated)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-[#047857]">
                        {formatINR(a.net_book_value)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Pill tone={a.status === "active" ? "green" : "neutral"}>
                          {a.status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          }
        </Loaded>
      </div>

      {/* Capitalize Asset Modal */}
      {addingAsset && (
        <CapitalizeAssetModal
          onClose={() => setAddingAsset(false)}
          onSaved={() => {
            setAddingAsset(false)
            setNotice("Fixed asset capitalized and registered.")
            assetsState.reload()
          }}
        />
      )}

      {/* Run Depreciation Modal */}
      {showDepModal && (
        <Modal
          title="Run Monthly Fixed Asset Depreciation"
          onClose={() => setShowDepModal(false)}
          footer={
            <>
              <Button onClick={() => setShowDepModal(false)}>Cancel</Button>
              <Button
                variant="primary"
                busy={action.busy}
                disabled={openPeriods.length === 0}
                onClick={handleRunDepreciation}
              >
                Execute Depreciation
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <ErrorNote message={action.error} />
            <p className="text-xs text-[#334155]">
              Select an open fiscal period to calculate monthly depreciation across all active capitalized assets.
              The ledger will automatically generate a posted Depreciation Journal (<code>DEP-*</code>).
            </p>
            <Field label="Target Fiscal Period">
              <Select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              >
                {openPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatDate(p.start_date)} to {formatDate(p.end_date)})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CapitalizeAssetModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    asset_code: "",
    name: "",
    account_id: "" as number | "",
    cost: "",
    salvage: "0",
    useful_life_years: "5",
    method: "SLM" as "SLM" | "WDV",
    wdv_rate: "15",
    in_service_date: today(),
    cost_centre: "",
    location: "",
  })
  const action = useAction()
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const save = () => {
    if (!form.asset_code.trim() || !form.name.trim() || !form.account_id || !form.cost) return
    action.run(
      () =>
        accountsApi.registerAsset({
          asset_code: form.asset_code.trim().toUpperCase(),
          name: form.name.trim(),
          asset_account: { id: Number(form.account_id) },
          cost: Number(form.cost),
          salvage: Number(form.salvage || 0),
          useful_life_months: Math.round(Number(form.useful_life_years) * 12),
          method: form.method,
          wdv_rate: form.method === "WDV" ? Number(form.wdv_rate) : undefined,
          in_service_date: form.in_service_date,
          cost_centre: form.cost_centre || undefined,
          location: form.location.trim() || undefined,
        }),
      onSaved
    )
  }

  const valid = form.asset_code.trim() && form.name.trim() && form.account_id !== "" && Number(form.cost) > 0

  return (
    <Modal
      title="Capitalize & Register Fixed Asset"
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={action.busy} disabled={!valid} onClick={save}>
            Capitalize Asset
          </Button>
        </>
      }
    >
      <ErrorNote message={action.error} />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Asset Code (Unique)">
            <Input
              value={form.asset_code}
              onChange={(e) => set({ asset_code: e.target.value })}
              placeholder="e.g. EQP-MRI-01"
            />
          </Field>
          <Field label="Asset Description">
            <Input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Siemens 3T MRI Machine"
            />
          </Field>
        </div>

        <Field label="Fixed Asset GL Account">
          <AccountPicker
            value={form.account_id}
            filter={(a) => a.category === "asset"}
            onChange={(id) => set({ account_id: id })}
            placeholder="Select Asset Account (e.g. 1510 Medical Equipment)"
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Gross Cost (₹)">
            <Input
              type="number"
              min="0"
              value={form.cost}
              onChange={(e) => set({ cost: e.target.value })}
              placeholder="35000000"
            />
          </Field>
          <Field label="Salvage Value (₹)">
            <Input
              type="number"
              min="0"
              value={form.salvage}
              onChange={(e) => set({ salvage: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Useful Life (Years)">
            <Input
              type="number"
              min="1"
              value={form.useful_life_years}
              onChange={(e) => set({ useful_life_years: e.target.value })}
              placeholder="10"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Depreciation Method">
            <Select
              value={form.method}
              onChange={(e) => set({ method: e.target.value as "SLM" | "WDV" })}
            >
              <option value="SLM">Straight Line Method (SLM)</option>
              <option value="WDV">Written Down Value (WDV / Reducing Balance)</option>
            </Select>
          </Field>
          {form.method === "WDV" ? (
            <Field label="WDV Rate (%)">
              <Input
                type="number"
                step="0.1"
                value={form.wdv_rate}
                onChange={(e) => set({ wdv_rate: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="In-Service Date">
              <Input
                type="date"
                value={form.in_service_date}
                max={today()}
                onChange={(e) => set({ in_service_date: e.target.value })}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost Centre (Department)">
            <CostCentrePicker value={form.cost_centre} onChange={(c) => set({ cost_centre: c })} />
          </Field>
          <Field label="Physical Location">
            <Input
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="e.g. Radiology Wing, Ground Floor"
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
