import { useState } from 'react';
import { Button } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { useLazyExportLeadsQuery, useLazyExportSalesOrdersQuery } from '../salesApi';
import { downloadCsv, downloadTablePdf, LEAD_COLUMNS, LEAD_PDF_COLUMNS, ORDER_COLUMNS, ORDER_PDF_COLUMNS } from './exporters';

const KINDS = {
  orders: { title: 'Sales orders', from: 'bookedFrom', to: 'bookedTo', columns: ORDER_COLUMNS, pdf: ORDER_PDF_COLUMNS, what: 'booked' },
  leads: { title: 'Leads', from: 'activityFrom', to: 'activityTo', columns: LEAD_COLUMNS, pdf: LEAD_PDF_COLUMNS, what: 'with activity' },
} as const;

const DownloadIcon = () => (
  <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * "Export to Excel (CSV)" and "Export PDF" for the list on screen: the same period, dealership and
 * status, every record (not only the page shown), within the user's own scope (a salesperson: their own).
 */
export function ExportButtons({ kind, query, periodLabel }: { kind: keyof typeof KINDS; query: Record<string, unknown>; periodLabel: string }) {
  const k = KINDS[kind];
  const toast = useToast();
  const [loadOrders] = useLazyExportSalesOrdersQuery();
  const [loadLeads] = useLazyExportLeadsQuery();
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);
  const arg = {
    from: (query[k.from] as string | undefined) || undefined,
    to: (query[k.to] as string | undefined) || undefined,
    dealershipId: query.dealershipId ? Number(query.dealershipId) : undefined,
    status: (query.status as string | undefined) || undefined,
  };
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const name = `${k.title} - ${periodLabel} - ${stamp}`.replace(/[\\/:*?"<>|]/g, '');

  const run = async (as: 'csv' | 'pdf') => {
    setBusy(as);
    try {
      const rows = (kind === 'orders' ? await loadOrders(arg).unwrap() : await loadLeads(arg).unwrap()) as Record<string, unknown>[];
      if (!rows.length) {
        toast.error(`Nothing to export: no ${k.title.toLowerCase()} ${k.what} ${periodLabel}`);
        return;
      }
      if (as === 'csv') downloadCsv(name, k.columns, rows);
      else {
        const total = kind === 'orders' ? rows.reduce((s, r) => s + Number(r.total ?? 0), 0) : 0;
        const received = kind === 'orders' ? rows.reduce((s, r) => s + Number(r.received ?? 0), 0) : 0;
        await downloadTablePdf(
          name,
          k.title,
          `${rows.length} ${k.title.toLowerCase()} ${k.what} ${periodLabel}`,
          k.pdf,
          rows,
          kind === 'orders'
            ? `Total: Rs ${total.toLocaleString('en-PK')} · Received: Rs ${received.toLocaleString('en-PK')} · Balance: Rs ${(total - received).toLocaleString('en-PK')}`
            : undefined,
        );
      }
      toast.success(`${rows.length} ${k.title.toLowerCase()} exported`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-3 flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="secondary" loading={busy === 'csv'} onClick={() => void run('csv')} title="Every detail, one column each — opens in Excel">
        <DownloadIcon />
        Export to Excel (CSV)
      </Button>
      <Button size="sm" variant="secondary" loading={busy === 'pdf'} onClick={() => void run('pdf')}>
        <DownloadIcon />
        Export PDF
      </Button>
    </div>
  );
}
