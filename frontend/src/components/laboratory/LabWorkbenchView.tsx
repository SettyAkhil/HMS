import React, { useState } from "react"
import { Microscope, FileEdit, FileCheck, CheckCircle2 } from "lucide-react"
import LabWorklistsView from "./LabWorklistsView"
import ResultEntryView from "./ResultEntryView"
import PathologistReviewView from "./PathologistReviewView"
import { LabOrder, LabOrderTest } from "../../services/labOrdersDb"

interface LabWorkbenchViewProps {
  initialOrder?: LabOrder
  initialTest?: LabOrderTest
  onCompleteToReports?: () => void
  initialTab?: "worklists" | "result_entry" | "review"
}

export default function LabWorkbenchView({
  initialOrder,
  initialTest,
  onCompleteToReports,
  initialTab = "worklists",
}: LabWorkbenchViewProps) {
  const [activeTab, setActiveTab] = useState<"worklists" | "result_entry" | "review">(
    initialOrder ? "result_entry" : initialTab
  )
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(initialOrder || null)
  const [selectedTest, setSelectedTest] = useState<LabOrderTest | null>(initialTest || null)

  const handleOpenResultEntryFromWorklist = (order: LabOrder, test?: LabOrderTest) => {
    setSelectedOrder(order)
    setSelectedTest(test || null)
    setActiveTab("result_entry")
  }

  const handleResultEntryComplete = () => {
    setActiveTab("review")
    if (onCompleteToReports) {
      // Notification callback if needed
    }
  }

  return (
    <div className="space-y-4">
      {/* ── UNIFIED WORKBENCH HEADER & WORKSPACE SWITCHER ─────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab("worklists")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "worklists"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <Microscope className="w-4 h-4" />
              <span>Department Analytical Worklists</span>
            </button>

            <button
              onClick={() => setActiveTab("result_entry")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "result_entry"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <FileEdit className="w-4 h-4" />
              <span>Structured Result Entry</span>
              {selectedOrder && (
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-200 text-purple-900 font-mono">
                  {selectedOrder.id}
                </span>
              )}
            </button>

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
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-2">
            <span className="font-semibold text-slate-700">Lab Workbench:</span>
            <span>Batch processing, result entry & critical flagging, and clinical pathologist sign-off</span>
          </div>
        </div>
      </div>

      {/* ── ACTIVE PANEL RENDERING ─────────────────────────────────────────── */}
      <div className="transition-all">
        {activeTab === "worklists" && (
          <LabWorklistsView onOpenResultEntry={handleOpenResultEntryFromWorklist} />
        )}

        {activeTab === "result_entry" && (
          <ResultEntryView
            initialOrder={selectedOrder || undefined}
            initialTest={selectedTest || undefined}
            onComplete={handleResultEntryComplete}
          />
        )}

        {activeTab === "review" && (
          <PathologistReviewView initialOrderId={selectedOrder?.id} />
        )}
      </div>
    </div>
  )
}
