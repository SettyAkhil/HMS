import { useEffect, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import MarkdownReport from "./MarkdownReport"
import {
  Step1,
  Step2,
  Step3,
  BodyMap,
  SummaryPanel,
  Disclaimer,
} from "./SymptomCheckWizard"
import { Button } from "./ui"
import { SYMPTOM_API_BASE } from "../lib/constants"
import { apiFetch, reportError, withAuthHeaders } from "../lib/api"
import type { Notice } from "../types"

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>
  onNavigate?: (page: string, extraData?: any) => void
}

type Doctor = {
  id: number
  doctor_name: string
  department: string
  consultation_fee: number
  status: string
}

type Region = {
  name: string
  keywords: string[]
  color: string
  icon: string
  svg_id: string
}

type SymptomMetaResponse = {
  context_tags?: string[]
  duration_options?: string[]
  regions?: Region[]
}

type UrgencyLevel = "Routine" | "Urgent" | "Emergency"

type SymptomAnalyzeResponse = {
  response?: string
  detected_region?: string | null
  urgency_level?: UrgencyLevel | null
  used_fallback?: boolean
  model_error?: string | null
}

const FALLBACK_DURATIONS = [
  "Just started (today)",
  "A few days",
  "About a week",
  "1-2 weeks",
  "2-4 weeks",
  "More than a month",
  "Comes and goes",
  "Recurring over time",
]

// Mirrors the backend's /api/symptom-ai/meta region list exactly, so body
// map clicks and the region chip list work fully offline -- not just when
// that endpoint is reachable (it 401s without a real backend session; see
// AGENTS.md). Real regions from the backend still take over once it loads.
const FALLBACK_REGIONS: Region[] = [
  {
    name: "General / Full Body",
    keywords: ["all over", "everywhere", "body"],
    color: "#8BC8B8",
    icon: "🧍",
    svg_id: "full_body",
  },
  {
    name: "Head",
    keywords: ["head", "headache", "scalp", "migraine"],
    color: "#A8DADC",
    icon: "🤕",
    svg_id: "head",
  },
  {
    name: "Eyes",
    keywords: ["eye", "eyes", "vision", "blur"],
    color: "#457B9D",
    icon: "👁️",
    svg_id: "eyes",
  },
  {
    name: "Ears",
    keywords: ["ear", "ears", "hearing", "ringing"],
    color: "#1D3557",
    icon: "👂",
    svg_id: "ears",
  },
  {
    name: "Nose / Sinus",
    keywords: ["nose", "sinus", "smell", "congestion"],
    color: "#E63946",
    icon: "👃",
    svg_id: "nose",
  },
  {
    name: "Mouth / Throat",
    keywords: ["mouth", "throat", "swallow", "teeth"],
    color: "#F4A261",
    icon: "👄",
    svg_id: "mouth",
  },
  {
    name: "Neck",
    keywords: ["neck", "stiff neck", "cervical"],
    color: "#2A9D8F",
    icon: "🦒",
    svg_id: "neck",
  },
  {
    name: "Chest",
    keywords: ["chest", "heart", "lungs", "breathing"],
    color: "#E76F51",
    icon: "🫁",
    svg_id: "chest",
  },
  {
    name: "Abdomen",
    keywords: ["stomach", "belly", "gut", "abdomen", "nausea"],
    color: "#E9C46A",
    icon: "🤢",
    svg_id: "abdomen",
  },
  {
    name: "Shoulders",
    keywords: ["shoulder", "shoulders", "rotator cuff"],
    color: "#264653",
    icon: "🤷",
    svg_id: "shoulders",
  },
  {
    name: "Arms",
    keywords: ["arm", "arms", "bicep", "tricep", "elbow"],
    color: "#F4A261",
    icon: "💪",
    svg_id: "arms",
  },
  {
    name: "Hands / Wrists",
    keywords: ["hand", "hands", "wrist", "fingers"],
    color: "#E76F51",
    icon: "🖐️",
    svg_id: "hands",
  },
  {
    name: "Upper Back",
    keywords: ["upper back", "spine", "shoulder blades"],
    color: "#2A9D8F",
    icon: "🔙",
    svg_id: "upper_back",
  },
  {
    name: "Lower Back",
    keywords: ["lower back", "lumbar", "sciatica"],
    color: "#E63946",
    icon: "⚡",
    svg_id: "lower_back",
  },
  {
    name: "Hips / Pelvis",
    keywords: ["hip", "hips", "pelvis", "groin"],
    color: "#457B9D",
    icon: "🦴",
    svg_id: "hips",
  },
  {
    name: "Thighs",
    keywords: ["thigh", "thighs", "quads", "hamstrings"],
    color: "#1D3557",
    icon: "🦵",
    svg_id: "thighs",
  },
  {
    name: "Knees",
    keywords: ["knee", "knees", "patella", "joint"],
    color: "#A8DADC",
    icon: "🦿",
    svg_id: "knees",
  },
  {
    name: "Lower Legs / Calves",
    keywords: ["calf", "calves", "shin", "shins"],
    color: "#E9C46A",
    icon: "🦵",
    svg_id: "lower_legs",
  },
  {
    name: "Feet / Ankles",
    keywords: ["foot", "feet", "ankle", "ankles", "toes"],
    color: "#8BC8B8",
    icon: "🦶",
    svg_id: "feet",
  },
]

export default function SymptomAiPage({ setNotice, onNavigate }: Props) {
  const [description, setDescription] = useState("")
  const [bodyRegion, setBodyRegion] = useState("General / Full Body")
  const [intensity, setIntensity] = useState(5)
  const [duration, setDuration] = useState(FALLBACK_DURATIONS[0])
  const [contextTags, setContextTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [detectingRegion, setDetectingRegion] = useState(false)
  const [responseText, setResponseText] = useState("")
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel | null>(null)
  const [suggestedDoctors, setSuggestedDoctors] = useState<Doctor[]>([])
  const [durationOptions, setDurationOptions] =
    useState<string[]>(FALLBACK_DURATIONS)
  const [regions, setRegions] = useState<Region[]>(FALLBACK_REGIONS)

  const fetchSuggestedDoctors = async (region: string) => {
    try {
      const data = await apiFetch<{ doctors?: Doctor[] }>(
        `/api/op/doctors/suggest?region=${encodeURIComponent(region)}`,
      )
      setSuggestedDoctors(data.doctors || [])
    } catch {
      setSuggestedDoctors([])
    }
  }

  useEffect(() => {
    let active = true
    fetch(`${SYMPTOM_API_BASE}/api/symptom-ai/meta`, {
      credentials: "include",
      headers: withAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Unable to load SymptoMap AI metadata.")
        return res.json() as Promise<SymptomMetaResponse>
      })
      .then((data) => {
        if (!active) return
        if (data.duration_options?.length) {
          setDurationOptions(data.duration_options)
          setDuration((prev) =>
            data.duration_options?.includes(prev)
              ? prev
              : data.duration_options?.[0] || prev,
          )
        }
        if (data.regions?.length) {
          setRegions(data.regions)
          setBodyRegion((prev) =>
            data.regions?.some((r) => r.name === prev)
              ? prev
              : data.regions?.[0]?.name || prev,
          )
        }
      })
      .catch(() => {
        setNotice({
          type: "warning",
          message:
            "SymptoMap AI metadata unavailable. Running with fallback options.",
        })
      })
    return () => {
      active = false
    }
  }, [setNotice])

  const onToggleTag = (tag: string) => {
    setContextTags((prev) =>
      prev.includes(tag)
        ? prev.filter((value) => value !== tag)
        : [...prev, tag],
    )
  }

  // Auto-detect the body region from the description as the user types
  // (Qwen-backed /api/symptom-ai/detect-region), so step 2 doesn't need to
  // be filled in by hand -- it's still a chip list underneath in case the
  // detection is wrong and needs a manual override.
  useEffect(() => {
    if (description.trim().length < 10) return
    let cancelled = false
    const debounce = setTimeout(() => {
      if (cancelled) return
      setDetectingRegion(true)
      fetch(`${SYMPTOM_API_BASE}/api/symptom-ai/detect-region`, {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders(
          { "Content-Type": "application/json" },
          "POST",
        ),
        body: JSON.stringify({ description }),
      })
        .then((res) =>
          res.ok ? res.json() as Promise<{ region?: string | null }> : null,
        )
        .then((data) => {
          if (cancelled || !data?.region) return
          if (regions.some((entry) => entry.name === data.region)) {
            setBodyRegion(data.region)
          }
        })
        .catch(() => {
          // best effort only
        })
        .finally(() => {
          if (!cancelled) setDetectingRegion(false)
        })
    }, 700)
    return () => {
      cancelled = true
      clearTimeout(debounce)
    }
  }, [description, regions])

  const analyze = async () => {
    if (description.trim().length < 10) {
      setNotice({
        type: "warning",
        message: "Please describe the sensation with at least 10 characters.",
      })
      return
    }

    const payload = {
      description: description.trim(),
      body_region: bodyRegion,
      intensity,
      duration,
      context_tags: contextTags,
      patient_info: {
        age: null,
        gender: null,
        temperature: null,
        temp_unit: "°F",
        heart_rate: null,
        blood_pressure: null,
      },
    }

    setLoading(true)
    try {
      const res = await fetch(`${SYMPTOM_API_BASE}/api/symptom-ai/analyze`, {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders(
          { "Content-Type": "application/json" },
          "POST",
        ),
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as SymptomAnalyzeResponse & {
        error?: string
      }
      if (!res.ok) {
        throw Object.assign(
          new Error(data.error || "Unable to generate wellness insights."),
          { status: res.status },
        )
      }

      const nextResponse = data.response || "No insights returned."
      const resolvedRegion = data.detected_region || bodyRegion
      setResponseText(nextResponse)
      setUrgencyLevel(
        data.urgency_level === "Urgent" || data.urgency_level === "Emergency"
          ? data.urgency_level
          : "Routine",
      )
      void fetchSuggestedDoctors(resolvedRegion)
      if (
        data.detected_region &&
        regions.some((entry) => entry.name === data.detected_region)
      ) {
        setBodyRegion(data.detected_region)
      }

      if (data.used_fallback) {
        setNotice({
          type: "warning",
          message: "SymptoMap AI returned a safety fallback response.",
        })
      } else if (data.model_error) {
        setNotice({
          type: "warning",
          message: "SymptoMap AI response was generated with model warnings.",
        })
      }
    } catch (error) {
      reportError(
        setNotice,
        error as { status?: number ;message?: string },
        "Unable to generate wellness insights.",
      )
    } finally {
      setLoading(false)
    }
  }

  const exportCurrent = async () => {
    if (!responseText) return
    try {
      const res = await fetch(`${SYMPTOM_API_BASE}/api/symptom-ai/export/pdf`, {
        method: "POST",
        credentials: "include",
        headers: withAuthHeaders(
          { "Content-Type": "application/json" },
          "POST",
        ),
        body: JSON.stringify({
          generated_at: new Date().toISOString(),
          region: bodyRegion,
          intensity,
          duration,
          description,
          response: responseText,
        }),
      })
      if (!res.ok) {
        throw new Error("Unable to generate PDF.")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `symptomap_ai_insight_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      reportError(
        setNotice,
        error as { status?: number ;message?: string },
        "Unable to export insight as PDF.",
      )
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3">
        <h1 className="text-base font-semibold text-gray-900">Symptom Check</h1>
        <p className="text-[11.5px] text-[#64748B]">
          Describe what you're feeling — the body region is detected
          automatically as you type, then click Analyse
        </p>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-3">
          <Step1
            symptoms={description}
            setSymptoms={setDescription}
            severity={intensity}
            setSeverity={setIntensity}
            duration={duration}
            setDuration={setDuration}
            durationOptions={durationOptions}
            context={contextTags}
            toggleContext={onToggleTag}
          />
          <Step2
            bodyRegion={bodyRegion}
            svgId={
              regions.find((r) => r.name === bodyRegion)?.svg_id || "full_body"
            }
            regions={regions}
            onSelectRegion={setBodyRegion}
          />
          <Step3
            symptoms={description}
            severity={intensity}
            duration={duration}
            bodyRegion={bodyRegion}
            onAnalyze={analyze}
            loading={loading}
          />
        </div>
        {/* Right column */}
        <div className="flex flex-col gap-3">
          <BodyMap
            bodyRegion={bodyRegion}
            svgId={
              regions.find((r) => r.name === bodyRegion)?.svg_id || "full_body"
            }
            regions={regions}
            onSelectRegion={setBodyRegion}
            detecting={detectingRegion}
          />
          <SummaryPanel
            severity={intensity}
            duration={duration}
            bodyRegion={bodyRegion}
          />
          <Disclaimer />
        </div>
      </div>

      {/* Results Area (Full Width Below) */}
      {(responseText || loading) && (
        <div className="px-5 pb-5 grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-[#DDE2EC] rounded flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  Wellness Insights
                  {responseText && urgencyLevel && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium normal-case tracking-normal ${
                        urgencyLevel === "Emergency"
                          ? "bg-[#FEE2E2] text-[#B91C1C]"
                          : urgencyLevel === "Urgent"
                            ? "bg-[#FEF3C7] text-[#B45309]"
                            : "bg-[#DCFCE7] text-[#15803D]"
                      }`}
                    >
                      <span
                        className={`status-dot ${
                          urgencyLevel === "Emergency"
                            ? "bg-[#DC2626]"
                            : urgencyLevel === "Urgent"
                              ? "bg-[#D97706]"
                              : "bg-[#16A34A]"
                        }`}
                      />
                      {urgencyLevel}
                    </span>
                  )}
                </span>
                {responseText && (
                  <Button variant="secondary" size="sm" onClick={exportCurrent}>
                    Export PDF
                  </Button>
                )}
              </div>
              {responseText && urgencyLevel === "Emergency" && (
                <div className="px-4 py-2.5 bg-[#FEF2F2] border-b border-[#FECACA] text-[#991B1B] text-[12.5px] font-semibold flex items-center gap-2">
                  <span>🚨</span> This looks like it may need emergency care —
                  see the "When to Seek Emergency Care" section below, and don't
                  wait to act on it.
                </div>
              )}
              {responseText && urgencyLevel === "Urgent" && (
                <div className="px-4 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A] text-[#92400E] text-[12.5px] font-semibold flex items-center gap-2">
                  <span>⚠️</span> This is flagged as urgent — plan to see a
                  doctor soon rather than waiting for a routine appointment.
                </div>
              )}
              <div className="p-4 flex-1 overflow-y-auto min-h-[300px]">
                {responseText ? (
                  <MarkdownReport text={responseText} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-[#1B4FD8] rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-[#1B4FD8] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-2 h-2 bg-[#1B4FD8] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    </div>
                    <p className="text-[12.5px] font-medium text-[#64748B] mt-3">
                      Generating personalized insights...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Doctors */}
            {suggestedDoctors.length > 0 && (
              <div className="bg-white border border-[#DDE2EC] rounded p-4">
                <h4 className="text-[10.5px] font-semibold text-[#64748B] uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                  Recommended Specialists
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {suggestedDoctors.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded border border-[#DDE2EC] hover:border-[#1B4FD8] transition-colors flex flex-col gap-2 group"
                    >
                      <div>
                        <h5 className="text-[12.5px] font-semibold text-gray-900">
                          {doc.doctor_name}
                        </h5>
                        <p className="text-[11.5px] text-[#1B4FD8] font-medium">
                          {doc.department}
                        </p>
                      </div>
                      <div className="flex gap-1.5 text-[11px] font-medium">
                        <span className="px-1.5 py-0.5 bg-[#DCFCE7] text-[#15803D] rounded">
                          Available
                        </span>
                        {doc.consultation_fee && (
                          <span className="px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] rounded">
                            Fee: ${doc.consultation_fee}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => {
                          setNotice({
                            type: "success",
                            message: `Opening Appointment Desk for ${doc.doctor_name}`,
                          })
                          onNavigate?.("registration", {
                            prefillDoctor: {
                              doctorName: doc.doctor_name,
                              department: doc.department,
                            },
                          })
                        }}
                      >
                        Book Appointment
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
