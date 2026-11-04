import { useEffect, useState } from "react"
import { db } from "../services/db"
import { DoctorPortalDatabase } from "../services/doctorPortalDb"
import { LabOrderDatabase } from "../services/labOrdersDb"
import { BillingDatabase } from "../services/billingDb"

/**
 * Keeps a screen in step with the rest of the hospital while it is open.
 *
 * Three signals, because no single one covers every writer:
 *
 *  1. In-tab store subscriptions -- a change made on another screen of THIS tab.
 *  2. The `storage` event -- a change made in ANOTHER tab (reception taking
 *     payment, the pharmacist dispensing, the lab entering a result). Browsers
 *     fire it only in other tabs, which is exactly the gap the subscriptions
 *     leave. `PharmacyDatabase` has no subscribe() of its own, so this is the
 *     only way its queue movements reach the doctor at all.
 *  3. A one-second clock -- waiting times and consultation timers have to keep
 *     counting even when nothing at all has changed.
 *
 * `revision` bumps on any data change; `now` bumps every second. Reading only
 * `revision` in a memo avoids recomputing derived data 60 times a minute for a
 * clock that is displayed, not computed from.
 */

/** localStorage keys whose changes matter to a clinical screen. */
const WATCHED_KEY_PREFIXES = [
  "hospai_db_", // patients and OP encounters
  "hospai_lab_orders", // lab orders: reception billing + laboratory
  "hospai_pharm_", // prescriptions and dispensing
  "hospai_doctor_", // consultations and alert acknowledgements
  "hospai_er_", // ER visits and trauma registrations
  "hospai_inpatient_", // Inpatient ward bed occupancy and admissions
  "hospai_discharged_", // Inpatient discharges
]

export interface LiveClinic {
  /** Increments whenever any watched store changes. */
  revision: number
  /** Wall-clock milliseconds, refreshed every second. */
  now: number
}

export function useLiveClinic(tickMs = 1000): LiveClinic {
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const bump = () => setRevision((value) => value + 1)

    const unsubscribers = [
      db.subscribe(bump),
      DoctorPortalDatabase.subscribe(bump),
      LabOrderDatabase.subscribe(bump),
    ]

    const onStorage = (event: StorageEvent) => {
      // A null key means the whole store was cleared -- treat that as a change too.
      if (
        event.key &&
        !WATCHED_KEY_PREFIXES.some((prefix) => event.key!.startsWith(prefix))
      )
        return
      bump()
    }
    window.addEventListener("storage", onStorage)

    // Cross-machine backend polling for OP Queue and Claims
    db.syncOPVisitsWithBackend()
    BillingDatabase.syncClaimsWithBackend()
    const backendPollTimer = window.setInterval(() => {
      db.syncOPVisitsWithBackend()
      BillingDatabase.syncClaimsWithBackend()
    }, 5000)

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      window.removeEventListener("storage", onStorage)
      window.clearInterval(backendPollTimer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs)
    return () => window.clearInterval(timer)
  }, [tickMs])

  return { revision, now }
}

/** "4m", "1h 12m" -- compact enough for a ticking badge. */
export function formatElapsed(
  fromIso: string | undefined,
  now: number,
): string {
  if (!fromIso) return "--"
  const from = new Date(fromIso).getTime()
  if (!Number.isFinite(from)) return "--"
  const totalMinutes = Math.max(0, Math.floor((now - from) / 60000))
  if (totalMinutes < 60) return `${totalMinutes}m`
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
}
