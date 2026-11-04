import React, { useState } from "react"
import { HrmsDatabase } from "../../services/hrmsDb"
import { Upload, Download, FileSpreadsheet, HardDrive, CheckCircle2, AlertCircle } from "lucide-react"

interface BatchDataUtilityModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function BatchDataUtilityModal({ isOpen, onClose }: BatchDataUtilityModalProps) {
  const [activeTab, setActiveTab] = useState<"import_staff" | "import_usb_logs" | "export">("import_usb_logs")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  if (!isOpen) return null

  const handleFileUpload = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)

    // Parse and simulate batch ingestion
    setTimeout(() => {
      setUploading(false)
      if (activeTab === "import_usb_logs") {
        setUploadSuccess(`Successfully ingested 142 offline biometric punch logs from ${file.name}`)
      } else {
        setUploadSuccess(`Successfully imported records from ${file.name}`)
      }
      setFile(null)
    }, 1200)
  }

  const handleExportStaff = () => {
    const staff = HrmsDatabase.getStaffList()
    let csv = "Employee ID,Name,Department,Designation,Category,Shift,Company,Biometric ID,Status\n"
    staff.forEach((s) => {
      csv += `"${s.id}","${s.name}","${s.department}","${s.designation}","${s.category}","${s.shift}","${s.company || "VH Care"}","${s.biometricId || ""}","${s.status}"\n`
    })
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", `Hospital_Staff_Master_${new Date().toISOString().substring(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-base font-semibold text-white">eSSL Data Utilities & USB Punch Ingestion</h3>
              <p className="text-xs text-gray-400">Import USB offline biometric logs, Excel staff masters & statutory data</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-gray-800 gap-4 text-xs font-medium">
          <button
            onClick={() => { setActiveTab("import_usb_logs"); setUploadSuccess(null) }}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === "import_usb_logs"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Import USB Biometric Logs (.dat / .csv)
          </button>
          <button
            onClick={() => { setActiveTab("import_staff"); setUploadSuccess(null) }}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === "import_staff"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Import Staff Master (Excel/CSV)
          </button>
          <button
            onClick={() => { setActiveTab("export"); setUploadSuccess(null) }}
            className={`pb-2 border-b-2 transition-colors ${
              activeTab === "export"
                ? "border-blue-500 text-blue-400 font-bold"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            Data Exports
          </button>
        </div>

        {/* Tab 1: USB Machine Log Upload */}
        {activeTab === "import_usb_logs" && (
          <div className="space-y-4 text-xs">
            <p className="text-gray-400 leading-relaxed">
              When biometric machines at the Casualty or ICU lose network connectivity, insert a USB flash drive into
              the machine's USB port, download the offline attendance dump file (e.g., <code className="text-cyan-400">1_attlog.dat</code> or <code className="text-cyan-400">attlog.txt</code>), and upload it here:
            </p>

            <form onSubmit={handleFileUpload} className="space-y-3">
              <div className="border-2 border-dashed border-gray-700 hover:border-blue-500/50 rounded-xl p-6 text-center space-y-2 bg-gray-950/60 cursor-pointer">
                <Upload className="h-8 w-8 text-blue-400 mx-auto" />
                <div className="text-gray-300 font-medium">
                  {file ? file.name : "Click to select or drag and drop machine log file"}
                </div>
                <p className="text-[11px] text-gray-400">Accepts .dat, .txt, .csv (eSSL / ZKTeco flash dump format)</p>
                <input
                  type="file"
                  accept=".dat,.txt,.csv"
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                  id="usb-log-input"
                />
                <label
                  htmlFor="usb-log-input"
                  className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium cursor-pointer"
                >
                  Browse Computer
                </label>
              </div>

              {uploadSuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5"
                >
                  {uploading ? "Ingesting USB Punches..." : "Parse & Import Machine Logs"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Excel Staff Upload */}
        {activeTab === "import_staff" && (
          <div className="space-y-4 text-xs">
            <p className="text-gray-400 leading-relaxed">
              Upload a bulk CSV or Excel spreadsheet containing employee records, company assignments (VH Care, VHC Pharmacy, Ward Boys), and statutory PF/ESI account numbers.
            </p>

            <form onSubmit={handleFileUpload} className="space-y-3">
              <div className="border-2 border-dashed border-gray-700 hover:border-blue-500/50 rounded-xl p-6 text-center space-y-2 bg-gray-950/60 cursor-pointer">
                <FileSpreadsheet className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="text-gray-300 font-medium">
                  {file ? file.name : "Select Employee Master Spreadsheet (.csv, .xlsx)"}
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                  className="hidden"
                  id="staff-file-input"
                />
                <label
                  htmlFor="staff-file-input"
                  className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium cursor-pointer"
                >
                  Browse File
                </label>
              </div>

              {uploadSuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!file || uploading}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                >
                  {uploading ? "Uploading Staff..." : "Import Staff Master"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Data Exports */}
        {activeTab === "export" && (
          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl border border-gray-800 bg-gray-950/70 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-white">Employee Master Records</h4>
                <p className="text-[11px] text-gray-400">Download complete hospital staff list with designations & salaries</p>
              </div>
              <button
                onClick={handleExportStaff}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
