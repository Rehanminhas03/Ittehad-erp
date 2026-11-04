import { useMemo, useState } from 'react';
import { useGetDailySalesQuery } from '@/features/parts/partsApi';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { workshopBrand } from '@/features/sales/documents/workshopPdf';
import { type Column, downloadCsv } from '@/features/sales/exports/exporters';
import { Button, Dialog, Input, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { buildSalesReportPdf } from './salesReportPdf';

/** Anyone who works with job cards, the store or the bills can open the report. */
const READERS = ['service.job_cards.view', 'parts.stock.view', 'accounts.invoices.view', 'accounts.reports.view'];

type R = Record<string, unknown>;
type Col = Column & { right?: boolean };

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const today = () => iso(new Date());
const num = (v: unknown) => Number(v ?? 0) || 0;
const sum = (rows: R[], k: string) => Math.round(rows.reduce((n, r) => n + num(r[k]), 0) * 100) / 100;
const roNumber = (s: unknown) => String(s ?? '').split('-').pop() ?? '';
const money = (v: unknown) => (num(v) ? num(v).toLocaleString('en-PK', { maximumFractionDigits: 0 }) : '—');

/**
 * "Report" at the top right of the dashboard: the sales of the day (today to begin with) or of any dates chosen, one row
 * per customer bill with its RO and what was charged for parts, labour and lubricants, then the totals of the period.
 * Exports to Excel (CSV) and PDF.
 */
export function SalesReportButton() {
  const perm = usePermission();
  const dealerships = useMemo(() => {
    const seen = new Map<number, { name: string; code: string }>();
    for (const code of READERS) for (const d of perm.dealershipsFor(code)) seen.set(d.id, { name: d.name, code: d.code });
    return [...seen].map(([id, v]) => ({ id, name: v.name, code: v.code }));
  }, [perm]);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [dealershipId, setDealershipId] = useState<number | null>(null);
  const [viewing, setViewing] = useState(false);
  const shopId = dealershipId ?? dealerships[0]?.id ?? 0;
  const { data, isFetching, isError } = useGetDailySalesQuery({ dealershipId: shopId, from, to }, { skip: !open || !shopId });

  const rows = (data ?? []) as unknown as R[];
  const dealershipName = dealerships.find((d) => d.id === shopId)?.name ?? '';
  const multiDay = from !== to;
  const set = (a: string, b: string) => {
    setFrom(a);
    setTo(b);
  };
  const first = new Date();
  first.setDate(1);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const hasAccessories = rows.some((r) => num(r.accessories) > 0);
  const columns: Col[] = [
    ...(multiDay ? [{ header: 'Date', value: (r: R) => String(r.date), w: 1.1 }] : []),
    { header: 'Customer', value: (r) => String(r.customerName ?? '—'), w: 2.4 },
    { header: 'RO', value: (r) => roNumber(r.roNo) || '—', w: 0.9 },
    { header: 'Invoice', value: (r) => String(r.invoiceNo).split('-').slice(-2).join('-'), w: 1.3 },
    { header: 'Parts', value: (r) => num(r.parts), w: 1.2, right: true },
    ...(hasAccessories ? [{ header: 'Accessories', value: (r: R) => num(r.accessories), w: 1.2, right: true }] : []),
    { header: 'Labour', value: (r) => num(r.labour), w: 1.2, right: true },
    { header: 'Lubricants', value: (r) => num(r.lubricants), w: 1.2, right: true },
    { header: 'Sales tax', value: (r) => num(r.tax), w: 1.1, right: true },
    { header: 'Total', value: (r) => num(r.total), w: 1.3, right: true },
    { header: 'Paid', value: (r) => num(r.amountPaid), w: 1.3, right: true },
  ];
  const stats: [string, number][] = [
    ['Labour generated', sum(rows, 'labour')],
    ['Parts sold', sum(rows, 'parts')],
    ['Lubricants sold', sum(rows, 'lubricants')],
    ...(hasAccessories ? ([['Accessories sold', sum(rows, 'accessories')]] as [string, number][]) : []),
    ['Sales tax', sum(rows, 'tax')],
    ['Total billed', sum(rows, 'total')],
    ['Collected', sum(rows, 'amountPaid')],
  ];
  const period = multiDay ? `${from} to ${to}` : from;
  const fileName = `Sales report - ${period}`;
  const totalRow: R = {
    customerName: 'TOTAL',
    roNo: '',
    invoiceNo: '',
    parts: sum(rows, 'parts'),
    accessories: sum(rows, 'accessories'),
    labour: sum(rows, 'labour'),
    lubricants: sum(rows, 'lubricants'),
    tax: sum(rows, 'tax'),
    total: sum(rows, 'total'),
    amountPaid: sum(rows, 'amountPaid'),
  };
  const brand = workshopBrand(dealerships.find((d) => d.id === shopId)?.code);
  // Memoised: the PDF is drawn again whenever this function changes.
  const build = useMemo(
    () =>
      viewing && data?.length
        ? () => buildSalesReportPdf({ dealershipName, brand, period, columns: columns.map((c) => ({ header: c.header, w: c.w ?? 1, right: c.right, value: c.value as never })), rows, totalRow, stats })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewing, data, dealershipName, brand, period],
  );
  const pdf = usePdf(build);
  if (dealerships.length === 0) return null;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Report
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          size="xl"
          title="Sales report"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(fileName, columns, [...rows, totalRow])}>
                Export to Excel (CSV)
              </Button>
              <Button disabled={!rows.length} onClick={() => setViewing(true)}>
                View and print report
              </Button>
            </>
          }
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1.5">
              <Button size="sm" variant={from === today() && to === today() ? 'primary' : 'secondary'} onClick={() => set(today(), today())}>
                Today
              </Button>
              <Button size="sm" variant={from === iso(yesterday) && to === iso(yesterday) ? 'primary' : 'secondary'} onClick={() => set(iso(yesterday), iso(yesterday))}>
                Yesterday
              </Button>
              <Button size="sm" variant={from === iso(first) && to === today() ? 'primary' : 'secondary'} onClick={() => set(iso(first), today())}>
                This month
              </Button>
            </div>
            <label className="text-xs text-slate-500">
              From
              <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-0.5 w-40" />
            </label>
            <label className="text-xs text-slate-500">
              To
              <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-0.5 w-40" />
            </label>
            {dealerships.length > 1 && (
              <label className="text-xs text-slate-500">
                Dealership
                <Select value={shopId} onChange={(e) => setDealershipId(Number(e.target.value))} className="mt-0.5 w-auto">
                  {dealerships.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {dealershipName} · {period}. The bills issued in this period, by customer and RO. Sales tax is shown apart from labour, parts and lubricants.
          </p>
          {isFetching && <Spinner className="my-6 size-5 text-slate-400" />}
          {isError && <p className="my-4 text-sm text-red-600">The report could not be loaded.</p>}
          {!isFetching && !isError && rows.length === 0 && <p className="my-6 text-sm text-slate-500">No bills were issued in this period.</p>}
          {!isFetching && rows.length > 0 && (
            <>
              <div className="mt-3 max-h-[42vh] overflow-auto rounded-lg ring-1 ring-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
                    <tr>
                      {columns.map((c) => (
                        <th key={c.header} className={`px-2 py-2 font-medium ${c.right ? 'text-right' : ''}`}>
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={String(r.invoiceId)}>
                        {columns.map((c) => (
                          <td key={c.header} className={`px-2 py-1.5 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''}`}>
                            {c.right ? money(c.value(r)) : String(c.value(r))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold">
                    <tr>
                      {columns.map((c, i) => (
                        <td key={c.header} className={`px-2 py-2 ${c.right ? 'text-right tabular-nums' : ''}`}>
                          {c.right ? money(c.value(totalRow)) : i === (multiDay ? 1 : 0) ? 'TOTAL' : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="my-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {stats.map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-slate-900">{formatMoney(String(value))}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </Dialog>
      )}
      <PdfDialog open={viewing} onClose={() => setViewing(false)} title={`Sales report ${period}`} pdf={pdf} loading={viewing && !pdf} />
    </>
  );
}
