import { useMemo, useState } from 'react';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { Button } from '@/shared/components/ui';
import { type PurchaseOrder, useGetSupplierQuery, useListPurchaseOrderLinesQuery } from '../../partsApi';
import { buildJetourPurchaseOrderPdf, poCsvRows } from './jetourPurchaseOrderPdf';
import { buildPurchaseOrderPdf } from './purchaseOrderPdf';

function Viewer({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const { data: lines } = useListPurchaseOrderLinesQuery({ id: po.id });
  const { data: supplier, isLoading: supplierLoading } = useGetSupplierQuery({ id: po.supplierId });
  const { data: dealership, isLoading: dealershipLoading } = useGetDealershipQuery({ id: po.dealershipId });
  const ready = !!lines && !supplierLoading && !dealershipLoading;
  const build = useMemo(
    () => {
      if (!ready) return null;
      const brand = workshopBrand(dealership?.code);
      const doc = { po, lines: lines ?? [], supplier, dealershipName: dealership?.name ?? '', brand };
      // Jetour Ittehad's purchase order has its own format; the others keep the plain one.
      return () => (brand ? buildJetourPurchaseOrderPdf({ ...doc, brand }) : buildPurchaseOrderPdf(doc));
    },
    [ready, po, lines, supplier, dealership],
  );
  const toExcel = () => {
    const rows = poCsvRows({ po, lines: lines ?? [], supplier, dealershipName: dealership?.name ?? '', brand: workshopBrand(dealership?.code) });
    const cell = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
    const link = document.createElement('a');
    // The byte-order mark makes Excel read it as UTF-8.
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `${po.poNo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const pdf = usePdf(build);
  return (
    <PdfDialog
      open
      onClose={onClose}
      title={`Purchase order ${po.poNo}`}
      pdf={pdf}
      loading={!pdf}
      extra={
        <Button variant="secondary" disabled={!ready} onClick={toExcel}>
          Export to Excel (CSV)
        </Button>
      }
    />
  );
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
