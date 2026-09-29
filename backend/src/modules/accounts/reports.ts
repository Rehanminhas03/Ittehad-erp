import { query as runQuery } from '../../db/client';
import { type SQL, sql } from '../../db/sql';
import type { EntityCtx } from '../../entity/types';
import { forbidden, notFound } from '../../lib/errors';
import { addMoney, cmpMoney } from '../../lib/money';
import { type PageQuery, offsetOf } from '../../lib/pagination';
import type { z } from '../../lib/zod';
import { customer } from '../master/models';
import { supplier } from '../parts/models';
import { account, invoice, journalEntry, journalLine } from './models';
import { AccountsPerm as P } from './permissions';
import type { AgingQuery, LedgerQuery, PayablesQuery, TrialBalanceQuery } from './schemas';

const today = () => new Date().toISOString().slice(0, 10);

function assertReportScope(ctx: EntityCtx, dealershipId: number) {
  if (!ctx.access.canIn(P.reportsView, { dealershipId })) throw forbidden('You cannot view the accounts of this dealership');
}

function rows<T>(ctx: EntityCtx, query: SQL): Promise<T[]> {
  return runQuery<T>(ctx.tx, query);
}

// =============================================================================
// Trial balance: every account's debits and credits up to a date. Must balance.
// =============================================================================
export async function trialBalance(ctx: EntityCtx, q: z.output<typeof TrialBalanceQuery>) {
  assertReportScope(ctx, q.dealershipId);
  const asOf = q.asOf ?? today();
  const items = await rows<{ accountId: number; code: string; name: string; type: 'asset'; debit: string; credit: string; balance: string }>(
    ctx,
    sql`
      select a.id::int as "accountId", a.code, a.name, a.type,
             coalesce(t.debit, 0)::numeric(14, 2)::text as debit, coalesce(t.credit, 0)::numeric(14, 2)::text as credit,
             (coalesce(t.debit, 0) - coalesce(t.credit, 0))::numeric(14, 2)::text as balance
      from ${account} a
      left join (
        select l.account_id, sum(l.debit) as debit, sum(l.credit) as credit
        from ${journalLine} l join ${journalEntry} e on e.id = l.journal_entry_id
        where l.dealership_id = ${q.dealershipId} and e.entry_date <= ${asOf}
        group by l.account_id
      ) t on t.account_id = a.id
      where a.dealership_id = ${q.dealershipId} and (a.is_active or t.account_id is not null)
      order by a.code
      limit 500`,
  );
  const totalDebit = addMoney('0', ...items.map((r) => r.debit));
  const totalCredit = addMoney('0', ...items.map((r) => r.credit));
  return { dealershipId: q.dealershipId, asOf, rows: items, totalDebit, totalCredit, balanced: cmpMoney(totalDebit, totalCredit) === 0 };
}

// =============================================================================
// Account ledger with running balance (debit - credit), oldest first
// =============================================================================
export async function accountLedger(ctx: EntityCtx, page: PageQuery, q: z.output<typeof LedgerQuery>) {
  const [acc] = await rows<{ dealershipId: number }>(ctx, sql`select dealership_id::int as "dealershipId" from ${account} where id = ${q.accountId}`);
  if (!acc) throw notFound('Account');
  assertReportScope(ctx, acc.dealershipId);
  const from = q.from ?? '0001-01-01';
  const to = q.to ?? '9999-12-31';
  const [{ opening } = { opening: '0' }] = await rows<{ opening: string }>(
    ctx,
    sql`select coalesce(sum(l.debit - l.credit), 0)::numeric(14, 2)::text as opening
        from ${journalLine} l join ${journalEntry} e on e.id = l.journal_entry_id
        where l.account_id = ${q.accountId} and e.entry_date < ${from}`,
  );
  const items = await rows<Record<string, unknown>>(
    ctx,
    sql`
      select * from (
        select l.id::int as "lineId", e.id::int as "journalEntryId", e.entry_no as "entryNo", e.entry_date::text as "entryDate",
               e.memo, l.description, l.debit::text as debit, l.credit::text as credit,
               (${opening}::numeric + sum(l.debit - l.credit) over (order by e.entry_date, l.id))::text as balance
        from ${journalLine} l join ${journalEntry} e on e.id = l.journal_entry_id
        where l.account_id = ${q.accountId} and e.entry_date between ${from} and ${to}
      ) x
      order by "entryDate", "lineId"
      limit ${page.pageSize} offset ${offsetOf(page)}`,
  );
  const [{ total } = { total: 0 }] = await rows<{ total: number }>(
    ctx,
    sql`select count(*)::int as total from ${journalLine} l join ${journalEntry} e on e.id = l.journal_entry_id
        where l.account_id = ${q.accountId} and e.entry_date between ${from} and ${to}`,
  );
  return { items, total, page: page.page, pageSize: page.pageSize };
}

// =============================================================================
// Receivables aging by customer (open invoices, days past due)
// =============================================================================
export async function receivablesAging(ctx: EntityCtx, page: PageQuery, q: z.output<typeof AgingQuery>) {
  assertReportScope(ctx, q.dealershipId);
  const open = sql`from ${invoice} i join ${customer} c on c.id = i.customer_id
                   where i.dealership_id = ${q.dealershipId} and i.status in ('issued', 'partially_paid')`;
  const bucket = (cond: SQL) => sql`coalesce(sum(i.total_amount - i.amount_paid) filter (where ${cond}), 0)::numeric(14, 2)::text`;
  const items = await rows<Record<string, unknown>>(
    ctx,
    sql`
      select i.customer_id::int as "customerId", c.full_name as "customerName",
             ${bucket(sql`current_date - i.due_date <= 0`)} as current,
             ${bucket(sql`current_date - i.due_date between 1 and 30`)} as "days1to30",
             ${bucket(sql`current_date - i.due_date between 31 and 60`)} as "days31to60",
             ${bucket(sql`current_date - i.due_date between 61 and 90`)} as "days61to90",
             ${bucket(sql`current_date - i.due_date > 90`)} as "over90",
             sum(i.total_amount - i.amount_paid)::text as total
      ${open}
      group by i.customer_id, c.full_name
      order by sum(i.total_amount - i.amount_paid) desc, i.customer_id
      limit ${page.pageSize} offset ${offsetOf(page)}`,
  );
  const [{ total } = { total: 0 }] = await rows<{ total: number }>(ctx, sql`select count(distinct i.customer_id)::int as total ${open}`);
  return { items, total, page: page.page, pageSize: page.pageSize };
}

// =============================================================================
// Payables by supplier: from the payables sub-ledger (GRNs credit, payments debit)
// =============================================================================
export async function payablesBySupplier(ctx: EntityCtx, page: PageQuery, q: z.output<typeof PayablesQuery>) {
  assertReportScope(ctx, q.dealershipId);
  const base = sql`
    from ${journalLine} l
    join ${account} a on a.id = l.account_id and a.role = 'payables'
    join ${supplier} s on s.id = l.supplier_id
    where l.dealership_id = ${q.dealershipId} and l.supplier_id is not null`;
  const items = await rows<Record<string, unknown>>(
    ctx,
    sql`
      select l.supplier_id::int as "supplierId", s.name as "supplierName",
             sum(l.credit)::text as billed, sum(l.debit)::text as paid, sum(l.credit - l.debit)::text as balance
      ${base}
      group by l.supplier_id, s.name
      order by sum(l.credit - l.debit) desc, l.supplier_id
      limit ${page.pageSize} offset ${offsetOf(page)}`,
  );
  const [{ total } = { total: 0 }] = await rows<{ total: number }>(ctx, sql`select count(distinct l.supplier_id)::int as total ${base}`);
  return { items, total, page: page.page, pageSize: page.pageSize };
}
