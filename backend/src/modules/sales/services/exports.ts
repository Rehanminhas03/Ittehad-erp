/**
 * Exports (CSV / Excel and PDF, drawn by the browser): every detail of the sales orders and the leads
 * of a period, within the caller's own view scope (a salesperson: their own; the Assistant Manager /
 * Manager / Admin: their dealerships). Orders carry each payment received (date, amount, instrument).
 */
import { query } from '../../../db/client';
import { and, inArray, sql, type SQL } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { vehicle } from '../../master/models';
import { leads, orders, stock } from '../entities';
import { lead, salesOrder } from '../models';
import type { ExportQuery } from '../schemas';

const day = (col: SQL) => sql`(${col} at time zone 'Asia/Karachi')::date`;

export async function exportOrders(ctx: EntityCtx, q: z.output<typeof ExportQuery>) {
  const conds: (SQL | undefined)[] = [orders.viewCondition(ctx.access)];
  if (q.dealershipId) conds.push(sql`${salesOrder.dealershipId} = ${q.dealershipId}`);
  if (q.from) conds.push(sql`${day(salesOrder.createdAt)} >= ${q.from}::date`);
  if (q.to) conds.push(sql`${day(salesOrder.createdAt)} <= ${q.to}::date`);
  if (q.status) conds.push(sql`${salesOrder.status} = ${q.status}`);
  const rows = await query<Record<string, unknown> & { orderId: number }>(
    ctx.tx,
    sql`select ${salesOrder.id}::int as "orderId", ${salesOrder.orderNo} as "orderNo", ${salesOrder.pboNo} as "pboNo", upper(${salesOrder.orderType}) as "orderType",
               ${salesOrder.status} as "status", d.name as "dealership", d.brand as "brand",
               (${salesOrder.createdAt} at time zone 'Asia/Karachi')::date::text as "bookedOn",
               c.full_name as "customerName", c.mobile as "phone", c.email as "email", c.cnic as "cnic", c.address as "address", c.occupation as "occupation",
               l.customer_type as "customerType", l.company_name as "companyName", l.contact_designation as "contactDesignation", l.purchase_order_no as "purchaseOrderNo", l.referred_by as "referredBy",
               m.brand || ' ' || m.name as "model", ${salesOrder.variant} as "variant", ${salesOrder.color} as "color",
               v.vin as "chassisNo", v.engine_no as "engineNo", v.status as "carStatus",
               u.full_name as "salesperson",
               ${salesOrder.unitPrice}::text as "price", ${salesOrder.discount}::text as "discount", ${salesOrder.totalAmount}::text as "total",
               ${salesOrder.bookingAmount}::text as "bookingAmount", l.payment_type as "paymentType",
               ${salesOrder.expectedDeliveryDate}::text as "expectedDelivery", ${salesOrder.expectedDeliveryByMonth} as "expectedDeliveryByMonth",
               ${salesOrder.clearanceStatus} as "clearance",
               -- The day the Delivery Team marked the car received (else the day its PDI was recorded).
               coalesce((select (max(a.occurred_at) at time zone 'Asia/Karachi')::date::text from audit.audit_log a
                          where a.entity_type = 'master.vehicle' and a.entity_id = v.id::text and a.action = 'status.update' and a.changes->>'status' = 'received'),
                        (${salesOrder.pdiRecordedAt} at time zone 'Asia/Karachi')::date::text) as "receivedOn",
               dl.scheduled_date::text as "deliveryScheduled", dl.delivered_on::text as "deliveredOn",
               ${salesOrder.invoiceNo} as "invoiceNo", ${salesOrder.invoiceDate}::text as "invoiceDate", ${salesOrder.invoiceReceivedOn}::text as "invoiceReceivedOn", ${salesOrder.invoiceNotes} as "invoiceNotes",
               to_char(${salesOrder.invoiceDeliveredAt} at time zone 'Asia/Karachi', 'DD-Mon-YYYY HH12:MI am') as "invoiceDeliveredAt",
               ${salesOrder.paymentReference} as "paymentReference",
               ${salesOrder.notes} as "notes"
          from ${salesOrder}
          join core.dealership d on d.id = ${salesOrder.dealershipId}
          left join core.customer c on c.id = ${salesOrder.customerId}
          left join sales.lead l on l.id = ${salesOrder.leadId}
          left join core.vehicle_model m on m.id = ${salesOrder.modelId}
          left join core.vehicle v on v.id = ${salesOrder.vehicleId}
          left join core."user" u on u.id = ${salesOrder.salespersonId}
          left join sales.delivery dl on dl.sales_order_id = ${salesOrder.id} and dl.status <> 'cancelled'
         where ${and(...conds)}
         order by ${salesOrder.createdAt}, ${salesOrder.id}
         limit 5000`,
  );
  const ids = rows.map((r) => r.orderId);
  const payments = ids.length
    ? await query<{ orderId: number; kind: string; amount: string; instrument: string; reference: string | null; bank: string | null; receivedOn: string }>(
        ctx.tx,
        sql`select sales_order_id::int as "orderId", kind, amount::text as amount, instrument, reference, bank, received_on::text as "receivedOn"
              from sales.order_payment where ${inArray(sql`sales_order_id`, ids)}
             order by received_on, id`,
      )
    : [];
  return rows.map((r) => {
    const mine = payments.filter((p) => p.orderId === r.orderId);
    const received = mine.reduce((s, p) => s + Number(p.amount), 0);
    return {
      ...r,
      received: received.toFixed(2),
      balance: (Number(r.total) - received).toFixed(2),
      payments: mine.map(({ orderId: _o, ...p }) => p),
    };
  });
}

/**
 * The stock sheets: every car of the dealership not yet delivered, with its model, colour, engine and chassis number,
 * its status, the order and customer holding it (if any) and the day it was received. The page picks what to show:
 * the open stock (free cars) or everything received and not delivered.
 */
export async function exportStockSheet(ctx: EntityCtx, q: { dealershipId?: number }) {
  const conds: (SQL | undefined)[] = [stock.viewCondition(ctx.access)];
  if (q.dealershipId) conds.push(sql`exists (select 1 from core.vehicle_dealership vd where vd.vehicle_id = ${vehicle.id} and vd.dealership_id = ${q.dealershipId})`);
  return query<Record<string, unknown>>(
    ctx.tx,
    sql`select ${vehicle.id}::int as "vehicleId", m.brand || ' ' || m.name as "model", ${vehicle.variant} as "variant", ${vehicle.color} as "color",
               ${vehicle.engineNo} as "engineNo", ${vehicle.vin} as "chassisNo", ${vehicle.status} as "status",
               so.id::int as "orderId", so.order_no as "orderNo", so.pbo_no as "pboNo", c.full_name as "customerName",
               coalesce((select (max(a.occurred_at) at time zone 'Asia/Karachi')::date::text from audit.audit_log a
                          where a.entity_type = 'master.vehicle' and a.entity_id = ${vehicle.id}::text and a.action = 'status.update' and a.changes->>'status' = 'received'),
                        (${vehicle.createdAt} at time zone 'Asia/Karachi')::date::text) as "receivedOn"
          from ${vehicle}
          join core.vehicle_model m on m.id = ${vehicle.modelId}
          left join sales.sales_order so on so.vehicle_id = ${vehicle.id} and so.status <> 'cancelled'
          left join core.customer c on c.id = so.customer_id
         where ${and(...conds)}
         order by m.brand, m.name, ${vehicle.variant}, ${vehicle.createdAt}, ${vehicle.id}
         limit 5000`,
  );
}

export async function exportLeads(ctx: EntityCtx, q: z.output<typeof ExportQuery>) {
  const conds: (SQL | undefined)[] = [leads.viewCondition(ctx.access)];
  if (q.dealershipId) conds.push(sql`${lead.dealershipId} = ${q.dealershipId}`);
  // The leads list's period: latest activity (logged, followed up, converted…), as on screen.
  if (q.from) conds.push(sql`${day(lead.updatedAt)} >= ${q.from}::date`);
  if (q.to) conds.push(sql`${day(lead.updatedAt)} <= ${q.to}::date`);
  if (q.status) conds.push(sql`${lead.status} = ${q.status}`);
  if (q.temperature) conds.push(sql`${lead.temperature} = ${q.temperature}`);
  if (q.group && q.group !== 'all') conds.push(q.group === 'social' ? sql`${lead.source} = 'social'` : sql`${lead.source} <> 'social'`);
  return query<Record<string, unknown>>(
    ctx.tx,
    sql`select ${lead.id}::int as "leadId", d.name as "dealership", (${lead.createdAt} at time zone 'Asia/Karachi')::date::text as "loggedOn",
               ${lead.status} as "status", ${lead.source} as "source",
               ${lead.prospectName} as "customerName", ${lead.prospectMobile} as "phone", ${lead.email} as "email", c.address as "address", c.cnic as "cnic",
               ${lead.customerType} as "customerType", ${lead.companyName} as "companyName", ${lead.contactDesignation} as "contactDesignation",
               m.brand || ' ' || m.name as "model", ${lead.variant} as "variant", ${lead.preferredColor} as "color",
               u.full_name as "salesperson", cb.full_name as "loggedBy",
               ${lead.campaignName} as "campaign", ${lead.adName} as "ad", ${lead.city} as "city",
               ${lead.temperature} as "interest", ${lead.nextFollowUpOn}::text as "nextFollowUp",
               case when ${lead.testDriveDone} then 'Done' || coalesce(' on ' || to_char(${lead.testDriveOn}, 'DD-Mon-YY'), '') else 'Not done' end as "testDrive",
               -- Every follow-up: date, who, outcome, interest and the remarks they entered (oldest first).
               (select string_agg(to_char(f.created_at at time zone 'Asia/Karachi', 'DD-Mon-YY') || ' · ' || coalesce(fu.full_name, '')
                         || ' · ' || initcap(replace(f.outcome, '_', ' ')) || coalesce(' · ' || initcap(f.temperature), '')
                         || coalesce(': ' || f.remarks, ''), chr(10) order by f.created_at, f.id)
                  from sales.lead_follow_up f left join core."user" fu on fu.id = f.created_by_id where f.lead_id = ${lead.id}) as "remarks",
               ${lead.followUpCount}::int as "followUps", (${lead.lastFollowUpAt} at time zone 'Asia/Karachi')::date::text as "lastFollowUp",
               (${lead.appointmentAt} at time zone 'Asia/Karachi')::text as "appointment",
               (${lead.convertedAt} at time zone 'Asia/Karachi')::date::text as "convertedOn",
               ${lead.paymentType} as "paymentType", ${lead.paymentAmount}::text as "amountPaid", ${lead.vehiclePrice}::text as "carPrice",
               ${lead.paymentInstrument} as "instrument", ${lead.paymentInstrumentRef} as "instrumentNo", ${lead.paymentInstrumentBank} as "bank",
               o.order_no as "orderNo", o.pbo_no as "pboNo",
               (${lead.lostAt} at time zone 'Asia/Karachi')::date::text as "lostOn", ${lead.lostReason} as "lostReason",
               ${lead.notes} as "notes"
          from ${lead}
          join core.dealership d on d.id = ${lead.dealershipId}
          left join core.customer c on c.id = ${lead.customerId}
          left join core.vehicle_model m on m.id = ${lead.interestedModelId}
          left join core."user" u on u.id = ${lead.ownerId}
          left join core."user" cb on cb.id = ${lead.createdById}
          left join sales.sales_order o on o.id = ${lead.salesOrderId}
         where ${and(...conds)}
         order by ${lead.createdAt}, ${lead.id}
         limit 10000`,
  );
}
