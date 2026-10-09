import { buildEntityRouter } from '../../entity/buildEntityRouter';
import './activityLabels'; // readable names of sales records in the activity log
import { ApiRouter } from '../../http/apiRouter';
import { IdParam, z } from '../../lib/zod';
import { deliveryEntity, leadEntity, ppfFormEntity, quotationEntity, salesOrderEntity, stockVehicleEntity, vehicleVariantEntity } from './entities';
import { SalesPerm as P } from './permissions';
import {
  ActionItemSchema,
  AdvanceVehicleStatusBody,
  AllocatableVehicleSchema,
  AllocationBody,
  CompleteDeliveryBody,
  ConvertLeadBody,
  DashboardQuery,
  DocumentKindParam,
  DocumentTemplateBody,
  DocumentTemplateQuery,
  DocumentTemplateSchema,
  DeliveryNoteSchema,
  DeliveryPipelineQuery,
  DeliveryPipelineSchema,
  DeliveryReportQuery,
  DeliveryReportSchema,
  DeliverySchema,
  EscalateDuplicateBody,
  EscalationResultSchema,
  HandOverLeadsBody,
  HandOverLeadsQuery,
  HandOverResultSchema,
  ClearanceDecisionBody,
  ClearanceRequestBody,
  OrderPaymentCreate,
  OrderPaymentsSchema,
  ExportQuery,
  ExportRowsSchema,
  StandalonePpfCreate,
  StandaloneQuotationCreate,
  LeaveApplicationCreate,
  LeaveApplicationSchema,
  LeaveDecisionBody,
  LeaveDocumentSchema,
  LeaveListQuery,
  LeavePageSchema,
  TodayQuery,
  TodaySchema,
  LeadAppointmentBody,
  LeadsToHandOverSchema,
  ReassignLeadBody,
  LeadDetailsBody,
  LeadOrderVehicleSchema,
  LeadFollowUpCreate,
  FollowUpCommentBody,
  LeadFollowUpSchema,
  LeadSchema,
  LeadSummaryQuery,
  LeadSummarySchema,
  OrderSummaryQuery,
  OrderSummarySchema,
  OrderVehicleBody,
  PpfDocumentSchema,
  PpfFormCreate,
  PpfFormSchema,
  QuotationCreate,
  QuotationDocumentSchema,
  QuotationSchema,
  RaiseOrderBody,
  SalesDashboardSchema,
  SalesOrderSchema,
  ScheduleDeliveryBody,
  StockVehicleCreate,
  StockVehicleSchema,
  TeamMemberSchema,
  TeamReportQuery,
  TeamReportSchema,
  TrackRecordQuery,
  TrackRecordSchema,
  VariantImportBody,
  VariantImportResultSchema,
} from './schemas';
import * as svc from './services';

// Read schemas as returned by the generic routers (with workflow actions).
const OrderRead = SalesOrderSchema.extend({ availableActions: z.array(z.string()) });
const DeliveryRead = DeliverySchema.extend({ availableActions: z.array(z.string()) });
const LeadRead = LeadSchema.extend({ availableActions: z.array(z.string()) });
const DealershipQuery = z.object({ dealershipId: z.coerce.number().int().positive() });

// ---- Leads: follow-ups, Convert to Lead, duplicate escalation, Admin raises the order ----
const leadActions = new ApiRouter('/sales/leads', 'Lead')
  .route({
    method: 'get',
    path: '/export',
    operationId: 'exportLeads',
    summary: 'Every detail of the leads logged in a period (for CSV / Excel and PDF)',
    permission: [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted],
    query: ExportQuery,
    response: ExportRowsSchema,
    handler: (ctx) => svc.exportLeads(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/summary',
    operationId: 'getLeadSummary',
    summary: 'Total leads and the split by status, with the same filters as the leads list',
    permission: [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted],
    query: LeadSummaryQuery,
    response: LeadSummarySchema,
    handler: (ctx) => svc.leadSummary(ctx, ctx.query),
  })
  .route({
    method: 'post',
    path: '/escalations',
    operationId: 'escalateDuplicateLead',
    summary: 'Duplicate phone number: flag the existing lead for the Assistant Manager',
    permission: P.leadsCreate,
    body: EscalateDuplicateBody,
    response: EscalationResultSchema,
    handler: (ctx) => svc.escalateDuplicate(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/follow-ups',
    operationId: 'listLeadFollowUps',
    summary: "A lead's follow-ups, latest first (bounded)",
    permission: [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted],
    params: IdParam,
    response: z.array(LeadFollowUpSchema),
    handler: (ctx) => svc.listFollowUps(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/follow-ups',
    operationId: 'recordLeadFollowUp',
    summary: 'Record a follow-up (interested / not interested / visited) with remarks',
    permission: [P.leadsUpdate, P.leadsUpdateOwn],
    params: IdParam,
    body: LeadFollowUpCreate,
    response: LeadRead,
    status: 201,
    handler: (ctx) => svc.recordFollowUp(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/follow-ups/:followUpId/comments',
    operationId: 'commentOnFollowUp',
    summary: 'Comment on a follow-up (e.g. the Manager asks to clarify; the salesperson answers); everyone following the lead sees it',
    permission: [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted],
    params: IdParam.extend({ followUpId: z.coerce.number().int().positive() }),
    body: FollowUpCommentBody,
    response: z.array(LeadFollowUpSchema),
    status: 201,
    handler: (ctx) => svc.commentOnFollowUp(ctx, ctx.params.id, ctx.params.followUpId, ctx.body),
  })
  .route({
    method: 'patch',
    path: '/:id/details',
    operationId: 'correctLeadDetails',
    summary: "Correct the customer's name, phone, email, colour or notes, also after conversion (owner or Sales Admin)",
    permission: [P.leadsUpdate, P.leadsUpdateOwn, P.leadsUpdateConverted],
    params: IdParam,
    body: LeadDetailsBody,
    response: LeadRead,
    handler: (ctx) => svc.correctLeadDetails(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/quotations',
    operationId: 'createLeadQuotation',
    summary: "Issue a vehicle quotation for a lead (its salesperson, or the Assistant Manager); numbered and kept for later edits",
    permission: P.quotationsCreate,
    params: IdParam,
    body: QuotationCreate,
    response: QuotationSchema,
    status: 201,
    handler: (ctx) => svc.createQuotation(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/order-vehicle',
    operationId: 'getLeadOrderVehicle',
    summary: "PBO / order number, chassis and engine from the lead's sales order (for the PPF voucher)",
    permission: [P.ppfCreate, P.ppfViewAll, P.ppfViewOwn],
    params: IdParam,
    response: LeadOrderVehicleSchema,
    handler: (ctx) => svc.leadOrderVehicle(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/ppf-forms',
    operationId: 'createLeadPpfForm',
    summary: 'The customer agreed to Paint Protection Film: record coverage and amount (its salesperson, or the Assistant Manager)',
    permission: P.ppfCreate,
    params: IdParam,
    body: PpfFormCreate,
    response: PpfFormSchema,
    status: 201,
    handler: (ctx) => svc.createPpfForm(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'put',
    path: '/:id/appointment',
    operationId: 'setLeadAppointment',
    summary: "Set (or clear) the customer's appointment; everyone following the lead is reminded on the day",
    permission: [P.leadsUpdateOwn, P.leadsAppointment],
    params: IdParam,
    body: LeadAppointmentBody,
    response: LeadRead,
    handler: (ctx) => svc.setLeadAppointment(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/reassign',
    operationId: 'reassignLead',
    summary: 'Give the lead (with its quotations and PPF vouchers) to another salesperson',
    permission: P.leadsReassign,
    params: IdParam,
    body: ReassignLeadBody,
    response: LeadRead,
    handler: (ctx) => svc.reassignLead(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/convert',
    operationId: 'convertLead',
    summary: 'Convert to Lead: capture model, colour, email and payment instrument; hands the lead to the Admin',
    permission: [P.leadsConvertOwn, P.leadsConvertEscalated],
    params: IdParam,
    body: ConvertLeadBody,
    response: LeadRead,
    handler: (ctx) => svc.convertLead(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/order',
    operationId: 'raiseSalesOrder',
    summary: 'Admin: raise the sales order (PBO / CBO) for a converted lead; the lead moves to Processing',
    permission: P.ordersCreate,
    params: IdParam,
    body: RaiseOrderBody,
    response: OrderRead,
    status: 201,
    handler: (ctx) => svc.raiseOrder(ctx, ctx.params.id, ctx.body),
  });

// ---- Printable documents (what the PDF shows) ----
const quotationActions = new ApiRouter('/sales/quotations', 'Quotation')
  .route({
    method: 'post',
    path: '/standalone',
    operationId: 'createStandaloneQuotation',
    summary: 'Issue a quotation without a lead (a price asked for on the spot): the customer and the model are written on it',
    permission: P.quotationsCreate,
    body: StandaloneQuotationCreate,
    response: QuotationSchema,
    status: 201,
    handler: (ctx) => svc.createStandaloneQuotation(ctx, ctx.body),
  })
  .route({
  method: 'get',
  path: '/:id/document',
  operationId: 'getQuotationDocument',
  summary: 'Everything printed on the quotation: dealership, customer, salesperson, vehicle, price, who created / changed it',
  permission: [P.quotationsViewAll, P.quotationsViewOwn],
  params: IdParam,
  response: QuotationDocumentSchema,
  handler: (ctx) => svc.quotationDocument(ctx, ctx.params.id),
});
const ppfActions = new ApiRouter('/sales/ppf-forms', 'PPF form')
  .route({
    method: 'post',
    path: '/standalone',
    operationId: 'createStandalonePpfForm',
    summary: 'Issue a PPF voucher without a lead: the customer and the vehicle are written on it',
    permission: P.ppfCreate,
    body: StandalonePpfCreate,
    response: PpfFormSchema,
    status: 201,
    handler: (ctx) => svc.createStandalonePpf(ctx, ctx.body),
  })
  .route({
  method: 'get',
  path: '/:id/document',
  operationId: 'getPpfDocument',
  summary: 'Everything printed on the PPF form: dealership, customer, vehicle, coverage, amount, who created / changed it',
  permission: [P.ppfViewAll, P.ppfViewOwn],
  params: IdParam,
  response: PpfDocumentSchema,
  handler: (ctx) => svc.ppfDocument(ctx, ctx.params.id),
  });

// ---- Document formats (letterhead, terms, sign-off) per dealership ----
const templateActions = new ApiRouter('/sales/document-templates', 'DocumentTemplate')
  .route({
    method: 'get',
    path: '/:kind',
    operationId: 'getDocumentTemplate',
    summary: "The dealership's current quotation format (saved, or the built-in default)",
    permission: [P.templatesManage, P.quotationsCreate, P.quotationsViewAll, P.quotationsViewOwn],
    params: DocumentKindParam,
    query: DocumentTemplateQuery,
    response: DocumentTemplateSchema,
    handler: (ctx) => svc.getTemplate(ctx, ctx.params.kind, ctx.query.dealershipId),
  })
  .route({
    method: 'put',
    path: '/:kind',
    operationId: 'saveDocumentTemplate',
    summary: 'Assistant Manager / Sales Manager: change the format; every quotation of the dealership prints with it',
    permission: P.templatesManage,
    params: DocumentKindParam,
    body: DocumentTemplateBody,
    response: DocumentTemplateSchema,
    handler: (ctx) => svc.saveTemplate(ctx, ctx.params.kind, ctx.body),
  });

// ---- Variant codes pasted from Excel ----
const variantActions = new ApiRouter('/sales/variants', 'Variant code').route({
  method: 'post',
  path: '/import',
  operationId: 'importVariantCodes',
  summary: 'Paste variant codes from Excel (Code / Description): adds new codes, updates descriptions',
  permission: P.templatesManage,
  body: VariantImportBody,
  response: VariantImportResultSchema,
  handler: (ctx) => svc.importVariants(ctx, ctx.body),
});

// ---- Personal dashboard (every sales role; computed within the caller's own scope) ----
const SALES_VIEWERS = [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted, P.ordersViewAll, P.ordersViewOwn, P.stockView, P.deliveriesViewAll, P.deliveriesViewOwn];
const dashboardActions = new ApiRouter('/sales/dashboard', 'SalesDashboard')
  .route({
    method: 'get',
    path: '/',
    operationId: 'getSalesDashboard',
    summary: 'Counts and a daily series for your home dashboard, within your own view scope',
    permission: SALES_VIEWERS,
    query: DashboardQuery,
    response: SalesDashboardSchema,
    handler: (ctx) => svc.salesDashboard(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/actions',
    operationId: 'getSalesActionItems',
    summary: 'Action needed: what is waiting for you now (approvals, cars to hand over, orders to raise…)',
    permission: SALES_VIEWERS,
    response: z.array(ActionItemSchema),
    handler: (ctx) => svc.actionItems(ctx),
  })
  .route({
    method: 'get',
    path: '/today',
    operationId: 'getSalesToday',
    summary: 'Today and tomorrow at a glance: customer appointments and car deliveries (within your own view scope)',
    permission: SALES_VIEWERS,
    query: TodayQuery,
    response: TodaySchema,
    handler: (ctx) => svc.todayAtAGlance(ctx, ctx.query.dealershipId),
  });

// ---- Team (Assistant Manager / Sales Manager) ----
const teamActions = new ApiRouter('/sales/team', 'SalesTeam')
  .route({
    method: 'get',
    path: '/members',
    operationId: 'listSalesTeamMembers',
    summary: "The dealership's sales staff (for filters)",
    permission: [P.leadsViewAll, P.reportsView, P.quotationsViewAll, P.ppfViewAll],
    query: DealershipQuery,
    response: z.array(TeamMemberSchema),
    handler: (ctx) => svc.teamMembers(ctx, ctx.query.dealershipId),
  })
  .route({
    method: 'get',
    path: '/report',
    operationId: 'getSalesTeamReport',
    summary: 'Track record per person, daily walk-ins, orders raised and completed',
    permission: P.reportsView,
    query: TeamReportQuery,
    response: TeamReportSchema,
    handler: (ctx) => svc.teamReport(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/track-record',
    operationId: 'getSalesTrackRecord',
    summary: 'Month by month: cars booked and delivered, PPF sold (count and amount), quotations; per salesperson (own record for salespeople)',
    permission: [P.ppfViewAll, P.ppfViewOwn, P.reportsView],
    query: TrackRecordQuery,
    response: TrackRecordSchema,
    handler: (ctx) => svc.trackRecord(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/hand-over',
    operationId: 'getLeadsToHandOver',
    summary: "How many leads a staff member still owns at the dealership (open; converted / in progress)",
    permission: P.teamManage,
    query: HandOverLeadsQuery,
    response: LeadsToHandOverSchema,
    handler: (ctx) => svc.leadsToHandOver(ctx, ctx.query.userId, ctx.query.dealershipId),
  })
  .route({
    method: 'post',
    path: '/hand-over',
    operationId: 'handOverLeads',
    summary: "Give a staff member's leads (with their quotations and PPF vouchers) to someone else in the sales team",
    permission: P.teamManage,
    body: HandOverLeadsBody,
    response: HandOverResultSchema,
    handler: (ctx) => svc.handOverLeads(ctx, ctx.body),
  });

// ---- Orders: vehicle identifiers, stock allocation, deliveries ----
const orderActions = new ApiRouter('/sales/orders', 'SalesOrder')
  .route({
    method: 'get',
    path: '/summary',
    operationId: 'getOrderSummary',
    summary: 'Orders booked in a period by status, and those still processing (raised, not yet delivered)',
    permission: [P.ordersViewAll, P.ordersViewOwn],
    query: OrderSummaryQuery,
    response: OrderSummarySchema,
    handler: (ctx) => svc.orderSummary(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/export',
    operationId: 'exportSalesOrders',
    summary: 'Every detail of the sales orders booked in a period, with each payment received (for CSV / Excel and PDF)',
    permission: [P.ordersViewAll, P.ordersViewOwn],
    query: ExportQuery,
    response: ExportRowsSchema,
    handler: (ctx) => svc.exportOrders(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/:id/payments',
    operationId: 'listOrderPayments',
    summary: "The order's payments (booking, part, final) with its total, received and balance",
    permission: [P.ordersViewAll, P.ordersViewOwn],
    params: IdParam,
    response: OrderPaymentsSchema,
    handler: (ctx) => svc.orderPayments(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/payments',
    operationId: 'addOrderPayment',
    summary: 'Sales Admin: record a payment received against the order',
    permission: P.paymentsManage,
    params: IdParam,
    body: OrderPaymentCreate,
    response: OrderPaymentsSchema,
    status: 201,
    handler: (ctx) => svc.addOrderPayment(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'delete',
    path: '/:id/payments/:paymentId',
    operationId: 'removeOrderPayment',
    summary: 'Sales Admin: remove a payment entered by mistake (not once the car is cleared)',
    permission: P.paymentsManage,
    params: IdParam.extend({ paymentId: z.coerce.number().int().positive() }),
    response: OrderPaymentsSchema,
    handler: (ctx) => svc.removeOrderPayment(ctx, ctx.params.id, ctx.params.paymentId),
  })
  .route({
    method: 'post',
    path: '/:id/clearance-request',
    operationId: 'requestDeliveryClearance',
    summary: 'Delivery Team: ask the Sales Admin to clear the car for delivery (all payments clear)',
    permission: [P.deliveriesComplete, P.deliveriesSchedule],
    params: IdParam,
    body: ClearanceRequestBody,
    response: OrderRead,
    handler: (ctx) => svc.requestClearance(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/clearance-decision',
    operationId: 'decideDeliveryClearance',
    summary: 'Sales Admin: approve (everything clear) or reject the delivery clearance request',
    permission: P.ordersClear,
    params: IdParam,
    body: ClearanceDecisionBody,
    response: OrderRead,
    handler: (ctx) => svc.decideClearance(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'put',
    path: '/:id/vehicle',
    operationId: 'setOrderVehicle',
    summary: 'Enter the chassis / engine / registration number of the vehicle for this order',
    permission: [P.ordersUpdate, P.ordersAllocate],
    params: IdParam,
    body: OrderVehicleBody,
    response: OrderRead,
    handler: (ctx) => svc.setOrderVehicle(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/allocatable-vehicles',
    operationId: 'listAllocatableVehicles',
    summary: "Undelivered stock of the order's model at its dealership (bounded)",
    permission: P.ordersAllocate,
    params: IdParam,
    response: z.array(AllocatableVehicleSchema),
    handler: (ctx) => svc.allocatableVehicles(ctx, ctx.params.id),
  })
  .route({
    method: 'put',
    path: '/:id/allocation',
    operationId: 'allocateVehicle',
    summary: 'Allocate a stock vehicle to a booked order (draft, submitted or approved); a car it replaces goes back to stock',
    permission: P.ordersAllocate,
    params: IdParam,
    body: AllocationBody,
    response: OrderRead,
    handler: (ctx) => svc.allocateVehicle(ctx, ctx.params.id, ctx.body.vehicleId),
  })
  .route({
    method: 'delete',
    path: '/:id/allocation',
    operationId: 'releaseVehicle',
    summary: 'Release the allocated vehicle',
    permission: P.ordersAllocate,
    params: IdParam,
    response: OrderRead,
    handler: (ctx) => svc.releaseVehicle(ctx, ctx.params.id),
  })
  .route({
    method: 'patch',
    path: '/:id/vehicle-status',
    operationId: 'advanceVehicleStatus',
    summary: 'Advance the allocated vehicle through logistics (in_transit / received / ready_for_delivery), or hold it',
    permission: [P.ordersAllocate, P.ordersDispatch],
    params: IdParam,
    body: AdvanceVehicleStatusBody,
    response: OrderRead,
    handler: (ctx) => svc.advanceVehicleStatus(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/deliveries',
    operationId: 'listOrderDeliveries',
    summary: "An order's deliveries (bounded)",
    permission: [P.ordersViewAll, P.ordersViewOwn],
    params: IdParam,
    response: z.array(DeliveryRead),
    handler: (ctx) => svc.orderDeliveries(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/deliveries',
    operationId: 'scheduleDelivery',
    summary: 'Schedule delivery of an approved order with a vehicle',
    permission: P.deliveriesSchedule,
    params: IdParam,
    body: ScheduleDeliveryBody,
    response: DeliveryRead,
    status: 201,
    handler: (ctx) => svc.scheduleDelivery(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'post',
    path: '/:id/deliver',
    operationId: 'deliverOrder',
    summary: 'Mark as delivered: hand over the ready car of an approved order in one step',
    permission: P.deliveriesComplete,
    params: IdParam,
    body: CompleteDeliveryBody,
    response: DeliveryRead,
    handler: (ctx) => svc.deliverOrder(ctx, ctx.params.id, ctx.body),
  });

// ---- Open stock (Delivery Team) ----
const stockActions = new ApiRouter('/sales/stock', 'StockVehicle').route({
  method: 'post',
  path: '/',
  operationId: 'receiveStockVehicle',
  summary: 'Register an incoming vehicle as available stock at the dealership',
  permission: P.stockManage,
  body: StockVehicleCreate,
  response: StockVehicleSchema,
  status: 201,
  handler: (ctx) => svc.receiveStockVehicle(ctx, ctx.body),
});

const deliveryActions = new ApiRouter('/sales/deliveries', 'Delivery')
  .route({
    method: 'get',
    path: '/:id/note',
    operationId: 'getDeliveryNote',
    summary: 'What the delivery note prints (customer, PBO, vehicle); signed at hand-over',
    permission: [P.deliveriesViewAll, P.deliveriesViewOwn],
    params: IdParam,
    response: DeliveryNoteSchema,
    handler: (ctx) => svc.deliveryNote(ctx, ctx.params.id),
  })
  .route({
  method: 'post',
  path: '/:id/complete',
  operationId: 'completeDelivery',
  summary: 'Hand over the vehicle: records owner, activates the vehicle and fires vehicle.activated',
  permission: P.deliveriesComplete,
  params: IdParam,
  body: CompleteDeliveryBody,
  response: DeliveryRead,
  handler: (ctx) => svc.completeDelivery(ctx, ctx.params.id, ctx.body),
});

// ---- Deliveries page: every booked order by stage (a salesperson: their own customers' cars) ----
const deliveryPipelineActions = new ApiRouter('/sales/delivery-pipeline', 'DeliveryPipeline').route({
  method: 'get',
  path: '/',
  operationId: 'getDeliveryPipeline',
  summary: 'Booked orders by stage (waiting for car, in transit, received, scheduled, delivered) with a count per stage',
  permission: [P.ordersViewAll, P.deliveriesViewAll, P.ordersViewOwn, P.deliveriesViewOwn, P.leadsViewOwn],
  query: DeliveryPipelineQuery,
  response: DeliveryPipelineSchema,
  handler: (ctx) => svc.deliveryPipeline(ctx, ctx.query),
});

// ---- Delivery report (the delivery portal and the sales managers) ----
const deliveryReportActions = new ApiRouter('/sales/delivery-report', 'DeliveryReport').route({
  method: 'get',
  path: '/',
  operationId: 'getDeliveryReport',
  summary: 'Cars delivered this month / this year / last 30 days / all time and in a chosen period, per dealership and together; per model and month',
  permission: P.deliveriesViewAll,
  query: DeliveryReportQuery,
  response: DeliveryReportSchema,
  handler: (ctx) => svc.deliveryReport(ctx, ctx.query),
});

// ---- Leave applications (every member of the sales department; the AM / Manager decide) ----
const LEAVE_USERS = [P.leaveApply, P.leaveApprove];
const leaveActions = new ApiRouter('/sales/leave', 'LeaveApplication')
  .route({
    method: 'get',
    path: '/',
    operationId: 'listLeaveApplications',
    summary: "Leave applications: your own, and (Assistant Manager / Manager) the team's",
    permission: LEAVE_USERS,
    query: LeaveListQuery,
    response: LeavePageSchema,
    handler: (ctx) => svc.listLeave(ctx, ctx.query),
  })
  .route({
    method: 'post',
    path: '/',
    operationId: 'applyForLeave',
    summary: 'Apply for sick / emergency leave (the Assistant Manager / Manager are notified)',
    permission: P.leaveApply,
    body: LeaveApplicationCreate,
    response: LeaveApplicationSchema,
    status: 201,
    handler: (ctx) => svc.applyForLeave(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id',
    operationId: 'getLeaveApplication',
    summary: 'One leave application',
    permission: LEAVE_USERS,
    params: IdParam,
    response: LeaveApplicationSchema,
    handler: (ctx) => svc.getLeave(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/decision',
    operationId: 'decideLeaveApplication',
    summary: 'Assistant Manager / Manager: approve or reject (the employee is notified)',
    permission: P.leaveApprove,
    params: IdParam,
    body: LeaveDecisionBody,
    response: LeaveApplicationSchema,
    handler: (ctx) => svc.decideLeave(ctx, ctx.params.id, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/document',
    operationId: 'getLeaveDocument',
    summary: "What the printed leave form shows (the application and the dealership's leave format)",
    permission: LEAVE_USERS,
    params: IdParam,
    response: LeaveDocumentSchema,
    handler: (ctx) => svc.leaveDocument(ctx, ctx.params.id),
  });

export const salesRouters = [
  leaveActions,
  dashboardActions,
  deliveryPipelineActions,
  deliveryReportActions,
  leadActions,
  teamActions,
  orderActions,
  deliveryActions,
  stockActions,
  quotationActions,
  templateActions,
  variantActions,
  ppfActions,
  buildEntityRouter(leadEntity, svc.leads).router,
  buildEntityRouter(salesOrderEntity, svc.orders).router,
  buildEntityRouter(deliveryEntity, svc.deliveries).router,
  buildEntityRouter(stockVehicleEntity, svc.stock).router,
  buildEntityRouter(quotationEntity, svc.quotations).router,
  buildEntityRouter(ppfFormEntity, svc.ppfForms).router,
  buildEntityRouter(vehicleVariantEntity, svc.variants).router,
];
