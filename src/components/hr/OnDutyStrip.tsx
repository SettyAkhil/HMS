// "Who is on duty here now" for clinical modules, from published HR rosters.
// Read-only: it never changes appointments, OT lists or bed allocations.
// Renders nothing until HR maps a department to this module (Organization →
// department → HMS module), or when the HR service is unreachable.
import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, UsersRound } from "lucide-react"
import { hr } from "../../services/hr/client"

type Duty = {
  departments: { department: string; rostered: number; checked_in: number }[]
  staff: { employee_id: string; name: string; designation: string | null; category: string; department: string; shift: string; shift_end: string; checked_in: boolean }[]
}

export default function OnDutyStrip({ hmsModule, category, label }: { hmsModule: string; category?: string; label?: string }) {
  const [data, setData] = useState<Duty | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      hr.get<Duty>("/api/v1/workforce/on-duty", { hms_module: hmsModule, category })
        .then((d) => {
          if (alive && d && Array.isArray(d.departments) && Array.isArray(d.staff)) {
            setData(d)
          } else if (alive) {
            setData(null)
          }
        })
        .catch(() => {
          if (alive) setData(null)
        })

    load()
    const t = setInterval(load, 120_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [hmsModule, category])

  if (!data || !Array.isArray(data.departments) || !data.departments.length || !Array.isArray(data.staff)) {
    return null
  }

  const inCount = data.staff.filter((s) => s.checked_in).length

  return (
    <div className="mb-3 bg-white border border-slate-200 rounded-xl text-sm">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-2" aria-expanded={open}>
        <span className="flex items-center gap-2 text-slate-700">
          <UsersRound className="w-4 h-4 text-[#007078]" />
          <span className="font-medium">{label ?? "On duty now"}</span>
          <span className="text-slate-500">
            {data.staff.length} rostered · {inCount} checked in
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <ul className="border-t border-slate-100 divide-y divide-slate-50 max-h-64 overflow-y-auto">
          {data.staff.length === 0 && <li className="px-4 py-2 text-slate-500">Nobody rostered right now</li>}
          {data.staff.map((s) => (
            <li key={s.employee_id} className="px-4 py-1.5 flex justify-between gap-2">
              <span>
                {s.name} <span className="text-slate-400">· {s.designation ?? s.category.replace(/_/g, " ")} · {s.department}</span>
              </span>
              <span className={`text-xs whitespace-nowrap ${s.checked_in ? "text-[#007078]" : "text-amber-700"}`}>
                {s.checked_in ? "Checked in" : "Not checked in"} · until {new Date(s.shift_end).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
