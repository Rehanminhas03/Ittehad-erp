import { useState } from 'react';
import { Spinner } from '@/shared/components/ui';
import { useListServicePackageQuery } from '../../serviceApi';

/**
 * Under a periodic service line on the job card: a small tab that opens to show everything the service includes
 * (the parts replaced, the work, the checks), so the customer knows exactly what the 30,000 km service covers.
 */
export function ServiceIncludes({ scheduleItemId }: { scheduleItemId: number }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useListServicePackageQuery({ id: scheduleItemId }, { skip: !open });
  const group = (kind: 'part' | 'labour' | 'check') => (data ?? []).filter((x) => x.kind === kind);
  const section = (title: string, kind: 'part' | 'labour' | 'check') =>
    group(kind).length === 0 ? null : (
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{title}</p>
        <ul className="mt-0.5 space-y-0.5">
          {group(kind).map((x, i) => (
            <li key={i} className="flex gap-2 text-xs text-slate-700">
              <span aria-hidden>•</span>
              <span>
                {x.description}
                {kind === 'part' && (
                  <span className="text-slate-500">
                    {' '}
                    ({x.partNo}
                    {Number(x.quantity) !== 1 ? `, ${Number(x.quantity)}` : ''})
                  </span>
                )}
                {kind === 'labour' && Number(x.quantity) !== 1 && <span className="text-slate-500"> ({Number(x.quantity)} h)</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="mt-1">
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '▾ Hide what is included' : '▸ What is included in this service'}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-lg bg-white/70 p-2.5 ring-1 ring-slate-200">
          {isLoading ? (
            <Spinner className="size-4 text-slate-400" />
          ) : !data?.length ? (
            <p className="text-xs text-slate-500">Nothing is listed for this service yet.</p>
          ) : (
            <>
              {section('Parts replaced', 'part')}
              {section('Work', 'labour')}
              {section('Checks', 'check')}
            </>
          )}
        </div>
      )}
    </div>
  );
}
