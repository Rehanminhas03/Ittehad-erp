import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Every module imports `z` from here so `.openapi()` metadata is always available.
extendZodWithOpenApi(z);

export { z };

export const IdParam = z.object({ id: z.coerce.number().int().positive() });

/** Query-string parsers for list filters. */
export const IdQuery = z.coerce.number().int().positive();
export const BoolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Postgres bigint ids are returned as numbers (mode: 'number'); ids fit well below 2^53. */
export const Id = z.number().int().positive();

/** Response-only: Dates serialize to ISO strings via JSON.stringify. */
export const Timestamp = z.iso.datetime();

/** An amount: commas and spaces ("9,500,000") are accepted, and more than two decimals are rounded to two. */
export const Money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/[,\s]/g, ''))
  .refine((v) => /^-?\d{1,12}(\.\d*)?$/.test(v), 'Enter an amount, e.g. 9,500,000')
  .transform((v) => (/\.\d{3,}$/.test(v) ? Number(v).toFixed(2) : v.endsWith('.') ? v.slice(0, -1) : v))
  .openapi({ type: 'string', example: '1250000.00' });
