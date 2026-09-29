// Tables: defined in prisma/schema.prisma (Prisma ORM); these are their generated identifiers for
// hand-written SQL (see src/db/tables.generated.ts). Prisma Client: tx.<table>.findMany(...).
export { account, journalEntry, journalLine, invoice, invoiceLine, payment, paymentAllocation } from '../../db/tables.generated';

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export const INVOICE_STATES = ['draft', 'issued', 'partially_paid', 'paid', 'void', 'cancelled'] as const;
export const INVOICE_KINDS = ['vehicle_sale', 'service'] as const;
export const INVOICE_LINE_KINDS = ['vehicle', 'labour', 'part', 'other'] as const;
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'card'] as const;
export const JOURNAL_SOURCES = ['manual', 'reversal', 'invoice', 'payment', 'goods_receipt', 'stock'] as const;

