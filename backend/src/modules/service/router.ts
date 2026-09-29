import { buildEntityRouter } from '../../entity/buildEntityRouter';
import { buildLineRouter } from '../../entity/lines';
import { ApiRouter } from '../../http/apiRouter';
import { IdParam, IdQuery, z } from '../../lib/zod';
import {
  estimateEntity,
  estimates,
  inspectionTemplateEntity,
  jobCardEntity,
  jobCards,
  scheduleItemEntity,
  visitEntity,
  visits,
} from './entities';
import { ServicePerm as P } from './permissions';
import {
  EstimateCreate,
  EstimateSchema,
  InspectionBase,
  InspectionItemsUpdate,
  InspectionSchema,
  JobCardLineSchema,
  JobCardSchema,
  VehicleScheduleEntrySchema,
  VisitPreviewSchema,
} from './schemas';
import * as svc from './service';
import './subscriptions';

const JobCardRead = JobCardSchema.extend({ availableActions: z.array(z.string()) });
const EstimateRead = EstimateSchema.extend({ availableActions: z.array(z.string()) });

const visitActions = new ApiRouter('/service/visits', 'Visit')
  .route({
    method: 'get',
    path: '/check-in-preview',
    operationId: 'previewCheckIn',
    summary: 'What check-in would compute for a vehicle (service number, entitlements, owner)',
    permission: P.visitsCreate,
    query: z.object({ vehicleId: IdQuery, dealershipId: IdQuery }),
    response: VisitPreviewSchema,
    handler: (ctx) => svc.checkInPreview(ctx, ctx.query.vehicleId, ctx.query.dealershipId),
  })
  .route({
    method: 'post',
    path: '/:id/job-card',
    operationId: 'openJobCard',
    summary: 'Open the job card for a checked-in visit',
    permission: P.jobCardsCreate,
    params: IdParam,
    response: JobCardRead,
    status: 201,
    handler: (ctx) => svc.openJobCard(ctx, ctx.params.id),
  });

const scheduleRouter = new ApiRouter('/service/vehicles', 'VehicleSchedule').route({
  method: 'get',
  path: '/:id/schedule',
  operationId: 'getVehicleServiceSchedule',
  summary: "A vehicle's service schedule (bounded)",
  permission: ['master.vehicles.view', P.visitsView, P.visitsViewOwn, P.visitsCreate],
  params: IdParam,
  response: z.array(VehicleScheduleEntrySchema),
  handler: (ctx) => svc.vehicleServiceSchedule(ctx, ctx.params.id),
});

const jobCardActions = new ApiRouter('/service/job-cards', 'JobCard')
  .route({
    method: 'get',
    path: '/:id/technicians',
    operationId: 'listJobCardTechnicians',
    summary: "Users who can work job cards at the job card's dealership (bounded)",
    permission: P.jobCardsUpdate,
    params: IdParam,
    response: z.array(z.object({ id: z.number().int(), fullName: z.string() })),
    handler: (ctx) => svc.technicianOptions(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/lines/:lineId/done',
    operationId: 'setJobCardLineDone',
    summary: 'Mark a job card line done / not done',
    permission: P.jobCardsWork,
    params: IdParam.extend({ lineId: z.coerce.number().int().positive() }),
    body: z.object({ done: z.boolean() }),
    response: JobCardLineSchema,
    handler: (ctx) => svc.setLineDone(ctx, ctx.params.id, ctx.params.lineId, ctx.body.done),
  })
  .route({
    method: 'get',
    path: '/:id/inspection',
    operationId: 'getJobCardInspection',
    summary: "The job card's inspection with its checklist (null if not started)",
    permission: P.inspectionsView,
    params: IdParam,
    response: InspectionBase.nullable(),
    handler: (ctx) => svc.getInspection(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/inspection',
    operationId: 'startInspection',
    summary: 'Start the inspection (checklist seeded from the template)',
    permission: P.inspectionsCreate,
    params: IdParam,
    response: InspectionSchema,
    status: 201,
    handler: async (ctx) => (await svc.startInspection(ctx, ctx.params.id))!,
  })
  .route({
    method: 'put',
    path: '/:id/inspection/items',
    operationId: 'recordInspection',
    summary: 'Record inspection findings',
    permission: P.inspectionsUpdate,
    params: IdParam,
    body: InspectionItemsUpdate,
    response: InspectionSchema,
    handler: async (ctx) => (await svc.recordInspection(ctx, ctx.params.id, ctx.body))!,
  })
  .route({
    method: 'post',
    path: '/:id/inspection/complete',
    operationId: 'completeInspection',
    summary: 'Complete the inspection (all items checked)',
    permission: P.inspectionsUpdate,
    params: IdParam,
    response: InspectionSchema,
    handler: async (ctx) => (await svc.completeInspection(ctx, ctx.params.id))!,
  })
  .route({
    method: 'post',
    path: '/:id/estimates',
    operationId: 'createEstimate',
    summary: 'Create a draft estimate for a job card (optionally from inspection findings)',
    permission: P.estimatesCreate,
    params: IdParam,
    body: EstimateCreate.omit({ jobCardId: true }),
    response: EstimateRead,
    status: 201,
    handler: (ctx) => svc.createEstimate(ctx, ctx.params.id, { ...ctx.body, jobCardId: ctx.params.id }),
  });

export const serviceRouters = [
  visitActions,
  scheduleRouter,
  jobCardActions,
  buildEntityRouter(scheduleItemEntity).router,
  buildEntityRouter(inspectionTemplateEntity).router,
  buildEntityRouter(visitEntity, visits).router,
  buildLineRouter(svc.jobCardLines.config, svc.jobCardLines).router,
  buildEntityRouter(jobCardEntity, jobCards).router,
  buildLineRouter(svc.estimateLines.config, svc.estimateLines).router,
  buildEntityRouter(estimateEntity, estimates).router,
];
