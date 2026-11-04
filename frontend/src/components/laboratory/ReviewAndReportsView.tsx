import React, { useState } from "react"
import { FileCheck, FileText, CheckCircle2, ShieldCheck, Printer } from "lucide-react"
import PathologistReviewView from "./PathologistReviewView"
import LabReportsView from "./LabReportsView"

interface ReviewAndReportsViewProps {
  initialTab?: "review" | "reports"
}

export default function ReviewAndReportsView({
  initialTab = "review",
}: ReviewAndReportsViewProps) {
  const [activeTab, setActiveTab] = useState<"review" | "reports">(initialTab)

  return (
    <div className="space-y-4">
      {/* ── UNIFIED REVIEW & REPORTS HEADER ───────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab("review")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "review"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Pathologist Review & Approval</span>
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "reports"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Diagnostic Reports Repository & EMR</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-2">
            <span className="font-semibold text-slate-700">Review & Reports:</span>
            <span>Clinical validation, delta checks, digital signatures, and audit-ready PDF distribution</span>
          </div>
        </div>
      </div>

      {/* ── ACTIVE PANEL RENDERING ─────────────────────────────────────────── */}
      <div className="transition-all">
        {activeTab === "review" ? (
          <PathologistReviewView />
        ) : (
          <LabReportsView />
        )}
      </div>
    </div>
  )
}

