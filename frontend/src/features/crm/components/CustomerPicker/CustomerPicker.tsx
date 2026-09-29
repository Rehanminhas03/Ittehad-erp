import { useEffect, useState } from 'react';
import { Input, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { type Customer, useListCustomersQuery } from '../../crmApi';

export interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  /** Only offer customers from dealerships where the user holds this permission. */
  permission: string;
  /** Restrict to one dealership. */
  dealershipId?: number | null;
  id?: string;
}

/** Type-ahead customer finder (name, mobile, CNIC) over the server-side, scope-filtered list. */
export function CustomerPicker({ value, onChange, permission, dealershipId, id }: CustomerPickerProps) {
  const perm = usePermission();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isFetching } = useListCustomersQuery(
    { q, pageSize: 8, isActive: 'true', ...(dealershipId ? { dealershipId } : {}) },
    { skip: q.length < 2 || !!value },
  );
  const options = (data?.items ?? []).filter((c) => perm.canIn(permission, c.dealershipId));

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md px-3 py-2 text-sm ring-1 ring-slate-300">
        <span>
          <span className="font-medium text-slate-900">{value.fullName}</span>
          <span className="ml-2 text-slate-500">{value.mobile}</span>
        </span>
        <button type="button" className="text-xs text-brand-600 hover:text-brand-700" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a name, mobile or CNIC…" autoComplete="off" />
      {isFetching && <Spinner className="absolute top-2.5 right-3 size-4 text-slate-400" />}
      {q.length >= 2 && !isFetching && (
        <ul className="mt-1 max-h-60 divide-y divide-slate-100 overflow-auto rounded-md bg-white text-sm ring-1 ring-slate-200" role="listbox">
          {options.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">No matching customers</li>
          ) : (
            options.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={cn('flex w-full justify-between px-3 py-2 text-left hover:bg-slate-50')}
                  onClick={() => onChange(c)}
                >
                  <span className="font-medium text-slate-800">{c.fullName}</span>
                  <span className="text-slate-500">
                    {c.mobile} · {c.dealershipName}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
