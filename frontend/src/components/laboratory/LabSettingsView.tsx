import React, { useState, useEffect } from "react"
import {
  Settings,
  ShieldCheck,
  Clock,
  Barcode,
  Layers,
  Save,
  CheckCircle2,
  Building2,
  Droplet,
  FileCheck,
} from "lucide-react"
import { LabLisService, LisSettings } from "../../services/labLisService"
import { AuditDatabase } from "../../services/auditDb"

export default function LabSettingsView() {
  const [settings, setSettings] = useState<LisSettings>(LabLisService.getSettings())
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    LabLisService.updateSettings(settings)
    AuditDatabase.logEvent(
      "Laboratory Settings Updated",
      "Laboratory",
      "Laboratory governance policies, TAT benchmarks, and tube guides updated.",
      "Success",
    )
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* ── TOP BANNER ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-purple-100 text-[#7552B8] rounded-xl">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Laboratory Governance & System Settings</h3>
            <p className="text-[11px] text-slate-500">
              Configure NABL/CAP accreditation parameters, TAT benchmarks, tube color rules, and barcode formats
            </p>
          </div>
        </div>

        <button
          type="submit"
          className="px-5 py-2 bg-[#7552B8] hover:bg-[#6240a3] text-white text-xs font-bold rounded-xl transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>Save Changes</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Laboratory governance settings successfully saved and applied!</span>
        </div>
      )}

      {/* ── SETTINGS PANELS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Panel 1: Accreditation & Laboratory Profile */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
            <Building2 className="w-4 h-4 text-[#7552B8]" />
            <span>Accreditation & Laboratory Identity</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Laboratory Facility Name</label>
              <input
                type="text"
                value={settings.hospitalName}
                onChange={(e) => setSettings({ ...settings, hospitalName: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Quality Accreditation Badge</label>
              <input
                type="text"
                value={settings.laboratoryAccreditation}
                onChange={(e) => setSettings({ ...settings, laboratoryAccreditation: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Laboratory Director Signatory</label>
              <input
                type="text"
                value={settings.directorName}
                onChange={(e) => setSettings({ ...settings, directorName: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Specimen Barcode Prefix</label>
              <input
                type="text"
                value={settings.barcodePrefix}
                onChange={(e) => setSettings({ ...settings, barcodePrefix: e.target.value })}
                className="w-full p-2 border border-slate-200 rounded-xl font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Panel 2: Turnaround Time (TAT) Benchmarks */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
            <Clock className="w-4 h-4 text-[#0D9488]" />
            <span>Turnaround Time (TAT) Benchmark SLAs (Minutes)</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">STAT Emergency TAT (Mins)</label>
                <input
                  type="number"
                  value={settings.tatBenchmarkMinutes.STAT}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tatBenchmarkMinutes: { ...settings.tatBenchmarkMinutes, STAT: parseInt(e.target.value) || 45 },
                    })
                  }
                  className="w-full p-2 border border-rose-300 rounded-xl font-mono font-bold text-rose-700 bg-rose-50/50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Urgent TAT (Mins)</label>
                <input
                  type="number"
                  value={settings.tatBenchmarkMinutes.Urgent}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tatBenchmarkMinutes: { ...settings.tatBenchmarkMinutes, Urgent: parseInt(e.target.value) || 120 },
                    })
                  }
                  className="w-full p-2 border border-amber-300 rounded-xl font-mono font-bold text-amber-800 bg-amber-50/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Routine Outpatient (Mins)</label>
                <input
                  type="number"
                  value={settings.tatBenchmarkMinutes.Routine}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tatBenchmarkMinutes: { ...settings.tatBenchmarkMinutes, Routine: parseInt(e.target.value) || 240 },
                    })
                  }
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Microbiology Culture (Mins)</label>
                <input
                  type="number"
                  value={settings.tatBenchmarkMinutes.Microbiology}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      tatBenchmarkMinutes: {
                        ...settings.tatBenchmarkMinutes,
                        Microbiology: parseInt(e.target.value) || 2880,
                      },
                    })
                  }
                  className="w-full p-2 border border-slate-200 rounded-xl font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Panel 3: Specimen Vacuum Tube Reference Guide */}
        <div className="md:col-span-2 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
            <Droplet className="w-4 h-4 text-rose-600" />
            <span>Phlebotomy Vacuum Tube Container Standards</span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Vacuum Tube Color</th>
                  <th className="py-2.5 px-3">Anticoagulant / Additive</th>
                  <th className="py-2.5 px-3">Applicable Clinical Departments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settings.tubeColorGuide.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{t.tube}</td>
                    <td className="py-2.5 px-3 text-slate-600">{t.additive}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {t.departments.map((d) => (
                          <span
                            key={d}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </form>
  )
}

