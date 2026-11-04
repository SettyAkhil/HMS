import { db } from "./db"
import { getDoctorByName, getDoctorConsultationFee } from "./doctorMaster"
import { notifyAppointmentBooked } from "./patientMessaging"

/**
 * Booking an outpatient appointment -- the one place that turns a booking into a
 * doctor-assigned encounter.
 *
 * Reception can book from two screens (the Appointments desk, and the Appointment
 * tab on the registration desk), and both must produce exactly the same record:
 * same status, same room, same queue token, same timestamps. This used to live
 * inline in one component, where the "already registered" branch quietly skipped
 * the confirmation the other branch produced -- so booking for an existing patient
 * looked like nothing had happened, and reception never got the consultation-fee
 * step.
 *
 * Being the one place, it is also where the patient's confirmation SMS goes from
 * (if the hospital has it switched on -- see `patientMessaging.ts`).
 */

export interface AppointmentBooking {
  /** Set when the patient is already registered and only needs a doctor. */
  encounterId?: string
  time: string
  patient: string
  age: number
  sex: string
  phone: string
  complaint: string
  dept: string
  doctor: string
  registryType: "OP" | "IP"
}

export interface BookedAppointment {
  encounterId: string
  name: string
  umr: string
  opNumber: string
  doctor: string
  dept: string
  room: string
  token: string
  phone: string
  time: string
}

export function bookAppointment(
  booking: AppointmentBooking,
): BookedAppointment {
  const sex =
    booking.sex === "Female"
      ? "Female"
      : booking.sex === "Other"
        ? "Other"
        : "Male"
  const doctorRoom = getDoctorByName(booking.doctor)?.room
  const room =
    booking.registryType === "IP" ? "Ward Pending" : doctorRoom || "Room 103"

  // Existing patient: attach the doctor to the encounter reception already made.
  if (booking.encounterId) {
    const existing = db.getEncounterById(booking.encounterId)
    const token = `${booking.dept.charAt(0).toUpperCase()}-${existing?.opNumber || "OP"}`

    db.updateEncounter(booking.encounterId, {
      dept: booking.dept,
      assignedDoctor: booking.doctor,
      room,
      queueToken: token,
      // Stops at "Doctor Assigned": the OP nurse still has to take vitals before
      // the patient is handed to the consulting room.
      status: "Doctor Assigned",
      chiefComplaint: booking.complaint,
      timestamps: {
        ...(existing?.timestamps || {
          arrival: new Date().toLocaleTimeString(),
        }),
        doctorAssigned: booking.time,
      },
    })

    const phone = existing?.phone || booking.phone
    const booked: BookedAppointment = {
      encounterId: booking.encounterId,
      name: existing?.patientName || booking.patient,
      umr: existing?.umr || "",
      opNumber: existing?.opNumber || "",
      doctor: booking.doctor,
      dept: booking.dept,
      room,
      token,
      phone,
      time: booking.time,
    }
    notifyAppointmentBooked(booked)
    return booked
  }

  // Walk-in: register the patient and the encounter, then assign the doctor.
  const parts = booking.patient.trim().split(" ")
  const { encounter } = db.registerNewPatient({
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || "Patient",
    age: booking.age,
    sex,
    phone: booking.phone,
    dept: booking.dept,
    chiefComplaint: booking.complaint,
  })

  const token = `${booking.dept.charAt(0).toUpperCase()}-${encounter.opNumber}`
  db.updateEncounter(encounter.id, {
    dept: booking.dept,
    assignedDoctor: booking.doctor,
    room,
    queueToken: token,
    status: "Doctor Assigned",
    timestamps: { ...encounter.timestamps, doctorAssigned: booking.time },
  })

  const booked: BookedAppointment = {
    encounterId: encounter.id,
    name: encounter.patientName,
    umr: encounter.umr,
    opNumber: encounter.opNumber,
    doctor: booking.doctor,
    dept: booking.dept,
    room,
    token,
    phone: booking.phone,
    time: booking.time,
  }
  notifyAppointmentBooked(booked)
  return booked
}
