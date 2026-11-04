import { useState } from "react"
import type { FormEvent } from "react"
import { FiPlus, FiTarget, FiTrash2, FiX } from "react-icons/fi"
import { apiFetch, reportError } from "../lib/api"
import type { Notice } from "../types"

type CarePlanProblem = {
  id: string
  problem: string
  goal?: string | null
  status: "active" | "resolved"
  target_date?: string | null
  notes?: string | null
}

type CarePlanRow = {
  problems: CarePlanProblem[]
  narrative?: string | null
} | null

function newProblemRow(): CarePlanProblem {
  return {
    id: crypto.randomUUID(),
    problem: "",
    goal: "",
    status: "active",
    target_date: "",
    notes: "",
  }
}

// Create/edit the patient's one active care plan -> PUT /api/clinical/<patientId>/care-plan
// (modules/clinical/routes.py). Upsert in place -- there is no revision history,
// same trade-off the ICU flowsheet makes.
export default function EditCarePlanModal({
  patientId,
  carePlan,
  setNotice,
  onClose,
  onSaved,
}: {
  patientId: string
  carePlan: CarePlanRow
  setNotice: (n: Notice | null) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [problems, setProblems] = useState<CarePlanProblem[]>(
    carePlan?.problems?.length
      ? carePlan.problems.map((p) => ({ ...p }))
      : [newProblemRow()],
  )
  const [narrative, setNarrative] = useState(carePlan?.narrative || "")
  const [saving, setSaving] = useState(false)

  const updateProblem = (id: string, patch: Partial<CarePlanProblem>) => {
    setProblems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    )
  }

  const removeProblem = (id: string) => {
    setProblems((prev) => prev.filter((p) => p.id !== id))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const cleaned = problems
      .map((p) => ({ ...p, problem: p.problem.trim() }))
      .filter((p) => p.problem)
    if (cleaned.length === 0 && !narrative.trim()) {
      setNotice({
        type: "error",
        message: "Add at least one problem or a plan narrative.",
      })
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/clinical/${patientId}/care-plan`, {
        method: "PUT",
        body: JSON.stringify({
          problems: cleaned,
          narrative: narrative.trim() || undefined,
          status: "active",
        }),
      })
      onSaved()
    } catch (error: any) {
      reportError(setNotice, error, "Failed to save the care plan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-[#DDE2EC] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-[#1B4FD8] text-white px-5 py-3.5 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-[14px]">
              {carePlan ? "Edit Care Plan" : "New Care Plan"}
            </h3>
            <p className="text-[11px] text-white/75 mt-0.5">
              Active problems, goals, and the overall plan narrative for this
              patient.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg flex-shrink-0"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-[12px]">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  <FiTarget aria-hidden /> Problems &amp; Goals
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setProblems((prev) => [...prev, newProblemRow()])
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE] hover:bg-[#DBEAFE]"
                >
                  <FiPlus aria-hidden /> Add Problem
                </button>
              </div>

              <div className="space-y-2">
                {problems.map((p) => (
                  <div
                    key={p.id}
                    className="border border-[#DDE2EC] rounded p-2.5 space-y-2 relative"
                  >
                    <button
                      type="button"
                      onClick={() => removeProblem(p.id)}
                      className="absolute top-2 right-2 text-[#94A3B8] hover:text-[#DC2626]"
                      aria-label="Remove problem"
                    >
                      <FiTrash2 aria-hidden />
                    </button>
                    <div className="grid grid-cols-2 gap-2 pr-6">
                      <div>
                        <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                          Problem
                        </label>
                        <input
                          className="w-full border border-[#DDE2EC] p-2 rounded"
                          placeholder="e.g. Uncontrolled hypertension"
                          value={p.problem}
                          onChange={(e) =>
                            updateProblem(p.id, { problem: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                          Goal (optional)
                        </label>
                        <input
                          className="w-full border border-[#DDE2EC] p-2 rounded"
                          placeholder="e.g. BP under 140/90 by next review"
                          value={p.goal || ""}
                          onChange={(e) =>
                            updateProblem(p.id, { goal: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                          Status
                        </label>
                        <div className="flex gap-1.5">
                          {(["active", "resolved"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => updateProblem(p.id, { status: s })}
                              className={`flex-1 px-2 py-1.5 rounded border text-[11px] font-semibold capitalize transition-colors ${
                                p.status === s
                                  ? "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                                  : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                          Target Date (optional)
                        </label>
                        <input
                          type="date"
                          className="w-full border border-[#DDE2EC] p-2 rounded"
                          value={p.target_date || ""}
                          onChange={(e) =>
                            updateProblem(p.id, { target_date: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {problems.length === 0 && (
                  <p className="text-[11.5px] text-[#94A3B8] flex items-center gap-1">
                    <FiX aria-hidden /> No problems added -- click "Add Problem"
                    or leave blank and just record a plan narrative.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                Plan Narrative (optional)
              </label>
              <textarea
                rows={4}
                placeholder="Overall plan of care -- how the problems above are being managed together..."
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                className="w-full border border-[#DDE2EC] p-2 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#DDE2EC] bg-[#F8FAFC] flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-[#DDE2EC] rounded bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 bg-[#1B4FD8] text-white font-bold rounded disabled:opacity-60"
            >
              {saving ? "Saving..." : "✓ Save Care Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
