import React, { useState } from "react"
import { BookOpen, Settings, Sliders, ShieldCheck } from "lucide-react"
import TestMasterView from "./TestMasterView"
import LabSettingsView from "./LabSettingsView"

interface AdminConfigurationViewProps {
  initialTab?: "test_master" | "settings"
}

export default function AdminConfigurationView({
  initialTab = "test_master",
}: AdminConfigurationViewProps) {
  const [activeTab, setActiveTab] = useState<"test_master" | "settings">(initialTab)

  return (
    <div className="space-y-4">
      {/* ── ADMIN CONFIGURATION WORKSPACE SWITCHER ────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab("test_master")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "test_master"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Test Master Catalogue</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "settings"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Laboratory Settings & Governance</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-2">
            <span className="font-semibold text-slate-700">Admin Configuration:</span>
            <span>Master diagnostic catalogue, tariffs, NABL/CAP settings, and tube standards</span>
          </div>
        </div>
      </div>

      {/* ── ACTIVE PANEL RENDERING ─────────────────────────────────────────── */}
      <div className="transition-all">
        {activeTab === "test_master" ? (
          <TestMasterView />
        ) : (
          <LabSettingsView />
        )}
      </div>
    </div>
  )
}

