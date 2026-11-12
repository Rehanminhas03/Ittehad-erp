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

/** A print icon at the end of a purchase order row: opens the order to view, then print or download. */
export function PurchaseOrderPrintIcon({ po }: { po: PurchaseOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" title="View and print" aria-label={`View and print ${po.poNo}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
          <path d="M6 7V3.5h8V7M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11.5h8V17H6v-5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <Viewer po={po} onClose={() => setOpen(false)} />}
    </>
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
