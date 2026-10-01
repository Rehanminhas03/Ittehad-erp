import { buildEntityRouter } from '../../entity/buildEntityRouter';
import { ApiRouter } from '../../http/apiRouter';
import { IdParam, z } from '../../lib/zod';
import { customerEntity, vehicleEntity, vehicleModelEntity } from './entities';
import { MasterPerm } from './permissions';
import {
  CustomerVehicleSchema,
  DealershipModelCreate,
  DealershipModelUpdate,
  OwnershipCreate,
  OwnershipSchema,
  SearchQuery,
  SearchResultSchema,
  VehicleCreate,
  VehicleLinkBody,
  VehicleModelSchema,
  VehicleSchema,
} from './schemas';
import * as svc from './service';

// Custom vehicle routes are registered before the generated ones so `/link` is not taken as `/:id`.
const vehicleRouter = new ApiRouter('/master/vehicles', 'Vehicle')
  .route({
    method: 'post',
    path: '/',
    operationId: 'createVehicle',
    summary: 'Register a vehicle (409 if it already exists anywhere in the group)',
    permission: MasterPerm.vehiclesCreate,
    body: VehicleCreate,
    response: VehicleSchema,
    status: 201,
    handler: (ctx) => svc.createVehicle(ctx, ctx.body),
  })
  .route({
    method: 'post',
    path: '/link',
    operationId: 'linkVehicle',
    summary: 'Add a vehicle registered elsewhere in the group to a dealership, by exact VIN/engine/registration',
    permission: MasterPerm.vehiclesCreate,
    body: VehicleLinkBody,
    response: VehicleSchema,
    handler: (ctx) => svc.linkVehicle(ctx, ctx.body.dealershipId, ctx.body.identifier),
  })
  .route({
    method: 'get',
    path: '/:id/ownerships',
    operationId: 'listVehicleOwnerships',
    summary: 'Ownership history (bounded; within your customer scope)',
    permission: MasterPerm.vehiclesView,
    params: IdParam,
    response: z.array(OwnershipSchema),
    handler: (ctx) => svc.listOwnerships(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/ownerships',
    operationId: 'recordVehicleOwnership',
    summary: 'Record a new owner; closes the current ownership in that dealership',
    permission: MasterPerm.ownershipManage,
    params: IdParam,
    body: OwnershipCreate,
    response: z.array(OwnershipSchema),
    status: 201,
    handler: async (ctx) => {
      await svc.recordOwnership(ctx, ctx.params.id, ctx.body);
      return svc.listOwnerships(ctx, ctx.params.id);
    },
  });

const customerExtrasRouter = new ApiRouter('/master/customers', 'Customer').route({
  method: 'get',
  path: '/:id/vehicles',
  operationId: 'listCustomerVehicles',
  summary: "A customer's current and past vehicles (bounded)",
  permission: MasterPerm.customersView,
  params: IdParam,
  response: z.array(CustomerVehicleSchema),
  handler: (ctx) => svc.customerVehicles(ctx, ctx.params.id),
});

const searchRouter = new ApiRouter('/master/search', 'Search').route({
  method: 'get',
  path: '/',
  operationId: 'unifiedSearch',
  summary: 'One search box: VIN, registration, engine no., mobile, CNIC or name',
  permission: [MasterPerm.customersView, MasterPerm.vehiclesView],
  query: SearchQuery,
  response: SearchResultSchema,
  handler: (ctx) => svc.search(ctx, ctx.query.q),
});

// Models of the dealership's own brand, for its Assistant Manager / Manager (before the generated
// routes so `/for-dealership` is not taken as `/:id`).
const dealershipModelRouter = new ApiRouter('/master/vehicle-models', 'VehicleModel')
  .route({
    method: 'post',
    path: '/for-dealership',
    operationId: 'createDealershipModel',
    summary: "Add a model of the dealership's own brand (e.g. Jetour T1 at a Jetour dealership)",
    permission: MasterPerm.modelsManageBrand,
    body: DealershipModelCreate,
    response: VehicleModelSchema,
    status: 201,
    handler: (ctx) => svc.createDealershipModel(ctx, ctx.body),
  })
  .route({
    method: 'patch',
    path: '/:id/for-dealership',
    operationId: 'updateDealershipModel',
    summary: "Rename or (de)activate a model of the dealership's own brand",
    permission: MasterPerm.modelsManageBrand,
    params: IdParam,
    body: DealershipModelUpdate,
    response: VehicleModelSchema,
    handler: (ctx) => svc.updateDealershipModel(ctx, ctx.params.id, ctx.body),
  });

export const masterRouters = [
  searchRouter,
  vehicleRouter,
  customerExtrasRouter,
  dealershipModelRouter,
  buildEntityRouter(vehicleModelEntity).router,
  buildEntityRouter(customerEntity, svc.customers).router,
  buildEntityRouter(vehicleEntity, svc.vehicles).router,
];
