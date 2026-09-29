import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatDate } from '@/shared/lib';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

/** Clean y-axis ticks (0, 2, 4 … / 0, 5, 10 …) covering `max`. */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Daily trend: 2px lines over a ~10% area wash, one y-axis, hairline grid, end values labelled,
 * and a crosshair + tooltip on hover / touch. Legend above for two or more series.
 */
export function TrendChart({
  data,
  series,
  height = 240,
}: {
  data: ({ date: string } & Record<string, number | string>)[];
  series: TrendSeries[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 16, right: 36, bottom: 28, left: 32 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;

  const ticks = useMemo(() => niceTicks(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))), [data, series]);
  const top = ticks[ticks.length - 1] || 1;
  const x = (i: number) => (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => h - (v / top) * h;
  // At most ~7 date labels, always including the last day.
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 70))));

  const onMove = (clientX: number, target: SVGRectElement) => {
    const rect = target.getBoundingClientRect();
    const rel = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    setHover(data.length <= 1 ? 0 : Math.round((rel / rect.width) * (data.length - 1)));
  };

  const hovered = hover !== null ? data[hover] : null;

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.label).join(' and ')} per day`}>
            <g transform={`translate(${pad.left},${pad.top})`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#c3c2b7' : '#e1e0d9'} strokeWidth={1} />
                  <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                    {t}
                  </text>
                </g>
              ))}
              {data.map((d, i) =>
                i % every === 0 || i === data.length - 1 ? (
                  <text key={d.date} x={x(i)} y={h + 18} textAnchor={i === data.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="fill-slate-500 text-[11px]">
                    {shortDate(d.date)}
                  </text>
                ) : null,
              )}
              {series.map((s) => {
                const pts = data.map((d, i) => `${x(i)},${y(Number(d[s.key]) || 0)}`);
                const last = data[data.length - 1];
                return (
                  <g key={s.key}>
                    <path d={`M${x(0)},${h} L${pts.join(' L')} L${x(data.length - 1)},${h} Z`} fill={s.color} fillOpacity={0.1} />
                    <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {last && (
                      <>
                        <circle cx={x(data.length - 1)} cy={y(Number(last[s.key]) || 0)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
                        <text x={x(data.length - 1) + 8} y={y(Number(last[s.key]) || 0)} dy="0.32em" className="fill-slate-700 text-[11px] font-medium tabular-nums">
                          {Number(last[s.key]) || 0}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
              {hovered && hover !== null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="#94a3b8" strokeWidth={1} />
                  {series.map((s) => (
                    <circle key={s.key} cx={x(hover)} cy={y(Number(hovered[s.key]) || 0)} r={5} fill={s.color} stroke="#fff" strokeWidth={2} />
                  ))}
                </g>
              )}
              {/* Hit area: the whole plot, larger than any mark. */}
              <rect
                width={w}
                height={h}
                fill="transparent"
                onMouseMove={(e) => onMove(e.clientX, e.currentTarget)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={(e) => onMove(e.touches[0]!.clientX, e.currentTarget)}
                onTouchMove={(e) => onMove(e.touches[0]!.clientX, e.currentTarget)}
                onTouchEnd={() => setHover(null)}
              />
            </g>
          </svg>
        )}
        {hovered && hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={x(hover) + pad.left > width / 2 ? { right: width - (x(hover) + pad.left) + 12 } : { left: x(hover) + pad.left + 12 }}
          >
            <p className="mb-1 font-medium text-slate-800">{formatDate(hovered.date)}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-4 text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-slate-900 tabular-nums">{Number(hovered[s.key]) || 0}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
