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

export const Money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => /^-?\d{1,12}(\.\d{1,2})?$/.test(v), 'Must be a monetary amount with up to 2 decimals')
  .openapi({ type: 'string', example: '1250000.00' });
