import { useEffect, useState } from "react"
import { apiFetch } from "../lib/api"
import type { ErAssignment } from "../services/doctorLiveFeed"

// ER visits assigned to this doctor that they haven't yet acknowledged --
// the "call the doctor" signal. Real ER visits live only in the backend
// (unlike the OP-clinic stores useLiveClinic watches), so this has to poll
// rather than read from an in-memory local store.
type ErVisitResponse = {
  id: number
  visit_no: string
  status: string
  patient_name?: string | null
  patient_last_name?: string | null
  is_unknown_patient?: boolean
  unknown_patient_label?: string | null
  condition_at_arrival?: string | null
  triage_category?: string | null
  assigned_doctor_name?: string | null
  assigned_specialty?: string | null
  doctor_assigned_at?: string | null
  doctor_accepted_at?: string | null
}

export function useErAssignmentsForDoctor(doctorName: string | undefined): ErAssignment[] {
  const [assignments, setAssignments] = useState<ErAssignment[]>([])

  useEffect(() => {
    if (!doctorName) {
      setAssignments([])
      return
    }
    let cancelled = false

    const poll = async () => {
      try {
        const data = await apiFetch<{ visits: ErVisitResponse[] }>(
          "/api/er/visits?active_only=true",
        )
        if (cancelled) return
        const mine = (data.visits || []).filter(
          (v) => v.assigned_doctor_name === doctorName && !v.doctor_accepted_at,
        )
        setAssignments(
          mine.map((v) => ({
            id: v.id,
            visit_no: v.visit_no,
            patient_name: v.patient_name,
            patient_last_name: v.patient_last_name,
            is_unknown_patient: v.is_unknown_patient,
            unknown_patient_label: v.unknown_patient_label,
            condition_at_arrival: v.condition_at_arrival,
            triage_category: v.triage_category,
            assigned_specialty: v.assigned_specialty,
            doctor_assigned_at: v.doctor_assigned_at,
          })),
        )
      } catch {
        // best effort -- picked up again on the next poll tick
      }
    }

    void poll()
    const interval = window.setInterval(poll, 15000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [doctorName])

  return assignments
}
