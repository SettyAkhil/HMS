// Workforce strip for the hospital Command Center (main Dashboard). Renders
// nothing for users without HR access or when the HR service is down, so it
// never puts an error in front of clinical staff.
import { useEffect, useState } from "react"
import { AlertTriangle, UsersRound } from "lucide-react"
import { hr } from "../../services/hr/client"

type CC = {
  workforce?: { active?: number; on_duty_now?: number; checked_in_now?: number }
  attendance_today?: { scheduled?: number; present?: number; absent?: number; on_leave?: number; rate?: number | null }
  by_department?: { department: string; rostered: number; checked_in: number }[]
  shortages?: { department: string; shift: string; category: string; required: number; assigned: number; shortage: number }[]
  census_error?: string | null
  pending_approvals?: number
  expiring_credentials?: number
  devices?: Record<string, number>
}

export default function WorkforcePanel({ onOpen }: { onOpen?: () => void }) {
  const [data, setData] = useState<CC | null>(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      hr
        .get<CC>("/api/v1/hr/command-center")
        .then((d) => {
          if (
            alive &&
            d &&
            typeof d === "object" &&
            d.workforce &&
            typeof d.workforce.on_duty_now === "number"
          ) {
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
  }, [])

  if (!data || !data.workforce || typeof data.workforce.on_duty_now !== "number") {
    return null
  }

  const stat = (label: string, value: string | number, tone = "text-slate-900") => (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  )

  return (
    <section className="bg-white border border-slate-200 rounded-xl">
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <UsersRound className="w-4 h-4 text-[#007078]" /> Workforce now
        </h3>
        {onOpen && (
          <button onClick={onOpen} className="text-xs text-[#007078] hover:underline cursor-pointer">
            Open HR & Staff
          </button>
        )}
      </header>
      <div className="grid grid-cols-3 md:grid-cols-7 divide-x divide-slate-100">
        {stat("On duty", data.workforce?.on_duty_now ?? 0)}
        {stat("Checked in", data.workforce?.checked_in_now ?? 0, "text-[#007078]")}
        {stat(
          "Attendance",
          data.attendance_today?.rate !== null && data.attendance_today?.rate !== undefined
            ? `${data.attendance_today.rate}%`
            : "—"
        )}
        {stat(
          "Absent",
          data.attendance_today?.absent ?? 0,
          data.attendance_today?.absent ? "text-rose-700" : undefined
        )}
        {stat(
          "Short staffed",
          data.shortages?.length ?? 0,
          data.shortages?.length ? "text-rose-700" : undefined
        )}
        {stat("Approvals", data.pending_approvals ?? 0)}
        {stat(
          "Devices offline",
          data.devices?.offline ?? 0,
          data.devices?.offline ? "text-rose-700" : undefined
        )}
      </div>
      {Array.isArray(data.shortages) && data.shortages.length > 0 && (
        <ul className="px-4 py-2 border-t border-slate-100 text-xs text-rose-800 space-y-0.5">
          {data.shortages.slice(0, 4).map((s, i) => (
            <li key={i} className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {s.department}, {s.shift}: {s.assigned}/{s.required}{" "}
              {s.category ? s.category.replace(/_/g, " ") : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
