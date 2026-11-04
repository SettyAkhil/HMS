import React, { useState } from "react"
import { Btn, Input } from "./shared"
import { Icon } from "./icons"

const ORDER_CATEGORIES = [
  {
    category: "Laboratory",
    orders: [
      "CBC w/ Differential",
      "Basic Metabolic Panel",
      "Comprehensive Metabolic Panel",
      "Lipid Panel",
      "Hemoglobin A1c",
      "Troponin I",
      "Lactic Acid",
      "Blood Culture ×2",
      "Urinalysis w/ Reflex Culture",
      "Prothrombin Time / INR",
      "Thyroid Panel (TSH)",
      "Liver Function Tests",
    ],
  },
  {
    category: "Imaging",
    orders: [
      "Chest X-Ray PA/Lateral",
      "CT Head w/o Contrast",
      "CT Chest w/ Contrast",
      "CT Abdomen/Pelvis w/ Contrast",
      "MRI Brain w/ & w/o",
      "Ultrasound Abdomen",
      "Echocardiogram",
      "12-Lead ECG",
      "Duplex Ultrasound Lower Extremity",
    ],
  },
  {
    category: "Medications",
    orders: [
      "Acetaminophen 650mg PO/PR Q6H PRN",
      "Ondansetron 4mg IV Q6H PRN",
      "Morphine 2mg IV Q4H PRN",
      "Heparin 5000u SC Q8H",
      "Normal Saline 0.9% 1L IV",
      "Potassium Chloride 40mEq PO Daily",
      "Insulin Sliding Scale",
    ],
  },
  {
    category: "Consults",
    orders: [
      "Cardiology Consult",
      "Nephrology Consult",
      "Pulmonology Consult",
      "Infectious Disease Consult",
      "Surgery Consult",
      "Social Work Consult",
      "Physical Therapy",
      "Occupational Therapy",
    ],
  },
  {
    category: "Nursing",
    orders: [
      "Vital Signs Q4H",
      "Vital Signs Q2H",
      "Daily Weights",
      "Strict I&O",
      "Fall Precautions",
      "NPO After Midnight",
      "Up As Tolerated",
      "Activity: Bedrest",
    ],
  },
]

interface OrderDrawerProps {
  open: boolean
  onClose: () => void
}

export default function OrderDrawer({ open, onClose }: OrderDrawerProps) {
  const [search, setSearch] = useState("")
  const [selectedOrders, setSelectedOrders] = useState<string[]>([])
  const [priority, setPriority] = useState("Routine")
  const [expandedCats, setExpandedCats] = useState<string[]>(["Laboratory"])

  const toggle = (order: string) => {
    setSelectedOrders((prev) =>
      prev.includes(order) ? prev.filter((o) => o !== order) : [...prev, order],
    )
  }

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  const filtered = ORDER_CATEGORIES.map((c) => ({
    ...c,
    orders: c.orders.filter(
      (o) => !search || o.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((c) => !search || c.orders.length > 0)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-96 bg-white h-full shadow-2xl flex flex-col z-10 border-l border-[#DDE2EC]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#DDE2EC] flex items-center justify-between bg-[#0C1524]">
          <div>
            <div className="text-[13px] font-semibold text-white">
              New Order
            </div>
            <div className="text-[11px] text-[#94A3B8]">
              John Smith · MRN 100245
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-white transition-colors p-1"
          >
            <Icon.X />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-[#DDE2EC]">
          <Input
            value={search}
            onChange={setSearch}
            placeholder="Search orders..."
            icon={<Icon.Search />}
          />
        </div>

        {/* Priority */}
        <div className="px-4 py-2.5 border-b border-[#DDE2EC] flex items-center gap-2">
          <span className="text-[11.5px] font-semibold text-[#64748B]">
            Priority:
          </span>
          {["Routine", "Urgent", "STAT"].map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`px-2.5 py-1 text-[11.5px] font-medium rounded border transition-colors
                ${
                  priority === p
                    ? p === "STAT"
                      ? "bg-[#DC2626] text-white border-[#DC2626]"
                      : p === "Urgent"
                        ? "bg-[#D97706] text-white border-[#D97706]"
                        : "bg-[#1B4FD8] text-white border-[#1B4FD8]"
                    : "bg-white text-[#64748B] border-[#DDE2EC] hover:border-[#94A3B8]"
                }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Selected */}
        {selectedOrders.length > 0 && (
          <div className="px-4 py-2.5 bg-[#EFF6FF] border-b border-[#BFDBFE]">
            <div className="text-[11px] font-semibold text-[#1E40AF] mb-1.5">
              {selectedOrders.length} Order
              {selectedOrders.length > 1 ? "s" : ""} Selected
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedOrders.map((o) => (
                <span
                  key={o}
                  className="bg-white border border-[#BFDBFE] text-[#1E40AF] text-[11px] px-2 py-0.5 rounded flex items-center gap-1"
                >
                  {o.length > 25 ? o.slice(0, 25) + "…" : o}
                  <button
                    onClick={() => toggle(o)}
                    className="opacity-60 hover:opacity-100"
                  >
                    <Icon.X />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Order List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((cat) => (
            <div key={cat.category} className="border-b border-[#F1F5F9]">
              <button
                onClick={() => toggleCat(cat.category)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors"
              >
                <span className="text-[11.5px] font-semibold text-gray-700 uppercase tracking-wide">
                  {cat.category}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10.5px] text-[#94A3B8]">
                    {cat.orders.length}
                  </span>
                  <Icon.ChevronDown />
                </div>
              </button>
              {(expandedCats.includes(cat.category) || search) && (
                <div className="py-1">
                  {cat.orders.map((order) => (
                    <label
                      key={order}
                      className="flex items-center gap-2.5 px-4 py-2 hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order)}
                        onChange={() => toggle(order)}
                        className="w-3.5 h-3.5 accent-[#1B4FD8]"
                      />
                      <span className="text-[12.5px] text-gray-800">
                        {order}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Indication */}
        <div className="px-4 py-2.5 border-t border-[#DDE2EC]">
          <label className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide block mb-1">
            Indication / Clinical Note
          </label>
          <textarea
            rows={2}
            placeholder="Clinical indication..."
            className="w-full border border-[#DDE2EC] rounded text-[12.5px] px-3 py-2 resize-none focus:outline-none focus:border-[#1B4FD8]"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#DDE2EC] flex items-center gap-2 bg-[#F8FAFC]">
          <Btn variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="primary"
            size="sm"
            className="flex-1 justify-center"
            onClick={() => {
              alert(
                `Signed ${selectedOrders.length || 1} order(s) — Priority: ${priority}`,
              )
              onClose()
            }}
          >
            Sign & Submit Order{selectedOrders.length > 1 ? "s" : ""}
          </Btn>
        </div>
      </div>
    </div>
  )
}
