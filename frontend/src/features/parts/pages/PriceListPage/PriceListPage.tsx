import { useEffect, useMemo, useState } from 'react';
import { PdfDialog, usePdf } from '@/features/sales/documents/DocumentPreview';
import { Button, Field, Input, PageHeader, Pagination, Select, Spinner } from '@/shared/components/ui';
import { buildTablePdf, saveCsv, type Column } from '@/features/sales/exports/exporters';
import { useAppDispatch, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { usePartModelOptions } from '../../hooks/usePartModelOptions';
import { useStoreBrand } from '../../hooks/useStoreBrand';
import { type Part, partsApi, useListPartCategoriesQuery, useListPartsQuery } from '../../partsApi';
import { P } from '../../permissions';

const PAGE = 30;
const TAX = 0.18;
/** The price list gives the final price (with 18% sales tax); the price without tax and the tax are worked back from it. */
const split = (final: string) => {
  const f = Number(final);
  const ex = Math.round((f / (1 + TAX)) * 100) / 100;
  return { ex, tax: Math.round((f - ex) * 100) / 100, final: f };
};

const COLUMNS: Column[] = [
  { header: 'Part code', value: (r) => String(r.partNo) },
  { header: 'Part name', value: (r) => String(r.description) },
  { header: 'Category', value: (r) => String(r.category ?? '') },
  { header: 'Retail price', value: (r) => (r.purchasePrice == null ? '' : Number(r.purchasePrice)) },
  { header: 'MRP without sales tax', value: (r) => split(String(r.sellingPrice)).ex },
  { header: 'Sales tax @ 18%', value: (r) => split(String(r.sellingPrice)).tax },
  { header: 'Customer price (final MRP with sales tax)', value: (r) => split(String(r.sellingPrice)).final },
];

/** The price list: look up any part's price. Read-only; the whole list can be downloaded. */
export default function PriceListPage() {
  const toast = useToast();
  const dispatch = useAppDispatch();
  const { brands, brand, setBrand } = useStoreBrand(P.catalogView);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  // The vehicle (X70 Plus, Dashing, T1, T2): only the parts that fit it.
  const [modelId, setModelId] = useState('');
  const models = usePartModelOptions(brand);
  const modelName = (id: number) => models.find((m) => m.value === String(id))?.label.replace(`${brand} `, '') ?? '';
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data: categories } = useListPartCategoriesQuery({ brand: brand || undefined });
  const { data, isFetching } = useListPartsQuery({ brand: brand || undefined, category: category || undefined, modelId: modelId ? Number(modelId) : undefined, q: q || undefined, isActive: 'true', sort: 'partNo', page, pageSize: PAGE });

  // The whole list (every part matching the search and filters) opens as a report: view it, then print or download (PDF or Excel).
  const [report, setReport] = useState<{ name: string; sub: string; rows: Part[] } | null>(null);
  const vehicleOf = (r: Record<string, unknown>) => ((r.modelIds as number[] | undefined) ?? []).map(modelName).join(', ');
  const PDF_COLUMNS: Column[] = [
    { header: 'Part code', value: COLUMNS[0]!.value, w: 1.4 },
    { header: 'Part name', value: COLUMNS[1]!.value, w: 2.6 },
    { header: 'Category', value: COLUMNS[2]!.value, w: 1.6 },
    { header: 'Vehicle', value: vehicleOf, w: 1.3 },
    { header: 'MRP without sales tax', value: COLUMNS[4]!.value },
    { header: 'Sales tax @ 18%', value: COLUMNS[5]!.value },
    { header: 'Customer price (with sales tax)', value: COLUMNS[6]!.value },
  ];
  const excelColumns: Column[] = [...COLUMNS, { header: 'Vehicle', value: vehicleOf }];
  const build = useMemo(
    () => (report ? () => buildTablePdf(report.name, 'Price list', report.sub, PDF_COLUMNS, report.rows as unknown as Record<string, unknown>[]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report],
  );
  const pdf = usePdf(build);

  const open = async () => {
    setBusy(true);
    try {
      const args = { brand: brand || undefined, category: category || undefined, modelId: modelId ? Number(modelId) : undefined, q: q || undefined, isActive: 'true' as const, sort: 'partNo' };
      const get = (p: number) => dispatch(partsApi.endpoints.listParts.initiate({ ...args, page: p, pageSize: 100 }, { forceRefetch: true })).unwrap();
      const first = await get(1);
      const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / 100) - 1) }, (_, i) => get(i + 2)));
      const rows: Part[] = [...first.items, ...rest.flatMap((r) => r.items)];
      if (!rows.length) return toast.error('No part matches');
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      setReport({ name: `${brand || 'Parts'}${modelId ? ` ${modelName(Number(modelId))}` : ''} price list - ${day}`, sub: `${rows.length} parts · ${day}`, rows });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Price list"
        subtitle="Look up the price of any part: search by part code or name."
        actions={
          <Button variant="secondary" loading={busy} onClick={() => void open()}>
            Price list report (view, print or download)
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="pl-q" className="min-w-56 flex-1">
          <Input id="pl-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Part code or part name" autoFocus />
        </Field>
        {brands.length > 1 && (
          <Field label="Brand" htmlFor="pl-brand">
            <Select id="pl-brand" value={brand} onChange={(e) => { setBrand(e.target.value); setCategory(''); setPage(1); }}>
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Vehicle" htmlFor="pl-model">
          <Select id="pl-model" value={modelId} onChange={(e) => { setModelId(e.target.value); setPage(1); }}>
            <option value="">All vehicles</option>
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="pl-cat">
          <Select id="pl-cat" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      {data && <p className="mb-3 text-sm text-slate-600">{data.total.toLocaleString()} parts</p>}
      <div className="surface relative overflow-x-auto p-2 sm:p-4">
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-slate-400" />}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Part code</th>
              <th className="py-2 pr-3 font-medium">Part name</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 font-medium">Vehicle</th>
              <th className="py-2 pr-3 text-right font-medium">Retail price</th>
              <th className="py-2 pr-3 text-right font-medium">MRP without sales tax</th>
              <th className="py-2 pr-3 text-right font-medium">Sales tax @ 18%</th>
              <th className="py-2 text-right font-medium">Customer price (with sales tax)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {modelId ? 'No part is assigned to this vehicle yet. The store manager assigns vehicles under Parts and prices.' : 'No part matches.'}
                </td>
              </tr>
            )}
            {data?.items.map((p) => {
              const s = split(p.sellingPrice);
              return (
                <tr key={p.id}>
                  <td className="py-2 pr-3 font-mono text-xs">{p.partNo}</td>
                  <td className="py-2 pr-3">{p.description}</td>
                  <td className="py-2 pr-3 text-slate-500">{p.category}</td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{(p.modelIds ?? []).length ? (p.modelIds ?? []).map(modelName).join(', ') : 'Not set'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.purchasePrice == null ? <span className="text-slate-400">not set</span> : formatMoney(p.purchasePrice)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(String(s.ex))}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(String(s.tax))}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{formatMoney(String(s.final))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.total > PAGE && <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
      </div>
      <PdfDialog
        open={!!report}
        onClose={() => setReport(null)}
        title="Price list"
        pdf={pdf}
        loading={!!report && !pdf}
        extra={
          <Button variant="secondary" onClick={() => report && saveCsv(report.name, excelColumns, report.rows as unknown as Record<string, unknown>[])}>
            Download Excel (CSV)
          </Button>
        }
      />
    </div>
  );
}
