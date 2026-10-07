/**
 * "Today" on the dashboard: what happens today and tomorrow, at a glance — customer appointments
 * and car deliveries (with the cars waiting for the Sales Admin's clearance). The Assistant Manager
 * and the Manager see their dealership; a salesperson their own customers; the Delivery Team the deliveries.
 */
import { query } from '../../../db/client';
import { and, sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { addDays, pakistanToday } from '../../../lib/dates';
import { leads } from '../entities';
import { lead, salesOrder } from '../models';
import { SalesPerm as P } from '../permissions';
import { pipelineScope } from './deliveryPipeline';

type Appointment = { leadId: number; customerName: string; mobile: string; at: string; note: string | null; salespersonName: string | null; status: string };
type Delivery = { orderId: number; orderNo: string; leadId: number | null; customerName: string | null; model: string | null; scheduledDate: string; deliveryId: number; clearanceStatus: string; salespersonName: string | null };

export async function todayAtAGlance(ctx: EntityCtx, dealershipId?: number) {
  const today = pakistanToday();
  const tomorrow = addDays(today, 1);
  const seesLeads = ctx.access.hasAny([P.leadsViewAll, P.leadsViewOwn]);
  const seesDeliveries = ctx.access.hasAny([P.ordersViewAll, P.deliveriesViewAll, P.deliveriesViewOwn, P.leadsViewOwn]);

  const appointments = seesLeads
    ? await query<Appointment & { day: string }>(
        ctx.tx,
        sql`select ${lead.id}::int as "leadId", ${lead.prospectName} as "customerName", ${lead.prospectMobile} as "mobile", ${lead.appointmentAt} as "at",
                   ${lead.appointmentNote} as "note", u.full_name as "salespersonName", ${lead.status} as "status",
                   ((${lead.appointmentAt} at time zone 'Asia/Karachi')::date)::text as "day"
              from ${lead}
              left join core."user" u on u.id = ${lead.ownerId}
             where ${and(leads.viewCondition(ctx.access), dealershipId ? sql`${lead.dealershipId} = ${dealershipId}` : undefined)}
               and (${lead.appointmentAt} at time zone 'Asia/Karachi')::date between ${today}::date and ${tomorrow}::date
               and ${lead.status} not in ('completed', 'exhausted', 'lost')
             order by ${lead.appointmentAt}
             limit 100`,
      )
    : [];

  const deliveries = seesDeliveries
    ? await query<Delivery & { day: string }>(
        ctx.tx,
        sql`select ${salesOrder.id}::int as "orderId", ${salesOrder.orderNo} as "orderNo", ${salesOrder.leadId}::int as "leadId", c.full_name as "customerName",
                   m.brand || ' ' || m.name as "model", d.scheduled_date::text as "scheduledDate", d.id::int as "deliveryId",
                   ${salesOrder.clearanceStatus} as "clearanceStatus", u.full_name as "salespersonName", d.scheduled_date::text as "day"
              from sales.delivery d
              join ${salesOrder} on ${salesOrder.id} = d.sales_order_id
              left join core.customer c on c.id = ${salesOrder.customerId}
              left join core.vehicle_model m on m.id = ${salesOrder.modelId}
              left join core."user" u on u.id = ${salesOrder.salespersonId}
             where d.status = 'scheduled' and d.scheduled_date <= ${tomorrow}::date
               and ${and(pipelineScope(ctx), dealershipId ? sql`${salesOrder.dealershipId} = ${dealershipId}` : undefined)}
             order by d.scheduled_date, ${salesOrder.id}
             limit 100`,
      )
    : [];

  const strip = <T extends { day: string }>(rows: T[]) => rows.map(({ day: _d, ...r }) => r);
  return {
    today,
    tomorrow,
    appointmentsToday: strip(appointments.filter((a) => a.day === today)),
    appointmentsTomorrow: strip(appointments.filter((a) => a.day === tomorrow)),
    // Overdue deliveries (scheduled earlier, not handed over) count as today's.
    deliveriesToday: strip(deliveries.filter((d) => d.day <= today)),
    deliveriesTomorrow: strip(deliveries.filter((d) => d.day === tomorrow)),
  };
}
