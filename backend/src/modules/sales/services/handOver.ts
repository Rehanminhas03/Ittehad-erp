/**
 * Handing a leaver's leads to someone else in the sales team (Sales Manager, `sales.team.manage`).
 * Open leads (new / follow-up / visited) move with their quotations and PPF vouchers, so the new
 * salesperson follows them up. Optionally the converted / in-progress ones too, so the customer has
 * a contact until delivery; their sales orders stay credited to the original salesperson.
 */
import { query } from '../../../db/client';
import { join, sql } from '../../../db/sql';
import type { EntityCtx } from '../../../entity/types';
import { forbidden, validationError } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { SalesPerm as P } from '../permissions';
import type { HandOverLeadsBody } from '../schemas';
import { membersSql } from './teamReport';

const OPEN = ['new', 'follow_up', 'visited'];
const IN_PROGRESS = ['converted', 'processing'];

function assertTeamManager(ctx: EntityCtx, dealershipId: number) {
  if (!ctx.access.canIn(P.teamManage, { dealershipId })) throw forbidden('Only the Sales Manager hands over leads');
}

/** How many leads the person still owns at the dealership: open, and converted / in progress. */
export async function leadsToHandOver(ctx: EntityCtx, userId: number, dealershipId: number) {
  assertTeamManager(ctx, dealershipId);
  const [row] = await query<{ open: number; inProgress: number }>(
    ctx.tx,
    sql`select count(*) filter (where status in (${join(OPEN)}))::int as "open",
               count(*) filter (where status in (${join(IN_PROGRESS)}))::int as "inProgress"
          from sales.lead where dealership_id = ${dealershipId} and owner_id = ${userId}`,
  );
  return row ?? { open: 0, inProgress: 0 };
}

export async function handOverLeads(ctx: EntityCtx, input: z.output<typeof HandOverLeadsBody>) {
  const { dealershipId, fromUserId, toUserId } = input;
  assertTeamManager(ctx, dealershipId);
  if (fromUserId === toUserId) throw validationError([{ in: 'body', path: 'toUserId', message: 'Choose someone else to take the leads' }]);
  const [to] = await query<{ id: number; fullName: string }>(ctx.tx, sql`select id, "fullName" from (${membersSql(dealershipId)}) m where id = ${toUserId}`);
  if (!to) throw validationError([{ in: 'body', path: 'toUserId', message: 'Choose an active member of the sales team at this dealership' }]);

  const states = input.includeInProgress ? [...OPEN, ...IN_PROGRESS] : OPEN;
  const moved = await query<{ id: number }>(
    ctx.tx,
    sql`update sales.lead set owner_id = ${toUserId}, updated_at = now(), updated_by_id = ${ctx.access.userId}
         where dealership_id = ${dealershipId} and owner_id = ${fromUserId} and status in (${join(states)})
         returning id::int as id`,
  );
  const ids = moved.map((l) => l.id);
  if (ids.length) {
    // Their quotations and PPF vouchers go with them, so the new salesperson sees and reprints them.
    const idList = join(ids);
    await query(ctx.tx, sql`update sales.quotation set owner_id = ${toUserId} where lead_id in (${idList}) and owner_id = ${fromUserId}`);
    await query(ctx.tx, sql`update sales.ppf_form set owner_id = ${toUserId} where lead_id in (${idList}) and owner_id = ${fromUserId}`);
    for (const id of ids) {
      await ctx.audit({ entityType: 'sales.lead', entityId: id, action: 'hand_over', dealershipId, changes: { ownerId: { from: fromUserId, to: toUserId }, toName: to.fullName } });
    }
  }
  return { moved: ids.length, toName: to.fullName };
}
