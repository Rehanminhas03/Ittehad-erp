import { describe, expect, it } from 'vitest';
import { owner, useTestDb } from './helpers';

useTestDb();

const SCHEMAS = ['core', 'audit', 'sales', 'service', 'parts', 'accounts'];

describe('database structure rules', () => {
  it('indexes every foreign key (an index must lead with one of the FK columns)', async () => {
    const { rows } = await owner.raw<{ fk: string }>(
      `select c.conrelid::regclass || ' (' || c.conname || ')' as fk
         from pg_constraint c
         join pg_namespace n on n.oid = c.connamespace
        where c.contype = 'f' and n.nspname = any($1)
          and not exists (
            select 1 from pg_index i
             where i.indrelid = c.conrelid and i.indkey[0] = any (c.conkey)
          )`,
      [SCHEMAS],
    );
    expect(rows.map((r) => r.fk)).toEqual([]);
  });

  it('enables RLS on every table with a dealership_id column', async () => {
    const { rows } = await owner.raw<{ t: string }>(
      `select format('%I.%I', n.nspname, c.relname) as t
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname = 'dealership_id' and not a.attisdropped
        where c.relkind = 'r' and n.nspname = any($1) and not c.relrowsecurity
          -- authorization metadata: user_role scopes are read before tenant context exists
          and format('%I.%I', n.nspname, c.relname) <> 'core.user_role'`,
      [SCHEMAS],
    );
    expect(rows.map((r) => r.t)).toEqual([]);
  });

  it('indexes every dealership_id / branch_id column (tenant filters)', async () => {
    const { rows } = await owner.raw<{ col: string }>(
      `select format('%I.%I.%I', n.nspname, c.relname, a.attname) as col
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attname in ('dealership_id', 'branch_id') and not a.attisdropped
        where c.relkind = 'r' and n.nspname = any($1)
          and not exists (select 1 from pg_index i where i.indrelid = c.oid and i.indkey[0] = a.attnum)`,
      [SCHEMAS],
    );
    expect(rows.map((r) => r.col)).toEqual([]);
  });
});
