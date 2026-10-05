/**
 * "Action needed" for the signed-in person: what is waiting for them right now, by what their roles
 * let them do, always within their own view scope (the same conditions as the lists). Shown as the
 * bell in the top bar, the panel on the dashboard and a pop-up when something new is waiting.
 *   - Sales Manager: orders awaiting approval (urgent when the car is already ready).
 *   - Sales Admin: converted leads needing a sales order; draft orders to submit.
 *   - Delivery Team: cars ready to hand over (urgent), booked orders with no car, deliveries due.
 *   - Overdue (Delivery Team, and who marks cars in transit / schedules deliveries): orders past their
 *     expected delivery (a date, or the end of the expected month) whose car has not arrived; cars
 *     received over 3 days ago with no delivery date.
 *   - Assistant Manager: duplicate customers sent to them.
 *   - Salesperson / CRO (own leads): new leads not followed up; customers whose car is ready.
 */
import { query } from '../../../db/client';
import { and, eq, sql, type SQL } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { pakistanToday } from '../../../lib/dates';
import { vehicle } from '../../master/models';
import { deliveries, leads, orders } from '../entities';
import { delivery, lead, salesOrder } from '../models';
import { SalesPerm as P } from '../permissions';

export type ActionItem = { key: string; title: string; count: number; to: string; urgent: boolean };

const carIs = (status: string, vehicleIdCol: SQL) =>
  sql`exists (select 1 from ${vehicle} where ${vehicle.id} = ${vehicleIdCol} and ${vehicle.status} = ${status})`;

export async function actionItems(ctx: EntityCtx): Promise<ActionItem[]> {
  const { access } = ctx;
  const items: ActionItem[] = [];
  const countOf = async (table: typeof lead | typeof salesOrder | typeof delivery, where: SQL | undefined) =>
    (await query<{ n: number }>(ctx.tx, sql`select count(*)::int as "n" from ${table} where ${where ?? sql`true`}`))[0]?.n ?? 0;
  const add = (item: Omit<ActionItem, 'count'>, n: number) => {
    if (n > 0) items.push({ ...item, count: n });
  };
  const awaitingApproval = sql`${salesOrder.status} in ('draft', 'submitted')`;

  // ---- Sales Manager: approvals ----
  if (access.hasAny([P.ordersApprove])) {
    const scope = orders.viewCondition(access);
    add(
      { key: 'approve-ready', title: 'Cars are ready for delivery but the order still needs your approval', to: '/sales/orders?awaitingApproval=true&vehicleStage=ready_for_delivery', urgent: true },
      await countOf(salesOrder, and(scope, awaitingApproval, carIs('ready_for_delivery', salesOrder.vehicleId))),
    );
    add(
      { key: 'approve', title: 'Sales orders waiting for your approval', to: '/sales/orders?awaitingApproval=true', urgent: false },
      await countOf(salesOrder, and(scope, awaitingApproval)),
    );
  }

  // ---- Sales Admin: orders to raise / submit ----
  if (access.hasAny([P.ordersCreate])) {
    add(
      { key: 'raise-order', title: 'Converted leads need a sales order', to: '/sales/leads?status=converted&range=all', urgent: false },
      await countOf(lead, and(leads.viewCondition(access), eq(lead.status, 'converted'))),
    );
  }
  if (access.hasAny([P.ordersSubmit])) {
    add(
      { key: 'submit-order', title: 'Draft sales orders to submit for approval', to: '/sales/orders?status=draft', urgent: false },
      await countOf(salesOrder, and(orders.viewCondition(access), eq(salesOrder.status, 'draft'))),
    );
  }

  // ---- Delivery Team: cars to hand over / find ----
  if (access.hasAny([P.ordersAllocate])) {
    const scope = orders.viewCondition(access);
    add(
      { key: 'hand-over', title: 'Cars are ready to hand over to the customer', to: '/sales/orders?status=approved&vehicleStage=ready_for_delivery', urgent: true },
      await countOf(salesOrder, and(scope, eq(salesOrder.status, 'approved'), carIs('ready_for_delivery', salesOrder.vehicleId))),
    );
    add(
      { key: 'needs-car', title: 'Booked orders are waiting for a car', to: '/sales/delivery-status?range=all&stage=waiting', urgent: false },
      await countOf(salesOrder, and(scope, sql`${salesOrder.status} in ('draft', 'submitted', 'approved')`, sql`${salesOrder.vehicleId} is null`)),
    );
  }
  if (access.hasAny([P.deliveriesComplete])) {
    add(
      { key: 'delivery-due', title: 'Deliveries are due today (or overdue)', to: '/sales/delivery-status?range=all&stage=scheduled', urgent: true },
      await countOf(delivery, and(deliveries.viewCondition(access), eq(delivery.status, 'scheduled'), sql`${delivery.scheduledDate} <= ${pakistanToday()}::date`)),
    );
  }

  // ---- Overdue deliveries ----
  // Past the expected delivery (a month is stored as its last day) and the car has not arrived.
  if (access.hasAny([P.ordersAllocate, P.ordersDispatch])) {
    const notArrived = sql`(${salesOrder.vehicleId} is null or not exists (select 1 from ${vehicle} where ${vehicle.id} = ${salesOrder.vehicleId}
      and ${vehicle.status} in ('received', 'ready_for_delivery', 'delivered')))`;
    add(
      { key: 'overdue-car', title: 'Orders past their expected delivery and the car has not arrived', to: '/sales/delivery-status?range=all&stage=waiting&overdue=true', urgent: true },
      await countOf(
        salesOrder,
        and(orders.viewCondition(access), sql`${salesOrder.status} in ('submitted', 'approved')`, sql`${salesOrder.expectedDeliveryDate} < ${pakistanToday()}::date`, notArrived),
      ),
    );
  }
  // At the dealership for over 3 days (received, the last change to the car) with no delivery date.
  if (access.hasAny([P.deliveriesSchedule])) {
    add(
      { key: 'received-not-scheduled', title: 'Cars received over 3 days ago with no delivery scheduled', to: '/sales/delivery-status?range=all&stage=received', urgent: true },
      await countOf(
        salesOrder,
        and(
          orders.viewCondition(access),
          eq(salesOrder.status, 'approved'),
          sql`exists (select 1 from ${vehicle} where ${vehicle.id} = ${salesOrder.vehicleId} and ${vehicle.status} = 'received' and ${vehicle.updatedAt} < now() - interval '3 days')`,
          sql`not exists (select 1 from ${delivery} where ${delivery.salesOrderId} = ${salesOrder.id} and ${delivery.status} = 'scheduled')`,
        ),
      ),
    );
  }

  // ---- Assistant Manager: duplicate customers ----
  if (access.hasAny([P.leadsConvertEscalated])) {
    add(
      { key: 'duplicates', title: 'Duplicate customers sent to you by salespeople', to: '/sales/leads?escalated=true&open=true&range=all', urgent: false },
      await countOf(lead, and(leads.viewCondition(access), sql`${lead.escalatedAt} is not null`, sql`${lead.status} in ('new', 'follow_up', 'visited')`)),
    );
  }

  // ---- Appointments today: the salesperson (own leads), the Assistant Manager and the Manager ----
  if (access.hasAny([P.leadsViewAll, P.leadsViewOwn])) {
    const today = pakistanToday();
    add(
      { key: 'appointments-today', title: 'Customer appointments today', to: `/sales/leads?appointmentOn=${today}&range=all`, urgent: true },
      await countOf(
        lead,
        and(
          leads.viewCondition(access),
          sql`(${lead.appointmentAt} at time zone 'Asia/Karachi')::date = ${today}::date`,
          sql`${lead.status} not in ('completed', 'exhausted')`,
        ),
      ),
    );
  }

  // ---- Anyone working their own leads (Salesperson, CRO, team leaders' own) ----
  if (access.hasAny([P.leadsConvertOwn])) {
    const mine = and(leads.viewCondition(access), eq(lead.ownerId, access.userId));
    const today = pakistanToday();
    add(
      {
        key: 'follow-up',
        title: 'Your new leads not followed up since an earlier day',
        to: `/sales/leads?status=new&ownerId=${access.userId}&createdBefore=${today}&range=all`,
        urgent: false,
      },
      await countOf(lead, and(mine, eq(lead.status, 'new'), sql`(${lead.createdAt} at time zone 'Asia/Karachi')::date < ${today}::date`)),
    );
    add(
      { key: 'car-ready', title: "Your customers' cars are ready for delivery — let them know", to: `/sales/leads?status=processing&vehicleStage=ready_for_delivery&ownerId=${access.userId}&range=all`, urgent: false },
      await countOf(
        lead,
        and(mine, eq(lead.status, 'processing'), sql`exists (select 1 from ${salesOrder} where ${salesOrder.id} = ${lead.salesOrderId} and ${carIs('ready_for_delivery', salesOrder.vehicleId)})`),
      ),
    );
  }
  return items;
}
