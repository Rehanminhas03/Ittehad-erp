/**
 * Variant codes pasted from Excel (Code / Description): new codes are added, known codes get the new
 * description; each change is audited. Assistant Manager / Sales Manager.
 */
import { and, eq } from 'drizzle-orm';
import type { EntityCtx } from '../../../entity/types';
import { forbidden } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { brandOf } from '../entities';
import { vehicleVariant } from '../models';
import { SalesPerm as P } from '../permissions';
import type { VariantImportBody } from '../schemas';
import { detectModel } from '../variantCatalog';

export async function importVariants(ctx: EntityCtx, input: z.output<typeof VariantImportBody>) {
  const { dealershipId } = input;
  if (!ctx.access.canIn(P.templatesManage, { dealershipId })) throw forbidden();
  const brand = await brandOf(ctx, dealershipId);
  // The last row wins when a code is pasted twice.
  const rows = new Map(input.rows.map((r) => [r.code, r.description]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const [code, description] of rows) {
    const [existing] = await ctx.tx
      .select()
      .from(vehicleVariant)
      .where(and(eq(vehicleVariant.dealershipId, dealershipId), eq(vehicleVariant.code, code)));
    if (!existing) {
      const [row] = await ctx.tx
        .insert(vehicleVariant)
        .values({ dealershipId, code, description, modelId: await detectModel(ctx.tx, brand, description), createdById: ctx.access.userId, updatedById: ctx.access.userId })
        .returning({ id: vehicleVariant.id });
      await ctx.audit({ entityType: 'sales.vehicle_variant', entityId: row!.id, action: 'create', dealershipId, branchId: null, changes: { code, description } });
      added++;
    } else if (existing.description !== description || !existing.isActive) {
      await ctx.tx
        .update(vehicleVariant)
        .set({ description, isActive: true, updatedById: ctx.access.userId, updatedAt: new Date() })
        .where(eq(vehicleVariant.id, existing.id));
      await ctx.audit({ entityType: 'sales.vehicle_variant', entityId: existing.id, action: 'update', dealershipId, branchId: null, changes: { description: { from: existing.description, to: description } } });
      updated++;
    } else unchanged++;
  }
  return { added, updated, unchanged };
}
