import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, numeric, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigintId, createdAt, pk } from '../../db/columns';
import { partsSchema } from '../../db/pgSchemas';
import { accountingEntity, branchFk, dealership, legalEntity, tenantPolicy, trackedColumns, trackedIndexes, user } from '../core/models';
import { jobCard } from '../service/models';

const money = () => numeric({ precision: 14, scale: 2, mode: 'string' });
/** Quantities allow fractions (litres of oil); stock is kept to 2 decimals. */
const qty = () => numeric({ precision: 12, scale: 2, mode: 'string' });

export const UOMS = ['each', 'set', 'litre', 'kg', 'metre'] as const;
export const PO_STATES = ['draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled'] as const;
export const REQUEST_STATES = ['open', 'partially_issued', 'issued', 'cancelled'] as const;
export const TRANSFER_STATES = ['draft', 'dispatched', 'received', 'cancelled'] as const;
export const ADJUSTMENT_STATES = ['draft', 'submitted', 'posted', 'rejected'] as const;
export const MOVEMENT_TYPES = ['receipt', 'issue', 'return', 'transfer_out', 'transfer_in', 'adjustment'] as const;

// ===========================================================================
// Catalogue (group-wide) and suppliers (per dealership)
// ===========================================================================
export const part = partsSchema.table(
  'part',
  {
    id: pk(),
    /** Manufacturer part number, uppercase, unique across the group. */
    partNo: text().notNull(),
    description: text().notNull(),
    brand: text(),
    category: text(),
    uom: text({ enum: UOMS }).notNull().default('each'),
    /** List price charged to customers (job cards / invoices). */
    sellingPrice: money().notNull().default('0'),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [
    uniqueIndex('part_no_uq').on(t.partNo),
    check('part_price', sql`${t.sellingPrice} >= 0`),
    index('part_description_trgm').using('gin', sql`${t.description} gin_trgm_ops`),
    index('part_no_trgm').using('gin', sql`${t.partNo} gin_trgm_ops`),
    ...trackedIndexes(t),
  ],
);

export const supplier = partsSchema.table(
  'supplier',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    code: text().notNull(),
    name: text().notNull(),
    phone: text(),
    email: text(),
    ntn: text(),
    address: text(),
    paymentTermsDays: integer().notNull().default(30),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [
    unique().on(t.dealershipId, t.code),
    index().on(t.dealershipId),
    index('supplier_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

// ===========================================================================
// Purchasing: PO -> goods receipt (GRN)
// ===========================================================================
export const purchaseOrder = partsSchema.table(
  'purchase_order',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    /** Receiving branch (stock location). */
    branchId: bigintId().notNull(),
    legalEntityId: bigintId().references(() => legalEntity.id),
    accountingEntityId: bigintId().references(() => accountingEntity.id),
    poNo: text().notNull().unique(),
    supplierId: bigintId()
      .notNull()
      .references(() => supplier.id),
    orderDate: date({ mode: 'string' }).notNull(),
    expectedDate: date({ mode: 'string' }),
    totalAmount: money().notNull().default('0'),
    notes: text(),
    status: text({ enum: PO_STATES }).notNull().default('draft'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.legalEntityId),
    index().on(t.accountingEntityId),
    index().on(t.supplierId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const purchaseOrderLine = partsSchema.table(
  'purchase_order_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    purchaseOrderId: bigintId()
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: 'cascade' }),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    partNo: text().notNull(),
    description: text().notNull(),
    quantity: qty().notNull(),
    unitPrice: money().notNull(),
    amount: money().notNull(),
    receivedQty: qty().notNull().default('0'),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.purchaseOrderId, t.partId),
    check('po_line_qty', sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.receivedQty} >= 0 and ${t.receivedQty} <= ${t.quantity}`),
    index().on(t.dealershipId),
    index().on(t.purchaseOrderId),
    index().on(t.partId),
    tenantPolicy(),
  ],
);

/** A posted goods receipt: immutable once created (stock and the PO move with it). */
export const goodsReceipt = partsSchema.table(
  'goods_receipt',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId().notNull(),
    grnNo: text().notNull().unique(),
    purchaseOrderId: bigintId()
      .notNull()
      .references(() => purchaseOrder.id),
    supplierId: bigintId()
      .notNull()
      .references(() => supplier.id),
    supplierInvoiceNo: text(),
    receivedDate: date({ mode: 'string' }).notNull(),
    totalCost: money().notNull(),
    notes: text(),
    receivedById: bigintId()
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    branchFk(t),
    index().on(t.dealershipId, t.receivedDate),
    index().on(t.branchId),
    index().on(t.purchaseOrderId),
    index().on(t.supplierId),
    index().on(t.receivedById),
    tenantPolicy(),
  ],
);

export const goodsReceiptLine = partsSchema.table(
  'goods_receipt_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    goodsReceiptId: bigintId()
      .notNull()
      .references(() => goodsReceipt.id),
    purchaseOrderLineId: bigintId()
      .notNull()
      .references(() => purchaseOrderLine.id),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    quantity: qty().notNull(),
    unitCost: money().notNull(),
    amount: money().notNull(),
  },
  (t) => [
    check('grn_line_qty', sql`${t.quantity} > 0`),
    index().on(t.dealershipId),
    index().on(t.goodsReceiptId),
    index().on(t.purchaseOrderLineId),
    index().on(t.partId),
    tenantPolicy(),
  ],
);

// ===========================================================================
// Stock: on-hand per branch + the append-only movement ledger
// ===========================================================================
export const stockItem = partsSchema.table(
  'stock_item',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId().notNull(),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    /** Maintained only by the stock engine, in the same transaction as the ledger row. */
    quantityOnHand: qty().notNull().default('0'),
    averageCost: money().notNull().default('0'),
    binLocation: text(),
    reorderLevel: qty().notNull().default('0'),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    branchFk(t),
    unique().on(t.branchId, t.partId),
    check('stock_non_negative', sql`${t.quantityOnHand} >= 0 and ${t.averageCost} >= 0`),
    index().on(t.dealershipId),
    index().on(t.branchId),
    index().on(t.partId),
    tenantPolicy(),
  ],
);

export const inventoryTransaction = partsSchema.table(
  'inventory_transaction',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId().notNull(),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    type: text({ enum: MOVEMENT_TYPES }).notNull(),
    /** Signed: positive into stock, negative out. */
    quantity: qty().notNull(),
    unitCost: money().notNull(),
    /** Signed value of the movement at unit cost. */
    value: money().notNull(),
    balanceAfter: qty().notNull(),
    averageCostAfter: money().notNull(),
    referenceType: text().notNull(),
    referenceId: bigintId().notNull(),
    referenceNo: text(),
    notes: text(),
    actorId: bigintId()
      .notNull()
      .references(() => user.id),
    occurredAt: createdAt(),
  },
  (t) => [
    branchFk(t),
    check('inventory_tx_nonzero', sql`${t.quantity} <> 0`),
    index().on(t.dealershipId, t.occurredAt),
    index().on(t.branchId, t.partId, t.occurredAt),
    index().on(t.partId),
    index().on(t.referenceType, t.referenceId),
    index().on(t.actorId),
    tenantPolicy(),
  ],
);

// ===========================================================================
// Parts requests (workshop -> parts desk) and their issues/returns
// ===========================================================================
export const partsRequest = partsSchema.table(
  'parts_request',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    /** Store branch the parts are issued from. */
    branchId: bigintId().notNull(),
    requestNo: text().notNull().unique(),
    jobCardId: bigintId()
      .notNull()
      .references(() => jobCard.id),
    requestedById: bigintId()
      .notNull()
      .references(() => user.id),
    notes: text(),
    status: text({ enum: REQUEST_STATES }).notNull().default('open'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.jobCardId),
    index().on(t.requestedById),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const partsRequestLine = partsSchema.table(
  'parts_request_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    partsRequestId: bigintId()
      .notNull()
      .references(() => partsRequest.id, { onDelete: 'cascade' }),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    partNo: text().notNull(),
    description: text().notNull(),
    quantity: qty().notNull(),
    issuedQty: qty().notNull().default('0'),
    returnedQty: qty().notNull().default('0'),
    /** Job card line carrying the issued part (created on first issue). */
    jobCardLineId: bigintId(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.partsRequestId, t.partId),
    check('request_line_qty', sql`${t.quantity} > 0 and ${t.issuedQty} >= 0 and ${t.issuedQty} <= ${t.quantity} and ${t.returnedQty} >= 0 and ${t.returnedQty} <= ${t.issuedQty}`),
    index().on(t.dealershipId),
    index().on(t.partsRequestId),
    index().on(t.partId),
    index().on(t.jobCardLineId),
    tenantPolicy(),
  ],
);

// ===========================================================================
// Transfers between branches of a dealership
// ===========================================================================
export const stockTransfer = partsSchema.table(
  'stock_transfer',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    /** Source branch (the transfer's tenant branch). */
    branchId: bigintId().notNull(),
    toBranchId: bigintId().notNull(),
    transferNo: text().notNull().unique(),
    notes: text(),
    dispatchedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),
    status: text({ enum: TRANSFER_STATES }).notNull().default('draft'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    branchFk({ branchId: t.toBranchId, dealershipId: t.dealershipId }),
    check('transfer_branches_differ', sql`${t.branchId} <> ${t.toBranchId}`),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.toBranchId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const stockTransferLine = partsSchema.table(
  'stock_transfer_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    stockTransferId: bigintId()
      .notNull()
      .references(() => stockTransfer.id, { onDelete: 'cascade' }),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    partNo: text().notNull(),
    description: text().notNull(),
    quantity: qty().notNull(),
    /** Average cost at dispatch; the destination receives at this cost. */
    unitCost: money(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.stockTransferId, t.partId),
    check('transfer_line_qty', sql`${t.quantity} > 0`),
    index().on(t.dealershipId),
    index().on(t.stockTransferId),
    index().on(t.partId),
    tenantPolicy(),
  ],
);

// ===========================================================================
// Adjustments (stock count differences, damage) with approval
// ===========================================================================
export const stockAdjustment = partsSchema.table(
  'stock_adjustment',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId().notNull(),
    adjustmentNo: text().notNull().unique(),
    reason: text({ enum: ['count', 'damage', 'expiry', 'opening', 'other'] }).notNull(),
    notes: text(),
    postedAt: timestamp({ withTimezone: true }),
    status: text({ enum: ADJUSTMENT_STATES }).notNull().default('draft'),
    ...trackedColumns(),
  },
  (t) => [branchFk(t), index().on(t.dealershipId, t.status), index().on(t.branchId), ...trackedIndexes(t), tenantPolicy()],
);

export const stockAdjustmentLine = partsSchema.table(
  'stock_adjustment_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    stockAdjustmentId: bigintId()
      .notNull()
      .references(() => stockAdjustment.id, { onDelete: 'cascade' }),
    partId: bigintId()
      .notNull()
      .references(() => part.id),
    partNo: text().notNull(),
    description: text().notNull(),
    /** Signed change: +found / -missing. */
    quantity: qty().notNull(),
    /** Cost for increases (defaults to the current average); decreases use the average. */
    unitCost: money(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.stockAdjustmentId, t.partId),
    check('adjustment_line_qty', sql`${t.quantity} <> 0`),
    index().on(t.dealershipId),
    index().on(t.stockAdjustmentId),
    index().on(t.partId),
    tenantPolicy(),
  ],
);
