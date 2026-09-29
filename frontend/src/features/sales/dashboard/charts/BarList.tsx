import { Link } from 'react-router';

export interface BarItem {
  label: string;
  value: number;
  /** Optional drill-down (e.g. the list filtered to this status). */
  to?: string;
}

/**
 * Horizontal bars for "how many in each category": one hue, thin (12px) bars with a 4px rounded
 * end, grown from a common baseline, the value at the tip. Every row links to its records.
 */
export function BarList({
  items,
  color = '#2a78d6',
  empty = 'Nothing yet.',
  total,
}: {
  items: BarItem[];
  color?: string;
  empty?: string;
  /** When given, each row also shows its share of this total (e.g. 3 · 25%). */
  total?: number;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!items.length || max === 0) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const row = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{i.label}</span>
              <span className="text-slate-900 tabular-nums">
                <span className="font-semibold">{i.value.toLocaleString()}</span>
                {total ? <span className="ml-1.5 text-xs text-slate-500">{Math.round((i.value / total) * 100)}%</span> : null}
              </span>
            </div>
            <div className="h-3 w-full rounded-r-[4px] bg-slate-900/[0.04]">
              <div
                className="h-3 rounded-r-[4px] transition-[width] duration-500"
                style={{ width: `${Math.max(i.value ? 2 : 0, (i.value / max) * 100)}%`, background: color }}
              />
            </div>
          </>
        );
        return (
          <li key={i.label} title={`${i.label}: ${i.value}${total ? ` of ${total}` : ''}`}>
            {i.to ? (
              <Link to={i.to} className="block rounded-lg px-1 py-0.5 -mx-1 hover:bg-white/60">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
