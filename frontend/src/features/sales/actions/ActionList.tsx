import { Link } from 'react-router';
import { cn } from '@/shared/lib';
import type { ActionItem } from '../salesApi';

/** The action items as rows: count, what is waiting, and a link to the list to act on it. */
export function ActionList({ items, onOpen }: { items: ActionItem[]; onOpen?: () => void }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((i) => (
        <li key={i.key}>
          <Link to={i.to} onClick={onOpen} className="flex items-center gap-3 px-1 py-2.5 hover:bg-white/60">
            <span
              className={cn(
                'flex min-w-8 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums',
                i.urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
              )}
            >
              {i.count}
            </span>
            <span className="flex-1 text-sm text-slate-800">{i.title}</span>
            {i.urgent && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">Now</span>}
            <span className="text-sm font-medium text-brand-700">Open →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
