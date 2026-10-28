import { useMemo, useState } from 'react';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { useGetCustomerQuery, useGetVehicleQuery } from '@/features/crm/crmApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { useGetJobCardQuery, useGetVisitQuery } from '@/features/service/serviceApi';
import { Button } from '@/shared/components/ui';
import { type Invoice, useListInvoiceLinesQuery, useListInvoicePaymentsQuery } from '../../accountsApi';
import { buildInvoicePdf } from './invoicePdf';
import { buildSalesInvoicePdf } from './salesInvoicePdf';

/** The invoice drawn as it prints: fetched and built only once it is opened. */
function InvoiceViewer({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { data: lines } = useListInvoiceLinesQuery({ id: invoice.id });
  const { data: payments } = useListInvoicePaymentsQuery({ id: invoice.id }, { skip: invoice.status === 'draft' });
  const { data: dealership, isLoading: dealershipLoading } = useGetDealershipQuery({ id: invoice.dealershipId });
  const service = invoice.sourceType === 'job_card';
  const { data: jobCard } = useGetJobCardQuery({ id: invoice.sourceId }, { skip: !service });
  const { data: visit } = useGetVisitQuery({ id: jobCard?.visitId ?? 0 }, { skip: !jobCard });
  // The dealership's own layout (Jetour Ittehad): needs the customer and the car too.
  const brand = workshopBrand(dealership?.code);
  const { data: car, isLoading: carLoading } = useGetVehicleQuery({ id: jobCard?.vehicleId ?? 0 }, { skip: !jobCard });
  const { data: customer, isLoading: customerLoading } = useGetCustomerQuery({ id: invoice.customerId });
  const ready = !!lines && (invoice.status === 'draft' || !!payments) && (!jobCard || !!visit) && !dealershipLoading && !carLoading && !customerLoading;
  const build = useMemo(
    () =>
      ready
        ? () => {
            const doc = { invoice, lines: lines ?? [], payments: payments ?? [], dealership: dealership ?? null, vehicle: jobCard?.vehicleLabel ?? null, odometerKm: visit?.odometerKm ?? null };
            return brand ? buildSalesInvoicePdf({ ...doc, customer, car, brand }) : buildInvoicePdf(doc);
          }
        : null,
    [ready, invoice, lines, payments, dealership, jobCard, visit, brand, car, customer],
  );
  const pdf = usePdf(build);
  return <PdfDialog open onClose={onClose} title={`Invoice ${invoice.invoiceNo}`} pdf={pdf} loading={!pdf} />;
}

/** The print icon on a row (or a labelled button on the invoice): opens it to view and print, and, once paid, to sign. */
export function InvoicePrintButton({ invoice, label }: { invoice: Invoice; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          {label}
        </Button>
      ) : (
        <button
          type="button"
          title={`View and print ${invoice.invoiceNo}`}
          aria-label={`View and print ${invoice.invoiceNo}`}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen(true);
          }}
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 12h8v5H6z" />
          </svg>
        </button>
      )}
      {open && (
        <span onClick={(e) => e.stopPropagation()}>
          <InvoiceViewer invoice={invoice} onClose={() => setOpen(false)} />
        </span>
      )}
    </>
  );
}
