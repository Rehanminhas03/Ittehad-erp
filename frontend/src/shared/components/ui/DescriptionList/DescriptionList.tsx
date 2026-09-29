import type { ReactNode } from 'react';

/** Label/value pairs laid out in a responsive grid with dividers. */
export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 sm:gap-y-4">
      {items.map((it) => (
        <div key={it.label} className="flex justify-between gap-4 border-b border-slate-100 pb-2.5 sm:block sm:border-b-0 sm:pb-0">
          <dt className="text-xs font-medium text-slate-500">{it.label}</dt>
          <dd className="text-sm text-slate-900 sm:mt-1">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
