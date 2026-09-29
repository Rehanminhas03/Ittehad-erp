// Tables: defined in prisma/schema.prisma (Prisma ORM); these are their generated identifiers for
// hand-written SQL (see src/db/tables.generated.ts). Prisma Client: tx.<table>.findMany(...).
export { part, supplier, purchaseOrder, purchaseOrderLine, goodsReceipt, goodsReceiptLine, stockItem, inventoryTransaction, partsRequest, partsRequestLine, stockTransfer, stockTransferLine, stockAdjustment, stockAdjustmentLine } from '../../db/tables.generated';

export const UOMS = ['each', 'set', 'litre', 'kg', 'metre'] as const;
export const PO_STATES = ['draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled'] as const;
export const REQUEST_STATES = ['open', 'partially_issued', 'issued', 'cancelled'] as const;
export const TRANSFER_STATES = ['draft', 'dispatched', 'received', 'cancelled'] as const;
export const ADJUSTMENT_STATES = ['draft', 'submitted', 'posted', 'rejected'] as const;
export const MOVEMENT_TYPES = ['receipt', 'issue', 'return', 'transfer_out', 'transfer_in', 'adjustment'] as const;

