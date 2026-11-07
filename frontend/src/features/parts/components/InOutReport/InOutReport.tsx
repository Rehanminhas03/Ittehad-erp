import { useMemo, useState } from 'react';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { Button, Dialog, Input, Select, Spinner } from '@/shared/components/ui';
import { buildTablePdf, downloadCsv, type Column } from '@/features/sales/exports/exporters';
import { usePermission } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { useGetPartsInOutReportQuery } from '../../partsApi';
import { P } from '../../permissions';

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const today = () => iso(new Date());
const qty = (v: string | number) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

const COLUMNS: Column[] = [
  { header: 'Part no.', value: (r) => String(r.partNo), w: 1.3 },
  { header: 'Part name', value: (r) => String(r.description), w: 2.6 },
  { header: 'Pieces in', value: (r) => Number(r.inQty) },
  { header: 'Cost in', value: (r) => Number(r.inCost) },
  { header: 'Pieces out', value: (r) => Number(r.outQty) },
  { header: 'Cost out', value: (r) => Number(r.outCost) },
  { header: 'Price charged (out)', value: (r) => Number(r.outPrice) },
];

/**
 * "Parts in and out" at the top of Store stock: for the dates chosen, how many pieces of each part came in and went out, what
 * they cost, and the price charged for what went out. Excel (CSV) and PDF.
 */
export function InOutReportButton() {
  const perm = usePermission();
  const dealerships = perm.dealershipsFor(P.stockView);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [dealershipId, setDealershipId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState(false);
  const branches = dealershipId ? perm.branchesFor(P.stockView, Number(dealershipId)) : [];
  const { data, isFetching, isError } = useGetPartsInOutReportQuery(
    { dealershipId: dealershipId ? Number(dealershipId) : undefined, branchId: branchId ? Number(branchId) : undefined, from, to, q: q.trim() || undefined },
    { skip: !open },
  );
  const rows = (data?.parts ?? []) as unknown as Record<string, unknown>[];
  const where = dealerships.find((d) => String(d.id) === dealershipId)?.name ?? (dealerships.length === 1 ? dealerships[0]!.name : 'All dealerships');
  const name = `Parts in and out - ${from} to ${to}`;
  const totalRow = data ? { partNo: 'TOTAL', description: '', ...data.totals } : null;

  // Memoised: the PDF is drawn again whenever this function changes.
  const build = useMemo(
    () =>
      viewing && data && rows.length
        ? () => buildTablePdf(name, 'Store: parts in and out', `${where} · ${from} to ${to}`, COLUMNS, [...rows, totalRow as never], 'In: received, transferred in, taken back from the workshop, adjusted up. Out: issued, transferred out, adjusted down. Price charged is for the parts issued, less parts taken back.')
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewing, data, name, where],
  );
  const pdf = usePdf(build);

  const set = (a: string, b: string) => {
    setFrom(a);
    setTo(b);
  };
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const first = new Date();
  first.setDate(1);
  const lastMonthStart = new Date();
  lastMonthStart.setDate(1);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthEnd = new Date();
  lastMonthEnd.setDate(0);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const preset = (label: string, a: string, b: string) => (
    <Button size="sm" variant={from === a && to === b ? 'primary' : 'secondary'} onClick={() => set(a, b)}>
      {label}
    </Button>
  );

  if (dealerships.length === 0) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Parts in and out report
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          size="xl"
          title="Parts in and out"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button variant="secondary" disabled={!rows.length} onClick={() => downloadCsv(name, COLUMNS, [...rows, totalRow as never])}>
                Export to Excel (CSV)
              </Button>
              <Button disabled={!rows.length} onClick={() => setViewing(true)}>
                View and print report
              </Button>
            </>
          }
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-1.5">
              {preset('Today', today(), today())}
              {preset('Yesterday', iso(yesterday), iso(yesterday))}
              {preset('This week', iso(monday), today())}
              {preset('This month', iso(first), today())}
              {preset('Last month', iso(lastMonthStart), iso(lastMonthEnd))}
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
                <Select
                  value={dealershipId}
                  onChange={(e) => {
                    setDealershipId(e.target.value);
                    setBranchId('');
                  }}
                  className="mt-0.5 w-auto"
                >
                  <option value="">All</option>
                  {dealerships.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {branches.length > 1 && (
              <label className="text-xs text-slate-500">
                Store
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-0.5 w-auto">
                  <option value="">All</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="text-xs text-slate-500">
              Part
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number or name" className="mt-0.5 w-44" />
            </label>
          </div>

          {isFetching && !data ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-6 text-slate-400" />
            </div>
          ) : isError ? (
            <p className="mt-5 text-sm text-red-600">The report could not be loaded.</p>
          ) : !rows.length ? (
            <p className="mt-5 text-sm text-slate-500">No parts came in or went out in this period.</p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                  ['Pieces in', qty(data!.totals.inQty)],
                  ['Cost in', formatMoney(data!.totals.inCost)],
                  ['Pieces out', qty(data!.totals.outQty)],
                  ['Cost out', formatMoney(data!.totals.outCost)],
                  ['Price charged (out)', formatMoney(data!.totals.outPrice)],
                ].map(([label, value]) => (
                  <div key={label} className="surface p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="text-lg font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 max-h-[50vh] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200 text-right text-xs font-medium tracking-wide text-slate-500">
                      <th className="py-2 pr-3 text-left font-medium">Part</th>
                      <th className="py-2 pr-3 font-medium">Pieces in</th>
                      <th className="py-2 pr-3 font-medium">Cost in</th>
                      <th className="py-2 pr-3 font-medium">Pieces out</th>
                      <th className="py-2 pr-3 font-medium">Cost out</th>
                      <th className="py-2 font-medium">Price charged (out)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {data!.parts.map((p) => (
                      <tr key={p.partId} className="text-right">
                        <td className="py-1.5 pr-3 text-left">
                          <span className="block font-mono text-xs text-slate-900">{p.partNo}</span>
                          <span className="block max-w-xs truncate text-slate-600">{p.description}</span>
                        </td>
                        <td className="py-1.5 pr-3">{Number(p.inQty) ? qty(p.inQty) : '–'}</td>
                        <td className="py-1.5 pr-3">{Number(p.inCost) ? formatMoney(p.inCost) : '–'}</td>
                        <td className="py-1.5 pr-3">{Number(p.outQty) ? qty(p.outQty) : '–'}</td>
                        <td className="py-1.5 pr-3">{Number(p.outCost) ? formatMoney(p.outCost) : '–'}</td>
                        <td className="py-1.5">{Number(p.outPrice) ? formatMoney(p.outPrice) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Dialog>
      )}
      <PdfDialog open={viewing} onClose={() => setViewing(false)} title={`Parts in and out ${from} to ${to}`} pdf={pdf} loading={viewing && !pdf} />
    </>
  );
}
