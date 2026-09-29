import type { Executor } from '../../db/client';
import { Prisma } from '../../generated/prisma/client';

export interface AuditEntry {
  entityType: string;
  entityId: string | number;
  action: string;
  dealershipId?: number | null;
  branchId?: number | null;
  changes?: unknown;
}

export interface AuditMeta {
  actorId: number | null;
  requestId?: string;
  ip?: string;
}

const SECRET_KEY = /password|token|secret/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v)]),
    );
  }
  return value;
}

// createMany: no RETURNING, so the insert does not need the row to pass audit_read (e.g. a sign-in,
// written before there is a current user).
export async function writeAudit(ex: Executor, meta: AuditMeta, entry: AuditEntry): Promise<void> {
  await ex.auditLog.createMany({
    data: {
      actorId: meta.actorId,
      requestId: meta.requestId,
      ip: meta.ip,
      entityType: entry.entityType,
      entityId: String(entry.entityId),
      action: entry.action,
      dealershipId: entry.dealershipId ?? null,
      branchId: entry.branchId ?? null,
      // SQL NULL when there are no changes (as before), not a JSON null.
      changes: entry.changes === undefined ? Prisma.DbNull : (redact(entry.changes) as Prisma.InputJsonValue),
    },
  });
}

const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

/** Field-level before/after for the keys present in `patch`; unchanged keys are omitted. */
export function diffChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(patch)) {
    const from = before[k];
    if (JSON.stringify(norm(from)) !== JSON.stringify(norm(to))) out[k] = { from: norm(from), to: norm(to) };
  }
  return out;
}
