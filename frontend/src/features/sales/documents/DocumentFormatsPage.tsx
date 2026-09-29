import { useEffect, useMemo, useState } from 'react';
import { Button, ErrorState, Field, Input, PageHeader, Section, Select, Spinner, Textarea } from '@/shared/components/ui';
import { useAuth, usePermission, useToast } from '@/shared/hooks';
import { apiErrorMessage, apiFieldErrors, formatDateTime } from '@/shared/lib';
import { P } from '../permissions';
import { type DocumentTemplate, type QuotationDocument, useGetDocumentTemplateQuery, useSaveDocumentTemplateMutation } from '../salesApi';
import { EyeIcon, PdfDialog, usePdf } from './DocumentPreview';
import { buildQuotationPdf } from './pdf';
import { PpfFormatEditor } from './PpfFormatEditor';

type Form = {
  companyName: string;
  refPrefix: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  deliveryStation: string;
  defaultPaymentMode: string;
  defaultValidityDays: string;
  defaultDeliveryDays: string;
  highlightLine: string;
  standardEquipment: string;
  deliveryNotes: string;
  terms: string;
  closingLines: string;
  signOff: string;
};
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const blank = (s: string) => s.trim() || null;

function toForm(t: DocumentTemplate): Form {
  return {
    companyName: t.companyName,
    refPrefix: t.refPrefix ?? '',
    tagline: t.tagline ?? '',
    address: t.address ?? '',
    phone: t.phone ?? '',
    email: t.email ?? '',
    deliveryStation: t.deliveryStation ?? '',
    defaultPaymentMode: t.defaultPaymentMode ?? '',
    defaultValidityDays: String(t.defaultValidityDays),
    defaultDeliveryDays: t.defaultDeliveryDays != null ? String(t.defaultDeliveryDays) : '',
    highlightLine: t.highlightLine ?? '',
    standardEquipment: t.standardEquipment ?? '',
    deliveryNotes: t.deliveryNotes.join('\n'),
    terms: t.terms.join('\n'),
    closingLines: t.closingLines.join('\n'),
    signOff: t.signOff.join('\n'),
  };
}
function fromForm(f: Form) {
  return {
    companyName: f.companyName.trim(),
    refPrefix: blank(f.refPrefix),
    tagline: blank(f.tagline),
    address: blank(f.address),
    phone: blank(f.phone),
    email: blank(f.email),
    deliveryStation: blank(f.deliveryStation),
    defaultPaymentMode: blank(f.defaultPaymentMode),
    defaultValidityDays: Number(f.defaultValidityDays) || 7,
    defaultDeliveryDays: f.defaultDeliveryDays.trim() ? Number(f.defaultDeliveryDays) : null,
    highlightLine: blank(f.highlightLine),
    standardEquipment: blank(f.standardEquipment),
    deliveryNotes: lines(f.deliveryNotes),
    terms: lines(f.terms),
    closingLines: lines(f.closingLines),
    signOff: lines(f.signOff),
  };
}

/**
 * Document formats (Assistant Manager / Sales Manager), one tab each:
 *   - Quotation: letterhead, terms and conditions, sign-off (the letterhead is also the PPF voucher's).
 *   - PPF voucher: title, field labels, fields shown, the dealership's own fields, notes, signatures.
 * Every document of the dealership prints with the saved format; a sample preview shows changes first.
 */
export default function DocumentFormatsPage() {
  const perm = usePermission();
  const toast = useToast();
  const { user } = useAuth();
  const dealerships = perm.dealershipsFor(P.templatesManage);
  const [dealershipId, setDealershipId] = useState<number | undefined>(dealerships[0]?.id);
  const dealer = dealerships.find((d) => d.id === dealershipId);
  const [tab, setTab] = useState<'quotation' | 'ppf'>('quotation');
  const { data, isLoading, error, refetch } = useGetDocumentTemplateQuery({ kind: 'quotation', dealershipId: dealershipId! }, { skip: !dealershipId, refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useSaveDocumentTemplateMutation();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  // Sample quotation drawn with the (unsaved) format.
  const build = useMemo(() => {
    if (!previewing || !form || !dealer || !data) return null;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const valid = new Date(Date.now() + (Number(form.defaultValidityDays) || 7) * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const sample: QuotationDocument = {
      quotationNo: `${dealer.code}-QT-SAMPLE`,
      variantCode: 'NX4FL16THAW',
      validUntil: valid,
      billTo: 'Sample Customer (Pvt) Ltd',
      deliveryDays: form.defaultDeliveryDays.trim() ? Number(form.defaultDeliveryDays) : null,
      paymentMode: null,
      template: { ...data, ...fromForm(form) },
      issuedAt: `${today}T09:00:00+05:00`,
      updatedAt: `${today}T09:00:00+05:00`,
      dealership: { name: dealer.name, code: dealer.code, brand: dealer.brand, address: null, city: null, phone: null },
      customer: { name: 'Sample Customer', mobile: '03001234567', email: null },
      salesperson: { name: user?.fullName ?? 'Sales Executive', phone: null, email: user?.email ?? '' },
      vehicle: { model: `${dealer.brand} Tucson`, variant: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE', color: 'White', vin: null, engineNo: null },
      orderNo: null,
      createdByName: null,
      updatedByName: null,
      notes: null,
      pricing: { quantity: 1, unitPrice: '12240000', discount: '0', freightInsurance: '68000', withholdingTax: '246160', withholdingTaxNonFiler: '1311450', total: '12554160', bookingAmount: null },
    };
    return () => buildQuotationPdf(sample);
  }, [previewing, form, dealer, data, user]);
  const pdf = usePdf(build);

  const submit = async () => {
    if (!form || !dealershipId) return;
    setErrors({});
    try {
      await save({ kind: 'quotation', documentTemplateUpdate: { dealershipId, ...fromForm(form) } }).unwrap();
      toast.success('Format saved — every quotation now prints with it');
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path.split('.')[0]!, i.message])));
      else toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader title="Document formats" subtitle="How the quotation and the PPF voucher print. Every document of the dealership prints with the saved format." />
      <div className="glass-soft mb-5 inline-flex rounded-xl p-1" role="tablist" aria-label="Document">
        {(
          [
            ['quotation', 'Quotation'],
            ['ppf', 'PPF voucher'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="fmt-dealership">
            <Select id="fmt-dealership" value={dealershipId ?? ''} onChange={(e) => setDealershipId(Number(e.target.value))}>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {tab === 'quotation' && data && (
          <p className="pb-2 text-sm text-slate-600">
            {data.isDefault ? 'Using the built-in format (not changed yet).' : `Last changed ${data.updatedAt ? formatDateTime(data.updatedAt) : ''} by ${data.updatedByName ?? '—'}.`}
          </p>
        )}
      </div>

      {tab === 'ppf' ? (
        dealer && <PpfFormatEditor key={dealer.id} dealer={dealer} />
      ) : error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading || !form ? (
        <Spinner className="mx-auto my-10 size-6 text-slate-400" />
      ) : (
        <>
          <Section title="Letterhead">
            <p className="mb-4 text-sm text-slate-600">The {dealer?.brand} logo is printed at the top left and the Ittehad logo at the top right.</p>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor="fmt-company" required error={errors.companyName}>
                <Input id="fmt-company" value={form.companyName} onChange={set('companyName')} invalid={!!errors.companyName} />
              </Field>
              <Field label="Ref prefix" htmlFor="fmt-ref" hint="Ref = prefix / variant code / date, e.g. HI/NX4FL16THAW/26-09-26. Empty: the quotation number.">
                <Input id="fmt-ref" value={form.refPrefix} onChange={set('refPrefix')} placeholder="HI" />
              </Field>
              <Field label="Tagline" htmlFor="fmt-tagline">
                <Input id="fmt-tagline" value={form.tagline} onChange={set('tagline')} placeholder="(An Ittehad Steel Company)" />
              </Field>
              <Field label="Address" htmlFor="fmt-address" className="sm:col-span-2">
                <Input id="fmt-address" value={form.address} onChange={set('address')} />
              </Field>
              <Field label="Tel" htmlFor="fmt-phone">
                <Input id="fmt-phone" value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="E-mail" htmlFor="fmt-email">
                <Input id="fmt-email" value={form.email} onChange={set('email')} />
              </Field>
            </div>
          </Section>

          <Section title="Quotation details">
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Validity (days)" htmlFor="fmt-validity" hint="Default for new quotations" error={errors.defaultValidityDays}>
                <Input id="fmt-validity" type="number" min={1} max={60} value={form.defaultValidityDays} onChange={set('defaultValidityDays')} />
              </Field>
              <Field label="Tentative delivery period (days)" htmlFor="fmt-delivery" hint="Default for new quotations" error={errors.defaultDeliveryDays}>
                <Input id="fmt-delivery" type="number" min={0} max={365} value={form.defaultDeliveryDays} onChange={set('defaultDeliveryDays')} />
              </Field>
              <Field label="Delivery station" htmlFor="fmt-station">
                <Input id="fmt-station" value={form.deliveryStation} onChange={set('deliveryStation')} />
              </Field>
              <Field label="Payment mode" htmlFor="fmt-payment" hint="Default for new quotations">
                <Input id="fmt-payment" value={form.defaultPaymentMode} onChange={set('defaultPaymentMode')} />
              </Field>
              <Field label="Standard equipment" htmlFor="fmt-equipment">
                <Input id="fmt-equipment" value={form.standardEquipment} onChange={set('standardEquipment')} placeholder="As per Brochure" />
              </Field>
              <Field label="Highlighted line" htmlFor="fmt-highlight">
                <Input id="fmt-highlight" value={form.highlightLine} onChange={set('highlightLine')} />
              </Field>
              <Field label="Delivery lines (one per line)" htmlFor="fmt-delivery-notes" className="sm:col-span-2" error={errors.deliveryNotes}>
                <Textarea id="fmt-delivery-notes" rows={3} value={form.deliveryNotes} onChange={set('deliveryNotes')} />
              </Field>
            </div>
          </Section>

          <Section title="Terms & conditions">
            <p className="mb-3 text-sm text-slate-600">
              One term per line. Write <code className="rounded bg-slate-100 px-1">**text**</code> for bold. <code className="rounded bg-slate-100 px-1">{'{vehicle}'}</code> prints the
              vehicle and <code className="rounded bg-slate-100 px-1">{'{nonFilerTax}'}</code> the non-filer withholding tax (the line is left out when none is entered). A line
              starting <code className="rounded bg-slate-100 px-1">[Hybrid only]</code> prints only for hybrid vehicles.
            </p>
            <Field label="Terms" htmlFor="fmt-terms" error={errors.terms}>
              <Textarea id="fmt-terms" rows={14} value={form.terms} onChange={set('terms')} />
            </Field>
            <Field label="Closing lines (bold, one per line)" htmlFor="fmt-closing" className="mt-4" error={errors.closingLines}>
              <Textarea id="fmt-closing" rows={3} value={form.closingLines} onChange={set('closingLines')} />
            </Field>
            <Field label="Sign-off (one per line; lines after the first are bold)" htmlFor="fmt-signoff" className="mt-4" error={errors.signOff}>
              <Textarea id="fmt-signoff" rows={2} value={form.signOff} onChange={set('signOff')} />
            </Field>
          </Section>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => data && setForm(toForm(data))}>
              Undo changes
            </Button>
            <Button variant="secondary" onClick={() => setPreviewing(true)}>
              <EyeIcon className="size-4" />
              Preview a sample quotation
            </Button>
            <Button loading={saving} onClick={submit}>
              Save format
            </Button>
          </div>
          {previewing && <PdfDialog open onClose={() => setPreviewing(false)} title="Sample quotation" pdf={pdf} loading={!pdf} />}
        </>
      )}
    </div>
  );
}
