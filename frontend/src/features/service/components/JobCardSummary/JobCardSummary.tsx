import { useMemo, useState } from 'react';
import { useGetCustomerQuery, useGetVehicleQuery } from '@/features/crm/crmApi';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { Badge, Button, Section, Spinner } from '@/shared/components/ui';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/shared/lib';
import { visitTypeLabel } from '../../permissions';
import { type JobCard, type JobCardLine, useGetVisitQuery, useListJobCardLinesQuery } from '../../serviceApi';
import { buildJobCardPdf, buildRepairOrderPdf } from './jobCardPdf';

const num = (s: string | undefined | null) => Number(s ?? 0) || 0;

/**
 * The job card at a glance: the customer and the car, the km, the complaints, whether the visit is a free
 * service, and the totals: what the customer pays (parts, oil, chargeable labour) and what is free. A printable
 * copy (PDF) goes to the workshop and the customer.
 */
export function JobCardSummary({ jobCard }: { jobCard: JobCard }) {
  const { data: visit } = useGetVisitQuery({ id: jobCard.visitId });
  const { data: lines } = useListJobCardLinesQuery({ id: jobCard.id });
  // The job card is drawn only when it is opened to view and print.
  const [viewing, setViewing] = useState(false);
  const totals = useMemo(() => {
    const n = (s: string | undefined | null) => Number(s ?? 0) || 0;
    const rows = lines ?? [];
    const sum = (f: (l: JobCardLine) => boolean) => rows.filter(f).reduce((a, l) => a + n(l.amount), 0);
    const parts = sum((l) => l.billable && (l.kind === 'part' || l.kind === 'lubricant'));
    const labour = sum((l) => l.billable && (l.kind === 'labour' || l.kind === 'sublet'));
    return { parts, labour, free: sum((l) => !l.billable), payable: parts + labour, discount: rows.reduce((a, l) => a + (n(l.unitPrice) * n(l.quantity) - n(l.amount)), 0) };
  }, [lines]);
  // Jetour Ittehad prints the repair order in its own layout (needs the car, the customer and the dealership).
  const { data: dealership, isLoading: dealershipLoading } = useGetDealershipQuery({ id: jobCard.dealershipId }, { skip: !viewing });
  const brand = workshopBrand(dealership?.code);
  const { data: vehicle, isLoading: vehicleLoading } = useGetVehicleQuery({ id: jobCard.vehicleId }, { skip: !viewing });
  const { data: customer, isLoading: customerLoading } = useGetCustomerQuery({ id: visit?.customerId ?? 0 }, { skip: !viewing || !visit });
  const loadingMore = dealershipLoading || vehicleLoading || customerLoading;
  const build = useMemo(
    () =>
      viewing && visit && lines && !loadingMore
        ? () => (brand ? buildRepairOrderPdf({ jobCard, visit, lines, vehicle, customer, brand }) : buildJobCardPdf(jobCard, visit, lines, totals))
        : null,
    [viewing, visit, lines, jobCard, totals, loadingMore, brand, vehicle, customer],
  );
  const pdf = usePdf(build);
  if (!visit || !lines) return <Spinner className="size-4 text-slate-400" />;

  const sum = (f: (l: JobCardLine) => boolean) => lines.filter(f).reduce((n, l) => n + num(l.amount), 0);
  const parts = sum((l) => l.billable && (l.kind === 'part' || l.kind === 'lubricant'));
  const labour = sum((l) => l.billable && (l.kind === 'labour' || l.kind === 'sublet'));
  const free = sum((l) => !l.billable);
  // The discount given on the lines (price x quantity less what is charged).
  const discount = lines.reduce((n, l) => n + (num(l.unitPrice) * num(l.quantity) - num(l.amount)), 0);
  const payable = parts + labour;
  const done = lines.filter((l) => l.status === 'done').length;

  return (
    <Section
      title="Job card summary"
      actions={
        <Button size="sm" variant="secondary" onClick={() => setViewing(true)}>
          View and print job card
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
      <PdfDialog open={viewing} onClose={() => setViewing(false)} title={`Job card ${jobCard.jobCardNo}`} pdf={pdf} loading={viewing && !pdf} />
    </Section>
  );
}
