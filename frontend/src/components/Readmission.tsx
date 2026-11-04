import { useEffect, useState } from "react"
import { Icon } from "./icons"
import { apiFetch, reportError } from "../lib/api"
import { formatDateTimeIST } from "../lib/format"
import type { Notice } from "../types"

type ReadmissionEvent = {
  patient_id: string
  patient_name: string
  index_discharge_date: string
  readmission_date: string
  gap_days: number
  readmission_admission_id: number
}

type HighFrequencyPatient = {
  patient_id: string
  patient_name: string
  admissions_in_last_12_months: number
}

type ReadmissionAnalytics = {
  window_days: number
  total_discharges: number
  total_readmissions: number
  readmission_rate_pct: number
  readmission_events: ReadmissionEvent[]
  high_frequency_patients: HighFrequencyPatient[]
}

const EMPTY: ReadmissionAnalytics = {
  window_days: 30,
  total_discharges: 0,
  total_readmissions: 0,
  readmission_rate_pct: 0,
  readmission_events: [],
  high_frequency_patients: [],
}

export default function Readmission({
  setNotice,
}: {
  setNotice?: (n: Notice | null) => void
}) {
  const [windowDays, setWindowDays] = useState(30)
  const [data, setData] = useState<ReadmissionAnalytics>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const result = await apiFetch<ReadmissionAnalytics>(
          `/api/patients/readmissions?window_days=${windowDays}`,
        )
        // The gateway can answer with a bare `{ success, status }` envelope
        // (no analytics fields at all), which used to crash the page on
        // `readmission_events.filter`. Missing fields fall back to empty.
        setData({
          ...EMPTY,
          ...result,
          readmission_events: Array.isArray(result?.readmission_events)
            ? result.readmission_events
            : [],
          high_frequency_patients: Array.isArray(
            result?.high_frequency_patients,
          )
            ? result.high_frequency_patients
            : [],
        })
      } catch (error: any) {
        reportError(setNotice, error, "Failed to load readmission analytics.")
        setData(EMPTY)
      } finally {
        setLoading(false)
      }
    })()
  }, [windowDays])

  const filteredEvents = data.readmission_events.filter(
    (e) =>
      e.patient_name.toLowerCase().includes(search.trim().toLowerCase()) ||
      e.patient_id.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Readmission Tracking
          </h1>
          <p className="text-[12.5px] text-[#64748B]">
            Real admission/discharge dates, computed directly — no predictive
            model behind these numbers.
          </p>
        </div>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="h-8 px-3 border border-[#DDE2EC] rounded text-[12px] font-medium bg-white"
        >
          <option value={30}>30-day window</option>
          <option value={60}>60-day window</option>
          <option value={90}>90-day window</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5 flex flex-col gap-5 w-full">
        {/* Stats -- same micro-label + mono numeral as Admissions and the Bed
            Board, so the four Inpatient screens read as one module. The last
            card carries a footnote, so every card reserves that line and the
            numerals stay on one baseline across the row. */}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          }}
        >
          {[
            {
              label: `${data.window_days}-day readmission rate`,
              value: `${data.readmission_rate_pct}%`,
              tone: "#D97706",
              note: "",
            },
            {
              label: "Total readmissions",
              value: data.total_readmissions,
              tone: "#0F172A",
              note: "",
            },
            {
              label: "Total discharges",
              value: data.total_discharges,
              tone: "#0F172A",
              note: "",
            },
            {
              label: "High-frequency patients",
              value: data.high_frequency_patients?.length || 0,
              tone: "#B91C1C",
              note: "3+ admissions in 12 months",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-[#DDE2EC] px-4 py-3 rounded-none flex flex-col"
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                {stat.label}
              </div>
              <div
                className="text-2xl font-mono font-bold leading-tight mt-1"
                style={{ color: stat.tone }}
              >
                {loading ? "—" : stat.value}
              </div>
              <div className="text-[10px] text-[#94A3B8] mt-auto pt-0.5 min-h-[14px]">
                {stat.note}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
          {/* Readmission events */}
          <div className="flex-1 min-w-0 bg-white border border-[#DDE2EC] rounded-none flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-wrap gap-2 justify-between items-center">
              <h2 className="text-[14px] font-semibold text-gray-900">
                Readmissions within {data.window_days} days
              </h2>
              <div className="relative">
                <input
                  placeholder="Search patient..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1 text-[12px] border border-[#DDE2EC] rounded focus:outline-none focus:border-[#1B4FD8]"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                  <Icon.Search />
                </span>
              </div>
            </div>
            <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
              {loading ? (
                <p className="text-[12.5px] text-[#64748B] p-5">Loading...</p>
              ) : filteredEvents.length === 0 ? (
                <p className="text-[12.5px] text-[#64748B] p-5">
                  No readmissions within {data.window_days} days on record.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="border-b border-[#DDE2EC]">
                    <tr>
                      <th className="px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                        Index Discharge
                      </th>
                      <th className="px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                        Readmitted
                      </th>
                      <th className="px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
                        Gap
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {filteredEvents.map((row, i) => (
                      <tr key={i} className="hover:bg-[#F8FAFC]">
                        <td className="px-5 py-4">
                          <div className="text-[13px] font-bold text-gray-900">
                            {row.patient_name || row.patient_id}
                          </div>
                          <div className="text-[11.5px] font-mono text-[#64748B]">
                            {row.patient_id}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-[12.5px] text-gray-700">
                          {formatDateTimeIST(row.index_discharge_date)}
                        </td>
                        <td className="px-5 py-4 text-[12.5px] text-gray-700">
                          {formatDateTimeIST(row.readmission_date)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              row.gap_days < 15
                                ? "bg-[#FEE2E2] text-[#991B1B]"
                                : "bg-[#FEF3C7] text-[#92400E]"
                            }`}
                          >
                            {row.gap_days} days
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* High-frequency patients */}
          <div className="w-full lg:w-80 shrink-0 bg-white border border-[#DDE2EC] rounded-md flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-[#DDE2EC]">
              <h2 className="text-[14px] font-bold text-gray-900">
                High-Frequency Admissions
              </h2>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                3 or more admissions in the trailing 12 months — a plain count,
                not a risk score.
              </p>
            </div>
            <div
              className="overflow-auto p-4 space-y-2.5"
              style={{ maxHeight: "60vh" }}
            >
              {loading ? (
                <p className="text-[12px] text-[#94A3B8]">Loading...</p>
              ) : (data.high_frequency_patients?.length || 0) === 0 ? (
                <p className="text-[12px] text-[#94A3B8]">
                  No patients meet this threshold.
                </p>
              ) : (
                (data.high_frequency_patients || []).map((p) => (
                  <div
                    key={p.patient_id}
                    className="bg-[#F8FAFC] border border-[#F1F5F9] rounded-lg p-3"
                  >
                    <div className="text-[13px] font-bold text-gray-900">
                      {p.patient_name || p.patient_id}
                    </div>
                    <div className="text-[11px] text-[#64748B] font-mono">
                      {p.patient_id}
                    </div>
                    <div className="text-[11.5px] text-[#B45309] font-semibold mt-1">
                      {p.admissions_in_last_12_months} admissions in 12 months
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
