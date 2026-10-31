import { useState } from 'react';
import { Button, Dialog, Spinner } from '@/shared/components/ui';
import { downloadCsv, downloadTablePdf } from '@/features/sales/exports/exporters';
import { useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { SALE_COLUMNS } from '../../lib/saleColumns';
import { useGetPartsSaleReportQuery } from '../../partsApi';

const SHOWN = 100;
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const sum = (rows: Record<string, unknown>[], k: string) => Math.round(rows.reduce((n, r) => n + Number(r[k] ?? 0), 0) * 100) / 100;

/**
 * "Revenue report" on the parts dashboard: opens the revenue of the chosen period to read first (the totals, then every
 * part issued, with the parts taken back counted against it), and only then exports it to PDF or Excel.
 */
export function RevenueReport({ from, to, dealershipId, dealershipName }: { from: string; to: string; dealershipId?: number; dealershipName?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useGetPartsSaleReportQuery({ dealershipId, from, to }, { skip: !open });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const revenue = sum(rows, 'totalPrice');
  const cost = sum(rows, 'totalCost');
  const margin = Math.round((revenue - cost) * 100) / 100;
  const pct = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : 0;
  const total = { roNo: 'TOTAL', quantity: String(sum(rows, 'quantity')), totalPrice: String(revenue), totalCost: String(cost) };
  const where = dealershipName ?? 'All my dealerships';
  const period = `${day(from)} to ${day(to)}`;
  const name = `Store revenue report - ${from} to ${to}`;
  const note = `Revenue ${formatMoney(String(revenue))} · cost ${formatMoney(String(cost))} · margin ${formatMoney(String(margin))} (${pct}%)`;

  const stats: [string, string][] = [
    ['Revenue (price charged)', formatMoney(String(revenue))],
    ['Cost of the parts', formatMoney(String(cost))],
    ['Margin', `${formatMoney(String(margin))} · ${pct}%`],
    ['Lines', String(rows.length)],
  ];

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Revenue report
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          size="xl"
          title="Store revenue report"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(name, SALE_COLUMNS, [...rows, total])}>
                Export to Excel (CSV)
              </Button>
              <Button disabled={!rows.length} onClick={() => void downloadTablePdf(name, 'Store: revenue report', `${where} · ${period}`, SALE_COLUMNS.slice(0, 10), [...rows, total], note).catch((e) => toast.error(e))}>
                Export PDF
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            {where} · {period}. Revenue is the price charged for the parts issued, less the parts taken back. Margin = revenue − cost.
          </p>
          {isFetching && <Spinner className="my-6 size-5 text-slate-400" />}
          {isError && <p className="my-4 text-sm text-red-600">The report could not be loaded.</p>}
          {!isFetching && !isError && rows.length === 0 && <p className="my-6 text-sm text-slate-500">No parts were issued in this period.</p>}
          {!isFetching && rows.length > 0 && (
            <>
              <div className="my-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {stats.map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <div className="max-h-[45vh] overflow-auto rounded-lg ring-1 ring-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
                    <tr>
                      {['Date', 'RO No', 'Part', 'Qty', 'Unit price', 'Disc %', 'Revenue', 'Cost'].map((h, i) => (
                        <th key={h} className={`px-2 py-2 font-medium ${i >= 3 ? 'text-right' : ''}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, SHOWN).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 whitespace-nowrap">{String(r.date)}</td>
                        <td className="px-2 py-1.5">{String(r.roNo ?? '')}</td>
                        <td className="px-2 py-1.5">
                          <span className="font-mono">{String(r.partNo)}</span> {String(r.partName)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.quantity)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.unitPrice).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.discountPercent) > 0 ? Number(r.discountPercent) : ''}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.totalPrice).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.totalCost).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > SHOWN && (
                <p className="mt-2 text-xs text-slate-500">
                  Showing the first {SHOWN} of {rows.length} lines; the export has all of them.
                </p>
              )}
            </>
          )}
        </Dialog>
      )}
    </>
  );
}
