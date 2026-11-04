import svgPaths from "../imports/symptomCheck/svg-fnqgu3u35h"

// SymptoMap AI "Check Symptoms" wizard, restyled to match the rest of the
// HMS dashboard (src/components/shared.tsx: Card/MetricCard/Btn/Input) --
// flat bg-white boxes with a thin #DDE2EC border and small radius, no drop
// shadows, dense 11-13px text, uppercase tracked micro-labels. The original
// Figma Make export used rounded-[18px] cards with soft box-shadows and
// `font-['Inter:Extra_Bold',...]` classes -- that literal string isn't a
// real font family, so it was silently falling back to the browser's
// generic sans-serif instead of the Inter webfont the rest of the app uses.

function getSeverityLabel(v: number) {
  if (v <= 3) return "Mild"
  if (v <= 6) return "Moderate"
  return "Severe"
}

function getSeverityColor(v: number) {
  if (v <= 3) return "#16A34A"
  if (v <= 6) return "#D97706"
  return "#DC2626"
}

function StepNum({ n }: { n: number }) {
  return (
    <div className="flex items-center justify-center shrink-0 size-6 rounded bg-[#1B4FD8] text-white">
      <span className="text-[11px] font-semibold">{n}</span>
    </div>
  )
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1.5 rounded border text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
        active
          ? "bg-[#E8EDF5] border-[#1B4FD8] text-[#1E3A6E]"
          : "bg-white border-[#DDE2EC] text-[#64748B] hover:border-[#94A3B8]"
      }`}
    >
      {label}
    </button>
  )
}

const CONTEXT_OPTIONS = [
  "Fatigue",
  "Nausea",
  "Dizziness",
  "Fever",
  "Recent stress",
  "Changed sleep",
  "New exercise",
  "Dietary changes",
  "Screen time",
  "Long sitting",
  "Hydration concerns",
  "Travel recently",
]

export function Step1({
  symptoms,
  setSymptoms,
  severity,
  setSeverity,
  duration,
  setDuration,
  durationOptions,
  context,
  toggleContext,
}: {
  symptoms: string
  setSymptoms: (v: string) => void
  severity: number
  setSeverity: (v: number) => void
  duration: string
  setDuration: (v: string) => void
  durationOptions: string[]
  context: string[]
  toggleContext: (v: string) => void
}) {
  const pct = ((severity - 1) / 9) * 100
  const severityLabel = getSeverityLabel(severity)
  const severityColor = getSeverityColor(severity)

  return (
    <div className="bg-white border border-[#DDE2EC] rounded p-4 w-full">
      <div className="flex gap-2.5 items-start pb-4 w-full">
        <StepNum n={1} />
        <div className="flex flex-col items-start">
          <p className="text-sm font-semibold text-gray-900">
            Describe your symptoms
          </p>
          <p className="text-[11.5px] text-[#64748B] mt-0.5">
            Tell us what you are experiencing in your own words
          </p>
        </div>
      </div>

      <div className="w-full">
        <textarea
          value={symptoms}
          onChange={(e) => setSymptoms(e.target.value)}
          maxLength={1000}
          placeholder="e.g. Sharp pain on the right side of my head that gets worse with light. Started this morning…"
          className="bg-white border border-[#DDE2EC] w-full h-[120px] min-h-[120px] px-3 py-2.5 rounded resize-none outline-none text-[12.5px] text-gray-800 leading-relaxed placeholder:text-[#94A3B8] focus:border-[#1B4FD8]"
        />
        <div className="flex justify-end mt-1">
          <p className="text-[11px] text-[#94A3B8]">{symptoms.length} / 1000</p>
        </div>
      </div>

      <div className="flex flex-col items-start mt-4 w-full">
        <div className="flex items-end justify-between w-full pb-2">
          <p className="text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase">
            Pain / Severity
          </p>
          <div className="flex items-baseline gap-0.5">
            <p
              className="text-xl font-semibold leading-none"
              style={{ color: severityColor }}
            >
              {severity}
            </p>
            <p className="text-[12px] text-[#94A3B8]">/10</p>
          </div>
        </div>
        <div className="relative w-full h-5">
          <div className="absolute top-[9px] left-0 right-0 h-1 rounded bg-[#EEF2F7]" />
          <div
            className="absolute top-[9px] left-0 h-1 rounded"
            style={{ width: `${pct}%`, backgroundColor: severityColor }}
          />
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          />
        </div>
        <div className="flex items-center justify-between pt-1.5 w-full">
          <p className="text-[11px] text-[#94A3B8]">1 — Mild</p>
          <p
            className="text-[11px] font-semibold"
            style={{ color: severityColor }}
          >
            {severityLabel}
          </p>
          <p className="text-[11px] text-[#94A3B8]">10 — Severe</p>
        </div>
      </div>

      <div className="flex flex-col items-start mt-4 w-full">
        <p className="text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase">
          How long?
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {durationOptions.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              active={duration === opt}
              onClick={() => setDuration(opt)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-start mt-4 w-full">
        <p className="text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase">
          Other context{" "}
          <span className="normal-case font-normal">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {CONTEXT_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              active={context.includes(opt)}
              onClick={() => toggleContext(opt)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Deliberately just the 8 regions the body map can actually draw (General +
// the 7 zones) rather than the backend's full ~19-entry list -- see the note
// above PART_GROUPS. A person clicking through picks a general area; the
// exact match (e.g. "Eyes") still surfaces via the AI's own text detection
// and shows up correctly in the summary/body-map caption even though it
// isn't one of these chips.
export function Step2({
  bodyRegion,
  svgId,
  regions,
  onSelectRegion,
}: {
  bodyRegion: string
  svgId: string
  regions: { name: string ;svg_id: string }[]
  onSelectRegion: (regionName: string) => void
}) {
  const generalRegion = regions.find((r) => r.svg_id === "full_body")
  const activePart = groupForSvgId(svgId)
  const primaryName = activePart
    ? resolvePartRegion(regions, activePart)?.name
    : generalRegion?.name
  const isFinerThanChips = !!primaryName && bodyRegion !== primaryName

  return (
    <div className="bg-white border border-[#DDE2EC] rounded p-4 w-full">
      <div className="flex gap-2.5 items-start w-full">
        <StepNum n={2} />
        <div className="flex flex-col items-start">
          <p className="text-sm font-semibold text-gray-900">
            Select body region
          </p>
          <p className="text-[11.5px] text-[#64748B] mt-0.5">
            Click the figure on the right, or choose a general area below
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {generalRegion && (
          <Chip
            label={generalRegion.name}
            active={svgId === "full_body"}
            onClick={() => onSelectRegion(generalRegion.name)}
          />
        )}
        {(Object.keys(PART_GROUPS) as BodyPart[]).map((part) => {
          const match = resolvePartRegion(regions, part)
          if (!match) return null
          return (
            <Chip
              key={part}
              label={PART_LABELS[part]}
              active={activePart === part}
              onClick={() => onSelectRegion(match.name)}
            />
          )
        })}
      </div>
      {isFinerThanChips && (
        <p className="text-[11px] text-[#64748B] mt-2">
          AI-detected region:{" "}
          <span className="font-semibold text-[#1B4FD8]">{bodyRegion}</span>
        </p>
      )}
    </div>
  )
}

function SummaryCell({
  label,
  value,
  active,
}: {
  label: string
  value: string
  active?: boolean
}) {
  return (
    <div
      className={`flex flex-col items-start px-2.5 py-2 rounded border ${
        active
          ? "bg-[#E8EDF5] border-[#C7D2E7]"
          : "bg-[#F8FAFC] border-[#DDE2EC]"
      }`}
    >
      <p className="text-[10px] font-semibold text-[#64748B] tracking-wider uppercase">
        {label}
      </p>
      <p
        className={`text-[12.5px] font-medium mt-0.5 ${
          active ? "text-gray-900" : "text-[#64748B]"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function Step3({
  symptoms,
  severity,
  duration,
  bodyRegion,
  onAnalyze,
  loading,
}: {
  symptoms: string
  severity: number
  duration: string
  bodyRegion: string
  onAnalyze: () => void
  loading: boolean
}) {
  const canAnalyse = symptoms.trim().length >= 10 && !loading
  const severityLabel = getSeverityLabel(severity)

  return (
    <div className="bg-white border border-[#DDE2EC] rounded p-4 w-full">
      <div className="flex gap-2.5 items-start w-full">
        <StepNum n={3} />
        <div className="flex flex-col items-start">
          <p className="text-sm font-semibold text-gray-900">
            Ready to analyse
          </p>
          <p className="text-[11.5px] text-[#64748B] mt-0.5">
            Review your inputs on the right, then click Analyse Symptoms
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3 w-full">
        <SummaryCell
          label="Symptoms"
          value={
            symptoms.trim().length > 0
              ? symptoms.slice(0, 40) + (symptoms.length > 40 ? "…" : "")
              : "Not described yet"
          }
          active={symptoms.trim().length > 0}
        />
        <SummaryCell
          label="Severity"
          value={`${severity}/10 — ${severityLabel}`}
          active
        />
        <SummaryCell label="Duration" value={duration} active />
        <SummaryCell label="Body Region" value={bodyRegion} active />
      </div>

      <div className="mt-4 w-full">
        <button
          type="button"
          disabled={!canAnalyse}
          onClick={onAnalyze}
          className={`w-full flex gap-2 h-10 items-center justify-center rounded font-semibold text-[13px] transition-colors ${
            canAnalyse
              ? "bg-[#1B4FD8] text-white hover:bg-[#1740B4] cursor-pointer"
              : "bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 17 17" fill="none">
            <path d={svgPaths.p25519080} fill="currentColor" />
            <path d={svgPaths.p16fcc8c0} fill="currentColor" opacity="0.7" />
          </svg>
          {loading ? "Analysing…" : "Analyse Symptoms"}
          <svg width="13" height="13" viewBox="0 0 17 17" fill="none">
            <path
              d={svgPaths.p196e6ab8}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.56"
            />
          </svg>
        </button>
        {!canAnalyse && !loading && (
          <p className="text-[11.5px] text-[#64748B] text-center mt-2">
            Please describe your symptoms in Step 1 to continue
          </p>
        )}
        <p className="text-[11px] text-[#94A3B8] text-center mt-3">
          For educational purposes only — not a medical diagnosis. Always
          consult a qualified healthcare professional.
        </p>
      </div>
    </div>
  )
}

// Anatomical highlighter: each body part lights up in HMS blue only when it
// matches the region the Qwen model detected from the description (or the
// chip picked by hand). `svgId` is the detected/selected Region.svg_id --
// distinct from the display name, since e.g. "shoulders" and "hands" both
// map onto the arms path. Unmatched parts stay a muted gray-blue.
const HIGHLIGHT = "#1B4FD8"
const MUTED = "#DCE6F5"

function partFill(svgId: string, part: string[]) {
  return part.includes(svgId) ? HIGHLIGHT : MUTED
}

// Each visual part covers several backend svg_ids (e.g. the head ellipse
// stands in for head/eyes/ears/nose/mouth) -- clicking it picks whichever of
// those the caller's region list actually has, preferring the first
// (most-general) id in the group. This is also the set Step 2's chips are
// built from: the backend's ~19-entry region list exists so free-text
// descriptions can be matched precisely by the AI (see SymptomAI.tsx's
// detect-region call), but a person clicking through a form doesn't need
// "Eyes" and "Ears" as separate manual choices when the map itself can only
// show 7 zones -- offering 19 flat chips just makes the picker slower to
// scan without the map being able to visually confirm the finer ones.
export const PART_GROUPS = {
  head: ["head", "eyes", "ears", "nose", "mouth"],
  neck: ["neck"],
  chest: ["chest", "shoulders", "upper_back"],
  abdomen: ["abdomen"],
  arms: ["arms", "shoulders", "hands"],
  hips: ["hips", "lower_back"],
  legs: ["thighs", "knees", "lower_legs", "feet"],
} as const

export type BodyPart = keyof typeof PART_GROUPS

export function groupForSvgId(svgId: string): BodyPart | null {
  for (const key of Object.keys(PART_GROUPS) as BodyPart[]) {
    if ((PART_GROUPS[key] as readonly string[]).includes(svgId)) return key
  }
  return null
}

export function resolvePartRegion(
  regions: { name: string ;svg_id: string }[],
  part: BodyPart,
) {
  const ids = PART_GROUPS[part]
  return (
    ids.map((id) => regions.find((r) => r.svg_id === id)).find(Boolean) ||
    regions.find((r) => r.svg_id === "full_body")
  )
}

const PART_LABELS: Record<BodyPart, string> = {
  head: "Head",
  neck: "Neck",
  chest: "Chest",
  abdomen: "Abdomen",
  arms: "Arms",
  hips: "Hips",
  legs: "Legs",
}

export function BodyMap({
  bodyRegion,
  svgId,
  regions,
  onSelectRegion,
  detecting,
}: {
  bodyRegion: string
  svgId: string
  regions: { name: string ;svg_id: string }[]
  onSelectRegion: (regionName: string) => void
  detecting?: boolean
}) {
  const head = partFill(svgId, [...PART_GROUPS.head, "full_body"])
  const neck = partFill(svgId, [...PART_GROUPS.neck, "full_body"])
  const chest = partFill(svgId, [...PART_GROUPS.chest, "full_body"])
  const abdomen = partFill(svgId, [...PART_GROUPS.abdomen, "full_body"])
  const arms = partFill(svgId, [...PART_GROUPS.arms, "full_body"])
  const hips = partFill(svgId, [...PART_GROUPS.hips, "full_body"])
  const legs = partFill(svgId, [...PART_GROUPS.legs, "full_body"])

  const selectPart = (group: BodyPart) => {
    const match = resolvePartRegion(regions, group)
    if (match) onSelectRegion(match.name)
  }

  const partClass =
    "cursor-pointer transition-[fill,opacity] duration-200 hover:opacity-80"

  return (
    <div className="bg-white border border-[#DDE2EC] rounded p-4 w-full">
      <div className="flex items-center justify-between w-full">
        <p className="text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase">
          Body Map
        </p>
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${
            detecting
              ? "bg-[#FEF3C7] text-[#B45309]"
              : "bg-[#E8EDF5] text-[#1E3A6E]"
          }`}
        >
          {detecting && (
            <span className="relative flex size-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D97706] opacity-75" />
              <span className="relative inline-flex rounded-full size-1.5 bg-[#D97706]" />
            </span>
          )}
          {detecting ? "AI detecting…" : `${bodyRegion} ✓`}
        </div>
      </div>

      <div className="mt-3 h-[240px] relative w-full flex items-center justify-center">
        <svg
          viewBox="0 0 200 400"
          width="120"
          height="240"
          aria-label={`Body map, ${bodyRegion} highlighted. Click a body part to select it.`}
        >
          <g className="transition-[fill] duration-500 ease-out">
            <ellipse
              cx="100"
              cy="40"
              rx="30"
              ry="35"
              fill={head}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("head")}
            >
              <title>Head</title>
            </ellipse>
            <rect
              x="88"
              y="70"
              width="24"
              height="20"
              fill={neck}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("neck")}
            >
              <title>Neck</title>
            </rect>
            <path
              d="M60 90 Q50 95 45 130 L50 180 Q55 200 60 200 L140 200 Q145 200 150 180 L155 130 Q150 95 140 90 Z"
              fill={chest}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("chest")}
            >
              <title>Chest</title>
            </path>
            <path
              d="M60 200 L60 250 Q65 260 75 260 L125 260 Q135 260 140 250 L140 200 Z"
              fill={abdomen}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("abdomen")}
            >
              <title>Abdomen</title>
            </path>
            <path
              d="M45 95 Q25 100 20 150 L15 220 Q15 230 25 230 L35 230 Q45 230 45 220 L50 150 Z"
              fill={arms}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("arms")}
            >
              <title>Arms</title>
            </path>
            <path
              d="M155 95 Q175 100 180 150 L185 220 Q185 230 175 230 L165 230 Q155 230 155 220 L150 150 Z"
              fill={arms}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("arms")}
            >
              <title>Arms</title>
            </path>
            <path
              d="M75 260 L70 280 Q65 290 75 290 L125 290 Q135 290 130 280 L125 260 Z"
              fill={hips}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("hips")}
            >
              <title>Hips</title>
            </path>
            <path
              d="M75 290 L70 370 Q68 385 80 385 L95 385 Q100 385 100 370 L100 290 Z"
              fill={legs}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("legs")}
            >
              <title>Legs</title>
            </path>
            <path
              d="M100 290 L100 370 Q100 385 105 385 L120 385 Q132 385 130 370 L125 290 Z"
              fill={legs}
              stroke="#8FA6C4"
              strokeWidth="2"
              className={partClass}
              onClick={() => selectPart("legs")}
            >
              <title>Legs</title>
            </path>
          </g>
        </svg>
      </div>

      <p className="text-[11.5px] text-[#64748B] text-center w-full pt-2 border-t border-[#F1F5F9]">
        <span className="font-semibold text-[#1B4FD8]">{bodyRegion}</span>
        {detecting
          ? " — AI is reading your description…"
          : " selected — click a body part above, or a chip in step 2, to change it"}
      </p>
    </div>
  )
}

export function SummaryPanel({
  severity,
  duration,
  bodyRegion,
}: {
  severity: number
  duration: string
  bodyRegion: string
}) {
  const severityColor = getSeverityColor(severity)
  const dots = Array.from({ length: 10 }, (_, i) => i < severity)

  return (
    <div className="bg-white border border-[#DDE2EC] rounded p-4 w-full">
      <p className="text-[10.5px] font-semibold text-[#64748B] tracking-wider uppercase">
        Your summary
      </p>
      <div className="flex flex-col gap-2 mt-3 w-full">
        <div className="flex items-center justify-between w-full">
          <p className="text-[12px] text-[#64748B]">Severity</p>
          <div className="flex gap-1.5 items-center">
            <div className="flex gap-0.5 items-start">
              {dots.map((filled, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-sm w-3"
                  style={{
                    backgroundColor: filled ? severityColor : "#EEF2F7",
                  }}
                />
              ))}
            </div>
            <p
              className="text-[11.5px] font-semibold min-w-[28px]"
              style={{ color: severityColor }}
            >
              {severity}/10
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between w-full">
          <p className="text-[12px] text-[#64748B]">Duration</p>
          <span className="bg-[#E8EDF5] text-[#1E3A6E] px-1.5 py-0.5 rounded text-[11px] font-medium">
            {duration}
          </span>
        </div>
        <div className="flex items-center justify-between w-full">
          <p className="text-[12px] text-[#64748B]">Region</p>
          <span className="bg-[#E8EDF5] text-[#1E3A6E] px-1.5 py-0.5 rounded text-[11px] font-medium">
            {bodyRegion}
          </span>
        </div>
      </div>
    </div>
  )
}

export function Disclaimer() {
  return (
    <div className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] flex gap-2.5 items-start px-3.5 py-2.5 rounded w-full">
      <span className="font-bold text-sm shrink-0">⚠</span>
      <p className="text-[11.5px] leading-snug">
        Educational tool only. Not a medical diagnosis. Always consult a
        healthcare professional.
      </p>
    </div>
  )
}
