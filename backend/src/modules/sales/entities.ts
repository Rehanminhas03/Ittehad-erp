import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { POLICIES } from '../../config/policies';
import { EntityService } from '../../entity/entityService';
import { withNames } from '../../entity/names';
import type { EntityConfig, EntityCtx, Row } from '../../entity/types';
import { conflict, forbidden, validationError } from '../../lib/errors';
import { addMoney, cmpMoney, fromPaisa, mulMoney, percentOf, subMoney, toPaisa } from '../../lib/money';
import { BoolQuery, IdQuery, z } from '../../lib/zod';
import { DocType, nextDocumentNumber } from '../core/documents';
import { pakistanToday } from '../../lib/dates';
import { dealership, user } from '../core/models';
import { assertActiveModel } from '../master/entities';
import { customer, vehicle, vehicleDealership, VEHICLE_STATUSES } from '../master/models';
import { CUSTOMER_NAME, MODEL_NAME, USER_NAME, VEHICLE_LABEL, VEHICLE_STATUS } from '../master/nameSources';
import { mobileSearchTerm, normalizeIdentifier, normalizeMobile } from '../master/normalize';
import { findVehicleByIdentifiers, vehicleVisibility } from '../master/repository';
import { ACTIVE_LEAD_STATES, delivery, documentTemplate, lead, LEAD_STATES, ppfForm, quotation, salesOrder, vehicleVariant } from './models';
import { SalesPerm as P } from './permissions';
import { detectModel } from './variantCatalog';
import { LEAD_NAME, ORDER_NO, ORDER_VEHICLE_STAGE } from './repository';
import {
  DeliverySchema,
  LeadCreate,
  LeadSchema,
  LeadUpdate,
  PpfFormSchema,
  PpfFormUpdate,
  QuotationSchema,
  QuotationUpdate,
  VehicleVariantCreate,
  VehicleVariantSchema,
  VehicleVariantUpdate,
  SalesOrderCreate,
  SalesOrderSchema,
  SalesOrderUpdate,
  StockVehicleSchema,
  StockVehicleUpdate,
} from './schemas';

const statusFilter = (states: readonly string[]) => ({ key: 'status', schema: z.enum(states as [string, ...string[]]) });

/** Follow-ups needed before a lead may be marked exhausted (enforced, not advisory). */
export const MIN_FOLLOW_UPS_TO_EXHAUST = 3;
export const DUPLICATE_LEAD_MESSAGE = 'Duplicate lead already exists';

/** A customer referenced by a sales document must belong to the same dealership. */
async function assertCustomerInDealership(ctx: EntityCtx, customerId: number, dealershipId: number) {
  const [c] = await ctx.tx.select({ dealershipId: customer.dealershipId }).from(customer).where(eq(customer.id, customerId));
  if (!c || c.dealershipId !== dealershipId) {
    throw validationError([{ in: 'body', path: 'customerId', message: 'Choose a customer of this dealership' }]);
  }
}

/**
 * Logging a lead for someone else: only team leaders (who see every lead there), and only for staff
 * who work their own leads at that dealership (Salesperson, CRO).
 */
async function assertCanLogFor(ctx: EntityCtx, ownerId: number, dealershipId: number) {
  if (!ctx.access.canIn(P.leadsViewAll, { dealershipId })) throw forbidden('You can only log leads for yourself');
  const { rows } = await ctx.tx.execute(sql`
    select 1 from core.user_role ur
      join core.role_permission rp on rp.role_id = ur.role_id
      join core.permission p on p.id = rp.permission_id
      join core."user" u on u.id = ur.user_id
     where ur.user_id = ${ownerId} and ur.dealership_id = ${dealershipId} and u.is_active and p.code = ${P.leadsConvertOwn}
       -- not another team leader (they see every lead)
       and not exists (select 1 from core.user_role ur2
                         join core.role_permission rp2 on rp2.role_id = ur2.role_id
                         join core.permission p2 on p2.id = rp2.permission_id
                        where ur2.user_id = ${ownerId} and ur2.dealership_id = ${dealershipId} and p2.code = ${P.leadsViewAll})
     limit 1`);
  if (!rows.length) throw validationError([{ in: 'body', path: 'ownerId', message: 'Choose a salesperson of this dealership' }]);
}

/** Assigning a record to someone else requires the "all" update permission there. */
function assertCanAssign(ctx: EntityCtx, assigneeId: unknown, perm: string, target: { dealershipId: number; branchId: number | null }) {
  if (assigneeId !== undefined && assigneeId !== ctx.access.userId && !ctx.access.canIn(perm, target)) {
    throw forbidden('You can only assign records to yourself');
  }
}

/**
 * Duplicate control: a phone number may have only one active lead per dealership. The existing
 * lead is looked up regardless of who owns it (RLS still confines it to the dealership); its id is
 * returned only to callers who may open it (e.g. the Assistant Manager), others can escalate.
 */
export async function assertNoActiveLead(ctx: EntityCtx, dealershipId: number, mobileNormalized: string, exceptId?: number) {
  const [existing] = await ctx.tx
    .select({ id: lead.id, escalatedAt: lead.escalatedAt })
    .from(lead)
    .where(
      and(
        eq(lead.dealershipId, dealershipId),
        eq(lead.prospectMobileNormalized, mobileNormalized),
        inArray(lead.status, [...ACTIVE_LEAD_STATES]),
        exceptId ? sql`${lead.id} <> ${exceptId}` : undefined,
      ),
    );
  if (!existing) return;
  const [visible] = await ctx.tx
    .select({ id: lead.id, ownerName: user.fullName })
    .from(lead)
    .innerJoin(user, eq(user.id, lead.ownerId))
    .where(and(eq(lead.id, existing.id), leads.viewCondition(ctx.access)));
  throw conflict(DUPLICATE_LEAD_MESSAGE, {
    duplicate: true,
    escalated: !!existing.escalatedAt,
    existingId: visible ? existing.id : undefined,
    // Who has it (only for those who may open it, e.g. a team leader).
    ownerName: visible ? visible.ownerName : undefined,
  });
}

// =============================================================================
// Leads
// =============================================================================
export const leadEntity: EntityConfig = {
  entityType: 'sales.lead',
  module: 'sales',
  path: 'leads',
  names: { singular: 'Lead', plural: 'Leads' },
  table: lead,
  schemas: { read: LeadSchema, create: LeadCreate, update: LeadUpdate },
  permissions: {
    view: P.leadsViewAll,
    viewOwn: P.leadsViewOwn,
    // The Admin sees a lead only once it is converted (to raise the order).
    viewWhen: { code: P.leadsViewConverted, condition: inArray(lead.status, ['converted', 'processing', 'completed']) },
    create: P.leadsCreate,
    update: P.leadsUpdate,
    updateOwn: P.leadsUpdateOwn,
  },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'ownerId',
  search: ['prospectName', 'prospectMobileNormalized'],
  // Name, or phone typed any way (full or partial, with or without dashes / spaces).
  normalizeSearch: mobileSearchTerm,
  filters: {
    status: statusFilter(LEAD_STATES),
    ownerId: { key: 'ownerId', schema: IdQuery },
    source: { key: 'source', schema: z.string().max(20) },
    // The Assistant Manager's queue: leads flagged by a duplicate-phone escalation.
    escalated: { key: 'escalatedAt', schema: BoolQuery, where: (v) => (v ? sql`${lead.escalatedAt} is not null` : sql`${lead.escalatedAt} is null`) },
    // Still open (new, follow-up, visited): the "Open leads" figure.
    open: {
      key: 'status',
      schema: BoolQuery,
      where: (v) => (v ? sql`${lead.status} in ('new', 'follow_up', 'visited')` : sql`${lead.status} not in ('new', 'follow_up', 'visited')`),
    },
    // Converted in a period (dashboard "Converted" tile).
    convertedFrom: { key: 'convertedAt', schema: z.iso.date(), where: (v) => sql`(${lead.convertedAt} at time zone 'Asia/Karachi')::date >= ${v}::date` },
    convertedTo: { key: 'convertedAt', schema: z.iso.date(), where: (v) => sql`(${lead.convertedAt} at time zone 'Asia/Karachi')::date <= ${v}::date` },
    // Logged before a day ("not followed up for over a day").
    createdBefore: { key: 'createdAt', schema: z.iso.date(), where: (v) => sql`(${lead.createdAt} at time zone 'Asia/Karachi')::date < ${v}::date` },
    // Where the car on the lead's sales order is (e.g. ready_for_delivery: "let the customer know").
    vehicleStage: {
      key: 'salesOrderId',
      schema: z.enum(VEHICLE_STATUSES),
      where: (v) =>
        sql`exists (select 1 from ${salesOrder} join ${vehicle} on ${vehicle.id} = ${salesOrder.vehicleId} where ${salesOrder.id} = ${lead.salesOrderId} and ${vehicle.status} = ${v})`,
    },
    // Leads logged on one day (Assistant Manager: leads per day).
    createdOn: { key: 'createdAt', schema: z.iso.date(), where: (v) => sql`(${lead.createdAt} at time zone 'Asia/Karachi')::date = ${v}::date` },
    // Latest activity (logged, followed up, converted, order raised, delivered, corrected): an old lead
    // converted today belongs to today. updated_at moves with every change to the lead.
    activityFrom: { key: 'updatedAt', schema: z.iso.date(), where: (v) => sql`(${lead.updatedAt} at time zone 'Asia/Karachi')::date >= ${v}::date` },
    activityTo: { key: 'updatedAt', schema: z.iso.date(), where: (v) => sql`(${lead.updatedAt} at time zone 'Asia/Karachi')::date <= ${v}::date` },
  },
  sort: { default: '-updatedAt', keys: ['updatedAt', 'createdAt', 'prospectName', 'status', 'followUpCount', 'convertedAt'] },
  workflow: {
    stateKey: 'status',
    initial: 'new',
    states: [
      { key: 'new', label: 'New' },
      { key: 'follow_up', label: 'Follow-up' },
      { key: 'visited', label: 'Visited' },
      { key: 'converted', label: 'Converted' },
      { key: 'processing', label: 'Processing' },
      { key: 'completed', label: 'Completed', terminal: true },
      { key: 'exhausted', label: 'Exhausted', terminal: true },
    ],
    transitions: [
      {
        action: 'exhaust',
        label: 'Mark exhausted',
        from: ['new', 'follow_up', 'visited'],
        to: 'exhausted',
        permission: P.leadsUpdate,
        ownPermission: P.leadsUpdateOwn,
        requiresComment: true,
        guard: (_ctx, row) =>
          (row.followUpCount as number) < MIN_FOLLOW_UPS_TO_EXHAUST
            ? `At least ${MIN_FOLLOW_UPS_TO_EXHAUST} follow-ups are required before a lead is exhausted (${row.followUpCount as number} recorded)`
            : null,
      },
      { action: 'reopen', label: 'Reopen', from: ['exhausted'], to: 'follow_up', permission: P.leadsReopen },
      // Set by the server: follow-ups, conversion and the order lifecycle.
      { action: 'follow_up', label: 'Follow-up', from: ['new'], to: 'follow_up', permission: P.leadsUpdateOwn, system: true },
      { action: 'visit', label: 'Visited', from: ['new', 'follow_up', 'visited'], to: 'visited', permission: P.leadsUpdateOwn, system: true },
      { action: 'convert', label: 'Converted', from: ['new', 'follow_up', 'visited'], to: 'converted', permission: P.leadsConvertOwn, system: true },
      { action: 'raise_order', label: 'Sales order raised', from: ['converted'], to: 'processing', permission: P.ordersCreate, system: true },
      { action: 'complete', label: 'Order delivered', from: ['processing'], to: 'completed', permission: P.deliveriesComplete, system: true },
      { action: 'order_cancelled', label: 'Order cancelled', from: ['processing'], to: 'converted', permission: P.ordersCancel, system: true },
    ],
  },
  hooks: {
    beforeCreate: async (ctx, data) => {
      const mobileNormalized = normalizeMobile(String(data.prospectMobile))!;
      await assertNoActiveLead(ctx, data.dealershipId as number, mobileNormalized);
      if (data.interestedModelId) await assertActiveModel(ctx, data.interestedModelId as number);
      // A lead belongs to whoever logged it, unless a team leader logs it for a salesperson.
      const ownerId = (data.ownerId as number | undefined) ?? ctx.access.userId;
      if (ownerId !== ctx.access.userId) await assertCanLogFor(ctx, ownerId, data.dealershipId as number);
      return { ...data, ownerId, prospectMobileNormalized: mobileNormalized };
    },
    beforeUpdate: async (ctx, row, patch) => {
      if (!['new', 'follow_up', 'visited'].includes(row.status as string)) {
        throw conflict('Only open leads can be edited; converted details are fixed once the Admin has them');
      }
      const target = { dealershipId: row.dealershipId as number, branchId: (row.branchId as number | null) ?? null };
      if (patch.ownerId !== undefined && patch.ownerId !== row.ownerId) assertCanAssign(ctx, patch.ownerId, P.leadsUpdate, target);
      if (patch.interestedModelId) await assertActiveModel(ctx, patch.interestedModelId as number);
      if (typeof patch.prospectMobile === 'string') {
        patch.prospectMobileNormalized = normalizeMobile(patch.prospectMobile);
        await assertNoActiveLead(ctx, target.dealershipId, patch.prospectMobileNormalized as string, row.id);
      }
      return patch;
    },
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        ownerName: { key: 'ownerId', source: USER_NAME },
        modelName: { key: 'interestedModelId', source: MODEL_NAME },
        escalatedByName: { key: 'escalatedById', source: USER_NAME },
        convertedByName: { key: 'convertedById', source: USER_NAME },
        createdByName: { key: 'createdById', source: USER_NAME },
        orderNo: { key: 'salesOrderId', source: ORDER_NO },
        // The car's progress (booked → in transit → received → ready), for the salesperson / AM.
        vehicleStage: { key: 'salesOrderId', source: ORDER_VEHICLE_STAGE },
      }),
  },
};

// =============================================================================
// Sales orders (raised by the Admin from a converted lead)
// =============================================================================
/** Server-computed commercial fields; enforces the discount policy. */
export function priceOrder(data: Record<string, unknown>, before?: Row) {
  const unitPrice = String(data.unitPrice ?? before?.unitPrice ?? '0');
  const discount = String(data.discount ?? before?.discount ?? '0');
  if (cmpMoney(discount, unitPrice) > 0) throw validationError([{ in: 'body', path: 'discount', message: 'Discount cannot exceed the price' }]);
  const pct = percentOf(discount, unitPrice);
  if (pct > POLICIES.sales.maxDiscountPercent) {
    throw validationError([
      { in: 'body', path: 'discount', message: `Discount is ${pct}% of the price; the maximum is ${POLICIES.sales.maxDiscountPercent}%` },
    ]);
  }
  return { ...data, totalAmount: subMoney(unitPrice, discount) };
}

const approverGuard = (ctx: EntityCtx, row: Row) =>
  POLICIES.sales.approverMustDifferFromSalesperson &&
  (row.salespersonId === ctx.access.userId || row.createdById === ctx.access.userId)
    ? 'An order must be approved by someone other than its salesperson or creator'
    : null;

/** Moves the order's lead with it (processing → completed / back to converted). */
async function moveLead(ctx: EntityCtx, row: Row, action: 'complete' | 'order_cancelled') {
  if (!row.leadId) return;
  const [l] = await ctx.tx.select({ status: lead.status }).from(lead).where(eq(lead.id, row.leadId as number));
  if (l?.status === 'processing') await leads.transition(ctx, row.leadId as number, action, `Order ${row.orderNo as string}`, { system: true });
}

export const salesOrderEntity: EntityConfig = {
  entityType: 'sales.order',
  module: 'sales',
  path: 'orders',
  names: { singular: 'SalesOrder', plural: 'SalesOrders' },
  table: salesOrder,
  schemas: { read: SalesOrderSchema, create: SalesOrderCreate, update: SalesOrderUpdate },
  permissions: {
    view: P.ordersViewAll,
    viewOwn: P.ordersViewOwn,
    create: P.ordersCreate,
    update: P.ordersUpdate,
    updateOwn: P.ordersUpdateOwn,
  },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'salespersonId',
  search: ['orderNo'],
  filters: {
    status: statusFilter(['draft', 'submitted', 'approved', 'delivered', 'cancelled']),
    orderType: { key: 'orderType', schema: z.enum(['pbo', 'cbo']) },
    customerId: { key: 'customerId', schema: IdQuery },
    salespersonId: { key: 'salespersonId', schema: IdQuery },
    modelId: { key: 'modelId', schema: IdQuery },
    leadId: { key: 'leadId', schema: IdQuery },
    // Delivery Team queue: booked and not yet delivered or cancelled (draft, submitted, approved).
    live: {
      key: 'status',
      schema: BoolQuery,
      where: (v) => (v ? sql`${salesOrder.status} in ('draft', 'submitted', 'approved')` : sql`${salesOrder.status} in ('delivered', 'cancelled')`),
    },
    // Not approved yet (draft or submitted): the Manager's approvals.
    awaitingApproval: {
      key: 'status',
      schema: BoolQuery,
      where: (v) => (v ? sql`${salesOrder.status} in ('draft', 'submitted')` : sql`${salesOrder.status} not in ('draft', 'submitted')`),
    },
    // Where the order's car is (e.g. ready_for_delivery: to hand over / approve).
    vehicleStage: {
      key: 'vehicleId',
      schema: z.enum(VEHICLE_STATUSES),
      where: (v) => sql`exists (select 1 from ${vehicle} where ${vehicle.id} = ${salesOrder.vehicleId} and ${vehicle.status} = ${v})`,
    },
    // Orders still waiting for a vehicle (with `live`: the Delivery Team's to-do).
    hasVehicle: { key: 'vehicleId', schema: BoolQuery, where: (v) => (v ? sql`${salesOrder.vehicleId} is not null` : sql`${salesOrder.vehicleId} is null`) },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'orderNo', 'totalAmount', 'expectedDeliveryDate', 'status'] },
  workflow: {
    stateKey: 'status',
    initial: 'draft',
    states: [
      { key: 'draft', label: 'Draft' },
      { key: 'submitted', label: 'Submitted' },
      { key: 'approved', label: 'Approved' },
      { key: 'delivered', label: 'Delivered', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      {
        action: 'submit',
        label: 'Submit for approval',
        from: ['draft'],
        to: 'submitted',
        permission: P.ordersSubmit,
        guard: (_ctx, row) => (cmpMoney(row.unitPrice as string, '0') <= 0 ? 'Enter the vehicle price before submitting' : null),
      },
      // The Manager can approve a submitted order, or a draft directly (e.g. its car is already
      // ready for delivery and the Admin has not submitted it); a draft needs its price.
      {
        action: 'approve',
        label: 'Approve',
        from: ['draft', 'submitted'],
        to: 'approved',
        permission: P.ordersApprove,
        guard: (ctx, row) =>
          approverGuard(ctx, row) ?? (row.status === 'draft' && cmpMoney(row.unitPrice as string, '0') <= 0 ? 'Enter the vehicle price before approving' : null),
      },
      { action: 'return', label: 'Return to draft', from: ['submitted'], to: 'draft', permission: P.ordersApprove, requiresComment: true },
      {
        action: 'cancel',
        label: 'Cancel order',
        from: ['draft', 'submitted', 'approved'],
        to: 'cancelled',
        permission: P.ordersCancel,
        requiresComment: true,
        // A scheduled delivery is cancelled with the order, its vehicle freed and its lead reopened.
        effect: async (ctx, row) => {
          await ctx.tx
            .update(delivery)
            .set({ status: 'cancelled', updatedById: ctx.access.userId })
            .where(and(eq(delivery.salesOrderId, row.id), eq(delivery.status, 'scheduled')));
          if (row.vehicleId) {
            await ctx.tx.update(vehicle).set({ status: 'available', updatedById: ctx.access.userId }).where(eq(vehicle.id, row.vehicleId as number));
            await ctx.audit({ entityType: 'master.vehicle', entityId: row.vehicleId as number, action: 'status.update', dealershipId: row.dealershipId as number, branchId: null, changes: { status: 'available' } });
          }
          await moveLead(ctx, row, 'order_cancelled');
        },
      },
      // Set when the delivery is completed.
      {
        action: 'deliver',
        label: 'Delivered',
        from: ['approved'],
        to: 'delivered',
        permission: P.deliveriesComplete,
        system: true,
        effect: (ctx, row) => moveLead(ctx, row, 'complete'),
      },
    ],
  },
  hooks: {
    beforeCreate: async (ctx, data) => {
      const dealershipId = data.dealershipId as number;
      const target = { dealershipId, branchId: (data.branchId as number | null) ?? null };
      assertCanAssign(ctx, data.salespersonId, P.ordersUpdate, target);
      await assertCustomerInDealership(ctx, data.customerId as number, dealershipId);
      await assertActiveModel(ctx, data.modelId as number);
      const [d] = await ctx.tx
        .select({ legalEntityId: dealership.legalEntityId, accountingEntityId: dealership.accountingEntityId })
        .from(dealership)
        .where(eq(dealership.id, dealershipId));
      return {
        ...priceOrder(data),
        salespersonId: data.salespersonId ?? ctx.access.userId,
        legalEntityId: d?.legalEntityId ?? null,
        accountingEntityId: d?.accountingEntityId ?? null,
        orderNo: await nextDocumentNumber(ctx.tx, dealershipId, DocType.salesOrder),
      };
    },
    beforeUpdate: async (ctx, row, patch) => {
      if (row.status !== 'draft') throw conflict('Only draft orders can be edited; return it to draft first');
      const target = { dealershipId: row.dealershipId as number, branchId: (row.branchId as number | null) ?? null };
      if (patch.salespersonId !== undefined && patch.salespersonId !== row.salespersonId) {
        assertCanAssign(ctx, patch.salespersonId, P.ordersUpdate, target);
      }
      if (patch.customerId) await assertCustomerInDealership(ctx, patch.customerId as number, target.dealershipId);
      if (patch.modelId) await assertActiveModel(ctx, patch.modelId as number);
      return patch.unitPrice !== undefined || patch.discount !== undefined ? priceOrder(patch, row) : patch;
    },
    decorate: async (ctx, rows) => {
      const named = await withNames(ctx.tx, rows, {
        customerName: { key: 'customerId', source: CUSTOMER_NAME },
        salespersonName: { key: 'salespersonId', source: USER_NAME },
        modelName: { key: 'modelId', source: MODEL_NAME },
        vehicleLabel: { key: 'vehicleId', source: VEHICLE_LABEL },
        vehicleStatus: { key: 'vehicleId', source: VEHICLE_STATUS },
      });
      const ids = rows.map((r) => r.vehicleId).filter((x): x is number => typeof x === 'number');
      if (!ids.length) return named;
      const vs = await ctx.tx.select({ id: vehicle.id, vin: vehicle.vin, engineNo: vehicle.engineNo }).from(vehicle).where(inArray(vehicle.id, ids));
      const byId = new Map(vs.map((v) => [v.id, v]));
      return named.map((r) => ({ ...r, vehicleVin: byId.get(r.vehicleId as number)?.vin ?? null, vehicleEngineNo: byId.get(r.vehicleId as number)?.engineNo ?? null }));
    },
  },
};

// =============================================================================
// Deliveries
// =============================================================================
export const deliveryEntity: EntityConfig = {
  entityType: 'sales.delivery',
  module: 'sales',
  path: 'deliveries',
  names: { singular: 'Delivery', plural: 'Deliveries' },
  table: delivery,
  // Created by scheduling from an order; completed via its own endpoint (see deliveries.ts).
  schemas: { read: DeliverySchema },
  permissions: { view: P.deliveriesViewAll, viewOwn: P.deliveriesViewOwn },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'salespersonId',
  search: ['deliveryNo'],
  filters: {
    status: statusFilter(['scheduled', 'delivered', 'cancelled']),
    salesOrderId: { key: 'salesOrderId', schema: IdQuery },
    // Due: scheduled for today or earlier (Pakistan calendar day).
    due: {
      key: 'scheduledDate',
      schema: BoolQuery,
      where: (v) => (v ? sql`${delivery.scheduledDate} <= ${pakistanToday()}::date` : sql`${delivery.scheduledDate} > ${pakistanToday()}::date`),
    },
    // Handed over in a period (dashboard "Delivered" tile).
    deliveredFrom: { key: 'deliveredOn', schema: z.iso.date(), where: (v) => sql`${delivery.deliveredOn} >= ${v}::date` },
    deliveredTo: { key: 'deliveredOn', schema: z.iso.date(), where: (v) => sql`${delivery.deliveredOn} <= ${v}::date` },
  },
  sort: { default: 'scheduledDate', keys: ['scheduledDate', 'deliveredOn', 'deliveryNo', 'createdAt'] },
  workflow: {
    stateKey: 'status',
    initial: 'scheduled',
    states: [
      { key: 'scheduled', label: 'Scheduled' },
      { key: 'delivered', label: 'Delivered', terminal: true },
      { key: 'cancelled', label: 'Cancelled', terminal: true },
    ],
    transitions: [
      { action: 'cancel', label: 'Cancel delivery', from: ['scheduled'], to: 'cancelled', permission: P.deliveriesSchedule, requiresComment: true },
      // Run by the "complete delivery" endpoint, which records odometer, ownership and activation.
      { action: 'complete', label: 'Delivered', from: ['scheduled'], to: 'delivered', permission: P.deliveriesComplete, system: true },
    ],
  },
  hooks: {
    decorate: (ctx, rows) =>
      withNames(ctx.tx, rows, {
        orderNo: { key: 'salesOrderId', source: ORDER_NO },
        customerName: { key: 'customerId', source: CUSTOMER_NAME },
        salespersonName: { key: 'salespersonId', source: USER_NAME },
        vehicleLabel: { key: 'vehicleId', source: VEHICLE_LABEL },
      }),
  },
};

// =============================================================================
// Open stock (Delivery Team): the dealership's undelivered vehicles
// =============================================================================
/** Live (not cancelled) order holding each vehicle, with its customer. */
async function decorateStock(ctx: EntityCtx, rows: Row[]): Promise<Row[]> {
  const named = await withNames(ctx.tx, rows, { modelName: { key: 'modelId', source: MODEL_NAME } });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return named;
  const orders = await ctx.tx
    .select({ vehicleId: salesOrder.vehicleId, id: salesOrder.id, orderNo: salesOrder.orderNo, status: salesOrder.status, customerId: salesOrder.customerId })
    .from(salesOrder)
    .where(and(inArray(salesOrder.vehicleId, ids), ne(salesOrder.status, 'cancelled')));
  const customers = orders.length
    ? await ctx.tx.select({ id: customer.id, fullName: customer.fullName }).from(customer).where(inArray(customer.id, orders.map((o) => o.customerId)))
    : [];
  const links = await ctx.tx
    .select({ vehicleId: vehicleDealership.vehicleId, dealershipId: vehicleDealership.dealershipId, name: dealership.name })
    .from(vehicleDealership)
    .innerJoin(dealership, eq(dealership.id, vehicleDealership.dealershipId))
    .where(inArray(vehicleDealership.vehicleId, ids))
    .orderBy(vehicleDealership.id);
  const byVehicle = new Map(orders.map((o) => [o.vehicleId, o]));
  const names = new Map(customers.map((c) => [c.id, c.fullName]));
  return named.map((r) => {
    const o = byVehicle.get(r.id);
    const link = links.find((l) => l.vehicleId === r.id && ctx.access.canIn(P.stockView, { dealershipId: l.dealershipId })) ?? links.find((l) => l.vehicleId === r.id);
    return {
      ...r,
      dealershipId: link?.dealershipId ?? null,
      dealershipName: link?.name ?? null,
      orderId: o?.id ?? null,
      orderNo: o?.orderNo ?? null,
      orderStatus: o?.status ?? null,
      customerName: o ? (names.get(o.customerId) ?? null) : null,
    };
  });
}

const liveOrderExists = sql`exists (select 1 from ${salesOrder} so where so.vehicle_id = ${vehicle.id} and so.status <> 'cancelled')`;

export const stockVehicleEntity: EntityConfig = {
  entityType: 'sales.stock_vehicle',
  module: 'sales',
  path: 'stock',
  names: { singular: 'StockVehicle', plural: 'StockVehicles' },
  table: vehicle,
  // Registered through POST /sales/stock (see services/stock.ts); delivered vehicles leave the stock.
  schemas: { read: StockVehicleSchema, update: StockVehicleUpdate },
  permissions: { view: P.stockView, update: P.stockManage },
  tenant: null,
  linkedScope: {
    view: (access, codes) => and(isNull(vehicle.activatedOn), vehicleVisibility(access, codes))!,
    writeDealership: async (ctx, row, permission) => {
      const links = await ctx.tx
        .select({ dealershipId: vehicleDealership.dealershipId })
        .from(vehicleDealership)
        .where(eq(vehicleDealership.vehicleId, row.id))
        .orderBy(vehicleDealership.id);
      return links.find((l) => ctx.access.canIn(permission, { dealershipId: l.dealershipId }))?.dealershipId ?? null;
    },
  },
  search: ['vin', 'engineNo', 'registrationNo'],
  normalizeSearch: normalizeIdentifier,
  filters: {
    status: { key: 'status', schema: z.enum(VEHICLE_STATUSES) },
    modelId: { key: 'modelId', schema: IdQuery },
    dealershipId: {
      key: 'id',
      schema: IdQuery,
      where: (v) => sql`exists (select 1 from ${vehicleDealership} vd where vd.vehicle_id = ${vehicle.id} and vd.dealership_id = ${v as number})`,
    },
    // Free stock vs. vehicles already on a live order.
    allocated: { key: 'id', schema: BoolQuery, where: (v) => (v ? liveOrderExists : sql`not ${liveOrderExists}`) },
  },
  sort: { default: '-createdAt', keys: ['createdAt', 'vin', 'modelYear', 'status'] },
  hooks: {
    beforeUpdate: async (ctx, row, patch) => {
      const clash = await findVehicleByIdentifiers(ctx.tx, { vin: patch.vin as string | undefined, engineNo: patch.engineNo as string | null | undefined }, row.id);
      if (clash.length) throw conflict('Another vehicle in the group already has this chassis or engine number');
      if (patch.modelId !== undefined && patch.modelId !== row.modelId) {
        const [live] = await ctx.tx.select({ id: salesOrder.id }).from(salesOrder).where(and(eq(salesOrder.vehicleId, row.id), ne(salesOrder.status, 'cancelled')));
        if (live) throw conflict('The vehicle is on a sales order; release it before changing its model');
        await assertActiveModel(ctx, patch.modelId as number);
      }
      return patch;
    },
    decorate: decorateStock,
  },
};

export const leads = new EntityService(leadEntity);
export const orders = new EntityService(salesOrderEntity);
export const deliveries = new EntityService(deliveryEntity);
export const stock = new EntityService(stockVehicleEntity);

// =============================================================================
// Customer documents: vehicle quotations and Paint Protection Film (PPF) forms
// =============================================================================
// Issued from a lead (services/documents.ts); the salesperson and the Assistant Manager correct them
// afterwards; the Manager and the Admin view, download and print them. Who created and who last
// changed each one is on the row, and every change is in its history and the activity log.
const docTrailNames = {
  customerName: { key: 'leadId', source: LEAD_NAME },
  ownerName: { key: 'ownerId', source: USER_NAME },
  createdByName: { key: 'createdById', source: USER_NAME },
  updatedByName: { key: 'updatedById', source: USER_NAME },
};
const docFilters = (t: typeof quotation | typeof ppfForm) => ({
  leadId: { key: 'leadId', schema: IdQuery },
  ownerId: { key: 'ownerId', schema: IdQuery },
  // Issued between two Pakistan calendar days (inclusive).
  createdFrom: { key: 'createdAt', schema: z.iso.date(), where: (v: unknown) => sql`(${t.createdAt} at time zone 'Asia/Karachi')::date >= ${v}::date` },
  createdTo: { key: 'createdAt', schema: z.iso.date(), where: (v: unknown) => sql`(${t.createdAt} at time zone 'Asia/Karachi')::date <= ${v}::date` },
});
/** Always two decimals, like every other amount (9500000 -> 9500000.00). */
export const money2 = (x: unknown) => fromPaisa(toPaisa(String(x)));

/**
 * Quotation total = quantity x (price - discount + freight & transit insurance + withholding tax),
 * with the order's discount rules.
 */
export function priceQuotation(data: Record<string, unknown>, before?: Row) {
  const v = (k: string, d: string) => String(data[k] ?? before?.[k] ?? d);
  const { totalAmount: net } = priceOrder({ unitPrice: v('unitPrice', '0'), discount: v('discount', '0') }) as { totalAmount: string };
  const quantity = Number(data.quantity ?? before?.quantity ?? 1);
  return { ...data, totalAmount: mulMoney(addMoney(net, v('freightInsurance', '0'), v('withholdingTax', '0')), quantity) };
}

/**
 * A variant code picked on a quotation: its description becomes the printed variant. Empty clears
 * the code (the variant text stays as typed).
 */
export async function resolveVariant(ctx: EntityCtx, dealershipId: number, code: string | null | undefined) {
  if (!code) return { variantCode: null };
  const [v] = await ctx.tx
    .select({ code: vehicleVariant.code, description: vehicleVariant.description, modelId: vehicleVariant.modelId })
    .from(vehicleVariant)
    .where(and(eq(vehicleVariant.dealershipId, dealershipId), eq(vehicleVariant.code, code.trim().toUpperCase()), eq(vehicleVariant.isActive, true)));
  if (!v) throw validationError([{ in: 'body', path: 'variantCode', message: 'Unknown variant code for this dealership' }]);
  return { variantCode: v.code, variant: v.description, ...(v.modelId ? { modelId: v.modelId } : {}) };
}

/**
 * Where the Ref carries the variant code (a format with a Ref prefix, e.g. Hyundai's "HI"), every
 * quotation needs a code once the dealership has codes. Jetour / CSM have neither.
 */
export async function assertVariantCodeGiven(ctx: EntityCtx, dealershipId: number, code: string | null | undefined, modelId?: number) {
  if (code) return;
  const [t] = await ctx.tx.select({ refPrefix: documentTemplate.refPrefix }).from(documentTemplate).where(and(eq(documentTemplate.dealershipId, dealershipId), eq(documentTemplate.kind, 'quotation')));
  // No saved format: Hyundai's built-in format has the "HI" prefix.
  const prefix = t ? t.refPrefix : (await brandOf(ctx, dealershipId)) === 'Hyundai' ? 'HI' : null;
  if (!prefix) return;
  // With a model: only if that model has codes (e.g. none yet for a new model).
  const [any] = await ctx.tx
    .select({ id: vehicleVariant.id })
    .from(vehicleVariant)
    .where(and(eq(vehicleVariant.dealershipId, dealershipId), eq(vehicleVariant.isActive, true), modelId ? eq(vehicleVariant.modelId, modelId) : undefined))
    .limit(1);
  if (any) throw validationError([{ in: 'body', path: 'variantCode', message: 'Choose the variant code (it goes in the Ref), or type the variant under "Other"' }]);
}

export const quotationEntity: EntityConfig = {
  entityType: 'sales.quotation',
  module: 'sales',
  path: 'quotations',
  names: { singular: 'Quotation', plural: 'Quotations' },
  table: quotation,
  schemas: { read: QuotationSchema, update: QuotationUpdate },
  permissions: {
    view: P.quotationsViewAll,
    viewOwn: P.quotationsViewOwn,
    create: P.quotationsCreate,
    update: P.quotationsUpdate,
    updateOwn: P.quotationsUpdateOwn,
  },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'ownerId',
  search: ['quotationNo'],
  filters: docFilters(quotation),
  sort: { default: '-createdAt', keys: ['createdAt', 'updatedAt', 'quotationNo', 'validUntil', 'totalAmount'] },
  hooks: {
    // Same price rules as the order (discount within the price and the discount policy); total recomputed.
    beforeUpdate: async (ctx, row, patch) => {
      if (patch.variantCode !== undefined) {
        // As on create: a code, or a typed variant ("Other"), or none when the quoted model has no codes.
        // Removing a code needs a typed variant with it (the old text was the code's description).
        const typed = patch.variant !== undefined ? patch.variant : row.variantCode ? null : row.variant;
        if (!patch.variantCode && !typed) await assertVariantCodeGiven(ctx, row.dealershipId as number, null, row.modelId as number);
        Object.assign(patch, await resolveVariant(ctx, row.dealershipId as number, patch.variantCode as string | null));
      }
      return ['unitPrice', 'discount', 'quantity', 'freightInsurance', 'withholdingTax'].some((k) => patch[k] !== undefined) ? priceQuotation(patch, row) : patch;
    },
    decorate: (ctx, rows) => withNames(ctx.tx, rows, { ...docTrailNames, modelName: { key: 'modelId', source: MODEL_NAME } }),
  },
};

/** PPF total = amount - discount; the advance cannot exceed it. */
export function pricePpf(data: Record<string, unknown>, before?: Row) {
  const amount = String(data.amount ?? before?.amount ?? '0');
  const discount = String(data.discount ?? before?.discount ?? '0');
  const advancePaid = String(data.advancePaid ?? before?.advancePaid ?? '0');
  if (cmpMoney(discount, amount) > 0) throw validationError([{ in: 'body', path: 'discount', message: 'Discount cannot exceed the PPF amount' }]);
  const totalAmount = subMoney(amount, discount);
  if (cmpMoney(advancePaid, totalAmount) > 0) throw validationError([{ in: 'body', path: 'advancePaid', message: 'Advance cannot exceed the total' }]);
  return { ...data, totalAmount };
}

export const ppfFormEntity: EntityConfig = {
  entityType: 'sales.ppf_form',
  module: 'sales',
  path: 'ppf-forms',
  names: { singular: 'PPF form', plural: 'PPF forms' },
  table: ppfForm,
  schemas: { read: PpfFormSchema, update: PpfFormUpdate },
  permissions: {
    view: P.ppfViewAll,
    viewOwn: P.ppfViewOwn,
    create: P.ppfCreate,
    update: P.ppfUpdate,
    updateOwn: P.ppfUpdateOwn,
  },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'ownerId',
  search: ['formNo'],
  filters: docFilters(ppfForm),
  sort: { default: '-createdAt', keys: ['createdAt', 'updatedAt', 'formNo', 'installationDate', 'totalAmount'] },
  hooks: {
    beforeUpdate: async (ctx, row, patch) => {
      // PBO, chassis and engine stay filled in once the lead has a sales order (before, they may be blank).
      const blank = (['pboNo', 'chassisNo', 'engineNo'] as const).filter((k) => k in patch && !patch[k]);
      const [owning] = blank.length ? await ctx.tx.select({ salesOrderId: lead.salesOrderId }).from(lead).where(eq(lead.id, row.leadId as number)) : [];
      if (blank.length && owning?.salesOrderId) {
        const names = { pboNo: 'PBO number', chassisNo: 'chassis number', engineNo: 'engine number' };
        throw validationError(blank.map((k) => ({ in: 'body' as const, path: k, message: `Enter the ${names[k]}` })));
      }
      if (patch.extraFields !== undefined) patch.extraFields = Object.fromEntries(Object.entries((patch.extraFields as Record<string, string>) ?? {}).filter(([k, v]) => k.trim() && String(v).trim()));
      return patch.amount !== undefined || patch.discount !== undefined || patch.advancePaid !== undefined ? pricePpf(patch, row) : patch;
    },
    decorate: (ctx, rows) => withNames(ctx.tx, rows, docTrailNames),
  },
};

// =============================================================================
// Variant codes (Hyundai): picked on quotations; maintained by the AM / Sales Manager
// =============================================================================
export const vehicleVariantEntity: EntityConfig = {
  entityType: 'sales.vehicle_variant',
  module: 'sales',
  path: 'variants',
  names: { singular: 'Variant code', plural: 'Variant codes' },
  table: vehicleVariant,
  schemas: { read: VehicleVariantSchema, create: VehicleVariantCreate, update: VehicleVariantUpdate },
  permissions: { view: P.variantsView, create: P.templatesManage, update: P.templatesManage },
  tenant: { dealershipKey: 'dealershipId' },
  search: ['code', 'description'],
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    modelId: { key: 'modelId', schema: IdQuery },
    isActive: { key: 'isActive', schema: BoolQuery },
  },
  sort: { default: 'code', keys: ['code', 'description', 'updatedAt'] },
  hooks: {
    beforeCreate: async (ctx, data) => {
      await assertVariantCodeFree(ctx, data.dealershipId as number, data.code as string);
      return { ...data, modelId: data.modelId ?? (await detectModel(ctx.tx, await brandOf(ctx, data.dealershipId as number), data.description as string)) };
    },
    beforeUpdate: async (ctx, row, patch) => {
      if (patch.code !== undefined && patch.code !== row.code) await assertVariantCodeFree(ctx, row.dealershipId as number, patch.code as string);
      return patch;
    },
    decorate: (ctx, rows) => withNames(ctx.tx, rows, { modelName: { key: 'modelId', source: MODEL_NAME } }),
  },
};

async function assertVariantCodeFree(ctx: EntityCtx, dealershipId: number, code: string) {
  const [dup] = await ctx.tx
    .select({ id: vehicleVariant.id })
    .from(vehicleVariant)
    .where(and(eq(vehicleVariant.dealershipId, dealershipId), eq(vehicleVariant.code, code)));
  if (dup) throw conflict(`Variant code ${code} already exists`, { existingId: dup.id });
}
export async function brandOf(ctx: EntityCtx, dealershipId: number) {
  const [d] = await ctx.tx.select({ brand: dealership.brand }).from(dealership).where(eq(dealership.id, dealershipId));
  return d?.brand ?? '';
}

export const quotations = new EntityService(quotationEntity);
export const variants = new EntityService(vehicleVariantEntity);
export const ppfForms = new EntityService(ppfFormEntity);
