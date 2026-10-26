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
  DirectIssueBody,
  DirectIssueResultSchema,
  DirectReceiveBody,
  AssignModelsBody,
  EarlierSalesQuery,
  EarlierSalesSchema,
  AssignModelsResultSchema,
  InventoryPageSchema,
  InventoryQuery,
  ManagePartCreate,
  ManagePartUpdate,
  OpenJobCardQuery,
  OpenJobCardSchema,
  PartPrefixQuery,
  PartVehicleModelSchema,
  PartPrefixSchema,
  PartSchema,
  PriceChangeBody,
  SaleReportQuery,
  SaleReportRowSchema,
  PriceChangeResultSchema,
  GoodsReceiptLineSchema,
  GoodsReceiptSchema,
  IssueBody,
  MonthlyReportQuery,
  MonthlyReportSchema,
  PartImportBody,
  PartImportResultSchema,
  PartsRequestCreate,
  PartsRequestLineSchema,
  PartsRequestSchema,
  ReceiveBody,
  StockMovementQuery,
  StockSettingsBody,
  StockSettingsResultSchema,
  StockMovementSchema,
  StockSheetQuery,
  StockSheetRowSchema,
} from './schemas';
import * as svc from './service';
import * as store from './store';

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

const storeDesk = new ApiRouter('/parts/store', 'Store')
  .route({
    method: 'post',
    path: '/receive',
    operationId: 'receiveStock',
    summary: 'Receive parts from head office with their prices, without a purchase order (creates the GRN, posts stock)',
    permission: P.receiptsCreate,
    body: DirectReceiveBody,
    response: GoodsReceiptSchema,
    status: 201,
    handler: (ctx) => svc.receiveDirect(ctx, ctx.body),
  })
  .route({
    method: 'post',
    path: '/issue',
    operationId: 'issueStock',
    summary: 'Issue parts against a repair order / job card number (or take unused parts back)',
    permission: P.issuesCreate,
    body: DirectIssueBody,
    response: DirectIssueResultSchema,
    status: 201,
    handler: (ctx) => store.issueDirect(ctx, ctx.body),
  })
  .route({
    method: 'post',
    path: '/import-parts',
    operationId: 'importParts',
    summary: 'Paste a price list from Excel: adds new parts, updates known ones',
    permission: P.catalogManage,
    body: PartImportBody,
    response: PartImportResultSchema,
    handler: (ctx) => svc.importParts(ctx, ctx.body),
  })
  .route({
    method: 'post',
    path: '/parts',
    operationId: 'addPart',
    summary: 'Store manager: add a new part to the catalogue (of your own brand)',
    permission: P.catalogManage,
    body: ManagePartCreate,
    response: PartSchema,
    status: 201,
    handler: async (ctx) => (await store.createManagedPart(ctx, ctx.body)) as never,
  })
  .route({
    method: 'patch',
    path: '/parts/:id',
    operationId: 'changePart',
    summary: 'Store manager: change a part number, name, category or price',
    permission: P.catalogManage,
    params: IdParam,
    body: ManagePartUpdate,
    response: PartSchema,
    handler: async (ctx) => (await store.updateManagedPart(ctx, ctx.params.id, ctx.body)) as never,
  })
  .route({
    method: 'post',
    path: '/price-change',
    operationId: 'changePrices',
    summary: 'Store manager: raise or lower the prices of a brand (or one category) by a percentage',
    permission: P.catalogManage,
    body: PriceChangeBody,
    response: PriceChangeResultSchema,
    handler: (ctx) => store.changePrices(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/vehicle-models',
    operationId: 'listPartVehicleModels',
    summary: 'The vehicle models of a brand (for the Vehicle filter of the price list and stock)',
    permission: P.catalogView,
    query: z.object({ brand: z.string().max(60).optional() }),
    response: z.array(PartVehicleModelSchema),
    handler: (ctx) => store.partVehicleModels(ctx, ctx.query.brand),
  })
  .route({
    method: 'get',
    path: '/part-prefixes',
    operationId: 'listPartPrefixes',
    summary: 'Store manager: parts grouped by the start of the part code, with their vehicle models',
    permission: P.catalogManage,
    query: PartPrefixQuery,
    response: z.array(PartPrefixSchema),
    handler: (ctx) => store.partPrefixes(ctx, ctx.query),
  })
  .route({
    method: 'post',
    path: '/assign-models',
    operationId: 'assignPartModels',
    summary: 'Store manager: set the vehicle models of all parts whose code starts with a prefix',
    permission: P.catalogManage,
    body: AssignModelsBody,
    response: AssignModelsResultSchema,
    handler: (ctx) => store.assignModels(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/open-job-cards',
    operationId: 'listOpenJobCards',
    summary: 'Open job cards of a dealership (to issue parts to), with the vehicle registration / chassis',
    permission: P.issuesCreate,
    query: OpenJobCardQuery,
    response: z.array(OpenJobCardSchema),
    handler: (ctx) => store.openJobCards(ctx, ctx.query.dealershipId),
  })
  .route({
    method: 'get',
    path: '/inventory',
    operationId: 'getInventory',
    summary: 'Every part with its stock now and what came in / went out this month',
    permission: P.stockView,
    query: PageQuery.extend(InventoryQuery.shape),
    response: InventoryPageSchema,
    handler: (ctx) => {
      const { page, pageSize, sort, q, ...filters } = ctx.query;
      return store.inventory(ctx, { page, pageSize, sort, q }, filters);
    },
  })
  .route({
    method: 'put',
    path: '/stock-settings',
    operationId: 'setStockSettings',
    summary: 'Store manager: set the bin location and the reorder level of a part in a store',
    permission: P.stockManage,
    body: StockSettingsBody,
    response: StockSettingsResultSchema,
    handler: (ctx) => store.setStockSettings(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/categories',
    operationId: 'listPartCategories',
    summary: 'Part categories (of a brand)',
    permission: P.catalogView,
    query: z.object({ brand: z.string().max(60).optional() }),
    response: z.array(z.string()),
    handler: (ctx) => store.partCategories(ctx, ctx.query.brand),
  })
  .route({
    method: 'get',
    path: '/monthly-report',
    operationId: 'getPartsMonthlyReport',
    summary: 'Parts in and out per month: at cost, at the price charged (revenue) and the margin',
    permission: P.stockView,
    query: MonthlyReportQuery,
    response: MonthlyReportSchema,
    handler: (ctx) => svc.monthlyReport(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/earlier-sales',
    operationId: 'getEarlierSales',
    summary: 'Sales recorded before the system (the store sale report sheet), by invoice number',
    permission: P.stockView,
    query: EarlierSalesQuery,
    response: EarlierSalesSchema,
    handler: (ctx) => store.earlierSales(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/sale-report',
    operationId: 'getPartsSaleReport',
    summary: 'Every part issued (or taken back) in a period: RO / job card, invoice, part, quantity, price, remarks, cost',
    permission: P.stockView,
    query: SaleReportQuery,
    response: z.array(SaleReportRowSchema),
    handler: (ctx) => store.saleReport(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/stock-sheet',
    operationId: 'getStockSheet',
    summary: 'What is in the store now: quantity, cost and value per part and branch',
    permission: P.stockView,
    query: StockSheetQuery,
    response: z.array(StockSheetRowSchema),
    handler: (ctx) => svc.stockSheet(ctx, ctx.query),
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
  storeDesk,
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
