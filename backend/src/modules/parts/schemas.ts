import { Id, Money, Timestamp, z } from '../../lib/zod';
import { ADJUSTMENT_STATES, MOVEMENT_TYPES, PO_STATES, REQUEST_STATES, TRANSFER_STATES, UOMS } from './models';

const optionalText = (max = 200) => z.string().trim().max(max).nullish();
const decimal = (v: string) => /^-?\d{1,9}(\.\d{1,2})?$/.test(v);
export const Quantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => decimal(v) && Number(v) > 0, 'Quantity must be greater than 0 (up to 2 decimals)')
  .openapi({ type: 'string', example: '2' });
/** Signed, non-zero (adjustments). */
export const SignedQuantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => decimal(v) && Number(v) !== 0, 'Quantity must be non-zero, e.g. 2 or -1 (up to 2 decimals)')
  .openapi({ type: 'string', example: '-1' });
const PartNo = z.string().trim().min(2).max(60);

// ---- Catalogue & suppliers ---------------------------------------------------------------
export const PartSchema = z.object({
  id: Id,
  partNo: z.string(),
  description: z.string(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  uom: z.enum(UOMS),
  sellingPrice: z.string(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
const partFields = {
  partNo: PartNo,
  description: z.string().trim().min(2).max(200),
  brand: optionalText(60),
  category: optionalText(60),
  uom: z.enum(UOMS).default('each'),
  sellingPrice: Money,
  isActive: z.boolean().optional(),
};
export const PartCreate = z.object(partFields).openapi('PartCreate');
export const PartUpdate = z.object({ ...partFields, uom: z.enum(UOMS) }).omit({ partNo: true }).partial().openapi('PartUpdate');

export const SupplierSchema = z.object({
  id: Id,
  dealershipId: Id,
  code: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  ntn: z.string().nullable(),
  address: z.string().nullable(),
  paymentTermsDays: z.number().int(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
const supplierFields = {
  code: z.string().trim().toUpperCase().min(2).max(20).regex(/^[A-Z0-9_-]+$/, 'Letters, digits, - and _ only'),
  name: z.string().trim().min(2).max(120),
  phone: optionalText(30),
  email: z.email().nullish().or(z.literal('').transform(() => null)),
  ntn: optionalText(30),
  address: optionalText(300),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  isActive: z.boolean().optional(),
};
export const SupplierCreate = z.object({ dealershipId: Id, ...supplierFields }).openapi('SupplierCreate');
export const SupplierUpdate = z
  .object({ ...supplierFields, paymentTermsDays: z.number().int().min(0).max(365) })
  .omit({ code: true })
  .partial()
  .openapi('SupplierUpdate');

// ---- Purchase orders -------------------------------------------------------------------------
export const PurchaseOrderSchema = z.object({
  id: Id,
  poNo: z.string(),
  dealershipId: Id,
  branchId: Id,
  branchName: z.string().nullable().optional(),
  legalEntityId: Id.nullable(),
  accountingEntityId: Id.nullable(),
  supplierId: Id,
  supplierName: z.string().nullable().optional(),
  orderDate: z.string(),
  expectedDate: z.string().nullable(),
  totalAmount: z.string(),
  notes: z.string().nullable(),
  status: z.enum(PO_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const PurchaseOrderCreate = z
  .object({
    dealershipId: Id,
    branchId: Id,
    supplierId: Id,
    orderDate: z.iso.date().optional(),
    expectedDate: z.iso.date().nullish(),
    notes: optionalText(2000),
  })
  .openapi('PurchaseOrderCreate');
export const PurchaseOrderUpdate = z
  .object({ supplierId: Id, expectedDate: z.iso.date().nullish(), notes: optionalText(2000) })
  .partial()
  .openapi('PurchaseOrderUpdate');

export const PurchaseOrderLineSchema = z.object({
  id: Id,
  purchaseOrderId: Id,
  partId: Id,
  partNo: z.string(),
  description: z.string(),
  quantity: z.string(),
  unitPrice: z.string(),
  amount: z.string(),
  receivedQty: z.string(),
});
export const PurchaseOrderLineCreate = z
  .object({ partNo: PartNo, quantity: Quantity, unitPrice: Money, description: z.string().optional() })
  .openapi('PurchaseOrderLineCreate');
export const PurchaseOrderLineUpdate = z
  .object({ quantity: Quantity, unitPrice: Money, partNo: PartNo.optional(), description: z.string().optional() })
  .partial()
  .openapi('PurchaseOrderLineUpdate');

// ---- Goods receipts ------------------------------------------------------------------------
export const GoodsReceiptSchema = z.object({
  id: Id,
  grnNo: z.string(),
  dealershipId: Id,
  branchId: Id,
  purchaseOrderId: Id,
  poNo: z.string().nullable().optional(),
  supplierId: Id,
  supplierName: z.string().nullable().optional(),
  supplierInvoiceNo: z.string().nullable(),
  receivedDate: z.string(),
  totalCost: z.string(),
  notes: z.string().nullable(),
  receivedById: Id,
  receivedByName: z.string().nullable().optional(),
  createdAt: Timestamp,
});
export const GoodsReceiptLineSchema = z
  .object({ id: Id, purchaseOrderLineId: Id, partId: Id, partNo: z.string(), description: z.string(), quantity: z.string(), unitCost: z.string(), amount: z.string() })
  .openapi('GoodsReceiptLine');
export const ReceiveBody = z
  .object({
    receivedDate: z.iso.date().optional(),
    supplierInvoiceNo: optionalText(60),
    notes: optionalText(2000),
    lines: z.array(z.object({ lineId: Id, quantity: Quantity })).min(1).max(200),
  })
  .openapi('ReceiveGoodsRequest');

// ---- Stock -------------------------------------------------------------------------------------
export const StockItemSchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id,
  branchName: z.string().nullable().optional(),
  partId: Id,
  partNo: z.string().nullable().optional(),
  partDescription: z.string().nullable().optional(),
  quantityOnHand: z.string(),
  averageCost: z.string(),
  binLocation: z.string().nullable(),
  reorderLevel: z.string(),
  updatedAt: Timestamp,
});
export const StockItemUpdate = z
  .object({ binLocation: optionalText(30), reorderLevel: z.union([z.string(), z.number()]).transform(String).refine((v) => decimal(v) && Number(v) >= 0, 'Reorder level must be 0 or more') })
  .partial()
  .openapi('StockItemUpdate');

export const StockMovementSchema = z
  .object({
    id: Id,
    occurredAt: Timestamp,
    branchId: Id,
    partId: Id,
    partNo: z.string(),
    type: z.enum(MOVEMENT_TYPES),
    quantity: z.string(),
    unitCost: z.string(),
    value: z.string(),
    balanceAfter: z.string(),
    averageCostAfter: z.string(),
    referenceType: z.string(),
    referenceId: Id,
    referenceNo: z.string().nullable(),
    notes: z.string().nullable(),
    actorName: z.string().nullable(),
  })
  .openapi('StockMovement');
export const StockMovementQuery = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  partId: z.coerce.number().int().positive().optional(),
  type: z.enum(MOVEMENT_TYPES).optional(),
  referenceType: z.string().max(40).optional(),
  referenceId: z.coerce.number().int().positive().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

// ---- Parts requests -----------------------------------------------------------------------------
export const PartsRequestSchema = z.object({
  id: Id,
  requestNo: z.string(),
  dealershipId: Id,
  branchId: Id,
  branchName: z.string().nullable().optional(),
  jobCardId: Id,
  jobCardNo: z.string().nullable().optional(),
  requestedById: Id,
  requestedByName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  status: z.enum(REQUEST_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const PartsRequestLineSchema = z
  .object({
    id: Id,
    partId: Id,
    partNo: z.string(),
    description: z.string(),
    quantity: z.string(),
    issuedQty: z.string(),
    returnedQty: z.string(),
    onHand: z.string().nullable().optional(),
  })
  .openapi('PartsRequestLine');
export const PartsRequestCreate = z
  .object({
    jobCardId: Id,
    /** Store branch to issue from. */
    branchId: Id,
    notes: optionalText(2000),
    lines: z.array(z.object({ partNo: PartNo, quantity: Quantity })).min(1).max(50),
  })
  .openapi('PartsRequestCreate');
export const IssueBody = z
  .object({ lines: z.array(z.object({ lineId: Id, quantity: Quantity })).min(1).max(50) })
  .openapi('IssuePartsRequest');

// ---- Transfers & adjustments ---------------------------------------------------------------------
export const StockTransferSchema = z.object({
  id: Id,
  transferNo: z.string(),
  dealershipId: Id,
  branchId: Id,
  branchName: z.string().nullable().optional(),
  toBranchId: Id,
  toBranchName: z.string().nullable().optional(),
  notes: z.string().nullable(),
  dispatchedAt: Timestamp.nullable(),
  receivedAt: Timestamp.nullable(),
  status: z.enum(TRANSFER_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const StockTransferCreate = z
  .object({ dealershipId: Id, branchId: Id, toBranchId: Id, notes: optionalText(2000) })
  .openapi('StockTransferCreate');
export const StockTransferUpdate = z.object({ notes: optionalText(2000) }).partial().openapi('StockTransferUpdate');

export const StockAdjustmentSchema = z.object({
  id: Id,
  adjustmentNo: z.string(),
  dealershipId: Id,
  branchId: Id,
  branchName: z.string().nullable().optional(),
  reason: z.enum(['count', 'damage', 'expiry', 'opening', 'other']),
  notes: z.string().nullable(),
  postedAt: Timestamp.nullable(),
  status: z.enum(ADJUSTMENT_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const StockAdjustmentCreate = z
  .object({ dealershipId: Id, branchId: Id, reason: z.enum(['count', 'damage', 'expiry', 'opening', 'other']), notes: optionalText(2000) })
  .openapi('StockAdjustmentCreate');
export const StockAdjustmentUpdate = z
  .object({ reason: z.enum(['count', 'damage', 'expiry', 'opening', 'other']), notes: optionalText(2000) })
  .partial()
  .openapi('StockAdjustmentUpdate');

/** Transfer / adjustment lines share the document-line shape (unitPrice = cost where relevant). */
export const StockLineSchema = z.object({
  id: Id,
  partId: Id,
  partNo: z.string(),
  description: z.string(),
  quantity: z.string(),
  unitCost: z.string().nullable(),
});
export const TransferLineCreate = z.object({ partNo: PartNo, quantity: Quantity }).openapi('TransferLineCreate');
export const TransferLineUpdate = z.object({ quantity: Quantity }).partial().openapi('TransferLineUpdate');
export const AdjustmentLineCreate = z
  .object({ partNo: PartNo, quantity: SignedQuantity, unitCost: Money.nullish() })
  .openapi('AdjustmentLineCreate');
export const AdjustmentLineUpdate = z
  .object({ quantity: SignedQuantity, unitCost: Money.nullish() })
  .partial()
  .openapi('AdjustmentLineUpdate');
