import { useEffect, useRef, useState } from 'react';
import { Input, Spinner } from '@/shared/components/ui';
import { formatMoney } from '@/shared/lib';
import { type Part, useListPartsQuery } from '../../partsApi';

/**
 * Search the parts catalogue by part number or name and pick one. The list shows the price-list price,
 * so the storekeeper sees what they are choosing.
 */
export function PartPicker({ onPick, placeholder = 'Search part number or name, then choose…' }: { onPick: (p: Part) => void; placeholder?: string }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  const { data, isFetching } = useListPartsQuery({ q, pageSize: 10, isActive: 'true', sort: 'partNo' }, { skip: q.length < 2 });

  return (
    <div ref={box} className="relative">
      <Input
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="Search the parts catalogue"
      />
      {isFetching && <Spinner className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-slate-400" />}
      {open && q.length >= 2 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox">
          {(data?.items ?? []).length === 0 ? (
            <li className="px-3 py-3 text-sm text-slate-500">{isFetching ? 'Searching…' : 'No part matches. Check the number, or ask the Parts Manager to add it to the catalogue.'}</li>
          ) : (
            data!.items.map((p) => (
              <li key={p.id} role="option" aria-selected="false">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50"
                  onClick={() => {
                    onPick(p);
                    setText('');
                    setQ('');
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-slate-900">{p.partNo}</span>
                    <span className="block truncate text-slate-600">{p.description}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">{formatMoney(p.sellingPrice)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
