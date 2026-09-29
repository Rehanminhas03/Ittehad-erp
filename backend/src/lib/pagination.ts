import type { ZodType } from 'zod';
import { z } from './zod';

export const MAX_PAGE_SIZE = 100;

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  /** Column key, prefix with '-' for descending. Validated against each entity's sortable columns. */
  sort: z.string().max(64).optional(),
  q: z.string().trim().max(100).optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export function pageSchema<T extends ZodType>(item: T, name: string) {
  return z
    .object({
      items: z.array(item),
      total: z.number().int(),
      page: z.number().int(),
      pageSize: z.number().int(),
    })
    .openapi(name);
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const offsetOf = (q: { page: number; pageSize: number }) => (q.page - 1) * q.pageSize;
