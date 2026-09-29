import { addMoney } from '../../lib/money';
import type { Dashboard, DashboardKey } from './schemas';
import type { ReportScope } from './scope';

/**
 * Dashboards are computed per dealership, then summed: the headline figures and the dealership
 * comparison come from the same numbers. Counts are numbers; money stays a decimal string and is
 * added exactly.
 */
export type Stat = number | string;
export type Stats = Record<string, Stat>;
type Format = 'number' | 'money' | 'percent' | 'hours';

export class StatsByDealership {
  private readonly per = new Map<number, Stats>();

  /** Merge grouped query rows (`d` = dealership id) into the per-dealership stats. */
  put(rows: ({ d: number } & Stats)[]): this {
    for (const { d, ...stats } of rows) {
      const cur = this.per.get(d) ?? {};
      for (const [k, v] of Object.entries(stats)) cur[k] = add(cur[k], v);
      this.per.set(d, cur);
    }
    return this;
  }

  of(dealershipId: number): Stats {
    return this.per.get(dealershipId) ?? {};
  }

  total(): Stats {
    const out: Stats = {};
    for (const s of this.per.values()) for (const [k, v] of Object.entries(s)) out[k] = add(out[k], v);
    return out;
  }
}

function add(a: Stat | undefined, b: Stat): Stat {
  if (typeof b === 'string') return addMoney(a === undefined ? '0' : String(a), b);
  return (typeof a === 'number' ? a : 0) + b;
}

/** Numeric accessors that treat missing stats as zero. */
export const n = (s: Stats, k: string) => Number(s[k] ?? 0);
export const m = (s: Stats, k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '0.00');
export const pct = (num: number, den: number) => (den > 0 ? ((num / den) * 100).toFixed(1) : null);

export interface MetricDef {
  key: string;
  label: string;
  format: Format;
  value: (s: Stats) => Stat | null;
  hint?: (s: Stats) => string | null;
  to?: string;
  /** Include in the dealership comparison table. */
  compare?: boolean;
}

/** Assembles a dashboard: headline metrics from the totals, plus a comparison table by dealership. */
export async function assemble(
  key: DashboardKey,
  title: string,
  scope: ReportScope,
  stats: StatsByDealership,
  metrics: MetricDef[],
  extra: { charts?: Dashboard['charts']; tables?: Dashboard['tables'] } = {},
): Promise<Dashboard> {
  const total = stats.total();
  const tables = [...(extra.tables ?? [])];
  const dealerships = await scope.dealerships();
  const compared = metrics.filter((d) => d.compare);
  if (dealerships.length > 1 && compared.length) {
    tables.unshift({
      key: 'by-dealership',
      title: 'By dealership',
      columns: [{ key: 'dealership', header: 'Dealership', format: 'text' }, ...compared.map((d) => ({ key: d.key, header: d.label, format: d.format }))],
      rows: dealerships.map((dl) => {
        const s = stats.of(dl.id);
        return { dealership: dl.name, ...Object.fromEntries(compared.map((d) => [d.key, d.value(s)])) };
      }),
    });
  }
  return {
    key,
    title,
    mode: scope.mode,
    period: { from: scope.from, to: scope.to },
    metrics: metrics.map((d) => ({ key: d.key, label: d.label, format: d.format, value: d.value(total), hint: d.hint?.(total) ?? null, to: d.to ?? null })),
    charts: extra.charts ?? [],
    tables,
  };
}

/** Fills a monthly series so every month of the trend window appears (zero when empty). */
export function monthly(months: string[], rows: { month: string; value: Stat }[]): { label: string; value: number }[] {
  const by = new Map(rows.map((r) => [r.month, Number(r.value)]));
  return months.map((mo) => ({ label: monthLabel(mo), value: by.get(mo) ?? 0 }));
}

const rupees = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
/** Money for hint text (metric values themselves are formatted by the client). */
export const fmtMoney = (v: string) => rupees.format(Number(v));
/** 'walk_in' -> 'Walk in' */
export const humanize = (s: string) => {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const MONTHS =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
