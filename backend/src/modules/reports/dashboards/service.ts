import { query } from '../../../db/client';
import { type SQL, and, eq, inArray, sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { user } from '../../core/models';
import { estimate, jobCard, jobCardLine, visit } from '../../service/models';
import { assemble, humanize, m, monthly, n, pct, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const count = sql`count(*)::int`;
const month = (col: SQL) => sql`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
const turnaround = sql`coalesce(sum(extract(epoch from ${visit.deliveredAt} - ${visit.arrivedAt})), 0)::float8`;
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
    await query<{ d: number; visits: number; free: number; warranty: number }>(
      ctx.tx,
      sql`select ${visit.dealershipId} as "d", ${count} as "visits",
                 (count(*) filter (where ${visit.freeService}))::int as "free",
                 (count(*) filter (where ${visit.visitType} = 'warranty'))::int as "warranty"
          from ${visit}
          where ${and(visitScope, scope.inPeriod(visit.arrivedAt))}
          group by ${visit.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; handedBack: number; turnaround: number }>(
      ctx.tx,
      sql`select ${visit.dealershipId} as "d", ${count} as "handedBack", ${turnaround} as "turnaround"
          from ${visit}
          where ${handedBack}
          group by ${visit.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; inWorkshop: number }>(
      ctx.tx,
      sql`select ${visit.dealershipId} as "d", ${count} as "inWorkshop"
          from ${visit}
          where ${and(visitScope, inArray(visit.status, ['open', 'in_progress', 'ready']))}
          group by ${visit.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; labour: string; parts: string }>(
      ctx.tx,
      sql`select ${jobCard.dealershipId} as "d",
                 coalesce(sum(${jobCardLine.amount}) filter (where ${jobCardLine.kind} = 'labour' and ${jobCardLine.billable}), 0)::numeric(14, 2)::text as "labour",
                 coalesce(sum(${jobCardLine.amount}) filter (where ${jobCardLine.kind} = 'part' and ${jobCardLine.billable}), 0)::numeric(14, 2)::text as "parts"
          from ${jobCardLine}
          inner join ${jobCard} on ${jobCard.id} = ${jobCardLine.jobCardId}
          where ${and(jobScope, eq(jobCard.status, 'completed'), scope.inPeriod(jobCard.completedAt))}
          group by ${jobCard.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; completed: number }>(
      ctx.tx,
      sql`select ${jobCard.dealershipId} as "d", ${count} as "completed"
          from ${jobCard}
          where ${and(jobScope, eq(jobCard.status, 'completed'), scope.inPeriod(jobCard.completedAt))}
          group by ${jobCard.dealershipId}`,
    ),
  );
  stats.put(
    await query<{ d: number; estApproved: number; estDecided: number; estApprovedValue: string }>(
      ctx.tx,
      sql`select ${estimate.dealershipId} as "d",
                 (count(*) filter (where ${estimate.status} = 'approved'))::int as "estApproved",
                 (count(*) filter (where ${estimate.status} in ('approved', 'rejected')))::int as "estDecided",
                 coalesce(sum(${estimate.totalAmount}) filter (where ${estimate.status} = 'approved'), 0)::numeric(14, 2)::text as "estApprovedValue"
          from ${estimate}
          where ${and(estimateScope, scope.inPeriod(estimate.createdAt))}
          group by ${estimate.dealershipId}`,
    ),
  );

  const trend = await query<{ month: string; value: number }>(
    ctx.tx,
    sql`select ${month(visit.arrivedAt)} as "month", ${count} as "value"
        from ${visit}
        where ${and(visitScope, scope.inTrend(visit.arrivedAt))}
        group by ${month(visit.arrivedAt)}`,
  );
  const byType = await query<{ label: string; value: number }>(
    ctx.tx,
    sql`select ${visit.visitType} as "label", ${count} as "value"
        from ${visit}
        where ${and(visitScope, scope.inPeriod(visit.arrivedAt))}
        group by ${visit.visitType}
        order by ${count} desc`,
  );

  const tables = [];
  if (scope.mode !== 'own') {
    const byAdvisor = await query<{ name: string; visits: number; handedBack: number; turnaround: number }>(
      ctx.tx,
      sql`select ${user.fullName} as "name", ${count} as "visits",
                 (count(*) filter (where ${visit.status} = 'delivered'))::int as "handedBack",
                 coalesce(sum(extract(epoch from ${visit.deliveredAt} - ${visit.arrivedAt})) filter (where ${visit.status} = 'delivered'), 0)::float8 as "turnaround"
          from ${visit}
          inner join ${user} on ${user.id} = ${visit.advisorId}
          where ${and(visitScope, scope.inPeriod(visit.arrivedAt))}
          group by ${visit.advisorId}, ${user.fullName}
          order by ${count} desc
          limit 10`,
    );
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
