/**
 * Sales Manager's department report: per Salesperson and CRO (and team leaders, e.g. the Assistant
 * Manager, only with work of their own in the period), daily walk-ins, orders raised and completed.
 * Computed from the records, one dealership at a time.
 */
import { sql } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import { forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { SalesPerm as P } from '../permissions';
import { dealershipManagersSql } from '../repository';
import type { TeamReportQuery } from '../schemas';
import { addDays, pakistanToday } from '../../../lib/dates';

const MAX_DAYS = 92;
/** Today in Pakistan (UTC+5, no DST). */
const localToday = () => pakistanToday();
const day = (col: string) => sql.raw(`(${col} at time zone 'Asia/Karachi')::date`);

/** Users with a sales role at the dealership (anyone who logs leads or handles escalations). */
export const membersSql = (dealershipId: number) => sql`
  select u.id::int as id, u.full_name as "fullName", string_agg(distinct r.name, ', ' order by r.name) as roles,
         -- A salesperson: converts and sees only own leads (not a manager), and is not a CRO (records visits).
         (bool_or(exists (select 1 from core.role_permission rp join core.permission p on p.id = rp.permission_id
                           where rp.role_id = r.id and p.code = ${P.leadsConvertOwn}))
          and not bool_or(exists (select 1 from core.role_permission rp join core.permission p on p.id = rp.permission_id
                                   where rp.role_id = r.id and p.code in (${P.leadsViewAll}, ${P.leadsRecordVisit})))) as "sellsCars",
         -- Can be given a lead: works their own leads and is not a team leader (Salesperson, CRO).
         (bool_or(exists (select 1 from core.role_permission rp join core.permission p on p.id = rp.permission_id
                           where rp.role_id = r.id and p.code = ${P.leadsConvertOwn}))
          and not bool_or(exists (select 1 from core.role_permission rp join core.permission p on p.id = rp.permission_id
                                   where rp.role_id = r.id and p.code = ${P.leadsViewAll}))) as "takesLeads",
         -- A team leader (sees every lead): Assistant Manager, Sales Manager, Dealership Manager.
         bool_or(exists (select 1 from core.role_permission rp join core.permission p on p.id = rp.permission_id
                          where rp.role_id = r.id and p.code = ${P.leadsViewAll})) as "isLeader"
    from core.user_role ur
    join core.role r on r.id = ur.role_id
    join core."user" u on u.id = ur.user_id
   where ur.dealership_id = ${dealershipId} and u.is_active
     -- Not the Dealership Manager (runs the dealership, does not sell).
     and u.id not in (${dealershipManagersSql(dealershipId)})
     and exists (select 1 from core.role_permission rp join core.permission p on p.id = rp.permission_id
                  where rp.role_id = r.id and p.code in (${P.leadsCreate}, ${P.leadsConvertEscalated}))
   group by u.id, u.full_name`;

export async function teamMembers(ctx: EntityCtx, dealershipId: number) {
  if (![P.leadsViewAll, P.reportsView, P.quotationsViewAll, P.ppfViewAll].some((c) => ctx.access.canIn(c, { dealershipId }))) throw forbidden();
  const { rows } = await ctx.tx.execute<{ id: number; fullName: string; sellsCars: boolean; takesLeads: boolean }>(
    sql`select id, "fullName", "sellsCars", "takesLeads" from (${membersSql(dealershipId)}) m order by "fullName" limit 200`,
  );
  return rows;
}

export async function teamReport(ctx: EntityCtx, q: z.output<typeof TeamReportQuery>) {
  const dealershipId = q.dealershipId;
  if (!ctx.access.canIn(P.reportsView, { dealershipId })) throw forbidden();
  const to = q.to ?? localToday();
  const from = q.from ?? addDays(to, -29);
  if (from > to) throw validationError([{ in: 'query', path: 'from', message: 'The start date must be before the end date' }]);
  if ((Date.parse(to) - Date.parse(from)) / 86400_000 >= MAX_DAYS) {
    throw validationError([{ in: 'query', path: 'from', message: `Choose a period of at most ${MAX_DAYS} days` }]);
  }
  const inPeriod = (col: string) => sql`${day(col)} between ${from}::date and ${to}::date`;

  const { rows: members } = await ctx.tx.execute<{
    userId: number;
    fullName: string;
    roles: string;
    leads: number;
    walkIns: number;
    followUps: number;
    converted: number;
    escalationsConverted: number;
    ordersRaised: number;
    ordersCompleted: number;
  }>(sql`
    select "userId", "fullName", roles, leads, "walkIns", "followUps", converted, "escalationsConverted", "ordersRaised", "ordersCompleted" from (
    select m.id as "userId", m."fullName", m.roles, m."isLeader",
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.owner_id = m.id and ${inPeriod('l.created_at')}) as leads,
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.owner_id = m.id and l.source = 'walk_in' and ${inPeriod('l.created_at')}) as "walkIns",
      (select count(*)::int from sales.lead_follow_up f where f.dealership_id = ${dealershipId} and f.created_by_id = m.id and ${inPeriod('f.created_at')}) as "followUps",
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.converted_by_id = m.id and ${inPeriod('l.converted_at')}) as converted,
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.converted_by_id = m.id and l.owner_id <> m.id and ${inPeriod('l.converted_at')}) as "escalationsConverted",
      (select count(*)::int from sales.sales_order o where o.dealership_id = ${dealershipId} and o.salesperson_id = m.id and o.status <> 'cancelled' and ${inPeriod('o.created_at')}) as "ordersRaised",
      (select count(*)::int from sales.delivery d where d.dealership_id = ${dealershipId} and d.salesperson_id = m.id and d.status = 'delivered' and d.delivered_on between ${from}::date and ${to}::date) as "ordersCompleted"
    from (${membersSql(dealershipId)}) m
    ) t
    -- Salespersons and CROs always; team leaders only with work of their own in the period.
    where not t."isLeader" or t.leads + t."followUps" + t.converted + t."ordersRaised" + t."ordersCompleted" > 0
    order by "ordersRaised" desc, converted desc, "fullName"`);

  const { rows: daily } = await ctx.tx.execute<{ date: string; walkIns: number; leads: number; converted: number }>(sql`
    select to_char(g.d, 'YYYY-MM-DD') as date,
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.source = 'walk_in' and ${day('l.created_at')} = g.d) as "walkIns",
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and ${day('l.created_at')} = g.d) as leads,
      (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and ${day('l.converted_at')} = g.d) as converted
    from generate_series(${from}::date, ${to}::date, interval '1 day') as g(d)
    order by g.d desc`);

  // Totals are the sum of the people shown (so they add up; the Dealership Manager and leavers are not in them).
  const sum = (k: 'leads' | 'walkIns' | 'converted' | 'ordersRaised' | 'ordersCompleted') => members.reduce((n, m) => n + m[k], 0);
  return {
    dealershipId,
    period: { from, to },
    totals: {
      leads: sum('leads'),
      walkIns: sum('walkIns'),
      converted: sum('converted'),
      ordersRaised: sum('ordersRaised'),
      ordersCompleted: sum('ordersCompleted'),
      salespeopleWithOrders: members.filter((m) => m.ordersRaised > 0).length,
    },
    members,
    daily,
  };
}
