import { useMemo, useState } from 'react';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { useListInvoicesQuery } from '@/features/accounts/accountsApi';
import { useGetVehicleQuery } from '@/features/crm/crmApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { Button } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { useGetJobCardQuery, useGetVisitQuery } from '../../serviceApi';
import { buildGatePassPdf } from './gatePassPdf';

/**
 * The gate pass for a finished job: given to the customer once the service is done and the invoice is paid (or nothing was
 * charged). The customer hands it to the guard at the gate. Shown only when that is so.
 */
export function GatePassButton({ jobCardId }: { jobCardId: number }) {
  const perm = usePermission();
  const [open, setOpen] = useState(false);
  const { data: jobCard } = useGetJobCardQuery({ id: jobCardId });
  const canSeeInvoices = perm.can('accounts.invoices.view');
  const { data: invoices, isLoading: invoicesLoading } = useListInvoicesQuery({ sourceType: 'job_card', sourceId: jobCardId, pageSize: 10, sort: '-createdAt' }, { skip: !canSeeInvoices });
  const live = invoices?.items.find((i) => !['void', 'cancelled'].includes(i.status));
  // Service done, and paid; a job card with no invoice (free work) needs no payment.
  const eligible = jobCard?.status === 'completed' && !invoicesLoading && (live ? live.status === 'paid' : true);
  if (!eligible || !jobCard) return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Gate pass
      </Button>
      {open && <GatePassViewer jobCardId={jobCardId} invoiceNo={live?.invoiceNo ?? null} paid={!!live} onClose={() => setOpen(false)} />}
    </>
  );
}

function GatePassViewer({ jobCardId, invoiceNo, paid, onClose }: { jobCardId: number; invoiceNo: string | null; paid: boolean; onClose: () => void }) {
  const { data: jobCard } = useGetJobCardQuery({ id: jobCardId });
  const { data: visit } = useGetVisitQuery({ id: jobCard?.visitId ?? 0 }, { skip: !jobCard });
  const { data: car, isLoading: carLoading } = useGetVehicleQuery({ id: jobCard?.vehicleId ?? 0 }, { skip: !jobCard });
  const { data: dealership, isLoading: dealershipLoading } = useGetDealershipQuery({ id: jobCard?.dealershipId ?? 0 }, { skip: !jobCard });
  const ready = !!jobCard && !!visit && !carLoading && !dealershipLoading;
  const build = useMemo(
    () =>
      ready
        ? () =>
            buildGatePassPdf({
              gatePassNo: invoiceNo ?? jobCard!.jobCardNo,
              customerName: visit!.customerName ?? '',
              vehicle: [car?.modelName, car?.variant].filter(Boolean).join(' ') || (jobCard!.vehicleLabel ?? ''),
              regNo: car?.registrationNo ?? '',
              roNo: jobCard!.jobCardNo,
              status: paid ? 'PAID' : 'SERVICE COMPLETED',
              brand: workshopBrand(dealership?.code) ?? { name: dealership?.name ?? 'Dealership', logo: '', addressLines: [dealership?.address ?? '', dealership?.phone ? `Tel: ${dealership.phone}` : ''].filter(Boolean), appointmentLine: dealership?.phone ?? '' },
            })
        : null,
    [ready, invoiceNo, paid, jobCard, visit, car, dealership],
  );
  const pdf = usePdf(build);
  return <PdfDialog open onClose={onClose} title={`Gate pass · ${jobCard?.jobCardNo ?? ''}`} pdf={pdf} loading={!pdf} />;
}
