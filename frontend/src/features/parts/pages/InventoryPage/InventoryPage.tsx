import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Dialog, Field, Input, PageHeader, Pagination, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { StockMovementsTable } from '../../components/StockMovementsTable';
import { usePartModelOptions } from '../../hooks/usePartModelOptions';
import { useStoreBrand } from '../../hooks/useStoreBrand';
import { type InventoryRow, useGetInventoryQuery, useListPartCategoriesQuery } from '../../partsApi';
import { P } from '../../permissions';

const PAGE = 25;

/**
 * Every part of the brand with what is in the store now, and what came in and went out this month. Receive
 * or issue straight from a row; "History" is the part's full in / out record.
 */
export default function InventoryPage() {
  const perm = usePermission();
  const { brands, brand, setBrand } = useStoreBrand(P.stockView);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [view, setView] = useState<'all' | 'inStock' | 'low'>('inStock');
  const [modelId, setModelId] = useState('');
  const models = usePartModelOptions(brand);
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<InventoryRow | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data: categories } = useListPartCategoriesQuery({ brand: brand || undefined });
  const { data, isFetching } = useGetInventoryQuery({
    brand: brand || undefined,
    category: category || undefined,
    modelId: modelId ? Number(modelId) : undefined,
    q: q || undefined,
    inStock: view === 'inStock' ? 'true' : undefined,
    lowStock: view === 'low' ? 'true' : undefined,
    page,
    pageSize: PAGE,
  });
  const canReceive = perm.can(P.receiptsCreate);
  const canIssue = perm.can(P.issuesCreate);

  return (
    <div>
      <PageHeader
        title="Store stock"
        subtitle="Every part with what is in the store now, and what came in and went out this month."
        actions={
          <div className="flex gap-2">
            {canReceive && (
              <Link to="/parts/receive">
                <Button>Receive parts</Button>
              </Link>
            )}
            {canIssue && (
              <Link to="/parts/issue">
                <Button variant="secondary">Issue parts</Button>
              </Link>
            )}
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="inv-q" className="min-w-56 flex-1">
          <Input id="inv-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Part number or name" />
        </Field>
        {brands.length > 1 && (
          <Field label="Brand" htmlFor="inv-brand">
            <Select
              id="inv-brand"
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setCategory('');
                setPage(1);
              }}
            >
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Vehicle" htmlFor="inv-model">
          <Select id="inv-model" value={modelId} onChange={(e) => { setModelId(e.target.value); setPage(1); }}>
            <option value="">All vehicles</option>
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="inv-cat">
          <Select
            id="inv-cat"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Show" htmlFor="inv-view">
          <Select
            id="inv-view"
            value={view}
            onChange={(e) => {
              setView(e.target.value as typeof view);
              setPage(1);
            }}
          >
            <option value="inStock">Parts in stock</option>
            <option value="low">Low stock (at or below reorder level)</option>
            <option value="all">All parts (also with none in stock)</option>
          </Select>
        </Field>
      </div>

      {data && (
        <p className="mb-3 text-sm text-slate-600">
          {data.total.toLocaleString()} parts shown · <span className="font-medium text-slate-900">{data.partsInStock.toLocaleString()}</span> in stock · stock value at cost{' '}
          <span className="font-medium text-slate-900">{formatMoney(data.stockValue)}</span>
        </p>
      )}
      <div className="surface relative overflow-x-auto p-2 sm:p-4">
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-slate-400" />}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Part no.</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 text-right font-medium">Price</th>
              <th className="py-2 pr-3 text-right font-medium">In stock</th>
              <th className="py-2 pr-3 text-right font-medium">In this month</th>
              <th className="py-2 pr-3 text-right font-medium">Out this month</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  {view === 'inStock' ? 'No part is in stock yet. Use "Receive parts" when stock arrives from head office, or show all parts.' : 'No part matches.'}
                </td>
              </tr>
            )}
            {data?.items.map((r) => {
              const low = Number(r.reorderLevel) > 0 && Number(r.onHand) <= Number(r.reorderLevel);
              return (
                <tr key={r.partId}>
                  <td className="py-2 pr-3 font-mono text-xs">{r.partNo}</td>
                  <td className="py-2 pr-3">{r.description}</td>
                  <td className="py-2 pr-3 text-slate-500">{r.category}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(r.sellingPrice)}</td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {Number(r.onHand)} {low && <Badge tone="amber">Low</Badge>}
                  </td>
                  <td className="py-2 pr-3 text-right text-emerald-700 tabular-nums">{Number(r.inThisMonth) ? `+${Number(r.inThisMonth)}` : '–'}</td>
                  <td className="py-2 pr-3 text-right text-red-600 tabular-nums">{Number(r.outThisMonth) ? `−${Number(r.outThisMonth)}` : '–'}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {canReceive && (
                      <Link className="mr-3 text-xs text-brand-700 hover:underline" to={`/parts/receive?partNo=${encodeURIComponent(r.partNo)}`}>
                        Stock in
                      </Link>
                    )}
                    {canIssue && (
                      <Link className="mr-3 text-xs text-brand-700 hover:underline" to={`/parts/issue?partNo=${encodeURIComponent(r.partNo)}`}>
                        Stock out
                      </Link>
                    )}
                    <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setHistory(r)}>
                      History
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && data.total > PAGE && <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
      </div>

      <Dialog open={!!history} size="xl" onClose={() => setHistory(null)} title={history ? `${history.partNo} · ${history.description}` : ''} footer={<Button variant="secondary" onClick={() => setHistory(null)}>Close</Button>}>
        {history && (
          <>
            <p className="mb-3 text-sm text-slate-600">
              In stock now: <span className="font-semibold text-slate-900">{Number(history.onHand)}</span>. Every stock in and out of this part, newest first. These records can never be changed.
            </p>
            <StockMovementsTable filter={{ partId: history.partId }} pageSize={15} />
          </>
        )}
      </Dialog>
    </div>
  );
}
