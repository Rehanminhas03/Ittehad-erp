import { useMemo, useState } from 'react';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { buildTablePdf, saveCsv, type Column } from '@/features/sales/exports/exporters';
import { Button } from '@/shared/components/ui';
import { useAppDispatch, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { usePartModelOptions } from '../../hooks/usePartModelOptions';
import { type InventoryRow, partsApi } from '../../partsApi';

type Filters = { brand?: string; category?: string; modelId?: number; q?: string; inStockOnly?: boolean };

/**
 * The stock report: every part in the store with what is in stock now, its cost value and its price, to view first and then print
 * or download (PDF or Excel). Follows the filters of the page it is opened from.
 */
export function StockReportButton({ brand, category, modelId, q, inStockOnly = true, label = 'Stock report', variant = 'secondary' }: Filters & { label?: string; variant?: 'primary' | 'secondary' }) {
  const toast = useToast();
  const dispatch = useAppDispatch();
  const models = usePartModelOptions(brand ?? '');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ name: string; sub: string; rows: InventoryRow[] } | null>(null);
  const modelName = (id: number) => models.find((m) => m.value === String(id))?.label.replace(`${brand} `, '') ?? '';
  const vehicleOf = (r: Record<string, unknown>) => ((r.modelIds as number[] | undefined) ?? []).map(modelName).join(', ');

  const columns: Column[] = [
    { header: 'Part no.', value: (r) => String(r.partNo), w: 1.5 },
    { header: 'Description', value: (r) => String(r.description), w: 2.8 },
    { header: 'Category', value: (r) => String(r.category ?? ''), w: 1.2 },
    { header: 'Vehicle', value: vehicleOf, w: 1.3 },
    { header: 'Bin', value: (r) => String(r.binLocation ?? ''), w: 0.8 },
    { header: 'In stock', value: (r) => Number(r.onHand), w: 0.8 },
    { header: 'Cost value', value: (r) => Number(r.stockValue), w: 1.1 },
    { header: 'Price', value: (r) => Number(r.sellingPrice), w: 1.1 },
  ];
  const withTotal = (rows: InventoryRow[]) => [
    ...rows,
    { partNo: 'TOTAL', description: `${rows.length} parts`, category: '', modelIds: [], binLocation: '', onHand: String(rows.reduce((n, r) => n + Number(r.onHand), 0)), stockValue: String(rows.reduce((n, r) => n + Number(r.stockValue), 0)), sellingPrice: '' },
  ] as unknown as Record<string, unknown>[];

  const build = useMemo(
    () => (report ? () => buildTablePdf(report.name, 'Store stock report', report.sub, columns, withTotal(report.rows) as never) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report],
  );
  const pdf = usePdf(build);

  const open = async () => {
    setBusy(true);
    try {
      const args = { brand: brand || undefined, category: category || undefined, modelId, q: q || undefined, inStock: inStockOnly ? ('true' as const) : undefined };
      const get = (page: number) => dispatch(partsApi.endpoints.getInventory.initiate({ ...args, page, pageSize: 100 }, { forceRefetch: true })).unwrap();
      const first = await get(1);
      const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / 100) - 1) }, (_, i) => get(i + 2)));
      const rows = [...first.items, ...rest.flatMap((r) => r.items)];
      if (!rows.length) return toast.error('There is no stock to report');
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      const value = rows.reduce((n, r) => n + Number(r.stockValue), 0);
      setReport({ name: `Stock report - ${day}`, sub: `${rows.length} parts · stock value at cost ${formatMoney(String(value))} · ${day}`, rows });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant={variant} loading={busy} onClick={() => void open()}>
        {label}
      </Button>
      <PdfDialog
        open={!!report}
        onClose={() => setReport(null)}
        title="Store stock report"
        pdf={pdf}
        loading={!!report && !pdf}
        extra={
          <Button variant="secondary" onClick={() => report && saveCsv(report.name, columns, withTotal(report.rows) as never)}>
            Download Excel (CSV)
          </Button>
        }
      />
    </>
  );
}
