import { useEffect, useMemo, useState } from "react"
import { db, DBOPEncounter } from "../services/db"
import { ACTIVE_DOCTORS } from "../services/doctorMaster"
import { doesDoctorMatchEncounter } from "../services/doctorPortalDb"

/**
 * "Clinic by doctor" -- a section of OP Management.
 *
 * OP Management answers the question by *department* (load, capacity, average
 * wait); this answers it by *doctor*: who reception has booked with whom, how
 * many are waiting on the nurse, and who is already in the room.
 *
 * It was briefly its own page, which gave the OP department two dashboards
 * showing overlapping counts. One hub with two views is the same information
 * and one less place to look.
 *
 * Read-only by design. Booking belongs to reception and vitals belong to the
 * Nurse Station -- a second place to edit either is how two screens end up
 * disagreeing about the same visit.
 */

/** Booked, but the nurse has not sent them in yet. */
const AWAITING_VITALS: DBOPEncounter["status"][] = [
  "Registered",
  "Symptoms Captured",
  "AI Recommended",
  "Awaiting Doctor",
  "Doctor Assigned",
]

const WITH_DOCTOR: DBOPEncounter["status"][] = [
  "In Queue",
  "Under Consultation",
]

const DONE: DBOPEncounter["status"][] = [
  "Consultation Completed",
  "Post-Consultation",
  "Awaiting Billing",
  "Billing Completed",
  "Awaiting Investigation",
  "OP Completed",
]

export default function ClinicByDoctor({
  onOpenNurseStation,
}: {
  onOpenNurseStation?: () => void
}) {
  const [encounters, setEncounters] = useState<DBOPEncounter[]>(() =>
    db.getEncounters(),
  )
  const [specialty, setSpecialty] = useState<string>("All")
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const unsub = db.subscribe(() => setEncounters(db.getEncounters()))
    return () => {
      unsub()
    }
  }, [])

  // Anything still moving through the clinic today.
  const live = useMemo(
    () => encounters.filter((e) => !DONE.includes(e.status)),
    [encounters],
  )

  const specialties = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(ACTIVE_DOCTORS.map((d) => d.specialty as string)),
      ).sort(),
    ],
    [],
  )

  // One row per doctor who has somebody booked today, plus the doctors on the
  // roster for that specialty so an empty clinic is visible rather than absent.
  const byDoctor = useMemo(() => {
    const roster = ACTIVE_DOCTORS.filter(
      (d) => specialty === "All" || d.specialty === specialty,
    )
    return roster
      .map((doc) => {
        const mine = live.filter((e) => doesDoctorMatchEncounter(doc, e))
        return {
          doctor: doc,
          total: mine.length,
          awaitingVitals: mine.filter((e) => AWAITING_VITALS.includes(e.status))
            .length,
          ready: mine.filter((e) => e.status === "In Queue").length,
          inRoom: mine.filter((e) => e.status === "Under Consultation").length,
          patients: mine,
        }
      })
      .sort(
        (a, b) =>
          b.total - a.total || a.doctor.name.localeCompare(b.doctor.name),
      )
  }, [live, specialty])

  const active = byDoctor.filter((r) => r.total > 0)
  const rows = showAll ? byDoctor : active
  const hiddenCount = byDoctor.length - active.length

  const unassigned = live.filter((e) => !e.assignedDoctor?.trim())

  return (
    <div className="bg-white border border-[#DDE2EC] rounded shadow-xs overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#DDE2EC] bg-[#F8FAFC] flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-900">
            Clinic by Doctor
          </h2>
          <p className="text-[11.5px] text-[#64748B]">
            Today's bookings per consultant. Booked at reception; vitals taken
            at the nurse station.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className="border border-[#DDE2EC] rounded px-2.5 py-1.5 text-[12px] bg-white"
          >
            {specialties.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
          {onOpenNurseStation && (
            <button
              type="button"
              onClick={onOpenNurseStation}
              className="text-[12px] font-bold text-[#1B4FD8] hover:underline cursor-pointer whitespace-nowrap"
            >
              Nurse Station →
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {unassigned.length > 0 && (
          <div className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5">
            <p className="text-[12px] font-semibold text-[#92400E]">
              {unassigned.length} patient{unassigned.length === 1 ? "" : "s"}{" "}
              waiting with no doctor booked
            </p>
            <p className="text-[11.5px] text-[#B45309] mt-0.5">
              {unassigned
                .slice(0, 6)
                .map((e) => e.patientName)
                .join(", ")}
              {unassigned.length > 6 ? ` +${unassigned.length - 6} more` : ""} —
              reception books the doctor, or a doctor can claim them from their
              own workspace.
            </p>
          </div>
        )}

        {/* The section already carries the heading and the specialty selector --
            this table used to be its own page and brought a second copy of both. */}
        <div className="bg-white border border-[#DDE2EC] rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#DDE2EC]">
                  {[
                    "Doctor",
                    "Room",
                    "Booked",
                    "Awaiting vitals",
                    "Ready",
                    "In room",
                    "Patients",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.doctor.id}
                    className={`border-b border-[#F1F5F9] ${
                      row.total === 0 ? "opacity-55" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <p className="text-[12.5px] font-semibold text-gray-900">
                        {row.doctor.name}
                      </p>
                      <p className="text-[11px] text-[#64748B]">
                        {row.doctor.specialty} · {row.doctor.section}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-[#475569]">
                      {row.doctor.room}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-bold font-mono text-gray-900">
                      {row.total}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-[#B45309]">
                      {row.awaitingVitals || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-[#15803D]">
                      {row.ready || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-[#1B4FD8]">
                      {row.inRoom || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.patients.length === 0 ? (
                        <span className="text-[11.5px] text-[#94A3B8]">
                          No appointments
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.patients.slice(0, 4).map((p) => (
                            <span
                              key={p.id}
                              title={`${p.umr} · ${p.status}`}
                              className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                                p.status === "Under Consultation"
                                  ? "bg-[#E8EDF5] text-[#1B4FD8] border-[#BFD3F2]"
                                  : p.status === "In Queue"
                                    ? "bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]"
                                    : "bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]"
                              }`}
                            >
                              {p.patientName}
                            </span>
                          ))}
                          {row.patients.length > 4 && (
                            <span className="text-[10.5px] text-[#94A3B8]">
                              +{row.patients.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-4 py-2 border-t border-[#DDE2EC] text-[11.5px] font-semibold text-[#1B4FD8] hover:bg-[#F8FAFC] transition-colors cursor-pointer text-left"
            >
              {showAll
                ? `Hide ${hiddenCount} consultant${
                    hiddenCount === 1 ? "" : "s"
                  } with no appointments today`
                : `Show all ${byDoctor.length} consultants (${hiddenCount} with no appointments today)`}
            </button>
          )}
          {rows.length === 0 && (
            <p className="px-4 py-5 text-center text-[12px] text-[#94A3B8]">
              No clinics running{specialty !== "All" ? ` in ${specialty}` : ""}{" "}
              right now.
            </p>
          )}
          <div className="px-4 py-2 border-t border-[#DDE2EC] bg-[#F8FAFC] flex flex-wrap gap-3 text-[10.5px] text-[#64748B]">
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-[#D97706] mr-1" />
              Awaiting vitals
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-[#16A34A] mr-1" />
              Vitals done, ready
            </span>
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-[#1B4FD8] mr-1" />
              In the consulting room
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
