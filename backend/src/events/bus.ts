import type { EntityCtx } from '../entity/types';
import { domainEvent } from '../modules/core/models';
import type { DomainEventMap, DomainEventType } from './catalog';

export interface DomainEvent<K extends DomainEventType = DomainEventType> {
  type: K;
  dealershipId: number;
  aggregateType: string;
  aggregateId: number;
  payload: DomainEventMap[K];
}

type Handler<K extends DomainEventType> = (ctx: EntityCtx, event: DomainEvent<K>) => Promise<void>;

const handlers = new Map<DomainEventType, Handler<DomainEventType>[]>();

/**
 * Subscribe a module to a domain event. Handlers run synchronously inside the publisher's
 * transaction: if one fails, the whole business operation rolls back (no half-applied state).
 */
export function subscribe<K extends DomainEventType>(type: K, handler: Handler<K>): void {
  handlers.set(type, [...(handlers.get(type) ?? []), handler as unknown as Handler<DomainEventType>]);
}

/** Records the event (append-only log) and runs its subscribers in the same transaction. */
export async function publish<K extends DomainEventType>(ctx: EntityCtx, event: DomainEvent<K>): Promise<void> {
  await ctx.tx.insert(domainEvent).values({
    dealershipId: event.dealershipId,
    type: event.type,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    actorId: ctx.access.userId,
  });
  for (const handler of handlers.get(event.type) ?? []) await handler(ctx, event as unknown as DomainEvent<DomainEventType>);
}

export function subscriberCount(type: DomainEventType): number {
  return handlers.get(type)?.length ?? 0;
}
