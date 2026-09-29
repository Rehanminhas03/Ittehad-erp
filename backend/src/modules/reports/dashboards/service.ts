import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { user } from '../../core/models';
import { estimate, jobCard, jobCardLine, visit } from '../../service/models';
import { assemble, humanize, m, monthly, n, pct, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const count = sql<number>`count(*)::int`;
const month = (col: unknown) => sql<string>`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
const turnaround = sql<number>`coalesce(sum(extract(epoch from ${visit.deliveredAt} - ${visit.arrivedAt})), 0)::float8`;
const hours = (seconds: number, visits: number) => (visits > 0 ? (seconds / visits / 3600).toFixed(1) : null);

/** Service: workshop throughput, turnaround, work billed, estimate approvals. */
export async function serviceDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const scope = new ReportScope(ctx, { view: P.serviceView, viewOwn: P.serviceViewOwn }, q);
  const visitScope = scope.where({ dealership: visit.dealershipId, branch: visit.branchId, owner: visit.advisorId });
  const jobScope = scope.where({ dealership: jobCard.dealershipId, branch: jobCard.branchId, owner: jobCard.advisorId });
  const estimateScope = scope.where({ dealership: estimate.dealershipId, branch: estimate.branchId, owner: estimate.advisorId });
  const handedBack = and(visitScope, eq(visit.status, 'delivered'), scope.inPeriod(visit.deliveredAt));
  const stats = new StatsByDealership();

  stats.put(
    await ctx.tx
      .select({
        d: visit.dealershipId,
        visits: count,
        free: sql<number>`(count(*) filter (where ${visit.freeService}))::int`,
        warranty: sql<number>`(count(*) filter (where ${visit.visitType} = 'warranty'))::int`,
      })
      .from(visit)
      .where(and(visitScope, scope.inPeriod(visit.arrivedAt)))
      .groupBy(visit.dealershipId),
  );
  stats.put(await ctx.tx.select({ d: visit.dealershipId, handedBack: count, turnaround }).from(visit).where(handedBack).groupBy(visit.dealershipId));
  stats.put(
    await ctx.tx
      .select({ d: visit.dealershipId, inWorkshop: count })
      .from(visit)
      .where(and(visitScope, inArray(visit.status, ['open', 'in_progress', 'ready'])))
      .groupBy(visit.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: jobCard.dealershipId,
        labour: sql<string>`coalesce(sum(${jobCardLine.amount}) filter (where ${jobCardLine.kind} = 'labour' and ${jobCardLine.billable}), 0)::numeric(14, 2)::text`,
        parts: sql<string>`coalesce(sum(${jobCardLine.amount}) filter (where ${jobCardLine.kind} = 'part' and ${jobCardLine.billable}), 0)::numeric(14, 2)::text`,
      })
      .from(jobCardLine)
      .innerJoin(jobCard, eq(jobCard.id, jobCardLine.jobCardId))
      .where(and(jobScope, eq(jobCard.status, 'completed'), scope.inPeriod(jobCard.completedAt)))
      .groupBy(jobCard.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({ d: jobCard.dealershipId, completed: count })
      .from(jobCard)
      .where(and(jobScope, eq(jobCard.status, 'completed'), scope.inPeriod(jobCard.completedAt)))
      .groupBy(jobCard.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: estimate.dealershipId,
        estApproved: sql<number>`(count(*) filter (where ${estimate.status} = 'approved'))::int`,
        estDecided: sql<number>`(count(*) filter (where ${estimate.status} in ('approved', 'rejected')))::int`,
        estApprovedValue: sql<string>`coalesce(sum(${estimate.totalAmount}) filter (where ${estimate.status} = 'approved'), 0)::numeric(14, 2)::text`,
      })
      .from(estimate)
      .where(and(estimateScope, scope.inPeriod(estimate.createdAt)))
      .groupBy(estimate.dealershipId),
  );

  const trend = await ctx.tx
    .select({ month: month(visit.arrivedAt), value: count })
    .from(visit)
    .where(and(visitScope, scope.inTrend(visit.arrivedAt)))
    .groupBy(month(visit.arrivedAt));
  const byType = await ctx.tx
    .select({ label: visit.visitType, value: count })
    .from(visit)
    .where(and(visitScope, scope.inPeriod(visit.arrivedAt)))
    .groupBy(visit.visitType)
    .orderBy(desc(count));

  const tables = [];
  if (scope.mode !== 'own') {
    const byAdvisor = await ctx.tx
      .select({
        name: user.fullName,
        visits: count,
        handedBack: sql<number>`(count(*) filter (where ${visit.status} = 'delivered'))::int`,
        turnaround: sql<number>`coalesce(sum(extract(epoch from ${visit.deliveredAt} - ${visit.arrivedAt})) filter (where ${visit.status} = 'delivered'), 0)::float8`,
      })
      .from(visit)
      .innerJoin(user, eq(user.id, visit.advisorId))
      .where(and(visitScope, scope.inPeriod(visit.arrivedAt)))
      .groupBy(visit.advisorId, user.fullName)
      .orderBy(desc(count))
      .limit(10);
    tables.push({
      key: 'by-advisor',
      title: 'Service advisors',
      columns: [
        { key: 'name', header: 'Advisor', format: 'text' as const },
        { key: 'visits', header: 'Check-ins', format: 'number' as const },
        { key: 'handedBack', header: 'Handed back', format: 'number' as const },
        { key: 'turnaround', header: 'Avg turnaround', format: 'hours' as const },
      ],
      rows: byAdvisor.map((r) => ({ name: r.name, visits: r.visits, handedBack: r.handedBack, turnaround: hours(r.turnaround, r.handedBack) })),
    });
  }

  return assemble(
    'service',
    'Service',
    scope,
    stats,
    [
      { key: 'visits', label: 'Check-ins', format: 'number', value: (s) => n(s, 'visits'), hint: (s) => `${n(s, 'free')} free service, ${n(s, 'warranty')} warranty`, to: '/service/visits', compare: true },
      { key: 'handedBack', label: 'Vehicles handed back', format: 'number', value: (s) => n(s, 'handedBack'), compare: true },
      { key: 'turnaround', label: 'Average turnaround', format: 'hours', value: (s) => hours(n(s, 'turnaround'), n(s, 'handedBack')), hint: () => 'check-in to hand-back', compare: true },
      { key: 'inWorkshop', label: 'In the workshop now', format: 'number', value: (s) => n(s, 'inWorkshop'), to: '/service/visits' },
      { key: 'completed', label: 'Job cards completed', format: 'number', value: (s) => n(s, 'completed'), to: '/service/job-cards?status=completed', compare: true },
      { key: 'labour', label: 'Labour billed', format: 'money', value: (s) => m(s, 'labour'), compare: true },
      { key: 'parts', label: 'Parts billed', format: 'money', value: (s) => m(s, 'parts'), compare: true },
      {
        key: 'approval',
        label: 'Estimate approval rate',
        format: 'percent',
        value: (s) => pct(n(s, 'estApproved'), n(s, 'estDecided')),
        hint: (s) => `${n(s, 'estApproved')} of ${n(s, 'estDecided')} decided`,
        to: '/service/estimates',
      },
    ],
    {
      charts: [
        { key: 'visits-trend', title: 'Check-ins per month', format: 'number', data: monthly(scope.months, trend), to: '/service/visits' },
        { key: 'visits-by-type', title: 'Check-ins by type', format: 'number', data: byType.map((r) => ({ label: humanize(r.label), value: r.value })), to: null },
      ],
      tables,
    },
  );
}
