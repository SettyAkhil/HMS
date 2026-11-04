import React from "react"
import { Icon } from "./icons"

interface IntelligenceHubProps {
  navigate: (module: string) => void
}

const AI_MODULES = [
  {
    id: "dpi_ocr",
    title: "Keppler OCR",
    desc: "Full medical document intelligence platform: OCR extraction, PDF summarization, and a RAG assistant over uploaded records.",
    icon: <Icon.Reports />,
    color: "#1B4FD8",
    metric: "Qwen-powered",
  },
  {
    id: "symptom_ai",
    title: "Symptom AI",
    desc: "Interactive body map for patient symptom logging with AI-assisted preliminary insights and specialist suggestions.",
    icon: <Icon.Stethoscope />,
    color: "#16A34A",
    metric: "Qwen-powered",
  },
  {
    id: "clinical_summaries",
    title: "Clinical Summaries",
    desc: "Generate concise discharge summaries and encounter notes from long patient histories or uploaded records.",
    icon: <Icon.Reports />,
    color: "#D97706",
    metric: "Qwen-powered",
  },
  {
    id: "bulk_ai",
    title: "Bulk Patient AI",
    desc: "Upload patient record spreadsheets or documents for AI-assisted column mapping and asynchronous import.",
    icon: <Icon.Reports />,
    color: "#DC2626",
    metric: "Qwen-powered",
  },
  {
    id: "nl_filtering",
    title: "PatientReach AI",
    desc: "Best for patient engagement, segmentation, and outreach.",
    icon: <Icon.Search />,
    color: "#0284C7",
    metric: "Qwen-powered",
  },
]

export default function IntelligenceHub({ navigate }: IntelligenceHubProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-3">
        <h1 className="text-base font-semibold text-gray-900">
          Intelligence Hub
        </h1>
        <p className="text-[11.5px] text-[#64748B]">
          Command center for the hospital's AI-driven modules, all backed by the
          same vLLM Qwen model.
        </p>
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {AI_MODULES.map((mod) => (
          <div
            key={mod.id}
            onClick={() => navigate(mod.id)}
            className="bg-white border border-[#DDE2EC] rounded p-4 hover:border-[#1B4FD8] transition-colors cursor-pointer flex flex-col"
          >
            <div className="flex justify-between items-start mb-3">
              <div
                className="w-9 h-9 rounded flex items-center justify-center text-white"
                style={{ backgroundColor: mod.color }}
              >
                {mod.icon}
              </div>
              <span className="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#E8EDF5] text-[#1E3A6E]">
                {mod.metric}
              </span>
            </div>

            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {mod.title}
            </h3>
            <p className="text-[11.5px] text-[#64748B] leading-relaxed flex-1">
              {mod.desc}
            </p>

            <div className="mt-3 flex items-center gap-1.5 text-[11.5px] font-medium text-[#1B4FD8]">
              Open module
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
