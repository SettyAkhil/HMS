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
    <div className="mb-3 bg-white border border-[#DDE2EC] rounded text-sm">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-[#F8FAFC] transition-colors" aria-expanded={open}>
        <span className="flex items-center gap-2 text-gray-800">
          <UsersRound className="w-4 h-4 text-[#1B4FD8]" />
          <span className="font-semibold">{label ?? "On duty now"}</span>
          <span className="text-gray-500 text-xs font-normal">
            {data.staff.length} rostered · {inCount} checked in
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <ul className="border-t border-[#DDE2EC] divide-y divide-[#F0F2F5] max-h-64 overflow-y-auto">
          {data.staff.length === 0 && <li className="px-4 py-2 text-gray-500 text-xs">Nobody rostered right now</li>}
          {data.staff.map((s) => (
            <li key={s.employee_id} className="px-3.5 py-1.5 flex justify-between gap-2 text-xs">
              <span>
                <span className="font-medium text-gray-900">{s.name}</span> <span className="text-gray-400">· {s.designation ?? s.category.replace(/_/g, " ")} · {s.department}</span>
              </span>
              <span className={`whitespace-nowrap ${s.checked_in ? "text-emerald-700 font-medium" : "text-amber-700"}`}>
                {s.checked_in ? "Checked in" : "Not checked in"} · until {new Date(s.shift_end).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
