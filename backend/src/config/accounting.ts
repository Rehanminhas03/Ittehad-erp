/**
 * Accounting configuration. Automatic postings refer to accounts by ROLE, never by id or code, so
 * a dealership can renumber or rename its chart freely. Every dealership gets this template the
 * first time it posts; accountants can add accounts afterwards.
 */
export const ACCOUNT_ROLES = [
  'cash',
  'bank',
  'receivables',
  'parts_inventory',
  'vehicle_inventory',
  'payables',
  'output_tax',
  'vehicle_sales',
  'labour_sales',
  'parts_sales',
  'other_sales',
  'parts_cost',
  'stock_adjustments',
] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const CHART_TEMPLATE: { code: string; name: string; type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'; role?: AccountRole }[] = [
  { code: '1000', name: 'Cash in hand', type: 'asset', role: 'cash' },
  { code: '1010', name: 'Bank', type: 'asset', role: 'bank' },
  { code: '1100', name: 'Accounts receivable', type: 'asset', role: 'receivables' },
  { code: '1200', name: 'Parts inventory', type: 'asset', role: 'parts_inventory' },
  { code: '1210', name: 'Vehicle inventory', type: 'asset', role: 'vehicle_inventory' },
  { code: '2000', name: 'Accounts payable', type: 'liability', role: 'payables' },
  { code: '2100', name: 'Sales tax payable', type: 'liability', role: 'output_tax' },
  { code: '3000', name: "Owner's equity", type: 'equity' },
  { code: '4000', name: 'Vehicle sales', type: 'income', role: 'vehicle_sales' },
  { code: '4100', name: 'Service labour', type: 'income', role: 'labour_sales' },
  { code: '4200', name: 'Parts sales', type: 'income', role: 'parts_sales' },
  { code: '4900', name: 'Other income', type: 'income', role: 'other_sales' },
  { code: '5000', name: 'Cost of parts sold', type: 'expense', role: 'parts_cost' },
  { code: '5200', name: 'Stock adjustments', type: 'expense', role: 'stock_adjustments' },
  { code: '6000', name: 'General expenses', type: 'expense' },
];

/** Revenue account role per invoice line kind. */
export const REVENUE_ROLE: Record<'vehicle' | 'labour' | 'part' | 'other', AccountRole> = {
  vehicle: 'vehicle_sales',
  labour: 'labour_sales',
  part: 'parts_sales',
  other: 'other_sales',
};

/**
 * Sales tax % added on top of each invoice line kind. Defaults to confirm with the finance team:
 * goods (parts) 18% GST, services (labour) 16%, vehicles 0% (priced tax-inclusive).
 */
export const TAX_RATES: Record<'vehicle' | 'labour' | 'part' | 'other', string> = {
  vehicle: '0',
  labour: '16',
  part: '18',
  other: '0',
};

/** Days until an invoice is due. */
export const INVOICE_DUE_DAYS = 0;
