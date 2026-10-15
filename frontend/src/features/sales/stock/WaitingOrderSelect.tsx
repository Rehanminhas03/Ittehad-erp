import { useEffect, useRef, useState } from 'react';
import { Input, Spinner } from '@/shared/components/ui';
import { cn, humanize } from '@/shared/lib';
import { type SalesOrder, useListSalesOrdersQuery } from '../salesApi';

interface WaitingOrderSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Fills in the other fields of the form (model, dealership, colour, variant) from the chosen order. */
  setValues: (patch: Record<string, unknown>) => void;
  dealershipId: number | null;
  modelId: number | null;
  colour: string;
  variant: string;
}

const describe = (o: SalesOrder) =>
  [o.orderNo, o.pboNo ? `PBO ${o.pboNo}` : null, o.customerName ?? 'Customer', [o.modelName, o.variant, o.color].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

const OPEN_STOCK = 'Open stock: not for any order (free stock)';

/**
 * "For order" when registering an arriving car: a drop-down. The first choice is "Open stock" (the car is
 * not for any order); below it are the booked orders still waiting for a car. Type in the box at the top
 * of the list to search by customer name, PBO or order number (also phone, CNIC, colour). Choosing an
 * order fills in its model (and colour / variant when empty), so the car always matches the order.
 * Without a search, the oldest waiting orders of the chosen model are listed and the oldest is preselected.
 */
export function WaitingOrderSelect({ id, value, onChange, setValues, dealershipId, modelId, colour, variant }: WaitingOrderSelectProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  // Close on a click outside, or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const { data, isFetching } = useListSalesOrdersQuery({
    live: 'true',
    hasVehicle: 'false',
    sort: 'createdAt',
    pageSize: 20,
    ...(q ? { q } : modelId ? { modelId } : {}),
  });
  // Only this dealership's orders (someone working several dealerships sees them all).
  const results = (data?.items ?? []).filter((o) => !dealershipId || o.dealershipId === dealershipId);

  // The chosen order stays shown even when the list changes.
  const [picked, setPicked] = useState<SalesOrder | null>(null);
  const chosen = picked && String(picked.id) === value ? picked : (results.find((o) => String(o.id) === value) ?? null);

  // Preselect the oldest order of the chosen model once, unless the user already chose "Open stock" or an order.
  const touched = useRef(false);
  useEffect(() => {
    touched.current = false;
  }, [modelId]);
  useEffect(() => {
    if (!data || isFetching || q || !modelId || value || touched.current || !results.length) return;
    onChange(String(results[0]!.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the list for the model arrives
  }, [data, isFetching, q, modelId]);

  const close = () => {
    setOpen(false);
    setText('');
  };
  const pick = (o: SalesOrder) => {
    touched.current = true;
    setPicked(o);
    onChange(String(o.id));
    setValues({
      modelId: String(o.modelId),
      ...(o.dealershipId ? { dealershipId: String(o.dealershipId) } : {}),
      ...(!colour.trim() && o.color ? { color: o.color } : {}),
      ...(!variant.trim() && o.variant ? { variant: o.variant } : {}),
    });
    close();
  };
  const openStock = () => {
    touched.current = true;
    setPicked(null);
    onChange('');
    close();
  };

  return (
    <div ref={box} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/80 px-3.5 py-2.5 text-left text-sm text-slate-900 shadow-sm ring-1 ring-slate-300 hover:ring-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
      >
        <span className={cn('truncate', !chosen && 'text-slate-600')}>{chosen ? describe(chosen) : OPEN_STOCK}</span>
        <svg viewBox="0 0 20 20" className={cn('size-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} fill="none" aria-hidden>
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Input
              type="search"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search by customer name, PBO or order number…"
              autoComplete="off"
              aria-label="Search orders waiting for a car"
            />
            {isFetching && <Spinner className="absolute top-1/2 right-5 size-4 -translate-y-1/2 text-slate-400" />}
          </div>
          <ul className="max-h-64 overflow-y-auto" role="listbox" aria-label="Orders waiting for a car">
            <li role="option" aria-selected={!value}>
              <button type="button" onClick={openStock} className={cn('flex w-full flex-col items-start border-b border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-brand-50', !value && 'bg-brand-50')}>
                <span className="font-semibold text-slate-900">Open stock</span>
                <span className="text-xs text-slate-500">The car is not for an order yet: it is kept as free stock, to be allocated later.</span>
              </button>
            </li>
            {results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-slate-500">
                {isFetching ? 'Searching…' : q ? 'No booked order waiting for a car matches this search.' : 'No booked order is waiting for a car.'}
              </li>
            ) : (
              results.map((o) => (
                <li key={o.id} role="option" aria-selected={String(o.id) === value}>
                  <button type="button" onClick={() => pick(o)} className={cn('flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-brand-50', String(o.id) === value && 'bg-brand-50')}>
                    <span className="font-medium text-slate-900">{describe(o)}</span>
                    <span className="text-xs text-slate-500">
                      Allocate to this order · {o.status === 'approved' ? 'approved' : `${humanize(o.status)} (awaiting approval)`}
                      {o.expectedDeliveryDate ? ` · expected ${o.expectedDeliveryDate.slice(0, 7)}` : ''}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
