/**
 * Laboratory Inventory & Consumables Database
 * 
 * Independent laboratory inventory management system:
 * - Reagents, Test Kits, Consumables, Controls, Calibrators, Specimen Containers, Laboratory Supplies
 * - Transaction logging for all stock operations: Received, Issued, Adjusted, Returned, Damaged, Expired
 * - Strictly separate from Pharmacy inventory.
 */

export type LabInventoryCategory =
  | "Reagent"
  | "Test Kit"
  | "Consumable"
  | "Control"
  | "Calibrator"
  | "Specimen Container"
  | "Laboratory Supply"

export type LabStockTransactionType =
  | "Received"
  | "Issued"
  | "Adjusted"
  | "Returned"
  | "Damaged"
  | "Expired"

export type LabInventoryStatus =
  | "In Stock"
  | "Low Stock"
  | "Expiring Soon"
  | "Expired"
  | "Out of Stock"

export interface LabInventoryItem {
  id: string
  name: string
  category: LabInventoryCategory
  itemCode: string
  batchNumber: string
  supplier: string
  quantity: number
  unit: string // e.g. "Vials", "Kits", "Boxes", "Tubes", "Bottles", "Packs", "Units"
  minimumStock: number
  expiryDate: string // YYYY-MM-DD
  storageLocation?: string // e.g. "Reagent Fridge 2-8°C", "Bench 1 Cold Rack", "Cabinet A", "Freezer -20°C"
  status: LabInventoryStatus
  lastUpdated: string
}

export interface LabStockTransaction {
  id: string
  date: string
  itemId: string
  itemName: string
  batchNumber: string
  type: LabStockTransactionType
  quantity: number
  previousQuantity: number
  newQuantity: number
  user: string
  remarks?: string
  departmentBench?: string
}

export interface LabSupplier {
  id: string
  name: string
  code: string
  contact: string
  email: string
  itemsSupplied?: string[]
  lastSupplyDate?: string
  status: "Active" | "Inactive"
}

const STORAGE_KEY_ITEMS = "hospai_lab_inventory_items_v1"
const STORAGE_KEY_TRANSACTIONS = "hospai_lab_inventory_tx_v1"
const STORAGE_KEY_SUPPLIERS = "hospai_lab_inventory_suppliers_v1"
const CHANNEL_NAME = "hospai_lab_inventory_channel"

const listeners = new Set<() => void>()
let channel: BroadcastChannel | null = null

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = () => listeners.forEach((fn) => fn())
  }
  return channel
}

function notify(): void {
  listeners.forEach((fn) => fn())
  ensureChannel()?.postMessage("change")
}

export function computeItemStatus(
  quantity: number,
  minimumStock: number,
  expiryDate: string,
  warningDays: number = 30
): LabInventoryStatus {
  if (quantity <= 0) return "Out of Stock"

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const exp = new Date(expiryDate)
  exp.setHours(0, 0, 0, 0)

  if (exp.getTime() < now.getTime()) {
    return "Expired"
  }

  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= warningDays) {
    return "Expiring Soon"
  }

  if (quantity <= minimumStock) {
    return "Low Stock"
  }

  return "In Stock"
}

function readItems(): LabInventoryItem[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_ITEMS)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LabInventoryItem[]
    // Recalculate status dynamically against current date
    return parsed.map((item) => ({
      ...item,
      status: computeItemStatus(item.quantity, item.minimumStock, item.expiryDate),
    }))
  } catch {
    return []
  }
}

function writeItems(items: LabInventoryItem[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items))
  } catch (err) {
    console.error("Lab inventory: failed to write items", err)
  }
}

function readTransactions(): LabStockTransaction[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TRANSACTIONS)
    return raw ? (JSON.parse(raw) as LabStockTransaction[]) : []
  } catch {
    return []
  }
}

function writeTransactions(txs: LabStockTransaction[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(txs))
  } catch (err) {
    console.error("Lab inventory: failed to write transactions", err)
  }
}

function readSuppliers(): LabSupplier[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SUPPLIERS)
    return raw ? (JSON.parse(raw) as LabSupplier[]) : []
  } catch {
    return []
  }
}

function writeSuppliers(suppliers: LabSupplier[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(suppliers))
  } catch (err) {
    console.error("Lab inventory: failed to write suppliers", err)
  }
}

export class LabInventoryDatabase {
  static subscribe(listener: () => void): () => void {
    listeners.add(listener)
    ensureChannel()
    return () => listeners.delete(listener)
  }

  static getItems(): LabInventoryItem[] {
    return readItems()
  }

  static getItem(id: string): LabInventoryItem | undefined {
    return readItems().find((i) => i.id === id)
  }

  static getTransactions(): LabStockTransaction[] {
    return readTransactions().sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }

  static getSuppliers(): LabSupplier[] {
    return readSuppliers()
  }

  /**
   * Add a new stock item (Received into laboratory inventory)
   */
  static addItem(
    input: {
      name: string
      category: LabInventoryCategory
      itemCode: string
      batchNumber: string
      supplier: string
      quantity: number
      unit: string
      minimumStock: number
      expiryDate: string
      storageLocation?: string
    },
    user: string = "Laboratory Staff",
    remarks: string = "Initial receipt of stock"
  ): LabInventoryItem {
    const items = readItems()
    const now = new Date().toISOString()
    const id = `LAB-INV-${String(items.length + 1).padStart(4, "0")}`
    const status = computeItemStatus(input.quantity, input.minimumStock, input.expiryDate)

    const newItem: LabInventoryItem = {
      id,
      name: input.name.trim(),
      category: input.category,
      itemCode: input.itemCode.trim().toUpperCase(),
      batchNumber: input.batchNumber.trim().toUpperCase(),
      supplier: input.supplier.trim(),
      quantity: Math.max(0, input.quantity),
      unit: input.unit || "Units",
      minimumStock: Math.max(0, input.minimumStock),
      expiryDate: input.expiryDate,
      storageLocation: input.storageLocation?.trim(),
      status,
      lastUpdated: now,
    }

    const updatedItems = [newItem, ...items]
    writeItems(updatedItems)

    // Log transaction
    const txs = readTransactions()
    const newTx: LabStockTransaction = {
      id: `TX-LAB-${Date.now().toString().slice(-6)}`,
      date: now,
      itemId: id,
      itemName: newItem.name,
      batchNumber: newItem.batchNumber,
      type: "Received",
      quantity: newItem.quantity,
      previousQuantity: 0,
      newQuantity: newItem.quantity,
      user,
      remarks,
    }
    writeTransactions([newTx, ...txs])

    // Update or add supplier if known
    if (newItem.supplier) {
      const suppliers = readSuppliers()
      const existingSup = suppliers.find(
        (s) => s.name.toLowerCase() === newItem.supplier.toLowerCase()
      )
      if (existingSup) {
        existingSup.lastSupplyDate = now.split("T")[0]
        if (!existingSup.itemsSupplied?.includes(newItem.name)) {
          existingSup.itemsSupplied = [...(existingSup.itemsSupplied || []), newItem.name]
        }
        writeSuppliers(suppliers)
      } else {
        const newSup: LabSupplier = {
          id: `SUP-LAB-${String(suppliers.length + 1).padStart(3, "0")}`,
          name: newItem.supplier,
          code: `SUP-${newItem.supplier.substring(0, 3).toUpperCase()}`,
          contact: "+91 Diagnostic Logistics",
          email: "supplies@diagnostic-vendor.com",
          itemsSupplied: [newItem.name],
          lastSupplyDate: now.split("T")[0],
          status: "Active",
        }
        writeSuppliers([newSup, ...suppliers])
      }
    }

    notify()
    return newItem
  }

  /**
   * Issue stock to a laboratory bench or department
   */
  static issueStock(
    itemId: string,
    issueQuantity: number,
    user: string = "Laboratory Staff",
    departmentBench: string = "General Processing",
    remarks?: string
  ): LabInventoryItem | undefined {
    const items = readItems()
    const item = items.find((i) => i.id === itemId)
    if (!item) return undefined
    if (issueQuantity <= 0) return item

    const now = new Date().toISOString()
    const prevQty = item.quantity
    const newQty = Math.max(0, prevQty - issueQuantity)
    item.quantity = newQty
    item.status = computeItemStatus(newQty, item.minimumStock, item.expiryDate)
    item.lastUpdated = now

    writeItems(items)

    const txs = readTransactions()
    const newTx: LabStockTransaction = {
      id: `TX-LAB-${Date.now().toString().slice(-6)}`,
      date: now,
      itemId: item.id,
      itemName: item.name,
      batchNumber: item.batchNumber,
      type: "Issued",
      quantity: Math.min(issueQuantity, prevQty),
      previousQuantity: prevQty,
      newQuantity: newQty,
      user,
      remarks: remarks || `Issued to ${departmentBench}`,
      departmentBench,
    }
    writeTransactions([newTx, ...txs])

    notify()
    return item
  }

  /**
   * Stock adjustment (e.g. physical count reconciliation)
   */
  static adjustStock(
    itemId: string,
    newQuantity: number,
    user: string = "Laboratory Staff",
    reason: string = "Physical inventory audit count"
  ): LabInventoryItem | undefined {
    const items = readItems()
    const item = items.find((i) => i.id === itemId)
    if (!item) return undefined

    const now = new Date().toISOString()
    const prevQty = item.quantity
    const qty = Math.max(0, newQuantity)
    item.quantity = qty
    item.status = computeItemStatus(qty, item.minimumStock, item.expiryDate)
    item.lastUpdated = now

    writeItems(items)

    const txs = readTransactions()
    const newTx: LabStockTransaction = {
      id: `TX-LAB-${Date.now().toString().slice(-6)}`,
      date: now,
      itemId: item.id,
      itemName: item.name,
      batchNumber: item.batchNumber,
      type: "Adjusted",
      quantity: Math.abs(qty - prevQty),
      previousQuantity: prevQty,
      newQuantity: qty,
      user,
      remarks: reason,
    }
    writeTransactions([newTx, ...txs])

    notify()
    return item
  }

  /**
   * Return stock to supplier
   */
  static returnStock(
    itemId: string,
    returnQuantity: number,
    user: string = "Laboratory Staff",
    supplier: string,
    remarks: string = "Returned to vendor"
  ): LabInventoryItem | undefined {
    const items = readItems()
    const item = items.find((i) => i.id === itemId)
    if (!item) return undefined
    if (returnQuantity <= 0) return item

    const now = new Date().toISOString()
    const prevQty = item.quantity
    const newQty = Math.max(0, prevQty - returnQuantity)
    item.quantity = newQty
    item.status = computeItemStatus(newQty, item.minimumStock, item.expiryDate)
    item.lastUpdated = now

    writeItems(items)

    const txs = readTransactions()
    const newTx: LabStockTransaction = {
      id: `TX-LAB-${Date.now().toString().slice(-6)}`,
      date: now,
      itemId: item.id,
      itemName: item.name,
      batchNumber: item.batchNumber,
      type: "Returned",
      quantity: Math.min(returnQuantity, prevQty),
      previousQuantity: prevQty,
      newQuantity: newQty,
      user,
      remarks: `${remarks} (${supplier || item.supplier})`,
    }
    writeTransactions([newTx, ...txs])

    notify()
    return item
  }

  /**
   * Mark damaged stock
   */
  static markDamaged(
    itemId: string,
    damagedQuantity: number,
    user: string = "Laboratory Staff",
    remarks: string = "Damaged / contaminated / broken container"
  ): LabInventoryItem | undefined {
    const items = readItems()
    const item = items.find((i) => i.id === itemId)
    if (!item) return undefined
    if (damagedQuantity <= 0) return item

    const now = new Date().toISOString()
    const prevQty = item.quantity
    const newQty = Math.max(0, prevQty - damagedQuantity)
    item.quantity = newQty
    item.status = computeItemStatus(newQty, item.minimumStock, item.expiryDate)
    item.lastUpdated = now

    writeItems(items)

    const txs = readTransactions()
    const newTx: LabStockTransaction = {
      id: `TX-LAB-${Date.now().toString().slice(-6)}`,
      date: now,
      itemId: item.id,
      itemName: item.name,
      batchNumber: item.batchNumber,
      type: "Damaged",
      quantity: Math.min(damagedQuantity, prevQty),
      previousQuantity: prevQty,
      newQuantity: newQty,
      user,
      remarks,
    }
    writeTransactions([newTx, ...txs])

    notify()
    return item
  }

  /**
   * Mark expired stock
   */
  static markExpired(
    itemId: string,
    user: string = "Laboratory Staff",
    remarks: string = "Passed manufacturer expiration date"
  ): LabInventoryItem | undefined {
    const items = readItems()
    const item = items.find((i) => i.id === itemId)
    if (!item) return undefined

    const now = new Date().toISOString()
    const prevQty = item.quantity
    item.quantity = 0
    item.status = "Expired"
    item.lastUpdated = now

    writeItems(items)

    const txs = readTransactions()
    const newTx: LabStockTransaction = {
      id: `TX-LAB-${Date.now().toString().slice(-6)}`,
      date: now,
      itemId: item.id,
      itemName: item.name,
      batchNumber: item.batchNumber,
      type: "Expired",
      quantity: prevQty,
      previousQuantity: prevQty,
      newQuantity: 0,
      user,
      remarks,
    }
    writeTransactions([newTx, ...txs])

    notify()
    return item
  }

  /**
   * Add or update supplier
   */
  static addSupplier(supplier: {
    name: string
    code: string
    contact: string
    email: string
    itemsSupplied?: string[]
  }): LabSupplier {
    const suppliers = readSuppliers()
    const id = `SUP-LAB-${String(suppliers.length + 1).padStart(3, "0")}`
    const newSup: LabSupplier = {
      id,
      name: supplier.name.trim(),
      code: supplier.code.trim().toUpperCase(),
      contact: supplier.contact.trim(),
      email: supplier.email.trim(),
      itemsSupplied: supplier.itemsSupplied || [],
      lastSupplyDate: new Date().toISOString().split("T")[0],
      status: "Active",
    }
    writeSuppliers([newSup, ...suppliers])
    notify()
    return newSup
  }
}

