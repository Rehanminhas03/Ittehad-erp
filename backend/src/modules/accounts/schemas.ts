import { Id, Money, Timestamp, z } from '../../lib/zod';
import { ACCOUNT_TYPES, INVOICE_KINDS, INVOICE_LINE_KINDS, INVOICE_STATES, JOURNAL_SOURCES, PAYMENT_METHODS } from './models';

const optionalText = (max = 200) => z.string().trim().max(max).nullish();
const PositiveMoney = Money.refine((v) => Number(v) > 0, 'Must be greater than 0');
const Quantity = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'Quantity must be greater than 0 (up to 2 decimals)')
  .openapi({ type: 'string', example: '1' });

// ---- Chart of accounts ------------------------------------------------------------------------
export const AccountSchema = z.object({
  id: Id,
  dealershipId: Id,
  code: z.string(),
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
  role: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const AccountCreate = z
  .object({
    dealershipId: Id,
    code: z.string().trim().min(2).max(12).regex(/^[0-9A-Z-]+$/, 'Digits, capitals and - only'),
    name: z.string().trim().min(2).max(120),
    type: z.enum(ACCOUNT_TYPES),
  })
  .openapi('AccountCreate');
export const AccountUpdate = z
  .object({ name: z.string().trim().min(2).max(120), isActive: z.boolean() })
  .partial()
  .openapi('AccountUpdate');

// ---- Journal ---------------------------------------------------------------------------------------
export const JournalEntrySchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  entryNo: z.string(),
  entryDate: z.string(),
  source: z.enum(JOURNAL_SOURCES),
  sourceType: z.string().nullable(),
  sourceId: Id.nullable(),
  memo: z.string(),
  totalAmount: z.string(),
  reversalOfId: Id.nullable(),
  reversedById: Id.nullable().optional(),
  postedById: Id,
  postedByName: z.string().nullable().optional(),
  postedAt: Timestamp,
});
export const JournalLineSchema = z
  .object({
    id: Id,
    accountId: Id,
    accountCode: z.string(),
    accountName: z.string(),
    debit: z.string(),
    credit: z.string(),
    customerId: Id.nullable(),
    customerName: z.string().nullable(),
    supplierId: Id.nullable(),
    supplierName: z.string().nullable(),
    description: z.string().nullable(),
  })
  .openapi('JournalLine');
export const ManualJournalCreate = z
  .object({
    dealershipId: Id,
    branchId: Id.nullish(),
    entryDate: z.iso.date().optional(),
    memo: z.string().trim().min(3).max(500),
    lines: z
      .array(
        z.object({
          accountId: Id,
          debit: Money.optional(),
          credit: Money.optional(),
          customerId: Id.nullish(),
          supplierId: Id.nullish(),
          description: optionalText(200),
        }),
      )
      .min(2)
      .max(50),
  })
  .openapi('ManualJournalCreate');
export const ReverseBody = z.object({ memo: z.string().trim().min(3).max(500) }).openapi('ReverseJournalRequest');

// ---- Invoices -------------------------------------------------------------------------------------
export const InvoiceSchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  invoiceNo: z.string(),
  kind: z.enum(INVOICE_KINDS),
  customerId: Id,
  customerName: z.string().nullable().optional(),
  sourceType: z.string(),
  sourceId: Id,
  sourceNo: z.string().nullable(),
  invoiceDate: z.string(),
  dueDate: z.string(),
  subtotal: z.string(),
  taxAmount: z.string(),
  totalAmount: z.string(),
  amountPaid: z.string(),
  notes: z.string().nullable(),
  journalEntryId: Id.nullable(),
  status: z.enum(INVOICE_STATES),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const INVOICE_SOURCES = ['sales_order', 'job_card'] as const;
export const InvoiceFromSource = z
  .object({ sourceType: z.enum(INVOICE_SOURCES), sourceId: Id, notes: optionalText(2000) })
  .openapi('InvoiceFromSource');
export const InvoiceUpdate = z
  .object({ dueDate: z.iso.date(), notes: optionalText(2000) })
  .partial()
  .openapi('InvoiceUpdate');

export const InvoiceLineSchema = z.object({
  id: Id,
  invoiceId: Id,
  kind: z.enum(INVOICE_LINE_KINDS),
  description: z.string(),
  partNo: z.string().nullable(),
  quantity: z.string(),
  unitPrice: z.string(),
  amount: z.string(),
  taxRate: z.string(),
  taxAmount: z.string(),
});
export const InvoiceLineCreate = z
  .object({
    kind: z.enum(INVOICE_LINE_KINDS).default('other'),
    description: z.string().trim().min(2).max(200),
    partNo: optionalText(60),
    quantity: Quantity,
    unitPrice: Money.refine((v) => Number(v) >= 0, 'Must be 0 or more'),
  })
  .openapi('InvoiceLineCreate');
export const InvoiceLineUpdate = z
  .object({ description: z.string().trim().min(2).max(200), quantity: Quantity, unitPrice: Money.refine((v) => Number(v) >= 0, 'Must be 0 or more') })
  .partial()
  .openapi('InvoiceLineUpdate');

// ---- Payments -------------------------------------------------------------------------------------
export const PaymentSchema = z.object({
  id: Id,
  dealershipId: Id,
  branchId: Id.nullable(),
  paymentNo: z.string(),
  direction: z.enum(['receipt', 'disbursement']),
  customerId: Id.nullable(),
  customerName: z.string().nullable().optional(),
  supplierId: Id.nullable(),
  supplierName: z.string().nullable().optional(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().nullable(),
  paymentDate: z.string(),
  amount: z.string(),
  notes: z.string().nullable(),
  journalEntryId: Id.nullable(),
  status: z.enum(['posted', 'void']),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export const PaymentCreate = z
  .object({
    dealershipId: Id,
    branchId: Id.nullish(),
    direction: z.enum(['receipt', 'disbursement']),
    customerId: Id.nullish(),
    supplierId: Id.nullish(),
    method: z.enum(PAYMENT_METHODS),
    reference: optionalText(60),
    paymentDate: z.iso.date().optional(),
    amount: PositiveMoney,
    notes: optionalText(2000),
    /** Receipts: settle these invoices (the rest stays as customer credit). */
    allocations: z.array(z.object({ invoiceId: Id, amount: PositiveMoney })).max(50).default([]),
  })
  .openapi('PaymentCreate');
export const AllocatePaymentBody = z.object({ invoiceId: Id, amount: PositiveMoney }).openapi('AllocatePaymentRequest');

export const PaymentAllocationSchema = z
  .object({
    id: Id,
    paymentId: Id,
    paymentNo: z.string(),
    paymentDate: z.string(),
    paymentStatus: z.enum(['posted', 'void']),
    invoiceId: Id,
    invoiceNo: z.string(),
    amount: z.string(),
  })
  .openapi('PaymentAllocation');

// ---- Reports ---------------------------------------------------------------------------------------
export const TrialBalanceQuery = z.object({ dealershipId: z.coerce.number().int().positive(), asOf: z.iso.date().optional() });
export const TrialBalanceSchema = z
  .object({
    dealershipId: Id,
    asOf: z.string(),
    rows: z.array(
      z.object({ accountId: Id, code: z.string(), name: z.string(), type: z.enum(ACCOUNT_TYPES), debit: z.string(), credit: z.string(), balance: z.string() }),
    ),
    totalDebit: z.string(),
    totalCredit: z.string(),
    balanced: z.boolean(),
  })
  .openapi('TrialBalance');

export const LedgerQuery = z.object({
  accountId: z.coerce.number().int().positive(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export const LedgerRowSchema = z
  .object({
    lineId: Id,
    journalEntryId: Id,
    entryNo: z.string(),
    entryDate: z.string(),
    memo: z.string(),
    description: z.string().nullable(),
    debit: z.string(),
    credit: z.string(),
    balance: z.string(),
  })
  .openapi('LedgerRow');

/** Open invoices aged by days past their due date, as of today. */
export const AgingQuery = z.object({ dealershipId: z.coerce.number().int().positive() });
export const ReceivableAgingSchema = z
  .object({
    customerId: Id,
    customerName: z.string(),
    current: z.string(),
    days1to30: z.string(),
    days31to60: z.string(),
    days61to90: z.string(),
    over90: z.string(),
    total: z.string(),
  })
  .openapi('ReceivableAging');
export const PayablesQuery = z.object({ dealershipId: z.coerce.number().int().positive() });
export const SupplierBalanceSchema = z
  .object({ supplierId: Id, supplierName: z.string(), billed: z.string(), paid: z.string(), balance: z.string() })
  .openapi('SupplierBalance');
