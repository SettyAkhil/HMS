import { useState, useMemo, useEffect } from "react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import {
  Download,
  FileText,
  Printer,
  ChevronDown,
  ChevronRight,
  Calendar,
  RotateCcw,
  Search,
  ArrowLeft,
  TrendingUp,
  AlertTriangle,
  Clock,
  Package,
  ShoppingCart,
  Truck,
  CheckCircle2,
  AlertCircle,
  LayoutDashboard,
  ShoppingBag,
  ArrowRight,
} from "lucide-react"
import PageHeader from "../components/PageHeader"
import { usePharmacyData } from "../data/usePharmacyData"
import { PharmacyDatabase } from "../../../services/pharmacyDb"

// 5 Structured Report Categories (Zero Profit/Margin Metrics)
interface ReportCategory {
  id: string
  label: string
  items: string[]
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    id: "sales",
    label: "SALES REPORTS",
    items: [
      "Daily Sales",
      "Monthly Sales",
      "Medicine-wise Sales",
      "Category-wise Sales",
      "Pharmacist-wise Sales",
    ],
  },
  {
    id: "inventory",
    label: "INVENTORY REPORTS",
    items: [
      "Stock Report",
      "Stock Valuation",
      "Expiry Report",
      "Low Stock Report",
      "Out-of-Stock Report",
      "Fast-Moving Medicines",
      "Slow-Moving Medicines",
      "Medicine Write-Offs",
    ],
  },
  {
    id: "purchase",
    label: "PURCHASE REPORTS",
    items: [
      "Purchase Report",
      "Purchase Order Report",
      "GRN / Goods Received Report",
      "Supplier-wise Purchase Report",
      "Pending Purchase Report",
    ],
  },
  {
    id: "returns",
    label: "RETURNS & REFUNDS",
    items: [
      "Medicine Returns",
      "Refund Report",
      "Return Reasons",
      "Medicine-wise Returns",
      "Return Trends",
    ],
  },
  {
    id: "suppliers",
    label: "SUPPLIER REPORTS",
    items: [
      "Supplier Overview",
      "Supplier-wise Purchases",
      "Supplier Order History",
      "Supplier Returns",
      "Pending Supplier Deliveries",
    ],
  },
]

interface ReportsProps {
  onNavigate: (page: string) => void
}

export default function Reports({ onNavigate }: ReportsProps) {
  const {
    bills,
    medicines,
    batches,
    expiringMedicines,
    suppliers,
    purchaseOrders,
    grns,
    categories,
    stockTransactions,
    writeOffs,
    refresh,
  } = usePharmacyData()

  // Navigation State
  const [activeReport, setActiveReport] = useState<string>("Overview")
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    sales: true,
    inventory: true,
    purchase: true,
    returns: true,
    suppliers: true,
  })

  // Date Filter State (Defaults dynamically to current month)
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0]
  })
  const [activePreset, setActivePreset] = useState<string>("This Month")

  // Detailed Report Search State
  const [tableSearch, setTableSearch] = useState<string>("")

  // Toggle Category Accordion
  const toggleCategory = (catId: string) => {
    setExpandedCats((prev) => ({ ...prev, [catId]: !prev[catId] }))
  }

  // Quick Date Filter Presets
  const applyPreset = (preset: string) => {
    setActivePreset(preset)
    const now = new Date()
    const todayStr = now.toISOString().split("T")[0]

    if (preset === "Today") {
      setStartDate(todayStr)
      setEndDate(todayStr)
    } else if (preset === "This Week") {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      setStartDate(d.toISOString().split("T")[0])
      setEndDate(todayStr)
    } else if (preset === "This Month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0]
      setStartDate(firstDay)
      setEndDate(todayStr)
    } else if (preset === "Last Month") {
      const firstDayLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      )
        .toISOString()
        .split("T")[0]
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)
        .toISOString()
        .split("T")[0]
      setStartDate(firstDayLastMonth)
      setEndDate(lastDayLastMonth)
    } else if (preset === "All Time") {
      setStartDate("2026-01-01")
      setEndDate(todayStr)
    }
  }

  const handleResetFilters = () => {
    applyPreset("This Month")
    setTableSearch("")
  }

  // Returns data from database (reactive to usePharmacyData refresh)
  const allReturns = useMemo(
    () => PharmacyDatabase.getReturns(),
    [bills],
  )

  // O(1) Medicine Lookup Map to eliminate quadratic nested loops
  const medMap = useMemo(
    () => new Map(medicines.map((m) => [m.id, m])),
    [medicines],
  )

  // Filtered Datasets based on Date Range
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Exclude modified bills from sales aggregations to prevent double-counting
      if (b.billNumber.startsWith("MOD-") || b.isModifiedReturnBill)
        return false
      const bDate = (b.billDate || b.createdAt || "").split("T")[0]
      if (!bDate) return true
      return bDate >= startDate && bDate <= endDate
    })
  }, [bills, startDate, endDate])

  const filteredReturns = useMemo(() => {
    return allReturns.filter((r) => {
      const rDate = (r.createdAt || "").split("T")[0]
      if (!rDate) return true
      return rDate >= startDate && rDate <= endDate
    })
  }, [allReturns, startDate, endDate])

  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((p) => {
      const pDate = (p.date || "").split("T")[0]
      if (!pDate) return true
      return pDate >= startDate && pDate <= endDate
    })
  }, [purchaseOrders, startDate, endDate])

  // 1. Overview KPIs
  // 1. Overview KPIs
  // Total Refund = Total refund amount issued for returned medicines
  const totalRefund = useMemo(() => {
    return filteredReturns.reduce((sum, r) => sum + (r.refundAmount || 0), 0)
  }, [filteredReturns])

  const totalGrossRevenue = useMemo(() => {
    return filteredBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0)
  }, [filteredBills])

  // Total Revenue = Completed pharmacy sales revenue minus refunds
  const totalRevenue = Math.max(0, totalGrossRevenue - totalRefund)

  // Total Transactions = Number of completed pharmacy sales transactions
  const totalTransactions = filteredBills.length

  // Net Revenue = Total Revenue after returns
  const netRevenue = totalRevenue

  // Average Bill = Average net transaction value
  const averageBill =
    totalTransactions > 0 ? netRevenue / totalTransactions : 0

  // 2. Sales Analytics Calculations
  const salesTrendData = useMemo(() => {
    const map: Record<
      string,
      { date: string ;revenue: number ;gross: number ;refunds: number ;orders: number }
    > = {}

    filteredBills.forEach((b) => {
      const rawDate = (b.billDate || b.createdAt || "").split("T")[0]
      const displayDate = rawDate
        ? new Date(rawDate).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
          })
        : "Recent"
      if (!map[displayDate]) {
        map[displayDate] = { date: displayDate, revenue: 0, gross: 0, refunds: 0, orders: 0 }
      }
      map[displayDate].gross += b.totalAmount || 0
      map[displayDate].revenue += b.totalAmount || 0
      map[displayDate].orders += 1
    })

    filteredReturns.forEach((r) => {
      const rawDate = (r.createdAt || "").split("T")[0]
      const displayDate = rawDate
        ? new Date(rawDate).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
          })
        : "Recent"
      if (!map[displayDate]) {
        map[displayDate] = { date: displayDate, revenue: 0, gross: 0, refunds: 0, orders: 0 }
      }
      map[displayDate].refunds += r.refundAmount || 0
      // Deduct refunds from revenue so trend reflects sales after returns
      map[displayDate].revenue = Math.max(0, map[displayDate].gross - map[displayDate].refunds)
    })

    const result = Object.values(map)
    if (result.length === 0) {
      return [{ date: "No Sales", revenue: 0, gross: 0, refunds: 0, orders: 0 }]
    }
    return result
  }, [filteredBills, filteredReturns])

  const topMedicinesSales = useMemo(() => {
    const map: Record<
      string,
      {
        name: string
        grossQuantity: number
        returnedQuantity: number
        quantity: number
        grossSales: number
        refundAmount: number
        sales: number
      }
    > = {}

    filteredBills.forEach((b) => {
      ;(b.items || []).forEach((item) => {
        const name = item.medicineName || "Unknown Medicine"
        if (!map[name]) {
          map[name] = {
            name,
            grossQuantity: 0,
            returnedQuantity: 0,
            quantity: 0,
            grossSales: 0,
            refundAmount: 0,
            sales: 0,
          }
        }
        const itemSales =
          item.grossAmount ||
          item.totalPrice ||
          (item.quantity || 0) * (item.unitPrice || 0)
        map[name].grossQuantity += item.quantity || 0
        map[name].grossSales += itemSales
      })
    })

    filteredReturns.forEach((r) => {
      ;(r.items || []).forEach((item: any) => {
        const name = item.medicineName || "Unknown Medicine"
        if (!map[name]) {
          map[name] = {
            name,
            grossQuantity: 0,
            returnedQuantity: 0,
            quantity: 0,
            grossSales: 0,
            refundAmount: 0,
            sales: 0,
          }
        }
        map[name].returnedQuantity += item.returnQuantity || 0
        map[name].refundAmount += item.refundAmount || 0
      })
    })

    Object.values(map).forEach((m) => {
      m.quantity = m.grossQuantity
      m.sales = m.grossSales
    })

    return Object.values(map)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
  }, [filteredBills, filteredReturns])

  // 3. Inventory Overview Calculations
  const totalStockItems = medicines.length
  const lowStockCount = medicines.filter(
    (m) => m.stock > 0 && m.stock <= m.reorderLevel,
  ).length
  const outOfStockCount = medicines.filter((m) => m.stock === 0).length

  const validBatches = useMemo(() => {
    return batches.filter((b) => medMap.has(b.medicineId))
  }, [batches, medMap])

  const expiryGroups = useMemo(() => {
    const nowMs = Date.now()
    let expired = 0
    let within30 = 0
    let within60 = 0
    let within90 = 0

    validBatches.forEach((b) => {
      const expMs = new Date(b.expiryDate).getTime()
      const daysLeft = Math.ceil((expMs - nowMs) / (24 * 60 * 60 * 1000))
      if (daysLeft < 0) expired++
      else if (daysLeft <= 30) within30++
      else if (daysLeft <= 60) within60++
      else if (daysLeft <= 90) within90++
    })

    return {
      expired,
      within30,
      within60,
      within90,
      expiringSoon: within30 + within60 + within90,
    }
  }, [validBatches])

  const totalStockValuation = useMemo(() => {
    return validBatches.reduce((sum, b) => {
      const unitCost = b.purchasePrice || (b.mrp ? b.mrp * 0.7 : 0)
      return sum + b.availableQuantity * unitCost
    }, 0)
  }, [validBatches])

  const stockByCategory = useMemo(() => {
    const map: Record<string, {
      name: string
      items: number
      totalStock: number
    }> = {}
    medicines.forEach((m) => {
      const cat = m.category || "General"
      if (!map[cat]) map[cat] = { name: cat, items: 0, totalStock: 0 }
      map[cat].items += 1
      map[cat].totalStock += m.stock
    })
    return Object.values(map).slice(0, 5)
  }, [medicines])

  // 4. Purchase Overview Calculations
  const totalPurchaseOrders = filteredPOs.length
  const totalPurchaseValue = filteredPOs.reduce(
    (sum, p) => sum + (p.total || 0),
    0,
  )
  const pendingPurchaseOrders = filteredPOs.filter(
    (p) => p.status !== "Received" && p.status !== "Cancelled",
  ).length

  const supplierPurchasesData = useMemo(() => {
    const map: Record<string, {
      supplier: string
      orders: number
      totalValue: number
    }> = {}
    filteredPOs.forEach((p) => {
      const sName = p.supplier || "Supplier"
      if (!map[sName])
        map[sName] = { supplier: sName, orders: 0, totalValue: 0 }
      map[sName].orders += 1
      map[sName].totalValue += p.total || 0
    })
    return Object.values(map)
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5)
  }, [filteredPOs])

  // 5. Returns & Refunds Analytics
  const totalReturnTransactions = filteredReturns.length
  const totalReturnedQuantity = useMemo(() => {
    return filteredReturns.reduce((sum, r) => {
      if (r.items && r.items.length > 0) {
        return sum + r.items.reduce((s, i) => s + (i.returnQuantity || 0), 0)
      }
      return sum + (r.returnQuantity || 0)
    }, 0)
  }, [filteredReturns])

  const returnReasonsData = useMemo(() => {
    const map: Record<string, number> = {}
    filteredReturns.forEach((r) => {
      const reason = r.returnReason || "Other"
      map[reason] = (map[reason] || 0) + 1
    })
    return Object.keys(map).map((reason) => ({
      name: reason,
      count: map[reason],
      pct: Math.round((map[reason] / (totalReturnTransactions || 1)) * 100),
    }))
  }, [filteredReturns, totalReturnTransactions])

  // 6. Category-wise Sales Calculation
  const categorySalesData = useMemo(() => {
    const map: Record<string, {
      category: string
      unitsSold: number
      revenue: number
      billsCount: Set<string>
    }> = {}
    filteredBills.forEach((b) => {
      ;(b.items || []).forEach((item) => {
        const med = medicines.find(
          (m) => m.id === item.medicineId || m.name === item.medicineName,
        )
        const cat = med?.category || "General"
        if (!map[cat]) {
          map[cat] = {
            category: cat,
            unitsSold: 0,
            revenue: 0,
            billsCount: new Set(),
          }
        }
        map[cat].unitsSold += item.quantity || 0
        map[cat].revenue +=
          item.grossAmount ||
          item.totalPrice ||
          (item.quantity || 0) * (item.unitPrice || 0)
        if (b.billNumber) map[cat].billsCount.add(b.billNumber)
      })
    })
    return Object.values(map)
      .map((c) => ({
        category: c.category,
        unitsSold: c.unitsSold,
        revenue: c.revenue,
        billsCount: c.billsCount.size,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredBills, medicines])

  // 7. Pharmacist-wise Sales Calculation
  const pharmacistSalesData = useMemo(() => {
    const map: Record<string, {
      name: string
      billsCount: number
      unitsSold: number
      revenue: number
    }> = {}
    filteredBills.forEach((b) => {
      const pharmacist = b.pharmacistId || b.createdBy || "Dispensing Staff"
      if (!map[pharmacist]) {
        map[pharmacist] = {
          name: pharmacist,
          billsCount: 0,
          unitsSold: 0,
          revenue: 0,
        }
      }
      map[pharmacist].billsCount += 1
      map[pharmacist].revenue += b.totalAmount || 0
      ;(b.items || []).forEach((item) => {
        map[pharmacist].unitsSold += item.quantity || 0
      })
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [filteredBills])

  // 8. Detailed Batches for Expiry Report
  const detailedExpiryBatches = useMemo(() => {
    const nowMs = Date.now()
    return validBatches
      .map((b) => {
        const med = medMap.get(b.medicineId)
        const expMs = new Date(b.expiryDate).getTime()
        const daysLeft = Math.ceil((expMs - nowMs) / (24 * 60 * 60 * 1000))
        let status: "expired" | "critical" | "warning" | "valid" = "valid"
        if (daysLeft < 0) status = "expired"
        else if (daysLeft <= 30) status = "critical"
        else if (daysLeft <= 90) status = "warning"

        return {
          id: b.id,
          medicineName: med?.name || "Unknown Medicine",
          genericName: med?.generic || "",
          category: med?.category || "General",
          batchNumber: b.batchNumber,
          availableQuantity: b.availableQuantity,
          expiryDate: b.expiryDate,
          daysLeft,
          status,
        }
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [validBatches, medMap])

  // 9. Detailed Stock List
  const detailedStockList = useMemo(() => {
    return medicines.map((m) => {
      const valuation = (m.stock || 0) * (m.price || m.mrp || 0)
      let status: "in_stock" | "low_stock" | "out_of_stock" = "in_stock"
      if (m.stock === 0) status = "out_of_stock"
      else if (m.stock <= m.reorderLevel) status = "low_stock"

      const unitsSold = filteredBills.reduce((sum, b) => {
        const item = (b.items || []).find(
          (i) => i.medicineId === m.id || i.medicineName === m.name,
        )
        return sum + (item?.quantity || 0)
      }, 0)

      return {
        id: m.id,
        name: m.name,
        generic: m.generic || "",
        category: m.category || "General",
        stock: m.stock,
        unit: (m as any).unit || m.form || "Tablets",
        reorderLevel: m.reorderLevel,
        price: m.price || m.mrp || 0,
        valuation,
        unitsSold,
        status,
      }
    })
  }, [medicines, filteredBills])

  // 10A. Supplier Overview List & Summary (Supplier Master + Procurement Activity)
  const supplierOverviewList = useMemo(() => {
    return suppliers
      .map((s) => {
        const pos = filteredPOs.filter(
          (p) =>
            p.supplierId === s.id ||
            p.supplier === s.supplierName ||
            p.supplier === s.name,
        )
        const ordersCount = pos.length
        const totalPurchaseValue = pos.reduce(
          (sum, p) => sum + (p.total || 0),
          0,
        )
        const pendingDeliveries = pos.filter(
          (p) => p.status !== "Received" && p.status !== "Cancelled",
        ).length
        return {
          id: s.id,
          name: s.name || s.supplierName || "Supplier",
          contact: s.contact || s.contactInformation || "N/A",
          phone: s.phone || "N/A",
          email: s.email || "N/A",
          gstin: s.gstin || s.gstInformation || "N/A",
          ordersCount,
          totalPurchaseValue,
          pendingDeliveries,
          status: s.status || "Active",
        }
      })
      .sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue)
  }, [suppliers, filteredPOs])

  const supplierOverviewSummary = useMemo(() => {
    const activeSuppliers = suppliers.filter(
      (s) => s.status === "Active",
    ).length
    const suppliersWithPending = supplierOverviewList.filter(
      (s) => s.pendingDeliveries > 0,
    ).length
    const totalOrders = supplierOverviewList.reduce(
      (sum, s) => sum + s.ordersCount,
      0,
    )
    const totalSpend = supplierOverviewList.reduce(
      (sum, s) => sum + s.totalPurchaseValue,
      0,
    )
    return {
      activeSuppliers,
      suppliersWithPending,
      totalOrders,
      totalSpend,
    }
  }, [suppliers, supplierOverviewList])

  // 10B. Supplier-wise Purchases List & Summary (Purchasing Activity Grouped by Supplier)
  const supplierWisePurchasesList = useMemo(() => {
    return suppliers
      .map((s) => {
        const pos = filteredPOs.filter(
          (p) =>
            p.supplierId === s.id ||
            p.supplier === s.supplierName ||
            p.supplier === s.name,
        )
        const purchaseOrdersCount = pos.length
        const totalPurchaseValue = pos.reduce(
          (sum, p) => sum + (p.total || 0),
          0,
        )

        // Calculate received value from GRNs for this supplier's POs
        const goodsReceivedValue = pos.reduce((sum, p) => {
          const pGRNs = grns.filter((g) => g.purchaseOrderId === p.id)
          if (pGRNs.length > 0) {
            return (
              sum +
              pGRNs.reduce(
                (sVal, g) =>
                  sVal +
                  (g.items || []).reduce(
                    (si, item) =>
                      si + (item.receivedQty || 0) * (item.purchasePrice || 0),
                    0,
                  ),
                0,
              )
            )
          }
          return sum + (p.status === "Received" ? p.total || 0 : 0)
        }, 0)

        const pendingPurchaseValue = pos
          .filter((p) => p.status !== "Received" && p.status !== "Cancelled")
          .reduce((sum, p) => {
            const pGRNs = grns.filter((g) => g.purchaseOrderId === p.id)
            const recVal = pGRNs.reduce(
              (sVal, g) =>
                sVal +
                (g.items || []).reduce(
                  (si, item) =>
                    si + (item.receivedQty || 0) * (item.purchasePrice || 0),
                  0,
                ),
              0,
            )
            return sum + Math.max(0, (p.total || 0) - recVal)
          }, 0)

        // Collect unique medicines purchased
        const medIds = new Set<string>()
        pos.forEach((p) =>
          (p.items || []).forEach((i) => medIds.add(i.medicineId)),
        )
        const itemsCount = medIds.size

        // Find last purchase date
        const sortedDates = pos
          .map((p) => p.date || (p as any).poDate || "")
          .filter(Boolean)
          .sort()
          .reverse()
        const lastPurchaseDate = sortedDates[0] || "N/A"

        return {
          id: s.id,
          supplierName: s.name || s.supplierName || "Supplier",
          purchaseOrdersCount,
          totalPurchaseValue,
          goodsReceivedValue,
          pendingPurchaseValue,
          itemsCount,
          lastPurchaseDate,
        }
      })
      .sort((a, b) => b.totalPurchaseValue - a.totalPurchaseValue)
  }, [suppliers, filteredPOs, grns])

  const supplierWisePurchasesSummary = useMemo(() => {
    const totalPOs = supplierWisePurchasesList.reduce(
      (sum, s) => sum + s.purchaseOrdersCount,
      0,
    )
    const totalPurchaseValue = supplierWisePurchasesList.reduce(
      (sum, s) => sum + s.totalPurchaseValue,
      0,
    )
    const totalReceivedValue = supplierWisePurchasesList.reduce(
      (sum, s) => sum + s.goodsReceivedValue,
      0,
    )
    const totalPendingValue = supplierWisePurchasesList.reduce(
      (sum, s) => sum + s.pendingPurchaseValue,
      0,
    )
    return {
      totalPOs,
      totalPurchaseValue,
      totalReceivedValue,
      totalPendingValue,
    }
  }, [supplierWisePurchasesList])

  // 10C. Supplier Order History List & Summary (Each row represents ONE purchase order)
  const supplierOrderHistoryList = useMemo(() => {
    return filteredPOs
      .map((po) => {
        const poGRNs = grns.filter((g) => g.purchaseOrderId === po.id)
        const items = po.items && po.items.length > 0 ? po.items : []
        const orderedQuantity = items.reduce(
          (sum, i) => sum + (i.quantity || 0),
          0,
        )

        let receivedQuantity = 0
        items.forEach((item) => {
          const grnRec = poGRNs.reduce((s, g) => {
            const gi = (g.items || []).find(
              (it) => it.medicineId === item.medicineId,
            )
            return s + (gi?.receivedQty || 0)
          }, 0)
          if (grnRec > 0) {
            receivedQuantity += grnRec
          } else if (po.status === "Received") {
            receivedQuantity += item.quantity || 0
          }
        })

        return {
          id: po.id,
          supplierName: po.supplier,
          poDate: po.date || (po as any).poDate || "N/A",
          expectedDelivery:
            po.expected || (po as any).expectedDeliveryDate || "N/A",
          itemsCount: items.length,
          orderedQuantity,
          receivedQuantity,
          totalOrderValue: po.total || (po as any).totalOrderValue || 0,
          orderStatus: po.status,
        }
      })
      .sort((a, b) => (b.poDate || "").localeCompare(a.poDate || ""))
  }, [filteredPOs, grns])

  const supplierOrderHistorySummary = useMemo(() => {
    const totalOrders = supplierOrderHistoryList.length
    const ordered = supplierOrderHistoryList.filter(
      (p) => p.orderStatus === "Ordered",
    ).length
    const partiallyReceived = supplierOrderHistoryList.filter(
      (p) => p.orderStatus === "Partially Received",
    ).length
    const received = supplierOrderHistoryList.filter(
      (p) => p.orderStatus === "Received",
    ).length
    const cancelled = supplierOrderHistoryList.filter(
      (p) => p.orderStatus === "Cancelled",
    ).length
    return {
      totalOrders,
      ordered,
      partiallyReceived,
      received,
      cancelled,
    }
  }, [supplierOrderHistoryList])

  // 10D. Supplier Returns List & Summary (Procurement returns back to suppliers)
  const rawSupplierReturns = useMemo(
    () => PharmacyDatabase.getSupplierReturns(),
    [bills, purchaseOrders],
  )

  const supplierReturnsList = useMemo(() => {
    return rawSupplierReturns
      .filter((r) => {
        const rDate = (r.createdAt || "").split("T")[0]
        if (!rDate) return true
        return rDate >= startDate && rDate <= endDate
      })
      .map((r) => {
        const sup = suppliers.find((s) => s.id === r.supplierId)
        const med = medicines.find((m) => m.id === r.medicineId)
        const batch = batches.find(
          (b) => b.id === r.batchId || b.batchNumber === r.batchId,
        )
        const returnAmount =
          r.returnAmount ||
          (r.quantity || 0) * (r.purchaseRate || batch?.purchasePrice || (med as any)?.purchasePrice || 0)

        return {
          id: r.id,
          debitNoteNumber: r.debitNoteNumber || r.id,
          supplierName:
            r.supplierName || sup?.name || sup?.supplierName || r.supplierId,
          medicineName:
            r.medicineName || med?.name || (med as any)?.medicineName || r.medicineId,
          batchNumber: r.batchNumber || batch?.batchNumber || r.batchId || "N/A",
          returnedQuantity: r.quantity || 0,
          returnAmount,
          returnReason: r.reason,
          returnDate: r.createdAt
            ? new Date(r.createdAt).toLocaleDateString("en-IN")
            : "N/A",
          status: r.status,
          creditNoteId: r.creditNoteId || "—",
        }
      })
  }, [rawSupplierReturns, startDate, endDate, suppliers, medicines, batches])

  const supplierReturnsSummary = useMemo(() => {
    const totalReturns = supplierReturnsList.length
    const totalUnits = supplierReturnsList.reduce(
      (sum, r) => sum + r.returnedQuantity,
      0,
    )
    const totalAmount = supplierReturnsList.reduce(
      (sum, r) => sum + (r.returnAmount || 0),
      0,
    )
    const creditNotes = supplierReturnsList.filter(
      (r) => r.creditNoteId && r.creditNoteId !== "—",
    ).length
    return {
      totalReturns,
      totalUnits,
      totalAmount,
      creditNotes,
    }
  }, [supplierReturnsList])

  // 10E. Pending Supplier Deliveries List & Summary (POs still awaiting delivery)
  const pendingSupplierDeliveriesList = useMemo(() => {
    const nowMs = Date.now()

    return filteredPOs
      .filter((p) => p.status !== "Received" && p.status !== "Cancelled")
      .map((po) => {
        const poGRNs = grns.filter((g) => g.purchaseOrderId === po.id)
        const items = po.items && po.items.length > 0 ? po.items : []
        const itemsOrdered = items.reduce(
          (sum, i) => sum + (i.quantity || 0),
          0,
        )

        let itemsReceived = 0
        items.forEach((item) => {
          const grnRec = poGRNs.reduce((s, g) => {
            const gi = (g.items || []).find(
              (it) => it.medicineId === item.medicineId,
            )
            return s + (gi?.receivedQty || 0)
          }, 0)
          if (grnRec > 0) itemsReceived += grnRec
        })

        const itemsPending = Math.max(0, itemsOrdered - itemsReceived)
        const totalVal = po.total || (po as any).totalOrderValue || 0
        const pendingValue =
          itemsOrdered > 0 ? totalVal * (itemsPending / itemsOrdered) : totalVal

        const expDelivery =
          po.expected || (po as any).expectedDeliveryDate || "N/A"
        let isOverdue = false
        let scheduleText = "Pending"
        if (expDelivery !== "N/A") {
          const expMs = new Date(expDelivery).getTime()
          const diffDays = Math.ceil((expMs - nowMs) / (24 * 60 * 60 * 1000))
          if (diffDays < 0) {
            isOverdue = true
            scheduleText = `${Math.abs(diffDays)}d Overdue`
          } else {
            scheduleText = `Due in ${diffDays}d`
          }
        }

        const deliveryStatus = isOverdue ? "Overdue" : po.status

        return {
          id: po.id,
          supplierName: po.supplier,
          poDate: po.date || (po as any).poDate || "N/A",
          expectedDelivery: expDelivery,
          isOverdue,
          scheduleText,
          itemsOrdered,
          itemsReceived,
          itemsPending,
          pendingValue,
          deliveryStatus,
        }
      })
      .filter((p) => p.itemsPending > 0)
  }, [filteredPOs, grns])

  const pendingSupplierDeliveriesSummary = useMemo(() => {
    const pendingOrders = pendingSupplierDeliveriesList.length
    const pendingItems = pendingSupplierDeliveriesList.reduce(
      (sum, p) => sum + p.itemsPending,
      0,
    )
    const pendingValue = pendingSupplierDeliveriesList.reduce(
      (sum, p) => sum + p.pendingValue,
      0,
    )
    const overdueDeliveries = pendingSupplierDeliveriesList.filter(
      (p) => p.isOverdue,
    ).length
    return {
      pendingOrders,
      pendingItems,
      pendingValue,
      overdueDeliveries,
    }
  }, [pendingSupplierDeliveriesList])

  // 11. Detailed GRNs List
  const detailedGRNsList = useMemo(() => {
    return grns.map((g) => {
      const po = purchaseOrders.find((p) => p.id === g.purchaseOrderId)
      const supplier = suppliers.find((s) => s.id === g.supplierId)
      const supplierName = supplier?.name || po?.supplier || "Vendor"
      const totalValue = (g.items || []).reduce(
        (sum, item) =>
          sum + (item.receivedQty || 0) * (item.purchasePrice || 0),
        0,
      )
      return {
        id: g.id,
        grnNumber: (g as any).grnNumber || g.id,
        poNumber: po ? po.id : g.purchaseOrderId,
        supplier: supplierName,
        receivedDate: g.grnDate || g.createdAt,
        itemsCount: (g.items || []).length,
        invoiceNumber: g.invoiceNumber || "N/A",
        totalValue,
        status: "Received",
      }
    })
  }, [grns, purchaseOrders, suppliers])

  // 12. Detailed Procurement Activity List (for Purchase Report)
  const procurementActivityList = useMemo(() => {
    const list: Array<{
      id: string
      purchaseDate: string
      poNumber: string
      supplierId: string
      supplierName: string
      medicineId: string
      medicineName: string
      genericName: string
      quantityPurchased: number
      quantityReceived: number
      pendingQuantity: number
      unitPrice: number
      purchaseValue: number
      grnNumber?: string
      grnStatus: string
      poStatus: string
    }> = []

    filteredPOs.forEach((po) => {
      const poGRNs = grns.filter((g) => g.purchaseOrderId === po.id)
      const items = po.items && po.items.length > 0 ? po.items : []

      items.forEach((item, idx) => {
        const med = medicines.find((m) => m.id === item.medicineId)
        const medName =
          med?.name || (med as any)?.medicineName || item.medicineId
        const genName = med?.generic || (med as any)?.genericName || ""
        const orderedQty = item.quantity || 0

        // Calculate quantity received from GRNs matching this PO and medicine
        const grnMatch = poGRNs.find((g) =>
          (g.items || []).some((gi) => gi.medicineId === item.medicineId),
        )
        const grnReceived = poGRNs.reduce((sum, g) => {
          const gItem = (g.items || []).find(
            (gi) => gi.medicineId === item.medicineId,
          )
          return sum + (gItem?.receivedQty || 0)
        }, 0)

        let receivedQty = 0
        if (grnReceived > 0) {
          receivedQty = grnReceived
        } else if (po.status === "Received") {
          receivedQty = orderedQty
        } else {
          receivedQty = 0
        }

        let pendingQty = 0
        if (po.status === "Received" || po.status === "Cancelled") {
          pendingQty = 0
        } else {
          pendingQty = Math.max(0, orderedQty - receivedQty)
        }

        const unitPrice = item.purchasePrice || 0
        const purchaseValue = item.totalAmount || orderedQty * unitPrice

        let grnStatus = "Pending Receipt"
        if (po.status === "Cancelled") {
          grnStatus = "Cancelled"
        } else if (receivedQty >= orderedQty && orderedQty > 0) {
          grnStatus = grnMatch ? `Received (${grnMatch.id})` : "Fully Received"
        } else if (receivedQty > 0) {
          grnStatus = grnMatch
            ? `Partial (${grnMatch.id})`
            : "Partially Received"
        } else {
          grnStatus =
            po.status === "Ordered" ? "Awaiting Delivery" : "Pending GRN"
        }

        list.push({
          id: `${po.id}-${item.medicineId}-${idx}`,
          purchaseDate: po.date || (po as any).poDate || "N/A",
          poNumber: po.id,
          supplierId: po.supplierId,
          supplierName: po.supplier,
          medicineId: item.medicineId,
          medicineName: medName,
          genericName: genName,
          quantityPurchased: orderedQty,
          quantityReceived: receivedQty,
          pendingQuantity: pendingQty,
          unitPrice,
          purchaseValue,
          grnNumber: grnMatch?.id,
          grnStatus,
          poStatus: po.status,
        })
      })
    })

    return list.sort((a, b) =>
      (b.purchaseDate || "").localeCompare(a.purchaseDate || ""),
    )
  }, [filteredPOs, grns, medicines])

  // Summary Metrics for Purchase Report (Procurement Activity)
  const procurementSummary = useMemo(() => {
    const totalValue = procurementActivityList.reduce(
      (sum, item) => sum + item.purchaseValue,
      0,
    )
    const totalPurchasedQty = procurementActivityList.reduce(
      (sum, item) => sum + item.quantityPurchased,
      0,
    )
    const totalReceivedQty = procurementActivityList.reduce(
      (sum, item) => sum + item.quantityReceived,
      0,
    )
    const totalPendingQty = procurementActivityList.reduce(
      (sum, item) => sum + item.pendingQuantity,
      0,
    )
    const distinctSuppliers = new Set(
      procurementActivityList.map((item) => item.supplierName),
    ).size
    const totalItemsCount = procurementActivityList.length

    return {
      totalValue,
      totalPurchasedQty,
      totalReceivedQty,
      totalPendingQty,
      distinctSuppliers,
      totalItemsCount,
    }
  }, [procurementActivityList])

  // 13. Detailed PO Tracking List (for Purchase Order Report)
  const poTrackingList = useMemo(() => {
    return filteredPOs
      .map((po) => {
        const poGRNs = grns.filter((g) => g.purchaseOrderId === po.id)
        const items = po.items && po.items.length > 0 ? po.items : []

        const orderedQty = items.reduce((sum, i) => sum + (i.quantity || 0), 0)

        let receivedQty = 0
        items.forEach((item) => {
          const grnRec = poGRNs.reduce((s, g) => {
            const gi = (g.items || []).find(
              (it) => it.medicineId === item.medicineId,
            )
            return s + (gi?.receivedQty || 0)
          }, 0)
          if (grnRec > 0) {
            receivedQty += grnRec
          } else if (po.status === "Received") {
            receivedQty += item.quantity || 0
          }
        })

        let pendingQty = 0
        if (po.status === "Received" || po.status === "Cancelled") {
          pendingQty = 0
        } else {
          pendingQty = Math.max(0, orderedQty - receivedQty)
        }

        return {
          id: po.id,
          supplier: po.supplier,
          poDate: po.date || (po as any).poDate || "N/A",
          expectedDelivery:
            po.expected || (po as any).expectedDeliveryDate || "N/A",
          itemsCount: items.length,
          orderedQuantity: orderedQty,
          receivedQuantity: receivedQty,
          pendingQuantity: pendingQty,
          totalOrderValue: po.total || (po as any).totalOrderValue || 0,
          status: po.status,
        }
      })
      .sort((a, b) => (b.poDate || "").localeCompare(a.poDate || ""))
  }, [filteredPOs, grns])

  // Summary Metrics for Purchase Order Report (PO Lifecycle Tracking)
  const poTrackingSummary = useMemo(() => {
    const totalPOs = poTrackingList.length
    const totalValue = poTrackingList.reduce(
      (sum, p) => sum + p.totalOrderValue,
      0,
    )
    const totalOrderedQty = poTrackingList.reduce(
      (sum, p) => sum + p.orderedQuantity,
      0,
    )
    const totalReceivedQty = poTrackingList.reduce(
      (sum, p) => sum + p.receivedQuantity,
      0,
    )
    const totalPendingQty = poTrackingList.reduce(
      (sum, p) => sum + p.pendingQuantity,
      0,
    )
    const fulfillmentRate =
      totalOrderedQty > 0
        ? Math.round((totalReceivedQty / totalOrderedQty) * 100)
        : 0
    const activePOs = poTrackingList.filter(
      (p) => p.status !== "Received" && p.status !== "Cancelled",
    ).length

    return {
      totalPOs,
      totalValue,
      totalOrderedQty,
      totalReceivedQty,
      totalPendingQty,
      fulfillmentRate,
      activePOs,
    }
  }, [poTrackingList])

  // 14. Detailed Returned Items List (for Medicine Returns)
  const returnedItemsList = useMemo(() => {
    const items: Array<{
      id: string
      returnNumber: string
      originalBillNumber: string
      patientName: string
      patientUhid: string
      medicineId: string
      medicineName: string
      batchNumber: string
      returnQuantity: number
      unitPrice: number
      returnReason: string
      refundAmount: number
      returnDate: string
      status: string
    }> = []

    filteredReturns.forEach((r, rIdx) => {
      const returnNumber = r.returnNumber || r.id
      const originalBillNumber =
        r.originalBillNumber || r.originalBillId || "N/A"
      const patientName = r.patientName || "Walk-in Patient"
      const patientUhid = r.patientUhid || "N/A"
      const returnReason = r.returnReason || "Patient Return"
      const returnDate = r.createdAt
      const status = r.status || "Completed"

      if (r.items && r.items.length > 0) {
        r.items.forEach((item, iIdx) => {
          const med = medicines.find((m) => m.id === item.medicineId)
          const medName =
            item.medicineName ||
            med?.name ||
            (med as any)?.medicineName ||
            item.medicineId
          const unitPrice =
            item.unitPrice ||
            (item.returnQuantity > 0
              ? item.refundAmount / item.returnQuantity
              : 0)
          items.push({
            id: `${r.id}-${item.medicineId || iIdx}-${iIdx}`,
            returnNumber,
            originalBillNumber,
            patientName,
            patientUhid,
            medicineId: item.medicineId || `MED-${iIdx}`,
            medicineName: medName,
            batchNumber: item.batchNumber || "N/A",
            returnQuantity: item.returnQuantity || 0,
            unitPrice,
            returnReason,
            refundAmount: item.refundAmount || item.returnQuantity * unitPrice,
            returnDate,
            status,
          })
        })
      } else {
        // Fallback for single-item legacy structure
        const med = medicines.find((m) => m.id === r.medicineId)
        const medName =
          med?.name ||
          (med as any)?.medicineName ||
          r.medicineId ||
          "Returned Medicine"
        const returnQty = r.returnQuantity || 1
        const refundAmt = r.refundAmount || 0
        const unitPrice = returnQty > 0 ? refundAmt / returnQty : 0
        items.push({
          id: `${r.id}-0`,
          returnNumber,
          originalBillNumber,
          patientName,
          patientUhid,
          medicineId: r.medicineId || "MED-0",
          medicineName: medName,
          batchNumber: r.batchNumber || "N/A",
          returnQuantity: returnQty,
          unitPrice,
          returnReason,
          refundAmount: refundAmt,
          returnDate,
          status,
        })
      }
    })

    return items.sort((a, b) =>
      (b.returnDate || "").localeCompare(a.returnDate || ""),
    )
  }, [filteredReturns, medicines])

  // 15. Financial Refund Report Summary
  const refundReportSummary = useMemo(() => {
    const totalRefund = filteredReturns.reduce(
      (sum, r) => sum + (r.refundAmount || 0),
      0,
    )
    const count = filteredReturns.length
    const avgRefund = count > 0 ? totalRefund / count : 0
    return {
      totalRefund,
      transactionsCount: count,
      avgRefund,
    }
  }, [filteredReturns])

  // 16. Return Reasons Aggregation
  const returnReasonsAggregation = useMemo(() => {
    const map: Record<string, {
      reason: string
      returnsCount: number
      unitsReturned: number
      totalRefund: number
    }> = {}
    let totalReturns = 0
    let totalRefundAll = 0

    filteredReturns.forEach((r) => {
      const reason = r.returnReason?.trim() || "Other / Unspecified"
      if (!map[reason]) {
        map[reason] = {
          reason,
          returnsCount: 0,
          unitsReturned: 0,
          totalRefund: 0,
        }
      }
      map[reason].returnsCount += 1
      map[reason].totalRefund += r.refundAmount || 0

      const itemsQty =
        r.items && r.items.length > 0
          ? r.items.reduce((s, i) => s + (i.returnQuantity || 0), 0)
          : r.returnQuantity || 1
      map[reason].unitsReturned += itemsQty

      totalReturns += 1
      totalRefundAll += r.refundAmount || 0
    })

    return Object.values(map)
      .map((entry) => ({
        ...entry,
        returnsPercentage:
          totalReturns > 0 ? (entry.returnsCount / totalReturns) * 100 : 0,
        refundPercentage:
          totalRefundAll > 0 ? (entry.totalRefund / totalRefundAll) * 100 : 0,
      }))
      .sort((a, b) => b.returnsCount - a.returnsCount)
  }, [filteredReturns])

  // 17. Medicine-wise Returns Aggregation
  const medicineWiseReturnsAggregation = useMemo(() => {
    const map: Record<string, {
      medicineId: string
      medicineName: string
      genericName: string
      returnedQuantity: number
      returnCount: number
      totalRefund: number
      batches: Set<string>
    }> = {}

    let totalReturnedUnitsAll = 0

    returnedItemsList.forEach((item) => {
      const key = item.medicineId || item.medicineName
      if (!map[key]) {
        const med = medicines.find(
          (m) => m.id === item.medicineId || m.name === item.medicineName,
        )
        map[key] = {
          medicineId: item.medicineId,
          medicineName: item.medicineName,
          genericName: med?.generic || (med as any)?.genericName || "",
          returnedQuantity: 0,
          returnCount: 0,
          totalRefund: 0,
          batches: new Set<string>(),
        }
      }
      map[key].returnedQuantity += item.returnQuantity
      map[key].returnCount += 1
      map[key].totalRefund += item.refundAmount
      if (item.batchNumber && item.batchNumber !== "N/A") {
        map[key].batches.add(item.batchNumber)
      }
      totalReturnedUnitsAll += item.returnQuantity
    })

    return Object.values(map)
      .map((entry) => ({
        medicineId: entry.medicineId,
        medicineName: entry.medicineName,
        genericName: entry.genericName,
        returnedQuantity: entry.returnedQuantity,
        returnCount: entry.returnCount,
        totalRefund: entry.totalRefund,
        batchCount: entry.batches.size,
        batchesList: Array.from(entry.batches).join(", "),
        sharePercentage:
          totalReturnedUnitsAll > 0
            ? (entry.returnedQuantity / totalReturnedUnitsAll) * 100
            : 0,
      }))
      .sort((a, b) => b.returnedQuantity - a.returnedQuantity)
  }, [returnedItemsList, medicines])

  // 18. Medicine Write-Offs Report Data & Summary
  const filteredWriteOffsList = useMemo(() => {
    return (writeOffs || []).filter((w) => {
      const wDate = (w.date || w.createdAt || "").split("T")[0]
      if (wDate && (wDate < startDate || wDate > endDate)) return false
      if (!tableSearch) return true
      const q = tableSearch.toLowerCase()
      return (
        w.receiptNumber.toLowerCase().includes(q) ||
        w.medicineName.toLowerCase().includes(q) ||
        w.batchNumber.toLowerCase().includes(q) ||
        w.reason.toLowerCase().includes(q) ||
        (w.remarks && w.remarks.toLowerCase().includes(q))
      )
    })
  }, [writeOffs, startDate, endDate, tableSearch])

  const writeOffsReportSummary = useMemo(() => {
    const totalUnits = filteredWriteOffsList.reduce(
      (sum, w) => sum + (w.quantity || 0),
      0,
    )
    const totalLoss = filteredWriteOffsList.reduce(
      (sum, w) => sum + (w.totalLossValue || 0),
      0,
    )
    const totalCount = filteredWriteOffsList.length
    const distinctMedicines = new Set(
      filteredWriteOffsList.map((w) => w.medicineId),
    ).size
    return {
      totalUnits,
      totalLoss,
      totalCount,
      distinctMedicines,
    }
  }, [filteredWriteOffsList])

  // 18. Return Trends Aggregation
  const returnTrendsAggregation = useMemo(() => {
    const map: Record<string, {
      dateStr: string
      displayDate: string
      returnsCount: number
      returnedQuantity: number
      refundAmount: number
    }> = {}
    let totalRefundAll = 0

    filteredReturns.forEach((r) => {
      const rawDate = (r.createdAt || "").split("T")[0] || "Recent"
      const displayDate =
        rawDate !== "Recent"
          ? new Date(rawDate).toLocaleDateString("en-IN", {
              month: "short",
              day: "numeric",
            })
          : "Recent"

      if (!map[rawDate]) {
        map[rawDate] = {
          dateStr: rawDate,
          displayDate,
          returnsCount: 0,
          returnedQuantity: 0,
          refundAmount: 0,
        }
      }
      map[rawDate].returnsCount += 1
      const refAmt = r.refundAmount || 0
      map[rawDate].refundAmount += refAmt
      totalRefundAll += refAmt

      const itemsQty =
        r.items && r.items.length > 0
          ? r.items.reduce((s, i) => s + (i.returnQuantity || 0), 0)
          : r.returnQuantity || 1
      map[rawDate].returnedQuantity += itemsQty
    })

    const entries = Object.values(map).sort((a, b) =>
      a.dateStr.localeCompare(b.dateStr),
    )
    return entries.map((entry) => ({
      ...entry,
      refundShare:
        totalRefundAll > 0 ? (entry.refundAmount / totalRefundAll) * 100 : 0,
    }))
  }, [filteredReturns])

  // Read-only Print Handler
  const handlePrint = () => {
    window.print()
  }

  // Read-only CSV/Excel Export
  const handleExportExcel = () => {
    let rows: any[] = []
    let filename = `Pharmacy_Report_${activeReport.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`

    if (activeReport === "Overview") {
      rows = [
        ["PHARMACY REPORTS & ANALYTICS - EXECUTIVE SUMMARY"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["KEY PERFORMANCE INDICATORS"],
        ["Metric", "Value", "Description"],
        [
          "Total Revenue",
          `Rs. ${totalRevenue.toFixed(2)}`,
          "Total completed pharmacy sales before refunds",
        ],
        [
          "Total Transactions",
          totalTransactions,
          "Number of completed sales transactions",
        ],
        [
          "Average Bill",
          `Rs. ${averageBill.toFixed(2)}`,
          "Average transaction value",
        ],
        [
          "Total Refund",
          `Rs. ${totalRefund.toFixed(2)}`,
          "Total refund amount for returned medicines",
        ],
        [
          "Net Revenue",
          `Rs. ${netRevenue.toFixed(2)}`,
          "Total Revenue minus Total Refund",
        ],
        [],
        ["TOP MEDICINES BY SALES"],
        ["Medicine Name", "Units Sold", "Total Sales (Rs.)"],
        ...topMedicinesSales.map((m) => [
          m.name,
          m.quantity,
          m.sales.toFixed(2),
        ]),
        [],
        ["INVENTORY OVERVIEW"],
        ["Total Stock Items", totalStockItems],
        ["Low Stock Items", lowStockCount],
        ["Out of Stock Items", outOfStockCount],
        ["Expiring Soon (<90d)", expiryGroups.expiringSoon],
        ["Expired Items", expiryGroups.expired],
        ["Total Stock Valuation", `Rs. ${totalStockValuation.toFixed(2)}`],
      ]
    } else if (
      activeReport === "Daily Sales" ||
      activeReport === "Monthly Sales"
    ) {
      rows = [
        [`SALES REPORT: ${activeReport.toUpperCase()}`],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Date",
          "Bills Count",
          "Gross Sales (Rs.)",
          "Refunds (Rs.)",
          "Net Revenue (Rs.)",
        ],
        ...salesTrendData.map((d) => [
          d.date,
          d.orders,
          d.revenue.toFixed(2),
          "0.00",
          d.revenue.toFixed(2),
        ]),
      ]
    } else if (activeReport === "Medicine-wise Sales") {
      rows = [
        ["MEDICINE-WISE SALES REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["Medicine Name", "Units Sold", "Total Revenue (Rs.)", "% of Sales"],
        ...topMedicinesSales.map((m) => [
          m.name,
          m.quantity,
          m.sales.toFixed(2),
          `${((m.sales / (totalRevenue || 1)) * 100).toFixed(1)}%`,
        ]),
      ]
    } else if (activeReport === "Category-wise Sales") {
      rows = [
        ["CATEGORY-WISE SALES REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Category Name",
          "Invoices Count",
          "Units Sold",
          "Total Revenue (Rs.)",
          "% of Sales",
        ],
        ...categorySalesData.map((c) => [
          c.category,
          c.billsCount,
          c.unitsSold,
          c.revenue.toFixed(2),
          `${((c.revenue / (totalRevenue || 1)) * 100).toFixed(1)}%`,
        ]),
      ]
    } else if (activeReport === "Pharmacist-wise Sales") {
      rows = [
        ["PHARMACIST-WISE SALES REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Pharmacist / Staff Name",
          "Invoices Handled",
          "Units Dispensed",
          "Total Revenue (Rs.)",
        ],
        ...pharmacistSalesData.map((p) => [
          p.name,
          p.billsCount,
          p.unitsSold,
          p.revenue.toFixed(2),
        ]),
      ]
    } else if (activeReport === "Expiry Report") {
      rows = [
        ["MEDICINE EXPIRY REPORT"],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Medicine Name",
          "Batch Number",
          "Available Qty",
          "Expiry Date",
          "Days Left",
          "Status",
        ],
        ...detailedExpiryBatches.map((b) => [
          b.medicineName,
          b.batchNumber,
          b.availableQuantity,
          b.expiryDate,
          b.daysLeft,
          b.status.toUpperCase(),
        ]),
      ]
    } else if (
      activeReport.includes("Stock") ||
      activeReport.includes("Moving")
    ) {
      rows = [
        [`INVENTORY REPORT: ${activeReport.toUpperCase()}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Medicine Name",
          "Generic Name",
          "Category",
          "Current Stock",
          "Unit",
          "Reorder Level",
          "Unit Price (Rs.)",
          "Valuation (Rs.)",
          "Status",
        ],
        ...detailedStockList.map((m) => [
          m.name,
          m.generic,
          m.category,
          m.stock,
          m.unit,
          m.reorderLevel,
          m.price.toFixed(2),
          m.valuation.toFixed(2),
          m.status,
        ]),
      ]
    } else if (activeReport === "Medicine Write-Offs") {
      rows = [
        ["MEDICINE WRITE-OFF & NON-SALEABLE STOCK REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        ["Total Units Written Off", writeOffsReportSummary.totalUnits],
        ["Total Loss Valuation (Rs.)", writeOffsReportSummary.totalLoss.toFixed(2)],
        ["Total Write-Off Records", writeOffsReportSummary.totalCount],
        ["Distinct Medicines Affected", writeOffsReportSummary.distinctMedicines],
        [],
        [
          "Receipt / Ref ID",
          "Date & Time",
          "Medicine Name",
          "Medicine Code / HSN",
          "Generic Name",
          "Batch Number",
          "Expiry Date",
          "Quantity Written Off",
          "Unit",
          "Previous Stock",
          "Remaining Stock",
          "Unit Cost (Rs.)",
          "Total Loss Value (Rs.)",
          "Reason",
          "Remarks",
          "Written Off By",
        ],
        ...filteredWriteOffsList.map((w) => [
          w.receiptNumber,
          new Date(w.date || w.createdAt).toLocaleString("en-IN"),
          w.medicineName,
          w.medicineCode || "N/A",
          w.genericName || "",
          w.batchNumber,
          w.expiryDate ? new Date(w.expiryDate).toLocaleDateString("en-IN") : "N/A",
          w.quantity,
          w.unitOfMeasure,
          w.previousStock,
          w.remainingStock,
          w.unitCost.toFixed(2),
          w.totalLossValue.toFixed(2),
          w.reason,
          w.remarks || "",
          w.writtenOffBy,
        ]),
      ]
    } else if (activeReport === "Purchase Report") {
      rows = [
        ["PURCHASE REPORT - PROCUREMENT & PURCHASE ACTIVITY"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        [
          "Total Purchase Value (Rs.)",
          procurementSummary.totalValue.toFixed(2),
        ],
        ["Total Items Purchased", procurementSummary.totalItemsCount],
        ["Total Suppliers", procurementSummary.distinctSuppliers],
        ["Total Received Quantity", procurementSummary.totalReceivedQty],
        ["Total Pending Quantity", procurementSummary.totalPendingQty],
        [],
        [
          "Purchase Date",
          "Supplier Name",
          "PO Number",
          "Medicine / Item",
          "Generic Name",
          "Quantity Purchased",
          "Quantity Received",
          "Pending Quantity",
          "Purchase Value (Rs.)",
          "GRN / Received Status",
        ],
        ...procurementActivityList.map((item) => [
          item.purchaseDate,
          item.supplierName,
          item.poNumber,
          item.medicineName,
          item.genericName,
          item.quantityPurchased,
          item.quantityReceived,
          item.pendingQuantity,
          item.purchaseValue.toFixed(2),
          item.grnStatus,
        ]),
      ]
    } else if (
      activeReport === "Purchase Order Report" ||
      activeReport === "Pending Purchase Report"
    ) {
      rows = [
        [`PURCHASE ORDER REPORT: ${activeReport.toUpperCase()}`],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        ["Total Purchase Orders", poTrackingSummary.totalPOs],
        ["Total Order Value (Rs.)", poTrackingSummary.totalValue.toFixed(2)],
        ["Total Units Ordered", poTrackingSummary.totalOrderedQty],
        ["Total Units Received", poTrackingSummary.totalReceivedQty],
        ["Fulfillment Rate", `${poTrackingSummary.fulfillmentRate}%`],
        [],
        [
          "PO Number",
          "Supplier Name",
          "PO Date",
          "Expected Delivery",
          "Items Count",
          "Ordered Quantity",
          "Received Quantity",
          "Pending Quantity",
          "Total Order Value (Rs.)",
          "PO Status",
        ],
        ...poTrackingList
          .filter(
            (p) =>
              activeReport !== "Pending Purchase Report" ||
              (p.status !== "Received" && p.status !== "Cancelled"),
          )
          .map((p) => [
            p.id,
            p.supplier,
            p.poDate,
            p.expectedDelivery,
            p.itemsCount,
            p.orderedQuantity,
            p.receivedQuantity,
            p.pendingQuantity,
            p.totalOrderValue.toFixed(2),
            p.status,
          ]),
      ]
    } else if (activeReport.includes("GRN")) {
      rows = [
        ["GOODS RECEIVED NOTE (GRN) REPORT"],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "GRN ID",
          "PO Number",
          "Supplier",
          "Received Date",
          "Invoice No",
          "Items Count",
          "Total Value (Rs.)",
          "Status",
        ],
        ...detailedGRNsList.map((g) => [
          g.grnNumber,
          g.poNumber,
          g.supplier,
          g.receivedDate,
          g.invoiceNumber,
          g.itemsCount,
          g.totalValue.toFixed(2),
          g.status,
        ]),
      ]
    } else if (activeReport === "Supplier Overview") {
      rows = [
        ["SUPPLIER OVERVIEW REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        ["Total Suppliers Registered", suppliers.length],
        ["Active Suppliers", supplierOverviewSummary.activeSuppliers],
        ["Total Orders Placed", supplierOverviewSummary.totalOrders],
        [
          "Suppliers with Pending Deliveries",
          supplierOverviewSummary.suppliersWithPending,
        ],
        [
          "Total Procurement Spend (Rs.)",
          supplierOverviewSummary.totalSpend.toFixed(2),
        ],
        [],
        [
          "Supplier Name",
          "Contact Person",
          "Phone",
          "Email",
          "GSTIN",
          "Orders Count",
          "Total Purchase Value (Rs.)",
          "Pending Deliveries",
          "Status",
        ],
        ...supplierOverviewList.map((s) => [
          s.name,
          s.contact,
          s.phone,
          s.email,
          s.gstin,
          s.ordersCount,
          s.totalPurchaseValue.toFixed(2),
          s.pendingDeliveries,
          s.status,
        ]),
      ]
    } else if (
      activeReport === "Supplier-wise Purchases" ||
      activeReport === "Supplier-wise Purchase Report"
    ) {
      rows = [
        ["SUPPLIER-WISE PURCHASES REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        [
          "Suppliers Purchased From",
          supplierWisePurchasesList.filter((s) => s.purchaseOrdersCount > 0)
            .length,
        ],
        ["Total Purchase Orders", supplierWisePurchasesSummary.totalPOs],
        [
          "Total Purchase Value (Rs.)",
          supplierWisePurchasesSummary.totalPurchaseValue.toFixed(2),
        ],
        [
          "Goods Received Value (Rs.)",
          supplierWisePurchasesSummary.totalReceivedValue.toFixed(2),
        ],
        [
          "Pending Purchase Value (Rs.)",
          supplierWisePurchasesSummary.totalPendingValue.toFixed(2),
        ],
        [],
        [
          "Supplier Name",
          "Purchase Orders Count",
          "Total Purchase Value (Rs.)",
          "Goods Received Value (Rs.)",
          "Pending Purchase Value (Rs.)",
          "Unique Medicines Count",
          "Last Purchase Date",
        ],
        ...supplierWisePurchasesList.map((s) => [
          s.supplierName,
          s.purchaseOrdersCount,
          s.totalPurchaseValue.toFixed(2),
          s.goodsReceivedValue.toFixed(2),
          s.pendingPurchaseValue.toFixed(2),
          s.itemsCount,
          s.lastPurchaseDate,
        ]),
      ]
    } else if (activeReport === "Supplier Order History") {
      rows = [
        ["SUPPLIER ORDER HISTORY REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        ["Total Orders", supplierOrderHistorySummary.totalOrders],
        ["Ordered (Awaiting Receipt)", supplierOrderHistorySummary.ordered],
        ["Partially Received", supplierOrderHistorySummary.partiallyReceived],
        ["Fully Received", supplierOrderHistorySummary.received],
        ["Cancelled Orders", supplierOrderHistorySummary.cancelled],
        [],
        [
          "PO Number",
          "Supplier Name",
          "PO Date",
          "Expected Delivery",
          "Items Count",
          "Ordered Quantity",
          "Received Quantity",
          "Total Order Value (Rs.)",
          "Order Status",
        ],
        ...supplierOrderHistoryList.map((p) => [
          p.id,
          p.supplierName,
          p.poDate,
          p.expectedDelivery,
          p.itemsCount,
          p.orderedQuantity,
          p.receivedQuantity,
          p.totalOrderValue.toFixed(2),
          p.orderStatus,
        ]),
      ]
    } else if (activeReport === "Supplier Returns") {
      rows = [
        ["SUPPLIER RETURNS REPORT (PROCUREMENT RETURNS)"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        ["Total Supplier Returns", supplierReturnsSummary.totalReturns],
        ["Total Units Returned", supplierReturnsSummary.totalUnits],
        ["Credit Notes Issued", supplierReturnsSummary.creditNotes],
        [],
        [
          "Return ID",
          "Supplier Name",
          "Medicine Name",
          "Batch Number",
          "Returned Quantity",
          "Return Reason",
          "Return Date",
          "Return Status",
          "Credit Note ID",
        ],
        ...supplierReturnsList.map((r) => [
          r.id,
          r.supplierName,
          r.medicineName,
          r.batchNumber,
          r.returnedQuantity,
          r.returnReason,
          r.returnDate,
          r.status,
          r.creditNoteId,
        ]),
      ]
    } else if (activeReport === "Pending Supplier Deliveries") {
      rows = [
        ["PENDING SUPPLIER DELIVERIES REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        ["Pending Deliveries", pendingSupplierDeliveriesSummary.pendingOrders],
        ["Total Units Pending", pendingSupplierDeliveriesSummary.pendingItems],
        [
          "Total Pending Value (Rs.)",
          pendingSupplierDeliveriesSummary.pendingValue.toFixed(2),
        ],
        [
          "Overdue Deliveries",
          pendingSupplierDeliveriesSummary.overdueDeliveries,
        ],
        [],
        [
          "PO Number",
          "Supplier Name",
          "PO Date",
          "Expected Delivery",
          "Schedule Status",
          "Items Ordered",
          "Items Received",
          "Items Pending",
          "Pending Value (Rs.)",
          "Delivery Status",
        ],
        ...pendingSupplierDeliveriesList.map((p) => [
          p.id,
          p.supplierName,
          p.poDate,
          p.expectedDelivery,
          p.scheduleText,
          p.itemsOrdered,
          p.itemsReceived,
          p.itemsPending,
          p.pendingValue.toFixed(2),
          p.deliveryStatus,
        ]),
      ]
    } else if (activeReport.includes("Supplier")) {
      rows = [
        [`SUPPLIER REPORT: ${activeReport.toUpperCase()}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Supplier Name",
          "Contact Person",
          "Phone",
          "Email",
          "GSTIN",
          "Orders Count",
          "Pending Deliveries",
          "Total Purchase Value (Rs.)",
        ],
        ...supplierOverviewList.map((s) => [
          s.name,
          s.contact,
          s.phone,
          s.email,
          s.gstin,
          s.ordersCount,
          s.pendingDeliveries,
          s.totalPurchaseValue.toFixed(2),
        ]),
      ]
    } else if (activeReport === "Medicine Returns") {
      rows = [
        ["MEDICINE RETURNS REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Return ID",
          "Original Bill Number",
          "Patient Name",
          "UHID",
          "Medicine Name",
          "Batch Number",
          "Returned Quantity",
          "Unit Price (Rs.)",
          "Return Reason",
          "Refund Amount (Rs.)",
          "Return Date",
          "Status",
        ],
        ...returnedItemsList.map((item) => [
          item.returnNumber,
          item.originalBillNumber,
          item.patientName,
          item.patientUhid,
          item.medicineName,
          item.batchNumber,
          item.returnQuantity,
          item.unitPrice.toFixed(2),
          item.returnReason,
          item.refundAmount.toFixed(2),
          item.returnDate,
          item.status,
        ]),
      ]
    } else if (activeReport === "Refund Report") {
      rows = [
        ["REFUND REPORT - FINANCIAL SUMMARY"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        ["SUMMARY METRICS"],
        [
          "Total Refund Disbursed (Rs.)",
          refundReportSummary.totalRefund.toFixed(2),
        ],
        ["Refund Transactions Count", refundReportSummary.transactionsCount],
        [
          "Average Refund per Incident (Rs.)",
          refundReportSummary.avgRefund.toFixed(2),
        ],
        [],
        [
          "Return ID",
          "Original Bill Number",
          "Patient Name",
          "UHID",
          "Refund Amount (Rs.)",
          "Refund Date",
          "Refund Status",
        ],
        ...filteredReturns.map((r) => [
          r.returnNumber,
          r.originalBillNumber || "N/A",
          r.patientName || "Walk-in Patient",
          r.patientUhid || "N/A",
          (r.refundAmount || 0).toFixed(2),
          r.createdAt,
          r.status || "Completed",
        ]),
      ]
    } else if (activeReport === "Return Reasons") {
      rows = [
        ["RETURN REASONS AGGREGATION REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Return Reason",
          "Return Cases Count",
          "Units Returned",
          "Total Refund Amount (Rs.)",
          "% of Return Cases",
          "% of Total Refunds",
        ],
        ...returnReasonsAggregation.map((entry) => [
          entry.reason,
          entry.returnsCount,
          entry.unitsReturned,
          entry.totalRefund.toFixed(2),
          `${entry.returnsPercentage.toFixed(1)}%`,
          `${entry.refundPercentage.toFixed(1)}%`,
        ]),
      ]
    } else if (activeReport === "Medicine-wise Returns") {
      rows = [
        ["MEDICINE-WISE RETURNS REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Medicine Name",
          "Generic Name",
          "Batches Involved",
          "Returned Quantity",
          "Return Transactions Count",
          "Total Refund Amount (Rs.)",
          "Share of Total Returns (%)",
        ],
        ...medicineWiseReturnsAggregation.map((entry) => [
          entry.medicineName,
          entry.genericName,
          entry.batchesList || "N/A",
          entry.returnedQuantity,
          entry.returnCount,
          entry.totalRefund.toFixed(2),
          `${entry.sharePercentage.toFixed(1)}%`,
        ]),
      ]
    } else if (activeReport === "Return Trends") {
      rows = [
        ["RETURN TRENDS REPORT"],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
        [],
        [
          "Date",
          "Return Cases Count",
          "Units Returned",
          "Daily Refund Disbursed (Rs.)",
          "Share of Total Refunds (%)",
        ],
        ...returnTrendsAggregation.map((entry) => [
          entry.dateStr,
          entry.returnsCount,
          entry.returnedQuantity,
          entry.refundAmount.toFixed(2),
          `${entry.refundShare.toFixed(1)}%`,
        ]),
      ]
    } else {
      rows = [
        [`REPORT: ${activeReport.toUpperCase()}`],
        ["Date Range", `${startDate} to ${endDate}`],
        ["Generated Date", new Date().toLocaleString("en-IN")],
      ]
    }

    const csvContent =
      "data:text/csv;charset=utf-8," +
      rows
        .map((e) =>
          e.map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-6 space-y-5 bg-[#F8FAFC] min-h-screen">
      {/* Print Styles: Strict read-only printable layout */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #reports-print-area, #reports-print-area * { visibility: visible; }
          #reports-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 15px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* TOP HEADER */}
      <div className="no-print">
        <PageHeader
          breadcrumbs={[
            { label: "Pharmacy" },
            { label: "Reports & Analytics" },
          ]}
          title="Reports & Analytics"
          description="Insights and business intelligence for pharmacy operations"
          actions={
            <>
              <button
                onClick={handlePrint}
                title="Print Report"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#E2E8F0] bg-white text-[12px] font-medium text-[#334155] hover:bg-gray-50 transition-colors shadow-2xs"
              >
                <Printer size={13} className="text-gray-600" /> Print
              </button>

              <button
                onClick={handleExportExcel}
                title="Export Data to Excel/CSV"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-white text-[12px] font-semibold transition-colors shadow-2xs hover:bg-blue-700 bg-[#1B4FD8]"
              >
                <Download size={13} /> Export Excel
              </button>
            </>
          }
          onNavigate={onNavigate}
        />
      </div>

      {/* DATE FILTER TOOLBAR (Compact, professional) */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] px-5 py-3 shadow-sm no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[#475569]">
              <Calendar size={14} className="text-[#0F766E]" />
              <span>Date Range:</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setActivePreset("Custom")
                }}
                className="px-2.5 py-1.5 rounded border border-[#E2E8F0] text-[12px] text-[#0F1624] focus:border-[#0F766E] focus:outline-none"
              />
              <span className="text-[#94A3B8]">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setActivePreset("Custom")
                }}
                className="px-2.5 py-1.5 rounded border border-[#E2E8F0] text-[12px] text-[#0F1624] focus:border-[#0F766E] focus:outline-none"
              />
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1 border-l border-[#E2E8F0] pl-3 ml-1">
              {[
                "Today",
                "This Week",
                "This Month",
                "Last Month",
                "All Time",
              ].map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                    activePreset === preset
                      ? "bg-[#0F766E] text-white"
                      : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetFilters}
              title="Reset Filters"
              className="p-1.5 rounded border border-[#E2E8F0] text-[#64748B] hover:text-[#0F1624] hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER: SIDEBAR + CONTENT */}
      {/* Below md the report menu stacks above the report itself. */}
      <div className="flex flex-col md:flex-row gap-5 md:items-start">
        {/* LEFT SIDEBAR: Collapsible Categories */}
        <div className="w-full md:w-64 shrink-0 bg-white rounded-xl shadow-sm border border-[#E2E8F0] shadow-sm overflow-hidden no-print">
          {/* Executive Overview Link */}
          <div className="p-2 border-b border-[#F1F5F9]">
            <button
              onClick={() => setActiveReport("Overview")}
              className={`w-full text-left px-3 py-2.5 rounded text-[13px] font-bold flex items-center gap-2 transition-colors ${
                activeReport === "Overview"
                  ? "bg-[#E8EDF5] text-[#0F766E]"
                  : "text-[#334155] hover:bg-gray-50"
              }`}
            >
              <LayoutDashboard size={15} />
              <span>Pharmacy Overview</span>
            </button>
          </div>

          {/* Collapsible Categories */}
          <div className="divide-y divide-[#F1F5F9] max-h-[40dvh] md:max-h-[calc(100vh-280px)] overflow-y-auto">
            {REPORT_CATEGORIES.map((cat) => {
              const isExpanded = expandedCats[cat.id] ?? true
              return (
                <div key={cat.id}>
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full text-left px-3.5 py-2.5 flex items-center justify-between text-[11px] font-bold tracking-wider text-[#64748B] bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-colors"
                  >
                    <span>{cat.label}</span>
                    {isExpanded ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="py-1">
                      {cat.items.map((item) => {
                        const isSelected = activeReport === item
                        return (
                          <button
                            key={item}
                            onClick={() => {
                              setActiveReport(item)
                              setTableSearch("")
                            }}
                            className={`w-full text-left px-4 py-2 text-[12px] transition-colors flex items-center justify-between ${
                              isSelected
                                ? "bg-[#E8EDF5] text-[#0F766E] font-semibold border-r-2 border-[#0F766E]"
                                : "text-[#475569] hover:bg-gray-50 hover:text-[#0F1624]"
                            }`}
                          >
                            <span>{item}</span>
                            {isSelected && (
                              <div className="w-1.5 h-1.5 rounded-full bg-[#0F766E]" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT MAIN CONTENT AREA */}
        <div id="reports-print-area" className="flex-1 min-w-0 space-y-6">
          {activeReport === "Overview" ? (
            /* ========================================================== */
            /* 1. OVERVIEW DASHBOARD VIEW                                 */
            /* ========================================================== */
            <div className="space-y-6">
              {/* SECTION 4: 4-CARD OVERVIEW KPI SECTION */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Sales Value */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
                      Total Sales Value
                    </span>
                    <div className="w-7 h-7 rounded bg-teal-50 text-[#0F766E] flex items-center justify-center">
                      <ShoppingCart size={15} />
                    </div>
                  </div>
                  <p className="text-[22px] font-extrabold text-[#0F1624] mt-2">
                    ₹
                    {totalRevenue.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 line-clamp-2">
                    Total sales billed across {totalTransactions} completed invoices.
                  </p>
                </div>

                {/* 2. Total Transactions */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
                      Total Transactions
                    </span>
                    <div className="w-7 h-7 rounded bg-green-50 text-[#16a34a] flex items-center justify-center">
                      <ShoppingBag size={15} />
                    </div>
                  </div>
                  <p className="text-[22px] font-extrabold text-[#0F1624] mt-2">
                    {totalTransactions}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 line-clamp-2">
                    Completed pharmacy sale bills for the period.
                  </p>
                </div>

                {/* 3. Total Patient Returns */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
                      Total Patient Returns
                    </span>
                    <div className="w-7 h-7 rounded bg-amber-50 text-amber-700 flex items-center justify-center">
                      <RotateCcw size={15} />
                    </div>
                  </div>
                  <p className="text-[22px] font-extrabold text-amber-700 mt-2">
                    ₹
                    {totalRefund.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 line-clamp-2">
                    {filteredReturns.length} patient sales refunds disbursed.
                  </p>
                </div>

                {/* 4. Total Supplier Returns */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
                      Total Supplier Returns
                    </span>
                    <div className="w-7 h-7 rounded bg-blue-50 text-[#0F766E] flex items-center justify-center">
                      <FileText size={15} />
                    </div>
                  </div>
                  <p className="text-[22px] font-extrabold text-[#0F766E] mt-2">
                    ₹
                    {supplierReturnsSummary.totalAmount.toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-1 line-clamp-2">
                    {supplierReturnsSummary.totalReturns} debit notes ({supplierReturnsSummary.totalUnits} units returned to vendors).
                  </p>
                </div>
              </div>

              {/* SECTION 5: SALES ANALYTICS (2-Column Layout) */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h2 className="text-[15px] font-bold text-[#0F1624]">
                      Sales Analytics
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Revenue performance and medicine demand trends
                    </p>
                  </div>
                  <span className="text-[11px] font-medium px-2.5 py-1 bg-teal-50 text-blue-700 rounded">
                    Period: {startDate} to {endDate}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Daily Sales Trend */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[13px] font-semibold text-[#334155]">
                      <span>Daily Sales Trend</span>
                      <span className="text-[11px] text-[#64748B] font-normal">
                        {salesTrendData.length} records
                      </span>
                    </div>
                    <div className="border border-[#F1F5F9] rounded p-2 bg-[#FAFCFF]">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={salesTrendData}>
                          <defs>
                            <linearGradient
                              id="salesGrad"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#0F766E"
                                stopOpacity={0.25}
                              />
                              <stop
                                offset="95%"
                                stopColor="#0F766E"
                                stopOpacity={0.0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#EEF2F6"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: "#64748B" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#64748B" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => `₹${v}`}
                          />
                          <Tooltip
                            formatter={(v: any) => [
                              `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                              "Revenue",
                            ]}
                            contentStyle={{ fontSize: 12, borderRadius: 6 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#0F766E"
                            strokeWidth={2}
                            fill="url(#salesGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Right: Medicine-wise Sales */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[13px] font-semibold text-[#334155]">
                      <span>Top Medicines by Sales</span>
                      <button
                        onClick={() => setActiveReport("Medicine-wise Sales")}
                        className="text-[11px] text-[#0F766E] hover:underline flex items-center gap-1 font-medium"
                      >
                        View Full Report <ArrowRight size={11} />
                      </button>
                    </div>
                    <div className="border border-[#F1F5F9] rounded p-2 bg-[#FAFCFF]">
                      {topMedicinesSales.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart
                            data={topMedicinesSales}
                            layout="vertical"
                            margin={{ left: 10, right: 20, top: 10, bottom: 5 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#EEF2F6"
                              horizontal={false}
                            />
                            <XAxis
                              type="number"
                              tick={{ fontSize: 10, fill: "#64748B" }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={(v) => `₹${v}`}
                            />
                            <YAxis
                              dataKey="name"
                              type="category"
                              tick={{ fontSize: 10, fill: "#334155" }}
                              width={120}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(v: any) => [
                                `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
                                "Sales Value",
                              ]}
                              contentStyle={{ fontSize: 12, borderRadius: 6 }}
                            />
                            <Bar
                              dataKey="sales"
                              fill="#16a34a"
                              radius={[0, 4, 4, 0]}
                              barSize={16}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-[220px] flex items-center justify-center text-[12px] text-[#94A3B8]">
                          No medicine sales recorded in this date range.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 6: INVENTORY OVERVIEW */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h2 className="text-[15px] font-bold text-[#0F1624]">
                      Inventory Overview
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Real-time stock health, valuation, and threshold alerts
                    </p>
                  </div>
                  <span className="text-[12px] font-semibold text-gray-700">
                    Stock Valuation:{" "}
                    <span className="font-bold text-[#0F766E]">
                      ₹
                      {totalStockValuation.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </span>
                </div>

                {/* Compact Visual Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded text-center">
                    <span className="text-[11px] font-semibold text-[#64748B] block">
                      Total Items
                    </span>
                    <span className="text-[18px] font-bold text-[#0F1624] mt-0.5 block">
                      {totalStockItems}
                    </span>
                  </div>
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded text-center">
                    <span className="text-[11px] font-semibold text-amber-800 block">
                      Low Stock
                    </span>
                    <span className="text-[18px] font-bold text-amber-700 mt-0.5 block">
                      {lowStockCount}
                    </span>
                  </div>
                  <div className="p-3 bg-red-50/70 border border-red-200 rounded text-center">
                    <span className="text-[11px] font-semibold text-red-800 block">
                      Out of Stock
                    </span>
                    <span className="text-[18px] font-bold text-red-700 mt-0.5 block">
                      {outOfStockCount}
                    </span>
                  </div>
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded text-center">
                    <span className="text-[11px] font-semibold text-amber-800 block">
                      Expiring &lt;90d
                    </span>
                    <span className="text-[18px] font-bold text-amber-700 mt-0.5 block">
                      {expiryGroups.expiringSoon}
                    </span>
                  </div>
                  <div className="p-3 bg-red-50/70 border border-red-200 rounded text-center">
                    <span className="text-[11px] font-semibold text-red-800 block">
                      Expired
                    </span>
                    <span className="text-[18px] font-bold text-red-700 mt-0.5 block">
                      {expiryGroups.expired}
                    </span>
                  </div>
                </div>

                {/* Stock By Category List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="border border-[#F1F5F9] rounded p-3.5 space-y-2.5">
                    <span className="text-[12px] font-bold text-[#334155] block">
                      Stock Distribution by Category
                    </span>
                    <div className="space-y-2">
                      {stockByCategory.map((c) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between text-[12px]"
                        >
                          <span className="text-[#475569]">
                            {c.name} ({c.items} drugs)
                          </span>
                          <span className="font-semibold text-[#0F1624] font-mono">
                            {c.totalStock} units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-[#F1F5F9] rounded p-3.5 space-y-2.5">
                    <span className="text-[12px] font-bold text-[#334155] block">
                      Inventory Movement Speed
                    </span>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between items-center">
                        <span className="text-[#475569]">
                          Fast-Moving Items (Active Sales):
                        </span>
                        <span className="font-bold text-green-700">
                          {topMedicinesSales.length} items
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#475569]">
                          Slow-Moving / Dormant Items:
                        </span>
                        <span className="font-bold text-gray-700">
                          {Math.max(
                            0,
                            totalStockItems - topMedicinesSales.length,
                          )}{" "}
                          items
                        </span>
                      </div>
                      <div className="pt-2 border-t border-dashed border-[#E2E8F0] flex justify-between items-center text-[11px]">
                        <button
                          onClick={() => setActiveReport("Stock Valuation")}
                          className="text-[#0F766E] font-semibold hover:underline"
                        >
                          View Full Stock Valuation Report &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 7: PURCHASE OVERVIEW */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h2 className="text-[15px] font-bold text-[#0F1624]">
                      Purchase Overview
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Procurement spend, vendor orders, and goods receipts
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveReport("Purchase Order Report")}
                    className="text-[11px] text-[#0F766E] hover:underline flex items-center gap-1 font-medium"
                  >
                    View All Orders &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Total Purchase Orders
                    </span>
                    <span className="text-[18px] font-bold text-[#0F1624] block mt-1">
                      {totalPurchaseOrders}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Total Purchase Value
                    </span>
                    <span className="text-[18px] font-bold text-[#0F766E] block mt-1">
                      ₹
                      {totalPurchaseValue.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Pending Deliveries
                    </span>
                    <span className="text-[18px] font-bold text-amber-700 block mt-1">
                      {pendingPurchaseOrders}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Goods Received (GRN)
                    </span>
                    <span className="text-[18px] font-bold text-green-700 block mt-1">
                      {grns.length}
                    </span>
                  </div>
                </div>

                {supplierPurchasesData.length > 0 && (
                  <div className="border border-[#F1F5F9] rounded overflow-hidden">
                    <div className="bg-[#F8FAFC] px-4 py-2 border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569] uppercase">
                      Top Suppliers by Purchase Value
                    </div>
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead className="border-b border-[#E2E8F0] text-[#64748B]">
                        <tr>
                          <th className="p-2.5 font-semibold">Supplier Name</th>
                          <th className="p-2.5 font-semibold text-center">
                            Orders
                          </th>
                          <th className="p-2.5 font-semibold text-right">
                            Total Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {supplierPurchasesData.map((s) => (
                          <tr key={s.supplier} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-2.5 font-medium text-[#0F1624]">
                              {s.supplier}
                            </td>
                            <td className="p-2.5 text-center">{s.orders}</td>
                            <td className="p-2.5 text-right font-bold text-[#0F766E]">
                              ₹
                              {s.totalValue.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION 8: RETURNS & REFUNDS ANALYTICS */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h2 className="text-[15px] font-bold text-[#0F1624]">
                      Returns & Refunds
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Medicine returns, customer refund amounts, and root
                      reasons
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveReport("Medicine Returns")}
                    className="text-[11px] text-[#0F766E] hover:underline flex items-center gap-1 font-medium"
                  >
                    View All Returns &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Total Return Cases
                    </span>
                    <span className="text-[18px] font-bold text-[#0F1624] block mt-1">
                      {totalReturnTransactions}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Total Refund Amount
                    </span>
                    <span className="text-[18px] font-bold text-amber-700 block mt-1">
                      ₹
                      {totalRefund.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Returned Units
                    </span>
                    <span className="text-[18px] font-bold text-[#0F1624] block mt-1">
                      {totalReturnedQuantity}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Return Rate
                    </span>
                    <span className="text-[18px] font-bold text-[#7c3aed] block mt-1">
                      {(
                        (totalReturnTransactions / (totalTransactions || 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                </div>

                {/* Return Reasons Breakdown */}
                {returnReasonsData.length > 0 && (
                  <div className="border border-[#F1F5F9] rounded p-4 space-y-3 bg-[#FAFCFF]">
                    <span className="text-[12px] font-bold text-[#334155] block">
                      Return Reasons Breakdown
                    </span>
                    <div className="space-y-2">
                      {returnReasonsData.map((r) => (
                        <div key={r.name} className="space-y-1">
                          <div className="flex justify-between text-[12px]">
                            <span className="text-[#475569]">{r.name}</span>
                            <span className="font-semibold text-[#0F1624]">
                              {r.count} return(s) ({r.pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded"
                              style={{ width: `${r.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 9: SUPPLIER OVERVIEW */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h2 className="text-[15px] font-bold text-[#0F1624]">
                      Supplier Overview
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Active pharmaceutical vendors, purchase history, and
                      contact details
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveReport("Supplier Overview")}
                    className="text-[11px] text-[#0F766E] hover:underline flex items-center gap-1 font-medium"
                  >
                    View Suppliers Table &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Active Suppliers
                    </span>
                    <span className="text-[18px] font-bold text-[#0F1624] block mt-1">
                      {suppliers.length}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Total Orders Placed
                    </span>
                    <span className="text-[18px] font-bold text-[#0F766E] block mt-1">
                      {purchaseOrders.length}
                    </span>
                  </div>
                  <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                    <span className="text-[11px] font-semibold text-[#64748B]">
                      Pending Shipments
                    </span>
                    <span className="text-[18px] font-bold text-amber-700 block mt-1">
                      {pendingPurchaseOrders}
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 10: EXPIRY OVERVIEW */}
              <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div>
                    <h2 className="text-[15px] font-bold text-[#0F1624]">
                      Expiry Overview
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Medicine batches timeline by impending expiry date
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveReport("Expiry Report")}
                    className="text-[11px] text-[#0F766E] hover:underline flex items-center gap-1 font-medium"
                  >
                    View All Expiring Batches &rarr;
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded">
                    <span className="text-[11px] font-bold text-red-800 uppercase block">
                      Expired
                    </span>
                    <span className="text-[18px] font-bold text-red-700 mt-1 block">
                      {expiryGroups.expired} batches
                    </span>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                    <span className="text-[11px] font-bold text-amber-800 uppercase block">
                      Within 30 Days
                    </span>
                    <span className="text-[18px] font-bold text-amber-700 mt-1 block">
                      {expiryGroups.within30} batches
                    </span>
                  </div>
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <span className="text-[11px] font-bold text-yellow-800 uppercase block">
                      Within 60 Days
                    </span>
                    <span className="text-[18px] font-bold text-yellow-700 mt-1 block">
                      {expiryGroups.within60} batches
                    </span>
                  </div>
                  <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                    <span className="text-[11px] font-bold text-blue-800 uppercase block">
                      Within 90 Days
                    </span>
                    <span className="text-[18px] font-bold text-blue-700 mt-1 block">
                      {expiryGroups.within90} batches
                    </span>
                  </div>
                </div>

                {expiringMedicines.length > 0 && (
                  <div className="border border-[#F1F5F9] rounded overflow-hidden">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-2.5 font-semibold">Medicine</th>
                          <th className="p-2.5 font-semibold">Batch</th>
                          <th className="p-2.5 font-semibold text-center">
                            Available Qty
                          </th>
                          <th className="p-2.5 font-semibold">Expiry Date</th>
                          <th className="p-2.5 font-semibold text-center">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {expiringMedicines.slice(0, 5).map((item) => (
                          <tr key={item.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-2.5 font-medium text-[#0F1624]">
                              {item.name || item.medicine}
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-[#64748B]">
                              {item.batch}
                            </td>
                            <td className="p-2.5 text-center font-bold">
                              {item.stock ?? item.quantity}
                            </td>
                            <td className="p-2.5">{item.expiry}</td>
                            <td className="p-2.5 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  item.status === "expired"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {item.status === "expired"
                                  ? "Expired"
                                  : `${item.daysLeft}d left`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================== */
            /* 2. DRILL-DOWN DETAILED REPORT VIEW                         */
            /* ========================================================== */
            <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6 shadow-sm space-y-5">
              {/* Detailed Report Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#F1F5F9] pb-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveReport("Overview")}
                    className="p-1.5 rounded border border-[#E2E8F0] hover:bg-gray-50 text-[#334155] flex items-center gap-1 text-[12px] font-medium transition-colors"
                  >
                    <ArrowLeft size={14} /> Back to Overview
                  </button>
                  <div>
                    <h2 className="text-[18px] font-bold text-[#0F1624]">
                      {activeReport}
                    </h2>
                    <p className="text-[12px] text-[#64748B]">
                      Detailed operational report for period {startDate} to{" "}
                      {endDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search this report..."
                      className="pl-8 pr-3 py-1.5 rounded border border-[#E2E8F0] text-[12px] focus:border-[#0F766E] focus:outline-none w-48"
                    />
                    <Search
                      size={13}
                      className="absolute left-2.5 top-2.5 text-[#94A3B8]"
                    />
                  </div>
                  <button
                    onClick={handleExportExcel}
                    className="px-3 py-1.5 rounded bg-green-700 hover:bg-green-800 text-white font-semibold text-[12px] flex items-center gap-1.5 transition-colors"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                </div>
              </div>

              {/* RENDER DETAILED REPORT TABLE ACCORDING TO ACTIVE REPORT */}
              <div className="overflow-x-auto">
                {activeReport === "Daily Sales" ||
                activeReport === "Monthly Sales" ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">Date</th>
                        <th className="p-3 font-semibold text-center">
                          Bills Count
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Gross Sales
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Refunds
                        </th>
                        <th className="p-3 font-semibold text-right text-[#0F766E]">
                          Net Revenue
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {salesTrendData
                        .filter((d) => d.date !== "No Sales")
                        .map((d, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-medium text-[#0F1624]">
                              {d.date}
                            </td>
                            <td className="p-3 text-center">{d.orders}</td>
                            <td className="p-3 text-right">
                              ₹
                              {(d.gross || d.revenue).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-3 text-right text-amber-700 font-medium">
                              {d.refunds > 0
                                ? `-₹${d.refunds.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                : "₹0.00"}
                            </td>
                            <td className="p-3 text-right font-bold text-[#0F766E]">
                              ₹
                              {d.revenue.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                      {salesTrendData.filter((d) => d.date !== "No Sales")
                        .length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-[#94A3B8]"
                          >
                            No sales transactions found for the selected date
                            range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : activeReport === "Medicine-wise Sales" ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">Medicine Name</th>
                        <th className="p-3 font-semibold text-center">
                          Units Sold
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Total Revenue
                        </th>
                        <th className="p-3 font-semibold text-right">
                          % of Sales
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {topMedicinesSales
                        .filter(
                          (m) =>
                            !tableSearch ||
                            m.name
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        )
                        .map((m, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-semibold text-[#0F1624]">
                              {m.name}
                            </td>
                            <td className="p-3 text-center font-bold">
                              {m.quantity}
                            </td>
                            <td className="p-3 text-right font-bold text-[#0F766E]">
                              ₹
                              {m.sales.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-3 text-right text-[#64748B]">
                              {((m.sales / (totalRevenue || 1)) * 100).toFixed(
                                1,
                              )}
                              %
                            </td>
                          </tr>
                        ))}
                      {topMedicinesSales.filter(
                        (m) =>
                          !tableSearch ||
                          m.name
                            .toLowerCase()
                            .includes(tableSearch.toLowerCase()),
                      ).length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-8 text-center text-[#94A3B8]"
                          >
                            No medicine sales records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : activeReport === "Category-wise Sales" ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">Category Name</th>
                        <th className="p-3 font-semibold text-center">
                          Invoices Count
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Units Sold
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Total Revenue
                        </th>
                        <th className="p-3 font-semibold text-right">
                          % of Total Sales
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {categorySalesData
                        .filter(
                          (c) =>
                            !tableSearch ||
                            c.category
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        )
                        .map((c, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-semibold text-[#0F1624]">
                              {c.category}
                            </td>
                            <td className="p-3 text-center">{c.billsCount}</td>
                            <td className="p-3 text-center font-medium">
                              {c.unitsSold}
                            </td>
                            <td className="p-3 text-right font-bold text-[#0F766E]">
                              ₹
                              {c.revenue.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-3 text-right text-[#64748B]">
                              {(
                                (c.revenue / (totalRevenue || 1)) *
                                100
                              ).toFixed(1)}
                              %
                            </td>
                          </tr>
                        ))}
                      {categorySalesData.filter(
                        (c) =>
                          !tableSearch ||
                          c.category
                            .toLowerCase()
                            .includes(tableSearch.toLowerCase()),
                      ).length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-[#94A3B8]"
                          >
                            No category sales records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : activeReport === "Pharmacist-wise Sales" ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">
                          Pharmacist / Staff Name
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Invoices Processed
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Units Dispensed
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Total Revenue Handled
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Avg Value / Invoice
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {pharmacistSalesData
                        .filter(
                          (p) =>
                            !tableSearch ||
                            p.name
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        )
                        .map((p, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-semibold text-[#0F1624]">
                              {p.name}
                            </td>
                            <td className="p-3 text-center">{p.billsCount}</td>
                            <td className="p-3 text-center font-medium">
                              {p.unitsSold}
                            </td>
                            <td className="p-3 text-right font-bold text-[#0F766E]">
                              ₹
                              {p.revenue.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-3 text-right text-[#475569]">
                              ₹
                              {(p.revenue / (p.billsCount || 1)).toLocaleString(
                                "en-IN",
                                { minimumFractionDigits: 2 },
                              )}
                            </td>
                          </tr>
                        ))}
                      {pharmacistSalesData.filter(
                        (p) =>
                          !tableSearch ||
                          p.name
                            .toLowerCase()
                            .includes(tableSearch.toLowerCase()),
                      ).length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-[#94A3B8]"
                          >
                            No pharmacist sales records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : activeReport === "Expiry Report" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-red-50 border border-red-200 rounded">
                        <span className="text-[11px] font-bold text-red-800 uppercase block">
                          Expired
                        </span>
                        <span className="text-[18px] font-bold text-red-700 mt-1 block">
                          {expiryGroups.expired} batches
                        </span>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                        <span className="text-[11px] font-bold text-amber-800 uppercase block">
                          Within 30 Days
                        </span>
                        <span className="text-[18px] font-bold text-amber-700 mt-1 block">
                          {expiryGroups.within30} batches
                        </span>
                      </div>
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <span className="text-[11px] font-bold text-yellow-800 uppercase block">
                          Within 60 Days
                        </span>
                        <span className="text-[18px] font-bold text-yellow-700 mt-1 block">
                          {expiryGroups.within60} batches
                        </span>
                      </div>
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <span className="text-[11px] font-bold text-blue-800 uppercase block">
                          Within 90 Days
                        </span>
                        <span className="text-[18px] font-bold text-blue-700 mt-1 block">
                          {expiryGroups.within90} batches
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Medicine Name</th>
                          <th className="p-3 font-semibold">Batch No</th>
                          <th className="p-3 font-semibold">Category</th>
                          <th className="p-3 font-semibold text-center">
                            Available Stock
                          </th>
                          <th className="p-3 font-semibold">Expiry Date</th>
                          <th className="p-3 font-semibold text-center">
                            Days Remaining
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {detailedExpiryBatches
                          .filter(
                            (b) =>
                              !tableSearch ||
                              b.medicineName
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()) ||
                              b.batchNumber
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()),
                          )
                          .map((b, i) => (
                            <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {b.medicineName}
                                {b.genericName && (
                                  <span className="block text-[11px] text-[#94A3B8]">
                                    {b.genericName}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-[12px] text-[#64748B]">
                                {b.batchNumber}
                              </td>
                              <td className="p-3 text-[#475569]">
                                {b.category}
                              </td>
                              <td className="p-3 text-center font-bold">
                                {b.availableQuantity}
                              </td>
                              <td className="p-3">{b.expiryDate}</td>
                              <td className="p-3 text-center font-medium">
                                {b.daysLeft < 0
                                  ? `${Math.abs(b.daysLeft)} days ago`
                                  : `${b.daysLeft} days`}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                    b.status === "expired"
                                      ? "bg-red-100 text-red-800"
                                      : b.status === "critical"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-yellow-100 text-yellow-800"
                                  }`}
                                >
                                  {b.status === "expired"
                                    ? "Expired"
                                    : b.status === "critical"
                                      ? "Critical (<30d)"
                                      : "Warning (<90d)"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {detailedExpiryBatches.filter(
                          (b) =>
                            !tableSearch ||
                            b.medicineName
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()) ||
                            b.batchNumber
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        ).length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No expiring or expired batches found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Stock Valuation" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Total Stock Valuation
                        </span>
                        <span className="text-[18px] font-bold text-[#0F766E] block mt-1">
                          ₹
                          {totalStockValuation.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Total Distinct SKUs
                        </span>
                        <span className="text-[18px] font-bold text-[#0F1624] block mt-1">
                          {medicines.length}
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Total Physical Batches
                        </span>
                        <span className="text-[18px] font-bold text-green-700 block mt-1">
                          {batches.length}
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Medicine Name</th>
                          <th className="p-3 font-semibold">Category</th>
                          <th className="p-3 font-semibold text-center">
                            Available Stock
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Unit Price
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Valuation
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Stock Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {detailedStockList
                          .filter(
                            (m) =>
                              !tableSearch ||
                              m.name
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()) ||
                              m.category
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()),
                          )
                          .map((m, i) => (
                            <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {m.name}
                                {m.generic && (
                                  <span className="block text-[11px] text-[#94A3B8]">
                                    {m.generic}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-[#475569]">
                                {m.category}
                              </td>
                              <td className="p-3 text-center font-bold">
                                {m.stock} {m.unit}
                              </td>
                              <td className="p-3 text-right">
                                ₹{m.price.toFixed(2)}
                              </td>
                              <td className="p-3 text-right font-bold text-[#0F766E]">
                                ₹
                                {m.valuation.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    m.status === "out_of_stock"
                                      ? "bg-red-100 text-red-800"
                                      : m.status === "low_stock"
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {m.status === "out_of_stock"
                                    ? "Out of Stock"
                                    : m.status === "low_stock"
                                      ? "Low Stock"
                                      : "In Stock"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {detailedStockList.filter(
                          (m) =>
                            !tableSearch ||
                            m.name
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()) ||
                            m.category
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        ).length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No medicine stock valuation records found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport.includes("Stock") ||
                  activeReport.includes("Moving") ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">Medicine Name</th>
                        <th className="p-3 font-semibold">Category</th>
                        <th className="p-3 font-semibold text-center">
                          Current Stock
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Reorder Level
                        </th>
                        {activeReport.includes("Moving") && (
                          <th className="p-3 font-semibold text-center">
                            Units Sold
                          </th>
                        )}
                        <th className="p-3 font-semibold text-right">
                          Unit Price
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {detailedStockList
                        .filter((m) => {
                          if (
                            activeReport === "Low Stock Report" &&
                            m.status !== "low_stock" &&
                            m.status !== "out_of_stock"
                          )
                            return false
                          if (
                            activeReport === "Out-of-Stock Report" &&
                            m.status !== "out_of_stock"
                          )
                            return false
                          if (!tableSearch) return true
                          return (
                            m.name
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()) ||
                            m.category
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase())
                          )
                        })
                        .sort((a, b) => {
                          if (activeReport === "Fast-Moving Medicines")
                            return b.unitsSold - a.unitsSold
                          if (activeReport === "Slow-Moving Medicines")
                            return a.unitsSold - b.unitsSold
                          return 0
                        })
                        .map((m, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-semibold text-[#0F1624]">
                              {m.name}
                              <span className="block text-[11px] text-[#94A3B8]">
                                {m.generic}
                              </span>
                            </td>
                            <td className="p-3 text-[#475569]">{m.category}</td>
                            <td className="p-3 text-center font-bold">
                              {m.stock} {m.unit}
                            </td>
                            <td className="p-3 text-center text-[#64748B]">
                              {m.reorderLevel}
                            </td>
                            {activeReport.includes("Moving") && (
                              <td className="p-3 text-center font-bold text-[#0F766E]">
                                {m.unitsSold}
                              </td>
                            )}
                            <td className="p-3 text-right">
                              ₹{m.price.toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  m.status === "out_of_stock"
                                    ? "bg-red-100 text-red-800"
                                    : m.status === "low_stock"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-green-100 text-green-800"
                                }`}
                              >
                                {m.status === "out_of_stock"
                                  ? "Out of Stock"
                                  : m.status === "low_stock"
                                    ? "Low Stock"
                                    : "In Stock"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {detailedStockList.filter((m) => {
                        if (
                          activeReport === "Low Stock Report" &&
                          m.status !== "low_stock" &&
                          m.status !== "out_of_stock"
                        )
                          return false
                        if (
                          activeReport === "Out-of-Stock Report" &&
                          m.status !== "out_of_stock"
                        )
                          return false
                        if (!tableSearch) return true
                        return (
                          m.name
                            .toLowerCase()
                            .includes(tableSearch.toLowerCase()) ||
                          m.category
                            .toLowerCase()
                            .includes(tableSearch.toLowerCase())
                        )
                      }).length === 0 && (
                        <tr>
                          <td
                            colSpan={activeReport.includes("Moving") ? 7 : 6}
                            className="p-8 text-center text-[#94A3B8]"
                          >
                            No medicine stock records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : activeReport === "Medicine Write-Offs" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Total Units Written Off
                        </span>
                        <span className="text-[18px] font-bold text-red-600 block mt-1">
                          {writeOffsReportSummary.totalUnits.toLocaleString("en-IN")} units
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Total Loss Valuation
                        </span>
                        <span className="text-[18px] font-bold text-rose-700 block mt-1">
                          ₹
                          {writeOffsReportSummary.totalLoss.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Write-Off Transactions
                        </span>
                        <span className="text-[18px] font-bold text-[#0F1624] block mt-1">
                          {writeOffsReportSummary.totalCount}
                        </span>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                        <span className="text-[11px] font-semibold text-[#64748B]">
                          Medicines Affected
                        </span>
                        <span className="text-[18px] font-bold text-[#0F766E] block mt-1">
                          {writeOffsReportSummary.distinctMedicines}
                        </span>
                      </div>
                    </div>

                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#ECFDF5] border-y border-[#A7F3D0] text-[#065F46]">
                        <tr>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Receipt No</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Date & Time</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Medicine</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Batch</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-center">Qty</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-center">Stock (Prev/Rem)</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px] text-right">Loss Value</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Reason</th>
                          <th className="p-3 font-bold uppercase tracking-wider text-[11px]">Staff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {filteredWriteOffsList.length > 0 ? (
                          filteredWriteOffsList.map((w, idx) => (
                            <tr key={idx} className="hover:bg-[#F0FDFA] transition-colors">
                              <td className="p-3 font-bold text-[#0F766E] font-mono whitespace-nowrap">
                                {w.receiptNumber}
                              </td>
                              <td className="p-3 text-[#64748B] whitespace-nowrap">
                                {new Date(w.date || w.createdAt).toLocaleDateString("en-IN")}{" "}
                                <span className="text-[10px] text-[#94A3B8]">
                                  {new Date(w.date || w.createdAt).toLocaleTimeString("en-IN", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {w.medicineName}
                                {w.genericName && (
                                  <span className="block text-[10px] text-[#94A3B8]">
                                    {w.genericName}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-[#475569]">{w.batchNumber}</td>
                              <td className="p-3 text-center font-bold text-red-600">
                                -{w.quantity} {w.unitOfMeasure}
                              </td>
                              <td className="p-3 text-center text-[#475569]">
                                {w.previousStock} →{" "}
                                <span className="font-semibold text-emerald-700">
                                  {w.remainingStock}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-rose-700">
                                ₹
                                {(w.totalLossValue || 0).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-[#334155] max-w-xs truncate" title={w.reason}>
                                {w.reason}
                                {w.remarks && (
                                  <span className="block text-[10px] text-[#94A3B8] truncate" title={w.remarks}>
                                    {w.remarks}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-[#64748B] whitespace-nowrap">{w.writtenOffBy}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-[#94A3B8]">
                              No medicine write-off records found for the selected period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport.includes("GRN") ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">GRN Number</th>
                        <th className="p-3 font-semibold">PO Reference</th>
                        <th className="p-3 font-semibold">Supplier</th>
                        <th className="p-3 font-semibold">Received Date</th>
                        <th className="p-3 font-semibold text-center">
                          Items Received
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Total Value
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {detailedGRNsList
                        .filter(
                          (g) =>
                            !tableSearch ||
                            g.grnNumber
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()) ||
                            g.supplier
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        )
                        .map((g, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-mono font-bold text-green-700">
                              {g.grnNumber}
                            </td>
                            <td className="p-3 font-mono text-[12px] text-blue-700">
                              {g.poNumber}
                            </td>
                            <td className="p-3 font-medium text-[#0F1624]">
                              {g.supplier}
                            </td>
                            <td className="p-3 text-[#64748B]">
                              {g.receivedDate
                                ? new Date(g.receivedDate).toLocaleDateString(
                                    "en-IN",
                                  )
                                : "N/A"}
                            </td>
                            <td className="p-3 text-center font-bold">
                              {g.itemsCount} items
                            </td>
                            <td className="p-3 text-right font-bold text-[#0F766E]">
                              ₹
                              {g.totalValue.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800">
                                {g.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      {detailedGRNsList.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-8 text-center text-[#94A3B8]"
                          >
                            No Goods Received Notes (GRN) found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : activeReport === "Purchase Report" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <div className="flex items-center justify-between text-blue-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Purchase Value
                          </span>
                          <ShoppingCart size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-blue-950 block">
                          ₹
                          {procurementSummary.totalValue.toLocaleString(
                            "en-IN",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </span>
                        <span className="text-[10px] text-blue-700 block mt-0.5">
                          Procurement commitment
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="flex items-center justify-between text-slate-600 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Items Purchased
                          </span>
                          <Package size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-slate-900 block">
                          {procurementSummary.totalItemsCount} lines
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Across all purchase orders
                        </span>
                      </div>

                      <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-center justify-between text-purple-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Suppliers
                          </span>
                          <Truck size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-purple-950 block">
                          {procurementSummary.distinctSuppliers} vendors
                        </span>
                        <span className="text-[10px] text-purple-600 block mt-0.5">
                          Active supply sources
                        </span>
                      </div>

                      <div className="p-3 bg-green-50 border border-green-200 rounded">
                        <div className="flex items-center justify-between text-green-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Received Qty
                          </span>
                          <CheckCircle2 size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-green-800 block">
                          {procurementSummary.totalReceivedQty.toLocaleString()}{" "}
                          units
                        </span>
                        <span className="text-[10px] text-green-700 block mt-0.5">
                          Stock physically accepted
                        </span>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center justify-between text-amber-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Pending Qty
                          </span>
                          <Clock size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-amber-900 block">
                          {procurementSummary.totalPendingQty.toLocaleString()}{" "}
                          units
                        </span>
                        <span className="text-[10px] text-amber-700 block mt-0.5">
                          Awaiting delivery / GRN
                        </span>
                      </div>
                    </div>

                    {/* Procurement Activity Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Purchase Date</th>
                          <th className="p-3 font-semibold">Supplier</th>
                          <th className="p-3 font-semibold">Medicine / Item</th>
                          <th className="p-3 font-semibold text-center">
                            Purchased Qty
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Received Qty
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Pending Qty
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Purchase Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            GRN / Received Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {procurementActivityList
                          .filter((item) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              item.medicineName.toLowerCase().includes(query) ||
                              item.genericName.toLowerCase().includes(query) ||
                              item.supplierName.toLowerCase().includes(query) ||
                              item.poNumber.toLowerCase().includes(query) ||
                              (item.grnNumber &&
                                item.grnNumber.toLowerCase().includes(query))
                            )
                          })
                          .map((item) => (
                            <tr key={item.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 text-[#475569]">
                                <span className="font-medium text-[#0F1624] block">
                                  {item.purchaseDate}
                                </span>
                                <span className="text-[11px] font-mono text-teal-700 block">
                                  {item.poNumber}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-[#0F1624]">
                                {item.supplierName}
                              </td>
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {item.medicineName}
                                {item.genericName && (
                                  <span className="block text-[11px] text-[#94A3B8] font-normal">
                                    {item.genericName}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center font-bold text-[#0F1624]">
                                {item.quantityPurchased.toLocaleString()}
                              </td>
                              <td className="p-3 text-center font-bold text-green-700">
                                {item.quantityReceived.toLocaleString()}
                              </td>
                              <td className="p-3 text-center">
                                {item.pendingQuantity > 0 ? (
                                  <span className="font-bold text-amber-700">
                                    {item.pendingQuantity.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-[#94A3B8]">0</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-bold text-[#0F766E]">
                                ₹
                                {item.purchaseValue.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    item.grnStatus.includes("Received") ||
                                    item.grnStatus.includes("Fully")
                                      ? "bg-green-100 text-green-800"
                                      : item.grnStatus.includes("Partial")
                                        ? "bg-amber-100 text-amber-800"
                                        : item.grnStatus === "Cancelled"
                                          ? "bg-red-100 text-red-800"
                                          : "bg-teal-50 text-blue-700 border border-blue-200"
                                  }`}
                                >
                                  {item.grnStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {procurementActivityList.length === 0 && (
                          <tr>
                            <td
                              colSpan={8}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No procurement activity found for the selected
                              date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Purchase Order Report" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <div className="flex items-center justify-between text-blue-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Purchase Orders
                          </span>
                          <FileText size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-blue-950 block">
                          {poTrackingSummary.totalPOs} orders
                        </span>
                        <span className="text-[10px] text-blue-700 block mt-0.5">
                          In selected date range
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="flex items-center justify-between text-slate-600 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Order Value
                          </span>
                          <ShoppingCart size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-slate-900 block">
                          ₹
                          {poTrackingSummary.totalValue.toLocaleString(
                            "en-IN",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Committed PO spend
                        </span>
                      </div>

                      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded">
                        <div className="flex items-center justify-between text-indigo-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Units Ordered
                          </span>
                          <Package size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-indigo-950 block">
                          {poTrackingSummary.totalOrderedQty.toLocaleString()}{" "}
                          units
                        </span>
                        <span className="text-[10px] text-indigo-600 block mt-0.5">
                          Total across lines
                        </span>
                      </div>

                      <div className="p-3 bg-green-50 border border-green-200 rounded">
                        <div className="flex items-center justify-between text-green-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Units Received
                          </span>
                          <CheckCircle2 size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-green-800 block">
                          {poTrackingSummary.totalReceivedQty.toLocaleString()}{" "}
                          units
                        </span>
                        <span className="text-[10px] text-green-700 block mt-0.5">
                          Fulfilled to date
                        </span>
                      </div>

                      <div className="p-3 bg-teal-50 border border-teal-200 rounded">
                        <div className="flex items-center justify-between text-teal-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Fulfillment Rate
                          </span>
                          <TrendingUp size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-teal-900 block">
                          {poTrackingSummary.fulfillmentRate}%
                        </span>
                        <span className="text-[10px] text-teal-700 block mt-0.5">
                          {poTrackingSummary.activePOs} active POs pending
                        </span>
                      </div>
                    </div>

                    {/* PO Lifecycle / Tracking Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">PO Number</th>
                          <th className="p-3 font-semibold">Supplier</th>
                          <th className="p-3 font-semibold">PO Date</th>
                          <th className="p-3 font-semibold">
                            Expected Delivery
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Items Count
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Ordered Qty
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Received Qty
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Pending Qty
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Order Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            PO Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {poTrackingList
                          .filter((p) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              p.id.toLowerCase().includes(query) ||
                              p.supplier.toLowerCase().includes(query) ||
                              p.status.toLowerCase().includes(query)
                            )
                          })
                          .map((p) => {
                            const isOverdue =
                              p.expectedDelivery !== "N/A" &&
                              p.expectedDelivery <
                                new Date().toISOString().split("T")[0] &&
                              p.status !== "Received" &&
                              p.status !== "Cancelled"

                            return (
                              <tr key={p.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                                <td className="p-3 font-mono font-bold text-blue-700">
                                  {p.id}
                                </td>
                                <td className="p-3 font-medium text-[#0F1624]">
                                  {p.supplier}
                                </td>
                                <td className="p-3 text-[#475569]">
                                  {p.poDate}
                                </td>
                                <td className="p-3 text-[#475569]">
                                  {p.expectedDelivery}
                                  {isOverdue && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                      Overdue
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-semibold text-[#475569]">
                                  {p.itemsCount} lines
                                </td>
                                <td className="p-3 text-center font-bold text-[#0F1624]">
                                  {p.orderedQuantity.toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-bold text-green-700">
                                  {p.receivedQuantity.toLocaleString()}
                                </td>
                                <td className="p-3 text-center">
                                  {p.pendingQuantity > 0 ? (
                                    <span className="font-bold text-amber-700">
                                      {p.pendingQuantity.toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="text-[#94A3B8]">0</span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-bold text-[#0F766E]">
                                  ₹
                                  {p.totalOrderValue.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                      p.status === "Received"
                                        ? "bg-green-100 text-green-800"
                                        : p.status === "Partially Received"
                                          ? "bg-amber-100 text-amber-800"
                                          : p.status === "Ordered"
                                            ? "bg-purple-100 text-purple-800"
                                            : p.status === "Approved"
                                              ? "bg-indigo-100 text-indigo-800"
                                              : p.status === "Submitted"
                                                ? "bg-blue-100 text-blue-800"
                                                : p.status === "Cancelled"
                                                  ? "bg-red-100 text-red-800"
                                                  : p.status as string ===
                                                      "Closed"
                                                    ? "bg-teal-100 text-teal-800"
                                                    : "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {p.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        {poTrackingList.length === 0 && (
                          <tr>
                            <td
                              colSpan={10}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No purchase orders found for the selected date
                              range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Pending Purchase Report" ? (
                  <div className="space-y-4">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">PO Number</th>
                          <th className="p-3 font-semibold">Supplier Name</th>
                          <th className="p-3 font-semibold">PO Date</th>
                          <th className="p-3 font-semibold">
                            Expected Delivery
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Items Count
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Ordered Qty
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Pending Qty
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Committed Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Current Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {poTrackingList
                          .filter(
                            (p) =>
                              (p.status !== "Received" &&
                                p.status !== "Cancelled") ||
                              p.pendingQuantity > 0,
                          )
                          .filter((p) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              p.id.toLowerCase().includes(query) ||
                              p.supplier.toLowerCase().includes(query)
                            )
                          })
                          .map((p) => {
                            const isOverdue =
                              p.expectedDelivery !== "N/A" &&
                              p.expectedDelivery <
                                new Date().toISOString().split("T")[0]

                            return (
                              <tr key={p.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                                <td className="p-3 font-mono font-bold text-blue-700">
                                  {p.id}
                                </td>
                                <td className="p-3 font-medium text-[#0F1624]">
                                  {p.supplier}
                                </td>
                                <td className="p-3 text-[#475569]">
                                  {p.poDate}
                                </td>
                                <td className="p-3 text-[#475569]">
                                  {p.expectedDelivery}
                                  {isOverdue && (
                                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                                      Overdue
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-semibold text-[#475569]">
                                  {p.itemsCount} lines
                                </td>
                                <td className="p-3 text-center font-bold">
                                  {p.orderedQuantity.toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-bold text-amber-700">
                                  {p.pendingQuantity.toLocaleString()}
                                </td>
                                <td className="p-3 text-right font-bold text-[#0F766E]">
                                  ₹
                                  {p.totalOrderValue.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                      p.status === "Partially Received"
                                        ? "bg-amber-100 text-amber-800"
                                        : p.status === "Ordered"
                                          ? "bg-purple-100 text-purple-800"
                                          : p.status === "Submitted"
                                            ? "bg-blue-100 text-blue-800"
                                            : "bg-gray-100 text-gray-800"
                                    }`}
                                  >
                                    {p.status}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        {poTrackingList.filter(
                          (p) =>
                            (p.status !== "Received" &&
                              p.status !== "Cancelled") ||
                            p.pendingQuantity > 0,
                        ).length === 0 && (
                          <tr>
                            <td
                              colSpan={9}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No pending purchase orders awaiting fulfillment.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Supplier Overview" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <div className="flex items-center justify-between text-blue-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Suppliers
                          </span>
                          <Truck size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-blue-950 block">
                          {suppliers.length}
                        </span>
                        <span className="text-[10px] text-blue-700 block mt-0.5">
                          {supplierOverviewSummary.activeSuppliers} Active
                          registered
                        </span>
                      </div>

                      <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-center justify-between text-purple-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Orders Placed
                          </span>
                          <ShoppingCart size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-purple-950 block">
                          {supplierOverviewSummary.totalOrders} POs
                        </span>
                        <span className="text-[10px] text-purple-700 block mt-0.5">
                          In selected date range
                        </span>
                      </div>

                      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded">
                        <div className="flex items-center justify-between text-indigo-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Purchase Spend
                          </span>
                          <FileText size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-indigo-950 block">
                          ₹
                          {supplierOverviewSummary.totalSpend.toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2 },
                          )}
                        </span>
                        <span className="text-[10px] text-indigo-700 block mt-0.5">
                          Cumulative PO value
                        </span>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center justify-between text-amber-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Suppliers with Pending
                          </span>
                          <Clock size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-amber-950 block">
                          {supplierOverviewSummary.suppliersWithPending}
                        </span>
                        <span className="text-[10px] text-amber-700 block mt-0.5">
                          Deliveries in-flight
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Supplier Name</th>
                          <th className="p-3 font-semibold">Contact Person</th>
                          <th className="p-3 font-semibold">Phone / Email</th>
                          <th className="p-3 font-semibold">GSTIN / Tax ID</th>
                          <th className="p-3 font-semibold text-center">
                            Orders Count
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Pending Deliveries
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Purchase Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {supplierOverviewList
                          .filter((s) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              s.name.toLowerCase().includes(query) ||
                              s.contact.toLowerCase().includes(query) ||
                              s.gstin.toLowerCase().includes(query) ||
                              s.phone.toLowerCase().includes(query)
                            )
                          })
                          .map((s) => (
                            <tr key={s.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {s.name}
                              </td>
                              <td className="p-3 text-[#475569]">
                                {s.contact}
                              </td>
                              <td className="p-3 text-[12px] text-[#64748B]">
                                <div>{s.phone}</div>
                                <div className="text-[11px] text-[#94A3B8]">
                                  {s.email}
                                </div>
                              </td>
                              <td className="p-3 font-mono text-[11px] text-[#64748B]">
                                {s.gstin}
                              </td>
                              <td className="p-3 text-center font-bold">
                                {s.ordersCount}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    s.pendingDeliveries > 0
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {s.pendingDeliveries}
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-[#0F766E]">
                                ₹
                                {s.totalPurchaseValue.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    s.status === "Active"
                                      ? "bg-green-100 text-green-800"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                >
                                  {s.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {supplierOverviewList.length === 0 && (
                          <tr>
                            <td
                              colSpan={8}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No suppliers registered in the system.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Supplier-wise Purchases" ||
                  activeReport === "Supplier-wise Purchase Report" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <div className="flex items-center justify-between text-blue-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Suppliers Purchased From
                          </span>
                          <Truck size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-blue-950 block">
                          {
                            supplierWisePurchasesList.filter(
                              (s) => s.purchaseOrdersCount > 0,
                            ).length
                          }{" "}
                          Suppliers
                        </span>
                        <span className="text-[10px] text-blue-700 block mt-0.5">
                          Out of {suppliers.length} suppliers
                        </span>
                      </div>

                      <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-center justify-between text-purple-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Purchase Orders
                          </span>
                          <ShoppingCart size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-purple-950 block">
                          {supplierWisePurchasesSummary.totalPOs} POs
                        </span>
                        <span className="text-[10px] text-purple-700 block mt-0.5">
                          Issued in period
                        </span>
                      </div>

                      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded">
                        <div className="flex items-center justify-between text-indigo-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Purchase Value
                          </span>
                          <FileText size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-indigo-950 block">
                          ₹
                          {supplierWisePurchasesSummary.totalPurchaseValue.toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2 },
                          )}
                        </span>
                        <span className="text-[10px] text-indigo-700 block mt-0.5">
                          Committed procurement
                        </span>
                      </div>

                      <div className="p-3 bg-teal-50 border border-teal-200 rounded">
                        <div className="flex items-center justify-between text-teal-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Goods Received Value
                          </span>
                          <CheckCircle2 size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-teal-950 block">
                          ₹
                          {supplierWisePurchasesSummary.totalReceivedValue.toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2 },
                          )}
                        </span>
                        <span className="text-[10px] text-teal-700 block mt-0.5">
                          Pending: ₹
                          {supplierWisePurchasesSummary.totalPendingValue.toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2 },
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Supplier Name</th>
                          <th className="p-3 font-semibold text-center">
                            Purchase Orders
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Purchase Value
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Goods Received Value
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Pending Purchase Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Unique Medicines
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Last Purchase Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {supplierWisePurchasesList
                          .filter((s) => {
                            if (!tableSearch) return true
                            return s.supplierName
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase())
                          })
                          .map((s) => (
                            <tr key={s.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {s.supplierName}
                              </td>
                              <td className="p-3 text-center font-bold">
                                {s.purchaseOrdersCount}
                              </td>
                              <td className="p-3 text-right font-bold text-[#0F766E]">
                                ₹
                                {s.totalPurchaseValue.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-right font-bold text-green-700">
                                ₹
                                {s.goodsReceivedValue.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-right">
                                {s.pendingPurchaseValue > 0 ? (
                                  <span className="font-bold text-amber-700">
                                    ₹
                                    {s.pendingPurchaseValue.toLocaleString(
                                      "en-IN",
                                      { minimumFractionDigits: 2 },
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[#94A3B8]">₹0.00</span>
                                )}
                              </td>
                              <td className="p-3 text-center font-medium text-[#475569]">
                                {s.itemsCount > 0
                                  ? `${s.itemsCount} items`
                                  : "—"}
                              </td>
                              <td className="p-3 text-center text-[#64748B] text-[12px]">
                                {s.lastPurchaseDate}
                              </td>
                            </tr>
                          ))}
                        {supplierWisePurchasesList.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No purchase records found for any supplier in this
                              period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Supplier Order History" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <div className="flex items-center justify-between text-blue-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Orders
                          </span>
                          <FileText size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-blue-950 block">
                          {supplierOrderHistorySummary.totalOrders} POs
                        </span>
                        <span className="text-[10px] text-blue-700 block mt-0.5">
                          Placed in period
                        </span>
                      </div>

                      <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-center justify-between text-purple-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Active / In-Flight
                          </span>
                          <Clock size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-purple-950 block">
                          {supplierOrderHistorySummary.ordered +
                            supplierOrderHistorySummary.partiallyReceived}{" "}
                          POs
                        </span>
                        <span className="text-[10px] text-purple-700 block mt-0.5">
                          {supplierOrderHistorySummary.ordered} ordered,{" "}
                          {supplierOrderHistorySummary.partiallyReceived}{" "}
                          partial
                        </span>
                      </div>

                      <div className="p-3 bg-green-50 border border-green-200 rounded">
                        <div className="flex items-center justify-between text-green-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Fully Received
                          </span>
                          <CheckCircle2 size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-green-950 block">
                          {supplierOrderHistorySummary.received} POs
                        </span>
                        <span className="text-[10px] text-green-700 block mt-0.5">
                          Completed fulfillment
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                        <div className="flex items-center justify-between text-slate-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Cancelled Orders
                          </span>
                          <AlertCircle size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-slate-950 block">
                          {supplierOrderHistorySummary.cancelled} POs
                        </span>
                        <span className="text-[10px] text-slate-700 block mt-0.5">
                          Voided or rejected
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">PO Number</th>
                          <th className="p-3 font-semibold">Supplier Name</th>
                          <th className="p-3 font-semibold">PO Date</th>
                          <th className="p-3 font-semibold">
                            Expected Delivery
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Items Count
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Ordered Qty
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Received Qty
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Order Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Order Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {supplierOrderHistoryList
                          .filter((p) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              p.id.toLowerCase().includes(query) ||
                              p.supplierName.toLowerCase().includes(query) ||
                              p.orderStatus.toLowerCase().includes(query)
                            )
                          })
                          .map((p) => (
                            <tr key={p.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-mono font-bold text-blue-700">
                                {p.id}
                              </td>
                              <td className="p-3 font-medium text-[#0F1624]">
                                {p.supplierName}
                              </td>
                              <td className="p-3 text-[#475569]">{p.poDate}</td>
                              <td className="p-3 text-[#475569]">
                                {p.expectedDelivery}
                              </td>
                              <td className="p-3 text-center font-semibold text-[#475569]">
                                {p.itemsCount} lines
                              </td>
                              <td className="p-3 text-center font-bold text-[#0F1624]">
                                {p.orderedQuantity.toLocaleString()}
                              </td>
                              <td className="p-3 text-center font-bold text-green-700">
                                {p.receivedQuantity.toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-bold text-[#0F766E]">
                                ₹
                                {p.totalOrderValue.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    p.orderStatus === "Received"
                                      ? "bg-green-100 text-green-800"
                                      : p.orderStatus === "Partially Received"
                                        ? "bg-amber-100 text-amber-800"
                                        : p.orderStatus === "Ordered"
                                          ? "bg-purple-100 text-purple-800"
                                          : p.orderStatus === "Approved"
                                            ? "bg-indigo-100 text-indigo-800"
                                            : p.orderStatus === "Cancelled"
                                              ? "bg-red-100 text-red-800"
                                              : "bg-gray-100 text-gray-800"
                                  }`}
                                >
                                  {p.orderStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {supplierOrderHistoryList.length === 0 && (
                          <tr>
                            <td
                              colSpan={9}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No supplier orders found for the selected date
                              range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Supplier Returns" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                        <div className="flex items-center justify-between text-purple-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Supplier Returns
                          </span>
                          <RotateCcw size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-purple-950 block">
                          {supplierReturnsSummary.totalReturns} Records
                        </span>
                        <span className="text-[10px] text-purple-700 block mt-0.5">
                          Procurement return batches
                        </span>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center justify-between text-amber-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Total Units Returned
                          </span>
                          <Package size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-amber-950 block">
                          {supplierReturnsSummary.totalUnits.toLocaleString()}{" "}
                          units
                        </span>
                        <span className="text-[10px] text-amber-700 block mt-0.5">
                          Returned to vendors
                        </span>
                      </div>

                      <div className="p-3 bg-teal-50 border border-teal-200 rounded">
                        <div className="flex items-center justify-between text-teal-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Credit Notes
                          </span>
                          <FileText size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-teal-950 block">
                          {supplierReturnsSummary.creditNotes} Issued
                        </span>
                        <span className="text-[10px] text-teal-700 block mt-0.5">
                          Vendor credit adjustments
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Return ID</th>
                          <th className="p-3 font-semibold">Supplier Name</th>
                          <th className="p-3 font-semibold">Medicine Name</th>
                          <th className="p-3 font-semibold">Batch Number</th>
                          <th className="p-3 font-semibold text-center">
                            Returned Qty
                          </th>
                          <th className="p-3 font-semibold">Return Reason</th>
                          <th className="p-3 font-semibold text-center">
                            Return Date
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Status
                          </th>
                          <th className="p-3 font-semibold">Credit Note ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {supplierReturnsList
                          .filter((r) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              r.id.toLowerCase().includes(query) ||
                              r.supplierName.toLowerCase().includes(query) ||
                              r.medicineName.toLowerCase().includes(query) ||
                              r.returnReason.toLowerCase().includes(query)
                            )
                          })
                          .map((r) => (
                            <tr key={r.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-mono font-bold text-purple-700">
                                {r.id}
                              </td>
                              <td className="p-3 font-medium text-[#0F1624]">
                                {r.supplierName}
                              </td>
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {r.medicineName}
                              </td>
                              <td className="p-3 font-mono text-[12px] text-[#475569]">
                                {r.batchNumber}
                              </td>
                              <td className="p-3 text-center font-bold text-red-700">
                                {r.returnedQuantity.toLocaleString()}
                              </td>
                              <td className="p-3 text-[#475569]">
                                {r.returnReason}
                              </td>
                              <td className="p-3 text-center text-[#64748B] text-[12px]">
                                {r.returnDate}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    r.status as string === "Completed"
                                      ? "bg-green-100 text-green-800"
                                      : r.status === "Approved"
                                        ? "bg-blue-100 text-blue-800"
                                        : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {r.status}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-[12px] text-blue-700">
                                {r.creditNoteId}
                              </td>
                            </tr>
                          ))}
                        {supplierReturnsList.length === 0 && (
                          <tr>
                            <td
                              colSpan={9}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No supplier returns found for the selected period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Pending Supplier Deliveries" ? (
                  <div className="space-y-4">
                    {/* Summary Metrics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-teal-50 border border-blue-200 rounded">
                        <div className="flex items-center justify-between text-blue-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Pending Deliveries
                          </span>
                          <Truck size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-blue-950 block">
                          {pendingSupplierDeliveriesSummary.pendingOrders}{" "}
                          Orders
                        </span>
                        <span className="text-[10px] text-blue-700 block mt-0.5">
                          Awaiting fulfillment
                        </span>
                      </div>

                      <div className="p-3 bg-amber-50 border border-amber-200 rounded">
                        <div className="flex items-center justify-between text-amber-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Units Pending
                          </span>
                          <Package size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-amber-950 block">
                          {pendingSupplierDeliveriesSummary.pendingItems.toLocaleString()}{" "}
                          units
                        </span>
                        <span className="text-[10px] text-amber-700 block mt-0.5">
                          Awaiting receipt
                        </span>
                      </div>

                      <div className="p-3 bg-indigo-50 border border-indigo-200 rounded">
                        <div className="flex items-center justify-between text-indigo-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Pending Value
                          </span>
                          <FileText size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-indigo-950 block">
                          ₹
                          {pendingSupplierDeliveriesSummary.pendingValue.toLocaleString(
                            "en-IN",
                            { minimumFractionDigits: 2 },
                          )}
                        </span>
                        <span className="text-[10px] text-indigo-700 block mt-0.5">
                          Committed procurement
                        </span>
                      </div>

                      <div className="p-3 bg-red-50 border border-red-200 rounded">
                        <div className="flex items-center justify-between text-red-700 mb-1">
                          <span className="text-[11px] font-bold uppercase">
                            Overdue Deliveries
                          </span>
                          <AlertTriangle size={13} />
                        </div>
                        <span className="text-[17px] font-bold text-red-950 block">
                          {pendingSupplierDeliveriesSummary.overdueDeliveries}{" "}
                          POs
                        </span>
                        <span className="text-[10px] text-red-700 block mt-0.5">
                          Past expected delivery date
                        </span>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">PO Number</th>
                          <th className="p-3 font-semibold">Supplier Name</th>
                          <th className="p-3 font-semibold">PO Date</th>
                          <th className="p-3 font-semibold">
                            Expected Delivery
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Schedule
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Items Ordered
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Items Received
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Items Pending
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Pending Value
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Delivery Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {pendingSupplierDeliveriesList
                          .filter((p) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              p.id.toLowerCase().includes(query) ||
                              p.supplierName.toLowerCase().includes(query) ||
                              p.deliveryStatus.toLowerCase().includes(query)
                            )
                          })
                          .map((p) => (
                            <tr key={p.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-mono font-bold text-blue-700">
                                {p.id}
                              </td>
                              <td className="p-3 font-medium text-[#0F1624]">
                                {p.supplierName}
                              </td>
                              <td className="p-3 text-[#475569]">{p.poDate}</td>
                              <td className="p-3 text-[#475569]">
                                {p.expectedDelivery}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    p.isOverdue
                                      ? "bg-red-100 text-red-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {p.scheduleText}
                                </span>
                              </td>
                              <td className="p-3 text-center font-bold text-[#0F1624]">
                                {p.itemsOrdered.toLocaleString()}
                              </td>
                              <td className="p-3 text-center font-bold text-green-700">
                                {p.itemsReceived.toLocaleString()}
                              </td>
                              <td className="p-3 text-center font-bold text-amber-700">
                                {p.itemsPending.toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-bold text-[#0F766E]">
                                ₹
                                {p.pendingValue.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                    p.deliveryStatus === "Overdue"
                                      ? "bg-red-100 text-red-800"
                                      : p.deliveryStatus ===
                                          "Partially Received"
                                        ? "bg-amber-100 text-amber-800"
                                        : p.deliveryStatus === "Ordered"
                                          ? "bg-purple-100 text-purple-800"
                                          : "bg-blue-100 text-blue-800"
                                  }`}
                                >
                                  {p.deliveryStatus}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {pendingSupplierDeliveriesList.length === 0 && (
                          <tr>
                            <td
                              colSpan={10}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No pending supplier deliveries awaiting
                              fulfillment.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport.includes("Supplier") ? (
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">Supplier Name</th>
                        <th className="p-3 font-semibold">Contact Person</th>
                        <th className="p-3 font-semibold">Phone / Email</th>
                        <th className="p-3 font-semibold">GSTIN / Tax ID</th>
                        <th className="p-3 font-semibold text-center">
                          Orders Count
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Pending Deliveries
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Total Purchase Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {supplierOverviewList
                        .filter(
                          (s) =>
                            !tableSearch ||
                            s.name
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()) ||
                            s.contact
                              .toLowerCase()
                              .includes(tableSearch.toLowerCase()),
                        )
                        .map((s, i) => (
                          <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                            <td className="p-3 font-semibold text-[#0F1624]">
                              {s.name}
                            </td>
                            <td className="p-3 text-[#475569]">{s.contact}</td>
                            <td className="p-3 text-[12px] text-[#64748B]">
                              <div>{s.phone}</div>
                              <div className="text-[11px] text-[#94A3B8]">
                                {s.email}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[#64748B]">
                              {s.gstin}
                            </td>
                            <td className="p-3 text-center font-bold">
                              {s.ordersCount}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  s.pendingDeliveries > 0
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {s.pendingDeliveries}
                              </span>
                            </td>
                            <td className="p-3 text-right font-bold text-[#0F766E]">
                              ₹
                              {s.totalPurchaseValue.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                ) : activeReport === "Medicine Returns" ? (
                  <div className="space-y-4">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Return ID</th>
                          <th className="p-3 font-semibold">Original Bill</th>
                          <th className="p-3 font-semibold">Patient</th>
                          <th className="p-3 font-semibold">Medicine Name</th>
                          <th className="p-3 font-semibold">Batch No</th>
                          <th className="p-3 font-semibold text-center">
                            Returned Qty
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Unit Price
                          </th>
                          <th className="p-3 font-semibold">Return Reason</th>
                          <th className="p-3 font-semibold text-right">
                            Refund Amount
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Return Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {returnedItemsList
                          .filter((item) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              item.medicineName.toLowerCase().includes(query) ||
                              item.returnNumber.toLowerCase().includes(query) ||
                              item.patientName.toLowerCase().includes(query) ||
                              item.originalBillNumber
                                .toLowerCase()
                                .includes(query) ||
                              item.batchNumber.toLowerCase().includes(query) ||
                              item.returnReason.toLowerCase().includes(query)
                            )
                          })
                          .map((item) => (
                            <tr key={item.id} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-mono font-bold text-amber-700">
                                {item.returnNumber}
                              </td>
                              <td className="p-3 font-mono text-blue-700">
                                {item.originalBillNumber}
                              </td>
                              <td className="p-3 font-medium text-[#0F1624]">
                                {item.patientName}
                                {item.patientUhid &&
                                  item.patientUhid !== "N/A" && (
                                    <span className="block text-[11px] text-[#94A3B8] font-normal">
                                      {item.patientUhid}
                                    </span>
                                  )}
                              </td>
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {item.medicineName}
                              </td>
                              <td className="p-3 font-mono text-[12px] text-[#475569]">
                                {item.batchNumber}
                              </td>
                              <td className="p-3 text-center font-bold text-red-700">
                                {item.returnQuantity.toLocaleString()}
                              </td>
                              <td className="p-3 text-right text-[#475569]">
                                ₹
                                {item.unitPrice.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-[#475569]">
                                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-700">
                                  {item.returnReason}
                                </span>
                              </td>
                              <td className="p-3 text-right font-bold text-amber-700">
                                ₹
                                {item.refundAmount.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center text-[12px] text-[#64748B]">
                                {new Date(item.returnDate).toLocaleDateString(
                                  "en-IN",
                                )}
                              </td>
                            </tr>
                          ))}
                        {returnedItemsList.length === 0 && (
                          <tr>
                            <td
                              colSpan={10}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No medicine return records found for the selected
                              date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Refund Report" ? (
                  <div className="space-y-4">
                    {/* Financial Refund Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded">
                        <span className="text-[11px] font-bold text-amber-800 uppercase block">
                          Total Refund Paid
                        </span>
                        <span className="text-[22px] font-bold text-amber-900 block mt-1">
                          ₹
                          {refundReportSummary.totalRefund.toLocaleString(
                            "en-IN",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </span>
                        <span className="text-[11px] text-amber-700 block mt-1">
                          Net cash/digital refund disbursed
                        </span>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded">
                        <span className="text-[11px] font-bold text-slate-700 uppercase block">
                          Refund Transactions
                        </span>
                        <span className="text-[22px] font-bold text-slate-900 block mt-1">
                          {refundReportSummary.transactionsCount} transactions
                        </span>
                        <span className="text-[11px] text-slate-500 block mt-1">
                          Processed return incidents
                        </span>
                      </div>

                      <div className="p-4 bg-teal-50 border border-blue-200 rounded">
                        <span className="text-[11px] font-bold text-blue-800 uppercase block">
                          Average Refund Value
                        </span>
                        <span className="text-[22px] font-bold text-blue-900 block mt-1">
                          ₹
                          {refundReportSummary.avgRefund.toLocaleString(
                            "en-IN",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </span>
                        <span className="text-[11px] text-teal-700 block mt-1">
                          Per return transaction
                        </span>
                      </div>
                    </div>

                    {/* Financial Refund Transactions Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Return ID</th>
                          <th className="p-3 font-semibold">Original Bill</th>
                          <th className="p-3 font-semibold">Patient</th>
                          <th className="p-3 font-semibold text-right">
                            Refund Amount
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Refund Date
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Refund Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {filteredReturns
                          .filter((r) => {
                            if (!tableSearch) return true
                            const query = tableSearch.toLowerCase()
                            return (
                              r.returnNumber.toLowerCase().includes(query) ||
                              (r.originalBillNumber || "")
                                .toLowerCase()
                                .includes(query) ||
                              (r.patientName || "")
                                .toLowerCase()
                                .includes(query)
                            )
                          })
                          .map((r, i) => (
                            <tr key={r.id || i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-mono font-bold text-amber-700">
                                {r.returnNumber}
                              </td>
                              <td className="p-3 font-mono text-blue-700">
                                {r.originalBillNumber}
                              </td>
                              <td className="p-3 font-medium text-[#0F1624]">
                                {r.patientName || "Walk-in Patient"}
                                {r.patientUhid && (
                                  <span className="block text-[11px] text-[#94A3B8] font-normal">
                                    {r.patientUhid}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-right font-bold text-amber-700">
                                ₹
                                {(r.refundAmount || 0).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-center text-[#475569]">
                                {new Date(r.createdAt).toLocaleDateString(
                                  "en-IN",
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800">
                                  {r.status || "Completed"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        {filteredReturns.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No refund transactions found for the selected date
                              range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Return Reasons" ? (
                  <div className="space-y-4">
                    {/* Visual Breakdown of Reasons */}
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded space-y-3">
                      <span className="text-[12px] font-bold text-[#0F1624] block uppercase tracking-wider">
                        Return Reasons Distribution
                      </span>
                      <div className="space-y-2">
                        {returnReasonsAggregation.map((entry, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-[12px]">
                              <span className="font-semibold text-[#0F1624]">
                                {entry.reason}
                              </span>
                              <span className="text-[#64748B]">
                                <strong className="text-[#0F1624]">
                                  {entry.returnsCount} returns
                                </strong>{" "}
                                ({entry.returnsPercentage.toFixed(1)}%) • ₹
                                {entry.totalRefund.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-amber-600 h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.max(4, entry.returnsPercentage)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                        {returnReasonsAggregation.length === 0 && (
                          <div className="text-center py-4 text-[#94A3B8] text-[13px]">
                            No return reasons recorded for this date range.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Aggregate Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Return Reason</th>
                          <th className="p-3 font-semibold text-center">
                            Return Cases
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Units Returned
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Refund Amount
                          </th>
                          <th className="p-3 font-semibold text-right">
                            % of Return Cases
                          </th>
                          <th className="p-3 font-semibold text-right">
                            % of Total Refunds
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {returnReasonsAggregation
                          .filter(
                            (entry) =>
                              !tableSearch ||
                              entry.reason
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()),
                          )
                          .map((entry, idx) => (
                            <tr key={idx} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {entry.reason}
                              </td>
                              <td className="p-3 text-center font-bold text-[#0F1624]">
                                {entry.returnsCount}
                              </td>
                              <td className="p-3 text-center text-[#475569]">
                                {entry.unitsReturned} units
                              </td>
                              <td className="p-3 text-right font-bold text-amber-700">
                                ₹
                                {entry.totalRefund.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-right font-semibold text-[#0F1624]">
                                {entry.returnsPercentage.toFixed(1)}%
                              </td>
                              <td className="p-3 text-right text-[#64748B]">
                                {entry.refundPercentage.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        {returnReasonsAggregation.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No return reasons data available.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Medicine-wise Returns" ? (
                  <div className="space-y-4">
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Medicine Name</th>
                          <th className="p-3 font-semibold">
                            Batches Involved
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Return Transactions
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Returned Quantity
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Total Refund
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Share of Returns
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {medicineWiseReturnsAggregation
                          .filter(
                            (entry) =>
                              !tableSearch ||
                              entry.medicineName
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()) ||
                              entry.genericName
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()),
                          )
                          .map((entry, idx) => (
                            <tr key={idx} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {entry.medicineName}
                                {entry.genericName && (
                                  <span className="block text-[11px] text-[#94A3B8] font-normal">
                                    {entry.genericName}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-[12px] text-[#475569]">
                                {entry.batchesList || "N/A"}
                              </td>
                              <td className="p-3 text-center font-bold text-[#0F1624]">
                                {entry.returnCount}
                              </td>
                              <td className="p-3 text-center font-bold text-red-700">
                                {entry.returnedQuantity.toLocaleString()} units
                              </td>
                              <td className="p-3 text-right font-bold text-amber-700">
                                ₹
                                {entry.totalRefund.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-right font-semibold text-[#0F766E]">
                                {entry.sharePercentage.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        {medicineWiseReturnsAggregation.length === 0 && (
                          <tr>
                            <td
                              colSpan={6}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No medicine-wise returns found for the selected
                              date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : activeReport === "Return Trends" ? (
                  <div className="space-y-5">
                    {/* Return Trends Chart */}
                    <div className="bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-bold text-[#0F1624] uppercase tracking-wider">
                          Return Value Trend Over Time
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          Refund Amount (₹) by Date
                        </span>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={
                              returnTrendsAggregation.length > 0
                                ? returnTrendsAggregation
                                : [
                                    {
                                      dateStr: "N/A",
                                      displayDate: "No Returns",
                                      refundAmount: 0,
                                      returnsCount: 0,
                                      returnedQuantity: 0,
                                      refundShare: 0,
                                    },
                                  ]
                            }
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="#E2E8F0"
                            />
                            <XAxis
                              dataKey="displayDate"
                              tick={{ fontSize: 11 }}
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              tickFormatter={(v) => `₹${v}`}
                            />
                            <Tooltip
                              formatter={(value: any, name: any) => [
                                name === "refundAmount"
                                  ? `₹${Number(value).toFixed(2)}`
                                  : `${value}`,
                                name === "refundAmount"
                                  ? "Refund Amount"
                                  : "Returns Count",
                              ]}
                            />
                            <Area
                              type="monotone"
                              dataKey="refundAmount"
                              name="refundAmount"
                              stroke="#D97706"
                              fill="#FEF3C7"
                              strokeWidth={2}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Daily Trends Table */}
                    <table className="w-full text-left border-collapse text-[13px]">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                        <tr>
                          <th className="p-3 font-semibold">Date</th>
                          <th className="p-3 font-semibold text-center">
                            Return Cases Count
                          </th>
                          <th className="p-3 font-semibold text-center">
                            Units Returned
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Daily Refund Disbursed
                          </th>
                          <th className="p-3 font-semibold text-right">
                            Share of Total Refunds
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F5F9]">
                        {returnTrendsAggregation
                          .filter(
                            (entry) =>
                              !tableSearch ||
                              entry.dateStr.includes(tableSearch) ||
                              entry.displayDate
                                .toLowerCase()
                                .includes(tableSearch.toLowerCase()),
                          )
                          .map((entry, idx) => (
                            <tr key={idx} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                              <td className="p-3 font-semibold text-[#0F1624]">
                                {entry.dateStr}
                              </td>
                              <td className="p-3 text-center font-bold text-[#0F1624]">
                                {entry.returnsCount}
                              </td>
                              <td className="p-3 text-center text-[#475569]">
                                {entry.returnedQuantity} units
                              </td>
                              <td className="p-3 text-right font-bold text-amber-700">
                                ₹
                                {entry.refundAmount.toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-3 text-right text-[#64748B]">
                                {entry.refundShare.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        {returnTrendsAggregation.length === 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-8 text-center text-[#94A3B8]"
                            >
                              No return trends data for the selected date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Fallback Table */
                  <table className="w-full text-left border-collapse text-[13px]">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569]">
                      <tr>
                        <th className="p-3 font-semibold">Item / Entity</th>
                        <th className="p-3 font-semibold">Reference</th>
                        <th className="p-3 font-semibold text-center">
                          Quantity / Units
                        </th>
                        <th className="p-3 font-semibold text-right">
                          Amount / Value
                        </th>
                        <th className="p-3 font-semibold text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {purchaseOrders.slice(0, 10).map((p, i) => (
                        <tr key={i} className="hover:bg-[#F0FDFA] transition-colors hover:bg-gray-50">
                          <td className="p-3 font-medium text-[#0F1624]">
                            {p.supplier}
                          </td>
                          <td className="p-3 font-mono text-[12px] text-blue-700">
                            {p.id}
                          </td>
                          <td className="p-3 text-center">{p.itemsCount}</td>
                          <td className="p-3 text-right font-bold text-[#0F766E]">
                            ₹
                            {(p.total || 0).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-800">
                              {p.status || "Completed"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
