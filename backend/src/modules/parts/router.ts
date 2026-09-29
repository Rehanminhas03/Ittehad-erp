import { buildEntityRouter } from '../../entity/buildEntityRouter';
import { buildLineRouter } from '../../entity/lines';
import { ApiRouter } from '../../http/apiRouter';
import { PageQuery, pageSchema } from '../../lib/pagination';
import { IdParam, z } from '../../lib/zod';
import {
  adjustments,
  goodsReceiptEntity,
  goodsReceipts,
  partEntity,
  parts,
  partsRequestEntity,
  partsRequests,
  purchaseOrderEntity,
  purchaseOrders,
  stockAdjustmentEntity,
  stockItemEntity,
  stockItems,
  stockTransferEntity,
  suppliers,
  supplierEntity,
  transfers,
} from './entities';
import { PartsPerm as P } from './permissions';
import {
  GoodsReceiptLineSchema,
  GoodsReceiptSchema,
  IssueBody,
  PartsRequestCreate,
  PartsRequestLineSchema,
  PartsRequestSchema,
  ReceiveBody,
  StockMovementQuery,
  StockMovementSchema,
} from './schemas';
import * as svc from './service';

const RequestRead = PartsRequestSchema.extend({ availableActions: z.array(z.string()) });

const poActions = new ApiRouter('/parts/purchase-orders', 'PurchaseOrder').route({
  method: 'post',
  path: '/:id/receipts',
  operationId: 'receiveGoods',
  summary: 'Receive goods against an approved purchase order (creates the GRN, posts stock)',
  permission: P.receiptsCreate,
  params: IdParam,
  body: ReceiveBody,
  response: GoodsReceiptSchema,
  status: 201,
  handler: (ctx) => svc.receiveGoods(ctx, ctx.params.id, ctx.body),
});

const grnActions = new ApiRouter('/parts/goods-receipts', 'GoodsReceipt').route({
  method: 'get',
  path: '/:id/lines',
  operationId: 'listGoodsReceiptLines',
  summary: 'Lines of a goods receipt (bounded)',
  permission: P.receiptsView,
  params: IdParam,
  response: z.array(GoodsReceiptLineSchema),
  handler: (ctx) => svc.goodsReceiptLines(ctx, ctx.params.id),
});

const movements = new ApiRouter('/parts/movements', 'StockMovement').route({
  method: 'get',
  path: '/',
  operationId: 'listStockMovements',
  summary: 'Stock ledger (append-only) within your scope',
  permission: P.stockView,
  query: PageQuery.extend(StockMovementQuery.shape),
  response: pageSchema(StockMovementSchema, 'StockMovementPage'),
  handler: (ctx) => {
    const { page, pageSize, sort, q, ...filters } = ctx.query;
    return svc.listMovements(ctx, { page, pageSize, sort, q }, filters);
  },
});

const requestActions = new ApiRouter('/parts/requests', 'PartsRequest')
  .route({
    method: 'post',
    path: '/',
    operationId: 'createPartsRequest',
    summary: 'Request parts for a job card from a store branch',
    permission: P.requestsCreate,
    body: PartsRequestCreate,
    response: RequestRead,
    status: 201,
    handler: (ctx) => svc.createPartsRequest(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/lines',
    operationId: 'listPartsRequestLines',
    summary: 'Request lines with the store on-hand quantity (bounded)',
    permission: P.requestsView,
    params: IdParam,
    response: z.array(PartsRequestLineSchema),
    handler: (ctx) => svc.partsRequestLines(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/issue',
    operationId: 'issueParts',
    summary: 'Issue parts to the job card (stock out at average cost)',
    permission: P.issuesCreate,
    params: IdParam,
    body: IssueBody,
    response: z.array(PartsRequestLineSchema),
    handler: (ctx) => svc.issueParts(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/return',
    operationId: 'returnParts',
    summary: 'Return unused parts from the job card to stock',
    permission: P.issuesCreate,
    params: IdParam,
    body: IssueBody,
    response: z.array(PartsRequestLineSchema),
    handler: (ctx) => svc.returnParts(ctx, ctx.params.id, ctx.body),
  });

export const partsRouters = [
  poActions,
  grnActions,
  movements,
  requestActions,
  buildEntityRouter(partEntity, parts).router,
  buildEntityRouter(supplierEntity, suppliers).router,
  buildLineRouter(svc.purchaseOrderLines.config, svc.purchaseOrderLines).router,
  buildEntityRouter(purchaseOrderEntity, purchaseOrders).router,
  buildEntityRouter(goodsReceiptEntity, goodsReceipts).router,
  buildEntityRouter(stockItemEntity, stockItems).router,
  buildEntityRouter(partsRequestEntity, partsRequests).router,
  buildLineRouter(svc.transferLines.config, svc.transferLines).router,
  buildEntityRouter(stockTransferEntity, transfers).router,
  buildLineRouter(svc.adjustmentLines.config, svc.adjustmentLines).router,
  buildEntityRouter(stockAdjustmentEntity, adjustments).router,
];
