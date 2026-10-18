import { useState } from 'react';
import { Button, Field, Input, PageHeader, Section, Select, Spinner } from '@/shared/components/ui';
import { downloadCsv, downloadTablePdf, type Column } from '@/features/sales/exports/exporters';
import { usePermission, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { useGetPartsMonthlyReportQuery, useLazyGetStockSheetQuery } from '../../partsApi';
import { P } from '../../permissions';

const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const stamp = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

const MONTH_COLUMNS: Column[] = [
  { header: 'Month', value: (r) => monthName(String(r.month)), w: 1.4 },
  { header: 'Parts received (cost)', value: (r) => Number(r.receivedCost) },
  { header: 'Parts issued (cost)', value: (r) => Number(r.issuedCost) },
  { header: 'Taken back (cost)', value: (r) => Number(r.returnedCost) },
  { header: 'Net out (cost)', value: (r) => Number(r.netCost) },
  { header: 'Revenue (price charged)', value: (r) => Number(r.netSales) },
  { header: 'Margin', value: (r) => Number(r.margin) },
  { header: 'Adjustments (cost)', value: (r) => Number(r.adjustmentCost) },
];
const STOCK_COLUMNS: Column[] = [
  { header: 'Store', value: (r) => String(r.branchName) },
  { header: 'Part no.', value: (r) => String(r.partNo) },
  { header: 'Description', value: (r) => String(r.description) },
  { header: 'Category', value: (r) => String(r.category ?? '') },
  { header: 'In stock', value: (r) => Number(r.quantityOnHand) },
  { header: 'Average cost', value: (r) => Number(r.averageCost) },
  { header: 'Stock value (cost)', value: (r) => Number(r.stockValue) },
  { header: 'Price list', value: (r) => Number(r.sellingPrice) },
  { header: 'Stock value (price list)', value: (r) => Number(r.saleValue) },
  { header: 'Bin', value: (r) => String(r.binLocation ?? '') },
  { header: 'Reorder level', value: (r) => Number(r.reorderLevel) },
];

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="surface p-4">
    <p className="text-xs font-medium tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{formatMoney(value)}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
  </div>
);

/**
 * The store's monthly figures: parts in (received from head office), parts out (issued to repair orders /
 * job cards), the revenue (price charged), the margin, and what is in stock now. Everything can be downloaded.
 */
export default function PartsReportPage() {
  const perm = usePermission();
  const toast = useToast();
  const dealerships = perm.dealershipsFor(P.stockView);
  const [dealershipId, setDealershipId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const branches = dealershipId ? perm.branchesFor(P.stockView, Number(dealershipId)) : [];
  const arg = {
    dealershipId: dealershipId ? Number(dealershipId) : undefined,
    branchId: branchId ? Number(branchId) : undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const { data, isFetching, isError } = useGetPartsMonthlyReportQuery(arg);
  const [loadSheet, { isFetching: loadingSheet }] = useLazyGetStockSheetQuery();
  const label = `${from ? monthName(from) : 'last 6 months'}${to ? ` to ${monthName(to)}` : ''}`;
  const where = dealerships.find((d) => String(d.id) === dealershipId)?.name ?? 'All dealerships';

  const monthRows = (data?.months ?? []) as Record<string, unknown>[];
  const downloadMonths = () => downloadCsv(`Store parts in and out - ${stamp()}`, MONTH_COLUMNS, [...monthRows, { month: 'Total', ...data!.totals }].map((r) => ({ ...r, month: r.month })) as never);
  const downloadStock = async () => {
    try {
      const rows = (await loadSheet({ dealershipId: arg.dealershipId, branchId: arg.branchId, includeZero: 'false' }).unwrap()) as unknown as Record<string, unknown>[];
      if (!rows.length) return toast.error('There is no stock in the store yet');
      downloadCsv(`Store stock sheet - ${stamp()}`, STOCK_COLUMNS, rows);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Store report"
        subtitle="Parts in and out of the store each month, the revenue from the parts issued, and the stock now."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!data} onClick={downloadMonths}>
              Monthly report (Excel)
            </Button>
            <Button
              variant="secondary"
              disabled={!data}
              onClick={() => downloadTablePdf(`Store parts in and out - ${stamp()}`, 'Store: parts in and out', `${where} · ${label}`, MONTH_COLUMNS, monthRows, 'Revenue is the price charged for the parts issued, less parts taken back. Margin = revenue − cost.')}
            >
              Monthly report (PDF)
            </Button>
            <Button variant="secondary" loading={loadingSheet} onClick={downloadStock}>
              Stock sheet (Excel)
            </Button>
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="pr-d">
            <Select
              id="pr-d"
              value={dealershipId}
              onChange={(e) => {
                setDealershipId(e.target.value);
                setBranchId('');
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
          <Field label="Store" htmlFor="pr-b">
            <Select id="pr-b" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">All stores</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="From month" htmlFor="pr-from">
          <Input id="pr-from" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To month" htmlFor="pr-to">
          <Input id="pr-to" type="month" value={to} onChange={(e) => setTo(e.target.value)} />
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
            <Stat label="Parts in (received)" value={data.totals.receivedCost} hint="at cost, from head office" />
            <Stat label="Parts out (issued)" value={data.totals.netCost} hint="at cost, less parts taken back" />
            <Stat label="Revenue" value={data.totals.netSales} hint="price charged for parts issued" />
            <Stat label="Margin" value={data.totals.margin} hint="revenue − cost" />
          </div>

          <Section title="Month by month">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs font-medium tracking-wide text-slate-500">
                    <th className="py-2 pr-3 text-left font-medium">Month</th>
                    <th className="py-2 pr-3 font-medium">Received (cost)</th>
                    <th className="py-2 pr-3 font-medium">Issued (cost)</th>
                    <th className="py-2 pr-3 font-medium">Taken back (cost)</th>
                    <th className="py-2 pr-3 font-medium">Revenue</th>
                    <th className="py-2 pr-3 font-medium">Margin</th>
                    <th className="py-2 font-medium">Adjustments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-right tabular-nums">
                  {data.months.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        No parts moved in this period.
                      </td>
                    </tr>
                  )}
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className="py-2 pr-3 text-left font-medium">{monthName(m.month)}</td>
                      <td className="py-2 pr-3">{formatMoney(m.receivedCost)}</td>
                      <td className="py-2 pr-3">{formatMoney(m.issuedCost)}</td>
                      <td className="py-2 pr-3">{formatMoney(m.returnedCost)}</td>
                      <td className="py-2 pr-3 font-medium">{formatMoney(m.netSales)}</td>
                      <td className="py-2 pr-3">{formatMoney(m.margin)}</td>
                      <td className="py-2">{formatMoney(m.adjustmentCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="By category">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-right text-xs font-medium tracking-wide text-slate-500">
                    <th className="py-2 pr-3 text-left font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Received (cost)</th>
                    <th className="py-2 pr-3 font-medium">Issued (cost)</th>
                    <th className="py-2 font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-right tabular-nums">
                  {data.categories.map((c) => (
                    <tr key={c.category}>
                      <td className="py-2 pr-3 text-left">{c.category}</td>
                      <td className="py-2 pr-3">{formatMoney(c.receivedCost)}</td>
                      <td className="py-2 pr-3">{formatMoney(c.netCost)}</td>
                      <td className="py-2">{formatMoney(c.netSales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <p className="text-xs text-slate-500">Cost is the average cost of the parts in the store. Revenue is the price charged when the part was issued (the price list unless changed), less parts taken back. Prices include sales tax, as on the Jetour price list.</p>
        </div>
      )}
    </div>
  );
}
