import PharmacyApp from "./PharmacyModule/PharmacyApp"

// The pharmacy screens are reached from the main HMS sidebar, which lists every
// one of them as a child of "Pharmacy" (see the NAV array in App.tsx). This maps
// those module keys onto the module's own page ids.
//
// Before this existed the module ignored `activeModule` entirely and always
// opened its dashboard behind a second, nested sidebar -- so picking
// "Stock Transfers" in the main nav highlighted it there and then showed the
// dashboard, and the real navigation lived in a duplicate sidebar inside it.
const MODULE_TO_PAGE: Record<string, string> = {
  pharmacy: "dashboard",
  pharmacy_dispensing: "dispensing",
  pharmacy_rx: "prescriptions",
  pharmacy_ocr: "ocr",
  pharmacy_returns: "sales-returns",
  pharmacy_supplier_returns: "supplier-returns",
  pharmacy_medicine: "medicines",
  pharmacy_category: "categories",
  pharmacy_suppliers: "suppliers",
  pharmacy_po: "ocr", // Redirect old PO requests to Inward GRN
  pharmacy_grn: "ocr",
  pharmacy_ledger: "inventory-ledger",
  pharmacy_transfers: "inventory-ledger",
  pharmacy_expiry: "expiry-low-stock",
  pharmacy_write_off: "write-off",
  pharmacy_analytics: "reports",
  pharmacy_notifications: "notifications",
  pharmacy_users: "users",
  pharmacy_audit: "audit-log",
  pharmacy_settings: "settings",
}

const PAGE_TO_MODULE: Record<string, string> = {
  dashboard: "pharmacy",
  dispensing: "pharmacy_dispensing",
  prescriptions: "pharmacy_rx",
  ocr: "pharmacy_ocr",
  grn: "pharmacy_ocr",
  "purchase-orders": "pharmacy_ocr",
  "sales-returns": "pharmacy_returns",
  "supplier-returns": "pharmacy_supplier_returns",
  medicines: "pharmacy_medicine",
  categories: "pharmacy_category",
  suppliers: "pharmacy_suppliers",
  "inventory-ledger": "pharmacy_ledger",
  "expiry-low-stock": "pharmacy_expiry",
  "write-off": "pharmacy_write_off",
  reports: "pharmacy_analytics",
  notifications: "pharmacy_notifications",
  "audit-log": "pharmacy_audit",
  users: "pharmacy_users",
  settings: "pharmacy_settings",
}

interface PharmacyProps {
  activeModule?: string
  onNavigate?: (module: string) => void
}

export default function Pharmacy({ activeModule, onNavigate }: PharmacyProps) {
  const page = MODULE_TO_PAGE[activeModule ?? "pharmacy"] ?? "dashboard"

  // In-page navigation (a dashboard tile, a "View all" link, the Ctrl+K search)
  // is reported back as a module key, so the main sidebar highlight follows
  // along instead of drifting out of sync with what is on screen.
  const handleNavigate = (nextPage: string) => {
    const nextModule =
      PAGE_TO_MODULE[nextPage] ||
      (nextPage.startsWith("pharmacy") ? nextPage : undefined)
    if (nextModule && onNavigate) onNavigate(nextModule)
  }

  return (
    <div className="w-full h-full overflow-hidden bg-[#F4F6F9]">
      <PharmacyApp page={page} onNavigate={handleNavigate} />
    </div>
  )
}
