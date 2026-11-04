import React, { useState, useEffect } from "react"
import {
  LayoutDashboard,
  Layers,
  BookOpen,
  Users,
  Building,
  Landmark,
  Percent,
  PieChart,
  Calculator,
  FileSpreadsheet,
  Lock,
  ShieldAlert,
  Receipt,
  CreditCard,
  Pill,
  ShieldCheck,
  UserCheck,
} from "lucide-react"

import FinanceDashboard from "./accounts/FinanceDashboard"
import ChartOfAccountsView from "./accounts/ChartOfAccountsView"
import JournalsView from "./accounts/JournalsView"
import ReceiptsView from "./accounts/ReceiptsView"
import VouchersView from "./accounts/VouchersView"
import AgeingView from "./accounts/AgeingView"
import CashBankView from "./accounts/CashBankView"
import TaxManagementView from "./accounts/TaxManagementView"
import BudgetingView from "./accounts/BudgetingView"
import FixedAssetsView from "./accounts/FixedAssetsView"
import FinancialStatementsView from "./accounts/FinancialStatementsView"
import PeriodClosingView from "./accounts/PeriodClosingView"
import PostingAuditView from "./accounts/PostingAuditView"
import PharmacyAccountsView from "./accounts/PharmacyAccountsView"
import InsuranceAccountsView from "./accounts/InsuranceAccountsView"
import { syncOperationalFeed } from "../services/accounts/operationalFeed"

export type AccountsSubTab =
  | "dashboard"
  | "coa"
  | "gl"
  | "receipts"
  | "payments"
  | "ar"
  | "ap"
  | "cash_bank"
  | "pharmacy"
  | "insurance"
  | "tax"
  | "budget"
  | "assets"
  | "statements"
  | "closing"
  | "audit"
  | "manager"

export interface AccountsModuleProps {
  initialTab?: AccountsSubTab
}

export default function AccountsModule({ initialTab = "dashboard" }: AccountsModuleProps) {
  const [activeTab, setActiveTab] = useState<AccountsSubTab>(initialTab)
  const [feedRevision, setFeedRevision] = useState(0)

  // Synchronize activeTab if initialTab prop changes (e.g. from sidebar deep links)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // Sync operational records (billing, pharmacy) into ledger on entry
  useEffect(() => {
    syncOperationalFeed()
      .then(() => setFeedRevision((r) => r + 1))
      .catch(() => {})
  }, [])

  const tabs: { key: AccountsSubTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { key: "dashboard", label: "Finance Dashboard", icon: LayoutDashboard },
    { key: "coa", label: "Chart of Accounts", icon: Layers },
    { key: "gl", label: "General Ledger & Journals", icon: BookOpen },
    { key: "receipts", label: "Receipt Vouchers", icon: Receipt },
    { key: "payments", label: "Payment Vouchers", icon: CreditCard },
    { key: "ar", label: "Receivables (AR)", icon: Users },
    { key: "ap", label: "Payables (AP)", icon: Building },
    { key: "cash_bank", label: "Cash & Bank", icon: Landmark },
    { key: "pharmacy", label: "Pharmacy Accounts", icon: Pill },
    { key: "insurance", label: "Insurance Accounts", icon: ShieldCheck },
    { key: "tax", label: "GST & Tax Setup", icon: Percent },
    { key: "budget", label: "Budgeting & Cost Centres", icon: PieChart },
    { key: "assets", label: "Fixed Assets", icon: Calculator },
    { key: "statements", label: "Financial Statements", icon: FileSpreadsheet },
    { key: "closing", label: "Period Closing", icon: Lock },
    { key: "audit", label: "Audit & Integrations", icon: ShieldAlert },
    { key: "manager", label: "Finance Manager Hub", icon: UserCheck },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-[#F4F6F9] min-h-screen text-[#0F172A]">
      {/* ── Domain Hero Header ────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#DDE2EC] px-6 py-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-none text-[#1B4FD8] shadow-xs">
              <Landmark size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight leading-none">
                  Accounts & Financial Management
                </h1>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-none bg-[#166534] text-white uppercase tracking-wider">
                  ENTERPRISE ERP
                </span>
              </div>
              <p className="text-[12px] text-[#64748B] mt-1 flex items-center gap-2">
                <span>Double-Entry General Ledger, Sub-Ledgers, Tax Engine, Budgeting & Financial Statements</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[12px] font-medium">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span>General Ledger Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5 max-w-[1650px] mx-auto">
        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#E2E8F0] scrollbar-thin scrollbar-thumb-slate-300">
          {tabs.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-none text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-[#1B4FD8] text-white shadow-md shadow-blue-500/20 ring-1 ring-blue-400/40"
                    : "bg-white text-[#475569] border border-[#CBD5E1] hover:text-[#0F172A] hover:bg-gray-50 shadow-xs"
                }`}
              >
                <Icon size={15} />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Main Workspace Render */}
        <div className="mt-4">
          {activeTab === "dashboard" && (
            <FinanceDashboard onNavigate={setActiveTab} feedRevision={feedRevision} />
          )}
          {activeTab === "coa" && <ChartOfAccountsView />}
          {activeTab === "gl" && <JournalsView />}
          {activeTab === "receipts" && <ReceiptsView />}
          {activeTab === "payments" && <VouchersView />}
          {activeTab === "ar" && <AgeingView ledger="AR" />}
          {activeTab === "ap" && <AgeingView ledger="AP" />}
          {activeTab === "cash_bank" && <CashBankView />}
          {activeTab === "pharmacy" && <PharmacyAccountsView />}
          {activeTab === "insurance" && <InsuranceAccountsView />}
          {activeTab === "tax" && <TaxManagementView />}
          {activeTab === "budget" && <BudgetingView />}
          {activeTab === "assets" && <FixedAssetsView />}
          {activeTab === "statements" && <FinancialStatementsView />}
          {activeTab === "closing" && <PeriodClosingView />}
          {activeTab === "audit" && <PostingAuditView />}
          {activeTab === "manager" && <VouchersView focus="approvals" />}
        </div>
      </div>
    </div>
  )
}
