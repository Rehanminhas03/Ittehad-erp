-- Runs AFTER drizzle-kit push. Idempotent.
-- The runtime role `dms_app` (created once by `npm run setup`, see scripts/setup.mjs) gets DML only and is
-- not a table owner, so RLS applies to it. Migrations/seed use the owner role.

grant usage on schema core, audit, sales, service, parts, accounts to dms_app;

grant select, insert, update, delete on all tables in schema core, sales, service, parts, accounts to dms_app;
grant usage, select on all sequences in schema core, audit, sales, service, parts, accounts to dms_app;

-- Journal integrity, checked at COMMIT (deferred) so an entry and its lines are inserted first:
-- every entry has at least two lines, debits equal credits, and both equal the entry's total.
create or replace function accounts.assert_entry_balanced(entry_id bigint) returns void
  language plpgsql
  as $$
  declare
    d numeric; c numeric; n int; total numeric;
  begin
    select coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*) into d, c, n
      from accounts.journal_line where journal_entry_id = entry_id;
    select total_amount into total from accounts.journal_entry where id = entry_id;
    if n < 2 or d <> c or d <> total or d = 0 then
      raise exception 'Journal entry % does not balance (debits %, credits %, total %, % lines)', entry_id, d, c, total, n
        using errcode = 'check_violation';
    end if;
  end
  $$;

create or replace function accounts.journal_entry_balanced() returns trigger
  language plpgsql
  as $$ begin perform accounts.assert_entry_balanced(new.id); return null; end $$;

create or replace function accounts.journal_line_balanced() returns trigger
  language plpgsql
  as $$ begin perform accounts.assert_entry_balanced(new.journal_entry_id); return null; end $$;

drop trigger if exists journal_entry_balanced on accounts.journal_entry;
create constraint trigger journal_entry_balanced after insert on accounts.journal_entry
  deferrable initially deferred for each row execute function accounts.journal_entry_balanced();

drop trigger if exists journal_line_balanced on accounts.journal_line;
create constraint trigger journal_line_balanced after insert on accounts.journal_line
  deferrable initially deferred for each row execute function accounts.journal_line_balanced();

-- Audit log: read + append only.
revoke all on audit.audit_log from dms_app;
grant select, insert on audit.audit_log to dms_app;

-- Append-only tables: no UPDATE/DELETE for the app role, and a trigger stops everyone else too.
-- Add each new append-only table to this block.
do $$
declare
  t text;
begin
  foreach t in array array[
    'audit.audit_log',
    'core.workflow_transition',
    'core.domain_event',
    'parts.inventory_transaction',
    'accounts.journal_entry',
    'accounts.journal_line'
  ] loop
    execute format('revoke update, delete, truncate on %s from dms_app', t);
    execute format('drop trigger if exists append_only on %s', t);
    execute format(
      'create trigger append_only before update or delete on %s for each row execute function core.forbid_mutation()', t);
  end loop;
end
$$;
