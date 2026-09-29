import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TrendSeries } from './TrendChart';

/** Clean y-axis ticks covering `max`. */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
/** 1,250,000 -> "12.5L", 25,000,000 -> "2.5Cr" (axis labels). */
export function compactPkr(v: number) {
  if (v >= 10_000_000) return `${+(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `${+(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${+(v / 1_000).toFixed(0)}K`;
  return String(v);
}

const monthLabel = (m: string, style: 'short' | 'long' = 'short') =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: style, ...(style === 'long' ? { year: 'numeric' } : {}) });

/** A bar with 4px rounded top corners anchored to the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * Twelve months as grouped bars (one y-axis), legend above for two series, a tooltip per month on
 * hover / touch, and the selected month highlighted; clicking a month selects it.
 */
export function MonthlyBars({
  data,
  series,
  selected,
  onSelect,
  format = (v) => v.toLocaleString(),
  axisFormat = (v) => String(v),
  height = 220,
}: {
  data: ({ month: string } & Record<string, number | string>)[];
  series: TrendSeries[];
  selected?: string | null;
  onSelect?: (month: string) => void;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 12, right: 8, bottom: 24, left: 40 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const ticks = useMemo(() => niceTicks(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))), [data, series]);
  const top = ticks[ticks.length - 1] || 1;
  const band = data.length ? w / data.length : 0;
  const barW = Math.max(2, Math.min(18, (band * 0.7 - (series.length - 1) * 2) / series.length));
  const groupW = barW * series.length + (series.length - 1) * 2;
  const y = (v: number) => h - (v / top) * h;
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} per month`}>
            <g transform={`translate(${pad.left},${pad.top})`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c3c2b7' : '#e1e0d9'} strokeWidth={1} />
                  <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                    {axisFormat(t)}
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const x0 = i * band + (band - groupW) / 2;
                const isSel = selected === d.month;
                return (
                  <g key={d.month}>
                    {(isSel || hover === i) && <rect x={i * band + 1} y={0} width={band - 2} height={h} rx={6} fill={isSel ? '#dbe8fe' : '#f1f5f9'} opacity={isSel ? 0.7 : 1} />}
                    {series.map((s, k) => {
                      const v = Number(d[s.key]) || 0;
                      return <path key={s.key} d={barPath(x0 + k * (barW + 2), y(v), barW, h - y(v))} fill={s.color} />;
                    })}
                    <text x={i * band + band / 2} y={h + 16} textAnchor="middle" className={isSel ? 'fill-slate-900 text-[11px] font-semibold' : 'fill-slate-500 text-[11px]'}>
                      {band < 30 ? monthLabel(d.month).slice(0, 1) : monthLabel(d.month)}
                    </text>
                    {/* Hit area: the whole month column, larger than its bars. */}
                    <rect
                      x={i * band}
                      y={0}
                      width={band}
                      height={h + pad.bottom}
                      fill="transparent"
                      className={onSelect ? 'cursor-pointer' : undefined}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      onTouchStart={() => setHover(i)}
                      onClick={() => onSelect?.(d.month)}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        {hovered && hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-40 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={(hover + 0.5) * band + pad.left > width / 2 ? { right: width - (hover * band + pad.left) + 6 } : { left: (hover + 1) * band + pad.left + 6 }}
          >
            <p className="mb-1 font-medium text-slate-800">{monthLabel(hovered.month, 'long')}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-slate-900 tabular-nums">{format(Number(hovered[s.key]) || 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
