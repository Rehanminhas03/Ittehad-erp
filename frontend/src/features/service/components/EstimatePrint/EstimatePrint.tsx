import { useMemo, useState } from 'react';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand, type WorkshopBrand } from '@/features/sales/documents/workshopPdf';
import { Button } from '@/shared/components/ui';
import { type Estimate, useListEstimateLinesQuery } from '../../serviceApi';
import { buildEstimatePdf } from './estimatePdf';

/** "View and print estimate": the Repair Estimate as the customer gets it, previewed before it is saved or printed. */
export function EstimatePrint({ estimate }: { estimate: Estimate }) {
  const [viewing, setViewing] = useState(false);
  const { data: lines } = useListEstimateLinesQuery({ id: estimate.id }, { skip: !viewing });
  const { data: dealership } = useGetDealershipQuery({ id: estimate.dealershipId }, { skip: !viewing });
  // The dealership's own workshop layout, or the group's plain one.
  const brand: WorkshopBrand = workshopBrand(dealership?.code) ?? {
    name: dealership?.name ?? 'Ittehad Automotive',
    logo: '/logo/Ittehad-logo.png',
    addressLines: [dealership?.address, dealership?.phone && `Tel: ${dealership.phone}`].filter(Boolean) as string[],
    appointmentLine: dealership?.phone ?? '',
  };
  // Memoised: the PDF is drawn again whenever this function changes.
  const build = useMemo(
    () => (viewing && lines && dealership ? () => buildEstimatePdf({ estimate, lines, brand }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewing, lines, dealership, estimate],
  );
  const pdf = usePdf(build);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setViewing(true)}>
        View and print estimate
      </Button>
      <PdfDialog open={viewing} onClose={() => setViewing(false)} title={`Estimate ${estimate.estimateNo}`} pdf={pdf} loading={viewing && !pdf} />
    </>
  );
}
