import { Fragment, useMemo, useState } from 'react';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { Button, Field, Input, PageHeader, Section, Select, Spinner } from '@/shared/components/ui';
import { buildTablePdf, downloadCsv, type Column } from '@/features/sales/exports/exporters';
import { usePermission } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { useSupplierOptions } from '../../hooks';
import { useGetPartsPurchaseReportQuery } from '../../partsApi';
import { P } from '../../permissions';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const qty = (v: string | number) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

const PART_COLUMNS: Column[] = [
  { header: 'Part no.', value: (r) => String(r.partNo), w: 1.3 },
  { header: 'Part name', value: (r) => String(r.description), w: 2.4 },
  { header: 'Ordered qty', value: (r) => Number(r.orderedQty) },
  { header: 'Received qty', value: (r) => Number(r.receivedQty) },
  { header: 'Received cost', value: (r) => Number(r.receivedCost) },
  { header: 'Average cost (each)', value: (r) => Number(r.averageCost) },
  { header: 'Lowest', value: (r) => (r.minCost == null ? '' : Number(r.minCost)) },
  { header: 'Highest', value: (r) => (r.maxCost == null ? '' : Number(r.maxCost)) },
  { header: 'Last cost', value: (r) => (r.lastCost == null ? '' : Number(r.lastCost)) },
  { header: 'Average of all time', value: (r) => (r.allTimeAverage == null ? '' : Number(r.allTimeAverage)) },
];
const HISTORY_COLUMNS: Column[] = [
  { header: 'Date', value: (r) => String(r.date) },
  { header: 'Time', value: (r) => String(r.time ?? '') },
  { header: 'Part no.', value: (r) => String(r.partNo) },
  { header: 'Part name', value: (r) => String(r.description), w: 2 },
  { header: 'Goods receipt', value: (r) => String(r.grnNo) },
  { header: 'Purchase order', value: (r) => String(r.poNo ?? '') },
  { header: 'Supplier', value: (r) => String(r.supplier), w: 1.4 },
  { header: 'Quantity', value: (r) => Number(r.quantity) },
  { header: 'Cost (each)', value: (r) => Number(r.unitCost) },
  { header: 'Amount', value: (r) => Number(r.amount) },
];

const Stat = ({ label, value, hint, plain }: { label: string; value: string; hint?: string; plain?: boolean }) => (
  <div className="surface p-4">
    <p className="text-xs font-medium tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{plain ? qty(value) : formatMoney(value)}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
  </div>
);

/** Up / down against the previous purchase of the same part. */
function Change({ now, before }: { now: number; before: number | null }) {
  if (before == null || before === now) return <span className="text-slate-400">–</span>;
  const diff = now - before;
  return (
    <span className={diff > 0 ? 'text-red-600' : 'text-emerald-600'}>
      {diff > 0 ? '▲' : '▼'} {formatMoney(String(Math.abs(diff)))} ({((diff / before) * 100).toFixed(0)}%)
    </span>
  );
}

/**
 * The purchase report: what was ordered and received in a period and what it cost. A part bought at different prices shows
 * the weighted average cost (total cost / pieces received) and, when opened, every purchase with the price going up or down.
 */
export default function PurchaseReportPage({ embedded = false }: { embedded?: boolean }) {
  const perm = usePermission();
  const dealerships = perm.dealershipsFor(P.stockView);
  const [dealershipId, setDealershipId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`);
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const branches = dealershipId ? perm.branchesFor(P.stockView, Number(dealershipId)) : [];
  const suppliers = useSupplierOptions(dealershipId ? Number(dealershipId) : dealerships[0]?.id);
  const { data, isFetching, isError } = useGetPartsPurchaseReportQuery({
    dealershipId: dealershipId ? Number(dealershipId) : undefined,
    branchId: branchId ? Number(branchId) : undefined,
    supplierId: supplierId ? Number(supplierId) : undefined,
    from: from || undefined,
    to: to || undefined,
    q: q.trim() || undefined,
  });

  const [preview, setPreview] = useState<{ name: string; sub: string; foot: string } | null>(null);
  const history = useMemo(() => {
    const by = new Map<number, NonNullable<typeof data>['lines']>();
    for (const l of data?.lines ?? []) by.set(l.partId, [...(by.get(l.partId) ?? []), l]);
    return by;
  }, [data]);
  const parts = (data?.parts ?? []) as unknown as Record<string, unknown>[];
  const where = dealerships.find((d) => String(d.id) === dealershipId)?.name ?? 'All dealerships';
  const label = `${from || 'start'} to ${to || 'today'}`;
  const name = `Purchase report - ${from || 'start'} to ${to || today()}`;
  const build = useMemo(() => (preview ? () => buildTablePdf(preview.name, 'Store: purchase report', preview.sub, PART_COLUMNS, parts as never, preview.foot) : null), [preview, parts]);
  const pdf = usePdf(build);
  const withNames = () => {
    const byId = new Map((data?.parts ?? []).map((p) => [p.partId, p]));
    return (data?.lines ?? []).map((l) => ({ ...l, partNo: byId.get(l.partId)?.partNo ?? '', description: byId.get(l.partId)?.description ?? '' })) as unknown as Record<string, unknown>[];
  };

  return (
    <div>
      {embedded ? (
        <div className="mb-5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-sm text-slate-600">What was ordered and received in a period and what it cost. Open a part to see every purchase and how the price moved.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!parts.length} onClick={() => downloadCsv(name, PART_COLUMNS, parts)}>
                Download Excel (summary)
              </Button>
              <Button variant="primary" disabled={!parts.length} onClick={() => setPreview({ name, sub: `${where} · ${label}`, foot: `Received cost ${formatMoney(data!.totals.receivedCost)} · ordered ${formatMoney(data!.totals.orderedValue)}. Average cost = total cost ÷ pieces received.` })}>
                View / print report
              </Button>
              <Button variant="secondary" disabled={!data?.lines.length} onClick={() => downloadCsv(`${name} - every purchase`, HISTORY_COLUMNS, withNames())}>
                Download Excel (every purchase)
              </Button>
            </div>
        </div>
      ) : (
        <PageHeader
          title="Purchase report"
          subtitle="What was ordered and received in a period, and what it cost. A part bought at different prices shows its average cost (total cost ÷ pieces received); open a part to see every purchase and how the price moved."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!parts.length} onClick={() => downloadCsv(name, PART_COLUMNS, parts)}>
                Summary (Excel)
              </Button>
              <Button variant="secondary" disabled={!parts.length} onClick={() => setPreview({ name, sub: `${where} · ${label}`, foot: `Received cost ${formatMoney(data!.totals.receivedCost)} · ordered ${formatMoney(data!.totals.orderedValue)}. Average cost = total cost ÷ pieces received.` })}>
                Summary (view / print)
              </Button>
              <Button variant="secondary" disabled={!data?.lines.length} onClick={() => downloadCsv(`${name} - every purchase`, HISTORY_COLUMNS, withNames())}>
                Every purchase (Excel)
              </Button>
            </div>
          }
        />
      )}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="pu-d">
            <Select
              id="pu-d"
              value={dealershipId}
              onChange={(e) => {
                setDealershipId(e.target.value);
                setBranchId('');
                setSupplierId('');
              }}
            >
              <option value="">All dealerships</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {branches.length > 1 && (
          <Field label="Store" htmlFor="pu-b">
            <Select id="pu-b" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All stores</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Supplier" htmlFor="pu-s">
          <Select id="pu-s" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="pu-from">
          <Input id="pu-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="pu-to">
          <Input id="pu-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Part" htmlFor="pu-q">
          <Input id="pu-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Part number or name" />
        </Field>
      </div>

      {isFetching && !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : isError || !data ? (
        <p className="py-10 text-center text-sm text-red-600">The report could not be loaded.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ordered" value={data.totals.orderedValue} hint="on purchase orders in the period" />
            <Stat label="Received" value={data.totals.receivedCost} hint="at cost, goods receipts in the period" />
            <Stat label="Pieces received" value={data.totals.receivedQty} plain />
            <Stat label="Different parts" value={String(data.totals.partsCount)} plain />
          </div>
          <Section title="By part">
            {!parts.length ? (
              <p className="py-6 text-center text-sm text-slate-500">Nothing was ordered or received in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-right text-xs font-medium tracking-wide text-slate-500">
                      <th className="py-2 pr-3 text-left font-medium">Part</th>
                      <th className="py-2 pr-3 font-medium">Ordered</th>
                      <th className="py-2 pr-3 font-medium">Received</th>
                      <th className="py-2 pr-3 font-medium">Received cost</th>
                      <th className="py-2 pr-3 font-medium">Average cost</th>
                      <th className="py-2 pr-3 font-medium">Lowest</th>
                      <th className="py-2 pr-3 font-medium">Highest</th>
                      <th className="py-2 pr-3 font-medium">Last</th>
                      <th className="py-2 font-medium">Average, all time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.parts.map((p) => {
                      const ls = history.get(p.partId) ?? [];
                      const varies = p.minCost != null && p.minCost !== p.maxCost;
                      return (
                        <Fragment key={p.partId}>
                          <tr className={`text-right tabular-nums ${ls.length ? 'cursor-pointer hover:bg-slate-50' : ''}`} onClick={() => ls.length && setOpen(open === p.partId ? null : p.partId)}>
                            <td className="py-2 pr-3 text-left">
                              <span className="block font-mono text-xs text-slate-900">{p.partNo}</span>
                              <span className="block max-w-xs truncate text-slate-600">{p.description}</span>
                            </td>
                            <td className="py-2 pr-3">{qty(p.orderedQty)}</td>
                            <td className="py-2 pr-3">{qty(p.receivedQty)}</td>
                            <td className="py-2 pr-3">{formatMoney(p.receivedCost)}</td>
                            <td className="py-2 pr-3 font-semibold">
                              {formatMoney(p.averageCost)}
                              {varies && (
                                <span className="ml-1 text-xs font-normal text-amber-600" title="Bought at different prices">
                                  avg
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3">{p.minCost == null ? '–' : formatMoney(p.minCost)}</td>
                            <td className="py-2 pr-3">{p.maxCost == null ? '–' : formatMoney(p.maxCost)}</td>
                            <td className="py-2 pr-3">{p.lastCost == null ? '–' : formatMoney(p.lastCost)}</td>
                            <td className="py-2">{p.allTimeAverage == null ? '–' : formatMoney(p.allTimeAverage)}</td>
                          </tr>
                          {open === p.partId && (
                            <tr>
                              <td colSpan={9} className="bg-slate-50 px-3 py-3">
                                <table className="min-w-full text-xs">
                                  <thead>
                                    <tr className="text-left font-medium text-slate-500">
                                      <th className="py-1 pr-3 font-medium">Date and time</th>
                                      <th className="py-1 pr-3 font-medium">Goods receipt</th>
                                      <th className="py-1 pr-3 font-medium">Purchase order</th>
                                      <th className="py-1 pr-3 font-medium">Supplier</th>
                                      <th className="py-1 pr-3 text-right font-medium">Quantity</th>
                                      <th className="py-1 pr-3 text-right font-medium">Cost (each)</th>
                                      <th className="py-1 pr-3 text-right font-medium">Against the one before</th>
                                      <th className="py-1 text-right font-medium">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="tabular-nums">
                                    {ls.map((l, i) => (
                                      <tr key={`${l.grnNo}-${i}`} className="border-t border-slate-200">
                                        <td className="py-1 pr-3 whitespace-nowrap">{l.date}, {l.time}</td>
                                        <td className="py-1 pr-3 font-mono">{l.grnNo}</td>
                                        <td className="py-1 pr-3 font-mono">{l.poNo ?? '–'}</td>
                                        <td className="py-1 pr-3">{l.supplier}</td>
                                        <td className="py-1 pr-3 text-right">{qty(l.quantity)}</td>
                                        <td className="py-1 pr-3 text-right">{formatMoney(l.unitCost)}</td>
                                        <td className="py-1 pr-3 text-right">
                                          <Change now={Number(l.unitCost)} before={i > 0 ? Number(ls[i - 1]!.unitCost) : null} />
                                        </td>
                                        <td className="py-1 text-right">{formatMoney(l.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
      <PdfDialog open={!!preview} onClose={() => setPreview(null)} title="Purchase report" pdf={pdf} loading={!!preview && !pdf} />
    </div>
  );
}
