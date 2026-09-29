import { buildEntityRouter } from '../../entity/buildEntityRouter';
import { buildLineRouter } from '../../entity/lines';
import { ApiRouter } from '../../http/apiRouter';
import { PageQuery, pageSchema } from '../../lib/pagination';
import { IdParam, z } from '../../lib/zod';
import { accountEntity, accounts, invoiceEntity, invoices, journalEntity, journals, paymentEntity, payments } from './entities';
import { AccountsPerm as P } from './permissions';
import * as reports from './reports';
import {
  AgingQuery,
  AllocatePaymentBody,
  InvoiceFromSource,
  InvoiceSchema,
  JournalEntrySchema,
  JournalLineSchema,
  LedgerQuery,
  LedgerRowSchema,
  ManualJournalCreate,
  PayablesQuery,
  PaymentAllocationSchema,
  PaymentCreate,
  PaymentSchema,
  ReceivableAgingSchema,
  ReverseBody,
  SupplierBalanceSchema,
  TrialBalanceQuery,
  TrialBalanceSchema,
} from './schemas';
import * as svc from './service';
import './subscriptions';

const withActions = <T extends z.ZodObject>(s: T) => s.extend({ availableActions: z.array(z.string()) });

const invoiceActions = new ApiRouter('/accounts/invoices', 'Invoice')
  .route({
    method: 'post',
    path: '/',
    operationId: 'createInvoiceFromSource',
    summary: 'Draft an invoice from an approved sales order or a completed job card',
    permission: P.invoicesCreate,
    body: InvoiceFromSource,
    response: withActions(InvoiceSchema),
    status: 201,
    handler: (ctx) => svc.createInvoiceFromSource(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/payments',
    operationId: 'listInvoicePayments',
    summary: 'Payments allocated to an invoice (bounded)',
    permission: P.invoicesView,
    params: IdParam,
    response: z.array(PaymentAllocationSchema),
    handler: (ctx) => svc.invoiceAllocations(ctx, ctx.params.id),
  });

const paymentActions = new ApiRouter('/accounts/payments', 'Payment')
  .route({
    method: 'post',
    path: '/',
    operationId: 'createPayment',
    summary: 'Record a customer receipt (optionally settling invoices) or a supplier payment; posts to the ledger',
    permission: P.paymentsCreate,
    body: PaymentCreate,
    response: withActions(PaymentSchema),
    status: 201,
    handler: (ctx) => svc.createPayment(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/allocations',
    operationId: 'listPaymentAllocations',
    summary: 'Invoices a receipt settled (bounded)',
    permission: P.paymentsView,
    params: IdParam,
    response: z.array(PaymentAllocationSchema),
    handler: (ctx) => svc.paymentAllocations(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/allocations',
    operationId: 'allocatePayment',
    summary: "Apply a receipt's unallocated credit (e.g. a booking deposit) to an open invoice",
    permission: P.paymentsCreate,
    params: IdParam,
    body: AllocatePaymentBody,
    response: z.array(PaymentAllocationSchema),
    handler: (ctx) => svc.allocatePayment(ctx, ctx.params.id, ctx.body),
  });

const journalActions = new ApiRouter('/accounts/journals', 'JournalEntry')
  .route({
    method: 'post',
    path: '/',
    operationId: 'postManualJournal',
    summary: 'Post a balanced manual journal entry',
    permission: P.journalsPost,
    body: ManualJournalCreate,
    response: JournalEntrySchema,
    status: 201,
    handler: (ctx) => svc.postManualJournal(ctx, ctx.body),
  })
  .route({
    method: 'get',
    path: '/:id/lines',
    operationId: 'listJournalEntryLines',
    summary: 'Lines of a journal entry (bounded)',
    permission: P.journalsView,
    params: IdParam,
    response: z.array(JournalLineSchema),
    handler: (ctx) => svc.journalLines(ctx, ctx.params.id),
  })
  .route({
    method: 'post',
    path: '/:id/reverse',
    operationId: 'reverseJournalEntry',
    summary: 'Reverse a manual journal entry with a mirror entry',
    permission: P.journalsPost,
    params: IdParam,
    body: ReverseBody,
    response: JournalEntrySchema,
    status: 201,
    handler: (ctx) => svc.reverseJournal(ctx, ctx.params.id, ctx.body),
  });

const reportRoutes = new ApiRouter('/accounts/reports', 'AccountsReports')
  .route({
    method: 'get',
    path: '/trial-balance',
    operationId: 'getTrialBalance',
    summary: "A dealership's trial balance up to a date",
    permission: P.reportsView,
    query: TrialBalanceQuery,
    response: TrialBalanceSchema,
    handler: (ctx) => reports.trialBalance(ctx, ctx.query),
  })
  .route({
    method: 'get',
    path: '/ledger',
    operationId: 'getAccountLedger',
    summary: 'Account ledger with running balance (debit − credit), oldest first',
    permission: P.reportsView,
    query: PageQuery.extend(LedgerQuery.shape),
    response: pageSchema(LedgerRowSchema, 'LedgerPage'),
    handler: (ctx) => {
      const { page, pageSize, sort, q, ...filters } = ctx.query;
      return reports.accountLedger(ctx, { page, pageSize, sort, q }, filters);
    },
  })
  .route({
    method: 'get',
    path: '/receivables',
    operationId: 'getReceivablesAging',
    summary: 'Open customer invoices aged by days past due',
    permission: P.reportsView,
    query: PageQuery.extend(AgingQuery.shape),
    response: pageSchema(ReceivableAgingSchema, 'ReceivableAgingPage'),
    handler: (ctx) => {
      const { page, pageSize, sort, q, ...filters } = ctx.query;
      return reports.receivablesAging(ctx, { page, pageSize, sort, q }, filters);
    },
  })
  .route({
    method: 'get',
    path: '/payables',
    operationId: 'getPayablesBySupplier',
    summary: 'Amounts owed to suppliers (goods received less payments)',
    permission: P.reportsView,
    query: PageQuery.extend(PayablesQuery.shape),
    response: pageSchema(SupplierBalanceSchema, 'SupplierBalancePage'),
    handler: (ctx) => {
      const { page, pageSize, sort, q, ...filters } = ctx.query;
      return reports.payablesBySupplier(ctx, { page, pageSize, sort, q }, filters);
    },
  });

export const accountsRouters = [
  invoiceActions,
  paymentActions,
  journalActions,
  reportRoutes,
  buildEntityRouter(accountEntity, accounts).router,
  buildEntityRouter(journalEntity, journals).router,
  buildLineRouter(svc.invoiceLines.config, svc.invoiceLines).router,
  buildEntityRouter(invoiceEntity, invoices).router,
  buildEntityRouter(paymentEntity, payments).router,
];
