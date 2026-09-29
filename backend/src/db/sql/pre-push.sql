-- Runs BEFORE drizzle-kit push. Idempotent.
-- Creates the module schemas and the helper functions that RLS policies (declared in the models) call.

create schema if not exists core;
create schema if not exists audit;
create schema if not exists sales;
create schema if not exists service;
create schema if not exists parts;
create schema if not exists accounts;

-- Trigram indexes for partial-match search (name, mobile, VIN, registration, engine number).
-- pg_trgm is a trusted extension: the database owner can create it without superuser.
create extension if not exists pg_trgm;

-- Per-request tenant context (set transaction-locally by withTenantTx):
--   app.global          'on' when the caller holds any global (all-dealership) grant
--   app.dealership_ids  '{1,2}' dealerships reachable through any of the caller's grants
-- No settings => no rows visible.
create or replace function core.app_is_global() returns boolean
  language sql stable
  as $$ select coalesce(current_setting('app.global', true), '') = 'on' $$;

-- The signed-in user (app.user_id), or null outside a request.
create or replace function core.app_user_id() returns bigint
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::bigint $$;

create or replace function core.app_tenant_visible(d bigint) returns boolean
  language sql stable
  as $$
    select core.app_is_global()
        or d = any (coalesce(nullif(current_setting('app.dealership_ids', true), ''), '{}')::bigint[])
  $$;

create or replace function core.forbid_mutation() returns trigger
  language plpgsql
  as $$
  begin
    raise exception '%.% is append-only; % is not allowed', tg_table_schema, tg_table_name, tg_op
      using errcode = 'insufficient_privilege';
  end
  $$;
