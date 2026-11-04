import React, { useState } from "react"
import { Icon } from "./icons"

export default function ClinicalRAG() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{
    answer: string
    sources: any[]
  } | null>(null)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setResult(null)

    // Mock processing delay
    setTimeout(() => {
      setResult({
        answer:
          "The patient's blood pressure was recorded as 138/88 mmHg during their previous outpatient visit on August 5th, 2026. A subsequent vital signs check during encounter #10482 confirmed similar readings.",
        sources: [
          {
            type: "OP Encounter",
            date: "05 Aug 2026",
            title: "Cardiology Follow-up",
            excerpt:
              "...patient reports feeling well. BP reading 138/88 mmHg, HR 72...",
          },
          {
            type: "Vital Signs Record",
            date: "12 Aug 2026",
            title: "Encounter #10482",
            excerpt: "...BP: 136/85 mmHg (Sitting, Right Arm)...",
          },
        ],
      })
      setLoading(false)
    }, 2000)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F0F2F5]">
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Clinical RAG (Search)
          </h1>
          <p className="text-[12.5px] text-[#64748B]">
            Securely retrieve and synthesize information from a patient's
            longitudinal record.
          </p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="text-[12px] flex items-center gap-2 text-gray-600 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-md">
            <span className="font-semibold text-gray-800">Active Patient:</span>{" "}
            John Smith (MRN: 948271)
            <button className="text-[#1B4FD8] hover:underline ml-2">
              Change
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="w-full space-y-6">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative shadow-sm">
            <Icon.Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about John Smith's medical history (e.g., 'What medications were prescribed during the last admission?')"
              className="w-full h-14 bg-white border border-[#DDE2EC] rounded-xl pl-12 pr-32 text-[14px] text-gray-900 focus:outline-none focus:border-[#1B4FD8] focus:ring-1 focus:ring-[#1B4FD8]"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#64748B]">
              <Icon.Search />
            </span>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="submit"
                disabled={!query.trim() || loading}
                className="h-10 px-4 bg-[#1B4FD8] hover:bg-[#1740B4] text-white text-[13px] font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Search Records
              </button>
            </div>
          </form>

          {/* Quick Prompts when empty */}
          {!loading && !result && (
            <div className="grid grid-cols-2 gap-4 mt-8">
              {[
                "What was the patient's blood pressure during the previous visit?",
                "Does the patient have a history of diabetes?",
                "What medications were prescribed during the last admission?",
                "Summarize the findings from the most recent MRI.",
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(prompt)}
                  className="text-left bg-white border border-[#DDE2EC] p-4 rounded-xl hover:border-[#1B4FD8] hover:shadow-sm transition-all text-[13px] text-gray-700"
                >
                  <div className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <Icon.Cmd /> Query Suggestion
                  </div>
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-white border border-[#DDE2EC] rounded-xl p-8 text-center mt-6 shadow-sm">
              <div className="w-10 h-10 border-4 border-[#E2E8F0] border-t-[#1B4FD8] rounded-full animate-spin mx-auto mb-4"></div>
              <div className="text-[14px] font-semibold text-gray-900 mb-1">
                Searching Medical Records
              </div>
              <div className="text-[12.5px] text-[#64748B]">
                Executing permission-aware retrieval and generating grounded
                response...
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="bg-white border border-[#DDE2EC] rounded-xl overflow-hidden shadow-sm mt-6">
              <div className="bg-[#F8FAFC] border-b border-[#DDE2EC] p-5">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1B4FD8] mb-3 uppercase tracking-wider">
                  <Icon.TrendUp /> AI Generated Answer
                </div>
                <p className="text-[15px] leading-relaxed text-gray-900 font-medium">
                  {result.answer}
                </p>
              </div>

              <div className="p-5 bg-white">
                <div className="text-[13px] font-semibold text-gray-900 mb-4 border-b border-[#F1F5F9] pb-2">
                  Sources & Citations
                </div>
                <div className="space-y-3">
                  {result.sources.map((src, idx) => (
                    <div
                      key={idx}
                      className="flex gap-4 p-3 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                    >
                      <div className="w-8 h-8 rounded bg-[#F1F5F9] flex flex-col items-center justify-center flex-shrink-0 text-[#64748B]">
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[13px] font-semibold text-[#1B4FD8]">
                            {src.title}
                          </span>
                          <span className="text-[11px] text-[#94A3B8] font-mono">
                            {src.date}
                          </span>
                        </div>
                        <div className="text-[11.5px] font-medium text-gray-600 mb-1 uppercase tracking-wide">
                          {src.type}
                        </div>
                        <div className="text-[12.5px] text-gray-800 bg-[#F1F5F9] p-2 rounded italic">
                          "{src.excerpt}"
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#FFFBEB] border-t border-[#FEF08A] p-3 text-[11px] text-[#B45309] text-center">
                <strong>Disclaimer:</strong> Answers are AI-generated based on
                the retrieved sources. Always verify important factual answers
                against the source records.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
