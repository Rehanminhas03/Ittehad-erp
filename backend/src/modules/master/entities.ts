import type { EntityConfig, EntityCtx, Row } from '../../entity/types';
import { conflict, validationError } from '../../lib/errors';
import { BoolQuery, IdQuery, z } from '../../lib/zod';
import { customer, vehicle, VEHICLE_STATUSES, vehicleModel } from './models';
import { normalizeCnic, normalizeIdentifier, normalizeMobile } from './normalize';
import { MasterPerm } from './permissions';
import {
  currentOwners,
  findDuplicateCustomer,
  findVehicleByIdentifiers,
  linkedDealerships,
  modelNames,
  vehicleVisibility,
} from './repository';
import {
  CustomerCreate,
  CustomerSchema,
  CustomerUpdate,
  VehicleModelCreate,
  VehicleModelSchema,
  VehicleModelUpdate,
  VehicleSchema,
  VehicleUpdate,
} from './schemas';

// ---------------------------------------------------------------------------
export const vehicleModelEntity: EntityConfig = {
  entityType: 'master.vehicle_model',
  module: 'master',
  path: 'vehicle-models',
  names: { singular: 'VehicleModel', plural: 'VehicleModels' },
  table: vehicleModel,
  schemas: { read: VehicleModelSchema, create: VehicleModelCreate, update: VehicleModelUpdate },
  permissions: { view: MasterPerm.modelsView, create: MasterPerm.modelsManage, update: MasterPerm.modelsManage },
  tenant: null,
  search: ['brand', 'name'],
  filters: { brand: { key: 'brand', schema: z.string().max(60) }, isActive: { key: 'isActive', schema: BoolQuery } },
  sort: { default: 'brand', keys: ['brand', 'name', 'createdAt'] },
};

// ---------------------------------------------------------------------------
/** Normalises identity fields and rejects duplicates within the dealership (409 carries existingId). */
async function prepareCustomer(ctx: EntityCtx, dealershipId: number, data: Record<string, unknown>, excludeId?: number) {
  const out = { ...data };
  if (typeof data.mobile === 'string') out.mobileNormalized = normalizeMobile(data.mobile);
  if (data.cnic !== undefined) out.cnic = data.cnic ? normalizeCnic(String(data.cnic)) : null;
  const touchesIdentity = data.mobile !== undefined || data.cnic !== undefined;
  if (touchesIdentity) {
    const dup = await findDuplicateCustomer(
      ctx.tx,
      dealershipId,
      (out.mobileNormalized as string | undefined) ?? null,
      (out.cnic as string | null | undefined) ?? null,
      excludeId,
    );
    if (dup) {
      const field = dup.mobileNormalized === out.mobileNormalized ? 'mobile' : 'cnic';
      throw conflict(`A customer with this ${field === 'mobile' ? 'mobile number' : 'CNIC'} already exists: ${dup.fullName}`, {
        existingId: dup.id,
        field,
      });
    }
  }
  return out;
}

export const customerEntity: EntityConfig = {
  entityType: 'master.customer',
  module: 'master',
  path: 'customers',
  names: { singular: 'Customer', plural: 'Customers' },
  table: customer,
  schemas: { read: CustomerSchema, create: CustomerCreate, update: CustomerUpdate },
  permissions: { view: MasterPerm.customersView, create: MasterPerm.customersCreate, update: MasterPerm.customersUpdate },
  tenant: { dealershipKey: 'dealershipId' },
  search: ['fullName', 'mobileNormalized', 'cnic', 'email'],
  // List search matches text as typed; the unified search (/master/search) understands phone/CNIC formats.
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    kind: { key: 'kind', schema: z.enum(['individual', 'company']) },
    isActive: { key: 'isActive', schema: BoolQuery },
  },
  sort: { default: 'fullName', keys: ['fullName', 'createdAt', 'city'] },
  hooks: {
    beforeCreate: (ctx, data) => prepareCustomer(ctx, data.dealershipId as number, data),
    beforeUpdate: (ctx, row, patch) => prepareCustomer(ctx, row.dealershipId as number, patch, row.id),
    decorate: async (ctx, rows) => {
      const ids = [...new Set(rows.map((r) => r.dealershipId as number))];
      if (!ids.length) return rows;
      const ds = await ctx.tx.dealership.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      const names = new Map(ds.map((d) => [d.id, d.name]));
      return rows.map((r) => ({ ...r, dealershipName: names.get(r.dealershipId as number) }));
    },
  },
};

// ---------------------------------------------------------------------------
export async function decorateVehicles(ctx: EntityCtx, rows: Row[]): Promise<Row[]> {
  const ids = rows.map((r) => r.id);
  const models = await modelNames(ctx.tx, rows.map((r) => r.modelId as number));
  const owners = await currentOwners(ctx.tx, ctx.access, ids);
  const links = await linkedDealerships(ctx.tx, ctx.access, ids);
  return rows.map((r) => ({
    ...r,
    modelName: models.get(r.modelId as number),
    currentOwner: owners.get(r.id) ?? null,
    dealerships: links.get(r.id) ?? [],
  }));
}

export const vehicleEntity: EntityConfig = {
  entityType: 'master.vehicle',
  module: 'master',
  path: 'vehicles',
  names: { singular: 'Vehicle', plural: 'Vehicles' },
  table: vehicle,
  // Create/link are custom endpoints (group-wide duplicate handling), see service.ts.
  schemas: { read: VehicleSchema, update: VehicleUpdate },
  permissions: { view: MasterPerm.vehiclesView, update: MasterPerm.vehiclesUpdate },
  tenant: null,
  linkedScope: {
    view: vehicleVisibility,
    writeDealership: async (ctx, row, permission) => {
      const links = await ctx.tx.vehicleDealership.findMany({
        where: { vehicleId: row.id },
        select: { dealershipId: true },
        orderBy: { id: 'asc' },
      });
      return links.find((l) => ctx.access.canIn(permission, { dealershipId: l.dealershipId }))?.dealershipId ?? null;
    },
  },
  search: ['vin', 'registrationNo', 'engineNo'],
  normalizeSearch: normalizeIdentifier,
  filters: { modelId: { key: 'modelId', schema: IdQuery }, status: { key: 'status', schema: z.enum(VEHICLE_STATUSES) } },
  sort: { default: '-createdAt', keys: ['createdAt', 'vin', 'registrationNo', 'modelYear', 'status'] },
  hooks: {
    decorate: decorateVehicles,
    beforeUpdate: async (ctx, row, patch) => {
      const clash = await findVehicleByIdentifiers(
        ctx.tx,
        {
          vin: patch.vin as string | undefined,
          engineNo: patch.engineNo as string | null | undefined,
          registrationNo: patch.registrationNo as string | null | undefined,
        },
        row.id,
      );
      if (clash.length) throw conflict('Another vehicle in the group already has this VIN, engine or registration number');
      if (patch.modelId !== undefined) await assertActiveModel(ctx, patch.modelId as number);
      return patch;
    },
  },
};

export async function assertActiveModel(ctx: EntityCtx, modelId: number) {
  const m = await ctx.tx.vehicleModel.findFirst({ where: { id: modelId }, select: { isActive: true } });
  if (!m?.isActive) throw validationError([{ in: 'body', path: 'modelId', message: 'Choose an active vehicle model' }]);
}
