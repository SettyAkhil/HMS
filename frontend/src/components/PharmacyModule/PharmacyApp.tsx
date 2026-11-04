import "./index.css"
import { useState, useEffect } from "react"
import { Toaster, toast } from "react-hot-toast"
import Layout from "./components/Layout"
import GlobalSearch from "./components/GlobalSearch"
import Dashboard from "./pages/Dashboard"
import Dispensing from "./pages/Dispensing"
import PrescriptionQueue from "./pages/PrescriptionQueue"
import MedicineMaster from "./pages/MedicineMaster"
import Suppliers from "./pages/Suppliers"
import InvoiceOCR from "./pages/InvoiceOCR"
import InventoryLedger from "./pages/InventoryLedger"
import ExpiryLowStock from "./pages/ExpiryLowStock"
import SalesReturns from "./pages/SalesReturns"
import Reports from "./pages/Reports"
import Notifications from "./pages/Notifications"
import AuditLog from "./pages/AuditLog"

import SupplierReturns from "./pages/SupplierReturns"
import MedicineWriteOff from "./pages/MedicineWriteOff"
import UserManagement from "./pages/UserManagement"

const pages: Record<string, React.ComponentType<{
  onNavigate: (page: string) => void
}>> = {
  dashboard: Dashboard,
  dispensing: Dispensing,
  prescriptions: PrescriptionQueue,
  medicines: MedicineMaster,
  categories: MedicineMaster,
  suppliers: Suppliers,
  "purchase-orders": InvoiceOCR, // PO removed; redirects to Inward Stock Entry
  grn: InvoiceOCR,
  ocr: InvoiceOCR,
  "inventory-ledger": InventoryLedger,
  "expiry-low-stock": ExpiryLowStock,
  "sales-returns": SalesReturns,
  "supplier-returns": SupplierReturns,
  "write-off": MedicineWriteOff,
  reports: Reports,
  notifications: Notifications,
  "audit-log": AuditLog,
  users: UserManagement,
  settings: UserManagement,
}

interface PharmacyAppProps {
  /** Page to show, derived from the HMS sidebar selection. */
  page: string
  /** Reports in-page navigation back to the host so the sidebar stays in sync. */
  onNavigate: (page: string) => void
}

export default function PharmacyApp({ page, onNavigate }: PharmacyAppProps) {
  const [showSearch, setShowSearch] = useState(false)

  // There is no separate pharmacy sign-in: the user is already authenticated by
  // the HMS shell, and module access is decided by RoleDatabase. The module's own
  // Login screen and its one-time `hospai_pharm_*` wipe are both gone -- that wipe
  // deleted the prescription queue the doctor portal dispatches into, so a
  // prescription sent from a consultation could vanish before the pharmacist
  // ever saw it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setShowSearch((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handler)

    const handleToast = (e: any) => {
      const notif = e.detail
      if (notif.type === "critical" || notif.type === "alert") {
        toast.error(notif.message, {
          duration: 5000,
          style: { minWidth: "300px" },
        })
      } else if (notif.type === "warning") {
        toast(notif.message, { icon: "⚠️", duration: 4000 })
      } else {
        toast.success(notif.message, { duration: 3000 })
      }
    }
    window.addEventListener("hospai_pharmacy_toast", handleToast)

    return () => {
      document.removeEventListener("keydown", handler)
      window.removeEventListener("hospai_pharmacy_toast", handleToast)
    }
  }, [])

  const PageComponent = pages[page] ?? Dashboard

  return (
    <>
      <Layout>
        <PageComponent onNavigate={onNavigate} />
      </Layout>
      {showSearch && (
        <GlobalSearch
          onClose={() => setShowSearch(false)}
          onNavigate={(next) => {
            onNavigate(next)
            setShowSearch(false)
          }}
        />
      )}
      <Toaster position="top-right" />
    </>
  )
}
