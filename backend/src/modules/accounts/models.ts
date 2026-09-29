import { sql } from 'drizzle-orm';
import { boolean, check, date, index, numeric, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { bigintId, createdAt, pk } from '../../db/columns';
import { accountsSchema } from '../../db/pgSchemas';
import { accountingEntity, branchFk, dealership, legalEntity, tenantPolicy, trackedColumns, trackedIndexes, user } from '../core/models';
import { customer } from '../master/models';
import { supplier } from '../parts/models';

const money = () => numeric({ precision: 14, scale: 2, mode: 'string' });
const qty = () => numeric({ precision: 12, scale: 2, mode: 'string' });

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export const INVOICE_STATES = ['draft', 'issued', 'partially_paid', 'paid', 'void', 'cancelled'] as const;
export const INVOICE_KINDS = ['vehicle_sale', 'service'] as const;
export const INVOICE_LINE_KINDS = ['vehicle', 'labour', 'part', 'other'] as const;
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'card'] as const;
export const JOURNAL_SOURCES = ['manual', 'reversal', 'invoice', 'payment', 'goods_receipt', 'stock'] as const;

// ===========================================================================
// Chart of accounts (per dealership). `role` ties an account to automatic postings.
// ===========================================================================
export const account = accountsSchema.table(
  'account',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    code: text().notNull(),
    name: text().notNull(),
    type: text({ enum: ACCOUNT_TYPES }).notNull(),
    /** Posting role, e.g. 'receivables'; at most one account per role per dealership. */
    role: text(),
    isActive: boolean().notNull().default(true),
    ...trackedColumns(),
  },
  (t) => [
    unique().on(t.dealershipId, t.code),
    uniqueIndex('account_role_uq').on(t.dealershipId, t.role).where(sql`${t.role} is not null`),
    index().on(t.dealershipId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

// ===========================================================================
// General journal (append-only). Every entry balances: enforced by a deferred trigger.
// ===========================================================================
export const journalEntry = accountsSchema.table(
  'journal_entry',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    legalEntityId: bigintId().references(() => legalEntity.id),
    accountingEntityId: bigintId().references(() => accountingEntity.id),
    entryNo: text().notNull().unique(),
    entryDate: date({ mode: 'string' }).notNull(),
    source: text({ enum: JOURNAL_SOURCES }).notNull(),
    sourceType: text(),
    sourceId: bigintId(),
    memo: text().notNull(),
    totalAmount: money().notNull(),
    /** Set on a reversal entry: the entry it cancels. */
    reversalOfId: bigintId(),
    postedById: bigintId()
      .notNull()
      .references(() => user.id),
    postedAt: createdAt(),
  },
  (t) => [
    branchFk(t),
    uniqueIndex('journal_entry_reversal_uq').on(t.reversalOfId).where(sql`${t.reversalOfId} is not null`),
    index().on(t.dealershipId, t.entryDate),
    index().on(t.branchId),
    index().on(t.legalEntityId),
    index().on(t.accountingEntityId),
    index().on(t.sourceType, t.sourceId),
    index().on(t.postedById),
    tenantPolicy(),
  ],
);

export const journalLine = accountsSchema.table(
  'journal_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    journalEntryId: bigintId()
      .notNull()
      .references(() => journalEntry.id),
    accountId: bigintId()
      .notNull()
      .references(() => account.id),
    debit: money().notNull().default('0'),
    credit: money().notNull().default('0'),
    /** Sub-ledgers: receivables by customer, payables by supplier. */
    customerId: bigintId().references(() => customer.id),
    supplierId: bigintId().references(() => supplier.id),
    description: text(),
  },
  (t) => [
    check('journal_line_one_side', sql`${t.debit} >= 0 and ${t.credit} >= 0 and (${t.debit} = 0) <> (${t.credit} = 0)`),
    index().on(t.dealershipId),
    index().on(t.journalEntryId),
    index().on(t.accountId),
    index().on(t.customerId),
    index().on(t.supplierId),
    tenantPolicy(),
  ],
);

// ===========================================================================
// Invoices (one engine for vehicle sales and service) and their lines
// ===========================================================================
export const invoice = accountsSchema.table(
  'invoice',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    legalEntityId: bigintId().references(() => legalEntity.id),
    accountingEntityId: bigintId().references(() => accountingEntity.id),
    invoiceNo: text().notNull().unique(),
    kind: text({ enum: INVOICE_KINDS }).notNull(),
    customerId: bigintId()
      .notNull()
      .references(() => customer.id),
    /** The business document invoiced, e.g. ('sales_order', 12) or ('job_card', 7). */
    sourceType: text().notNull(),
    sourceId: bigintId().notNull(),
    sourceNo: text(),
    invoiceDate: date({ mode: 'string' }).notNull(),
    dueDate: date({ mode: 'string' }).notNull(),
    subtotal: money().notNull(),
    taxAmount: money().notNull(),
    totalAmount: money().notNull(),
    amountPaid: money().notNull().default('0'),
    notes: text(),
    journalEntryId: bigintId().references(() => journalEntry.id),
    status: text({ enum: INVOICE_STATES }).notNull().default('draft'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    // A source document has at most one live invoice.
    uniqueIndex('invoice_source_live_uq').on(t.sourceType, t.sourceId).where(sql`${t.status} not in ('void', 'cancelled')`),
    check('invoice_amounts', sql`${t.amountPaid} >= 0 and ${t.amountPaid} <= ${t.totalAmount}`),
    index().on(t.dealershipId, t.status),
    index().on(t.branchId),
    index().on(t.legalEntityId),
    index().on(t.accountingEntityId),
    index().on(t.customerId),
    index().on(t.dueDate),
    index().on(t.journalEntryId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const invoiceLine = accountsSchema.table(
  'invoice_line',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    invoiceId: bigintId()
      .notNull()
      .references(() => invoice.id, { onDelete: 'cascade' }),
    kind: text({ enum: INVOICE_LINE_KINDS }).notNull(),
    description: text().notNull(),
    partNo: text(),
    quantity: qty().notNull(),
    unitPrice: money().notNull(),
    amount: money().notNull(),
    taxRate: numeric({ precision: 5, scale: 2, mode: 'string' }).notNull(),
    taxAmount: money().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.dealershipId), index().on(t.invoiceId), tenantPolicy()],
);

// ===========================================================================
// Payments: customer receipts (allocated to invoices) and supplier payments
// ===========================================================================
export const payment = accountsSchema.table(
  'payment',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    branchId: bigintId(),
    paymentNo: text().notNull().unique(),
    direction: text({ enum: ['receipt', 'disbursement'] }).notNull(),
    customerId: bigintId().references(() => customer.id),
    supplierId: bigintId().references(() => supplier.id),
    method: text({ enum: PAYMENT_METHODS }).notNull(),
    reference: text(),
    paymentDate: date({ mode: 'string' }).notNull(),
    amount: money().notNull(),
    notes: text(),
    journalEntryId: bigintId().references(() => journalEntry.id),
    status: text({ enum: ['posted', 'void'] }).notNull().default('posted'),
    ...trackedColumns(),
  },
  (t) => [
    branchFk(t),
    check('payment_party', sql`(${t.direction} = 'receipt' and ${t.customerId} is not null and ${t.supplierId} is null)
                               or (${t.direction} = 'disbursement' and ${t.supplierId} is not null and ${t.customerId} is null)`),
    check('payment_amount', sql`${t.amount} > 0`),
    index().on(t.dealershipId, t.paymentDate),
    index().on(t.branchId),
    index().on(t.customerId),
    index().on(t.supplierId),
    index().on(t.journalEntryId),
    ...trackedIndexes(t),
    tenantPolicy(),
  ],
);

export const paymentAllocation = accountsSchema.table(
  'payment_allocation',
  {
    id: pk(),
    dealershipId: bigintId()
      .notNull()
      .references(() => dealership.id),
    paymentId: bigintId()
      .notNull()
      .references(() => payment.id),
    invoiceId: bigintId()
      .notNull()
      .references(() => invoice.id),
    amount: money().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.paymentId, t.invoiceId),
    check('allocation_amount', sql`${t.amount} > 0`),
    index().on(t.dealershipId),
    index().on(t.paymentId),
    index().on(t.invoiceId),
    tenantPolicy(),
  ],
);
