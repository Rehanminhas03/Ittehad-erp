/** Permission codes used by the parts screens (defined server-side in parts/permissions.ts). */
export const P = {
  catalogView: 'parts.catalog.view',
  catalogManage: 'parts.catalog.manage',
  suppliersView: 'parts.suppliers.view',
  suppliersCreate: 'parts.suppliers.create',
  suppliersUpdate: 'parts.suppliers.update',
  purchaseOrdersView: 'parts.purchase_orders.view',
  purchaseOrdersCreate: 'parts.purchase_orders.create',
  purchaseOrdersUpdate: 'parts.purchase_orders.update',
  purchaseOrdersApprove: 'parts.purchase_orders.approve',
  receiptsView: 'parts.receipts.view',
  receiptsCreate: 'parts.receipts.create',
  stockView: 'parts.stock.view',
  stockManage: 'parts.stock.manage',
  adjustmentsView: 'parts.adjustments.view',
  adjustmentsCreate: 'parts.adjustments.create',
  adjustmentsApprove: 'parts.adjustments.approve',
  transfersView: 'parts.transfers.view',
  transfersCreate: 'parts.transfers.create',
  requestsView: 'parts.requests.view',
  requestsCreate: 'parts.requests.create',
  issuesCreate: 'parts.issues.create',
} as const;

export const PO_STATES = ['draft', 'submitted', 'approved', 'partially_received', 'received', 'cancelled'] as const;
export const REQUEST_STATES = ['open', 'partially_issued', 'issued', 'cancelled'] as const;
export const TRANSFER_STATES = ['draft', 'dispatched', 'received', 'cancelled'] as const;
export const ADJUSTMENT_STATES = ['draft', 'submitted', 'posted', 'rejected'] as const;
export const UOMS = [
  { value: 'each', label: 'Each' },
  { value: 'set', label: 'Set' },
  { value: 'litre', label: 'Litre' },
  { value: 'kg', label: 'Kg' },
  { value: 'metre', label: 'Metre' },
];
export const ADJUSTMENT_REASONS = [
  { value: 'count', label: 'Stock count difference' },
  { value: 'damage', label: 'Damaged' },
  { value: 'expiry', label: 'Expired' },
  { value: 'opening', label: 'Opening stock' },
  { value: 'other', label: 'Other' },
];
export const MOVEMENT_LABELS: Record<string, string> = {
  receipt: 'Goods receipt',
  issue: 'Issued to job card',
  return: 'Returned from job card',
  transfer_out: 'Transfer out',
  transfer_in: 'Transfer in',
  adjustment: 'Adjustment',
};
