/**
 * Monthly track record of every stage, per salesperson: leads logged, leads converted, cars booked
 * (sales orders raised) and delivered, PPF sold and for how much, and quotations issued.
 *   - Sales Manager: the Salespersons and CROs, plus team leaders (Assistant Manager, managers) only
 *     when they logged or converted leads of their own; all together, all Salespersons (`group`),
 *     all CROs, or one person.
 *   - Assistant Manager / Sales Admin: the Salespersons (not CROs), plus active team leaders.
 *   - Salesperson / CRO: their own record.
 * Team views can be narrowed to one person (`userId`).
 *
 * Leads, conversions, PPF and quotations are credited to the lead's salesperson (also when a team
 * leader logs the lead for them or converts a duplicate customer sent to them; the details say who
 * entered and who converted each lead); orders and deliveries to the order's salesperson.
 */
import { query } from '../../../db/client';
import { type SQL, sql, raw, empty } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { forbidden } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { SalesPerm as P } from '../permissions';
import { dealershipManagersSql } from '../repository';
import type { TrackRecordQuery } from '../schemas';

const COUNTS = ['leadsLogged', 'converted', 'carsBooked', 'carsDelivered', 'ppfSold', 'quotations'] as const;
const AMOUNTS = ['ppfAmount', 'ppfAdvance'] as const;
type Counts = Record<(typeof COUNTS)[number], number> & Record<(typeof AMOUNTS)[number], string>;

const month = (col: string) => raw(`to_char(${col} at time zone 'Asia/Karachi', 'YYYY-MM')`);

/** Per-person figures for the records matching `when` (a month or a whole year). */
function countsSql(dealershipId: number, userCol: SQL, when: (col: string, isDate?: boolean) => SQL) {
  return sql`
    (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.owner_id = ${userCol} and ${when('l.created_at')}) as "leadsLogged",
    (select count(*)::int from sales.lead l where l.dealership_id = ${dealershipId} and l.owner_id = ${userCol} and l.converted_at is not null and ${when('l.converted_at')}) as converted,
    (select count(*)::int from sales.sales_order o where o.dealership_id = ${dealershipId} and o.salesperson_id = ${userCol} and o.status <> 'cancelled' and ${when('o.created_at')}) as "carsBooked",
    (select count(*)::int from sales.delivery d where d.dealership_id = ${dealershipId} and d.salesperson_id = ${userCol} and d.status = 'delivered' and ${when('d.delivered_on', true)}) as "carsDelivered",
    (select count(*)::int from sales.ppf_form p where p.dealership_id = ${dealershipId} and p.owner_id = ${userCol} and ${when('p.created_at')}) as "ppfSold",
    (select coalesce(sum(p.total_amount), 0)::numeric(14,2)::text from sales.ppf_form p where p.dealership_id = ${dealershipId} and p.owner_id = ${userCol} and ${when('p.created_at')}) as "ppfAmount",
    (select coalesce(sum(p.advance_paid), 0)::numeric(14,2)::text from sales.ppf_form p where p.dealership_id = ${dealershipId} and p.owner_id = ${userCol} and ${when('p.created_at')}) as "ppfAdvance",
    (select count(*)::int from sales.quotation q where q.dealership_id = ${dealershipId} and q.owner_id = ${userCol} and ${when('q.created_at')}) as quotations`;
}

/** Users holding a permission at the dealership (through any of their roles there). */
const holders = (dealershipId: number, code: string) => sql`
  select ur.user_id from core.user_role ur
    join core.role_permission rp on rp.role_id = ur.role_id
    join core.permission p on p.id = rp.permission_id
   where ur.dealership_id = ${dealershipId} and p.code = ${code}`;
/**
 * The salespeople at the dealership, also after leaving: they convert their own leads and see only
 * their own. Not managers (they see every lead) and not CROs (they record showroom visits).
 */
const salespeopleSql = (dealershipId: number) =>
  sql`${holders(dealershipId, P.leadsConvertOwn)} except ${holders(dealershipId, P.leadsViewAll)} except ${holders(dealershipId, P.leadsRecordVisit)}`;
/** The CROs at the dealership (they record showroom visits; not managers). */
const crosSql = (dealershipId: number) => sql`${holders(dealershipId, P.leadsRecordVisit)} except ${holders(dealershipId, P.leadsViewAll)}`;

export async function trackRecord(ctx: EntityCtx, q: z.output<typeof TrackRecordQuery>) {
  const { dealershipId, year } = q;
  // The Sales Manager sees everyone; the Assistant Manager and Sales Admin see the salespeople; a
  // salesperson sees their own record.
  const everyone = ctx.access.canIn(P.reportsView, { dealershipId });
  const team = everyone || ctx.access.canIn(P.ppfViewAll, { dealershipId });
  if (!team && !ctx.access.canIn(P.ppfViewOwn, { dealershipId })) throw forbidden();
  const scope = everyone ? ('team' as const) : team ? ('salespeople' as const) : ('own' as const);
  const me = ctx.access.userId;

  // The month shown per person (default: the whole year).
  const selected = q.month ? `${year}-${String(q.month).padStart(2, '0')}` : null;
  // A custom period (Pakistan calendar days) takes the place of the month / year.
  const range = q.from && q.to ? { from: q.from, to: q.to } : null;
  const inSelection = (col: string, isDate = false) =>
    range
      ? isDate
        ? sql`${raw(col)} between ${range.from}::date and ${range.to}::date`
        : sql`(${raw(col)} at time zone 'Asia/Karachi')::date between ${range.from}::date and ${range.to}::date`
      : selected
      ? isDate
        ? sql`to_char(${raw(col)}, 'YYYY-MM') = ${selected}`
        : sql`${month(col)} = ${selected}`
      : isDate
        ? sql`extract(year from ${raw(col)}) = ${year}`
        : sql`extract(year from ${raw(`${col} at time zone 'Asia/Karachi'`)}) = ${year}`;

  // Anyone with records in the selection (e.g. who has since left, or a team leader's own leads).
  const active = sql`
          select l.owner_id from sales.lead l where l.dealership_id = ${dealershipId} and ${inSelection('l.created_at')}
          union select l.owner_id from sales.lead l where l.dealership_id = ${dealershipId} and l.converted_at is not null and ${inSelection('l.converted_at')}
          union select o.salesperson_id from sales.sales_order o where o.dealership_id = ${dealershipId} and o.status <> 'cancelled' and ${inSelection('o.created_at')}
          union select d.salesperson_id from sales.delivery d where d.dealership_id = ${dealershipId} and d.status = 'delivered' and ${inSelection('d.delivered_on', true)}
          union select p.owner_id from sales.ppf_form p where p.dealership_id = ${dealershipId} and ${inSelection('p.created_at')}
          union select q.owner_id from sales.quotation q where q.dealership_id = ${dealershipId} and ${inSelection('q.created_at')}`;
  // Team leaders (Assistant Manager, managers) are listed only with leads / conversions of their own
  // in the period; so a dealership manager who sells nothing is not on the record.
  const leadersActive = sql`(select * from (${active}) a intersect ${holders(dealershipId, P.leadsViewAll)})`;
  // Manager: Salespersons and CROs, plus active team leaders (and leavers with records).
  // Assistant Manager: the Salespersons, plus active team leaders.
  const allowed =
    scope === 'own'
      ? sql`select ${me}::bigint`
      : scope === 'salespeople'
        ? sql`${salespeopleSql(dealershipId)} union ${leadersActive} except ${dealershipManagersSql(dealershipId)}`
        : sql`${salespeopleSql(dealershipId)} union ${crosSql(dealershipId)} union ${active} except ${dealershipManagersSql(dealershipId)}`;
  const people = await query<{ userId: number; fullName: string; kind: 'salesperson' | 'cro' | 'leader' }>(ctx.tx, sql`
    select u.id::int as "userId", u.full_name as "fullName",
           case when u.id in (${salespeopleSql(dealershipId)}) then 'salesperson'
                when u.id in (${crosSql(dealershipId)}) then 'cro' else 'leader' end as kind
      from core."user" u where u.id in (${allowed}) order by u.full_name`);
  // Narrowed to one person the caller can see, or (Manager) all Salespersons / all CROs together.
  const person = q.userId ?? null;
  if (person !== null && !people.some((p) => p.userId === person)) throw forbidden();
  // Groups are the Sales Manager's only; anyone else asking for one is refused (never widened).
  if (q.group && scope !== 'team') throw forbidden();
  const group = person === null ? (q.group ?? null) : null;
  const shown =
    person !== null
      ? sql`select ${person}::bigint`
      : group === 'salespeople'
        ? salespeopleSql(dealershipId)
        : group === 'cros'
          ? crosSql(dealershipId)
          : allowed;

  const members = await query<Counts & { userId: number; fullName: string; isActive: boolean }>(ctx.tx, sql`
    select * from (
      select u.id::int as "userId", u.full_name as "fullName", u.is_active as "isActive", ${countsSql(dealershipId, sql`u.id`, inSelection)}
        from core."user" u
       where u.id in (${shown})
    ) t
    order by "carsBooked" desc, converted desc, "ppfAmount"::numeric desc, "fullName"`);

  // Twelve months of the year for the same people (everyone, the salespeople, one person, or own).
  // Always the people shown, so the months add up to the table (the Dealership Manager is never in it).
  const who = sql`and x.uid in (${shown})`;
  const months = await query<Counts & { month: string }>(ctx.tx, sql`
    with g as (select to_char(make_date(${year}, n, 1), 'YYYY-MM') as month from generate_series(1, 12) n),
    lg as (select to_char(x.created_at at time zone 'Asia/Karachi', 'YYYY-MM') as month, x.owner_id as uid from sales.lead x
           where x.dealership_id = ${dealershipId}),
    cv as (select to_char(x.converted_at at time zone 'Asia/Karachi', 'YYYY-MM') as month, x.owner_id as uid from sales.lead x
           where x.dealership_id = ${dealershipId} and x.converted_at is not null),
    o as (select to_char(x.created_at at time zone 'Asia/Karachi', 'YYYY-MM') as month, x.salesperson_id as uid from sales.sales_order x
           where x.dealership_id = ${dealershipId} and x.status <> 'cancelled'),
    d as (select to_char(x.delivered_on, 'YYYY-MM') as month, x.salesperson_id as uid from sales.delivery x
           where x.dealership_id = ${dealershipId} and x.status = 'delivered'),
    p as (select to_char(x.created_at at time zone 'Asia/Karachi', 'YYYY-MM') as month, x.owner_id as uid, x.total_amount, x.advance_paid from sales.ppf_form x
           where x.dealership_id = ${dealershipId}),
    q as (select to_char(x.created_at at time zone 'Asia/Karachi', 'YYYY-MM') as month, x.owner_id as uid from sales.quotation x
           where x.dealership_id = ${dealershipId})
    select g.month,
      (select count(*)::int from lg x where x.month = g.month ${who}) as "leadsLogged",
      (select count(*)::int from cv x where x.month = g.month ${who}) as converted,
      (select count(*)::int from o x where x.month = g.month ${who}) as "carsBooked",
      (select count(*)::int from d x where x.month = g.month ${who}) as "carsDelivered",
      (select count(*)::int from p x where x.month = g.month ${who}) as "ppfSold",
      (select coalesce(sum(x.total_amount), 0)::numeric(14,2)::text from p x where x.month = g.month ${who}) as "ppfAmount",
      (select coalesce(sum(x.advance_paid), 0)::numeric(14,2)::text from p x where x.month = g.month ${who}) as "ppfAdvance",
      (select count(*)::int from q x where x.month = g.month ${who}) as quotations
    from g order by g.month`);

  const totals = {
    ...Object.fromEntries(COUNTS.map((k) => [k, members.reduce((a, m) => a + m[k], 0)])),
    ...Object.fromEntries(AMOUNTS.map((k) => [k, (members.reduce((a, m) => a + Math.round(Number(m[k]) * 100), 0) / 100).toFixed(2)])),
  } as Counts;
  const out = { dealershipId, year, month: range ? null : (q.month ?? null), from: range?.from ?? null, to: range?.to ?? null, scope, people, userId: person, group, totals, members, months };
  if (!q.details) return out;

  // The customers behind the figures, for the same people and period (report download).
  const day = (col: string) => raw(`to_char(${col} at time zone 'Asia/Karachi', 'YYYY-MM-DD')`);
  const leadRows = (dateCol: string, extra: SQL) => sql`
    select l.owner_id::int as "userId", l.prospect_name as customer, l.prospect_mobile as phone,
           m.brand || ' ' || m.name as vehicle, l.source, l.status,
           ${day('l.created_at')} as "loggedOn", ${day('l.converted_at')} as "convertedOn",
           eb.full_name as "enteredBy", cb.full_name as "convertedBy"
      from sales.lead l
      left join core.vehicle_model m on m.id = l.interested_model_id
      left join core."user" eb on eb.id = l.created_by_id
      left join core."user" cb on cb.id = l.converted_by_id
     where l.dealership_id = ${dealershipId} and l.owner_id in (${shown}) ${extra} and ${inSelection(dateCol)}
     order by l.owner_id, ${raw(dateCol)}
     limit 2000`;
  type LeadRow = { userId: number; customer: string; phone: string; vehicle: string | null; source: string; status: string; loggedOn: string; convertedOn: string | null; enteredBy: string | null; convertedBy: string | null };
  const leadsLogged = await query<LeadRow>(ctx.tx, leadRows('l.created_at', empty));
  const converted = await query<LeadRow>(ctx.tx, leadRows('l.converted_at', sql`and l.converted_at is not null`));
  const ppf = await query<{ userId: number; formNo: string; customer: string; phone: string; soldOn: string; coverage: string; price: string; paid: string; unpaid: string }>(ctx.tx, sql`
    select p.owner_id::int as "userId", p.form_no as "formNo", l.prospect_name as customer, l.prospect_mobile as phone,
           ${day('p.created_at')} as "soldOn", p.coverage,
           p.total_amount::text as price, p.advance_paid::text as paid, (p.total_amount - p.advance_paid)::numeric(14,2)::text as unpaid
      from sales.ppf_form p
      join sales.lead l on l.id = p.lead_id
     where p.dealership_id = ${dealershipId} and p.owner_id in (${shown}) and ${inSelection('p.created_at')}
     order by p.owner_id, p.created_at
     limit 2000`);
  return { ...out, details: { leads: leadsLogged, converted, ppf } };
}
