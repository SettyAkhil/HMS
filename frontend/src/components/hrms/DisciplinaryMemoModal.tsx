import React, { useState, useEffect } from "react"
import { HrmsDatabase, ContinuousAbnormalityRecord } from "../../services/hrmsDb"
import { AlertTriangle, FileText, Printer, CheckCircle, Send } from "lucide-react"

interface DisciplinaryMemoModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function DisciplinaryMemoModal({ isOpen, onClose }: DisciplinaryMemoModalProps) {
  const [abnormalities, setAbnormalities] = useState<ContinuousAbnormalityRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<ContinuousAbnormalityRecord | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [deadline, setDeadline] = useState("Within 48 Hours")

  const loadData = async () => {
    const list = await HrmsDatabase.getAbnormalities()
    setAbnormalities(list)
    if (list.length > 0 && !selectedRecord) {
      setSelectedRecord(list[0])
    }
  }

  useEffect(() => {
    if (isOpen) loadData()
  }, [isOpen])

  if (!isOpen) return null

  const handleGenerate = async (rec: ContinuousAbnormalityRecord) => {
    setIsGenerating(true)
    try {
      const res = await HrmsDatabase.generateDisciplinaryMemo({
        staffId: rec.staffId,
        staffName: rec.staffName,
        department: rec.department,
        explanationDeadline: deadline,
      })
      await loadData()
      if (res && res.memo) {
        setSelectedRecord({
          ...rec,
          memoGenerated: true,
          memoDetails: res.memo,
        })
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 print:p-0 print:bg-white">
      <div className="w-full max-w-4xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto print:max-h-none print:border-none print:bg-white print:text-black">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-base font-semibold text-white">Continuous Abnormality & Disciplinary Memos</h3>
              <p className="text-xs text-gray-400">Detect chronic latecomers / unapproved absentees and issue official show-cause notices</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:block">
          {/* Left Column: Detected Abnormalities List */}
          <div className="space-y-2.5 print:hidden">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Flagged Hospital Staff ({abnormalities.length})
            </h4>
            <div className="space-y-2">
              {abnormalities.map((abn) => {
                const isSelected = selectedRecord?.staffId === abn.staffId
                return (
                  <div
                    key={abn.id}
                    onClick={() => setSelectedRecord(abn)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-amber-500/10 border-amber-500/40 text-white"
                        : "bg-gray-950/60 border-gray-800 hover:bg-gray-800/40 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{abn.staffName}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{abn.staffId}</span>
                    </div>
                    <div className="text-[11px] text-amber-400 font-medium mt-1">
                      {abn.abnormalityType}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mt-2">
                      <span>{abn.department}</span>
                      {abn.memoGenerated ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle className="h-3 w-3" /> Memo Issued
                        </span>
                      ) : (
                        <span className="text-rose-400 font-semibold">Action Pending</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right Column: Formal Memo Letterhead Preview */}
          <div className="md:col-span-2 rounded-xl border border-gray-800 bg-gray-950 p-6 space-y-4 print:border-none print:bg-white print:p-0">
            {selectedRecord ? (
              <div className="space-y-4 text-xs text-gray-200 print:text-black">
                {/* Official Letterhead Header */}
                <div className="text-center border-b border-gray-800 print:border-black pb-4 space-y-1">
                  <h2 className="text-base font-bold text-white uppercase tracking-wider print:text-black">
                    Varma Enterprise Hospital & Research Centre
                  </h2>
                  <p className="text-[11px] text-gray-400 print:text-gray-700">
                    Department of Human Resources & Medical Administration
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono print:text-gray-600">
                    Road No. 12, Banjara Hills, Hyderabad - 500034 • Phone: +91 40 6812 4000
                  </p>
                </div>

                {/* Memo Meta */}
                <div className="flex justify-between items-center text-[11px] font-mono border-b border-gray-800/60 pb-2 print:border-black">
                  <div>
                    <span className="text-gray-400 print:text-black">Ref No: </span>
                    <span className="font-bold text-amber-400 print:text-black">
                      {selectedRecord.memoDetails?.memoNo || `VH/HR/DISC/2026/PENDING`}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 print:text-black">Date of Issue: </span>
                    <span className="font-bold text-white print:text-black">
                      {selectedRecord.memoDetails?.issuedDate || new Date().toISOString().substring(0, 10)}
                    </span>
                  </div>
                </div>

                {/* To Recipient */}
                <div className="bg-gray-900/50 print:bg-gray-100 p-3 rounded-lg space-y-1">
                  <p className="font-semibold text-white print:text-black">TO:</p>
                  <p className="text-gray-300 print:text-black">
                    <span className="font-bold">{selectedRecord.staffName}</span> (Emp ID: {selectedRecord.staffId})
                  </p>
                  <p className="text-gray-400 print:text-black">Department: {selectedRecord.department}</p>
                </div>

                {/* Subject */}
                <div className="font-semibold text-amber-400 print:text-black border-l-2 border-amber-500 pl-2">
                  SUB: SHOW-CAUSE NOTICE — {selectedRecord.abnormalityType.toUpperCase()}
                </div>

                {/* Memo Content */}
                <div className="space-y-2 text-justify leading-relaxed text-gray-300 print:text-black">
                  <p>
                    Biometric attendance records for the month of October 2026 indicate that you have recorded{" "}
                    <span className="font-bold text-amber-400 print:text-black">
                      {selectedRecord.consecutiveDays} consecutive days
                    </span>{" "}
                    of duty discrepancy on the following dates:{" "}
                    <span className="font-mono text-white print:text-black">
                      {selectedRecord.dates.join(", ")}
                    </span>
                    .
                  </p>
                  <p>
                    Such unapproved absence / repetitive delayed reporting severely affects hospital clinical operations,
                    patient care handover, and violates Rule 14(b) of Hospital Service Regulations.
                  </p>
                  <p>
                    You are hereby directed to submit your formal written explanation to the undersigned HR Department{" "}
                    <span className="font-bold underline text-white print:text-black">
                      {selectedRecord.memoDetails?.explanationDeadline || deadline}
                    </span>
                    , failing which ex-parte disciplinary action including Loss of Pay (LOP) and service censure will be
                    enforced.
                  </p>
                </div>

                {/* Signatures */}
                <div className="pt-8 flex justify-between items-end border-t border-gray-800 print:border-black">
                  <div className="text-center">
                    <div className="h-10"></div>
                    <div className="border-t border-gray-700 print:border-black w-36 pt-1 font-semibold text-[11px]">
                      Employee Signature
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-serif italic text-blue-400 print:text-black mb-1">Dr. K. S. Varma</div>
                    <div className="border-t border-gray-700 print:border-black w-44 pt-1 font-semibold text-[11px]">
                      Medical Director & HR Head
                    </div>
                  </div>
                </div>

                {/* Print & Action Buttons (Hidden when printing) */}
                <div className="flex justify-end gap-2 pt-4 border-t border-gray-800 print:hidden">
                  <button
                    onClick={handlePrint}
                    className="px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print Official Memo</span>
                  </button>
                  {!selectedRecord.memoGenerated && (
                    <button
                      onClick={() => handleGenerate(selectedRecord)}
                      disabled={isGenerating}
                      className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-amber-600/20"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{isGenerating ? "Issuing..." : "Issue & Log Memo"}</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 text-xs">Select a staff member from the left list.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
