import { useState, useEffect, useRef, useMemo } from "react"
import {
  Search,
  Pill,
  ClipboardList,
  FileText,
  Truck,
  ShoppingBag,
  Package,
  ArrowLeftRight,
  X,
} from "lucide-react"
import { PharmacyDatabase } from "../../../services/pharmacyDb"

interface GlobalSearchProps {
  onClose: () => void
  onNavigate: (page: string) => void
}

export default function GlobalSearch({
  onClose,
  onNavigate,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const searchResults = useMemo(() => {
    const meds = PharmacyDatabase.getMedicines()
    const prescriptions = PharmacyDatabase.getPrescriptions()
    const bills = PharmacyDatabase.getBills()
    const suppliers = PharmacyDatabase.getSuppliers()
    const pos = PharmacyDatabase.getPurchaseOrders()

    const groups = []

    if (meds.length > 0) {
      groups.push({
        group: "Medicines",
        icon: Pill,
        items: meds.slice(0, 10).map((m) => ({
          label: m.brandName || m.medicineName,
          sub: `${m.genericName || "Generic"} · ${m.dosageForm || "Medicine"}`,
          page: "medicines",
        })),
      })
    }

    if (prescriptions.length > 0) {
      groups.push({
        group: "Prescriptions",
        icon: ClipboardList,
        items: prescriptions.slice(0, 10).map((p) => ({
          label: p.id,
          sub: `${p.patientName} · Dr. ${p.doctorName || "Doctor"} · ${p.status}`,
          page: "prescriptions",
        })),
      })
    }

    if (bills.length > 0) {
      groups.push({
        group: "Invoices",
        icon: FileText,
        items: bills.slice(0, 10).map((b) => ({
          label: b.billNumber,
          sub: `${b.patientName} · ₹${b.totalAmount} · ${b.createdAt?.split("T")[0] || ""}`,
          page: "sales-returns",
        })),
      })
    }

    if (suppliers.length > 0) {
      groups.push({
        group: "Suppliers",
        icon: Truck,
        items: suppliers.slice(0, 10).map((s) => ({
          label: s.supplierName,
          sub: `GSTIN: ${s.gstInformation || "N/A"}`,
          page: "suppliers",
        })),
      })
    }

    const returns = PharmacyDatabase.getSupplierReturns()
    if (returns.length > 0) {
      groups.push({
        group: "Supplier Returns (Debit Notes)",
        icon: ShoppingBag,
        items: returns.slice(0, 10).map((r) => ({
          label: r.debitNoteNumber,
          sub: `Reason: ${r.reason} · ₹${r.returnAmount || 0}`,
          page: "supplier-returns",
        })),
      })
    }

    return groups
  }, [])

  const filtered =
    query.trim().length > 0
      ? searchResults
          .map((g) => ({
            ...g,
            items: g.items.filter(
              (i) =>
                i.label.toLowerCase().includes(query.toLowerCase()) ||
                i.sub.toLowerCase().includes(query.toLowerCase()),
            ),
          }))
          .filter((g) => g.items.length > 0)
      : searchResults

  return (
    <div
      className="pharmacy-module fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full max-w-2xl mx-4 bg-white rounded shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#DDE2EC]">
          <Search size={18} className="text-[#64748B] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicines, patients, prescriptions, invoices…"
            className="flex-1 text-[15px] text-[#0F1624] outline-none placeholder:text-[#94A3B8]"
          />
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#F0F2F5] text-[#94A3B8] hover:text-[#0F1624] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.map((group) => (
            <div key={group.group} className="mb-1">
              <div className="flex items-center gap-2 px-5 py-2">
                <group.icon size={13} className="text-[#94A3B8]" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  {group.group}
                </p>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    onNavigate(item.page)
                    onClose()
                  }}
                  className="w-full flex items-start px-5 py-2.5 hover:bg-[#F0F2F5] text-left transition-colors gap-4"
                >
                  <div>
                    <p className="text-[14px] font-medium text-[#0F1624]">
                      {item.label}
                    </p>
                    <p className="text-[12px] text-[#64748B] mt-0.5">
                      {item.sub}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] text-[#94A3B8]">
                No results for "
                <span className="text-[#0F1624] font-medium">{query}</span>"
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#F0F2F5] flex items-center gap-4 text-[11px] text-[#94A3B8]">
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[#DDE2EC] bg-[#F5F7FA] text-[10px]">
              ↵
            </kbd>{" "}
            to select
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[#DDE2EC] bg-[#F5F7FA] text-[10px]">
              ↑↓
            </kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded border border-[#DDE2EC] bg-[#F5F7FA] text-[10px]">
              Esc
            </kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  )
}
