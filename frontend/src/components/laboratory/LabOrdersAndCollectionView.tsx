import React, { useState } from "react"
import { ClipboardList, Syringe, ChevronRight, AlertCircle, CheckCircle2 } from "lucide-react"
import LabOrdersView from "./LabOrdersView"
import SampleCollectionView from "./SampleCollectionView"
import { LabOrder, LabOrderDatabase, LabOrderTest } from "../../services/labOrdersDb"

interface LabOrdersAndCollectionViewProps {
  onOpenWorkbench?: (order: LabOrder, test?: LabOrderTest) => void
  onOpenReport?: (order: LabOrder) => void
  initialTab?: "orders" | "collection"
}

export default function LabOrdersAndCollectionView({
  onOpenWorkbench,
  onOpenReport,
  initialTab = "orders",
}: LabOrdersAndCollectionViewProps) {
  const [activeTab, setActiveTab] = useState<"orders" | "collection">(initialTab)

  return (
    <div className="space-y-4">
      {/* ── UNIFIED SUB-MODULE WORKSPACE BAR ──────────────────────────────── */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "orders"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>Lab Orders Directory</span>
            </button>

            <button
              onClick={() => setActiveTab("collection")}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition cursor-pointer ${
                activeTab === "collection"
                  ? "bg-[#7552B8] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/70"
              }`}
            >
              <Syringe className="w-4 h-4" />
              <span>Phlebotomy & Sample Collection</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-2">
            <span className="font-semibold text-slate-700">Consolidated Workspace:</span>
            <span>Order intake, billing check, barcode labeling & phlebotomy queue</span>
          </div>
        </div>
      </div>

      {/* ── ACTIVE PANEL RENDERING ─────────────────────────────────────────── */}
      <div className="transition-all">
        {activeTab === "orders" ? (
          <LabOrdersView
            onOpenBench={(ord) => {
              if (onOpenWorkbench) onOpenWorkbench(ord)
            }}
            onOpenReport={(ord) => {
              if (onOpenReport) onOpenReport(ord)
            }}
            onCollectSample={() => {
              setActiveTab("collection")
            }}
          />
        ) : (
          <SampleCollectionView
            onOpenWorkbench={(orderId) => {
              const order = LabOrderDatabase.getOrders().find((o) => o.id === orderId)
              if (order && onOpenWorkbench) onOpenWorkbench(order)
            }}
          />
        )}
      </div>
    </div>
  )
}

