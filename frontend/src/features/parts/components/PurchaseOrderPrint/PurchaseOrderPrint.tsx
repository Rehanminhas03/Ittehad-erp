import { useMemo, useState } from 'react';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { Button } from '@/shared/components/ui';
import { type PurchaseOrder, useGetSupplierQuery, useListPurchaseOrderLinesQuery } from '../../partsApi';
import { buildPurchaseOrderPdf } from './purchaseOrderPdf';

function Viewer({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { data: lines } = useListPurchaseOrderLinesQuery({ id: po.id });
  const { data: supplier, isLoading: supplierLoading } = useGetSupplierQuery({ id: po.supplierId });
  const { data: dealership, isLoading: dealershipLoading } = useGetDealershipQuery({ id: po.dealershipId });
  const ready = !!lines && !supplierLoading && !dealershipLoading;
  const build = useMemo(
    () => (ready ? () => buildPurchaseOrderPdf({ po, lines: lines ?? [], supplier, dealershipName: dealership?.name ?? '', brand: workshopBrand(dealership?.code) }) : null),
    [ready, po, lines, supplier, dealership],
  );
  const pdf = usePdf(build);
  return <PdfDialog open onClose={onClose} title={`Purchase order ${po.poNo}`} pdf={pdf} loading={!pdf} />;
}

/** "View and print": the purchase order as it goes to the supplier. */
export function PurchaseOrderPrintButton({ po }: { po: PurchaseOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        View and print purchase order
      </Button>
      {open && <Viewer po={po} onClose={() => setOpen(false)} />}
    </>
  );
}
