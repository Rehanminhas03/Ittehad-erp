import type { Column } from '@/features/sales/exports/exporters';

/** The sale report: the same columns as the store's sale report sheet, then the extra details. */
export const SALE_COLUMNS: Column[] = [
  { header: 'RO No', value: (r) => String(r.roNo ?? '') },
  { header: 'Invoice No', value: (r) => String(r.invoiceNo ?? '') },
  { header: 'Part Code', value: (r) => String(r.partNo) },
  { header: 'Part Name', value: (r) => String(r.partName), w: 2 },
  { header: 'Issued Qty', value: (r) => Number(r.quantity) },
  { header: 'Unit Price', value: (r) => Number(r.unitPrice) },
  { header: 'Discount %', value: (r) => (Number(r.discountPercent) > 0 ? Number(r.discountPercent) : '') },
  { header: 'Total Price', value: (r) => Number(r.totalPrice) },
  { header: 'Remarks', value: (r) => String(r.remarks ?? '') },
  { header: 'Unit Cost', value: (r) => Number(r.unitCost) },
  { header: 'Total Cost', value: (r) => Number(r.totalCost) },
  { header: 'Date', value: (r) => String(r.date) },
  { header: 'Vehicle', value: (r) => String(r.vehicle ?? '') },
  { header: 'Store', value: (r) => String(r.store) },
  { header: 'Issued by', value: (r) => String(r.issuedBy ?? '') },
];
