import { useMemo, useState } from 'react';
import { useGetDealershipQuery } from '@/features/admin/adminApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { downloadCsv } from '@/features/sales/exports/exporters';
import { Button } from '@/shared/components/ui';
import { type GoodsReceipt, useListGoodsReceiptLinesQuery } from '../../partsApi';
import { buildGoodsReceiptPdf } from './goodsReceiptPdf';

function Viewer({ grn, onClose }: { grn: GoodsReceipt; onClose: () => void }) {
  const { data: lines } = useListGoodsReceiptLinesQuery({ id: grn.id });
  const { data: dealership, isLoading } = useGetDealershipQuery({ id: grn.dealershipId });
  const ready = !!lines && !isLoading;
  const build = useMemo(() => (ready ? () => buildGoodsReceiptPdf({ grn, lines: lines ?? [], dealershipName: dealership?.name ?? '', brand: workshopBrand(dealership?.code) }) : null), [ready, grn, lines, dealership]);
  const pdf = usePdf(build);
  return (
    <PdfDialog
      open
      onClose={onClose}
      title={`Goods receipt ${grn.grnNo}`}
      pdf={pdf}
      loading={!pdf}
      extra={
        <Button
          variant="secondary"
          disabled={!ready}
          onClick={() =>
            downloadCsv(
              grn.grnNo,
              [
                { header: 'Part no.', value: (r) => String(r.partNo) },
                { header: 'Description', value: (r) => String(r.description) },
                { header: 'Quantity', value: (r) => Number(r.quantity) },
                { header: 'Unit cost', value: (r) => Number(r.unitCost) },
                { header: 'Amount', value: (r) => Number(r.amount) },
              ],
              (lines ?? []) as unknown as Record<string, unknown>[],
            )
          }
        >
          Export to Excel (CSV)
        </Button>
      }
    />
  );
}

/** A print icon at the end of a goods receipt row: opens the receipt to view, then print or download. */
export function GoodsReceiptPrintIcon({ grn }: { grn: GoodsReceipt }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="View and print"
        aria-label={`View and print ${grn.grnNo}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden>
          <path d="M6 7V3.5h8V7M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11.5h8V17H6v-5.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <Viewer grn={grn} onClose={() => setOpen(false)} />}
    </>
  );
}

/** "View and print" on the goods receipt page. */
export function GoodsReceiptPrintButton({ grn }: { grn: GoodsReceipt }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        View and print goods receipt
      </Button>
      {open && <Viewer grn={grn} onClose={() => setOpen(false)} />}
    </>
  );
}
