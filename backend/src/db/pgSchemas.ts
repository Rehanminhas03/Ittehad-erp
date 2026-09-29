import { pgSchema } from 'drizzle-orm/pg-core';

// Every module's Postgres schema, declared once (drizzle-kit push drops schemas absent from the
// code, so they are declared even before a module has tables). `core` and `audit` live with the
// core models.
export const salesSchema = pgSchema('sales');
export const serviceSchema = pgSchema('service');
export const partsSchema = pgSchema('parts');
export const accountsSchema = pgSchema('accounts');
