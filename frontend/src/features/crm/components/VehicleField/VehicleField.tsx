import { useEffect, useState } from 'react';
import { Input, Spinner } from '@/shared/components/ui';
import { useGetVehicleQuery, useListVehiclesQuery } from '../../crmApi';

export interface VehicleFieldProps {
  id?: string;
  /** Selected vehicle id ('' / null when none). */
  value: unknown;
  onChange: (vehicleId: number | '') => void;
}

/**
 * A form control holding a vehicle id, with type-ahead by registration, VIN or engine number
 * over the vehicles linked to the user's dealerships. For use in any module's forms.
 */
export function VehicleField({ id, value, onChange }: VehicleFieldProps) {
  const selectedId = typeof value === 'number' ? value : Number(value) || 0;
  const { data: selected } = useGetVehicleQuery({ id: selectedId }, { skip: !selectedId });
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data, isFetching } = useListVehiclesQuery({ q, pageSize: 8 }, { skip: q.length < 2 || !!selectedId });

  if (selectedId) {
    return (
      <div className="flex items-center justify-between rounded-md px-3 py-2 text-sm ring-1 ring-slate-300">
        {selected ? (
          <span>
            <span className="font-medium text-slate-900">{selected.registrationNo ?? 'Unregistered'}</span>
            <span className="ml-2 text-slate-500">{selected.modelName}</span>
            <span className="ml-2 font-mono text-xs text-slate-400">{selected.vin}</span>
          </span>
        ) : (
          <Spinner className="size-4 text-slate-400" />
        )}
        <button type="button" className="text-xs text-brand-600 hover:text-brand-700" onClick={() => onChange('')}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type registration, VIN or engine no.…" autoComplete="off" />
      {isFetching && <Spinner className="absolute top-2.5 right-3 size-4 text-slate-400" />}
      {q.length >= 2 && !isFetching && (
        <ul className="mt-1 max-h-60 divide-y divide-slate-100 overflow-auto rounded-md bg-white text-sm ring-1 ring-slate-200" role="listbox">
          {!data?.items.length ? (
            <li className="px-3 py-2 text-slate-500">No matching vehicles. Use Search to find or add a vehicle registered elsewhere in the group.</li>
          ) : (
            data.items.map((v) => (
              <li key={v.id}>
                <button type="button" role="option" aria-selected={false} className="flex w-full justify-between px-3 py-2 text-left hover:bg-slate-50" onClick={() => onChange(v.id)}>
                  <span className="font-medium text-slate-800">{v.registrationNo ?? 'Unregistered'}</span>
                  <span className="text-slate-500">
                    {v.modelName} · <span className="font-mono text-xs">{v.vin}</span>
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
