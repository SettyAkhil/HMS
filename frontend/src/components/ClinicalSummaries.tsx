import React, { useState } from "react"
import { FileText, ScrollText } from "lucide-react"
import PatientDischargeSummary from "./clinicalSummaries/PatientDischargeSummary"
import DocumentSummarizer from "./clinicalSummaries/DocumentSummarizer"

type Tab = "discharge" | "document"

export default function ClinicalSummaries() {
  const [tab, setTab] = useState<Tab>("discharge")
  const tabs: { key: Tab ;label: string ;icon: typeof FileText }[] = [
    { key: "discharge", label: "Discharge summary", icon: ScrollText },
    { key: "document", label: "Summarise a document", icon: FileText },
  ]

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#F0F2F5] print:bg-white">
      <div className="no-print bg-white border-b border-[#DDE2EC] px-5 lg:px-6 pt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="pb-3">
          <h1 className="text-base font-semibold text-gray-900">Clinical Summaries</h1>
          <p className="text-[11.5px] text-[#64748B]">
            {tab === "discharge"
              ? "Search a patient and get their complete discharge summary, compiled from the hospital record and written up by the Keppler AI (Qwen)."
              : "Generate structured summaries from authorized EMR documents, powered by the Keppler AI (Qwen) backend."}
          </p>
        </div>
        <div className="ml-auto flex gap-1" role="tablist">
          {tabs.map(({ key, label, icon: I }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`h-9 px-3 text-[12.5px] font-medium inline-flex items-center gap-1.5 border-b-2 -mb-px cursor-pointer transition-colors ${
                tab === key ? "border-[#1B4FD8] text-[#1B4FD8]" : "border-transparent text-[#64748B] hover:text-[#334155]"
              }`}
            >
              <I size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "discharge" ? <PatientDischargeSummary /> : <DocumentSummarizer />}
    </div>
  )
}
