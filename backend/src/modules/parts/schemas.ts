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
  /** The vehicle models the part fits (ids); empty: not assigned to a model. */
  modelIds: z.array(z.number().int()).default([]),
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
  purchaseOrderId: Id.nullable(),
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
  .object({ id: Id, purchaseOrderLineId: Id.nullable(), partId: Id, partNo: z.string(), description: z.string(), quantity: z.string(), unitCost: z.string(), amount: z.string() })
  .openapi('GoodsReceiptLine');
export const ReceiveBody = z
  .object({
    receivedDate: z.iso.date().optional(),
    supplierInvoiceNo: optionalText(60),
    notes: optionalText(2000),
    lines: z.array(z.object({ lineId: Id, quantity: Quantity })).min(1).max(200),
  })
  .openapi('ReceiveGoodsRequest');

/** Stock received straight from head office (a challan / invoice), without a purchase order. */
export const DirectReceiveBody = z
  .object({
    dealershipId: Id,
    branchId: Id,
    supplierId: Id,
    receivedDate: z.iso.date().optional(),
    supplierInvoiceNo: optionalText(60),
    notes: optionalText(2000),
    lines: z.array(z.object({ partNo: PartNo, quantity: Quantity, unitCost: Money })).min(1).max(200),
  })
  .openapi('DirectReceiveRequest');

/** Parts out of the store against a repair order (RO) / job card number, or back in when unused. */
export const DirectIssueBody = z
  .object({
    dealershipId: Id,
    branchId: Id,
    kind: z.enum(['issue', 'return']).default('issue'),
    /** An open job card of the workshop (its number and vehicle are taken from it), or a typed repair order number. */
    jobCardId: Id.optional(),
    referenceNo: z.string().trim().max(40).optional(),
    vehicleRef: optionalText(60),
    notes: optionalText(500),
    lines: z.array(z.object({ partNo: PartNo, quantity: Quantity, unitPrice: Money.optional() })).min(1).max(100),
  })
  .openapi('DirectIssueRequest');
export const DirectIssueResultSchema = z
  .object({
    referenceNo: z.string(),
    kind: z.enum(['issue', 'return']),
    lines: z.array(z.object({ partNo: z.string(), description: z.string(), quantity: z.string(), unitCost: z.string(), unitPrice: z.string(), balanceAfter: z.string() })),
  })
  .openapi('DirectIssueResult');

export const StockSheetQuery = z.object({
  dealershipId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  includeZero: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
export const StockSheetRowSchema = z
  .object({
    branchName: z.string(),
    partNo: z.string(),
    description: z.string(),
    category: z.string().nullable(),
    quantityOnHand: z.string(),
    averageCost: z.string(),
    stockValue: z.string(),
    sellingPrice: z.string(),
    saleValue: z.string(),
    binLocation: z.string().nullable(),
    reorderLevel: z.string(),
  })
  .openapi('StockSheetRow');

/** The store manager: a new part, or changes to a part's number, name, category and price. */
export const ManagePartCreate = z
  .object({
    brand: z.string().trim().min(2).max(60),
    partNo: PartNo,
    description: z.string().trim().min(2).max(200),
    category: optionalText(60),
    uom: z.enum(UOMS).default('each'),
    sellingPrice: Money,
    modelIds: z.array(Id).max(10).optional(),
  })
  .openapi('ManagePartCreate');
export const ManagePartUpdate = z
  .object({
    partNo: PartNo,
    description: z.string().trim().min(2).max(200),
    category: optionalText(60),
    uom: z.enum(UOMS),
    sellingPrice: Money,
    isActive: z.boolean(),
    modelIds: z.array(Id).max(10),
  })
  .partial()
  .openapi('ManagePartUpdate');
/** A vehicle model of a brand, for the "Vehicle" filter (the store staff need not see the master data). */
export const PartVehicleModelSchema = z.object({ id: Id, brand: z.string(), name: z.string() }).openapi('PartVehicleModel');

/** Parts by part-code prefix: how many, a sample, and the models they are assigned to. */
export const PartPrefixQuery = z.object({ brand: z.string().trim().min(2).max(60), length: z.coerce.number().int().min(2).max(8).default(3) });
export const PartPrefixSchema = z
  .object({ prefix: z.string(), parts: z.number().int(), assigned: z.number().int(), sample: z.string(), modelIds: z.array(z.number().int()) })
  .openapi('PartPrefix');
/** Set the vehicle models of every part of a brand whose code starts with the prefix. */
export const AssignModelsBody = z
  .object({
    brand: z.string().trim().min(2).max(60),
    prefix: z.string().trim().min(2).max(20),
    modelIds: z.array(Id).max(10),
    /** replace: exactly these models; add: also these. */
    mode: z.enum(['replace', 'add']).default('replace'),
  })
  .openapi('AssignModelsRequest');
export const AssignModelsResultSchema = z.object({ changed: z.number().int() }).openapi('AssignModelsResult');

/** Raise (+) or lower (−) every price of a brand (or one category) by a percentage. */
export const PriceChangeBody = z
  .object({
    brand: z.string().trim().min(2).max(60),
    category: optionalText(60),
    percent: z.coerce.number().min(-90).max(500).refine((v) => v !== 0, 'Enter a percentage other than 0'),
  })
  .openapi('PriceChangeRequest');
export const PriceChangeResultSchema = z.object({ changed: z.number().int() }).openapi('PriceChangeResult');

export const OpenJobCardSchema = z
  .object({
    id: Id,
    jobCardNo: z.string(),
    status: z.string(),
    registrationNo: z.string().nullable(),
    vin: z.string().nullable(),
    modelName: z.string().nullable(),
    customerName: z.string().nullable(),
  })
  .openapi('OpenJobCard');
export const OpenJobCardQuery = z.object({ dealershipId: z.coerce.number().int().positive() });

/** Every part with its stock now and what came in / went out this month. */
export const InventoryQuery = z.object({
  dealershipId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  brand: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  modelId: z.coerce.number().int().positive().optional(),
  inStock: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  lowStock: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});
export const InventoryRowSchema = z
  .object({
    partId: Id,
    partNo: z.string(),
    description: z.string(),
    brand: z.string().nullable(),
    category: z.string().nullable(),
    sellingPrice: z.string(),
    onHand: z.string(),
    stockValue: z.string(),
    reorderLevel: z.string(),
    inThisMonth: z.string(),
    outThisMonth: z.string(),
  })
  .openapi('InventoryRow');
export const InventoryPageSchema = z
  .object({ items: z.array(InventoryRowSchema), total: z.number().int(), page: z.number().int(), pageSize: z.number().int(), stockValue: z.string(), partsInStock: z.number().int() })
  .openapi('InventoryPage');

/** The price list pasted from Excel: new parts are added, known ones get the new description / price. */
export const PartImportBody = z
  .object({
    brand: z.string().trim().min(2).max(60),
    rows: z
      .array(z.object({ partNo: PartNo, description: z.string().trim().min(2).max(200), sellingPrice: Money, category: optionalText(60) }))
      .min(1)
      .max(5000),
  })
  .openapi('PartImportRequest');
export const PartImportResultSchema = z.object({ added: z.number().int(), updated: z.number().int(), unchanged: z.number().int() }).openapi('PartImportResult');

/** Parts in and out per month, at cost and at the price list. */
export const MonthlyReportQuery = z.object({
  dealershipId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
const MonthlyFigures = {
  receivedCost: z.string(),
  issuedCost: z.string(),
  issuedSales: z.string(),
  returnedCost: z.string(),
  returnedSales: z.string(),
  adjustmentCost: z.string(),
  netCost: z.string(),
  netSales: z.string(),
  margin: z.string(),
};
export const MonthlyReportSchema = z
  .object({
    months: z.array(z.object({ month: z.string(), ...MonthlyFigures })),
    categories: z.array(z.object({ category: z.string(), receivedCost: z.string(), netCost: z.string(), netSales: z.string() })),
    totals: z.object(MonthlyFigures),
  })
  .openapi('PartsMonthlyReport');

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
