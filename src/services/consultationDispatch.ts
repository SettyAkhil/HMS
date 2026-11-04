/**
 * Dispatch of one consultation sheet to the two departments that own its halves.
 *
 * Medicines  -> PharmacyDatabase as a prescription in the existing pharmacy queue.
 * Lab tests  -> LabOrderDatabase as an order that reception must bill before the
 *               laboratory can see it.
 *
 * Kept out of the portal component so the ordering and the audit trail are the
 * same no matter which screen triggers a dispatch, and so a failure on one half
 * is reported rather than leaving the caller guessing which department received
 * what.
 */

import { db, DBOPEncounter } from "./db"
import { AuditDatabase } from "./auditDb"
import { LabOrderDatabase, priceForTest } from "./labOrdersDb"
import { BillingDatabase } from "./billingDb"
import { OpReportsService } from "./opReportsDb"
import {
  isRadiologyTest,
  getModalityForTest,
  getRoomForModality,
} from "../utils/testClassifier"
import {
  ConsultationRecord,
  DoctorAccount,
  DoctorPortalDatabase,
} from "./doctorPortalDb"
import {
  AppPrescription,
  AppPrescriptionItem,
  PharmacyDatabase,
} from "./pharmacyDb"

export interface DispatchResult {
  prescriptionId?: string
  labOrderId?: string
  labTotal: number
  medicineCount: number
  labTestCount: number
  /** Which halves actually went out on this call. */
  sentToPharmacy: boolean
  sentToLab: boolean
  errors: string[]
}

/**
 * Which halves of the sheet to send.
 *
 * A consultation routinely produces only one of them -- medicines with no
 * investigations, or investigations with no medicines -- and each half travels
 * to a different department on its own. Omit a field to let the content decide.
 */
export interface DispatchTargets {
  pharmacy?: boolean
  lab?: boolean
}

/**
 * What is worth sending where, given what is on the sheet and what has already
 * gone out. Each half is independent: the doctor can send the medicines now and
 * the investigations later, or only ever send one of them.
 */
export function dispatchableHalves(
  record: ConsultationRecord,
): {
  pharmacy: boolean
  lab: boolean
  /** A sheet was attached but nothing could be read off it. */
  unreadSheet: boolean
} {
  const medicines = record.medications.filter((m) => m.name.trim()).length
  const tests = record.labTests.filter((t) => t.name.trim()).length
  const hasSheetImage =
    !!record.uploadedPrescription || !!record.whiteboardImage
  const unreadSheet = medicines === 0 && tests === 0 && hasSheetImage

  return {
    // Nothing legible and no investigations either means the sheet is a
    // photograph the AI could not read -- the pharmacist reading the original is
    // then a real workflow, and the only one left.
    pharmacy: !record.prescriptionId && (medicines > 0 || unreadSheet),
    lab: !record.labOrderId && tests > 0,
    unreadSheet,
  }
}

/** One-line digest of the sheet, so the pharmacist sees the clinical context at a glance. */
function buildPharmacySummary(
  record: ConsultationRecord,
  encounter: DBOPEncounter,
): string {
  const parts = [
    `${encounter.patientName} (${encounter.age}${encounter.sex?.[0] || ""}, UMR ${encounter.umr}, ${encounter.opNumber})`,
    record.diagnosis ? `Dx: ${record.diagnosis}` : "",
    `${record.medications.length} medicine(s) prescribed by ${record.doctorName}`,
    record.labTests.length
      ? `${record.labTests.length} investigation(s) routed to lab billing`
      : "",
    record.advice ? `Advice: ${record.advice}` : "",
  ]
  return parts.filter(Boolean).join(" · ")
}

export function dispatchConsultation(
  record: ConsultationRecord,
  doctor: DoctorAccount,
  targets: DispatchTargets = {},
): DispatchResult {
  const encounter = db.getEncounterById(record.encounterId)
  if (!encounter) {
    return {
      labTotal: 0,
      medicineCount: 0,
      labTestCount: 0,
      sentToPharmacy: false,
      sentToLab: false,
      errors: ["The visit this consultation belongs to no longer exists."],
    }
  }

  const medications = record.medications.filter((m) => m.name.trim())
  const labTests = record.labTests.filter((t) => t.name.trim())
  const available = dispatchableHalves(record)

  // An explicit choice wins; otherwise send whichever half has something on it.
  // A half is never sent twice -- `prescriptionId`/`labOrderId` on the record are
  // the receipts, so sending the medicines now and the investigations later is
  // just two calls.
  const toPharmacy =
    (targets.pharmacy ?? available.pharmacy) && available.pharmacy
  const toLab = (targets.lab ?? available.lab) && available.lab

  const result: DispatchResult = {
    labTotal: 0,
    medicineCount: toPharmacy ? medications.length : 0,
    labTestCount: toLab ? labTests.length : 0,
    sentToPharmacy: false,
    sentToLab: false,
    errors: [],
  }

  if (!toPharmacy && !toLab) {
    result.errors.push(
      "There is nothing left to send: add a medicine or an investigation to the sheet, or both halves have already gone.",
    )
    return result
  }

  // ── Medicines -> pharmacy ────────────────────────────────────────────────
  // Only when there are medicines (or an unreadable sheet the pharmacist must
  // read themselves). A sheet carrying investigations and nothing else used to
  // land in the pharmacy queue anyway, as a placeholder item named "Doctor
  // Prescription Sheet" -- a phantom drug to dispense against a lab-only order.
  if (toPharmacy) {
    try {
      const items: AppPrescriptionItem[] =
        medications.length > 0
          ? medications.map((med, index) => ({
              id: `RX-ITEM-${index + 1}`,
              medicineName: med.name,
              strength: med.strength,
              dosage: med.dosage || "1 dose",
              frequency: med.frequency,
              duration: med.duration,
              route: med.route,
              instructions: med.instructions,
              quantity: med.quantity > 0 ? med.quantity : 1,
              substitutionAllowed: true,
            }))
          : [
              {
                id: "RX-ITEM-1",
                // Reached only for a sheet nothing could be read off, so this
                // stands for "read the attached image", not for a drug. It says
                // so, because a pharmacist should never see an item that looks
                // like something to dispense when no drug was actually named.
                medicineName:
                  "Unread prescription sheet - read the attached image",
                dosage: "As written on the sheet",
                duration: "As written",
                quantity: 1,
                substitutionAllowed: false,
                instructions:
                  record.advice ||
                  record.summary ||
                  "The sheet could not be digitised. Dispense from the attached image and confirm with the prescriber.",
              },
            ]

      const nowIso = new Date().toISOString()
      const prescription: AppPrescription = {
        id: `RX-${Date.now().toString(36).toUpperCase()}`,
        patientId: encounter.umr,
        patientName: encounter.patientName,
        uhid: encounter.umr,
        age: encounter.age,
        gender: encounter.sex,
        visitId: encounter.opNumber,
        doctorId: doctor.id,
        doctorName: doctor.name,
        department: encounter.dept || doctor.specialty,
        diagnosis: record.diagnosis || encounter.diagnosis,
        date: nowIso.split("T")[0],
        arrivalTime: encounter.registrationTime || new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
        // A sheet that came in as an image was digitised by the AI split, so the
        // pharmacist is looking at machine-read text and should verify it against
        // the original -- which is what the OCR source type means in that queue.
        sourceType:
          record.uploadedPrescription || record.whiteboardImage
            ? "OCR"
            : "DIGITAL",
        priority: labTests.some((t) => t.urgency === "STAT")
          ? "Urgent"
          : "Normal",
        status: "Sent To Pharmacy",
        dispensingStatus: "Waiting",
        imageUrl:
          record.uploadedPrescription?.dataUrl || record.whiteboardImage,
        items,
        verificationNotes: buildPharmacySummary(record, encounter),
        createdAt: nowIso,
      }

      PharmacyDatabase.savePrescriptions([
        prescription,
        ...PharmacyDatabase.getPrescriptions(),
      ])
      result.prescriptionId = prescription.id
      result.sentToPharmacy = true
    } catch (err) {
      result.errors.push(
        `Medicines could not be sent to pharmacy: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      )
    }
  }

  // ── Investigations -> reception/billing, laboratory & radiology ─────────────
  if (toLab) {
    try {
      const radiologyTests = labTests.filter((t) => isRadiologyTest(t.name, t.category))
      const pureLabTests = labTests.filter((t) => !isRadiologyTest(t.name, t.category))

      // Route Radiology Tests to Radiology & Central Billing
      if (radiologyTests.length > 0) {
        radiologyTests.forEach((t) => {
          const modality = getModalityForTest(t.name)
          const room = getRoomForModality(modality)
          const price = priceForTest(t.name)
          BillingDatabase.createRadiologyStudy({
            patient: encounter.patientName,
            mrn: encounter.umr,
            umr: encounter.umr,
            encounterId: encounter.id,
            department: encounter.dept || doctor.specialty,
            diagnosis: record.diagnosis || encounter.diagnosis,
            study: t.name,
            modality,
            priority: t.urgency === "STAT" ? "STAT" : "Routine",
            ordered: `${OpReportsService.getEncounterDate(encounter) || new Date().toISOString().split("T")[0]} · ${encounter.registrationTime || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            provider: doctor.name,
            status: "Orders",
            room,
            price,
            paymentStatus: "Payment Pending",
            indication: record.summary || record.diagnosis || "Doctor Consultation Order",
            technique: `Diagnostic ${modality} imaging scan`,
            nurseVerified: false,
          })
        })
      }

      // Route Pure Lab Investigations to Central Billing Queue & Laboratory Worklist
      if (pureLabTests.length > 0) {
        const order = LabOrderDatabase.createOrder({
          consultationId: record.id,
          encounterId: encounter.id,
          umr: encounter.umr,
          patientName: encounter.patientName,
          age: encounter.age,
          sex: encounter.sex,
          phone: encounter.phone,
          opNumber: encounter.opNumber,
          doctorId: doctor.id,
          doctorName: doctor.name,
          department: encounter.dept || doctor.specialty,
          diagnosis: record.diagnosis || encounter.diagnosis,
          clinicalNotes: record.summary,
          tests: pureLabTests,
        })
        result.labOrderId = order.id
        result.labTotal = order.billing.total
        result.sentToLab = true
      }
    } catch (err) {
      result.errors.push(
        `Investigations could not be sent for billing: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      )
    }
  }

  // ── Close the loop on the visit itself ───────────────────────────────────
  // Everything below reasons about the sheet as a whole -- what has gone out on
  // any dispatch, not just this one -- so sending the two halves separately
  // leaves the visit in the same state as sending them together.
  const prescriptionId = record.prescriptionId || result.prescriptionId
  const labOrderId = record.labOrderId || result.labOrderId
  const labsStillToSend = labTests.length > 0 && !labOrderId
  const medicinesStillToSend = medications.length > 0 && !prescriptionId

  try {
    db.updateEncounter(encounter.id, {
      diagnosis: record.diagnosis || encounter.diagnosis,
      assessment: record.summary || encounter.assessment,
      advice: record.advice || encounter.advice,
      prescription: medications.map((m) => ({
        medicine: [m.name, m.strength].filter(Boolean).join(" "),
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        instructions: m.instructions,
      })),
      investigations: labTests.map((t) => t.name),
      // Investigations have to clear reception before the lab starts, so once an
      // order exists the visit is awaiting billing rather than complete. A visit
      // with a half still to send is not finished either.
      status: labOrderId
        ? "Awaiting Billing"
        : labsStillToSend || medicinesStillToSend
          ? "Under Consultation"
          : "Consultation Completed",
      furtherAction: (labOrderId || pureLabTests.length > 0)
        ? "Laboratory"
        : radiologyTests.length > 0
          ? "Radiology"
          : prescriptionId
            ? "Pharmacy"
            : "None",
      timestamps: {
        ...encounter.timestamps,
        consultationEnd: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    })
  } catch (err) {
    result.errors.push(
      `The visit record could not be updated: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    )
  }

  DoctorPortalDatabase.updateConsultation(record.id, {
    // "Dispatched" means nothing is left to send. A sheet with one half still
    // waiting stays a draft, so the portal keeps offering to send the rest
    // instead of locking the consultation on the first half out of the door.
    dispatch: labsStillToSend || medicinesStillToSend ? "Draft" : "Dispatched",
    dispatchedAt: new Date().toISOString(),
    prescriptionId,
    labOrderId,
  })

  const sent = [
    result.sentToPharmacy
      ? `${result.medicineCount} medicine(s) to pharmacy (${result.prescriptionId})`
      : "",
    result.sentToLab
      ? `${result.labTestCount} investigation(s) to billing (${result.labOrderId})`
      : "",
  ].filter(Boolean)

  AuditDatabase.logEvent(
    "Consultation Dispatched",
    "Clinical",
    `${doctor.name} sent ${sent.join(" and ")} for ${encounter.patientName} (${encounter.umr}).`,
    result.errors.length ? "Failed" : "Success",
    doctor.staffId,
    doctor.name,
  )

  return result
}
