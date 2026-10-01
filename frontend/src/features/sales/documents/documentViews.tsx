import { useState } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button, Input } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { type CustomFieldProps, dealershipFilter, type EntityViewConfig, type FilterDef, mono, money, muted, optionalDate, optionalText, strong } from '@/shared/entity';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib';
import { P } from '../permissions';
import {
  type PpfForm,
  type Quotation,
  useGetDocumentTemplateQuery,
  useGetPpfFormHistoryQuery,
  useGetPpfFormQuery,
  useGetQuotationHistoryQuery,
  useGetQuotationQuery,
  useListPpfFormsQuery,
  useListQuotationsQuery,
  useListSalesTeamMembersQuery,
  useListVariantCodesQuery,
  useUpdatePpfFormMutation,
  useUpdateQuotationMutation,
} from '../salesApi';
import { type DocKind, DocumentPreview, DownloadIcon, EyeIcon, PrintIcon } from './DocumentPreview';
import { PPF_COVERAGES, PPF_FINISHES } from './labels';

/** Jetour staff: their quotations print a delivery period sentence instead of a number of days. */
const isJetourStaff = (perm: ReturnType<typeof usePermission>) =>
  [P.quotationsViewAll, P.quotationsViewOwn].flatMap((c) => perm.dealershipsFor(c)).some((d) => d.brand === 'Jetour');

/** Salesperson filter for team views (the dealership's sales staff). */
function useSalespersonOptions() {
  const perm = usePermission();
  const dealershipId = [P.quotationsViewAll, P.ppfViewAll].flatMap((c) => perm.dealershipsFor(c))[0]?.id;
  const { data } = useListSalesTeamMembersQuery({ dealershipId: dealershipId ?? 0 }, { skip: !dealershipId });
  return (data ?? []).map((m) => ({ value: String(m.id), label: m.fullName }));
}
/** The dealership's active variant codes (Hyundai), for the quotation edit form. */
function useVariantCodeOptions() {
  const perm = usePermission();
  const dealershipId = perm.dealershipsFor(P.variantsView)[0]?.id;
  const { data } = useListVariantCodesQuery({ dealershipId, isActive: 'true', pageSize: 100, sort: 'code' }, { skip: !dealershipId });
  return (data?.items ?? []).map((c) => ({ value: c.code, label: `${c.code} — ${c.description}` }));
}
const salespersonFilter: FilterDef = { param: 'ownerId', label: 'Salesperson', type: 'select', useOptions: useSalespersonOptions };
const teamOnly = (codes: string[]) => (perm: { can: (c: string[]) => boolean }) => perm.can(codes);

/** "Created by Ali · changed by Sara" — who issued the document and who last corrected it. */
const trail = (d: Quotation | PpfForm) => (
  <span className="text-slate-600">
    {d.createdByName ?? '—'}
    {d.updatedById && d.updatedById !== d.createdById && d.updatedAt !== d.createdAt ? <span className="text-slate-500"> · changed by {d.updatedByName}</span> : null}
  </span>
);
const whoFields = <T extends Quotation | PpfForm>() => [
  { label: 'Created', value: (d: T) => `${formatDateTime(d.createdAt)} by ${d.createdByName ?? '—'}` },
  { label: 'Last changed', value: (d: T) => (d.updatedAt !== d.createdAt ? `${formatDateTime(d.updatedAt)} by ${d.updatedByName ?? '—'}` : 'Not changed since it was created') },
  { label: 'Lead', value: (d: T) => <Link to={`/sales/leads/${d.leadId}`} className="text-brand-700 hover:underline">{d.customerName ?? 'Open lead'}</Link> },
];

/** View (check before it goes out), then download or print — on the document's own page. */
function DocumentActions({ kind, id }: { kind: DocKind; id: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 flex flex-wrap justify-end gap-2">
      <Button onClick={() => setOpen(true)}>
        <EyeIcon className="size-4" />
        View
        <span className="text-white/60">·</span>
        <DownloadIcon className="size-4" />
        <PrintIcon className="size-4" />
      </Button>
      {open && <DocumentPreview kind={kind} id={id} open onClose={() => setOpen(false)} />}
    </div>
  );
}

/** A list-row icon that opens the preview (download / print from there). */
function PreviewIcon({ kind, id, label }: { kind: DocKind; id: number; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label={`View, download or print ${label}`}
        title="View · Download · Print"
      >
        <DownloadIcon className="size-5" />
      </button>
      {open && <DocumentPreview kind={kind} id={id} open onClose={() => setOpen(false)} />}
    </span>
  );
}

/** Empty -> null (e.g. no booking amount). */
const optionalMoney = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v ?? '').trim().replace(/,/g, ''))
    .refine((v) => v === '' || /^\d{1,12}(\.\d{1,2})?$/.test(v), label + ' must be a number with up to 2 decimals')
    .transform((v) => (v === '' ? null : v));

const dateRange = { label: 'Issued', fromParam: 'createdFrom', toParam: 'createdTo' };

export const quotationView: EntityViewConfig<Quotation> = {
  singular: 'Quotation',
  plural: 'Vehicle quotations',
  basePath: '/sales/quotations',
  entityType: 'sales.quotation',
  // Issued from a lead (Quotations & PPF on the lead); corrected here.
  permissions: { view: [P.quotationsViewAll, P.quotationsViewOwn], update: [P.quotationsUpdate, P.quotationsUpdateOwn] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'ownerId',
  list: {
    defaultSort: '-createdAt',
    dateRange,
    searchPlaceholder: 'Search quotation number',
    filters: [salespersonFilter, dealershipFilter],
    columns: [
      { key: 'quotationNo', header: 'Quotation', sortKey: 'quotationNo', render: (q) => mono(q.quotationNo) },
      { key: 'customerName', header: 'Customer', render: (q) => strong(q.customerName) },
      { key: 'modelName', header: 'Vehicle', render: (q) => [q.modelName, q.variant, q.color].filter(Boolean).join(' · ') },
      { key: 'totalAmount', header: 'Total', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (q) => formatMoney(q.totalAmount) },
      { key: 'ownerName', header: 'Salesperson', render: (q) => muted(q.ownerName), visible: teamOnly([P.quotationsViewAll]) },
      { key: 'createdByName', header: 'Created / changed by', render: trail },
      { key: 'createdAt', header: 'Issued', sortKey: 'createdAt', render: (q) => formatDate(q.createdAt) },
      { key: 'validUntil', header: 'Valid until', sortKey: 'validUntil', render: (q) => formatDate(q.validUntil) },
      { key: 'pdf', header: 'PDF', className: 'w-px text-right', render: (q) => <PreviewIcon kind="quotation" id={q.id} label={q.quotationNo} /> },
    ],
  },
  detail: {
    title: (q) => q.quotationNo,
    subtitle: (q) => `${q.customerName ?? ''} · ${q.modelName ?? ''}`,
    fields: [
      { label: 'Customer', value: (q) => q.customerName },
      { label: 'To', value: (q) => q.billTo },
      { label: 'Salesperson', value: (q) => q.ownerName },
      { label: 'Vehicle', value: (q) => [q.modelName, q.variant, q.color].filter(Boolean).join(' · ') },
      { label: 'Variant code', value: (q) => q.variantCode },
      { label: 'Quantity', value: (q) => q.quantity },
      { label: 'Price', value: (q) => formatMoney(q.unitPrice) },
      { label: 'Discount', value: (q) => formatMoney(q.discount) },
      { label: 'Freight & transit insurance', value: (q) => formatMoney(q.freightInsurance) },
      { label: 'Withholding tax (filer)', value: (q) => formatMoney(q.withholdingTax) },
      { label: 'Withholding tax (non-filer)', value: (q) => formatMoney(q.withholdingTaxNonFiler) },
      { label: 'Total', value: (q) => <span className="font-semibold">{formatMoney(q.totalAmount)}</span> },
      { label: 'Booking amount', value: (q) => formatMoney(q.bookingAmount) },
      { label: 'Valid until', value: (q) => formatDate(q.validUntil) },
      { label: 'Tentative delivery', value: (q) => q.deliveryPeriod ?? (q.deliveryDays != null ? `${q.deliveryDays} days` : null) },
      { label: 'Payment mode', value: (q) => q.paymentMode },
      { label: 'Notes', value: (q) => q.notes },
      ...whoFields<Quotation>(),
    ],
    sections: (q) => <DocumentActions kind="quotation" id={q.id} />,
  },
  form: {
    fields: [
      { name: 'billTo', label: 'To', type: 'text', span: 2, hint: "Empty: the customer's name" },
      { name: 'variantCode', label: 'Variant code', type: 'select', span: 2, useOptions: useVariantCodeOptions, hint: 'Hyundai: picking a code sets the printed description' },
      { name: 'unitPrice', label: 'Price (PKR)', type: 'money', required: true },
      { name: 'discount', label: 'Discount (PKR)', type: 'money', hint: 'Limited by the group discount policy' },
      { name: 'freightInsurance', label: 'Freight & transit insurance (PKR)', type: 'money' },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true },
      { name: 'withholdingTax', label: 'Withholding tax — filer (PKR)', type: 'money' },
      { name: 'withholdingTaxNonFiler', label: 'Withholding tax — non-filer (PKR)', type: 'money' },
      { name: 'variant', label: 'Variant', type: 'text' },
      { name: 'color', label: 'Colour', type: 'text' },
      { name: 'bookingAmount', label: 'Booking amount (PKR)', type: 'money' },
      { name: 'validUntil', label: 'Valid until', type: 'date', required: true },
      { name: 'deliveryDays', label: 'Tentative delivery (days)', type: 'number', visible: (perm) => !isJetourStaff(perm) },
      { name: 'deliveryPeriod', label: 'Tentative delivery period', type: 'text', hint: 'e.g. ONE MONTH AFTER FULL PAYMENT.', visible: isJetourStaff },
      { name: 'paymentMode', label: 'Payment mode', type: 'text' },
      { name: 'notes', label: 'Notes on the quotation', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({
      billTo: optionalText(200),
      variantCode: optionalText(40),
      unitPrice: money('Price'),
      discount: money('Discount'),
      freightInsurance: money('Freight & insurance'),
      quantity: z.coerce.number().int().min(1, 'At least 1').max(50),
      withholdingTax: money('Withholding tax'),
      withholdingTaxNonFiler: optionalMoney('Withholding tax (non-filer)'),
      deliveryDays: z.union([z.literal('').transform(() => null), z.coerce.number().int().min(0).max(365)]).nullish(),
      deliveryPeriod: optionalText(120),
      paymentMode: optionalText(80),
      variant: optionalText(160),
      color: optionalText(40),
      bookingAmount: optionalMoney('Booking amount'),
      validUntil: z.string().min(1, 'Choose a date'),
      notes: optionalText(1000),
    }),
  },
  api: {
    useList: useListQuotationsQuery,
    useGet: useGetQuotationQuery,
    useHistory: useGetQuotationHistoryQuery,
    update: { useMutation: useUpdateQuotationMutation, toArg: (id, v) => ({ id, quotationUpdate: v }) },
  },
};

/** The dealership's own voucher fields (PPF format), for correcting a voucher. */
function ExtraFieldsInput({ id, value, onChange }: CustomFieldProps) {
  const perm = usePermission();
  const dealershipId = [P.ppfUpdate, P.ppfUpdateOwn].flatMap((c) => perm.dealershipsFor(c))[0]?.id;
  const { data: format } = useGetDocumentTemplateQuery({ kind: 'ppf', dealershipId: dealershipId ?? 0 }, { skip: !dealershipId });
  const values = (value as Record<string, string> | null) ?? {};
  // Fields in the format, plus any older ones that still have a value on this voucher.
  const names = [...new Set([...(format?.customFields ?? []), ...Object.keys(values)])];
  if (!names.length) return <p className="text-sm text-slate-500">This dealership's PPF voucher has no extra fields.</p>;
  return (
    <div id={id} className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
      {names.map((name, i) => (
        <label key={name} className="text-sm font-medium text-slate-700">
          {name}
          <Input className="mt-1.5" id={`${id}-${i}`} value={values[name] ?? ''} onChange={(e) => onChange({ ...values, [name]: e.target.value })} />
        </label>
      ))}
    </div>
  );
}

export const ppfView: EntityViewConfig<PpfForm> = {
  singular: 'PPF voucher',
  plural: 'PPF vouchers',
  basePath: '/sales/ppf-forms',
  entityType: 'sales.ppf_form',
  permissions: { view: [P.ppfViewAll, P.ppfViewOwn], update: [P.ppfUpdate, P.ppfUpdateOwn] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'ownerId',
  list: {
    defaultSort: '-createdAt',
    dateRange,
    searchPlaceholder: 'Search PPF voucher number',
    filters: [salespersonFilter, dealershipFilter],
    columns: [
      { key: 'formNo', header: 'Voucher', sortKey: 'formNo', render: (f) => mono(f.formNo) },
      { key: 'customerName', header: 'Customer', render: (f) => strong(f.customerName) },
      { key: 'coverage', header: 'Coverage', render: (f) => PPF_COVERAGES.find((c) => c.value === f.coverage)?.label.replace(/ \(.*\)$/, '') },
      { key: 'totalAmount', header: 'Price', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (f) => formatMoney(f.totalAmount) },
      { key: 'advancePaid', header: 'Paid', className: 'text-right tabular-nums', render: (f) => muted(formatMoney(f.advancePaid)) },
      { key: 'ownerName', header: 'Salesperson', render: (f) => muted(f.ownerName), visible: teamOnly([P.ppfViewAll]) },
      { key: 'createdByName', header: 'Created / changed by', render: trail },
      { key: 'createdAt', header: 'Sold on', sortKey: 'createdAt', render: (f) => formatDate(f.createdAt) },
      { key: 'installationDate', header: 'Promise date', sortKey: 'installationDate', render: (f) => formatDate(f.installationDate) },
      { key: 'pdf', header: 'PDF', className: 'w-px text-right', render: (f) => <PreviewIcon kind="ppf" id={f.id} label={f.formNo} /> },
    ],
  },
  detail: {
    title: (f) => f.formNo,
    subtitle: (f) => `${f.customerName ?? ''} · Paint Protection Film`,
    fields: [
      { label: 'Customer', value: (f) => f.customerName },
      { label: 'Sales executive', value: (f) => f.ownerName },
      { label: 'PBO / CBO no.', value: (f) => f.pboNo },
      { label: 'Chassis', value: (f) => f.chassisNo },
      { label: 'Engine', value: (f) => f.engineNo },
      { label: 'Coverage', value: (f) => PPF_COVERAGES.find((c) => c.value === f.coverage)?.label },
      { label: 'Panels', value: (f) => f.coverageDetails },
      { label: 'Finish', value: (f) => PPF_FINISHES.find((c) => c.value === f.finish)?.label },
      { label: 'Film brand', value: (f) => f.filmBrand },
      { label: 'Warranty', value: (f) => (f.warrantyYears != null ? `${f.warrantyYears} years` : null) },
      { label: 'Amount', value: (f) => formatMoney(f.amount) },
      { label: 'Discount', value: (f) => formatMoney(f.discount) },
      { label: 'Price', value: (f) => <span className="font-semibold">{formatMoney(f.totalAmount)}</span> },
      { label: 'Paid', value: (f) => formatMoney(f.advancePaid) },
      { label: 'Un-paid', value: (f) => <span className="font-semibold">{formatMoney(String(Number(f.totalAmount) - Number(f.advancePaid)))}</span> },
      { label: 'Promise date', value: (f) => formatDate(f.installationDate) },
      {
        label: 'Other fields',
        value: (f) => {
          const entries = Object.entries(f.extraFields ?? {});
          return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join(' · ') : null;
        },
      },
      { label: 'Notes', value: (f) => f.notes },
      ...whoFields<PpfForm>(),
    ],
    sections: (f) => <DocumentActions kind="ppf" id={f.id} />,
  },
  form: {
    fields: [
      // Required once the lead has a sales order (the server checks); may be blank before.
      { name: 'pboNo', label: 'PBO / CBO no.', type: 'text', hint: 'Required once the sales order is raised' },
      { name: 'chassisNo', label: 'Chassis', type: 'text', hint: 'Required once the sales order is raised' },
      { name: 'engineNo', label: 'Engine', type: 'text', hint: 'Required once the sales order is raised' },
      { name: 'extraFields', label: 'Other voucher fields', type: 'custom', span: 2, render: (p) => <ExtraFieldsInput {...p} /> },
      { name: 'coverage', label: 'Coverage', type: 'select', required: true, options: [...PPF_COVERAGES] },
      { name: 'finish', label: 'Finish', type: 'select', required: true, options: [...PPF_FINISHES] },
      { name: 'coverageDetails', label: 'Panels covered', type: 'text', span: 2 },
      { name: 'filmBrand', label: 'Film brand', type: 'text' },
      { name: 'warrantyYears', label: 'Warranty (years)', type: 'number' },
      { name: 'amount', label: 'Price before discount (PKR)', type: 'money', required: true },
      { name: 'discount', label: 'Discount (PKR)', type: 'money' },
      { name: 'advancePaid', label: 'Paid (PKR)', type: 'money' },
      { name: 'installationDate', label: 'Promise date', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({
      pboNo: optionalText(40),
      chassisNo: optionalText(40),
      engineNo: optionalText(40),
      extraFields: z.record(z.string(), z.string()).optional(),
      coverage: z.enum(PPF_COVERAGES.map((c) => c.value) as [string, ...string[]]),
      finish: z.enum(PPF_FINISHES.map((c) => c.value) as [string, ...string[]]),
      coverageDetails: optionalText(500),
      filmBrand: optionalText(80),
      warrantyYears: z.union([z.literal('').transform(() => null), z.coerce.number().int().min(0, '0-15 years').max(15, '0-15 years')]).nullish(),
      amount: money('PPF amount'),
      discount: money('Discount'),
      advancePaid: money('Advance'),
      installationDate: optionalDate(),
      notes: optionalText(1000),
    }),
  },
  api: {
    useList: useListPpfFormsQuery,
    useGet: useGetPpfFormQuery,
    useHistory: useGetPpfFormHistoryQuery,
    update: { useMutation: useUpdatePpfFormMutation, toArg: (id, v) => ({ id, ppfFormUpdate: v }) },
  },
};
