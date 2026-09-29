import { type AccountRole, CHART_TEMPLATE } from '../../config/accounting';
import type { EntityCtx } from '../../entity/types';
import { conflict, notFound, validationError } from '../../lib/errors';
import { fromPaisa, toPaisa } from '../../lib/money';
import { DocType, nextDocumentNumber } from '../core/documents';
import type { JOURNAL_SOURCES } from './models';

export interface PostingLine {
  /** Either a role (automatic postings) or a specific account (manual journals). */
  role?: AccountRole;
  accountId?: number;
  debit?: string;
  credit?: string;
  customerId?: number | null;
  supplierId?: number | null;
  description?: string | null;
}

export interface Posting {
  dealershipId: number;
  branchId?: number | null;
  entryDate?: string;
  source: (typeof JOURNAL_SOURCES)[number];
  sourceType?: string;
  sourceId?: number;
  memo: string;
  lines: PostingLine[];
  reversalOfId?: number;
}

const today = () => new Date().toISOString().slice(0, 10);

const TEMPLATE_ROLES = CHART_TEMPLATE.filter((a) => a.role).length;

/**
 * Gives a dealership the standard chart of accounts the first time it is needed (idempotent).
 * Accounts whose code or role is already taken are left as the accountant set them up.
 */
export async function ensureChart(ctx: EntityCtx, dealershipId: number) {
  const n = await ctx.tx.account.count({ where: { dealershipId, role: { not: null } } });
  if (n >= TEMPLATE_ROLES) return;
  await ctx.tx.account.createMany({
    data: CHART_TEMPLATE.map((a) => ({ ...a, role: a.role ?? null, dealershipId, createdById: ctx.access.userId, updatedById: ctx.access.userId })),
    skipDuplicates: true,
  });
}

async function accountsByRole(ctx: EntityCtx, dealershipId: number, roles: AccountRole[]) {
  if (!roles.length) return new Map<string, number>();
  const rows = await ctx.tx.account.findMany({
    where: { dealershipId, role: { in: roles }, isActive: true },
    select: { id: true, role: true },
  });
  const map = new Map(rows.map((r) => [r.role!, r.id]));
  const missing = roles.filter((r) => !map.has(r));
  if (missing.length) throw conflict(`The chart of accounts has no active account for: ${missing.join(', ')}`);
  return map;
}

/**
 * Posts a balanced journal entry (append-only). Zero lines are dropped; debits must equal credits.
 * The database re-checks the balance at commit (deferred constraint trigger).
 */
export async function post(ctx: EntityCtx, p: Posting) {
  await ensureChart(ctx, p.dealershipId);
  const lines = p.lines
    .map((l) => ({ ...l, d: toPaisa(l.debit ?? '0'), c: toPaisa(l.credit ?? '0') }))
    .filter((l) => l.d !== 0n || l.c !== 0n);
  for (const l of lines) {
    if (l.d < 0n || l.c < 0n || (l.d > 0n && l.c > 0n)) throw validationError([{ in: 'body', path: 'lines', message: 'Each line is either a debit or a credit, and positive' }]);
  }
  const debit = lines.reduce((s, l) => s + l.d, 0n);
  const credit = lines.reduce((s, l) => s + l.c, 0n);
  if (lines.length < 2 || debit !== credit || debit === 0n) {
    throw validationError([{ in: 'body', path: 'lines', message: `Debits (${fromPaisa(debit)}) must equal credits (${fromPaisa(credit)})` }]);
  }

  const roles = [...new Set(lines.map((l) => l.role).filter((r): r is AccountRole => !!r))];
  const byRole = await accountsByRole(ctx, p.dealershipId, roles);
  const explicit = lines.map((l) => l.accountId).filter((x): x is number => !!x);
  if (explicit.length) {
    const found = await ctx.tx.account.findMany({
      where: { dealershipId: p.dealershipId, id: { in: explicit }, isActive: true },
      select: { id: true },
    });
    if (found.length !== new Set(explicit).size) throw validationError([{ in: 'body', path: 'lines', message: "Use active accounts of this dealership's chart" }]);
  }

  const d = await ctx.tx.dealership.findFirst({
    where: { id: p.dealershipId },
    select: { legalEntityId: true, accountingEntityId: true },
  });
  const entry = await ctx.tx.journalEntry.create({
    data: {
      dealershipId: p.dealershipId,
      branchId: p.branchId ?? null,
      legalEntityId: d?.legalEntityId ?? null,
      accountingEntityId: d?.accountingEntityId ?? null,
      entryNo: await nextDocumentNumber(ctx.tx, p.dealershipId, DocType.journal),
      entryDate: p.entryDate ?? today(),
      source: p.source,
      sourceType: p.sourceType ?? null,
      sourceId: p.sourceId ?? null,
      memo: p.memo,
      totalAmount: fromPaisa(debit),
      reversalOfId: p.reversalOfId ?? null,
      postedById: ctx.access.userId,
    },
  });
  await ctx.tx.journalLine.createMany({
    data: lines.map((l) => ({
      dealershipId: p.dealershipId,
      journalEntryId: entry.id,
      accountId: l.accountId ?? byRole.get(l.role!)!,
      debit: fromPaisa(l.d),
      credit: fromPaisa(l.c),
      customerId: l.customerId ?? null,
      supplierId: l.supplierId ?? null,
      description: l.description ?? null,
    })),
  });
  return entry;
}

/** Cancels a posted entry with a mirror entry (debits and credits swapped). Each entry reverses once. */
export async function reverse(ctx: EntityCtx, entryId: number, memo: string, source: Posting['source'] = 'reversal') {
  const original = await ctx.tx.journalEntry.findFirst({ where: { id: entryId } });
  if (!original) throw notFound('Journal entry');
  const already = await ctx.tx.journalEntry.findFirst({ where: { reversalOfId: entryId }, select: { id: true } });
  if (already) throw conflict('This entry has already been reversed');
  if (original.reversalOfId) throw conflict('A reversal cannot itself be reversed; post a new entry instead');
  const lines = await ctx.tx.journalLine.findMany({ where: { journalEntryId: entryId }, orderBy: { id: 'asc' } });
  return post(ctx, {
    dealershipId: original.dealershipId,
    branchId: original.branchId,
    source,
    sourceType: original.sourceType ?? undefined,
    sourceId: original.sourceId ?? undefined,
    memo,
    reversalOfId: original.id,
    lines: lines.map((l) => ({
      accountId: l.accountId,
      debit: l.credit,
      credit: l.debit,
      customerId: l.customerId,
      supplierId: l.supplierId,
      description: l.description,
    })),
  });
}
