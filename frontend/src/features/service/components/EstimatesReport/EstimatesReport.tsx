import { useMemo, useState } from 'react';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { buildTablePdf, downloadCsv, type Column } from '@/features/sales/exports/exporters';
import { Button } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { type Estimate, useLazyListEstimatesQuery } from '../../serviceApi';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(/ /g, '-');
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const COLUMNS: Column[] = [
  { header: 'Estimate', value: (r) => String(r.estimateNo), w: 1.3 },
  { header: 'Date', value: (r) => String(r.date), w: 1 },
  { header: 'Customer', value: (r) => String(r.customerName ?? ''), w: 2 },
  { header: 'Mobile', value: (r) => String(r.customerMobile ?? ''), w: 1.3 },
  { header: 'Car', value: (r) => String(r.car ?? ''), w: 2.4 },
  { header: 'Advisor', value: (r) => String(r.advisorName ?? ''), w: 1.4 },
  { header: 'Status', value: (r) => String(r.statusLabel), w: 0.9 },
  { header: 'Total (PKR)', value: (r) => (r.total === '' ? '' : Number(r.total)), w: 1.2 },
];

/** "Estimates report" in the list's header: every estimate of the list on screen (same search and filters), to view, print or save as PDF, or Excel. */
export function EstimatesReportButton({ query }: { query: Record<string, unknown> }) {
  const toast = useToast();
  const [load] = useLazyListEstimatesQuery();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [viewing, setViewing] = useState(false);
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const name = `Estimates - ${stamp}`;

  const fetchAll = async () => {
    const all: Estimate[] = [];
    const { page: _p, pageSize: _s, ...rest } = query;
    for (let page = 1; page <= 20; page++) {
      const r = await load({ ...(rest as object), page, pageSize: 100 }).unwrap();
      all.push(...r.items);
      if (all.length >= r.total || !r.items.length) break;
    }
    return all.map((e) => ({
      estimateNo: e.estimateNo,
      date: day(e.createdAt),
      customerName: e.customerName,
      customerMobile: e.customerMobile,
      car: [e.vehicleLabel, e.vehicleVariant].filter(Boolean).join(' · '),
      advisorName: e.advisorName,
      statusLabel: label(e.status),
      total: e.totalAmount,
    })) as Record<string, unknown>[];
  };

  const run = async (as: 'pdf' | 'csv') => {
    setBusy(as);
    try {
      const data = await fetchAll();
      if (!data.length) return void toast.error('Nothing to print: no estimates in this list');
      const withTotal = [...data, { estimateNo: 'TOTAL', date: '', customerName: `${data.length} estimates`, car: '', statusLabel: '', total: String(data.reduce((n, r) => n + Number(r.total), 0)) }];
      if (as === 'csv') downloadCsv(name, COLUMNS, withTotal);
      else {
        setRows(withTotal);
        setViewing(true);
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  const build = useMemo(
    () => (viewing && rows ? () => buildTablePdf(name, 'Estimates', `Customers with estimates · ${formatMoney(String(rows[rows.length - 1]!.total))} in total · printed ${stamp}`, COLUMNS, rows) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewing, rows, name],
  );
  const pdf = usePdf(build);

  return (
    <>
      <Button variant="secondary" loading={busy === 'csv'} onClick={() => void run('csv')}>
        Excel (CSV)
      </Button>
      <Button variant="secondary" loading={busy === 'pdf'} onClick={() => void run('pdf')}>
        Print report
      </Button>
      <PdfDialog open={viewing} onClose={() => setViewing(false)} title="Estimates" pdf={pdf} loading={viewing && !pdf} />
    </>
  );
}
