import { useRef, useState } from "react"
import type { FormEvent } from "react"
import {
  FiActivity,
  FiClipboard,
  FiMic,
  FiSquare,
  FiTarget,
  FiUser,
} from "react-icons/fi"
import {
  apiFetch,
  getCsrfToken,
  getHospitalCode,
  reportError,
} from "../lib/api"
import { API_BASE } from "../lib/constants"
import type { Notice } from "../types"

// apiFetch always sends Content-Type: application/json, which breaks a
// multipart upload -- same reasoning as ErPage.tsx's uploadConsentDocument,
// this needs a raw fetch instead.
// Whisper's ISO-639-1 codes for the languages this hospital's staff
// realistically dictate in -- pinning one beats auto-detection on a short
// clip, but only if the doctor/nurse can actually pick the language they're
// speaking.
export const TRANSCRIPTION_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "te", label: "Telugu" },
  { code: "ta", label: "Tamil" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
]

async function transcribeAudio(blob: Blob, language: string): Promise<string> {
  const formData = new FormData()
  formData.append("file", blob, "recording.webm")
  formData.append("language", language)
  const csrfToken = getCsrfToken()
  const response = await fetch(`${API_BASE}/api/ai/transcribe`, {
    method: "POST",
    credentials: "include",
    headers: {
      "X-Hospital-Code": getHospitalCode(),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
    },
    body: formData,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || "Failed to transcribe the recording.")
  }
  return payload.text || ""
}

// Saves the raw recording itself (not just the transcript) as a real
// document on the patient's chart, via the same generic document-upload
// endpoint every other file (prescriptions, scans, consent forms) already
// uses -- so it shows up on the Documents tab and is played back through
// the existing GET /api/documents/<id>/file route, no new storage path needed.
async function uploadAudioDocument(
  patientId: string,
  blob: Blob,
  transcript: string,
  admissionId?: number,
): Promise<void> {
  const formData = new FormData()
  formData.append("file", blob, "clinical-recording.webm")
  formData.append("doc_type", "clinical_audio_note")
  formData.append("ocr_text", transcript)
  if (admissionId) formData.append("admission_id", String(admissionId))
  const csrfToken = getCsrfToken()
  const response = await fetch(
    `${API_BASE}/api/patients/${patientId}/documents`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Hospital-Code": getHospitalCode(),
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      body: formData,
    },
  )
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || "Failed to save the audio recording.")
  }
}

// Shared "Add Evaluation & Treatment" editor -- used by the Clinical chart
// (PatientChart.tsx) and the ICU department page (ICU.tsx) so both edit the
// exact same real backend fields through one UI instead of two.
export default function AddEvaluationModal({
  patientId,
  admissionId,
  setNotice,
  onClose,
  onSaved,
}: {
  patientId: string
  admissionId?: number
  setNotice: (n: Notice | null) => void
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState<"doctor" | "nurse" | "">("")
  const [doctorName, setDoctorName] = useState("")
  const [bp, setBp] = useState("")
  const [pulse, setPulse] = useState("")
  const [temperature, setTemperature] = useState("")
  const [spo2, setSpo2] = useState("")
  const [respiratoryRate, setRespiratoryRate] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [note, setNote] = useState("")
  const [treatmentPlan, setTreatmentPlan] = useState("")
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("en")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  // Held here, not uploaded yet -- the recording only becomes part of the
  // patient's chart when the whole evaluation is actually saved (Save to
  // Chart), same as every other field in this form. Re-recording replaces it;
  // closing the modal without saving discards it.
  const pendingAudioBlobRef = useRef<Blob | null>(null)
  const [hasPendingAudio, setHasPendingAudio] = useState(false)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        })
        pendingAudioBlobRef.current = blob
        setHasPendingAudio(true)
        setTranscribing(true)
        try {
          const text = await transcribeAudio(blob, transcriptionLanguage)
          if (text.trim()) {
            setNote((prev) =>
              prev.trim() ? `${prev.trim()}\n${text.trim()}` : text.trim(),
            )
          } else {
            setNotice({
              type: "warning",
              message:
                "Recording didn't produce any transcribable speech. The audio will still be saved with this evaluation.",
            })
          }
        } catch (error: any) {
          reportError(
            setNotice,
            error,
            "Failed to transcribe the recording. The audio will still be saved with this evaluation.",
          )
        } finally {
          setTranscribing(false)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setNotice({
        type: "error",
        message: "Microphone access was denied or is unavailable.",
      })
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) {
      setNotice({ type: "error", message: "Evaluation notes are required." })
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/patients/${patientId}/notes`, {
        method: "POST",
        body: JSON.stringify({
          admission_id: admissionId,
          doctor_name: doctorName.trim() || undefined,
          note: note.trim(),
          treatment_plan: treatmentPlan.trim() || undefined,
          role: role || undefined,
          diagnosis: diagnosis.trim() || undefined,
          vitals: {
            bp: bp.trim() || undefined,
            pulse: pulse.trim() || undefined,
            temperature: temperature.trim() || undefined,
            spo2: spo2.trim() || undefined,
            respiratory_rate: respiratoryRate.trim() || undefined,
          },
        }),
      })
      // The recording only becomes part of the chart here, alongside the
      // note it was dictated into -- not the moment "Stop" was pressed.
      if (pendingAudioBlobRef.current) {
        try {
          await uploadAudioDocument(
            patientId,
            pendingAudioBlobRef.current,
            note.trim(),
            admissionId,
          )
        } catch (error: any) {
          reportError(
            setNotice,
            error,
            "Evaluation saved, but the recording failed to save -- try recording again.",
          )
          return
        }
      }
      onSaved()
    } catch (error: any) {
      reportError(setNotice, error, "Failed to save this evaluation.")
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
              Add Evaluation &amp; Treatment
            </h3>
            <p className="text-[11px] text-white/75 mt-0.5">
              Record today's clinical round -- vitals, diagnosis, evaluation,
              and treatment plan in one place.
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
            {/* Section 1: Who */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                <FiUser aria-hidden /> Recorded By
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    Role
                  </label>
                  <div className="flex gap-1.5">
                    {(["doctor", "nurse"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(role === r ? "" : r)}
                        className={`flex-1 px-3 py-2 rounded border text-[12px] font-semibold capitalize transition-colors ${
                          role === r
                            ? "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                            : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    Name (optional)
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="Doctor / nurse name"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Vitals */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                <FiActivity aria-hidden /> Vitals{" "}
                <span className="text-[10px] font-normal text-[#94A3B8] normal-case">
                  (optional)
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    BP
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="120/80"
                    value={bp}
                    onChange={(e) => setBp(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    Pulse
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="78 bpm"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    Temp
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="98.6°F"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    SpO2
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="97%"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    Resp. Rate
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="16/min"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Clinical evaluation */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                <FiClipboard aria-hidden /> Clinical Evaluation
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-medium text-[#64748B] block mb-1">
                    Diagnosis / Impression (optional)
                  </label>
                  <input
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    placeholder="e.g. Improving pneumonia, stable post-op day 2"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                    <label className="text-[11px] font-medium text-[#64748B]">
                      Evaluation Notes *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={transcriptionLanguage}
                        onChange={(e) =>
                          setTranscriptionLanguage(e.target.value)
                        }
                        disabled={recording || transcribing}
                        className="border border-[#DDE2EC] rounded text-[11px] font-medium text-[#64748B] py-1 px-1.5 bg-white disabled:opacity-60"
                        title="Language spoken in the recording"
                      >
                        {TRANSCRIPTION_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={recording ? stopRecording : startRecording}
                        disabled={transcribing}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          recording
                            ? "bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]"
                            : "bg-[#EFF6FF] text-[#1B4FD8] border border-[#BFDBFE] hover:bg-[#DBEAFE]"
                        } disabled:opacity-60`}
                      >
                        {recording ? (
                          <>
                            <FiSquare aria-hidden /> Stop
                            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] animate-pulse" />
                          </>
                        ) : transcribing ? (
                          "Transcribing..."
                        ) : (
                          <>
                            <FiMic aria-hidden />{" "}
                            {hasPendingAudio ? "Re-record" : "Record"}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Today's clinical evaluation / observations... or click Record to dictate"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border border-[#DDE2EC] p-2 rounded"
                    required
                  />
                  {hasPendingAudio && !recording && !transcribing && (
                    <p className="text-[10.5px] text-[#15803D] mt-1 flex items-center gap-1">
                      <FiMic aria-hidden /> Recording ready -- will be saved
                      with this evaluation when you click "Save to Chart".
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 4: Treatment plan */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                <FiTarget aria-hidden /> Treatment Plan{" "}
                <span className="text-[10px] font-normal text-[#94A3B8] normal-case">
                  (optional)
                </span>
              </div>
              <textarea
                rows={3}
                placeholder="Today's treatment plan -- medication changes, procedures, next steps..."
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
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
              {saving ? "Saving..." : "✓ Save to Chart"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
