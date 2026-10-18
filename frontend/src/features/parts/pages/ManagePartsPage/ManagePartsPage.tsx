import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input, PageHeader, Pagination, Select, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { useStoreBrand } from '../../hooks/useStoreBrand';
import { type Part, useAddPartMutation, useChangePartMutation, useChangePricesMutation, useListPartCategoriesQuery, useListPartsQuery } from '../../partsApi';
import { P } from '../../permissions';

const PAGE = 25;
const clean = (s: string) => s.replace(/,/g, '').trim();

/**
 * The store manager's desk: add a part, change a part number / name / category / price, or raise or lower
 * every price of the brand (or a category) by a percentage. Every change is recorded with who made it.
 */
export default function ManagePartsPage() {
  const toast = useToast();
  const { brands, brand, setBrand } = useStoreBrand(P.catalogManage);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Part | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  const { data: categories } = useListPartCategoriesQuery({ brand: brand || undefined });
  const { data, isFetching } = useListPartsQuery({ brand: brand || undefined, category: category || undefined, q: q || undefined, sort: 'partNo', page, pageSize: PAGE });

  return (
    <div>
      <PageHeader
        title="Parts and prices"
        subtitle="Add new parts, change a part number or a price. Each change is saved with who made it."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setEditing('new')}>Add part</Button>
            <Button variant="secondary" onClick={() => setBulk(true)}>
              Raise / lower all prices
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="mp-q" className="min-w-56 flex-1">
          <Input id="mp-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Part number or name" />
        </Field>
        {brands.length > 1 && (
          <Field label="Brand" htmlFor="mp-brand">
            <Select id="mp-brand" value={brand} onChange={(e) => { setBrand(e.target.value); setCategory(''); setPage(1); }}>
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Category" htmlFor="mp-cat">
          <Select id="mp-cat" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="surface relative overflow-x-auto p-2 sm:p-4">
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-slate-400" />}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Part no.</th>
              <th className="py-2 pr-3 font-medium">Description</th>
              <th className="py-2 pr-3 font-medium">Category</th>
              <th className="py-2 pr-3 text-right font-medium">Price (PKR)</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  No part matches.
                </td>
              </tr>
            )}
            {data?.items.map((p) => (
              <tr key={p.id} className={p.isActive ? '' : 'opacity-50'}>
                <td className="py-2 pr-3 font-mono text-xs">{p.partNo}</td>
                <td className="py-2 pr-3">{p.description}</td>
                <td className="py-2 pr-3 text-slate-500">{p.category}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(p.sellingPrice)}</td>
                <td className="py-2 text-right">
                  <button type="button" className="text-xs text-brand-700 hover:underline" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.total > PAGE && <Pagination page={page} pageSize={PAGE} total={data.total} onPage={setPage} />}
      </div>
      {editing && <PartDialog part={editing === 'new' ? null : editing} brand={brand} categories={categories ?? []} onClose={() => setEditing(null)} toast={toast} />}
      {bulk && <PriceDialog brand={brand} categories={categories ?? []} onClose={() => setBulk(false)} toast={toast} />}
    </div>
  );
}

type Toast = ReturnType<typeof useToast>;

function PartDialog({ part, brand, categories, onClose, toast }: { part: Part | null; brand: string; categories: string[]; onClose: () => void; toast: Toast }) {
  const [partNo, setPartNo] = useState(part?.partNo ?? '');
  const [description, setDescription] = useState(part?.description ?? '');
  const [category, setCategory] = useState(part?.category ?? '');
  const [price, setPrice] = useState(part ? String(Number(part.sellingPrice)) : '');
  const [active, setActive] = useState(part?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [add, { isLoading: adding }] = useAddPartMutation();
  const [change, { isLoading: changing }] = useChangePartMutation();

  const save = async () => {
    if (partNo.trim().length < 2 || description.trim().length < 2) return setError('Enter the part number and the description');
    if (!clean(price) || Number.isNaN(Number(clean(price)))) return setError('Enter the price');
    setError(null);
    try {
      if (part) {
        await change({ id: part.id, managePartUpdate: { partNo: partNo.trim(), description: description.trim(), category: category.trim() || null, sellingPrice: clean(price), isActive: active } }).unwrap();
        toast.success(`${partNo.trim().toUpperCase()} saved`);
      } else {
        await add({ managePartCreate: { brand, partNo: partNo.trim(), description: description.trim(), category: category.trim() || null, sellingPrice: clean(price) } }).unwrap();
        toast.success(`${partNo.trim().toUpperCase()} added to the catalogue`);
      }
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={part ? `Edit ${part.partNo}` : `Add a ${brand} part`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={adding || changing} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Part number" htmlFor="pd-no" hint={part ? 'Changing it renames the part everywhere; stock and history stay with it' : 'Saved in capitals without spaces'}>
          <Input id="pd-no" value={partNo} onChange={(e) => setPartNo(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="pd-desc">
          <Input id="pd-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Category" htmlFor="pd-cat" hint="Choose one, or type a new one">
          <Input id="pd-cat" list="pd-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="pd-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Price (PKR)" htmlFor="pd-price" hint="Including sales tax, as on the price list">
          <Input id="pd-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        {part && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (uncheck to stop using this part)
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  );
}

function PriceDialog({ brand, categories, onClose, toast }: { brand: string; categories: string[]; onClose: () => void; toast: Toast }) {
  const [percent, setPercent] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [change, { isLoading }] = useChangePricesMutation();
  const n = Number(percent);
  const apply = async () => {
    if (!percent.trim() || Number.isNaN(n) || n === 0) return setError('Enter a percentage, e.g. 5 to raise or -5 to lower');
    setError(null);
    try {
      const r = await change({ priceChangeRequest: { brand, category: category || null, percent: n } }).unwrap();
      toast.success(`${r.changed} prices changed by ${n > 0 ? '+' : ''}${n}%`);
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Raise or lower prices"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={apply}>
            Change prices
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Changes the price of {category ? `every ${brand} part in "${category}"` : `every ${brand} part`} by a percentage. Use a minus to lower. Individual prices can be corrected afterwards.
        </p>
        <Field label="Category" htmlFor="pc-cat">
          <Select id="pc-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Change (%)" htmlFor="pc-pct" hint="5 = raise by 5%, -5 = lower by 5%">
          <Input id="pc-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  );
}
