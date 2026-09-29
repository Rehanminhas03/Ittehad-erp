/** Mirrors backend PPF_COVERAGES / PPF_FINISHES (sales/models.ts). */
export const PPF_COVERAGES = [
  { value: 'full_body', label: 'Full body' },
  { value: 'front_package', label: 'Front package (bonnet, bumper, fenders, mirrors)' },
  { value: 'partial', label: 'Partial (selected panels)' },
  { value: 'custom', label: 'Custom' },
] as const;
export const PPF_FINISHES = [
  { value: 'gloss', label: 'Gloss' },
  { value: 'matte', label: 'Matte' },
] as const;

/** The PPF voucher's standard fields, in print order, with their default labels (the dealership's PPF format can rename them). */
export const PPF_VOUCHER_FIELDS = [
  { key: 'pbo', label: 'PBO', hideable: false },
  { key: 'customerName', label: 'Customer Name', hideable: false },
  { key: 'email', label: 'Email', hideable: true },
  { key: 'phone', label: 'Phone #', hideable: true },
  { key: 'chassis', label: 'Chassis', hideable: false },
  { key: 'engine', label: 'Engine', hideable: false },
  { key: 'vehicle', label: 'Vehicle', hideable: true },
  { key: 'salesExecutive', label: 'Sales Executive', hideable: true },
  { key: 'promiseDate', label: 'Promise Date', hideable: true },
  { key: 'ppf', label: 'PPF', hideable: true },
  { key: 'price', label: 'Price', hideable: false },
  { key: 'paid', label: 'Paid', hideable: false },
  { key: 'unpaid', label: 'Un-paid', hideable: false },
  { key: 'notes', label: 'Notes', hideable: true },
] as const;
export type PpfVoucherField = (typeof PPF_VOUCHER_FIELDS)[number]['key'];
