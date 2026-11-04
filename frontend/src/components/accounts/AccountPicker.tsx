import { useEffect, useState } from "react"
import type { Account, CostCentre } from "../../types/accounts"
import { accountsApi } from "../../services/accounts/client"
import { Select } from "./ui"

// The chart changes rarely; one fetch per session, refreshed after an edit.
let chartCache: Promise<{ accounts: Account[]; cost_centres: CostCentre[] }> | null = null

export function loadChart(refresh = false) {
  if (!chartCache || refresh) {
    chartCache = accountsApi.chart().catch((err) => {
      chartCache = null
      throw err
    })
  }
  return chartCache
}

export function useChart() {
  const [chart, setChart] = useState<{ accounts: Account[]; cost_centres: CostCentre[] } | null>(null)
  useEffect(() => {
    let live = true
    loadChart()
      .then((c) => live && setChart(c))
      .catch(() => live && setChart({ accounts: [], cost_centres: [] }))
    return () => {
      live = false
    }
  }, [])
  return chart
}

/** Posting accounts only (no headings), optionally narrowed; manual journals also
 *  exclude control accounts, which the server would refuse anyway. */
export default function AccountPicker({
  value,
  onChange,
  filter,
  manual,
  placeholder = "Select account",
}: {
  value: number | ""
  onChange: (id: number | "", account?: Account) => void
  filter?: (a: Account) => boolean
  manual?: boolean
  placeholder?: string
}) {
  const chart = useChart()
  const options = (chart?.accounts || []).filter(
    (a) => !a.is_group && a.is_active && (!manual || a.allow_manual) && (!filter || filter(a)),
  )
  return (
    <Select
      value={value}
      onChange={(e) => {
        const id = e.target.value ? Number(e.target.value) : ""
        onChange(id, options.find((a) => a.id === id))
      }}
    >
      <option value="">{chart ? placeholder : "Loading accounts…"}</option>
      {options.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name}
        </option>
      ))}
    </Select>
  )
}

export function CostCentrePicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const chart = useChart()
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No cost centre</option>
      {(chart?.cost_centres || []).map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} · {c.name}
        </option>
      ))}
    </Select>
  )
}
