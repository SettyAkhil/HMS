import { useState, useMemo, useEffect } from "react";
import { 
  Search, Download, Printer, RefreshCcw, Eye, X, AlertCircle, 
  CheckCircle2, RotateCcw, ArrowRight, CornerDownRight, FileText, Trash2 
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import InvoicePrintModal from "../components/InvoicePrintModal";
import { usePharmacyData } from "../data/usePharmacyData";
import { PharmacyDatabase, AppPharmacyBill, AppPharmacyReturn, AppPharmacyReturnItem } from "../../../services/pharmacyDb";

interface SalesReturnsProps { 
  onNavigate: (page: string) => void;
}

export default function SalesReturns({ onNavigate }: SalesReturnsProps) {
  const { bills, refresh } = usePharmacyData();
  const [view, setView] = useState<"sales" | "returns">("sales");
  const [selectedInv, setSelectedInv] = useState<any | null>(null);
  const [printInv, setPrintInv] = useState<any | null>(null);
  const [printReturnModal, setPrintReturnModal] = useState<{ bill: any; returnRecord: any } | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Returns tab states
  const [searchBillNo, setSearchBillNo] = useState("");
  const [searchedBill, setSearchedBill] = useState<AppPharmacyBill | null>(null);
  const [matchingCandidateBills, setMatchingCandidateBills] = useState<{
    masterNumber: string;
    original: AppPharmacyBill;
    latest: AppPharmacyBill;
    prevRefunds: number;
    activeTotal: number;
  }[]>([]);
  const [searchError, setSearchError] = useState("");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("Patient not using");
  const [returnNotes, setReturnNotes] = useState("");
  const [processSuccess, setProcessSuccess] = useState<string | null>(null);
  const [processedReturn, setProcessedReturn] = useState<AppPharmacyReturn | null>(null);
  const [processedModifiedBill, setProcessedModifiedBill] = useState<AppPharmacyBill | null>(null);
  const [recentReturns, setRecentReturns] = useState<AppPharmacyReturn[]>(() => PharmacyDatabase.getReturns());

  useEffect(() => {
    setRecentReturns(PharmacyDatabase.getReturns());
  }, [bills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    const matched = bills.filter(inv => {
      const bNo = (inv.billNumber || "").toLowerCase();
      const origBNo = (inv.originalBillNumber || "").toLowerCase();
      const pName = (inv.patientName || "").toLowerCase();
      const uhid = (inv.uhid || "").toLowerCase();
      const doctor = (inv.doctorName || "").toLowerCase();
      const bDigits = bNo.replace(/\D/g, "");

      const matchesSearch = !q ||
        bNo.includes(q) ||
        origBNo.includes(q) ||
        pName.includes(q) ||
        uhid.includes(q) ||
        doctor.includes(q) ||
        (qDigits.length >= 2 && bDigits.endsWith(qDigits)) ||
        (inv.items || []).some(i => (i.medicineName || "").toLowerCase().includes(q));

      const matchesDate = !dateFilter || (inv.billDate || (inv as any).createdAt || "").startsWith(dateFilter);
      return matchesSearch && matchesDate;
    });

    // Deduplicate by billNumber so we only see the latest version in the table
    const seen = new Set<string>();
    return matched.filter(inv => {
      const key = inv.originalBillNumber || inv.billNumber;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [bills, search, dateFilter]);
  
  const originalBills = useMemo(() => bills.filter(b => !b.isModifiedReturnBill && !b.billNumber?.startsWith("MOD-")), [bills]);
  
  // Scoped bills: if dateFilter is provided, match date; otherwise include all
  const scopedOriginalBills = useMemo(() => {
    if (!dateFilter) return originalBills;
    return originalBills.filter(b => (b.billDate || (b as any).createdAt || "").startsWith(dateFilter));
  }, [originalBills, dateFilter]);

  // Scoped returns: if dateFilter is provided, match date; otherwise include all
  const scopedReturns = useMemo(() => {
    if (!dateFilter) return recentReturns;
    return recentReturns.filter(r => (r.createdAt || "").startsWith(dateFilter));
  }, [recentReturns, dateFilter]);

  const grossRevenue = useMemo(() => scopedOriginalBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0), [scopedOriginalBills]);
  const totalRefunds = useMemo(() => scopedReturns.reduce((sum, r) => sum + (r.refundAmount || 0), 0), [scopedReturns]);
  const totalSaleBills = scopedOriginalBills.length;
  
  // Total units restocked to inventory from customer returns
  const totalRestockedUnits = useMemo(() => {
    return scopedReturns.reduce((sum, r) => {
      if (r.returnQuantity) return sum + r.returnQuantity;
      if (r.items && r.items.length > 0) {
        return sum + r.items.reduce((s, i) => s + (i.returnQuantity || 0), 0);
      }
      return sum;
    }, 0);
  }, [scopedReturns]);

  // Modified return bills count
  const modifiedBillsCount = useMemo(() => {
    return bills.filter(b => b.isModifiedReturnBill || b.billNumber?.startsWith("MOD-")).length;
  }, [bills]);

  // Reset to clean Returns view
  const handleResetToReturns = () => {
    setSearchedBill(null);
    setSearchBillNo("");
    setMatchingCandidateBills([]);
    setReturnQuantities({});
    setSearchError("");
    setProcessSuccess(null);
    setProcessedReturn(null);
    setProcessedModifiedBill(null);
    setRecentReturns(PharmacyDatabase.getReturns());
  };

  const selectBillForReturn = (item: { masterNumber: string; original: AppPharmacyBill; latest: AppPharmacyBill }) => {
    setSearchedBill(item.original);
    setSearchBillNo(item.masterNumber);
    setMatchingCandidateBills([]);
    setSearchError("");
    setProcessSuccess(null);
    setProcessedReturn(null);
    setProcessedModifiedBill(null);

    // Initialize return quantities to 0
    const initialQty: Record<string, number> = {};
    item.original.items.forEach(it => {
      initialQty[`${it.medicineId}_${it.batchNumber}`] = 0;
    });
    setReturnQuantities(initialQty);
  };

  // Search bill handler (allows searching by full bill number, last 5 digits, patient name, UHID, or doctor)
  const handleSearchBill = (queryOverride?: string) => {
    const rawQuery = (queryOverride ?? searchBillNo).trim();
    setSearchError("");
    setProcessSuccess(null);
    setProcessedReturn(null);
    setProcessedModifiedBill(null);
    setMatchingCandidateBills([]);

    if (!rawQuery) {
      setSearchError("Please enter a bill number (full or last 5 digits), patient name, or UHID to search.");
      setSearchedBill(null);
      return;
    }

    const q = rawQuery.toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    // Lookup bills in database
    const allBills = PharmacyDatabase.getBills();
    
    // Group all bills by master bill number (originalBillNumber || billNumber)
    const masterNumbers = Array.from(new Set(allBills.map(b => b.originalBillNumber || b.billNumber)));
    
    const candidateList = masterNumbers.map(bNum => {
      const orig = allBills.find(b => !b.isModifiedReturnBill && (b.billNumber === bNum || b.originalBillNumber === bNum)) 
        || allBills.find(b => b.billNumber === bNum);
      if (!orig) return null;
      
      const latest = allBills.find(b => b.isModifiedReturnBill && (b.billNumber === bNum || b.originalBillNumber === bNum)) || orig;
      const returns = PharmacyDatabase.getReturnsForBill(bNum);
      const prevRefunds = returns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
      const origTotal = orig.totalAmount || 0;

      const allItemsReturned = (orig.items || []).every(it => {
        const k = `${it.medicineId}_${it.batchNumber}`;
        const returnedCount = returns.reduce((sum, r) => {
          const matchedItem = r.items?.find(ri => `${ri.medicineId}_${ri.batchNumber}` === k);
          return sum + (matchedItem ? matchedItem.returnQuantity : 0);
        }, 0);
        return returnedCount >= (it.quantity || 0);
      });

      const activeTotal = allItemsReturned 
        ? 0 
        : latest.isModifiedReturnBill 
          ? (latest.totalAmount || 0) 
          : Math.max(0, origTotal - prevRefunds);

      return {
        masterNumber: bNum,
        original: orig,
        latest,
        prevRefunds,
        activeTotal
      };
    }).filter(Boolean) as { masterNumber: string; original: AppPharmacyBill; latest: AppPharmacyBill; prevRefunds: number; activeTotal: number }[];

    // Filter by matching query
    const matches = candidateList.filter(item => {
      const bNo = (item.original.billNumber || "").toLowerCase();
      const pName = (item.original.patientName || "").toLowerCase();
      const uhid = (item.original.uhid || "").toLowerCase();
      const doc = (item.original.doctorName || "").toLowerCase();
      const bDigits = bNo.replace(/\D/g, "");

      if (bNo === q || bNo.includes(q)) return true;
      if (pName.includes(q)) return true;
      if (uhid.includes(q)) return true;
      if (doc.includes(q)) return true;
      if (qDigits.length >= 2 && bDigits.endsWith(qDigits)) return true;
      if (bNo.endsWith(q)) return true;

      return false;
    });

    if (matches.length === 0) {
      setSearchError(`No bills found matching "${rawQuery}". You can search by bill number (full or last 5 digits e.g. 00042), patient name, or UHID.`);
      setSearchedBill(null);
      setReturnQuantities({});
      return;
    }

    if (matches.length === 1) {
      selectBillForReturn(matches[0]);
    } else {
      setMatchingCandidateBills(matches);
    }
  };

  // Start return from sales history
  const handleStartReturnFromSales = (bill: AppPharmacyBill) => {
    const targetBillNumber = bill.originalBillNumber || bill.billNumber;
    setView("returns");
    setSearchBillNo(targetBillNumber);
    handleSearchBill(targetBillNumber);
  };

  // Calculate past returns for the searched bill
  const existingReturnsForSearchedBill = useMemo(() => {
    if (!searchedBill) return [];
    const targetNum = searchedBill.originalBillNumber || searchedBill.billNumber;
    return PharmacyDatabase.getReturnsForBill(targetNum);
  }, [searchedBill, recentReturns]);

  // Calculate previously returned quantities per line item
  const previouslyReturnedMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!searchedBill) return map;

    existingReturnsForSearchedBill.forEach(ret => {
      (ret.items || []).forEach(item => {
        const key = `${item.medicineId}_${item.batchNumber}`;
        map[key] = (map[key] || 0) + (item.returnQuantity || 0);
      });
      if (ret.medicineId && ret.returnQuantity && (!ret.items || ret.items.length === 0)) {
        const key = `${ret.medicineId}_${ret.batchNumber || ""}`;
        map[key] = (map[key] || 0) + ret.returnQuantity;
      }
    });
    return map;
  }, [searchedBill, existingReturnsForSearchedBill]);

  const allPreviousRefundAmount = useMemo(() => {
    return existingReturnsForSearchedBill.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
  }, [existingReturnsForSearchedBill]);

  const currentActiveBillTotal = useMemo(() => {
    if (!searchedBill) return 0;
    const origTotal = searchedBill.totalAmount || 0;
    // Check if any items are still eligible for return
    const totalEligible = searchedBill.items.reduce((sum, origItem) => {
      const key = `${origItem.medicineId}_${origItem.batchNumber}`;
      const prev = previouslyReturnedMap[key] || 0;
      return sum + Math.max(0, origItem.quantity - prev);
    }, 0);
    if (totalEligible === 0) return 0;
    return Math.max(0, origTotal - allPreviousRefundAmount);
  }, [searchedBill, allPreviousRefundAmount, previouslyReturnedMap]);

  // Handle return quantity change
  const handleQuantityChange = (key: string, maxEligible: number, val: number) => {
    const clamped = Math.max(0, Math.min(maxEligible, val));
    setReturnQuantities(prev => ({
      ...prev,
      [key]: clamped
    }));
  };

  // Return all items for a line
  const handleReturnAll = (key: string, maxEligible: number) => {
    setReturnQuantities(prev => ({
      ...prev,
      [key]: maxEligible
    }));
  };

  // Reset return for a line
  const handleResetLine = (key: string) => {
    setReturnQuantities(prev => ({
      ...prev,
      [key]: 0
    }));
  };

  // Calculate live return calculations
  const returnCalculations = useMemo(() => {
    if (!searchedBill) {
      return {
        itemsToReturn: [],
        totalReturnQty: 0,
        totalRefundAmount: 0,
        originalTotalAmount: 0,
        currentBillAmountBeforeReturn: 0,
        modifiedTotalAmount: 0,
        allPreviousRefundAmount: 0,
        cumulativeRefundAmount: 0,
      };
    }

    let totalReturnQty = 0;
    let totalEligibleAcrossBill = 0;
    let totalRefundAmount = 0;

    const itemsToReturn: (AppPharmacyReturnItem & { maxEligible: number; previouslyReturned: number })[] = [];

    searchedBill.items.forEach(origItem => {
      const key = `${origItem.medicineId}_${origItem.batchNumber}`;
      const previouslyReturned = previouslyReturnedMap[key] || 0;
      const maxEligible = Math.max(0, origItem.quantity - previouslyReturned);
      const currentReturnQty = returnQuantities[key] || 0;
      const finalQuantity = Math.max(0, maxEligible - currentReturnQty);

      totalEligibleAcrossBill += maxEligible;

      // Calculate paid unit price including GST and deducting discount
      const lineTotalPaid = origItem.totalPrice ?? (origItem.quantity * origItem.unitPrice * (1 - (origItem.discount || 0) / 100) * (1 + (origItem.tax || 0) / 100));
      const unitPaidPrice = origItem.quantity > 0 ? (lineTotalPaid / origItem.quantity) : origItem.unitPrice;
      const lineRemainingAmount = maxEligible > 0 ? (lineTotalPaid * (maxEligible / origItem.quantity)) : 0;
      const refundAmount = currentReturnQty === maxEligible ? lineRemainingAmount : Number((currentReturnQty * unitPaidPrice).toFixed(2));
      const finalAmount = Math.max(0, lineRemainingAmount - refundAmount);

      const unitPrice = origItem.unitPrice;
      const originalAmount = origItem.grossAmount || (origItem.quantity * unitPrice);

      if (currentReturnQty > 0) {
        totalReturnQty += currentReturnQty;
        totalRefundAmount += refundAmount;
      }

      itemsToReturn.push({
        medicineId: origItem.medicineId,
        medicineName: origItem.medicineName,
        batchNumber: origItem.batchNumber,
        expiryDate: origItem.expiryDate,
        originalQuantity: origItem.quantity,
        previouslyReturned,
        maxEligible,
        returnQuantity: currentReturnQty,
        finalQuantity,
        unitPrice,
        originalAmount,
        refundAmount,
        finalAmount,
        tax: origItem.tax,
        discount: origItem.discount,
      });
    });

    const originalTotalAmount = searchedBill.totalAmount || 0;
    const currentBillAmountBeforeReturn = totalEligibleAcrossBill === 0
      ? 0
      : Math.max(0, originalTotalAmount - allPreviousRefundAmount);

    const isAllRemainingBeingReturned = totalReturnQty > 0 && totalReturnQty >= totalEligibleAcrossBill;
    if (isAllRemainingBeingReturned) {
      totalRefundAmount = currentBillAmountBeforeReturn;
    }

    const modifiedTotalAmount = (totalEligibleAcrossBill === 0 || isAllRemainingBeingReturned)
      ? 0
      : Math.max(0, currentBillAmountBeforeReturn - totalRefundAmount);

    const cumulativeRefundAmount = (totalEligibleAcrossBill === 0 || isAllRemainingBeingReturned)
      ? originalTotalAmount
      : (allPreviousRefundAmount + totalRefundAmount);

    return {
      itemsToReturn,
      totalReturnQty,
      totalRefundAmount,
      originalTotalAmount,
      currentBillAmountBeforeReturn,
      modifiedTotalAmount,
      allPreviousRefundAmount,
      cumulativeRefundAmount,
    };
  }, [searchedBill, returnQuantities, previouslyReturnedMap, allPreviousRefundAmount]);

  // Process return action
  const handleProcessReturn = () => {
    if (!searchedBill) return;

    const returnableItems = returnCalculations.itemsToReturn.filter(i => i.returnQuantity > 0);
    if (returnableItems.length === 0) {
      alert("Please specify a return quantity greater than 0 for at least one medicine.");
      return;
    }

    // Execute return in PharmacyDatabase
    const result = PharmacyDatabase.processMedicineReturn(
      searchedBill,
      returnableItems,
      returnReason,
      returnNotes
    );

    setProcessedReturn(result.returnRecord);
    setProcessedModifiedBill(result.modifiedBill);
    setProcessSuccess(
      `Return ${result.returnRecord.returnNumber} processed successfully! Refund of ₹${result.returnRecord.refundAmount?.toFixed(2)} issued. Modified Bill ${result.modifiedBill.billNumber} updated to ₹${result.modifiedBill.totalAmount?.toFixed(2)}.`
    );
    setRecentReturns(PharmacyDatabase.getReturns());
    refresh();

    // Reset return quantities to 0 for remaining items so user can immediately see updated state
    const resetQty: Record<string, number> = {};
    searchedBill.items.forEach(it => {
      resetQty[`${it.medicineId}_${it.batchNumber}`] = 0;
    });
    setReturnQuantities(resetQty);
  };

  // Re-print any past return bill
  const handlePrintPastReturn = (ret: AppPharmacyReturn, view: "bill" | "return_voucher" = "bill") => {
    const allBills = PharmacyDatabase.getBills();
    let modBill = allBills.find(b => b.billNumber === ret.modifiedBillNumber);
    if (!modBill) {
      modBill = {
        id: ret.id,
        isModifiedReturnBill: true,
        billNumber: ret.modifiedBillNumber || ("MOD-" + ret.originalBillNumber),
        patientId: ret.patientId || "",
        patientName: ret.patientName || "Patient",
        uhid: ret.patientUhid,
        doctorName: ret.doctorName || "Doctor",
        department: ret.department || "General",
        billType: "Cash",
        paymentStatus: "Paid",
        items: ret.items ? ret.items.map(i => ({
          medicineId: i.medicineId,
          medicineName: i.medicineName,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate || "2027-12",
          quantity: i.finalQuantity,
          unitPrice: i.unitPrice,
          grossAmount: i.finalAmount,
          discount: 0,
          taxableAmount: i.finalAmount,
          cgstAmount: 0,
          sgstAmount: 0,
          tax: 0,
          totalPrice: i.finalAmount
        })) : [],
        subTotal: ret.modifiedTotalAmount || 0,
        discount: 0,
        tax: 0,
        taxableTotal: ret.modifiedTotalAmount || 0,
        cgstTotal: 0,
        sgstTotal: 0,
        totalAmount: ret.modifiedTotalAmount || 0,
        createdBy: "Pharmacist",
        createdAt: ret.createdAt
      };
    } else {
      modBill = {
        ...modBill,
        isModifiedReturnBill: true,
      };
    }
    setPrintReturnModal({ bill: modBill, returnRecord: ret, initialView: view } as any);
  };

  // Delete return from history
  const handleDeleteReturn = (ret: AppPharmacyReturn) => {
    if (window.confirm(`Are you sure you want to remove return ${ret.returnNumber} (${ret.patientName || "Return"}) from history?`)) {
      PharmacyDatabase.deleteReturn(ret.id);
      setRecentReturns(PharmacyDatabase.getReturns());
      refresh();
    }
  };

  // Export data based on current tab
  const handleExport = () => {
    let csvData = "";
    if (view === "sales") {
      csvData = "Bill Number,Date,Patient,Doctor,Items,Payment Mode,Total Amount,Status\n";
      filtered.forEach(inv => {
        csvData += `${inv.billNumber},${new Date(inv.createdAt || Date.now()).toLocaleDateString()},${inv.patientName},${inv.doctorName},${inv.items?.length || 0},${inv.paymentMode || "Cash"},${inv.totalAmount || 0},Completed\n`;
      });
    } else {
      csvData = "Return Number,Original Bill,Date,Patient,Doctor,Refund Amount,Status\n";
      recentReturns.forEach(ret => {
        csvData += `${ret.returnNumber},${ret.originalBillNumber},${new Date(ret.createdAt || Date.now()).toLocaleDateString()},${ret.patientName || ""},${ret.doctorName || ""},${ret.refundAmount || 0},${ret.status || "Completed"}\n`;
      });
    }

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmacy_${view}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 font-sans text-[#0F1624]">
      {printInv && <InvoicePrintModal bill={printInv} onClose={() => setPrintInv(null)} autoPrint={true} />}
      {printReturnModal && (
        <InvoicePrintModal 
          bill={printReturnModal.bill} 
          returnRecord={printReturnModal.returnRecord} 
          initialView={(printReturnModal as any).initialView}
          onClose={() => setPrintReturnModal(null)} 
          autoPrint={true}
        />
      )}

      <PageHeader
        breadcrumbs={[{ label: "Pharmacy" }, { label: "Sales" }, { label: "Sales & Returns" }]}
        title="Sales & Medicine Returns"
        description="Search billed invoices, process item-level returns, recalculate bills, and generate modified credit invoices"
        actions={
          <button 
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded border border-[#E2E8F0] bg-white text-[13px] font-semibold text-[#334155] hover:bg-[#F8FAFC] shadow-sm transition-colors"
           >
            <Download size={14} className="text-[#64748B]" /> Export CSV
          </button>
        }
        onNavigate={onNavigate}
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { 
              label: dateFilter ? `Sale Invoices (${dateFilter})` : "Total Sale Invoices", 
              value: totalSaleBills.toString(), 
              subtext: `₹${grossRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })} Total Billed`,
              color: "#0F766E", bg: "bg-teal-50", border: "border-teal-200" 
            },
            { 
              label: dateFilter ? `Refunds Issued (${dateFilter})` : "Total Refunds Issued", 
              value: "₹" + totalRefunds.toLocaleString("en-IN", { minimumFractionDigits: 2 }), 
              subtext: `${scopedReturns.length} return voucher${scopedReturns.length === 1 ? "" : "s"} processed`,
              color: "#DC2626", bg: "bg-red-50", border: "border-red-200" 
            },
            { 
              label: "Returned Items Restocked", 
              value: `${totalRestockedUnits} Units`, 
              subtext: "Restocked into inventory ledger",
              color: "#16A34A", bg: "bg-emerald-50", border: "border-emerald-200" 
            },
            { 
              label: "Active Modified Bills", 
              value: modifiedBillsCount.toString(), 
              subtext: "Revised post-return invoices",
              color: "#7C3AED", bg: "bg-purple-50", border: "border-purple-200" 
            },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 border border-[#E2E8F0] shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">{s.label}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${s.bg} border ${s.border}`} />
              </div>
              <p className="text-[20px] font-bold mt-2 font-mono tracking-tight" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[11px] text-[#94A3B8] mt-1 truncate">{s.subtext}</p>
            </div>
          ))}
        </div>

      {/* Tab switch & Search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex bg-[#E2E8F0]/60 p-1 rounded-xl border border-[#CBD5E1]/60">
          {(["sales", "returns"] as const).map(v => (
            <button 
              key={v} 
              onClick={() => setView(v)} 
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-all flex items-center gap-2 ${
                view === v 
                  ? "bg-white text-[#0F1624] shadow-sm" 
                  : "text-[#64748B] hover:text-[#0F1624]"
              }`}
            >
              {v === "sales" ? <FileText size={14} className={view === v ? "text-[#1B4FD8]" : ""} /> : <RotateCcw size={14} className={view === v ? "text-amber-600" : ""} />}
              {v === "sales" ? "Sales History" : "Medicine Returns"}
            </button>
          ))}
        </div>

        {view === "sales" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded px-3 py-1.5 shadow-sm">
              <Search size={14} className="text-[#94A3B8]" />
              <input 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder="Search bill, patient..." 
                className="text-[13px] outline-none text-[#0F1624] placeholder:text-[#94A3B8] w-52 bg-transparent" 
              />
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={dateFilter} 
                onChange={e => setDateFilter(e.target.value)}
                className="px-3 py-1.5 rounded border border-[#E2E8F0] text-[12px] bg-white shadow-sm focus:border-[#0F766E] focus:outline-none text-[#475569]" 
                title="Filter by Bill Date"
              />
              {dateFilter && (
                <button
                  onClick={() => setDateFilter("")}
                  className="px-2 py-1 text-[11px] font-medium text-[#64748B] hover:text-[#0F1624] bg-[#F1F5F9] rounded hover:bg-[#E2E8F0] transition-colors"
                >
                  All Dates
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {view === "sales" ? (
        /* SALES HISTORY TAB */
        <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-[#FAFCFF] border-b border-[#E2E8F0] flex items-center justify-between">
            <span className="text-[12px] font-bold text-[#475569] uppercase tracking-wider">
              Billed Sales Transactions ({filtered.length})
            </span>
            <span className="text-[11px] text-[#94A3B8]">Includes active & modified return bills</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                  <th className="px-4 py-3">Bill Number</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Doctor</th>
                  <th className="px-4 py-3 text-center">Items</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[13px]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-[#94A3B8] text-[13px]">
                    No sales invoices found.
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const isModifiedBill = inv.isModifiedReturnBill;
                  return (
                    <tr key={inv.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="p-3 font-mono text-[12px] font-semibold" style={{ color: isModifiedBill ? "#7c3aed" : "#1B4FD8" }}>
                        {inv.billNumber}
                        {isModifiedBill && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 font-bold rounded">MODIFIED</span>
                        )}
                      </td>
                      <td className="p-3 text-[12px] text-[#64748B] whitespace-nowrap">
                        {new Date(inv.createdAt || (inv as any).date || (inv as any).billDate || Date.now()).toLocaleString()}
                      </td>
                      <td className="p-3 font-medium text-[13px] text-[#0F1624]">
                        {inv.patientName}
                        <span className="block text-[11px] text-[#94A3B8] font-mono">{inv.uhid}</span>
                      </td>
                      <td className="p-3 text-[13px] text-[#334155]">{inv.doctorName}</td>
                      <td className="p-3 text-[13px] text-center">{inv.items ? inv.items.length : 0}</td>
                      <td className="p-3">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded" style={{ background: "#F0F2F5", color: "#475569" }}>
                          {inv.paymentMode || "Cash"}
                        </span>
                      </td>
                      <td className="p-3 text-[13px] font-semibold text-[#0F1624] text-right">
                        ₹{(inv.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        {isModifiedBill && (inv.totalAmount || 0) === 0 ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800">
                            FULLY RETURNED
                          </span>
                        ) : (
                          <StatusBadge status="completed" size="sm" />
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => setSelectedInv(inv)} 
                            title="View Invoice Details"
                            className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#64748B] transition-colors"
                          >
                            <Eye size={14} />
                          </button>
                          <button 
                            onClick={() => setPrintInv(inv)} 
                            title="Print Invoice"
                            className="p-1.5 rounded hover:bg-[#F0F2F5] text-[#64748B] transition-colors"
                          >
                            <Printer size={14} />
                          </button>
                          <button 
                            onClick={() => handleStartReturnFromSales(inv)} 
                            title="Process Return for this Bill"
                            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded transition-colors" 
                            style={{ background: "#faf5ff", color: "#7c3aed" }}
                          >
                            <RefreshCcw size={11} /> Return
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
        /* MEDICINE RETURNS WORKFLOW TAB */
        <div className="space-y-6">
          {/* Section 1: Search Original Bill */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-4 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-[16px] text-[#0F1624] flex items-center gap-2">
                  <RotateCcw size={16} className="text-amber-600" /> Process Medicine Return
                </h3>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Enter the original Bill Number below to retrieve billed medicines and process customer returns
                </p>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-[#64748B] flex-wrap">
                <span className="font-medium text-[11px] uppercase tracking-wider text-[#94A3B8]">Quick Select:</span>
                {originalBills.length > 0 ? (
                  originalBills.slice(0, 4).map((ob) => {
                    const billNum = ob.originalBillNumber || ob.billNumber;
                    const returns = PharmacyDatabase.getReturnsForBill(billNum);
                    const prevRefunds = returns.reduce((s, r) => s + (r.refundAmount || 0), 0);
                    const allItemsReturned = (ob.items || []).every(it => {
                      const k = `${it.medicineId}_${it.batchNumber}`;
                      const returnedCount = returns.reduce((sum, r) => {
                        const matchedItem = r.items?.find(ri => `${ri.medicineId}_${ri.batchNumber}` === k);
                        return sum + (matchedItem ? matchedItem.returnQuantity : 0);
                      }, 0);
                      return returnedCount >= (it.quantity || 0);
                    });
                    const activeAmount = allItemsReturned ? 0 : Math.max(0, (ob.totalAmount || 0) - prevRefunds);
                    const isMod = returns.length > 0;
                    return (
                      <button 
                        key={ob.billNumber}
                        onClick={() => { setSearchBillNo(billNum); handleSearchBill(billNum); }}
                        className={`px-2.5 py-1 font-mono text-[11px] font-bold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                          isMod 
                            ? "bg-purple-50 text-purple-700 border-purple-200/60 hover:bg-purple-100" 
                            : "bg-blue-50 text-blue-700 border-blue-200/60 hover:bg-blue-100"
                        }`}
                      >
                        <span>{billNum}</span>
                        <span className="text-[10px] text-gray-500 font-sans">({ob.patientName})</span>
                        <span className="font-sans font-bold text-teal-800">₹{activeAmount.toFixed(0)}</span>
                        {isMod && <span className="text-[9px] px-1 py-0.2 bg-purple-200 text-purple-800 rounded font-sans">MOD</span>}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-[12px] text-[#94A3B8] italic">No active bills found</span>
                )}
              </div>
            </div>

            <div className="max-w-2xl">
              <label className="block text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
                Search Bill (Bill Number, Last 5 Digits, Patient Name, or UHID) *
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    value={searchBillNo}
                    onChange={e => setSearchBillNo(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSearchBill(); }}
                    placeholder="Enter bill no (e.g. 00042 or full no), patient name, or UHID..."
                    className="w-full pl-9 pr-3 py-2.5 rounded border border-[#E2E8F0] bg-[#F8FAFC] focus:bg-white text-[13px] font-mono font-medium focus:border-[#0F766E] focus:outline-none transition-all shadow-inner" 
                  />
                  <Search size={15} className="absolute left-3 top-3.5 text-[#94A3B8]" />
                </div>
                <button 
                  onClick={() => handleSearchBill()}
                  className="px-5 py-2.5 rounded text-white text-[13px] font-semibold flex items-center gap-2 shadow-sm transition-all hover:bg-teal-700 shrink-0 cursor-pointer" 
                  style={{ background: "#0F766E" }}
                >
                  <Search size={14} /> Search Bill
                </button>
              </div>

              {/* Multiple Matching Candidate Bills */}
              {matchingCandidateBills.length > 1 && (
                <div className="mt-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-blue-900">
                      Found {matchingCandidateBills.length} matching bills. Click to select for return:
                    </span>
                    <button 
                      onClick={() => setMatchingCandidateBills([])}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {matchingCandidateBills.map((cand) => (
                      <div 
                        key={cand.masterNumber}
                        onClick={() => selectBillForReturn(cand)}
                        className="p-3 bg-white border border-blue-200 hover:border-blue-500 rounded-lg shadow-2xs hover:shadow-sm cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[13px] text-blue-700 group-hover:text-blue-900">{cand.masterNumber}</span>
                            {cand.latest.isModifiedReturnBill && (
                              <span className="px-1.5 py-0.5 text-[9px] bg-purple-100 text-purple-700 font-bold rounded">MODIFIED</span>
                            )}
                          </div>
                          <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{cand.original.patientName} <span className="text-gray-400 font-mono text-[11px]">({cand.original.uhid})</span></p>
                          <p className="text-[11px] text-gray-500">Dr. {cand.original.doctorName}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="block font-bold text-[14px] text-teal-800">₹{cand.activeTotal.toFixed(2)}</span>
                          {cand.prevRefunds > 0 && (
                            <span className="block text-[10px] text-amber-700 font-medium">Refunded: ₹{cand.prevRefunds.toFixed(0)}</span>
                          )}
                          <span className="text-[11px] text-blue-600 font-bold flex items-center justify-end gap-1 mt-1 group-hover:underline">
                            Select →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {searchError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2.5 text-red-700 text-[13px]">
                <AlertCircle size={16} className="shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {processSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 text-emerald-900 text-[13px] shadow-sm">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-[14px] text-emerald-900">{processSuccess}</p>
                    {processedReturn && (
                      <p className="text-[12px] text-emerald-700 mt-1">
                        Return ID: <span className="font-mono font-bold">{processedReturn.returnNumber}</span> · 
                        Total Refund: <span className="font-bold">₹{processedReturn.refundAmount?.toFixed(2)}</span> · 
                        Modified Bill: <span className="font-mono font-bold">{processedReturn.modifiedBillNumber}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={handleResetToReturns}
                    className="px-3.5 py-1.5 bg-white border border-[#E2E8F0] hover:bg-gray-50 text-gray-700 font-semibold text-[12px] rounded-lg flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    ← Back to Returns
                  </button>
                  {processedReturn && processedModifiedBill && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setPrintReturnModal({ bill: processedModifiedBill, returnRecord: processedReturn, initialView: "bill" } as any)}
                        className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-[12px] rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        title="Print updated invoice with remaining active medicines"
                      >
                        <Printer size={13} /> Print Modified Bill
                      </button>
                      <button 
                        onClick={() => setPrintReturnModal({ bill: processedModifiedBill, returnRecord: processedReturn, initialView: "return_voucher" } as any)}
                        className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-semibold text-[12px] rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        title="Print credit note refund voucher for returned medicines"
                      >
                        <RotateCcw size={13} /> Print Return Voucher
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Loaded Bill Details & Return Quantities */}
          {searchedBill && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden space-y-6">
              {/* Bill Info Card */}
              <div className="p-6 bg-[#F8FAFC] border-b border-[#DDE2EC]">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                        {existingReturnsForSearchedBill.length > 0 ? "Active Modified Bill Details" : "Original Bill Details"}
                      </span>
                      {existingReturnsForSearchedBill.length > 0 && (
                        <span className="px-2 py-0.5 text-[10px] bg-purple-100 text-purple-700 font-bold rounded-full border border-purple-200">
                          MODIFIED · {existingReturnsForSearchedBill.length} PAST RETURN(S)
                        </span>
                      )}
                    </div>
                    <h4 className="text-[18px] font-bold text-[#0F1624] font-mono mt-0.5">{searchedBill.billNumber}</h4>
                    <p className="text-[12px] text-[#64748B]">
                      Billed on {new Date(searchedBill.createdAt).toLocaleString()} · Created by {searchedBill.createdBy || "Pharmacist"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-[13px]">
                    <div>
                      <span className="text-[11px] text-[#94A3B8] uppercase block">Patient Name</span>
                      <span className="font-semibold text-[#0F1624]">{searchedBill.patientName}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#94A3B8] uppercase block">UHID / UMR</span>
                      <span className="font-mono font-semibold text-[#0F1624]">{searchedBill.uhid}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#94A3B8] uppercase block">Doctor</span>
                      <span className="font-semibold text-[#0F1624]">{searchedBill.doctorName}</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-[#94A3B8] uppercase block">
                        {existingReturnsForSearchedBill.length > 0 ? "Current Bill Total" : "Original Total"}
                      </span>
                      <span className="font-bold text-[17px] text-teal-700">
                        ₹{currentActiveBillTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                      {existingReturnsForSearchedBill.length > 0 && (
                        <span className="block text-[10px] text-gray-500 font-mono">
                          Orig: ₹{(searchedBill.totalAmount || 0).toFixed(2)} · Ret: -₹{allPreviousRefundAmount.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {existingReturnsForSearchedBill.length > 0 && (
                  <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-[12px] text-purple-900 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={15} className="text-purple-600 shrink-0" />
                      <span>
                        <strong>Subsequent Return:</strong> This bill already has <strong>{existingReturnsForSearchedBill.length} return transaction(s)</strong> totaling <strong>₹{allPreviousRefundAmount.toFixed(2)}</strong> refunded. The current bill amount is <strong>₹{currentActiveBillTotal.toFixed(2)}</strong>.
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded border border-purple-200">
                      Remaining medicines eligible below
                    </span>
                  </div>
                )}
              </div>

              {/* Medicine Return Table */}
              <div className="px-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-[14px] text-[#0F1624]">Billed Medicines & Return Selection</h4>
                  <span className="text-[12px] text-[#64748B]">
                    Adjust the <span className="font-semibold text-amber-700">Return Qty</span> for medicines being returned
                  </span>
                </div>

                <div className="border border-[#DDE2EC] rounded overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F8FAFC] border-b border-[#DDE2EC]">
                      <tr>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase">Medicine</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase">Batch / Exp</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase text-center">Orig Qty</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase text-center text-gray-500">Prev Ret</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase text-center text-blue-700">Eligible</th>
                        <th className="p-3 text-[11px] font-bold text-amber-700 uppercase text-center w-36">Return Qty</th>
                        <th className="p-3 text-[11px] font-bold text-indigo-700 uppercase text-center">Final Qty</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase text-right">Unit Price</th>
                        <th className="p-3 text-[11px] font-bold text-amber-700 uppercase text-right">Refund (₹)</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase text-right">Final Amt (₹)</th>
                        <th className="p-3 text-[11px] font-bold text-[#475569] uppercase text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {returnCalculations.itemsToReturn.map((item, idx) => {
                        const key = `${item.medicineId}_${item.batchNumber}`;
                        const isFullyReturned = item.maxEligible <= 0;
                        const isReturning = item.returnQuantity > 0;

                        return (
                          <tr key={idx} className={`hover:bg-[#F8FAFC] ${isReturning ? "bg-amber-50/40" : ""}`}>
                            <td className="p-3 text-[13px] font-medium text-[#0F1624]">
                              {item.medicineName}
                            </td>
                            <td className="p-3 text-[12px] font-mono text-[#64748B]">
                              {item.batchNumber}
                              <span className="block text-[10px] text-[#94A3B8]">Exp: {item.expiryDate || "2027-12"}</span>
                            </td>
                            <td className="p-3 text-[13px] text-center font-semibold">{item.originalQuantity}</td>
                            <td className="p-3 text-[13px] text-center text-gray-500 font-semibold">{item.previouslyReturned}</td>
                            <td className="p-3 text-[13px] text-center font-bold text-blue-700">{item.maxEligible}</td>
                            <td className="p-3 text-center">
                              {isFullyReturned ? (
                                <span className="text-[11px] font-semibold text-gray-400 uppercase">Fully Returned</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleQuantityChange(key, item.maxEligible, item.returnQuantity - 1)}
                                    disabled={item.returnQuantity <= 0}
                                    className="w-7 h-7 flex items-center justify-center rounded border border-[#DDE2EC] bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                  >
                                    -
                                  </button>
                                  <input 
                                    type="number"
                                    min={0}
                                    max={item.maxEligible}
                                    value={item.returnQuantity}
                                    onChange={e => handleQuantityChange(key, item.maxEligible, parseInt(e.target.value) || 0)}
                                    className="w-14 text-center py-1 border border-[#DDE2EC] rounded font-bold text-[13px] text-amber-700 focus:outline-none focus:border-amber-500"
                                  />
                                  <button 
                                    onClick={() => handleQuantityChange(key, item.maxEligible, item.returnQuantity + 1)}
                                    disabled={item.returnQuantity >= item.maxEligible}
                                    className="w-7 h-7 flex items-center justify-center rounded border border-[#DDE2EC] bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-[13px] text-center font-bold text-indigo-700">
                              {item.finalQuantity}
                            </td>
                            <td className="p-3 text-[13px] text-right font-mono">₹{item.unitPrice.toFixed(2)}</td>
                            <td className="p-3 text-[13px] text-right font-bold text-amber-700 font-mono">
                              ₹{item.refundAmount.toFixed(2)}
                            </td>
                            <td className="p-3 text-[13px] text-right font-bold text-[#0F1624] font-mono">
                              ₹{item.finalAmount.toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              {!isFullyReturned && (
                                <div className="flex items-center justify-center gap-1">
                                  <button 
                                    onClick={() => handleReturnAll(key, item.maxEligible)}
                                    className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition-colors"
                                  >
                                    Return All
                                  </button>
                                  {item.returnQuantity > 0 && (
                                    <button 
                                      onClick={() => handleResetLine(key)}
                                      className="px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 hover:text-gray-800 transition-colors"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recalculation Summary & Actions */}
              <div className="p-6 bg-[#F8FAFC] border-t border-[#DDE2EC]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
                        Return Reason *
                      </label>
                      <select 
                        value={returnReason}
                        onChange={e => setReturnReason(e.target.value)}
                        disabled={Boolean(processedReturn)}
                        className="w-full px-3 py-2.5 rounded border border-[#DDE2EC] text-[13px] bg-white focus:border-[#1B4FD8] focus:outline-none font-medium disabled:bg-gray-100 disabled:text-gray-500"
                      >
                        <option>Patient not using</option>
                        <option>Wrong medicine dispensed</option>
                        <option>Doctor changed prescription</option>
                        <option>Adverse drug reaction</option>
                        <option>Excess quantity purchased</option>
                        <option>Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-1.5">
                        Pharmacist Return Notes (Optional)
                      </label>
                      <textarea 
                        value={returnNotes}
                        onChange={e => setReturnNotes(e.target.value)}
                        disabled={Boolean(processedReturn)}
                        placeholder="Enter verification or inspection notes regarding returned medicines..."
                        rows={2}
                        className="w-full px-3 py-2 rounded border border-[#DDE2EC] text-[13px] bg-white focus:border-[#1B4FD8] focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                      />
                    </div>
                  </div>

                  {/* Financial Comparison */}
                  <div className="bg-white p-4 rounded-xl border border-[#DDE2EC] shadow-2xs space-y-2">
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-[#64748B]">Current Bill Amount:</span>
                      <span className="font-bold text-[#0F1624] font-mono text-[14px]">
                        ₹{returnCalculations.currentBillAmountBeforeReturn.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {returnCalculations.allPreviousRefundAmount > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-gray-500 border-t border-dashed border-[#F1F5F9] pt-1.5">
                        <span>(Original Bill: ₹{returnCalculations.originalTotalAmount.toFixed(2)} · Prior Returns: -₹{returnCalculations.allPreviousRefundAmount.toFixed(2)})</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[13px] text-amber-700 font-semibold border-t border-dashed border-[#E2E8F0] pt-2">
                      <span className="flex items-center gap-1">
                        <CornerDownRight size={13} /> Current Return Refund:
                      </span>
                      <span className="font-bold text-[15px] font-mono">
                        -₹{returnCalculations.totalRefundAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[14px] text-teal-900 font-bold border-t-2 border-teal-600 pt-2 bg-teal-50/50 p-2.5 rounded-lg">
                      <span>New Modified Bill Total:</span>
                      <span className="text-[17px] font-mono text-teal-800">
                        ₹{returnCalculations.modifiedTotalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {returnCalculations.cumulativeRefundAmount > 0 && (
                      <div className="text-right text-[11px] text-purple-700 font-semibold">
                        Total Cumulative Refund: ₹{returnCalculations.cumulativeRefundAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDE2EC] pt-4">
                  <button 
                    onClick={handleResetToReturns}
                    className="px-4 py-2 border border-[#DDE2EC] rounded text-[13px] font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    ← Back to Returns
                  </button>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleProcessReturn}
                      disabled={returnCalculations.totalRefundAmount <= 0 || Boolean(processedReturn)}
                      className="px-6 py-2.5 rounded text-white text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: processedReturn ? "#059669" : "#7c3aed" }}
                    >
                      {processedReturn ? (
                        <>
                          <CheckCircle2 size={15} /> Return Processed ({processedReturn.returnNumber})
                        </>
                      ) : (
                        <>
                          <RotateCcw size={15} /> Generate Modified Bill & Process Return
                        </>
                      )}
                    </button>

                    {processedModifiedBill && processedReturn && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setPrintReturnModal({ bill: processedModifiedBill, returnRecord: processedReturn, initialView: "bill" } as any)}
                          className="px-4 py-2.5 rounded text-white text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors hover:bg-emerald-800 cursor-pointer"
                          style={{ background: "#059669" }}
                        >
                          <Printer size={15} /> Print Modified Bill
                        </button>
                        <button 
                          onClick={() => setPrintReturnModal({ bill: processedModifiedBill, returnRecord: processedReturn, initialView: "return_voucher" } as any)}
                          className="px-4 py-2.5 rounded text-white text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors hover:bg-purple-800 cursor-pointer"
                          style={{ background: "#7c3aed" }}
                        >
                          <RotateCcw size={15} /> Print Return Voucher
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Recent Returns Audit History */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm overflow-hidden space-y-0">
            <div className="px-6 py-4 bg-[#FAFCFF] border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h4 className="font-bold text-[15px] text-[#0F1624]">Recent Returns History</h4>
                <p className="text-[12px] text-[#64748B] mt-0.5">Audit trail of all processed medicine returns and credit notes</p>
              </div>
              <span className="text-[12px] font-bold text-purple-700 bg-purple-50 border border-purple-200/60 px-3 py-1 rounded-full">
                Total Returns: {recentReturns.length}
              </span>
            </div>

            {recentReturns.length === 0 ? (
              <div className="p-12 text-center text-[#94A3B8] text-[13px]">
                No return transactions have been processed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    <tr className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                      <th className="px-4 py-3">Return ID</th>
                      <th className="px-4 py-3">Original Bill</th>
                      <th className="px-4 py-3">Modified Bill</th>
                      <th className="px-4 py-3">Patient</th>
                      <th className="px-4 py-3 text-center">Items</th>
                      <th className="px-4 py-3 text-amber-700 text-right">Refund Amount</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-[13px]">
                    {recentReturns.map(ret => (
                      <tr key={ret.id} className="hover:bg-[#F8FAFC]">
                        <td className="p-3 font-mono text-[12px] font-bold text-amber-700">{ret.returnNumber}</td>
                        <td className="p-3 font-mono text-[12px] font-semibold text-blue-700">{ret.originalBillNumber || ret.originalBillId}</td>
                        <td className="p-3 font-mono text-[12px] font-semibold text-purple-700">{ret.modifiedBillNumber || "-"}</td>
                        <td className="p-3 text-[13px] font-medium text-[#0F1624]">
                          {ret.patientName || "Walk-in Patient"}
                          <span className="block text-[11px] text-[#94A3B8] font-mono">{ret.patientUhid}</span>
                        </td>
                        <td className="p-3 text-[13px] text-center font-bold">
                          {ret.items?.length || ret.returnQuantity || 1}
                        </td>
                        <td className="p-3 text-[13px] text-right font-bold text-amber-700 font-mono">
                          ₹{(ret.refundAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-[12px] text-[#475569]">{ret.returnReason}</td>
                        <td className="p-3 text-[12px] text-[#64748B] whitespace-nowrap">
                          {new Date(ret.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => handlePrintPastReturn(ret, "bill")}
                              title="Print Modified Bill"
                              className="px-2 py-1 text-[11px] font-bold bg-teal-50 border border-teal-200 text-teal-800 rounded hover:bg-teal-100 flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Printer size={12} /> Modified Bill
                            </button>
                            <button 
                              onClick={() => handlePrintPastReturn(ret, "return_voucher")}
                              title="Print Return Refund Voucher"
                              className="px-2 py-1 text-[11px] font-bold bg-purple-50 border border-purple-200 text-purple-800 rounded hover:bg-purple-100 flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <RotateCcw size={12} /> Voucher
                            </button>
                            <button 
                              onClick={() => handleDeleteReturn(ret)}
                              title="Remove from Returns History"
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoice Detail Modal for Sales History */}
      {selectedInv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,23,42,0.6)" }} onClick={() => setSelectedInv(null)}>
          <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0F2F5] bg-[#FAFCFF]">
              <div>
                <p className="font-bold text-[16px] text-[#0F1624] font-mono">{selectedInv.billNumber}</p>
                <p className="text-[12px] text-[#64748B]">{new Date(selectedInv.createdAt || selectedInv.date).toLocaleString()} · {selectedInv.patientName}</p>
              </div>
              <button onClick={() => setSelectedInv(null)} className="p-2 rounded-lg hover:bg-[#F0F2F5] text-[#94A3B8] transition-colors"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 border-b border-[#F0F2F5] grid grid-cols-2 gap-3 text-[13px]">
                <div><span className="text-[#94A3B8] text-[11px] uppercase block">Pharmacist</span><p className="font-semibold text-[#0F1624]">{selectedInv.createdBy || "Pharmacist"}</p></div>
                <div><span className="text-[#94A3B8] text-[11px] uppercase block">Payment</span><p className="font-semibold text-[#0F1624]">{selectedInv.paymentMode || "Cash"}</p></div>
                <div><span className="text-[#94A3B8] text-[11px] uppercase block">Items</span><p className="font-semibold text-[#0F1624]">{selectedInv.items?.length || 0}</p></div>
                <div><span className="text-[#94A3B8] text-[11px] uppercase block">Status</span><StatusBadge status="completed" size="sm" /></div>
              </div>
              <table className="w-full text-left">
                <thead className="bg-[#F8FAFC]">
                  <tr>
                    <th className="px-5 py-3 text-[11px] font-bold text-[#475569] uppercase tracking-wider">Medicine</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-[#475569] uppercase tracking-wider">Qty</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-[#475569] uppercase tracking-wider">MRP</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-[#475569] uppercase tracking-wider">Disc%</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-[#475569] uppercase tracking-wider text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {(selectedInv.items || []).map((item: any, i: number) => {
                    const qty = item.qty || item.quantity || 0;
                    const mrp = item.mrp || item.unitPrice || 0;
                    const discount = item.discount || 0;
                    const total = (qty * mrp) * (1 - discount/100);
                    return (
                    <tr key={i}>
                      <td className="px-5 py-3 text-[13px] font-medium text-[#0F1624]">{item.medicine || item.medicineName}</td>
                      <td className="px-5 py-3 text-[13px]">{qty}</td>
                      <td className="px-5 py-3 text-[13px] font-mono">₹{mrp.toFixed(2)}</td>
                      <td className="px-5 py-3 text-[13px] text-[#d97706] font-mono">{discount}%</td>
                      <td className="px-5 py-3 text-[13px] font-bold text-right font-mono">₹{total.toFixed(2)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-5 py-4 border-t border-[#F0F2F5] flex justify-end bg-[#FAFCFF]">
                <div className="text-right">
                  <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Grand Total</p>
                  <p className="text-[20px] font-bold text-[#0F1624] font-mono">₹{(selectedInv.totalAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[#E2E8F0] flex gap-3 bg-[#F8FAFC]">
              <button 
                onClick={() => { setPrintInv(selectedInv); setSelectedInv(null); }} 
                className="flex items-center gap-1.5 flex-1 py-2.5 rounded-lg border border-[#E2E8F0] bg-white text-[13px] font-semibold text-[#334155] hover:bg-[#F8FAFC] shadow-sm transition-colors justify-center"
              >
                <Printer size={14} className="text-[#64748B]" /> Print / Download
              </button>
              {!selectedInv.billNumber?.startsWith("MOD-") && (
                <button 
                  onClick={() => { 
                    setSelectedInv(null); 
                    handleStartReturnFromSales(selectedInv); 
                  }} 
                  className="flex-1 py-2.5 rounded-lg text-white font-semibold text-[13px] shadow-sm transition-all hover:bg-purple-700" 
                  style={{ background: "#7c3aed" }}
                >
                  Process Return
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
