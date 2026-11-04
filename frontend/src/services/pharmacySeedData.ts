/**
 * Clean Hospital Pharmacy Dataset Configuration.
 * All demo and seed records are permanently removed so the hospital operates
 * entirely from scratch on genuine hospital data (CSV imports, GRNs, clinical prescriptions).
 */

import type {
  AppCategory,
  AppSupplier,
  AppMedicine,
  AppBatch,
  AppPrescription,
  AppPharmacyBill,
  AppPurchaseOrder,
  AppGRN,
  AppPharmacyReturn,
  AppAuditLog,
  AppNotification,
} from "./pharmacyDb"

// ── Categories ─────────────────────────────────────────────────────────────
export const SEED_CATEGORIES: AppCategory[] = [
  {
    id: "CAT-01",
    categoryName: "Antibiotics & Antimicrobials",
    description: "Broad & narrow spectrum systemic antibacterial agents and antivirals",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-02",
    categoryName: "Analgesics, Antipyretics & NSAIDs",
    description: "Non-opioid and opioid analgesics, antipyretics, and anti-inflammatory drugs",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-03",
    categoryName: "Cardiovascular & Antihypertensives",
    description: "Antihypertensives, statins, antiplatelet, and cardiac glycosides",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-04",
    categoryName: "Antidiabetic & Metabolic",
    description: "Oral hypoglycemics, insulins, GLP-1 receptor agonists, and metabolic agents",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-05",
    categoryName: "Gastrointestinal & Antacids",
    description: "Proton pump inhibitors, H2 blockers, antiemetics, and bowel regulators",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-06",
    categoryName: "Respiratory & Anti-Allergy",
    description: "Bronchodilators, inhaled corticosteroids, antihistamines, and mucolytics",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-07",
    categoryName: "Critical Care & IV Fluids",
    description: "Crystalloids, colloids, emergency injectables, and electrolyte concentrates",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
  {
    id: "CAT-08",
    categoryName: "Vitamins, Minerals & Nutrients",
    description: "Nutritional supplements, hematinics, calcium supplements, and electrolytes",
    status: "Active",
    createdAt: "2026-01-10T09:00:00.000Z",
  },
]

// ── Suppliers ──────────────────────────────────────────────────────────────
export const SEED_SUPPLIERS: AppSupplier[] = []

// ── Clean Empty Formulary Stores (0 Demo / 0 Mock Data) ─────────────────────
export const SEED_MEDICINES: AppMedicine[] = []
export const SEED_BATCHES: AppBatch[] = []
export const SEED_PRESCRIPTIONS: AppPrescription[] = []
export const SEED_BILLS: AppPharmacyBill[] = []
export const SEED_PURCHASE_ORDERS: AppPurchaseOrder[] = []
export const SEED_GRNS: AppGRN[] = []
export const SEED_RETURNS: AppPharmacyReturn[] = []
export const SEED_AUDIT_LOGS: AppAuditLog[] = []
export const SEED_NOTIFICATIONS: AppNotification[] = []

// ── No-Op Helpers (Preserves Type Compatibility without Auto-Seeding) ───────

export function seedPharmacyHospitalData(_force: boolean = false): void {
  // Permanent no-op: Clean hospital database state without any mock data
}

export function seedTestPrescriptionForSelling(): void {
  // Permanent no-op
}

export function createThreeScenarioPrescriptions(): AppPrescription[] {
  // Return empty list to prevent injecting mock prescriptions
  return []
}

export function seedThreeScenarioPrescriptions(): AppPrescription[] {
  // Permanent no-op
  return []
}

export function ensurePharmacyDataSeeded(): void {
  // Permanent no-op: Real hospital operates exclusively on user data
}
