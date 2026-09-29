import { POLICIES } from '../../config/policies';
import { query } from '../../db/client';
import { and, eq, ne, sql } from '../../db/sql';
import { EntityService } from '../../entity/entityService';
import { type NameSource, withNames } from '../../entity/names';
import type { EntityConfig, EntityCtx, Row } from '../../entity/types';
import { conflict, validationError } from '../../lib/errors';
import { BoolQuery, IdQuery, z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { branch } from '../core/models';
import { USER_NAME } from '../master/nameSources';
import { jobCard } from '../service/models';
import {
  goodsReceipt,
  part,
  partsRequest,
  purchaseOrder,
  purchaseOrderLine,
  stockAdjustment,
  stockAdjustmentLine,
  stockItem,
  stockTransfer,
  stockTransferLine,
  supplier,
} from './models';
import { PartsPerm as P } from './permissions';
import { dispatchTransfer, postAdjustment, receiveTransfer } from './postings';
import {
  GoodsReceiptSchema,
  PartCreate,
  PartSchema,
  PartUpdate,
  PartsRequestSchema,
  PurchaseOrderCreate,
  PurchaseOrderSchema,
  PurchaseOrderUpdate,
  StockAdjustmentCreate,
  StockAdjustmentSchema,
  StockAdjustmentUpdate,
  StockItemSchema,
  StockItemUpdate,
  StockTransferCreate,
  StockTransferSchema,
  StockTransferUpdate,
  SupplierCreate,
  SupplierSchema,
  SupplierUpdate,
} from './schemas';

const statusFilter = (states: readonly string[]) => ({ key: 'status', schema: z.enum(states as [string, ...string[]]) });

export const BRANCH_NAME: NameSource = { table: branch, id: branch.id, label: branch.name };
export const SUPPLIER_NAME: NameSource = { table: supplier, id: supplier.id, label: supplier.name };
export const PART_NO: NameSource = { table: part, id: part.id, label: part.partNo };
export const PART_DESCRIPTION: NameSource = { table: part, id: part.id, label: part.description };
export const PO_NO: NameSource = { table: purchaseOrder, id: purchaseOrder.id, label: purchaseOrder.poNo };
export const JOB_CARD_NO: NameSource = { table: jobCard, id: jobCard.id, label: jobCard.jobCardNo };

/** Part numbers are compared uppercase without spaces (hyphens are meaningful). */
export const normalizePartNo = (s: string) => s.toUpperCase().replace(/\s+/g, '');

/** Active catalogue part for a part number, or a 422 on the given field. */
export async function resolvePart(ctx: EntityCtx, partNo: string, path = 'partNo') {
  const p = await ctx.tx.part.findFirst({ where: { partNo: normalizePartNo(partNo) } });
  if (!p || !p.isActive) throw validationError([{ in: 'body', path, message: `Unknown or inactive part number "${partNo}"` }]);
  return p;
}

/** Same dealership check for a branch referenced by id (composite FKs also enforce it). */
async function assertBranchOf(ctx: EntityCtx, branchId: number, dealershipId: number, path = 'branchId') {
  const b = await ctx.tx.branch.findFirst({ where: { id: branchId }, select: { dealershipId: true } });
  if (!b || b.dealershipId !== dealershipId) throw validationError([{ in: 'body', path, message: 'Choose a branch of this dealership' }]);
}

const differentApprover = (ctx: EntityCtx, row: Row) =>
  POLICIES.parts.approverMustDifferFromCreator && row.createdById === ctx.access.userId
    ? 'This must be approved by someone other than the person who prepared it'
    : null;

async function hasLines(ctx: EntityCtx, table: typeof purchaseOrderLine | typeof stockTransferLine | typeof stockAdjustmentLine, key: 'purchaseOrderId' | 'stockTransferId' | 'stockAdjustmentId', id: number) {
  const col = (table as unknown as Record<string, typeof purchaseOrderLine.purchaseOrderId>)[key]!;
  const [{ n } = { n: 0 }] = await query<{ n: number }>(ctx.tx, sql`select count(*)::int as n from ${table} where ${eq(col, id)}`);
  return n > 0 ? null : 'Add at least one line';
}

// =============================================================================
// Catalogue & suppliers
// =============================================================================
export const partEntity: EntityConfig = {
  entityType: 'parts.part',
  module: 'parts',
  path: 'catalog',
  names: { singular: 'Part', plural: 'Parts' },
  table: part,
  schemas: { read: PartSchema, create: PartCreate, update: PartUpdate },
  permissions: { view: P.catalogView, create: P.catalogManage, update: P.catalogManage },
  tenant: null,
  search: ['partNo', 'description'],
  filters: {
    brand: { key: 'brand', schema: z.string().max(60) },
    category: { key: 'category', schema: z.string().max(60) },
    isActive: { key: 'isActive', schema: BoolQuery },
  },
  sort: { default: 'partNo', keys: ['partNo', 'description', 'sellingPrice', 'createdAt'] },
  hooks: {
    beforeCreate: async (_ctx, data) => ({ ...data, partNo: normalizePartNo(String(data.partNo)) }),
  },
};

export const supplierEntity: EntityConfig = {
  entityType: 'parts.supplier',
  module: 'parts',
  path: 'suppliers',
  names: { singular: 'Supplier', plural: 'Suppliers' },
  table: supplier,
  schemas: { read: SupplierSchema, create: SupplierCreate, update: SupplierUpdate },
  permissions: { view: P.suppliersView, create: P.suppliersCreate, update: P.suppliersUpdate },
  tenant: { dealershipKey: 'dealershipId' },
  search: ['name', 'code'],
  filters: { dealershipId: { key: 'dealershipId', schema: IdQuery }, isActive: { key: 'isActive', schema: BoolQuery } },
  sort: { default: 'name', keys: ['name', 'code', 'createdAt'] },
};

// =============================================================================
// Purchase orders & goods receipts
// =============================================================================
export const purchaseOrderEntity: EntityConfig = {
  entityType: 'parts.purchase_order',
  module: 'parts',
  path: 'purchase-orders',
  names: { singular: 'PurchaseOrder', plural: 'PurchaseOrders' },
  table: purchaseOrder,
  schemas: { read: PurchaseOrderSchema, create: PurchaseOrderCreate, update: PurchaseOrderUpdate },
  permissions: { view: P.purchaseOrdersView, create: P.purchaseOrdersCreate, update: P.purchaseOrdersUpdate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  search: ['poNo'],
  filters: {
    status: statusFilter(['draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled']),
    supplierId: { key: 'supplierId', schema: IdQuery },
    branchId: { key: 'branchId', schema: IdQuery },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'poNo', 'orderDate', 'totalAmount', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'draft',
    states: [
      { key: 'draft', label: 'Draft' },
      { key: 'submitted', label: 'Awaiting approval' },
      { key: 'approved', label: 'Approved' },
      { key: 'partially_received', label: 'Partially received' },
      { key: 'received', label: 'Received', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      {
        action: 'submit',
        label: 'Submit for approval',
        from: ['draft'],
        to: 'submitted',
        permission: P.purchaseOrdersSubmit,
        guard: (ctx, row) => hasLines(ctx, purchaseOrderLine, 'purchaseOrderId', row.id),
      },
      { action: 'approve', label: 'Approve', from: ['submitted'], to: 'approved', permission: P.purchaseOrdersApprove, guard: differentApprover },
      { action: 'return', label: 'Return to draft', from: ['submitted'], to: 'draft', permission: P.purchaseOrdersApprove, requiresComment: true },
      { action: 'cancel', label: 'Cancel order', from: ['draft', 'submitted', 'approved'], to: 'cancelled', permission: P.purchaseOrdersCancel, requiresComment: true },
      // Set by goods receipts.
      { action: 'receive', label: 'Partly received', from: ['approved', 'partially_received'], to: 'partially_received', permission: P.receiptsCreate, system: true },
      { action: 'complete_receipt', label: 'Fully received', from: ['approved', 'partially_received'], to: 'received', permission: P.receiptsCreate, system: true },
    ],
  },
  hooks: {
    beforeCreate: async (ctx, data) => {
      const dealershipId = data.dealershipId as number;
      await assertBranchOf(ctx, data.branchId as number, dealershipId);
      const s = await ctx.tx.supplier.findFirst({ where: { id: data.supplierId as number } });
      if (!s || s.dealershipId !== dealershipId || !s.isActive) {
        throw validationError([{ in: 'body', path: 'supplierId', message: 'Choose an active supplier of this dealership' }]);
      }
      const d = await ctx.tx.dealership.findFirst({
        where: { id: dealershipId },
        select: { legalEntityId: true, accountingEntityId: true },
      });
      return {
        ...data,
        orderDate: data.orderDate ?? new Date().toISOString().slice(0, 10),
        legalEntityId: d?.legalEntityId ?? null,
        accountingEntityId: d?.accountingEntityId ?? null,
        poNo: await nextDocumentNumber(ctx.tx, dealershipId, DocType.purchaseOrder),
      };
    },
    beforeUpdate: async (ctx, row, patch) => {
      if (row.status !== 'draft') throw conflict('Only draft purchase orders can be edited');
      if (patch.supplierId) {
        const s = await ctx.tx.supplier.findFirst({ where: { id: patch.supplierId as number } });
        if (!s || s.dealershipId !== row.dealershipId || !s.isActive) {
          throw validationError([{ in: 'body', path: 'supplierId', message: 'Choose an active supplier of this dealership' }]);
        }
      }
      return patch;
    },
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, { supplierName: { key: 'supplierId', source: SUPPLIER_NAME }, branchName: { key: 'branchId', source: BRANCH_NAME } }),
  },
};

export const goodsReceiptEntity: EntityConfig = {
  entityType: 'parts.goods_receipt',
  module: 'parts',
  path: 'goods-receipts',
  names: { singular: 'GoodsReceipt', plural: 'GoodsReceipts' },
  table: goodsReceipt,
  // Created by receiving against a purchase order; immutable afterwards.
  schemas: { read: GoodsReceiptSchema },
  permissions: { view: P.receiptsView },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  tracked: false,
  search: ['grnNo', 'supplierInvoiceNo'],
  filters: { purchaseOrderId: { key: 'purchaseOrderId', schema: IdQuery }, supplierId: { key: 'supplierId', schema: IdQuery } },
  sort: { default: '-createdAt', keys: ['createdAt', 'grnNo', 'receivedDate', 'totalCost'] },
  hooks: {
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        poNo: { key: 'purchaseOrderId', source: PO_NO },
        supplierName: { key: 'supplierId', source: SUPPLIER_NAME },
        receivedByName: { key: 'receivedById', source: USER_NAME },
      }),
  },
};

// =============================================================================
// Stock items (read; bin / reorder level editable)
// =============================================================================
export const stockItemEntity: EntityConfig = {
  entityType: 'parts.stock_item',
  module: 'parts',
  path: 'stock',
  names: { singular: 'StockItem', plural: 'StockItems' },
  table: stockItem,
  schemas: { read: StockItemSchema, update: StockItemUpdate },
  permissions: { view: P.stockView, update: P.stockManage },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  tracked: false,
  search: ['binLocation'],
  filters: { branchId: { key: 'branchId', schema: IdQuery }, partId: { key: 'partId', schema: IdQuery } },
  sort: { default: '-updatedAt', keys: ['updatedAt', 'quantityOnHand', 'averageCost'] },
  hooks: {
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        partNo: { key: 'partId', source: PART_NO },
        partDescription: { key: 'partId', source: PART_DESCRIPTION },
        branchName: { key: 'branchId', source: BRANCH_NAME },
      }),
  },
};

// =============================================================================
// Parts requests (created from a job card; issued by the parts desk)
// =============================================================================
export const partsRequestEntity: EntityConfig = {
  entityType: 'parts.parts_request',
  module: 'parts',
  path: 'requests',
  names: { singular: 'PartsRequest', plural: 'PartsRequests' },
  table: partsRequest,
  schemas: { read: PartsRequestSchema },
  permissions: { view: P.requestsView },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  search: ['requestNo'],
  filters: {
    status: statusFilter(['open', 'partially_issued', 'issued', 'cancelled']),
    jobCardId: { key: 'jobCardId', schema: IdQuery },
    branchId: { key: 'branchId', schema: IdQuery },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'requestNo', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'open',
    states: [
      { key: 'open', label: 'Open' },
      { key: 'partially_issued', label: 'Partially issued' },
      { key: 'issued', label: 'Issued', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      { action: 'cancel', label: 'Cancel request', from: ['open'], to: 'cancelled', permission: P.requestsCancel, requiresComment: true },
      { action: 'issue_partial', label: 'Partly issued', from: ['open', 'partially_issued'], to: 'partially_issued', permission: P.issuesCreate, system: true },
      { action: 'issue_full', label: 'Issued', from: ['open', 'partially_issued'], to: 'issued', permission: P.issuesCreate, system: true },
    ],
  },
  hooks: {
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        jobCardNo: { key: 'jobCardId', source: JOB_CARD_NO },
        branchName: { key: 'branchId', source: BRANCH_NAME },
        requestedByName: { key: 'requestedById', source: USER_NAME },
      }),
  },
};

// =============================================================================
// Transfers & adjustments
// =============================================================================
export const stockTransferEntity: EntityConfig = {
  entityType: 'parts.stock_transfer',
  module: 'parts',
  path: 'transfers',
  names: { singular: 'StockTransfer', plural: 'StockTransfers' },
  table: stockTransfer,
  schemas: { read: StockTransferSchema, create: StockTransferCreate, update: StockTransferUpdate },
  permissions: { view: P.transfersView, create: P.transfersCreate, update: P.transfersCreate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  search: ['transferNo'],
  filters: { status: statusFilter(['draft', 'dispatched', 'received', 'cancelled']), toBranchId: { key: 'toBranchId', schema: IdQuery } },
  sort: { default: '-createdAt', keys: ['createdAt', 'transferNo', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'draft',
    states: [
      { key: 'draft', label: 'Draft' },
      { key: 'dispatched', label: 'In transit' },
      { key: 'received', label: 'Received', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      {
        action: 'dispatch',
        label: 'Dispatch',
        from: ['draft'],
        to: 'dispatched',
        permission: P.transfersDispatch,
        guard: (ctx, row) => hasLines(ctx, stockTransferLine, 'stockTransferId', row.id),
        effect: dispatchTransfer,
      },
      {
        action: 'receive',
        label: 'Receive',
        from: ['dispatched'],
        to: 'received',
        permission: P.transfersReceive,
        // The receiver acts at the destination branch.
        guard: (ctx, row) =>
          ctx.access.canIn(P.transfersReceive, { dealershipId: row.dealershipId as number, branchId: row.toBranchId as number })
            ? null
            : 'Only staff of the destination branch can receive this transfer',
        effect: receiveTransfer,
      },
      { action: 'cancel', label: 'Cancel', from: ['draft'], to: 'cancelled', permission: P.transfersCreate, requiresComment: true },
    ],
  },
  hooks: {
    beforeCreate: async (ctx, data) => {
      const dealershipId = data.dealershipId as number;
      await assertBranchOf(ctx, data.branchId as number, dealershipId);
      await assertBranchOf(ctx, data.toBranchId as number, dealershipId, 'toBranchId');
      if (data.branchId === data.toBranchId) throw validationError([{ in: 'body', path: 'toBranchId', message: 'Choose a different branch' }]);
      return { ...data, transferNo: await nextDocumentNumber(ctx.tx, dealershipId, DocType.stockTransfer) };
    },
    beforeUpdate: async (_ctx, row, patch) => {
      if (row.status !== 'draft') throw conflict('Only draft transfers can be edited');
      return patch;
    },
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, { branchName: { key: 'branchId', source: BRANCH_NAME }, toBranchName: { key: 'toBranchId', source: BRANCH_NAME } }),
  },
};

export const stockAdjustmentEntity: EntityConfig = {
  entityType: 'parts.stock_adjustment',
  module: 'parts',
  path: 'adjustments',
  names: { singular: 'StockAdjustment', plural: 'StockAdjustments' },
  table: stockAdjustment,
  schemas: { read: StockAdjustmentSchema, create: StockAdjustmentCreate, update: StockAdjustmentUpdate },
  permissions: { view: P.adjustmentsView, create: P.adjustmentsCreate, update: P.adjustmentsCreate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  search: ['adjustmentNo'],
  filters: { status: statusFilter(['draft', 'submitted', 'posted', 'rejected']), reason: { key: 'reason', schema: z.string().max(20) } },
  sort: { default: '-createdAt', keys: ['createdAt', 'adjustmentNo', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'draft',
    states: [
      { key: 'draft', label: 'Draft' },
      { key: 'submitted', label: 'Awaiting approval' },
      { key: 'posted', label: 'Posted', terminal: true },
      { key: 'rejected', label: 'Rejected' },
    ],
    transitions: [
      {
        action: 'submit',
        label: 'Submit for approval',
        from: ['draft'],
        to: 'submitted',
        permission: P.adjustmentsCreate,
        guard: (ctx, row) => hasLines(ctx, stockAdjustmentLine, 'stockAdjustmentId', row.id),
      },
      {
        action: 'approve',
        label: 'Approve & post',
        from: ['submitted'],
        to: 'posted',
        permission: P.adjustmentsApprove,
        guard: differentApprover,
        effect: postAdjustment,
      },
      { action: 'reject', label: 'Reject', from: ['submitted'], to: 'rejected', permission: P.adjustmentsApprove, requiresComment: true },
      { action: 'revise', label: 'Revise', from: ['rejected'], to: 'draft', permission: P.adjustmentsCreate },
    ],
  },
  hooks: {
    beforeCreate: async (ctx, data) => {
      await assertBranchOf(ctx, data.branchId as number, data.dealershipId as number);
      return { ...data, adjustmentNo: await nextDocumentNumber(ctx.tx, data.dealershipId as number, DocType.stockAdjustment) };
    },
    beforeUpdate: async (_ctx, row, patch) => {
      if (row.status !== 'draft') throw conflict('Only draft adjustments can be edited');
      return patch;
    },
    decorate: (ctx, rows) => withNames(ctx.tx, rows, { branchName: { key: 'branchId', source: BRANCH_NAME } }),
  },
};

export const parts = new EntityService(partEntity);
export const suppliers = new EntityService(supplierEntity);
export const purchaseOrders = new EntityService(purchaseOrderEntity);
export const goodsReceipts = new EntityService(goodsReceiptEntity);
export const stockItems = new EntityService(stockItemEntity);
export const partsRequests = new EntityService(partsRequestEntity);
export const transfers = new EntityService(stockTransferEntity);
export const adjustments = new EntityService(stockAdjustmentEntity);

/** Rejects a second line for the same part on a document (change its quantity instead). */
export async function assertPartNotOnDocument(
  ctx: EntityCtx,
  table: typeof purchaseOrderLine | typeof stockTransferLine | typeof stockAdjustmentLine,
  parentCol: typeof purchaseOrderLine.purchaseOrderId,
  parentId: number,
  partId: number,
  exceptLineId?: number,
) {
  const t = table as typeof purchaseOrderLine;
  const [dup] = await query<{ id: number }>(
    ctx.tx,
    sql`select ${t.id} as id from ${t}
         where ${and(eq(parentCol, parentId), eq(t.partId, partId), exceptLineId ? ne(t.id, exceptLineId) : undefined)!}
         limit 1`,
  );
  if (dup) throw conflict('This part is already on the document; change that line instead');
}
