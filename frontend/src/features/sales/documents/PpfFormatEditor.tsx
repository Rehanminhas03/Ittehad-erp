import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, ErrorState, Field, Input, Section, Spinner, Textarea } from '@/shared/components/ui';
import { useAuth, useToast } from '@/shared/hooks';
import { apiErrorMessage, apiFieldErrors, formatDateTime } from '@/shared/lib';
import { type DocumentTemplate, type PpfDocument, useGetDocumentTemplateQuery, useSaveDocumentTemplateMutation } from '../salesApi';
import { EyeIcon, PdfDialog, usePdf } from './DocumentPreview';
import { PPF_VOUCHER_FIELDS } from './labels';
import { buildPpfPdf } from './pdf';

type Dealer = { id: number; name: string; code: string; brand: string };
type Form = { title: string; labels: Record<string, string>; hidden: string[]; customFields: string[]; terms: string; signOff: string };
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const named = (names: string[]) => names.map((n) => n.trim()).filter(Boolean);
const MAX_CUSTOM = 10;

function toForm(t: DocumentTemplate): Form {
  return {
    title: t.title ?? 'PPF Voucher',
    labels: { ...(t.fieldLabels ?? {}) },
    hidden: [...(t.hiddenFields ?? [])],
    customFields: [...(t.customFields ?? [])],
    terms: t.terms.join('\n'),
    signOff: t.signOff.join('\n'),
  };
}

/**
 * The PPF voucher's format (Assistant Manager / Sales Manager): its title, the label of each field,
 * which optional fields print, the dealership's own extra fields (salespeople fill them in on the
 * voucher), notes and signature lines. The letterhead comes from the quotation format.
 */
export function PpfFormatEditor({ dealer }: { dealer: Dealer }) {
  const toast = useToast();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useGetDocumentTemplateQuery({ kind: 'ppf', dealershipId: dealer.id }, { refetchOnMountOrArgChange: true });
  const { data: letterhead } = useGetDocumentTemplateQuery({ kind: 'quotation', dealershipId: dealer.id });
  const [save, { isLoading: saving }] = useSaveDocumentTemplateMutation();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const fields = (f: Form) => ({
    title: f.title.trim() || null,
    // Only labels that differ from the standard ones.
    fieldLabels: Object.fromEntries(
      Object.entries(f.labels)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([k, v]) => v && v !== PPF_VOUCHER_FIELDS.find((x) => x.key === k)?.label),
    ),
    hiddenFields: f.hidden as DocumentTemplate['hiddenFields'],
    customFields: named(f.customFields),
    terms: lines(f.terms),
    signOff: lines(f.signOff),
  });

  const build = useMemo(() => {
    if (!previewing || !form || !data || !letterhead) return null;
    const custom = named(form.customFields);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const sample: PpfDocument = {
      formNo: `${dealer.code}-PF-SAMPLE`,
      pboNo: 'SO-SAMPLE-0001',
      template: letterhead,
      ppfTemplate: { ...data, ...fields(form) },
      extraFields: Object.fromEntries(custom.map((c) => [c, '(filled in by the salesperson)'])),
      issuedAt: `${today}T09:00:00+05:00`,
      updatedAt: `${today}T09:00:00+05:00`,
      dealership: { name: dealer.name, code: dealer.code, brand: dealer.brand, address: null, city: null, phone: null },
      customer: { name: 'Sample Customer', mobile: '03001234567', email: 'customer@example.com' },
      salesperson: { name: user?.fullName ?? 'Sales Executive', phone: null, email: user?.email ?? '' },
      vehicle: { model: `${dealer.brand} Tucson`, variant: 'HEV AWD Signature', color: 'White', vin: 'MALPC81BLRM123456', engineNo: 'G4FL889900' },
      orderNo: 'SO-SAMPLE-0001',
      createdByName: null,
      updatedByName: null,
      notes: null,
      coverage: 'full_body',
      coverageDetails: null,
      filmBrand: 'XPEL',
      finish: 'gloss',
      warrantyYears: 5,
      installationDate: today,
      pricing: { amount: '350000', discount: '20000', total: '330000', advancePaid: '100000', balance: '230000' },
    };
    return () => buildPpfPdf(sample);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, form, data, letterhead, dealer, user]);
  const pdf = usePdf(build);

  if (error) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (isLoading || !form || !data) return <Spinner className="mx-auto my-10 size-6 text-slate-400" />;

  const submit = async () => {
    setErrors({});
    const { dealershipId: _d, kind: _k, isDefault: _i, updatedAt: _u, updatedByName: _n, ...current } = data;
    try {
      await save({ kind: 'ppf', documentTemplateUpdate: { ...current, dealershipId: dealer.id, ...fields(form) } }).unwrap();
      toast.success('PPF voucher format saved — every voucher now prints with it');
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path.split('.')[0]!, i.message])));
      else toast.error(e);
    }
  };
  const toggle = (key: string, show: boolean) => setForm((f) => (f ? { ...f, hidden: show ? f.hidden.filter((h) => h !== key) : [...f.hidden, key] } : f));

  return (
    <>
      <Section title="Voucher">
        <p className="mb-4 text-sm text-slate-600">
          {data.isDefault ? 'Using the built-in format (not changed yet). ' : `Last changed ${data.updatedAt ? formatDateTime(data.updatedAt) : ''} by ${data.updatedByName ?? '—'}. `}
          The letterhead (logos, company name, address) is the one in the Quotation format.
        </p>
        <Field label="Title" htmlFor="ppf-fmt-title" error={errors.title}>
          <Input id="ppf-fmt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="PPF Voucher" />
        </Field>
      </Section>

      <Section title="Fields">
        <p className="mb-3 text-sm text-slate-600">Rename a field, or untick it to leave it off the voucher. PBO, customer, chassis, engine and the amounts always print.</p>
        <div className="divide-y divide-slate-100">
          {PPF_VOUCHER_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-1 items-center gap-2 py-2 sm:grid-cols-[10rem_1fr_9rem]">
              <span className="text-sm text-slate-500">{f.label}</span>
              <Input aria-label={`Label for ${f.label}`} value={form.labels[f.key] ?? ''} placeholder={f.label} onChange={(e) => setForm({ ...form, labels: { ...form.labels, [f.key]: e.target.value } })} />
              {f.hideable ? (
                <Checkbox label="Show" checked={!form.hidden.includes(f.key)} onChange={(e) => toggle(f.key, e.target.checked)} />
              ) : (
                <span className="text-xs text-slate-400">Always printed</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-medium text-slate-800">Your own fields</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Printed on the voucher before the price; salespeople fill them in on each voucher, e.g. Film roll no., Installer name. Up to {MAX_CUSTOM}.
          </p>
          <div className="mt-3 space-y-2">
            {form.customFields.map((name, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  aria-label={`Your field ${i + 1}`}
                  value={name}
                  placeholder="Field name, e.g. Film roll no."
                  autoFocus={i === form.customFields.length - 1 && name === ''}
                  onChange={(e) => setForm({ ...form, customFields: form.customFields.map((n, j) => (j === i ? e.target.value : n)) })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${name || `field ${i + 1}`}`}
                  onClick={() => setForm({ ...form, customFields: form.customFields.filter((_, j) => j !== i) })}
                >
                  Remove
                </Button>
              </div>
            ))}
            {!form.customFields.length && <p className="text-sm text-slate-400">No fields of your own yet.</p>}
          </div>
          {errors.customFields && <p className="mt-2 text-sm text-red-600">{errors.customFields}</p>}
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            disabled={form.customFields.length >= MAX_CUSTOM}
            onClick={() => setForm({ ...form, customFields: [...form.customFields, ''] })}
          >
            + Add field
          </Button>
        </div>
      </Section>

      <Section title="Notes and signatures">
        <Field label="Notes printed on the voucher (one per line)" htmlFor="ppf-fmt-terms" error={errors.terms} hint="e.g. Do not wash the car for 48 hours. Write **text** for bold.">
          <Textarea id="ppf-fmt-terms" rows={3} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} />
        </Field>
        <Field label="Signature lines (one per line)" htmlFor="ppf-fmt-sign" className="mt-4" error={errors.signOff} hint="e.g. Manager Sign, Customer Sign. Up to 4.">
          <Textarea id="ppf-fmt-sign" rows={2} value={form.signOff} onChange={(e) => setForm({ ...form, signOff: e.target.value })} />
        </Field>
      </Section>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setForm(toForm(data))}>
          Undo changes
        </Button>
        <Button variant="secondary" disabled={!letterhead} onClick={() => setPreviewing(true)}>
          <EyeIcon className="size-4" />
          Preview a sample voucher
        </Button>
        <Button loading={saving} onClick={submit}>
          Save format
        </Button>
      </div>
      {previewing && <PdfDialog open onClose={() => setPreviewing(false)} title="Sample PPF voucher" pdf={pdf} loading={!pdf} />}
    </>
  );
}
