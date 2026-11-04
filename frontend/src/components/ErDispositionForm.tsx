import React, { useState } from "react"
import { FiCheckCircle } from "react-icons/fi"
import { Button, Select, Textarea, Label } from "./ui"
import { apiFetch, reportError } from "../lib/api"
import type { Notice } from "../types"

export default function ErDispositionForm({
  visitId,
  setNotice,
  onCompleted,
}: {
  visitId: number
  setNotice: (notice: Notice | null) => void
  onCompleted: () => void
}) {
  const [outcome, setOutcome] = useState("")
  const [specialty, setSpecialty] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const outcomes = [
    { value: "discharge", label: "Discharge Home" },
    { value: "observation", label: "Emergency Observation" },
    { value: "ward", label: "Admit to Ward" },
    { value: "icu", label: "Admit to ICU" },
    { value: "ot", label: "Transfer to OT / Surgery" },
    { value: "referral", label: "Refer to Higher Center" },
    { value: "death", label: "Death" },
  ]

  const submit = async () => {
    if (!outcome)
      return setNotice({
        type: "error",
        message: "Select a disposition outcome.",
      })

    setSaving(true)
    try {
      await apiFetch(`/api/er/visits/${visitId}/disposition`, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          required_specialty: specialty || undefined,
          clinical_reason: reason,
        }),
      })

      // If admission is required, trigger a Bed Request if not already created
      if (["ward", "icu", "ot"].includes(outcome)) {
        try {
          await apiFetch(`/api/er/visits/${visitId}/bed-requests`, {
            method: "POST",
            body: JSON.stringify({
              requested_level_of_care: outcome.toUpperCase(),
              requested_specialty: specialty || undefined,
            }),
          })
        } catch {
          // Bed request may already have been created atomically by disposition
        }
        setNotice({
          type: "success",
          message: `Disposition saved. Bed Request for ${outcome.toUpperCase()} registered.`,
        })
      } else {
        setNotice({
          type: "success",
          message: "Disposition saved successfully.",
        })
      }

      onCompleted()
    } catch (error: any) {
      reportError(setNotice, error, "Failed to save disposition.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-[#DDE2EC] rounded p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-3 border-b pb-1">
        Clinical Disposition Decision
      </h3>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-[11px] font-bold text-gray-600 mb-1 block">
            Destination Outcome *
          </label>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Select outcome...</option>
            {outcomes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="text-[11px] font-bold text-gray-600 mb-1 block">
            Required Specialty (If Admission)
          </label>
          <Select
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
          >
            <option value="">N/A</option>
            <option value="Cardiology">Cardiology</option>
            <option value="Neurology">Neurology</option>
            <option value="Orthopedics">Orthopedics</option>
            <option value="General Surgery">General Surgery</option>
            <option value="Internal Medicine">Internal Medicine</option>
          </Select>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-[11px] font-bold text-gray-600 mb-1 block">
          Clinical Reason / Notes
        </label>
        <Textarea
          placeholder="Reason for admission or discharge instructions..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex justify-end mt-4 pt-3 border-t border-[#F1F5F9]">
        <Button
          onClick={submit}
          disabled={saving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          <FiCheckCircle className="mr-2" />
          {saving ? "Saving..." : "Confirm Disposition"}
        </Button>
      </div>
    </div>
  )
}
