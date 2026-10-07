import { useEffect, useMemo, useState } from 'react';
import { Button, ErrorState, Field, Input, Section, Spinner, Textarea } from '@/shared/components/ui';
import { useAuth, useToast } from '@/shared/hooks';
import { apiErrorMessage, apiFieldErrors, formatDateTime } from '@/shared/lib';
import { type DocumentTemplate, type LeaveDocument, useGetDocumentTemplateQuery, useSaveDocumentTemplateMutation } from '../salesApi';
import { EyeIcon, PdfDialog, usePdf } from './DocumentPreview';
import { buildLeavePdf } from './pdf';

type Dealer = { id: number; name: string; code: string; brand: string };
type Form = { heading: string; title: string; english: string; urdu: string; signOff: string };
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);

function toForm(t: DocumentTemplate, dealer: Dealer): Form {
  return {
    heading: t.companyName || dealer.name.toUpperCase(),
    title: t.title ?? 'APPLICATION FORM',
    english: t.terms.join('\n'),
    urdu: t.closingLines.join('\n'),
    signOff: t.signOff.join('\n'),
  };
}

/**
 * The leave application form (Assistant Manager / Manager): the heading (the dealership's name), the
 * title, the rules in English and in Urdu, and the signature lines. Every leave application prints with it.
 */
export function LeaveFormatEditor({ dealer }: { dealer: Dealer }) {
  const toast = useToast();
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useGetDocumentTemplateQuery({ kind: 'leave', dealershipId: dealer.id }, { refetchOnMountOrArgChange: true });
  const [save, { isLoading: saving }] = useSaveDocumentTemplateMutation();
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (data) setForm(toForm(data, dealer));
  }, [data, dealer]);

  const fields = (f: Form) => ({
    companyName: f.heading.trim() || dealer.name.toUpperCase(),
    title: f.title.trim() || null,
    terms: lines(f.english),
    closingLines: lines(f.urdu),
    signOff: lines(f.signOff),
  });

  const build = useMemo(() => {
    if (!previewing || !form || !data) return null;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    const sample: LeaveDocument = {
      id: 0,
      dealershipId: dealer.id,
      dealershipName: dealer.name,
      applicationNo: `${dealer.code}-LV-SAMPLE`,
      employeeId: 0,
      employeeName: user?.fullName ?? 'Employee name',
      employeeNo: 'EMP-001',
      department: 'Sales',
      leaveType: 'sick',
      fromDate: today,
      toDate: today,
      days: 1,
      reason: 'Fever',
      status: 'submitted',
      decidedAt: null,
      decidedByName: null,
      decisionNote: null,
      createdAt: `${today}T09:00:00+05:00`,
      template: { ...data, ...fields(form) },
    };
    return () => buildLeavePdf(sample);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing]);
  const pdf = usePdf(build);

  if (error) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (isLoading || !data || !form) return <Spinner className="mx-auto my-10 size-6 text-slate-400" />;

  const submit = async () => {
    setErrors({});
    const { dealershipId: _d, kind: _k, isDefault: _i, updatedAt: _u, updatedByName: _n, ...current } = data;
    try {
      await save({ kind: 'leave', documentTemplateUpdate: { ...current, dealershipId: dealer.id, ...fields(form) } }).unwrap();
      toast.success('Leave form saved — every leave application now prints with it');
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path.split('.')[0]!, i.message])));
      else toast.error(e);
    }
  };

  return (
    <>
      <Section title="Leave application form">
        <p className="mb-4 text-sm text-slate-600">
          {data.isDefault ? 'Using the built-in form (not changed yet). ' : `Last changed ${data.updatedAt ? formatDateTime(data.updatedAt) : ''} by ${data.updatedByName ?? '—'}. `}
          Printed for every leave application (sick / emergency leave) of the dealership.
        </p>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Field label="Heading" htmlFor="lv-fmt-heading" error={errors.companyName} hint="e.g. HYUNDAI ISLAMABAD">
            <Input id="lv-fmt-heading" value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} />
          </Field>
          <Field label="Title" htmlFor="lv-fmt-title" error={errors.title}>
            <Input id="lv-fmt-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="APPLICATION FORM" />
          </Field>
        </div>
      </Section>
      <Section title="Rules (clauses)">
        <Field label="In English (one clause per line)" htmlFor="lv-fmt-en" error={errors.terms} hint="Write **text** for bold.">
          <Textarea id="lv-fmt-en" rows={4} value={form.english} onChange={(e) => setForm({ ...form, english: e.target.value })} />
        </Field>
        <Field label="In Urdu (one clause per line)" htmlFor="lv-fmt-ur" className="mt-4" error={errors.closingLines}>
          <Textarea id="lv-fmt-ur" dir="rtl" lang="ur" rows={4} className="text-base leading-8" value={form.urdu} onChange={(e) => setForm({ ...form, urdu: e.target.value })} />
        </Field>
      </Section>
      <Section title="Signatures">
        <Field label="Signature lines (one per line)" htmlFor="lv-fmt-sign" error={errors.signOff} hint="e.g. Applicant's Signature, Department Head, Manager. Up to 4.">
          <Textarea id="lv-fmt-sign" rows={3} value={form.signOff} onChange={(e) => setForm({ ...form, signOff: e.target.value })} />
        </Field>
      </Section>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setForm(toForm(data, dealer))}>
          Undo changes
        </Button>
        <Button variant="secondary" onClick={() => setPreviewing(true)}>
          <EyeIcon className="size-4" />
          Preview a sample form
        </Button>
        <Button loading={saving} onClick={submit}>
          Save form
        </Button>
      </div>
      {previewing && <PdfDialog open onClose={() => setPreviewing(false)} title="Sample leave application" pdf={pdf} loading={!pdf} />}
    </>
  );
}
