import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import type { z } from '../../../lib/zod';
import { account, invoice, journalLine, payment } from '../../accounts/models';
import { customer } from '../../master/models';
import { assemble, fmtMoney, m, monthly, StatsByDealership } from '../engine';
import { ReportsPerm as P } from '../permissions';
import type { DashboardQuery } from '../schemas';
import { ReportScope } from '../scope';

const money = (expr: ReturnType<typeof sql>) => sql<string>`coalesce(${expr}, 0)::numeric(14, 2)::text`;
const month = (col: unknown) => sql<string>`to_char(date_trunc('month', ${col}), 'YYYY-MM')`;
const ISSUED = ['issued', 'partially_paid', 'paid'] as const;
const OPEN = ['issued', 'partially_paid'] as const;
const outstanding = sql`sum(${invoice.totalAmount} - ${invoice.amountPaid})`;
const overdue = sql`sum(${invoice.totalAmount} - ${invoice.amountPaid}) filter (where ${invoice.dueDate} < current_date)`;

/** Finance: invoicing, collections, receivables and overdue, payables, cash position. */
export async function accountsDashboard(ctx: EntityCtx, q: z.output<typeof DashboardQuery>) {
  const scope = new ReportScope(ctx, { view: P.accountsView }, q);
  // Accounting is kept per dealership, so branch-level grants see their dealership's books.
  const invoiceScope = scope.where({ dealership: invoice.dealershipId });
  const paymentScope = scope.where({ dealership: payment.dealershipId });
  const lineScope = scope.where({ dealership: journalLine.dealershipId });
  const issued = and(invoiceScope, inArray(invoice.status, [...ISSUED]));
  const receipts = and(paymentScope, eq(payment.status, 'posted'), eq(payment.direction, 'receipt'));
  const stats = new StatsByDealership();

  stats.put(
    await ctx.tx
      .select({
        d: invoice.dealershipId,
        invoiced: money(sql`sum(${invoice.totalAmount})`),
        vehicleInvoiced: money(sql`sum(${invoice.totalAmount}) filter (where ${invoice.kind} = 'vehicle_sale')`),
        serviceInvoiced: money(sql`sum(${invoice.totalAmount}) filter (where ${invoice.kind} = 'service')`),
        tax: money(sql`sum(${invoice.taxAmount})`),
      })
      .from(invoice)
      .where(and(issued, scope.inPeriod(invoice.invoiceDate)))
      .groupBy(invoice.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: payment.dealershipId,
        collected: money(sql`sum(${payment.amount}) filter (where ${payment.direction} = 'receipt')`),
        paidOut: money(sql`sum(${payment.amount}) filter (where ${payment.direction} = 'disbursement')`),
      })
      .from(payment)
      .where(and(paymentScope, eq(payment.status, 'posted'), scope.inPeriod(payment.paymentDate)))
      .groupBy(payment.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({ d: invoice.dealershipId, receivable: money(outstanding), overdue: money(overdue) })
      .from(invoice)
      .where(and(invoiceScope, inArray(invoice.status, [...OPEN])))
      .groupBy(invoice.dealershipId),
  );
  stats.put(
    await ctx.tx
      .select({
        d: journalLine.dealershipId,
        payable: money(sql`sum(${journalLine.credit} - ${journalLine.debit}) filter (where ${account.role} = 'payables')`),
        cash: money(sql`sum(${journalLine.debit} - ${journalLine.credit}) filter (where ${account.role} in ('cash', 'bank'))`),
      })
      .from(journalLine)
      .innerJoin(account, eq(account.id, journalLine.accountId))
      .where(and(lineScope, inArray(account.role, ['payables', 'cash', 'bank'])))
      .groupBy(journalLine.dealershipId),
  );

  const invoicedTrend = await ctx.tx
    .select({ month: month(invoice.invoiceDate), value: money(sql`sum(${invoice.totalAmount})`) })
    .from(invoice)
    .where(and(issued, scope.inTrend(invoice.invoiceDate)))
    .groupBy(month(invoice.invoiceDate));
  const collectedTrend = await ctx.tx
    .select({ month: month(payment.paymentDate), value: money(sql`sum(${payment.amount})`) })
    .from(payment)
    .where(and(receipts, scope.inTrend(payment.paymentDate)))
    .groupBy(month(payment.paymentDate));
  const topDebtors = await ctx.tx
    .select({ name: customer.fullName, outstanding: money(outstanding), overdue: money(overdue) })
    .from(invoice)
    .innerJoin(customer, eq(customer.id, invoice.customerId))
    .where(and(invoiceScope, inArray(invoice.status, [...OPEN])))
    .groupBy(invoice.customerId, customer.fullName)
    .orderBy(desc(outstanding))
    .limit(8);

  return assemble(
    'accounts',
    'Finance',
    scope,
    stats,
    [
      {
        key: 'invoiced',
        label: 'Invoiced',
        format: 'money',
        value: (s) => m(s, 'invoiced'),
        hint: (s) => `Vehicles ${fmtMoney(m(s, 'vehicleInvoiced'))} · Service ${fmtMoney(m(s, 'serviceInvoiced'))}`,
        to: '/accounts/invoices',
        compare: true,
      },
      { key: 'collected', label: 'Collected', format: 'money', value: (s) => m(s, 'collected'), to: '/accounts/payments?direction=receipt', compare: true },
      { key: 'receivable', label: 'Receivables outstanding', format: 'money', value: (s) => m(s, 'receivable'), to: '/accounts/reports/receivables', compare: true },
      { key: 'overdue', label: 'Overdue', format: 'money', value: (s) => m(s, 'overdue'), hint: () => 'past the due date today', to: '/accounts/reports/receivables', compare: true },
      { key: 'payable', label: 'Owed to suppliers', format: 'money', value: (s) => m(s, 'payable'), to: '/accounts/reports/payables', compare: true },
      { key: 'paidOut', label: 'Paid to suppliers', format: 'money', value: (s) => m(s, 'paidOut'), to: '/accounts/payments?direction=disbursement' },
      { key: 'cash', label: 'Cash & bank', format: 'money', value: (s) => m(s, 'cash'), hint: () => 'ledger balance today', to: '/accounts/reports/trial-balance', compare: true },
      { key: 'tax', label: 'Sales tax invoiced', format: 'money', value: (s) => m(s, 'tax') },
    ],
    {
      charts: [
        { key: 'invoiced-trend', title: 'Invoiced per month', format: 'money', data: monthly(scope.months, invoicedTrend), to: '/accounts/invoices' },
        { key: 'collected-trend', title: 'Collected per month', format: 'money', data: monthly(scope.months, collectedTrend), to: '/accounts/payments' },
      ],
      tables: [
        {
          key: 'top-debtors',
          title: 'Largest customer balances',
          columns: [
            { key: 'name', header: 'Customer', format: 'text' },
            { key: 'outstanding', header: 'Outstanding', format: 'money' },
            { key: 'overdue', header: 'Overdue', format: 'money' },
          ],
          rows: topDebtors,
        },
      ],
    },
  );
}
