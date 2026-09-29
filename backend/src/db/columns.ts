import { bigint, timestamp } from 'drizzle-orm/pg-core';

/** Column naming is snake_case via drizzle `casing`, so builders here take no explicit name. */
export const pk = () => bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity();
export const bigintId = () => bigint({ mode: 'number' });
export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
