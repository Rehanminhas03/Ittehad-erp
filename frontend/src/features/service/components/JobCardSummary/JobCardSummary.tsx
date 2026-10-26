import { useState } from 'react';
import { Badge, Button, Section, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/shared/lib';
import { visitTypeLabel } from '../../permissions';
import { type JobCard, type JobCardLine, useGetVisitQuery, useListJobCardLinesQuery } from '../../serviceApi';
import { downloadJobCardPdf } from './jobCardPdf';

const num = (s: string | undefined | null) => Number(s ?? 0) || 0;

/**
 * The job card at a glance: the customer and the car, the km, the complaints, whether the visit is a free
 * service, and the totals: what the customer pays (parts, oil, chargeable labour) and what is free. A printable
 * copy (PDF) goes to the workshop and the customer.
 */
export function JobCardSummary({ jobCard }: { jobCard: JobCard }) {
  const toast = useToast();
  const { data: visit } = useGetVisitQuery({ id: jobCard.visitId });
  const { data: lines } = useListJobCardLinesQuery({ id: jobCard.id });
  const [busy, setBusy] = useState(false);
  if (!visit || !lines) return <Spinner className="size-4 text-slate-400" />;

  const sum = (f: (l: JobCardLine) => boolean) => lines.filter(f).reduce((n, l) => n + num(l.amount), 0);
  const parts = sum((l) => l.billable && l.kind === 'part');
  const labour = sum((l) => l.billable && l.kind === 'labour');
  const free = sum((l) => !l.billable);
  // The discount given on the lines (price x quantity less what is charged).
  const discount = lines.reduce((n, l) => n + (num(l.unitPrice) * num(l.quantity) - num(l.amount)), 0);
  const payable = parts + labour;
  const done = lines.filter((l) => l.status === 'done').length;

  const print = async () => {
    setBusy(true);
    try {
      await downloadJobCardPdf(jobCard, visit, lines, { parts, labour, free, payable, discount });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Job card summary"
      actions={
        <Button size="sm" variant="secondary" loading={busy} onClick={print}>
          Print job card (PDF)
        </Button>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Customer</dt>
          <dd className="font-medium text-slate-900">{visit.customerName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Car</dt>
          <dd className="font-medium text-slate-900">{jobCard.vehicleLabel ?? visit.vehicleLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Odometer in</dt>
          <dd>{formatNumber(visit.odometerKm)} km</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Visit</dt>
          <dd>
            {visit.serviceName ?? visitTypeLabel(visit.visitType)} · {visit.visitNo}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Arrived</dt>
          <dd>{formatDateTime(visit.arrivedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Promised</dt>
          <dd>{visit.promisedAt ? formatDateTime(visit.promisedAt) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Work done</dt>
          <dd>
            {done} of {lines.length} lines
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Warranty</dt>
          <dd>{visit.warrantyValid ? <Badge tone="green">Valid</Badge> : 'Not covered'}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-xs text-slate-500">Customer complaints / requests</dt>
          <dd className="text-slate-800">{visit.complaints || '—'}</dd>
        </div>
      </dl>
      {visit.freeService && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Free scheduled service: the labour and services are free. Parts and oil are charged to the customer.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Parts and oil (charged)</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatMoney(String(parts))}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">Labour (charged)</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatMoney(String(labour))}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <p className="text-xs text-emerald-800">Free of charge</p>
          <p className="mt-0.5 text-lg font-semibold text-emerald-900 tabular-nums">{formatMoney(String(free))}</p>
        </div>
        {discount > 0.005 && (
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs text-amber-800">Discount given</p>
            <p className="mt-0.5 text-lg font-semibold text-amber-900 tabular-nums">{formatMoney(String(Math.round(discount * 100) / 100))}</p>
          </div>
        )}
        <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200">
          <p className="text-xs text-brand-800">Customer pays</p>
          <p className="mt-0.5 text-lg font-semibold text-brand-900 tabular-nums">{formatMoney(String(payable))}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Dated {formatDate(jobCard.createdAt)}. Prices include sales tax as entered; the cashier issues the invoice once the job card is completed.
      </p>
    </Section>
  );
}
