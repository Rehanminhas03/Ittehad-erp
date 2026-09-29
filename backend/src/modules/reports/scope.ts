import { type SQL, and, eq, gte, lt, sql } from '../../db/sql';
import { viewWhere } from '../../auth/access';
import type { EntityCtx } from '../../entity/types';
import { forbidden, validationError } from '../../lib/errors';
import type { DashboardQuery } from './schemas';
import type { z } from '../../lib/zod';

export type ReportMode = 'group' | 'dealership' | 'own';

const MAX_DAYS = 366;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * What a dashboard may aggregate for the caller: the tenant scope of the report permission (or only
 * the caller's own records under `view_own`), an optional single dealership, and a date period.
 * Every query of every dashboard goes through `where()`; RLS applies underneath.
 */
export class ReportScope {
  readonly mode: ReportMode;
  readonly from: string;
  readonly to: string;
  /** Last 6 calendar months ending with the period's month, as 'YYYY-MM'. */
  readonly months: string[];
  private readonly dealershipId?: number;

  constructor(
    private readonly ctx: EntityCtx,
    private readonly perms: { view: string; viewOwn?: string },
    q: z.output<typeof DashboardQuery>,
  ) {
    const { access } = ctx;
    const codes = [perms.view, perms.viewOwn].filter((c): c is string => !!c);
    if (!access.hasAny(codes)) throw forbidden();
    if (q.dealershipId && !codes.some((c) => access.canIn(c, { dealershipId: q.dealershipId! }))) {
      throw forbidden('You cannot view reports for this dealership');
    }
    this.dealershipId = q.dealershipId;
    this.mode = access.hasGlobal(perms.view) ? 'group' : access.has(perms.view) ? 'dealership' : 'own';

    this.to = q.to ?? today();
    this.from = q.from ?? `${this.to.slice(0, 7)}-01`;
    if (this.from > this.to) throw validationError([{ in: 'query', path: 'from', message: 'Must be on or before "to"' }]);
    if (addDays(this.from, MAX_DAYS) < this.to) throw validationError([{ in: 'query', path: 'from', message: `At most ${MAX_DAYS} days` }]);

    const end = new Date(`${this.to.slice(0, 7)}-01T00:00:00Z`);
    this.months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5 + i, 1));
      return d.toISOString().slice(0, 7);
    });
  }

  /** Tenant (+ owner under view_own) condition, plus the optional dealership filter. */
  where(cols: { dealership: SQL; branch?: SQL; owner?: SQL }): SQL {
    const scope = viewWhere(this.ctx.access, { dealership: cols.dealership, branch: cols.branch }, { view: this.perms.view, viewOwn: cols.owner ? this.perms.viewOwn : undefined }, cols.owner);
    return this.dealershipId ? and(scope, eq(cols.dealership, this.dealershipId))! : scope;
  }

  /** `col` falls inside the period (timestamps or dates). */
  inPeriod(col: SQL): SQL {
    return and(gte(col, sql`${this.from}::date`), lt(col, sql`${addDays(this.to, 1)}::date`))!;
  }

  /** `col` falls inside the 6-month trend window. */
  inTrend(col: SQL): SQL {
    return and(gte(col, sql`${`${this.months[0]}-01`}::date`), lt(col, sql`${addDays(this.to, 1)}::date`))!;
  }

  /** Dealerships the dashboard covers (for the comparison table), with names. */
  async dealerships(): Promise<{ id: number; name: string }[]> {
    const { access } = this.ctx;
    const codes = [this.perms.view, this.perms.viewOwn].filter((c): c is string => !!c);
    const base = (where: { id?: number | { in: number[] }; isActive?: boolean }) =>
      this.ctx.tx.dealership.findMany({ where, select: { id: true, name: true }, orderBy: [{ name: 'asc' }] });
    if (this.dealershipId) return base({ id: this.dealershipId });
    if (codes.some((c) => access.hasGlobal(c))) return base({ isActive: true });
    const ids = new Set<number>();
    for (const c of codes) {
      const s = access.scope(c);
      s.dealershipIds.forEach((d) => ids.add(d));
      s.branches.forEach((b) => ids.add(b.dealershipId));
    }
    return ids.size ? base({ id: { in: [...ids] } }) : [];
  }
}
