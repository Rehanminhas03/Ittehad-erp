import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { buildRepairOrderPdf, type RepairOrderVariant } from '@/features/service/components/JobCardSummary/jobCardPdf';
import { Badge, Button, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { type StoreJobCard as StoreJobCardData, useGetStoreJobCardQuery } from '../../partsApi';

const BLOCKS: { title: string; kinds: string[] }[] = [
  { title: 'Parts', kinds: ['part'] },
  { title: 'Accessories', kinds: ['accessory'] },
  { title: 'Lubricants', kinds: ['lubricant'] },
  { title: 'Services & labour', kinds: ['labour', 'sublet'] },
];

/**
 * The job card as the service advisor wrote it, for the store: the customer, the car, the Voice of Customer and what the
 * workshop has put on it (parts, accessories, lubricants and services, each in its own block), so the storekeeper sees
 * what to give before issuing.
 */
export function StoreJobCard({ jobCardId }: { jobCardId: number }) {
  const perm = usePermission();
  const { data: jc, isLoading } = useGetStoreJobCardQuery({ id: jobCardId });
  const [viewing, setViewing] = useState(false);
  // "Repair Order" is the workshop copy; "Repair Estimate / Contract" is the one sent to the customer.
  const [variant, setVariant] = useState<RepairOrderVariant>('order');
  const brand = workshopBrand(jc?.dealershipCode ?? undefined);
  const build = useMemo(
    () =>
      viewing && jc && brand
        ? () =>
            // The same repair order the service advisor prints, drawn from what the store is shown of the job card.
            buildRepairOrderPdf({
              jobCard: { jobCardNo: jc.jobCardNo, createdAt: jc.createdAt, vehicleLabel: jc.vehicleLabel } as never,
              visit: { visitType: jc.visitType, customerName: jc.customerName, odometerKm: jc.odometerKm, complaints: jc.complaints, vehicleLabel: jc.vehicleLabel } as never,
              lines: jc.lines as never,
              vehicle: { modelName: jc.vehicleLabel, variant: jc.variant, vin: jc.vin, engineNo: jc.engineNo, registrationNo: jc.registrationNo, color: jc.color } as never,
              customer: { mobile: jc.customerMobile } as never,
              brand,
              variant,
            })
        : null,
    [viewing, jc, brand, variant],
  );
  const pdf = usePdf(build);
  if (isLoading) return <Spinner className="size-4 text-slate-400" />;
  if (!jc) return null;
  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2 lg:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Header jc={jc} />
        {brand && (
          <Button size="sm" variant="secondary" onClick={() => setViewing(true)}>
            View and print job card
          </Button>
        )}
      </div>
      {perm.can('service.job_cards.view') && (
        <Link to={`/service/job-cards/${jc.id}`} className="inline-block text-xs font-medium text-brand-700 hover:underline">
          Open the full job card
        </Link>
      )}
      <div>
        <p className="text-xs text-slate-500">Voice of Customer</p>
        <p className="text-slate-800">{jc.complaints || '—'}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {BLOCKS.map((b) => {
          const rows = jc.lines.filter((l) => b.kinds.includes(l.kind));
          if (!rows.length && b.title !== 'Parts') return null;
          return (
            <div key={b.title} className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
              <p className="mb-1 text-xs font-semibold text-slate-700">{b.title}</p>
              {rows.length ? (
                <ul className="divide-y divide-slate-100">
                  {rows.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="min-w-0">
                        {l.partNo && <span className="mr-1.5 font-mono text-xs text-slate-500">{l.partNo}</span>}
                        <span className="text-slate-800">{l.description}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 tabular-nums text-slate-600">
                        ×{Number(l.quantity)}
                        {l.status === 'done' && <Badge tone="green">Done</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Nothing added yet.</p>
              )}
            </div>
          );
        })}
      </div>
      <PdfDialog
        open={viewing}
        onClose={() => setViewing(false)}
        title={`Job card ${jc.jobCardNo}`}
        pdf={pdf}
        loading={viewing && !pdf}
        extra={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Print format
            <Select value={variant} onChange={(e) => setVariant(e.target.value as RepairOrderVariant)} className="w-auto">
              <option value="order">Repair Order</option>
              <option value="contract">Repair Estimate / Contract</option>
            </Select>
          </label>
        }
      />
    </div>
  );
}

function Header({ jc }: { jc: StoreJobCardData }) {
  return (
    <div>
      <p className="font-medium text-slate-900">
        {jc.jobCardNo} · <span className="capitalize">{jc.status.replace('_', ' ')}</span>
      </p>
      <p className="text-slate-600">
        {jc.customerName ?? 'Customer not set'} · {jc.vehicleLabel ?? 'Model not set'} · Registration {jc.registrationNo ?? '—'} · Chassis {jc.vin ?? '—'} · {jc.odometerKm.toLocaleString()} km
        {jc.advisorName ? ` · Advisor ${jc.advisorName}` : ''}
      </p>
    </div>
  );
}
