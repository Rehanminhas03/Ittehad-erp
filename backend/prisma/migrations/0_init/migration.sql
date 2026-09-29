-- Baseline: the database as built by the Drizzle version (2026-09-29), dumped with pg_dump.
-- Tables, indexes (incl. partial and trigram), constraints, row-level security policies, the RLS
-- helper functions, append-only and journal-balance triggers, and the grants for the app role
-- (dms_app, created once per server by `npm run setup`). Existing databases: mark as applied with
--   npx prisma migrate resolve --applied 0_init
-- New databases: `npx prisma migrate deploy` (or `npm run db:migrate`).

-- Trigram search indexes (name, phone, VIN…) need pg_trgm (a trusted extension; no superuser).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--
-- PostgreSQL database dump
--

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

--
-- Name: accounts; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA accounts;

--
-- Name: audit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA audit;

--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;

--
-- Name: parts; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA parts;

--
-- Name: sales; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA sales;

--
-- Name: service; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA service;

--
-- Name: assert_entry_balanced(bigint); Type: FUNCTION; Schema: accounts; Owner: -
--

CREATE FUNCTION accounts.assert_entry_balanced(entry_id bigint) RETURNS void
    LANGUAGE plpgsql
    AS $$
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

--
-- Name: journal_entry_balanced(); Type: FUNCTION; Schema: accounts; Owner: -
--

CREATE FUNCTION accounts.journal_entry_balanced() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin perform accounts.assert_entry_balanced(new.id); return null; end $$;

--
-- Name: journal_line_balanced(); Type: FUNCTION; Schema: accounts; Owner: -
--

CREATE FUNCTION accounts.journal_line_balanced() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ begin perform accounts.assert_entry_balanced(new.journal_entry_id); return null; end $$;

--
-- Name: app_is_global(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.app_is_global() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$ select coalesce(current_setting('app.global', true), '') = 'on' $$;

--
-- Name: app_tenant_visible(bigint); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.app_tenant_visible(d bigint) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
    select core.app_is_global()
        or d = any (coalesce(nullif(current_setting('app.dealership_ids', true), ''), '{}')::bigint[])
  $$;

--
-- Name: app_user_id(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.app_user_id() RETURNS bigint
    LANGUAGE sql STABLE
    AS $$ select nullif(current_setting('app.user_id', true), '')::bigint $$;

--
-- Name: forbid_mutation(); Type: FUNCTION; Schema: core; Owner: -
--

CREATE FUNCTION core.forbid_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  begin
    raise exception '%.% is append-only; % is not allowed', tg_table_schema, tg_table_name, tg_op
      using errcode = 'insufficient_privilege';
  end
  $$;

--
-- Name: account; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.account (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    role text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: account_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.account ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: invoice; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.invoice (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    legal_entity_id bigint,
    accounting_entity_id bigint,
    invoice_no text NOT NULL,
    kind text NOT NULL,
    customer_id bigint NOT NULL,
    source_type text NOT NULL,
    source_id bigint NOT NULL,
    source_no text,
    invoice_date date NOT NULL,
    due_date date NOT NULL,
    subtotal numeric(14,2) NOT NULL,
    tax_amount numeric(14,2) NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    amount_paid numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    journal_entry_id bigint,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT invoice_amounts CHECK (((amount_paid >= (0)::numeric) AND (amount_paid <= total_amount)))
);

--
-- Name: invoice_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.invoice ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.invoice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: invoice_line; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.invoice_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    kind text NOT NULL,
    description text NOT NULL,
    part_no text,
    quantity numeric(12,2) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    tax_rate numeric(5,2) NOT NULL,
    tax_amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: invoice_line_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.invoice_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.invoice_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: journal_entry; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.journal_entry (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    legal_entity_id bigint,
    accounting_entity_id bigint,
    entry_no text NOT NULL,
    entry_date date NOT NULL,
    source text NOT NULL,
    source_type text,
    source_id bigint,
    memo text NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    reversal_of_id bigint,
    posted_by_id bigint NOT NULL,
    posted_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: journal_entry_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.journal_entry ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.journal_entry_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: journal_line; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.journal_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    journal_entry_id bigint NOT NULL,
    account_id bigint NOT NULL,
    debit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    credit numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    customer_id bigint,
    supplier_id bigint,
    description text,
    CONSTRAINT journal_line_one_side CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric) AND ((debit = (0)::numeric) <> (credit = (0)::numeric))))
);

--
-- Name: journal_line_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.journal_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.journal_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: payment; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.payment (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    payment_no text NOT NULL,
    direction text NOT NULL,
    customer_id bigint,
    supplier_id bigint,
    method text NOT NULL,
    reference text,
    payment_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    notes text,
    journal_entry_id bigint,
    status text DEFAULT 'posted'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT payment_amount CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_party CHECK ((((direction = 'receipt'::text) AND (customer_id IS NOT NULL) AND (supplier_id IS NULL)) OR ((direction = 'disbursement'::text) AND (supplier_id IS NOT NULL) AND (customer_id IS NULL))))
);

--
-- Name: payment_allocation; Type: TABLE; Schema: accounts; Owner: -
--

CREATE TABLE accounts.payment_allocation (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    payment_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT allocation_amount CHECK ((amount > (0)::numeric))
);

--
-- Name: payment_allocation_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.payment_allocation ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.payment_allocation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: payment_id_seq; Type: SEQUENCE; Schema: accounts; Owner: -
--

ALTER TABLE accounts.payment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME accounts.payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: audit_log; Type: TABLE; Schema: audit; Owner: -
--

CREATE TABLE audit.audit_log (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id bigint,
    dealership_id bigint,
    branch_id bigint,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    changes jsonb,
    request_id text,
    ip text
);

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: audit; Owner: -
--

ALTER TABLE audit.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME audit.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: accounting_entity; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.accounting_entity (
    id bigint NOT NULL,
    name text NOT NULL,
    legal_entity_id bigint,
    base_currency text DEFAULT 'PKR'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: accounting_entity_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.accounting_entity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.accounting_entity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: branch; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.branch (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    city text,
    address text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: branch_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.branch ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.branch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: customer; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.customer (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    kind text DEFAULT 'individual'::text NOT NULL,
    full_name text NOT NULL,
    mobile text NOT NULL,
    mobile_normalized text NOT NULL,
    alt_phone text,
    email text,
    cnic text,
    ntn text,
    address text,
    city text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT customer_cnic_digits CHECK (((cnic IS NULL) OR (cnic ~ '^[0-9]{13}$'::text)))
);

--
-- Name: customer_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.customer ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.customer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: dealership; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.dealership (
    id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    brand text NOT NULL,
    city text,
    address text,
    phone text,
    legal_entity_id bigint,
    accounting_entity_id bigint,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: dealership_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.dealership ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.dealership_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: document_sequence; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.document_sequence (
    dealership_id bigint NOT NULL,
    doc_type text NOT NULL,
    year integer NOT NULL,
    last_no integer NOT NULL
);

--
-- Name: domain_event; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.domain_event (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id bigint NOT NULL,
    payload jsonb NOT NULL,
    actor_id bigint,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: domain_event_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.domain_event ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.domain_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: legal_entity; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.legal_entity (
    id bigint NOT NULL,
    name text NOT NULL,
    registration_no text,
    tax_no text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: legal_entity_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.legal_entity ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.legal_entity_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: notification; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notification (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    dealership_id bigint,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    title text NOT NULL,
    detail text,
    href text,
    actor_id bigint,
    actor_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);

--
-- Name: notification_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.notification ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: permission; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.permission (
    id bigint NOT NULL,
    code text NOT NULL,
    module text NOT NULL,
    description text NOT NULL
);

--
-- Name: permission_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.permission ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.permission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: refresh_token; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.refresh_token (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_agent text,
    ip text
);

--
-- Name: refresh_token_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.refresh_token ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.refresh_token_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: role; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.role (
    id bigint NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    delegated_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: role_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.role ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: role_permission; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.role_permission (
    role_id bigint NOT NULL,
    permission_id bigint NOT NULL
);

--
-- Name: user; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core."user" (
    id bigint NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    password_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    token_version integer DEFAULT 0 NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core."user" ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: user_role; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.user_role (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    role_id bigint NOT NULL,
    dealership_id bigint,
    branch_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    CONSTRAINT user_role_branch_needs_dealership CHECK (((branch_id IS NULL) OR (dealership_id IS NOT NULL)))
);

--
-- Name: user_role_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.user_role ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.user_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: vehicle; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.vehicle (
    id bigint NOT NULL,
    vin text,
    engine_no text,
    registration_no text,
    model_id bigint NOT NULL,
    variant text,
    model_year integer,
    color text,
    notes text,
    status text DEFAULT 'available'::text NOT NULL,
    activated_on date,
    warranty_ends_on date,
    activation_odometer_km integer,
    sold_by_dealership_id bigint,
    service_visit_count integer DEFAULT 0 NOT NULL,
    last_service_on date,
    last_odometer_km integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT vehicle_model_year CHECK (((model_year IS NULL) OR ((model_year >= 1950) AND (model_year <= 2100))))
);

--
-- Name: vehicle_dealership; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.vehicle_dealership (
    id bigint NOT NULL,
    vehicle_id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint
);

--
-- Name: vehicle_dealership_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.vehicle_dealership ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.vehicle_dealership_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: vehicle_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.vehicle ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.vehicle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: vehicle_model; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.vehicle_model (
    id bigint NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    body_type text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: vehicle_model_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.vehicle_model ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.vehicle_model_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: vehicle_ownership; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.vehicle_ownership (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    vehicle_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    start_date date NOT NULL,
    end_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    ended_at timestamp with time zone,
    ended_by_id bigint,
    CONSTRAINT vehicle_ownership_dates CHECK (((end_date IS NULL) OR (end_date >= start_date)))
);

--
-- Name: vehicle_ownership_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.vehicle_ownership ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.vehicle_ownership_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: workflow_transition; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.workflow_transition (
    id bigint NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    action text NOT NULL,
    from_state text NOT NULL,
    to_state text NOT NULL,
    comment text,
    actor_id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: workflow_transition_id_seq; Type: SEQUENCE; Schema: core; Owner: -
--

ALTER TABLE core.workflow_transition ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME core.workflow_transition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: goods_receipt; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.goods_receipt (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    grn_no text NOT NULL,
    purchase_order_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    supplier_invoice_no text,
    received_date date NOT NULL,
    total_cost numeric(14,2) NOT NULL,
    notes text,
    received_by_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: goods_receipt_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.goods_receipt ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.goods_receipt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: goods_receipt_line; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.goods_receipt_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    goods_receipt_id bigint NOT NULL,
    purchase_order_line_id bigint NOT NULL,
    part_id bigint NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_cost numeric(14,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    CONSTRAINT grn_line_qty CHECK ((quantity > (0)::numeric))
);

--
-- Name: goods_receipt_line_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.goods_receipt_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.goods_receipt_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: inventory_transaction; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.inventory_transaction (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    part_id bigint NOT NULL,
    type text NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_cost numeric(14,2) NOT NULL,
    value numeric(14,2) NOT NULL,
    balance_after numeric(12,2) NOT NULL,
    average_cost_after numeric(14,2) NOT NULL,
    reference_type text NOT NULL,
    reference_id bigint NOT NULL,
    reference_no text,
    notes text,
    actor_id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_tx_nonzero CHECK ((quantity <> (0)::numeric))
);

--
-- Name: inventory_transaction_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.inventory_transaction ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.inventory_transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: part; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.part (
    id bigint NOT NULL,
    part_no text NOT NULL,
    description text NOT NULL,
    brand text,
    category text,
    uom text DEFAULT 'each'::text NOT NULL,
    selling_price numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT part_price CHECK ((selling_price >= (0)::numeric))
);

--
-- Name: part_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.part ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.part_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: parts_request; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.parts_request (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    request_no text NOT NULL,
    job_card_id bigint NOT NULL,
    requested_by_id bigint NOT NULL,
    notes text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: parts_request_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.parts_request ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.parts_request_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: parts_request_line; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.parts_request_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    parts_request_id bigint NOT NULL,
    part_id bigint NOT NULL,
    part_no text NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) NOT NULL,
    issued_qty numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    returned_qty numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    job_card_line_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT request_line_qty CHECK (((quantity > (0)::numeric) AND (issued_qty >= (0)::numeric) AND (issued_qty <= quantity) AND (returned_qty >= (0)::numeric) AND (returned_qty <= issued_qty)))
);

--
-- Name: parts_request_line_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.parts_request_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.parts_request_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: purchase_order; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.purchase_order (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    legal_entity_id bigint,
    accounting_entity_id bigint,
    po_no text NOT NULL,
    supplier_id bigint NOT NULL,
    order_date date NOT NULL,
    expected_date date,
    total_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: purchase_order_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.purchase_order ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.purchase_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: purchase_order_line; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.purchase_order_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    part_id bigint NOT NULL,
    part_no text NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    received_qty numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT po_line_qty CHECK (((quantity > (0)::numeric) AND (unit_price >= (0)::numeric) AND (received_qty >= (0)::numeric) AND (received_qty <= quantity)))
);

--
-- Name: purchase_order_line_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.purchase_order_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.purchase_order_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stock_adjustment; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.stock_adjustment (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    adjustment_no text NOT NULL,
    reason text NOT NULL,
    notes text,
    posted_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: stock_adjustment_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_adjustment ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.stock_adjustment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stock_adjustment_line; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.stock_adjustment_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    stock_adjustment_id bigint NOT NULL,
    part_id bigint NOT NULL,
    part_no text NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_cost numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT adjustment_line_qty CHECK ((quantity <> (0)::numeric))
);

--
-- Name: stock_adjustment_line_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_adjustment_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.stock_adjustment_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stock_item; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.stock_item (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    part_id bigint NOT NULL,
    quantity_on_hand numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    average_cost numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    bin_location text,
    reorder_level numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_non_negative CHECK (((quantity_on_hand >= (0)::numeric) AND (average_cost >= (0)::numeric)))
);

--
-- Name: stock_item_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_item ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.stock_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stock_transfer; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.stock_transfer (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint NOT NULL,
    to_branch_id bigint NOT NULL,
    transfer_no text NOT NULL,
    notes text,
    dispatched_at timestamp with time zone,
    received_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT transfer_branches_differ CHECK ((branch_id <> to_branch_id))
);

--
-- Name: stock_transfer_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_transfer ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.stock_transfer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: stock_transfer_line; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.stock_transfer_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    stock_transfer_id bigint NOT NULL,
    part_id bigint NOT NULL,
    part_no text NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) NOT NULL,
    unit_cost numeric(14,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT transfer_line_qty CHECK ((quantity > (0)::numeric))
);

--
-- Name: stock_transfer_line_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_transfer_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.stock_transfer_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: supplier; Type: TABLE; Schema: parts; Owner: -
--

CREATE TABLE parts.supplier (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    ntn text,
    address text,
    payment_terms_days integer DEFAULT 30 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: supplier_id_seq; Type: SEQUENCE; Schema: parts; Owner: -
--

ALTER TABLE parts.supplier ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME parts.supplier_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: delivery; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.delivery (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    delivery_no text NOT NULL,
    sales_order_id bigint NOT NULL,
    vehicle_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    salesperson_id bigint NOT NULL,
    scheduled_date date NOT NULL,
    delivered_on date,
    delivered_at timestamp with time zone,
    delivered_by_id bigint,
    odometer_km integer,
    documents_handed_over text[] DEFAULT '{}'::text[] NOT NULL,
    accessories_handed_over text[] DEFAULT '{}'::text[] NOT NULL,
    customer_acknowledged boolean DEFAULT false NOT NULL,
    customer_acknowledged_at timestamp with time zone,
    notes text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT delivery_odometer CHECK (((odometer_km IS NULL) OR ((odometer_km >= 0) AND (odometer_km <= 100000))))
);

--
-- Name: delivery_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.delivery ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.delivery_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: document_template; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.document_template (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    kind text NOT NULL,
    company_name text NOT NULL,
    ref_prefix text,
    tagline text,
    address text,
    phone text,
    email text,
    delivery_notes text[] DEFAULT '{}'::text[] NOT NULL,
    delivery_station text,
    default_payment_mode text,
    default_validity_days integer DEFAULT 7 NOT NULL,
    default_delivery_days integer,
    highlight_line text,
    standard_equipment text,
    terms text[] DEFAULT '{}'::text[] NOT NULL,
    closing_lines text[] DEFAULT '{}'::text[] NOT NULL,
    sign_off text[] DEFAULT '{}'::text[] NOT NULL,
    title text,
    field_labels jsonb DEFAULT '{}'::jsonb NOT NULL,
    hidden_fields text[] DEFAULT '{}'::text[] NOT NULL,
    custom_fields text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: document_template_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.document_template ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.document_template_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: lead; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.lead (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    owner_id bigint NOT NULL,
    customer_id bigint,
    prospect_name text NOT NULL,
    prospect_mobile text NOT NULL,
    prospect_mobile_normalized text NOT NULL,
    email text,
    source text DEFAULT 'walk_in'::text NOT NULL,
    interested_model_id bigint,
    variant text,
    preferred_color text,
    expected_close_date date,
    notes text,
    payment_instrument text,
    payment_instrument_ref text,
    payment_instrument_bank text,
    payment_amount numeric(14,2),
    follow_up_count integer DEFAULT 0 NOT NULL,
    last_follow_up_at timestamp with time zone,
    escalated_at timestamp with time zone,
    escalated_by_id bigint,
    escalation_note text,
    converted_at timestamp with time zone,
    converted_by_id bigint,
    status text DEFAULT 'new'::text NOT NULL,
    sales_order_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT lead_follow_up_count CHECK ((follow_up_count >= 0))
);

--
-- Name: lead_follow_up; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.lead_follow_up (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    lead_id bigint NOT NULL,
    outcome text NOT NULL,
    remarks text,
    created_by_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: lead_follow_up_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.lead_follow_up ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.lead_follow_up_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: lead_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.lead ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.lead_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: ppf_form; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.ppf_form (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    form_no text NOT NULL,
    lead_id bigint NOT NULL,
    owner_id bigint NOT NULL,
    pbo_no text,
    chassis_no text,
    engine_no text,
    coverage text NOT NULL,
    coverage_details text,
    film_brand text,
    finish text DEFAULT 'gloss'::text NOT NULL,
    warranty_years integer,
    amount numeric(14,2) NOT NULL,
    discount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    advance_paid numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    installation_date date,
    notes text,
    extra_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT ppf_amounts CHECK (((amount >= (0)::numeric) AND (discount >= (0)::numeric) AND (discount <= amount) AND (advance_paid >= (0)::numeric) AND (advance_paid <= total_amount))),
    CONSTRAINT ppf_warranty CHECK (((warranty_years IS NULL) OR ((warranty_years >= 0) AND (warranty_years <= 15))))
);

--
-- Name: ppf_form_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.ppf_form ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.ppf_form_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: quotation; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.quotation (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    quotation_no text NOT NULL,
    lead_id bigint NOT NULL,
    owner_id bigint NOT NULL,
    model_id bigint NOT NULL,
    variant_code text,
    bill_to text,
    variant text,
    color text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    discount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    freight_insurance numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    withholding_tax numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    withholding_tax_non_filer numeric(14,2),
    total_amount numeric(14,2) NOT NULL,
    booking_amount numeric(14,2),
    valid_until date NOT NULL,
    delivery_days integer,
    payment_mode text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT quotation_amounts CHECK (((unit_price >= (0)::numeric) AND (discount >= (0)::numeric) AND (discount <= unit_price) AND (freight_insurance >= (0)::numeric) AND (withholding_tax >= (0)::numeric))),
    CONSTRAINT quotation_quantity CHECK (((quantity >= 1) AND (quantity <= 50)))
);

--
-- Name: quotation_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.quotation ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.quotation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: sales_order; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.sales_order (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    legal_entity_id bigint,
    accounting_entity_id bigint,
    order_no text NOT NULL,
    order_type text DEFAULT 'pbo'::text NOT NULL,
    lead_id bigint,
    customer_id bigint NOT NULL,
    salesperson_id bigint NOT NULL,
    model_id bigint NOT NULL,
    variant text,
    color text,
    unit_price numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    discount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    total_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    booking_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    expected_delivery_date date,
    vehicle_id bigint,
    financing_ref text,
    payment_reference text,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT sales_order_amounts CHECK (((unit_price >= (0)::numeric) AND (discount >= (0)::numeric) AND (discount <= unit_price) AND (booking_amount >= (0)::numeric)))
);

--
-- Name: sales_order_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.sales_order ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.sales_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: vehicle_variant; Type: TABLE; Schema: sales; Owner: -
--

CREATE TABLE sales.vehicle_variant (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    model_id bigint,
    code text NOT NULL,
    description text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: vehicle_variant_id_seq; Type: SEQUENCE; Schema: sales; Owner: -
--

ALTER TABLE sales.vehicle_variant ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME sales.vehicle_variant_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: estimate; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.estimate (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    estimate_no text NOT NULL,
    job_card_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    advisor_id bigint NOT NULL,
    total_amount numeric(14,2) DEFAULT '0'::numeric NOT NULL,
    valid_until date,
    notes text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: estimate_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.estimate ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.estimate_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: estimate_line; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.estimate_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    estimate_id bigint NOT NULL,
    kind text NOT NULL,
    description text NOT NULL,
    part_no text,
    quantity numeric(10,2) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    inspection_item_id bigint,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT estimate_line_amounts CHECK (((quantity > (0)::numeric) AND (unit_price >= (0)::numeric)))
);

--
-- Name: estimate_line_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.estimate_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.estimate_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: inspection; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.inspection (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    job_card_id bigint NOT NULL,
    inspector_id bigint NOT NULL,
    notes text,
    completed_at timestamp with time zone,
    status text DEFAULT 'in_progress'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: inspection_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.inspection ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.inspection_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: inspection_item; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.inspection_item (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    inspection_id bigint NOT NULL,
    area text NOT NULL,
    item text NOT NULL,
    condition text DEFAULT 'not_checked'::text NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL
);

--
-- Name: inspection_item_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.inspection_item ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.inspection_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: inspection_template_item; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.inspection_template_item (
    id bigint NOT NULL,
    area text NOT NULL,
    item text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: inspection_template_item_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.inspection_template_item ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.inspection_template_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: job_card; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.job_card (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    job_card_no text NOT NULL,
    visit_id bigint NOT NULL,
    vehicle_id bigint NOT NULL,
    advisor_id bigint NOT NULL,
    technician_id bigint,
    notes text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint
);

--
-- Name: job_card_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.job_card ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.job_card_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: job_card_line; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.job_card_line (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    job_card_id bigint NOT NULL,
    kind text NOT NULL,
    description text NOT NULL,
    part_no text,
    quantity numeric(10,2) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    billable boolean DEFAULT true NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    estimate_line_id bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    done_by_id bigint,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_card_line_amounts CHECK (((quantity > (0)::numeric) AND (unit_price >= (0)::numeric)))
);

--
-- Name: job_card_line_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.job_card_line ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.job_card_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: schedule_item; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.schedule_item (
    id bigint NOT NULL,
    model_id bigint NOT NULL,
    sequence integer NOT NULL,
    name text NOT NULL,
    due_km integer NOT NULL,
    due_months integer NOT NULL,
    is_free boolean DEFAULT false NOT NULL,
    labour_hours numeric(10,2) DEFAULT '1'::numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT schedule_item_positive CHECK (((sequence > 0) AND (due_km >= 0) AND (due_months >= 0)))
);

--
-- Name: schedule_item_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.schedule_item ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.schedule_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: vehicle_schedule; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.vehicle_schedule (
    id bigint NOT NULL,
    vehicle_id bigint NOT NULL,
    schedule_item_id bigint,
    sequence integer NOT NULL,
    name text NOT NULL,
    due_km integer NOT NULL,
    due_date date NOT NULL,
    is_free boolean NOT NULL,
    labour_hours numeric(10,2) NOT NULL,
    status text DEFAULT 'due'::text NOT NULL,
    visit_id bigint,
    completed_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: vehicle_schedule_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.vehicle_schedule ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.vehicle_schedule_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: visit; Type: TABLE; Schema: service; Owner: -
--

CREATE TABLE service.visit (
    id bigint NOT NULL,
    dealership_id bigint NOT NULL,
    branch_id bigint,
    visit_no text NOT NULL,
    vehicle_id bigint NOT NULL,
    customer_id bigint NOT NULL,
    advisor_id bigint NOT NULL,
    visit_type text NOT NULL,
    service_number integer,
    schedule_entry_id bigint,
    visit_sequence integer NOT NULL,
    odometer_km integer NOT NULL,
    arrived_at timestamp with time zone DEFAULT now() NOT NULL,
    promised_at timestamp with time zone,
    complaints text,
    warranty_valid boolean NOT NULL,
    free_service boolean NOT NULL,
    delivered_at timestamp with time zone,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_id bigint,
    updated_by_id bigint,
    CONSTRAINT visit_odometer CHECK ((odometer_km >= 0))
);

--
-- Name: visit_id_seq; Type: SEQUENCE; Schema: service; Owner: -
--

ALTER TABLE service.visit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME service.visit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

--
-- Name: account account_dealershipId_code_unique; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.account
    ADD CONSTRAINT "account_dealershipId_code_unique" UNIQUE (dealership_id, code);

--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);

--
-- Name: invoice invoice_invoiceNo_unique; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT "invoice_invoiceNo_unique" UNIQUE (invoice_no);

--
-- Name: invoice_line invoice_line_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice_line
    ADD CONSTRAINT invoice_line_pkey PRIMARY KEY (id);

--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_pkey PRIMARY KEY (id);

--
-- Name: journal_entry journal_entry_entryNo_unique; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT "journal_entry_entryNo_unique" UNIQUE (entry_no);

--
-- Name: journal_entry journal_entry_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT journal_entry_pkey PRIMARY KEY (id);

--
-- Name: journal_line journal_line_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_line
    ADD CONSTRAINT journal_line_pkey PRIMARY KEY (id);

--
-- Name: payment_allocation payment_allocation_paymentId_invoiceId_unique; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment_allocation
    ADD CONSTRAINT "payment_allocation_paymentId_invoiceId_unique" UNIQUE (payment_id, invoice_id);

--
-- Name: payment_allocation payment_allocation_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment_allocation
    ADD CONSTRAINT payment_allocation_pkey PRIMARY KEY (id);

--
-- Name: payment payment_paymentNo_unique; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT "payment_paymentNo_unique" UNIQUE (payment_no);

--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

--
-- Name: accounting_entity accounting_entity_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.accounting_entity
    ADD CONSTRAINT accounting_entity_pkey PRIMARY KEY (id);

--
-- Name: branch branch_dealershipId_code_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.branch
    ADD CONSTRAINT "branch_dealershipId_code_unique" UNIQUE (dealership_id, code);

--
-- Name: branch branch_id_dealership_uq; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.branch
    ADD CONSTRAINT branch_id_dealership_uq UNIQUE (id, dealership_id);

--
-- Name: branch branch_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.branch
    ADD CONSTRAINT branch_pkey PRIMARY KEY (id);

--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (id);

--
-- Name: dealership dealership_code_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.dealership
    ADD CONSTRAINT dealership_code_unique UNIQUE (code);

--
-- Name: dealership dealership_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.dealership
    ADD CONSTRAINT dealership_pkey PRIMARY KEY (id);

--
-- Name: document_sequence document_sequence_dealership_id_doc_type_year_pk; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.document_sequence
    ADD CONSTRAINT document_sequence_dealership_id_doc_type_year_pk PRIMARY KEY (dealership_id, doc_type, year);

--
-- Name: domain_event domain_event_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.domain_event
    ADD CONSTRAINT domain_event_pkey PRIMARY KEY (id);

--
-- Name: legal_entity legal_entity_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.legal_entity
    ADD CONSTRAINT legal_entity_pkey PRIMARY KEY (id);

--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);

--
-- Name: permission permission_code_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.permission
    ADD CONSTRAINT permission_code_unique UNIQUE (code);

--
-- Name: permission permission_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.permission
    ADD CONSTRAINT permission_pkey PRIMARY KEY (id);

--
-- Name: refresh_token refresh_token_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.refresh_token
    ADD CONSTRAINT refresh_token_pkey PRIMARY KEY (id);

--
-- Name: refresh_token refresh_token_tokenHash_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.refresh_token
    ADD CONSTRAINT "refresh_token_tokenHash_unique" UNIQUE (token_hash);

--
-- Name: role role_name_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role
    ADD CONSTRAINT role_name_unique UNIQUE (name);

--
-- Name: role_permission role_permission_role_id_permission_id_pk; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_permission
    ADD CONSTRAINT role_permission_role_id_permission_id_pk PRIMARY KEY (role_id, permission_id);

--
-- Name: role role_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role
    ADD CONSTRAINT role_pkey PRIMARY KEY (id);

--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);

--
-- Name: user_role user_role_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_pkey PRIMARY KEY (id);

--
-- Name: vehicle_dealership vehicle_dealership_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_dealership
    ADD CONSTRAINT vehicle_dealership_pkey PRIMARY KEY (id);

--
-- Name: vehicle_dealership vehicle_dealership_vehicleId_dealershipId_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_dealership
    ADD CONSTRAINT "vehicle_dealership_vehicleId_dealershipId_unique" UNIQUE (vehicle_id, dealership_id);

--
-- Name: vehicle_model vehicle_model_brand_name_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_model
    ADD CONSTRAINT vehicle_model_brand_name_unique UNIQUE (brand, name);

--
-- Name: vehicle_model vehicle_model_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_model
    ADD CONSTRAINT vehicle_model_pkey PRIMARY KEY (id);

--
-- Name: vehicle_ownership vehicle_ownership_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_ownership
    ADD CONSTRAINT vehicle_ownership_pkey PRIMARY KEY (id);

--
-- Name: vehicle vehicle_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle
    ADD CONSTRAINT vehicle_pkey PRIMARY KEY (id);

--
-- Name: workflow_transition workflow_transition_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.workflow_transition
    ADD CONSTRAINT workflow_transition_pkey PRIMARY KEY (id);

--
-- Name: goods_receipt goods_receipt_grnNo_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT "goods_receipt_grnNo_unique" UNIQUE (grn_no);

--
-- Name: goods_receipt_line goods_receipt_line_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt_line
    ADD CONSTRAINT goods_receipt_line_pkey PRIMARY KEY (id);

--
-- Name: goods_receipt goods_receipt_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT goods_receipt_pkey PRIMARY KEY (id);

--
-- Name: inventory_transaction inventory_transaction_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.inventory_transaction
    ADD CONSTRAINT inventory_transaction_pkey PRIMARY KEY (id);

--
-- Name: part part_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.part
    ADD CONSTRAINT part_pkey PRIMARY KEY (id);

--
-- Name: parts_request_line parts_request_line_partsRequestId_partId_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request_line
    ADD CONSTRAINT "parts_request_line_partsRequestId_partId_unique" UNIQUE (parts_request_id, part_id);

--
-- Name: parts_request_line parts_request_line_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request_line
    ADD CONSTRAINT parts_request_line_pkey PRIMARY KEY (id);

--
-- Name: parts_request parts_request_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_pkey PRIMARY KEY (id);

--
-- Name: parts_request parts_request_requestNo_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT "parts_request_requestNo_unique" UNIQUE (request_no);

--
-- Name: purchase_order_line purchase_order_line_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order_line
    ADD CONSTRAINT purchase_order_line_pkey PRIMARY KEY (id);

--
-- Name: purchase_order_line purchase_order_line_purchaseOrderId_partId_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order_line
    ADD CONSTRAINT "purchase_order_line_purchaseOrderId_partId_unique" UNIQUE (purchase_order_id, part_id);

--
-- Name: purchase_order purchase_order_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_pkey PRIMARY KEY (id);

--
-- Name: purchase_order purchase_order_poNo_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT "purchase_order_poNo_unique" UNIQUE (po_no);

--
-- Name: stock_adjustment stock_adjustment_adjustmentNo_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment
    ADD CONSTRAINT "stock_adjustment_adjustmentNo_unique" UNIQUE (adjustment_no);

--
-- Name: stock_adjustment_line stock_adjustment_line_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment_line
    ADD CONSTRAINT stock_adjustment_line_pkey PRIMARY KEY (id);

--
-- Name: stock_adjustment_line stock_adjustment_line_stockAdjustmentId_partId_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment_line
    ADD CONSTRAINT "stock_adjustment_line_stockAdjustmentId_partId_unique" UNIQUE (stock_adjustment_id, part_id);

--
-- Name: stock_adjustment stock_adjustment_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment
    ADD CONSTRAINT stock_adjustment_pkey PRIMARY KEY (id);

--
-- Name: stock_item stock_item_branchId_partId_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_item
    ADD CONSTRAINT "stock_item_branchId_partId_unique" UNIQUE (branch_id, part_id);

--
-- Name: stock_item stock_item_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_item
    ADD CONSTRAINT stock_item_pkey PRIMARY KEY (id);

--
-- Name: stock_transfer_line stock_transfer_line_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer_line
    ADD CONSTRAINT stock_transfer_line_pkey PRIMARY KEY (id);

--
-- Name: stock_transfer_line stock_transfer_line_stockTransferId_partId_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer_line
    ADD CONSTRAINT "stock_transfer_line_stockTransferId_partId_unique" UNIQUE (stock_transfer_id, part_id);

--
-- Name: stock_transfer stock_transfer_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT stock_transfer_pkey PRIMARY KEY (id);

--
-- Name: stock_transfer stock_transfer_transferNo_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT "stock_transfer_transferNo_unique" UNIQUE (transfer_no);

--
-- Name: supplier supplier_dealershipId_code_unique; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.supplier
    ADD CONSTRAINT "supplier_dealershipId_code_unique" UNIQUE (dealership_id, code);

--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (id);

--
-- Name: delivery delivery_deliveryNo_unique; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT "delivery_deliveryNo_unique" UNIQUE (delivery_no);

--
-- Name: delivery delivery_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_pkey PRIMARY KEY (id);

--
-- Name: document_template document_template_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.document_template
    ADD CONSTRAINT document_template_pkey PRIMARY KEY (id);

--
-- Name: lead_follow_up lead_follow_up_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead_follow_up
    ADD CONSTRAINT lead_follow_up_pkey PRIMARY KEY (id);

--
-- Name: lead lead_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_pkey PRIMARY KEY (id);

--
-- Name: ppf_form ppf_form_formNo_unique; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT "ppf_form_formNo_unique" UNIQUE (form_no);

--
-- Name: ppf_form ppf_form_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_pkey PRIMARY KEY (id);

--
-- Name: quotation quotation_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_pkey PRIMARY KEY (id);

--
-- Name: quotation quotation_quotationNo_unique; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT "quotation_quotationNo_unique" UNIQUE (quotation_no);

--
-- Name: sales_order sales_order_orderNo_unique; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT "sales_order_orderNo_unique" UNIQUE (order_no);

--
-- Name: sales_order sales_order_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_pkey PRIMARY KEY (id);

--
-- Name: vehicle_variant vehicle_variant_pkey; Type: CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.vehicle_variant
    ADD CONSTRAINT vehicle_variant_pkey PRIMARY KEY (id);

--
-- Name: estimate estimate_estimateNo_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT "estimate_estimateNo_unique" UNIQUE (estimate_no);

--
-- Name: estimate_line estimate_line_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate_line
    ADD CONSTRAINT estimate_line_pkey PRIMARY KEY (id);

--
-- Name: estimate estimate_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_pkey PRIMARY KEY (id);

--
-- Name: inspection_item inspection_item_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_item
    ADD CONSTRAINT inspection_item_pkey PRIMARY KEY (id);

--
-- Name: inspection inspection_jobCardId_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT "inspection_jobCardId_unique" UNIQUE (job_card_id);

--
-- Name: inspection inspection_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_pkey PRIMARY KEY (id);

--
-- Name: inspection_template_item inspection_template_item_area_item_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_template_item
    ADD CONSTRAINT inspection_template_item_area_item_unique UNIQUE (area, item);

--
-- Name: inspection_template_item inspection_template_item_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_template_item
    ADD CONSTRAINT inspection_template_item_pkey PRIMARY KEY (id);

--
-- Name: job_card job_card_jobCardNo_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT "job_card_jobCardNo_unique" UNIQUE (job_card_no);

--
-- Name: job_card_line job_card_line_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card_line
    ADD CONSTRAINT job_card_line_pkey PRIMARY KEY (id);

--
-- Name: job_card job_card_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_pkey PRIMARY KEY (id);

--
-- Name: job_card job_card_visitId_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT "job_card_visitId_unique" UNIQUE (visit_id);

--
-- Name: schedule_item schedule_item_modelId_sequence_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.schedule_item
    ADD CONSTRAINT "schedule_item_modelId_sequence_unique" UNIQUE (model_id, sequence);

--
-- Name: schedule_item schedule_item_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.schedule_item
    ADD CONSTRAINT schedule_item_pkey PRIMARY KEY (id);

--
-- Name: vehicle_schedule vehicle_schedule_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.vehicle_schedule
    ADD CONSTRAINT vehicle_schedule_pkey PRIMARY KEY (id);

--
-- Name: vehicle_schedule vehicle_schedule_vehicleId_sequence_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.vehicle_schedule
    ADD CONSTRAINT "vehicle_schedule_vehicleId_sequence_unique" UNIQUE (vehicle_id, sequence);

--
-- Name: visit visit_pkey; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_pkey PRIMARY KEY (id);

--
-- Name: visit visit_visitNo_unique; Type: CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT "visit_visitNo_unique" UNIQUE (visit_no);

--
-- Name: account_created_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX account_created_by_id_index ON accounts.account USING btree (created_by_id);

--
-- Name: account_dealership_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX account_dealership_id_index ON accounts.account USING btree (dealership_id);

--
-- Name: account_role_uq; Type: INDEX; Schema: accounts; Owner: -
--

CREATE UNIQUE INDEX account_role_uq ON accounts.account USING btree (dealership_id, role) WHERE (role IS NOT NULL);

--
-- Name: account_updated_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX account_updated_by_id_index ON accounts.account USING btree (updated_by_id);

--
-- Name: invoice_accounting_entity_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_accounting_entity_id_index ON accounts.invoice USING btree (accounting_entity_id);

--
-- Name: invoice_branch_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_branch_id_index ON accounts.invoice USING btree (branch_id);

--
-- Name: invoice_created_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_created_by_id_index ON accounts.invoice USING btree (created_by_id);

--
-- Name: invoice_customer_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_customer_id_index ON accounts.invoice USING btree (customer_id);

--
-- Name: invoice_dealership_id_status_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_dealership_id_status_index ON accounts.invoice USING btree (dealership_id, status);

--
-- Name: invoice_due_date_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_due_date_index ON accounts.invoice USING btree (due_date);

--
-- Name: invoice_journal_entry_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_journal_entry_id_index ON accounts.invoice USING btree (journal_entry_id);

--
-- Name: invoice_legal_entity_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_legal_entity_id_index ON accounts.invoice USING btree (legal_entity_id);

--
-- Name: invoice_line_dealership_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_line_dealership_id_index ON accounts.invoice_line USING btree (dealership_id);

--
-- Name: invoice_line_invoice_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_line_invoice_id_index ON accounts.invoice_line USING btree (invoice_id);

--
-- Name: invoice_source_live_uq; Type: INDEX; Schema: accounts; Owner: -
--

CREATE UNIQUE INDEX invoice_source_live_uq ON accounts.invoice USING btree (source_type, source_id) WHERE (status <> ALL (ARRAY['void'::text, 'cancelled'::text]));

--
-- Name: invoice_updated_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX invoice_updated_by_id_index ON accounts.invoice USING btree (updated_by_id);

--
-- Name: journal_entry_accounting_entity_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_entry_accounting_entity_id_index ON accounts.journal_entry USING btree (accounting_entity_id);

--
-- Name: journal_entry_branch_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_entry_branch_id_index ON accounts.journal_entry USING btree (branch_id);

--
-- Name: journal_entry_dealership_id_entry_date_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_entry_dealership_id_entry_date_index ON accounts.journal_entry USING btree (dealership_id, entry_date);

--
-- Name: journal_entry_legal_entity_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_entry_legal_entity_id_index ON accounts.journal_entry USING btree (legal_entity_id);

--
-- Name: journal_entry_posted_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_entry_posted_by_id_index ON accounts.journal_entry USING btree (posted_by_id);

--
-- Name: journal_entry_reversal_uq; Type: INDEX; Schema: accounts; Owner: -
--

CREATE UNIQUE INDEX journal_entry_reversal_uq ON accounts.journal_entry USING btree (reversal_of_id) WHERE (reversal_of_id IS NOT NULL);

--
-- Name: journal_entry_source_type_source_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_entry_source_type_source_id_index ON accounts.journal_entry USING btree (source_type, source_id);

--
-- Name: journal_line_account_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_line_account_id_index ON accounts.journal_line USING btree (account_id);

--
-- Name: journal_line_customer_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_line_customer_id_index ON accounts.journal_line USING btree (customer_id);

--
-- Name: journal_line_dealership_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_line_dealership_id_index ON accounts.journal_line USING btree (dealership_id);

--
-- Name: journal_line_journal_entry_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_line_journal_entry_id_index ON accounts.journal_line USING btree (journal_entry_id);

--
-- Name: journal_line_supplier_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX journal_line_supplier_id_index ON accounts.journal_line USING btree (supplier_id);

--
-- Name: payment_allocation_dealership_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_allocation_dealership_id_index ON accounts.payment_allocation USING btree (dealership_id);

--
-- Name: payment_allocation_invoice_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_allocation_invoice_id_index ON accounts.payment_allocation USING btree (invoice_id);

--
-- Name: payment_allocation_payment_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_allocation_payment_id_index ON accounts.payment_allocation USING btree (payment_id);

--
-- Name: payment_branch_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_branch_id_index ON accounts.payment USING btree (branch_id);

--
-- Name: payment_created_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_created_by_id_index ON accounts.payment USING btree (created_by_id);

--
-- Name: payment_customer_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_customer_id_index ON accounts.payment USING btree (customer_id);

--
-- Name: payment_dealership_id_payment_date_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_dealership_id_payment_date_index ON accounts.payment USING btree (dealership_id, payment_date);

--
-- Name: payment_journal_entry_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_journal_entry_id_index ON accounts.payment USING btree (journal_entry_id);

--
-- Name: payment_supplier_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_supplier_id_index ON accounts.payment USING btree (supplier_id);

--
-- Name: payment_updated_by_id_index; Type: INDEX; Schema: accounts; Owner: -
--

CREATE INDEX payment_updated_by_id_index ON accounts.payment USING btree (updated_by_id);

--
-- Name: audit_log_actor_id_index; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_actor_id_index ON audit.audit_log USING btree (actor_id);

--
-- Name: audit_log_branch_id_index; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_branch_id_index ON audit.audit_log USING btree (branch_id);

--
-- Name: audit_log_dealership_id_occurred_at_index; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_dealership_id_occurred_at_index ON audit.audit_log USING btree (dealership_id, occurred_at);

--
-- Name: audit_log_entity_type_entity_id_index; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_entity_type_entity_id_index ON audit.audit_log USING btree (entity_type, entity_id);

--
-- Name: audit_log_occurred_at_index; Type: INDEX; Schema: audit; Owner: -
--

CREATE INDEX audit_log_occurred_at_index ON audit.audit_log USING btree (occurred_at);

--
-- Name: accounting_entity_legal_entity_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX accounting_entity_legal_entity_id_index ON core.accounting_entity USING btree (legal_entity_id);

--
-- Name: branch_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX branch_created_by_id_index ON core.branch USING btree (created_by_id);

--
-- Name: branch_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX branch_dealership_id_index ON core.branch USING btree (dealership_id);

--
-- Name: branch_updated_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX branch_updated_by_id_index ON core.branch USING btree (updated_by_id);

--
-- Name: customer_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX customer_created_by_id_index ON core.customer USING btree (created_by_id);

--
-- Name: customer_dealership_cnic_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX customer_dealership_cnic_uq ON core.customer USING btree (dealership_id, cnic) WHERE (cnic IS NOT NULL);

--
-- Name: customer_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX customer_dealership_id_index ON core.customer USING btree (dealership_id);

--
-- Name: customer_dealership_mobile_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX customer_dealership_mobile_uq ON core.customer USING btree (dealership_id, mobile_normalized);

--
-- Name: customer_mobile_trgm; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX customer_mobile_trgm ON core.customer USING gin (mobile_normalized public.gin_trgm_ops);

--
-- Name: customer_name_trgm; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX customer_name_trgm ON core.customer USING gin (full_name public.gin_trgm_ops);

--
-- Name: customer_updated_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX customer_updated_by_id_index ON core.customer USING btree (updated_by_id);

--
-- Name: dealership_accounting_entity_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX dealership_accounting_entity_id_index ON core.dealership USING btree (accounting_entity_id);

--
-- Name: dealership_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX dealership_created_by_id_index ON core.dealership USING btree (created_by_id);

--
-- Name: dealership_legal_entity_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX dealership_legal_entity_id_index ON core.dealership USING btree (legal_entity_id);

--
-- Name: dealership_updated_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX dealership_updated_by_id_index ON core.dealership USING btree (updated_by_id);

--
-- Name: domain_event_actor_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX domain_event_actor_id_index ON core.domain_event USING btree (actor_id);

--
-- Name: domain_event_aggregate_type_aggregate_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX domain_event_aggregate_type_aggregate_id_index ON core.domain_event USING btree (aggregate_type, aggregate_id);

--
-- Name: domain_event_dealership_id_occurred_at_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX domain_event_dealership_id_occurred_at_index ON core.domain_event USING btree (dealership_id, occurred_at);

--
-- Name: domain_event_type_occurred_at_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX domain_event_type_occurred_at_index ON core.domain_event USING btree (type, occurred_at);

--
-- Name: notification_actor_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_actor_id_index ON core.notification USING btree (actor_id);

--
-- Name: notification_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_dealership_id_index ON core.notification USING btree (dealership_id);

--
-- Name: notification_unread_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_unread_idx ON core.notification USING btree (user_id) WHERE (read_at IS NULL);

--
-- Name: notification_user_id_created_at_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notification_user_id_created_at_index ON core.notification USING btree (user_id, created_at);

--
-- Name: permission_module_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX permission_module_index ON core.permission USING btree (module);

--
-- Name: refresh_token_user_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX refresh_token_user_id_index ON core.refresh_token USING btree (user_id);

--
-- Name: role_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX role_created_by_id_index ON core.role USING btree (created_by_id);

--
-- Name: role_permission_permission_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX role_permission_permission_id_index ON core.role_permission USING btree (permission_id);

--
-- Name: role_updated_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX role_updated_by_id_index ON core.role USING btree (updated_by_id);

--
-- Name: user_email_lower_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX user_email_lower_uq ON core."user" USING btree (lower(email));

--
-- Name: user_role_branch_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_role_branch_id_index ON core.user_role USING btree (branch_id);

--
-- Name: user_role_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_role_created_by_id_index ON core.user_role USING btree (created_by_id);

--
-- Name: user_role_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_role_dealership_id_index ON core.user_role USING btree (dealership_id);

--
-- Name: user_role_role_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_role_role_id_index ON core.user_role USING btree (role_id);

--
-- Name: user_role_scope_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX user_role_scope_uq ON core.user_role USING btree (user_id, role_id, COALESCE(dealership_id, (0)::bigint), COALESCE(branch_id, (0)::bigint));

--
-- Name: user_role_user_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX user_role_user_id_index ON core.user_role USING btree (user_id);

--
-- Name: vehicle_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_created_by_id_index ON core.vehicle USING btree (created_by_id);

--
-- Name: vehicle_dealership_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_dealership_created_by_id_index ON core.vehicle_dealership USING btree (created_by_id);

--
-- Name: vehicle_dealership_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_dealership_dealership_id_index ON core.vehicle_dealership USING btree (dealership_id);

--
-- Name: vehicle_engine_trgm; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_engine_trgm ON core.vehicle USING gin (engine_no public.gin_trgm_ops);

--
-- Name: vehicle_engine_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX vehicle_engine_uq ON core.vehicle USING btree (engine_no) WHERE (engine_no IS NOT NULL);

--
-- Name: vehicle_model_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_model_created_by_id_index ON core.vehicle_model USING btree (created_by_id);

--
-- Name: vehicle_model_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_model_id_index ON core.vehicle USING btree (model_id);

--
-- Name: vehicle_model_updated_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_model_updated_by_id_index ON core.vehicle_model USING btree (updated_by_id);

--
-- Name: vehicle_ownership_created_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_ownership_created_by_id_index ON core.vehicle_ownership USING btree (created_by_id);

--
-- Name: vehicle_ownership_current_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX vehicle_ownership_current_uq ON core.vehicle_ownership USING btree (vehicle_id, dealership_id) WHERE (end_date IS NULL);

--
-- Name: vehicle_ownership_customer_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_ownership_customer_id_index ON core.vehicle_ownership USING btree (customer_id);

--
-- Name: vehicle_ownership_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_ownership_dealership_id_index ON core.vehicle_ownership USING btree (dealership_id);

--
-- Name: vehicle_ownership_ended_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_ownership_ended_by_id_index ON core.vehicle_ownership USING btree (ended_by_id);

--
-- Name: vehicle_ownership_vehicle_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_ownership_vehicle_id_index ON core.vehicle_ownership USING btree (vehicle_id);

--
-- Name: vehicle_registration_trgm; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_registration_trgm ON core.vehicle USING gin (registration_no public.gin_trgm_ops);

--
-- Name: vehicle_registration_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX vehicle_registration_uq ON core.vehicle USING btree (registration_no) WHERE (registration_no IS NOT NULL);

--
-- Name: vehicle_sold_by_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_sold_by_dealership_id_index ON core.vehicle USING btree (sold_by_dealership_id);

--
-- Name: vehicle_status_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_status_index ON core.vehicle USING btree (status);

--
-- Name: vehicle_updated_by_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_updated_by_id_index ON core.vehicle USING btree (updated_by_id);

--
-- Name: vehicle_vin_trgm; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vehicle_vin_trgm ON core.vehicle USING gin (vin public.gin_trgm_ops);

--
-- Name: vehicle_vin_uq; Type: INDEX; Schema: core; Owner: -
--

CREATE UNIQUE INDEX vehicle_vin_uq ON core.vehicle USING btree (vin) WHERE (vin IS NOT NULL);

--
-- Name: workflow_transition_actor_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX workflow_transition_actor_id_index ON core.workflow_transition USING btree (actor_id);

--
-- Name: workflow_transition_dealership_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX workflow_transition_dealership_id_index ON core.workflow_transition USING btree (dealership_id);

--
-- Name: workflow_transition_entity_type_entity_id_index; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX workflow_transition_entity_type_entity_id_index ON core.workflow_transition USING btree (entity_type, entity_id);

--
-- Name: goods_receipt_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_branch_id_index ON parts.goods_receipt USING btree (branch_id);

--
-- Name: goods_receipt_dealership_id_received_date_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_dealership_id_received_date_index ON parts.goods_receipt USING btree (dealership_id, received_date);

--
-- Name: goods_receipt_line_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_line_dealership_id_index ON parts.goods_receipt_line USING btree (dealership_id);

--
-- Name: goods_receipt_line_goods_receipt_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_line_goods_receipt_id_index ON parts.goods_receipt_line USING btree (goods_receipt_id);

--
-- Name: goods_receipt_line_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_line_part_id_index ON parts.goods_receipt_line USING btree (part_id);

--
-- Name: goods_receipt_line_purchase_order_line_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_line_purchase_order_line_id_index ON parts.goods_receipt_line USING btree (purchase_order_line_id);

--
-- Name: goods_receipt_purchase_order_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_purchase_order_id_index ON parts.goods_receipt USING btree (purchase_order_id);

--
-- Name: goods_receipt_received_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_received_by_id_index ON parts.goods_receipt USING btree (received_by_id);

--
-- Name: goods_receipt_supplier_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX goods_receipt_supplier_id_index ON parts.goods_receipt USING btree (supplier_id);

--
-- Name: inventory_transaction_actor_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX inventory_transaction_actor_id_index ON parts.inventory_transaction USING btree (actor_id);

--
-- Name: inventory_transaction_branch_id_part_id_occurred_at_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX inventory_transaction_branch_id_part_id_occurred_at_index ON parts.inventory_transaction USING btree (branch_id, part_id, occurred_at);

--
-- Name: inventory_transaction_dealership_id_occurred_at_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX inventory_transaction_dealership_id_occurred_at_index ON parts.inventory_transaction USING btree (dealership_id, occurred_at);

--
-- Name: inventory_transaction_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX inventory_transaction_part_id_index ON parts.inventory_transaction USING btree (part_id);

--
-- Name: inventory_transaction_reference_type_reference_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX inventory_transaction_reference_type_reference_id_index ON parts.inventory_transaction USING btree (reference_type, reference_id);

--
-- Name: part_created_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX part_created_by_id_index ON parts.part USING btree (created_by_id);

--
-- Name: part_description_trgm; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX part_description_trgm ON parts.part USING gin (description public.gin_trgm_ops);

--
-- Name: part_no_trgm; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX part_no_trgm ON parts.part USING gin (part_no public.gin_trgm_ops);

--
-- Name: part_no_uq; Type: INDEX; Schema: parts; Owner: -
--

CREATE UNIQUE INDEX part_no_uq ON parts.part USING btree (part_no);

--
-- Name: part_updated_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX part_updated_by_id_index ON parts.part USING btree (updated_by_id);

--
-- Name: parts_request_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_branch_id_index ON parts.parts_request USING btree (branch_id);

--
-- Name: parts_request_created_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_created_by_id_index ON parts.parts_request USING btree (created_by_id);

--
-- Name: parts_request_dealership_id_status_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_dealership_id_status_index ON parts.parts_request USING btree (dealership_id, status);

--
-- Name: parts_request_job_card_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_job_card_id_index ON parts.parts_request USING btree (job_card_id);

--
-- Name: parts_request_line_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_line_dealership_id_index ON parts.parts_request_line USING btree (dealership_id);

--
-- Name: parts_request_line_job_card_line_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_line_job_card_line_id_index ON parts.parts_request_line USING btree (job_card_line_id);

--
-- Name: parts_request_line_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_line_part_id_index ON parts.parts_request_line USING btree (part_id);

--
-- Name: parts_request_line_parts_request_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_line_parts_request_id_index ON parts.parts_request_line USING btree (parts_request_id);

--
-- Name: parts_request_requested_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_requested_by_id_index ON parts.parts_request USING btree (requested_by_id);

--
-- Name: parts_request_updated_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX parts_request_updated_by_id_index ON parts.parts_request USING btree (updated_by_id);

--
-- Name: purchase_order_accounting_entity_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_accounting_entity_id_index ON parts.purchase_order USING btree (accounting_entity_id);

--
-- Name: purchase_order_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_branch_id_index ON parts.purchase_order USING btree (branch_id);

--
-- Name: purchase_order_created_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_created_by_id_index ON parts.purchase_order USING btree (created_by_id);

--
-- Name: purchase_order_dealership_id_status_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_dealership_id_status_index ON parts.purchase_order USING btree (dealership_id, status);

--
-- Name: purchase_order_legal_entity_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_legal_entity_id_index ON parts.purchase_order USING btree (legal_entity_id);

--
-- Name: purchase_order_line_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_line_dealership_id_index ON parts.purchase_order_line USING btree (dealership_id);

--
-- Name: purchase_order_line_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_line_part_id_index ON parts.purchase_order_line USING btree (part_id);

--
-- Name: purchase_order_line_purchase_order_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_line_purchase_order_id_index ON parts.purchase_order_line USING btree (purchase_order_id);

--
-- Name: purchase_order_supplier_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_supplier_id_index ON parts.purchase_order USING btree (supplier_id);

--
-- Name: purchase_order_updated_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX purchase_order_updated_by_id_index ON parts.purchase_order USING btree (updated_by_id);

--
-- Name: stock_adjustment_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_branch_id_index ON parts.stock_adjustment USING btree (branch_id);

--
-- Name: stock_adjustment_created_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_created_by_id_index ON parts.stock_adjustment USING btree (created_by_id);

--
-- Name: stock_adjustment_dealership_id_status_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_dealership_id_status_index ON parts.stock_adjustment USING btree (dealership_id, status);

--
-- Name: stock_adjustment_line_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_line_dealership_id_index ON parts.stock_adjustment_line USING btree (dealership_id);

--
-- Name: stock_adjustment_line_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_line_part_id_index ON parts.stock_adjustment_line USING btree (part_id);

--
-- Name: stock_adjustment_line_stock_adjustment_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_line_stock_adjustment_id_index ON parts.stock_adjustment_line USING btree (stock_adjustment_id);

--
-- Name: stock_adjustment_updated_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_adjustment_updated_by_id_index ON parts.stock_adjustment USING btree (updated_by_id);

--
-- Name: stock_item_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_item_branch_id_index ON parts.stock_item USING btree (branch_id);

--
-- Name: stock_item_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_item_dealership_id_index ON parts.stock_item USING btree (dealership_id);

--
-- Name: stock_item_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_item_part_id_index ON parts.stock_item USING btree (part_id);

--
-- Name: stock_transfer_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_branch_id_index ON parts.stock_transfer USING btree (branch_id);

--
-- Name: stock_transfer_created_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_created_by_id_index ON parts.stock_transfer USING btree (created_by_id);

--
-- Name: stock_transfer_dealership_id_status_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_dealership_id_status_index ON parts.stock_transfer USING btree (dealership_id, status);

--
-- Name: stock_transfer_line_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_line_dealership_id_index ON parts.stock_transfer_line USING btree (dealership_id);

--
-- Name: stock_transfer_line_part_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_line_part_id_index ON parts.stock_transfer_line USING btree (part_id);

--
-- Name: stock_transfer_line_stock_transfer_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_line_stock_transfer_id_index ON parts.stock_transfer_line USING btree (stock_transfer_id);

--
-- Name: stock_transfer_to_branch_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_to_branch_id_index ON parts.stock_transfer USING btree (to_branch_id);

--
-- Name: stock_transfer_updated_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX stock_transfer_updated_by_id_index ON parts.stock_transfer USING btree (updated_by_id);

--
-- Name: supplier_created_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX supplier_created_by_id_index ON parts.supplier USING btree (created_by_id);

--
-- Name: supplier_dealership_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX supplier_dealership_id_index ON parts.supplier USING btree (dealership_id);

--
-- Name: supplier_name_trgm; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX supplier_name_trgm ON parts.supplier USING gin (name public.gin_trgm_ops);

--
-- Name: supplier_updated_by_id_index; Type: INDEX; Schema: parts; Owner: -
--

CREATE INDEX supplier_updated_by_id_index ON parts.supplier USING btree (updated_by_id);

--
-- Name: delivery_branch_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_branch_id_index ON sales.delivery USING btree (branch_id);

--
-- Name: delivery_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_created_by_id_index ON sales.delivery USING btree (created_by_id);

--
-- Name: delivery_customer_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_customer_id_index ON sales.delivery USING btree (customer_id);

--
-- Name: delivery_dealership_id_status_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_dealership_id_status_index ON sales.delivery USING btree (dealership_id, status);

--
-- Name: delivery_delivered_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_delivered_by_id_index ON sales.delivery USING btree (delivered_by_id);

--
-- Name: delivery_order_live_uq; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX delivery_order_live_uq ON sales.delivery USING btree (sales_order_id) WHERE (status <> 'cancelled'::text);

--
-- Name: delivery_salesperson_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_salesperson_id_index ON sales.delivery USING btree (salesperson_id);

--
-- Name: delivery_scheduled_date_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_scheduled_date_index ON sales.delivery USING btree (scheduled_date);

--
-- Name: delivery_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_updated_by_id_index ON sales.delivery USING btree (updated_by_id);

--
-- Name: delivery_vehicle_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX delivery_vehicle_id_index ON sales.delivery USING btree (vehicle_id);

--
-- Name: document_template_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX document_template_created_by_id_index ON sales.document_template USING btree (created_by_id);

--
-- Name: document_template_dealership_id_kind_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX document_template_dealership_id_kind_index ON sales.document_template USING btree (dealership_id, kind);

--
-- Name: document_template_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX document_template_updated_by_id_index ON sales.document_template USING btree (updated_by_id);

--
-- Name: lead_active_mobile_uq; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX lead_active_mobile_uq ON sales.lead USING btree (dealership_id, prospect_mobile_normalized) WHERE (status = ANY (ARRAY['new'::text, 'follow_up'::text, 'visited'::text, 'converted'::text, 'processing'::text]));

--
-- Name: lead_branch_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_branch_id_index ON sales.lead USING btree (branch_id);

--
-- Name: lead_converted_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_converted_by_id_index ON sales.lead USING btree (converted_by_id);

--
-- Name: lead_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_created_by_id_index ON sales.lead USING btree (created_by_id);

--
-- Name: lead_customer_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_customer_id_index ON sales.lead USING btree (customer_id);

--
-- Name: lead_dealership_id_prospect_mobile_normalized_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_dealership_id_prospect_mobile_normalized_index ON sales.lead USING btree (dealership_id, prospect_mobile_normalized);

--
-- Name: lead_dealership_id_status_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_dealership_id_status_index ON sales.lead USING btree (dealership_id, status);

--
-- Name: lead_dealership_id_updated_at_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_dealership_id_updated_at_index ON sales.lead USING btree (dealership_id, updated_at);

--
-- Name: lead_escalated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_escalated_by_id_index ON sales.lead USING btree (escalated_by_id);

--
-- Name: lead_follow_up_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_follow_up_created_by_id_index ON sales.lead_follow_up USING btree (created_by_id);

--
-- Name: lead_follow_up_dealership_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_follow_up_dealership_id_index ON sales.lead_follow_up USING btree (dealership_id);

--
-- Name: lead_follow_up_lead_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_follow_up_lead_id_index ON sales.lead_follow_up USING btree (lead_id);

--
-- Name: lead_interested_model_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_interested_model_id_index ON sales.lead USING btree (interested_model_id);

--
-- Name: lead_name_trgm; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_name_trgm ON sales.lead USING gin (prospect_name public.gin_trgm_ops);

--
-- Name: lead_owner_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_owner_id_index ON sales.lead USING btree (owner_id);

--
-- Name: lead_sales_order_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_sales_order_id_index ON sales.lead USING btree (sales_order_id);

--
-- Name: lead_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX lead_updated_by_id_index ON sales.lead USING btree (updated_by_id);

--
-- Name: ppf_form_branch_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX ppf_form_branch_id_index ON sales.ppf_form USING btree (branch_id);

--
-- Name: ppf_form_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX ppf_form_created_by_id_index ON sales.ppf_form USING btree (created_by_id);

--
-- Name: ppf_form_dealership_id_created_at_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX ppf_form_dealership_id_created_at_index ON sales.ppf_form USING btree (dealership_id, created_at);

--
-- Name: ppf_form_lead_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX ppf_form_lead_id_index ON sales.ppf_form USING btree (lead_id);

--
-- Name: ppf_form_owner_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX ppf_form_owner_id_index ON sales.ppf_form USING btree (owner_id);

--
-- Name: ppf_form_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX ppf_form_updated_by_id_index ON sales.ppf_form USING btree (updated_by_id);

--
-- Name: quotation_branch_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_branch_id_index ON sales.quotation USING btree (branch_id);

--
-- Name: quotation_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_created_by_id_index ON sales.quotation USING btree (created_by_id);

--
-- Name: quotation_dealership_id_created_at_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_dealership_id_created_at_index ON sales.quotation USING btree (dealership_id, created_at);

--
-- Name: quotation_lead_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_lead_id_index ON sales.quotation USING btree (lead_id);

--
-- Name: quotation_model_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_model_id_index ON sales.quotation USING btree (model_id);

--
-- Name: quotation_owner_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_owner_id_index ON sales.quotation USING btree (owner_id);

--
-- Name: quotation_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX quotation_updated_by_id_index ON sales.quotation USING btree (updated_by_id);

--
-- Name: sales_order_accounting_entity_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_accounting_entity_id_index ON sales.sales_order USING btree (accounting_entity_id);

--
-- Name: sales_order_branch_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_branch_id_index ON sales.sales_order USING btree (branch_id);

--
-- Name: sales_order_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_created_by_id_index ON sales.sales_order USING btree (created_by_id);

--
-- Name: sales_order_customer_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_customer_id_index ON sales.sales_order USING btree (customer_id);

--
-- Name: sales_order_dealership_id_status_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_dealership_id_status_index ON sales.sales_order USING btree (dealership_id, status);

--
-- Name: sales_order_lead_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_lead_id_index ON sales.sales_order USING btree (lead_id);

--
-- Name: sales_order_legal_entity_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_legal_entity_id_index ON sales.sales_order USING btree (legal_entity_id);

--
-- Name: sales_order_model_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_model_id_index ON sales.sales_order USING btree (model_id);

--
-- Name: sales_order_salesperson_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_salesperson_id_index ON sales.sales_order USING btree (salesperson_id);

--
-- Name: sales_order_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_updated_by_id_index ON sales.sales_order USING btree (updated_by_id);

--
-- Name: sales_order_vehicle_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX sales_order_vehicle_id_index ON sales.sales_order USING btree (vehicle_id);

--
-- Name: sales_order_vehicle_live_uq; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX sales_order_vehicle_live_uq ON sales.sales_order USING btree (vehicle_id) WHERE ((vehicle_id IS NOT NULL) AND (status <> 'cancelled'::text));

--
-- Name: vehicle_variant_created_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX vehicle_variant_created_by_id_index ON sales.vehicle_variant USING btree (created_by_id);

--
-- Name: vehicle_variant_dealership_id_code_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE UNIQUE INDEX vehicle_variant_dealership_id_code_index ON sales.vehicle_variant USING btree (dealership_id, code);

--
-- Name: vehicle_variant_model_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX vehicle_variant_model_id_index ON sales.vehicle_variant USING btree (model_id);

--
-- Name: vehicle_variant_updated_by_id_index; Type: INDEX; Schema: sales; Owner: -
--

CREATE INDEX vehicle_variant_updated_by_id_index ON sales.vehicle_variant USING btree (updated_by_id);

--
-- Name: estimate_advisor_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_advisor_id_index ON service.estimate USING btree (advisor_id);

--
-- Name: estimate_branch_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_branch_id_index ON service.estimate USING btree (branch_id);

--
-- Name: estimate_created_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_created_by_id_index ON service.estimate USING btree (created_by_id);

--
-- Name: estimate_customer_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_customer_id_index ON service.estimate USING btree (customer_id);

--
-- Name: estimate_dealership_id_status_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_dealership_id_status_index ON service.estimate USING btree (dealership_id, status);

--
-- Name: estimate_job_card_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_job_card_id_index ON service.estimate USING btree (job_card_id);

--
-- Name: estimate_line_dealership_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_line_dealership_id_index ON service.estimate_line USING btree (dealership_id);

--
-- Name: estimate_line_estimate_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_line_estimate_id_index ON service.estimate_line USING btree (estimate_id);

--
-- Name: estimate_line_inspection_item_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_line_inspection_item_id_index ON service.estimate_line USING btree (inspection_item_id);

--
-- Name: estimate_updated_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX estimate_updated_by_id_index ON service.estimate USING btree (updated_by_id);

--
-- Name: inspection_branch_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_branch_id_index ON service.inspection USING btree (branch_id);

--
-- Name: inspection_created_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_created_by_id_index ON service.inspection USING btree (created_by_id);

--
-- Name: inspection_dealership_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_dealership_id_index ON service.inspection USING btree (dealership_id);

--
-- Name: inspection_inspector_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_inspector_id_index ON service.inspection USING btree (inspector_id);

--
-- Name: inspection_item_dealership_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_item_dealership_id_index ON service.inspection_item USING btree (dealership_id);

--
-- Name: inspection_item_inspection_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_item_inspection_id_index ON service.inspection_item USING btree (inspection_id);

--
-- Name: inspection_template_item_created_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_template_item_created_by_id_index ON service.inspection_template_item USING btree (created_by_id);

--
-- Name: inspection_template_item_updated_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_template_item_updated_by_id_index ON service.inspection_template_item USING btree (updated_by_id);

--
-- Name: inspection_updated_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX inspection_updated_by_id_index ON service.inspection USING btree (updated_by_id);

--
-- Name: job_card_advisor_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_advisor_id_index ON service.job_card USING btree (advisor_id);

--
-- Name: job_card_branch_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_branch_id_index ON service.job_card USING btree (branch_id);

--
-- Name: job_card_created_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_created_by_id_index ON service.job_card USING btree (created_by_id);

--
-- Name: job_card_dealership_id_status_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_dealership_id_status_index ON service.job_card USING btree (dealership_id, status);

--
-- Name: job_card_line_dealership_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_line_dealership_id_index ON service.job_card_line USING btree (dealership_id);

--
-- Name: job_card_line_done_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_line_done_by_id_index ON service.job_card_line USING btree (done_by_id);

--
-- Name: job_card_line_estimate_line_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_line_estimate_line_id_index ON service.job_card_line USING btree (estimate_line_id);

--
-- Name: job_card_line_job_card_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_line_job_card_id_index ON service.job_card_line USING btree (job_card_id);

--
-- Name: job_card_technician_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_technician_id_index ON service.job_card USING btree (technician_id);

--
-- Name: job_card_updated_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_updated_by_id_index ON service.job_card USING btree (updated_by_id);

--
-- Name: job_card_vehicle_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX job_card_vehicle_id_index ON service.job_card USING btree (vehicle_id);

--
-- Name: schedule_item_created_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX schedule_item_created_by_id_index ON service.schedule_item USING btree (created_by_id);

--
-- Name: schedule_item_model_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX schedule_item_model_id_index ON service.schedule_item USING btree (model_id);

--
-- Name: schedule_item_updated_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX schedule_item_updated_by_id_index ON service.schedule_item USING btree (updated_by_id);

--
-- Name: vehicle_schedule_due_date_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX vehicle_schedule_due_date_index ON service.vehicle_schedule USING btree (due_date);

--
-- Name: vehicle_schedule_schedule_item_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX vehicle_schedule_schedule_item_id_index ON service.vehicle_schedule USING btree (schedule_item_id);

--
-- Name: vehicle_schedule_visit_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX vehicle_schedule_visit_id_index ON service.vehicle_schedule USING btree (visit_id);

--
-- Name: visit_advisor_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_advisor_id_index ON service.visit USING btree (advisor_id);

--
-- Name: visit_arrived_at_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_arrived_at_index ON service.visit USING btree (arrived_at);

--
-- Name: visit_branch_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_branch_id_index ON service.visit USING btree (branch_id);

--
-- Name: visit_created_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_created_by_id_index ON service.visit USING btree (created_by_id);

--
-- Name: visit_customer_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_customer_id_index ON service.visit USING btree (customer_id);

--
-- Name: visit_dealership_id_status_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_dealership_id_status_index ON service.visit USING btree (dealership_id, status);

--
-- Name: visit_schedule_entry_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_schedule_entry_id_index ON service.visit USING btree (schedule_entry_id);

--
-- Name: visit_schedule_entry_uq; Type: INDEX; Schema: service; Owner: -
--

CREATE UNIQUE INDEX visit_schedule_entry_uq ON service.visit USING btree (schedule_entry_id) WHERE ((schedule_entry_id IS NOT NULL) AND (status <> 'cancelled'::text));

--
-- Name: visit_updated_by_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_updated_by_id_index ON service.visit USING btree (updated_by_id);

--
-- Name: visit_vehicle_id_index; Type: INDEX; Schema: service; Owner: -
--

CREATE INDEX visit_vehicle_id_index ON service.visit USING btree (vehicle_id);

--
-- Name: visit_vehicle_live_uq; Type: INDEX; Schema: service; Owner: -
--

CREATE UNIQUE INDEX visit_vehicle_live_uq ON service.visit USING btree (vehicle_id) WHERE (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'ready'::text]));

--
-- Name: journal_entry append_only; Type: TRIGGER; Schema: accounts; Owner: -
--

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON accounts.journal_entry FOR EACH ROW EXECUTE FUNCTION core.forbid_mutation();

--
-- Name: journal_line append_only; Type: TRIGGER; Schema: accounts; Owner: -
--

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON accounts.journal_line FOR EACH ROW EXECUTE FUNCTION core.forbid_mutation();

--
-- Name: journal_entry journal_entry_balanced; Type: TRIGGER; Schema: accounts; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_entry_balanced AFTER INSERT ON accounts.journal_entry DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounts.journal_entry_balanced();

--
-- Name: journal_line journal_line_balanced; Type: TRIGGER; Schema: accounts; Owner: -
--

CREATE CONSTRAINT TRIGGER journal_line_balanced AFTER INSERT ON accounts.journal_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounts.journal_line_balanced();

--
-- Name: audit_log append_only; Type: TRIGGER; Schema: audit; Owner: -
--

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION core.forbid_mutation();

--
-- Name: domain_event append_only; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON core.domain_event FOR EACH ROW EXECUTE FUNCTION core.forbid_mutation();

--
-- Name: workflow_transition append_only; Type: TRIGGER; Schema: core; Owner: -
--

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON core.workflow_transition FOR EACH ROW EXECUTE FUNCTION core.forbid_mutation();

--
-- Name: inventory_transaction append_only; Type: TRIGGER; Schema: parts; Owner: -
--

CREATE TRIGGER append_only BEFORE DELETE OR UPDATE ON parts.inventory_transaction FOR EACH ROW EXECUTE FUNCTION core.forbid_mutation();

--
-- Name: account account_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.account
    ADD CONSTRAINT account_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: account account_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.account
    ADD CONSTRAINT account_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: account account_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.account
    ADD CONSTRAINT account_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: invoice invoice_accounting_entity_id_accounting_entity_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_accounting_entity_id_accounting_entity_id_fk FOREIGN KEY (accounting_entity_id) REFERENCES core.accounting_entity(id);

--
-- Name: invoice invoice_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: invoice invoice_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: invoice invoice_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: invoice invoice_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: invoice invoice_journal_entry_id_journal_entry_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_journal_entry_id_journal_entry_id_fk FOREIGN KEY (journal_entry_id) REFERENCES accounts.journal_entry(id);

--
-- Name: invoice invoice_legal_entity_id_legal_entity_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_legal_entity_id_legal_entity_id_fk FOREIGN KEY (legal_entity_id) REFERENCES core.legal_entity(id);

--
-- Name: invoice_line invoice_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice_line
    ADD CONSTRAINT invoice_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: invoice_line invoice_line_invoice_id_invoice_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice_line
    ADD CONSTRAINT invoice_line_invoice_id_invoice_id_fk FOREIGN KEY (invoice_id) REFERENCES accounts.invoice(id) ON DELETE CASCADE;

--
-- Name: invoice invoice_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.invoice
    ADD CONSTRAINT invoice_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: journal_entry journal_entry_accounting_entity_id_accounting_entity_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT journal_entry_accounting_entity_id_accounting_entity_id_fk FOREIGN KEY (accounting_entity_id) REFERENCES core.accounting_entity(id);

--
-- Name: journal_entry journal_entry_branch_id_dealership_id_branch_id_dealership_id_f; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT journal_entry_branch_id_dealership_id_branch_id_dealership_id_f FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: journal_entry journal_entry_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT journal_entry_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: journal_entry journal_entry_legal_entity_id_legal_entity_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT journal_entry_legal_entity_id_legal_entity_id_fk FOREIGN KEY (legal_entity_id) REFERENCES core.legal_entity(id);

--
-- Name: journal_entry journal_entry_posted_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_entry
    ADD CONSTRAINT journal_entry_posted_by_id_user_id_fk FOREIGN KEY (posted_by_id) REFERENCES core."user"(id);

--
-- Name: journal_line journal_line_account_id_account_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_line
    ADD CONSTRAINT journal_line_account_id_account_id_fk FOREIGN KEY (account_id) REFERENCES accounts.account(id);

--
-- Name: journal_line journal_line_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_line
    ADD CONSTRAINT journal_line_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: journal_line journal_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_line
    ADD CONSTRAINT journal_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: journal_line journal_line_journal_entry_id_journal_entry_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_line
    ADD CONSTRAINT journal_line_journal_entry_id_journal_entry_id_fk FOREIGN KEY (journal_entry_id) REFERENCES accounts.journal_entry(id);

--
-- Name: journal_line journal_line_supplier_id_supplier_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.journal_line
    ADD CONSTRAINT journal_line_supplier_id_supplier_id_fk FOREIGN KEY (supplier_id) REFERENCES parts.supplier(id);

--
-- Name: payment_allocation payment_allocation_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment_allocation
    ADD CONSTRAINT payment_allocation_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: payment_allocation payment_allocation_invoice_id_invoice_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment_allocation
    ADD CONSTRAINT payment_allocation_invoice_id_invoice_id_fk FOREIGN KEY (invoice_id) REFERENCES accounts.invoice(id);

--
-- Name: payment_allocation payment_allocation_payment_id_payment_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment_allocation
    ADD CONSTRAINT payment_allocation_payment_id_payment_id_fk FOREIGN KEY (payment_id) REFERENCES accounts.payment(id);

--
-- Name: payment payment_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: payment payment_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: payment payment_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: payment payment_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: payment payment_journal_entry_id_journal_entry_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_journal_entry_id_journal_entry_id_fk FOREIGN KEY (journal_entry_id) REFERENCES accounts.journal_entry(id);

--
-- Name: payment payment_supplier_id_supplier_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_supplier_id_supplier_id_fk FOREIGN KEY (supplier_id) REFERENCES parts.supplier(id);

--
-- Name: payment payment_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: accounts; Owner: -
--

ALTER TABLE ONLY accounts.payment
    ADD CONSTRAINT payment_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: audit_log audit_log_actor_id_user_id_fk; Type: FK CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.audit_log
    ADD CONSTRAINT audit_log_actor_id_user_id_fk FOREIGN KEY (actor_id) REFERENCES core."user"(id);

--
-- Name: audit_log audit_log_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: audit; Owner: -
--

ALTER TABLE ONLY audit.audit_log
    ADD CONSTRAINT audit_log_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: accounting_entity accounting_entity_legal_entity_id_legal_entity_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.accounting_entity
    ADD CONSTRAINT accounting_entity_legal_entity_id_legal_entity_id_fk FOREIGN KEY (legal_entity_id) REFERENCES core.legal_entity(id);

--
-- Name: branch branch_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.branch
    ADD CONSTRAINT branch_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: branch branch_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.branch
    ADD CONSTRAINT branch_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: branch branch_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.branch
    ADD CONSTRAINT branch_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: customer customer_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.customer
    ADD CONSTRAINT customer_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: customer customer_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.customer
    ADD CONSTRAINT customer_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: customer customer_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.customer
    ADD CONSTRAINT customer_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: dealership dealership_accounting_entity_id_accounting_entity_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.dealership
    ADD CONSTRAINT dealership_accounting_entity_id_accounting_entity_id_fk FOREIGN KEY (accounting_entity_id) REFERENCES core.accounting_entity(id);

--
-- Name: dealership dealership_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.dealership
    ADD CONSTRAINT dealership_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: dealership dealership_legal_entity_id_legal_entity_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.dealership
    ADD CONSTRAINT dealership_legal_entity_id_legal_entity_id_fk FOREIGN KEY (legal_entity_id) REFERENCES core.legal_entity(id);

--
-- Name: dealership dealership_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.dealership
    ADD CONSTRAINT dealership_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: document_sequence document_sequence_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.document_sequence
    ADD CONSTRAINT document_sequence_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: domain_event domain_event_actor_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.domain_event
    ADD CONSTRAINT domain_event_actor_id_user_id_fk FOREIGN KEY (actor_id) REFERENCES core."user"(id);

--
-- Name: domain_event domain_event_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.domain_event
    ADD CONSTRAINT domain_event_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: notification notification_actor_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification
    ADD CONSTRAINT notification_actor_id_user_id_fk FOREIGN KEY (actor_id) REFERENCES core."user"(id);

--
-- Name: notification notification_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification
    ADD CONSTRAINT notification_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: notification notification_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notification
    ADD CONSTRAINT notification_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES core."user"(id) ON DELETE CASCADE;

--
-- Name: refresh_token refresh_token_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.refresh_token
    ADD CONSTRAINT refresh_token_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES core."user"(id) ON DELETE CASCADE;

--
-- Name: role role_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role
    ADD CONSTRAINT role_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: role_permission role_permission_permission_id_permission_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_permission
    ADD CONSTRAINT role_permission_permission_id_permission_id_fk FOREIGN KEY (permission_id) REFERENCES core.permission(id) ON DELETE CASCADE;

--
-- Name: role_permission role_permission_role_id_role_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role_permission
    ADD CONSTRAINT role_permission_role_id_role_id_fk FOREIGN KEY (role_id) REFERENCES core.role(id) ON DELETE CASCADE;

--
-- Name: role role_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.role
    ADD CONSTRAINT role_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: user_role user_role_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: user_role user_role_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: user_role user_role_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: user_role user_role_role_id_role_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_role_id_role_id_fk FOREIGN KEY (role_id) REFERENCES core.role(id) ON DELETE CASCADE;

--
-- Name: user_role user_role_user_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.user_role
    ADD CONSTRAINT user_role_user_id_user_id_fk FOREIGN KEY (user_id) REFERENCES core."user"(id) ON DELETE CASCADE;

--
-- Name: vehicle vehicle_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle
    ADD CONSTRAINT vehicle_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_dealership vehicle_dealership_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_dealership
    ADD CONSTRAINT vehicle_dealership_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_dealership vehicle_dealership_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_dealership
    ADD CONSTRAINT vehicle_dealership_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: vehicle_dealership vehicle_dealership_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_dealership
    ADD CONSTRAINT vehicle_dealership_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: vehicle_model vehicle_model_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_model
    ADD CONSTRAINT vehicle_model_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle vehicle_model_id_vehicle_model_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle
    ADD CONSTRAINT vehicle_model_id_vehicle_model_id_fk FOREIGN KEY (model_id) REFERENCES core.vehicle_model(id);

--
-- Name: vehicle_model vehicle_model_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_model
    ADD CONSTRAINT vehicle_model_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_ownership vehicle_ownership_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_ownership
    ADD CONSTRAINT vehicle_ownership_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_ownership vehicle_ownership_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_ownership
    ADD CONSTRAINT vehicle_ownership_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: vehicle_ownership vehicle_ownership_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_ownership
    ADD CONSTRAINT vehicle_ownership_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: vehicle_ownership vehicle_ownership_ended_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_ownership
    ADD CONSTRAINT vehicle_ownership_ended_by_id_user_id_fk FOREIGN KEY (ended_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_ownership vehicle_ownership_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle_ownership
    ADD CONSTRAINT vehicle_ownership_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: vehicle vehicle_sold_by_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle
    ADD CONSTRAINT vehicle_sold_by_dealership_id_dealership_id_fk FOREIGN KEY (sold_by_dealership_id) REFERENCES core.dealership(id);

--
-- Name: vehicle vehicle_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vehicle
    ADD CONSTRAINT vehicle_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: workflow_transition workflow_transition_actor_id_user_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.workflow_transition
    ADD CONSTRAINT workflow_transition_actor_id_user_id_fk FOREIGN KEY (actor_id) REFERENCES core."user"(id);

--
-- Name: workflow_transition workflow_transition_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.workflow_transition
    ADD CONSTRAINT workflow_transition_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: goods_receipt goods_receipt_branch_id_dealership_id_branch_id_dealership_id_f; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT goods_receipt_branch_id_dealership_id_branch_id_dealership_id_f FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: goods_receipt goods_receipt_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT goods_receipt_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: goods_receipt_line goods_receipt_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt_line
    ADD CONSTRAINT goods_receipt_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: goods_receipt_line goods_receipt_line_goods_receipt_id_goods_receipt_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt_line
    ADD CONSTRAINT goods_receipt_line_goods_receipt_id_goods_receipt_id_fk FOREIGN KEY (goods_receipt_id) REFERENCES parts.goods_receipt(id);

--
-- Name: goods_receipt_line goods_receipt_line_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt_line
    ADD CONSTRAINT goods_receipt_line_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: goods_receipt_line goods_receipt_line_purchase_order_line_id_purchase_order_line_i; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt_line
    ADD CONSTRAINT goods_receipt_line_purchase_order_line_id_purchase_order_line_i FOREIGN KEY (purchase_order_line_id) REFERENCES parts.purchase_order_line(id);

--
-- Name: goods_receipt goods_receipt_purchase_order_id_purchase_order_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT goods_receipt_purchase_order_id_purchase_order_id_fk FOREIGN KEY (purchase_order_id) REFERENCES parts.purchase_order(id);

--
-- Name: goods_receipt goods_receipt_received_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT goods_receipt_received_by_id_user_id_fk FOREIGN KEY (received_by_id) REFERENCES core."user"(id);

--
-- Name: goods_receipt goods_receipt_supplier_id_supplier_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.goods_receipt
    ADD CONSTRAINT goods_receipt_supplier_id_supplier_id_fk FOREIGN KEY (supplier_id) REFERENCES parts.supplier(id);

--
-- Name: inventory_transaction inventory_transaction_actor_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.inventory_transaction
    ADD CONSTRAINT inventory_transaction_actor_id_user_id_fk FOREIGN KEY (actor_id) REFERENCES core."user"(id);

--
-- Name: inventory_transaction inventory_transaction_branch_id_dealership_id_branch_id_dealers; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.inventory_transaction
    ADD CONSTRAINT inventory_transaction_branch_id_dealership_id_branch_id_dealers FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: inventory_transaction inventory_transaction_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.inventory_transaction
    ADD CONSTRAINT inventory_transaction_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: inventory_transaction inventory_transaction_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.inventory_transaction
    ADD CONSTRAINT inventory_transaction_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: part part_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.part
    ADD CONSTRAINT part_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: part part_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.part
    ADD CONSTRAINT part_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: parts_request parts_request_branch_id_dealership_id_branch_id_dealership_id_f; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_branch_id_dealership_id_branch_id_dealership_id_f FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: parts_request parts_request_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: parts_request parts_request_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: parts_request parts_request_job_card_id_job_card_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_job_card_id_job_card_id_fk FOREIGN KEY (job_card_id) REFERENCES service.job_card(id);

--
-- Name: parts_request_line parts_request_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request_line
    ADD CONSTRAINT parts_request_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: parts_request_line parts_request_line_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request_line
    ADD CONSTRAINT parts_request_line_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: parts_request_line parts_request_line_parts_request_id_parts_request_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request_line
    ADD CONSTRAINT parts_request_line_parts_request_id_parts_request_id_fk FOREIGN KEY (parts_request_id) REFERENCES parts.parts_request(id) ON DELETE CASCADE;

--
-- Name: parts_request parts_request_requested_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_requested_by_id_user_id_fk FOREIGN KEY (requested_by_id) REFERENCES core."user"(id);

--
-- Name: parts_request parts_request_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.parts_request
    ADD CONSTRAINT parts_request_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: purchase_order purchase_order_accounting_entity_id_accounting_entity_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_accounting_entity_id_accounting_entity_id_fk FOREIGN KEY (accounting_entity_id) REFERENCES core.accounting_entity(id);

--
-- Name: purchase_order purchase_order_branch_id_dealership_id_branch_id_dealership_id_; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_branch_id_dealership_id_branch_id_dealership_id_ FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: purchase_order purchase_order_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: purchase_order purchase_order_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: purchase_order purchase_order_legal_entity_id_legal_entity_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_legal_entity_id_legal_entity_id_fk FOREIGN KEY (legal_entity_id) REFERENCES core.legal_entity(id);

--
-- Name: purchase_order_line purchase_order_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order_line
    ADD CONSTRAINT purchase_order_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: purchase_order_line purchase_order_line_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order_line
    ADD CONSTRAINT purchase_order_line_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: purchase_order_line purchase_order_line_purchase_order_id_purchase_order_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order_line
    ADD CONSTRAINT purchase_order_line_purchase_order_id_purchase_order_id_fk FOREIGN KEY (purchase_order_id) REFERENCES parts.purchase_order(id) ON DELETE CASCADE;

--
-- Name: purchase_order purchase_order_supplier_id_supplier_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_supplier_id_supplier_id_fk FOREIGN KEY (supplier_id) REFERENCES parts.supplier(id);

--
-- Name: purchase_order purchase_order_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.purchase_order
    ADD CONSTRAINT purchase_order_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: stock_adjustment stock_adjustment_branch_id_dealership_id_branch_id_dealership_i; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment
    ADD CONSTRAINT stock_adjustment_branch_id_dealership_id_branch_id_dealership_i FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: stock_adjustment stock_adjustment_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment
    ADD CONSTRAINT stock_adjustment_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: stock_adjustment stock_adjustment_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment
    ADD CONSTRAINT stock_adjustment_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: stock_adjustment_line stock_adjustment_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment_line
    ADD CONSTRAINT stock_adjustment_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: stock_adjustment_line stock_adjustment_line_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment_line
    ADD CONSTRAINT stock_adjustment_line_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: stock_adjustment_line stock_adjustment_line_stock_adjustment_id_stock_adjustment_id_f; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment_line
    ADD CONSTRAINT stock_adjustment_line_stock_adjustment_id_stock_adjustment_id_f FOREIGN KEY (stock_adjustment_id) REFERENCES parts.stock_adjustment(id) ON DELETE CASCADE;

--
-- Name: stock_adjustment stock_adjustment_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_adjustment
    ADD CONSTRAINT stock_adjustment_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: stock_item stock_item_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_item
    ADD CONSTRAINT stock_item_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: stock_item stock_item_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_item
    ADD CONSTRAINT stock_item_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: stock_item stock_item_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_item
    ADD CONSTRAINT stock_item_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: stock_transfer stock_transfer_branch_id_dealership_id_branch_id_dealership_id_; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT stock_transfer_branch_id_dealership_id_branch_id_dealership_id_ FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: stock_transfer stock_transfer_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT stock_transfer_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: stock_transfer stock_transfer_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT stock_transfer_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: stock_transfer_line stock_transfer_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer_line
    ADD CONSTRAINT stock_transfer_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: stock_transfer_line stock_transfer_line_part_id_part_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer_line
    ADD CONSTRAINT stock_transfer_line_part_id_part_id_fk FOREIGN KEY (part_id) REFERENCES parts.part(id);

--
-- Name: stock_transfer_line stock_transfer_line_stock_transfer_id_stock_transfer_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer_line
    ADD CONSTRAINT stock_transfer_line_stock_transfer_id_stock_transfer_id_fk FOREIGN KEY (stock_transfer_id) REFERENCES parts.stock_transfer(id) ON DELETE CASCADE;

--
-- Name: stock_transfer stock_transfer_to_branch_id_dealership_id_branch_id_dealership_; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT stock_transfer_to_branch_id_dealership_id_branch_id_dealership_ FOREIGN KEY (to_branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: stock_transfer stock_transfer_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.stock_transfer
    ADD CONSTRAINT stock_transfer_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: supplier supplier_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.supplier
    ADD CONSTRAINT supplier_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: supplier supplier_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.supplier
    ADD CONSTRAINT supplier_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: supplier supplier_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: parts; Owner: -
--

ALTER TABLE ONLY parts.supplier
    ADD CONSTRAINT supplier_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: delivery delivery_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: delivery delivery_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: delivery delivery_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: delivery delivery_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: delivery delivery_delivered_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_delivered_by_id_user_id_fk FOREIGN KEY (delivered_by_id) REFERENCES core."user"(id);

--
-- Name: delivery delivery_sales_order_id_sales_order_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_sales_order_id_sales_order_id_fk FOREIGN KEY (sales_order_id) REFERENCES sales.sales_order(id);

--
-- Name: delivery delivery_salesperson_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_salesperson_id_user_id_fk FOREIGN KEY (salesperson_id) REFERENCES core."user"(id);

--
-- Name: delivery delivery_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: delivery delivery_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.delivery
    ADD CONSTRAINT delivery_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: document_template document_template_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.document_template
    ADD CONSTRAINT document_template_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: document_template document_template_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.document_template
    ADD CONSTRAINT document_template_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: document_template document_template_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.document_template
    ADD CONSTRAINT document_template_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: lead lead_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: lead lead_converted_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_converted_by_id_user_id_fk FOREIGN KEY (converted_by_id) REFERENCES core."user"(id);

--
-- Name: lead lead_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: lead lead_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: lead lead_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: lead lead_escalated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_escalated_by_id_user_id_fk FOREIGN KEY (escalated_by_id) REFERENCES core."user"(id);

--
-- Name: lead_follow_up lead_follow_up_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead_follow_up
    ADD CONSTRAINT lead_follow_up_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: lead_follow_up lead_follow_up_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead_follow_up
    ADD CONSTRAINT lead_follow_up_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: lead_follow_up lead_follow_up_lead_id_lead_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead_follow_up
    ADD CONSTRAINT lead_follow_up_lead_id_lead_id_fk FOREIGN KEY (lead_id) REFERENCES sales.lead(id) ON DELETE CASCADE;

--
-- Name: lead lead_interested_model_id_vehicle_model_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_interested_model_id_vehicle_model_id_fk FOREIGN KEY (interested_model_id) REFERENCES core.vehicle_model(id);

--
-- Name: lead lead_owner_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_owner_id_user_id_fk FOREIGN KEY (owner_id) REFERENCES core."user"(id);

--
-- Name: lead lead_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.lead
    ADD CONSTRAINT lead_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: ppf_form ppf_form_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: ppf_form ppf_form_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: ppf_form ppf_form_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: ppf_form ppf_form_lead_id_lead_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_lead_id_lead_id_fk FOREIGN KEY (lead_id) REFERENCES sales.lead(id);

--
-- Name: ppf_form ppf_form_owner_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_owner_id_user_id_fk FOREIGN KEY (owner_id) REFERENCES core."user"(id);

--
-- Name: ppf_form ppf_form_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.ppf_form
    ADD CONSTRAINT ppf_form_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: quotation quotation_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: quotation quotation_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: quotation quotation_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: quotation quotation_lead_id_lead_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_lead_id_lead_id_fk FOREIGN KEY (lead_id) REFERENCES sales.lead(id);

--
-- Name: quotation quotation_model_id_vehicle_model_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_model_id_vehicle_model_id_fk FOREIGN KEY (model_id) REFERENCES core.vehicle_model(id);

--
-- Name: quotation quotation_owner_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_owner_id_user_id_fk FOREIGN KEY (owner_id) REFERENCES core."user"(id);

--
-- Name: quotation quotation_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.quotation
    ADD CONSTRAINT quotation_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: sales_order sales_order_accounting_entity_id_accounting_entity_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_accounting_entity_id_accounting_entity_id_fk FOREIGN KEY (accounting_entity_id) REFERENCES core.accounting_entity(id);

--
-- Name: sales_order sales_order_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: sales_order sales_order_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: sales_order sales_order_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: sales_order sales_order_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: sales_order sales_order_lead_id_lead_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_lead_id_lead_id_fk FOREIGN KEY (lead_id) REFERENCES sales.lead(id);

--
-- Name: sales_order sales_order_legal_entity_id_legal_entity_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_legal_entity_id_legal_entity_id_fk FOREIGN KEY (legal_entity_id) REFERENCES core.legal_entity(id);

--
-- Name: sales_order sales_order_model_id_vehicle_model_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_model_id_vehicle_model_id_fk FOREIGN KEY (model_id) REFERENCES core.vehicle_model(id);

--
-- Name: sales_order sales_order_salesperson_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_salesperson_id_user_id_fk FOREIGN KEY (salesperson_id) REFERENCES core."user"(id);

--
-- Name: sales_order sales_order_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: sales_order sales_order_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.sales_order
    ADD CONSTRAINT sales_order_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: vehicle_variant vehicle_variant_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.vehicle_variant
    ADD CONSTRAINT vehicle_variant_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_variant vehicle_variant_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.vehicle_variant
    ADD CONSTRAINT vehicle_variant_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: vehicle_variant vehicle_variant_model_id_vehicle_model_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.vehicle_variant
    ADD CONSTRAINT vehicle_variant_model_id_vehicle_model_id_fk FOREIGN KEY (model_id) REFERENCES core.vehicle_model(id);

--
-- Name: vehicle_variant vehicle_variant_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: sales; Owner: -
--

ALTER TABLE ONLY sales.vehicle_variant
    ADD CONSTRAINT vehicle_variant_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: estimate estimate_advisor_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_advisor_id_user_id_fk FOREIGN KEY (advisor_id) REFERENCES core."user"(id);

--
-- Name: estimate estimate_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: estimate estimate_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: estimate estimate_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: estimate estimate_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: estimate estimate_job_card_id_job_card_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_job_card_id_job_card_id_fk FOREIGN KEY (job_card_id) REFERENCES service.job_card(id);

--
-- Name: estimate_line estimate_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate_line
    ADD CONSTRAINT estimate_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: estimate_line estimate_line_estimate_id_estimate_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate_line
    ADD CONSTRAINT estimate_line_estimate_id_estimate_id_fk FOREIGN KEY (estimate_id) REFERENCES service.estimate(id) ON DELETE CASCADE;

--
-- Name: estimate_line estimate_line_inspection_item_id_inspection_item_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate_line
    ADD CONSTRAINT estimate_line_inspection_item_id_inspection_item_id_fk FOREIGN KEY (inspection_item_id) REFERENCES service.inspection_item(id);

--
-- Name: estimate estimate_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.estimate
    ADD CONSTRAINT estimate_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: inspection inspection_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: inspection inspection_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: inspection inspection_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: inspection inspection_inspector_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_inspector_id_user_id_fk FOREIGN KEY (inspector_id) REFERENCES core."user"(id);

--
-- Name: inspection_item inspection_item_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_item
    ADD CONSTRAINT inspection_item_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: inspection_item inspection_item_inspection_id_inspection_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_item
    ADD CONSTRAINT inspection_item_inspection_id_inspection_id_fk FOREIGN KEY (inspection_id) REFERENCES service.inspection(id) ON DELETE CASCADE;

--
-- Name: inspection inspection_job_card_id_job_card_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_job_card_id_job_card_id_fk FOREIGN KEY (job_card_id) REFERENCES service.job_card(id);

--
-- Name: inspection_template_item inspection_template_item_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_template_item
    ADD CONSTRAINT inspection_template_item_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: inspection_template_item inspection_template_item_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection_template_item
    ADD CONSTRAINT inspection_template_item_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: inspection inspection_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.inspection
    ADD CONSTRAINT inspection_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: job_card job_card_advisor_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_advisor_id_user_id_fk FOREIGN KEY (advisor_id) REFERENCES core."user"(id);

--
-- Name: job_card job_card_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: job_card job_card_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: job_card job_card_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: job_card_line job_card_line_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card_line
    ADD CONSTRAINT job_card_line_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: job_card_line job_card_line_done_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card_line
    ADD CONSTRAINT job_card_line_done_by_id_user_id_fk FOREIGN KEY (done_by_id) REFERENCES core."user"(id);

--
-- Name: job_card_line job_card_line_job_card_id_job_card_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card_line
    ADD CONSTRAINT job_card_line_job_card_id_job_card_id_fk FOREIGN KEY (job_card_id) REFERENCES service.job_card(id) ON DELETE CASCADE;

--
-- Name: job_card job_card_technician_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_technician_id_user_id_fk FOREIGN KEY (technician_id) REFERENCES core."user"(id);

--
-- Name: job_card job_card_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: job_card job_card_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: job_card job_card_visit_id_visit_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.job_card
    ADD CONSTRAINT job_card_visit_id_visit_id_fk FOREIGN KEY (visit_id) REFERENCES service.visit(id);

--
-- Name: schedule_item schedule_item_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.schedule_item
    ADD CONSTRAINT schedule_item_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: schedule_item schedule_item_model_id_vehicle_model_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.schedule_item
    ADD CONSTRAINT schedule_item_model_id_vehicle_model_id_fk FOREIGN KEY (model_id) REFERENCES core.vehicle_model(id);

--
-- Name: schedule_item schedule_item_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.schedule_item
    ADD CONSTRAINT schedule_item_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: vehicle_schedule vehicle_schedule_schedule_item_id_schedule_item_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.vehicle_schedule
    ADD CONSTRAINT vehicle_schedule_schedule_item_id_schedule_item_id_fk FOREIGN KEY (schedule_item_id) REFERENCES service.schedule_item(id);

--
-- Name: vehicle_schedule vehicle_schedule_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.vehicle_schedule
    ADD CONSTRAINT vehicle_schedule_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: visit visit_advisor_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_advisor_id_user_id_fk FOREIGN KEY (advisor_id) REFERENCES core."user"(id);

--
-- Name: visit visit_branch_id_dealership_id_branch_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_branch_id_dealership_id_branch_id_dealership_id_fk FOREIGN KEY (branch_id, dealership_id) REFERENCES core.branch(id, dealership_id);

--
-- Name: visit visit_created_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_created_by_id_user_id_fk FOREIGN KEY (created_by_id) REFERENCES core."user"(id);

--
-- Name: visit visit_customer_id_customer_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_customer_id_customer_id_fk FOREIGN KEY (customer_id) REFERENCES core.customer(id);

--
-- Name: visit visit_dealership_id_dealership_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_dealership_id_dealership_id_fk FOREIGN KEY (dealership_id) REFERENCES core.dealership(id);

--
-- Name: visit visit_schedule_entry_id_vehicle_schedule_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_schedule_entry_id_vehicle_schedule_id_fk FOREIGN KEY (schedule_entry_id) REFERENCES service.vehicle_schedule(id);

--
-- Name: visit visit_updated_by_id_user_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_updated_by_id_user_id_fk FOREIGN KEY (updated_by_id) REFERENCES core."user"(id);

--
-- Name: visit visit_vehicle_id_vehicle_id_fk; Type: FK CONSTRAINT; Schema: service; Owner: -
--

ALTER TABLE ONLY service.visit
    ADD CONSTRAINT visit_vehicle_id_vehicle_id_fk FOREIGN KEY (vehicle_id) REFERENCES core.vehicle(id);

--
-- Name: account; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.account ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.invoice ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.invoice_line ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_entry; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.journal_entry ENABLE ROW LEVEL SECURITY;

--
-- Name: journal_line; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.journal_line ENABLE ROW LEVEL SECURITY;

--
-- Name: payment; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.payment ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_allocation; Type: ROW SECURITY; Schema: accounts; Owner: -
--

ALTER TABLE accounts.payment_allocation ENABLE ROW LEVEL SECURITY;

--
-- Name: account tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.account USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: invoice tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.invoice USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: invoice_line tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.invoice_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: journal_entry tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.journal_entry USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: journal_line tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.journal_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: payment tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.payment USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: payment_allocation tenant_isolation; Type: POLICY; Schema: accounts; Owner: -
--

CREATE POLICY tenant_isolation ON accounts.payment_allocation USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: audit_log; Type: ROW SECURITY; Schema: audit; Owner: -
--

ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_read; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY audit_read ON audit.audit_log FOR SELECT USING (((actor_id = core.app_user_id()) OR
CASE
    WHEN (dealership_id IS NULL) THEN core.app_is_global()
    ELSE core.app_tenant_visible(dealership_id)
END));

--
-- Name: audit_log audit_write; Type: POLICY; Schema: audit; Owner: -
--

CREATE POLICY audit_write ON audit.audit_log FOR INSERT WITH CHECK (true);

--
-- Name: branch; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.branch ENABLE ROW LEVEL SECURITY;

--
-- Name: customer; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.customer ENABLE ROW LEVEL SECURITY;

--
-- Name: dealership; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.dealership ENABLE ROW LEVEL SECURITY;

--
-- Name: document_sequence; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.document_sequence ENABLE ROW LEVEL SECURITY;

--
-- Name: domain_event; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.domain_event ENABLE ROW LEVEL SECURITY;

--
-- Name: notification; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notification ENABLE ROW LEVEL SECURITY;

--
-- Name: notification notification_delete; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notification_delete ON core.notification FOR DELETE USING ((user_id = core.app_user_id()));

--
-- Name: notification notification_insert; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notification_insert ON core.notification FOR INSERT WITH CHECK (true);

--
-- Name: notification notification_read; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notification_read ON core.notification FOR SELECT USING (((user_id = core.app_user_id()) OR (actor_id = core.app_user_id())));

--
-- Name: notification notification_update; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY notification_update ON core.notification FOR UPDATE USING ((user_id = core.app_user_id())) WITH CHECK ((user_id = core.app_user_id()));

--
-- Name: branch tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.branch USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: customer tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.customer USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: dealership tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.dealership USING (core.app_tenant_visible(id)) WITH CHECK (core.app_tenant_visible(id));

--
-- Name: document_sequence tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.document_sequence USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: domain_event tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.domain_event USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: vehicle_dealership tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.vehicle_dealership USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: vehicle_ownership tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.vehicle_ownership USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: workflow_transition tenant_isolation; Type: POLICY; Schema: core; Owner: -
--

CREATE POLICY tenant_isolation ON core.workflow_transition USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: vehicle_dealership; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.vehicle_dealership ENABLE ROW LEVEL SECURITY;

--
-- Name: vehicle_ownership; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.vehicle_ownership ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_transition; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.workflow_transition ENABLE ROW LEVEL SECURITY;

--
-- Name: goods_receipt; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.goods_receipt ENABLE ROW LEVEL SECURITY;

--
-- Name: goods_receipt_line; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.goods_receipt_line ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_transaction; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.inventory_transaction ENABLE ROW LEVEL SECURITY;

--
-- Name: parts_request; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.parts_request ENABLE ROW LEVEL SECURITY;

--
-- Name: parts_request_line; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.parts_request_line ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.purchase_order ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order_line; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.purchase_order_line ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustment; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_adjustment ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_adjustment_line; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_adjustment_line ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_item; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_item ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_transfer; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_transfer ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_transfer_line; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.stock_transfer_line ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier; Type: ROW SECURITY; Schema: parts; Owner: -
--

ALTER TABLE parts.supplier ENABLE ROW LEVEL SECURITY;

--
-- Name: goods_receipt tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.goods_receipt USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: goods_receipt_line tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.goods_receipt_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: inventory_transaction tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.inventory_transaction USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: parts_request tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.parts_request USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: parts_request_line tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.parts_request_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: purchase_order tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.purchase_order USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: purchase_order_line tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.purchase_order_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: stock_adjustment tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.stock_adjustment USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: stock_adjustment_line tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.stock_adjustment_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: stock_item tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.stock_item USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: stock_transfer tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.stock_transfer USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: stock_transfer_line tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.stock_transfer_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: supplier tenant_isolation; Type: POLICY; Schema: parts; Owner: -
--

CREATE POLICY tenant_isolation ON parts.supplier USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: delivery; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.delivery ENABLE ROW LEVEL SECURITY;

--
-- Name: document_template; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.document_template ENABLE ROW LEVEL SECURITY;

--
-- Name: lead; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.lead ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_follow_up; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.lead_follow_up ENABLE ROW LEVEL SECURITY;

--
-- Name: ppf_form; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.ppf_form ENABLE ROW LEVEL SECURITY;

--
-- Name: quotation; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.quotation ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_order; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.sales_order ENABLE ROW LEVEL SECURITY;

--
-- Name: delivery tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.delivery USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: document_template tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.document_template USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: lead tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.lead USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: lead_follow_up tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.lead_follow_up USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: ppf_form tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.ppf_form USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: quotation tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.quotation USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: sales_order tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.sales_order USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: vehicle_variant tenant_isolation; Type: POLICY; Schema: sales; Owner: -
--

CREATE POLICY tenant_isolation ON sales.vehicle_variant USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: vehicle_variant; Type: ROW SECURITY; Schema: sales; Owner: -
--

ALTER TABLE sales.vehicle_variant ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.estimate ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_line; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.estimate_line ENABLE ROW LEVEL SECURITY;

--
-- Name: inspection; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.inspection ENABLE ROW LEVEL SECURITY;

--
-- Name: inspection_item; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.inspection_item ENABLE ROW LEVEL SECURITY;

--
-- Name: job_card; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.job_card ENABLE ROW LEVEL SECURITY;

--
-- Name: job_card_line; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.job_card_line ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.estimate USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: estimate_line tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.estimate_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: inspection tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.inspection USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: inspection_item tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.inspection_item USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: job_card tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.job_card USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: job_card_line tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.job_card_line USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: visit tenant_isolation; Type: POLICY; Schema: service; Owner: -
--

CREATE POLICY tenant_isolation ON service.visit USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));

--
-- Name: visit; Type: ROW SECURITY; Schema: service; Owner: -
--

ALTER TABLE service.visit ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA accounts; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA accounts TO dms_app;

--
-- Name: SCHEMA audit; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA audit TO dms_app;

--
-- Name: SCHEMA core; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA core TO dms_app;

--
-- Name: SCHEMA parts; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA parts TO dms_app;

--
-- Name: SCHEMA sales; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA sales TO dms_app;

--
-- Name: SCHEMA service; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA service TO dms_app;

--
-- Name: TABLE account; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE accounts.account TO dms_app;

--
-- Name: SEQUENCE account_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.account_id_seq TO dms_app;

--
-- Name: TABLE invoice; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE accounts.invoice TO dms_app;

--
-- Name: SEQUENCE invoice_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.invoice_id_seq TO dms_app;

--
-- Name: TABLE invoice_line; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE accounts.invoice_line TO dms_app;

--
-- Name: SEQUENCE invoice_line_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.invoice_line_id_seq TO dms_app;

--
-- Name: TABLE journal_entry; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT ON TABLE accounts.journal_entry TO dms_app;

--
-- Name: SEQUENCE journal_entry_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.journal_entry_id_seq TO dms_app;

--
-- Name: TABLE journal_line; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT ON TABLE accounts.journal_line TO dms_app;

--
-- Name: SEQUENCE journal_line_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.journal_line_id_seq TO dms_app;

--
-- Name: TABLE payment; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE accounts.payment TO dms_app;

--
-- Name: TABLE payment_allocation; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE accounts.payment_allocation TO dms_app;

--
-- Name: SEQUENCE payment_allocation_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.payment_allocation_id_seq TO dms_app;

--
-- Name: SEQUENCE payment_id_seq; Type: ACL; Schema: accounts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE accounts.payment_id_seq TO dms_app;

--
-- Name: TABLE audit_log; Type: ACL; Schema: audit; Owner: -
--

GRANT SELECT,INSERT ON TABLE audit.audit_log TO dms_app;

--
-- Name: SEQUENCE audit_log_id_seq; Type: ACL; Schema: audit; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE audit.audit_log_id_seq TO dms_app;

--
-- Name: TABLE accounting_entity; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.accounting_entity TO dms_app;

--
-- Name: SEQUENCE accounting_entity_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.accounting_entity_id_seq TO dms_app;

--
-- Name: TABLE branch; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.branch TO dms_app;

--
-- Name: SEQUENCE branch_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.branch_id_seq TO dms_app;

--
-- Name: TABLE customer; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.customer TO dms_app;

--
-- Name: SEQUENCE customer_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.customer_id_seq TO dms_app;

--
-- Name: TABLE dealership; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.dealership TO dms_app;

--
-- Name: SEQUENCE dealership_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.dealership_id_seq TO dms_app;

--
-- Name: TABLE document_sequence; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.document_sequence TO dms_app;

--
-- Name: TABLE domain_event; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT ON TABLE core.domain_event TO dms_app;

--
-- Name: SEQUENCE domain_event_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.domain_event_id_seq TO dms_app;

--
-- Name: TABLE legal_entity; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.legal_entity TO dms_app;

--
-- Name: SEQUENCE legal_entity_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.legal_entity_id_seq TO dms_app;

--
-- Name: TABLE notification; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.notification TO dms_app;

--
-- Name: SEQUENCE notification_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.notification_id_seq TO dms_app;

--
-- Name: TABLE permission; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.permission TO dms_app;

--
-- Name: SEQUENCE permission_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.permission_id_seq TO dms_app;

--
-- Name: TABLE refresh_token; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.refresh_token TO dms_app;

--
-- Name: SEQUENCE refresh_token_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.refresh_token_id_seq TO dms_app;

--
-- Name: TABLE role; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.role TO dms_app;

--
-- Name: SEQUENCE role_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.role_id_seq TO dms_app;

--
-- Name: TABLE role_permission; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.role_permission TO dms_app;

--
-- Name: TABLE "user"; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core."user" TO dms_app;

--
-- Name: SEQUENCE user_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.user_id_seq TO dms_app;

--
-- Name: TABLE user_role; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.user_role TO dms_app;

--
-- Name: SEQUENCE user_role_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.user_role_id_seq TO dms_app;

--
-- Name: TABLE vehicle; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.vehicle TO dms_app;

--
-- Name: TABLE vehicle_dealership; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.vehicle_dealership TO dms_app;

--
-- Name: SEQUENCE vehicle_dealership_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.vehicle_dealership_id_seq TO dms_app;

--
-- Name: SEQUENCE vehicle_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.vehicle_id_seq TO dms_app;

--
-- Name: TABLE vehicle_model; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.vehicle_model TO dms_app;

--
-- Name: SEQUENCE vehicle_model_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.vehicle_model_id_seq TO dms_app;

--
-- Name: TABLE vehicle_ownership; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE core.vehicle_ownership TO dms_app;

--
-- Name: SEQUENCE vehicle_ownership_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.vehicle_ownership_id_seq TO dms_app;

--
-- Name: TABLE workflow_transition; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,INSERT ON TABLE core.workflow_transition TO dms_app;

--
-- Name: SEQUENCE workflow_transition_id_seq; Type: ACL; Schema: core; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE core.workflow_transition_id_seq TO dms_app;

--
-- Name: TABLE goods_receipt; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.goods_receipt TO dms_app;

--
-- Name: SEQUENCE goods_receipt_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.goods_receipt_id_seq TO dms_app;

--
-- Name: TABLE goods_receipt_line; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.goods_receipt_line TO dms_app;

--
-- Name: SEQUENCE goods_receipt_line_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.goods_receipt_line_id_seq TO dms_app;

--
-- Name: TABLE inventory_transaction; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT ON TABLE parts.inventory_transaction TO dms_app;

--
-- Name: SEQUENCE inventory_transaction_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.inventory_transaction_id_seq TO dms_app;

--
-- Name: TABLE part; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.part TO dms_app;

--
-- Name: SEQUENCE part_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.part_id_seq TO dms_app;

--
-- Name: TABLE parts_request; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.parts_request TO dms_app;

--
-- Name: SEQUENCE parts_request_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.parts_request_id_seq TO dms_app;

--
-- Name: TABLE parts_request_line; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.parts_request_line TO dms_app;

--
-- Name: SEQUENCE parts_request_line_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.parts_request_line_id_seq TO dms_app;

--
-- Name: TABLE purchase_order; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.purchase_order TO dms_app;

--
-- Name: SEQUENCE purchase_order_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.purchase_order_id_seq TO dms_app;

--
-- Name: TABLE purchase_order_line; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.purchase_order_line TO dms_app;

--
-- Name: SEQUENCE purchase_order_line_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.purchase_order_line_id_seq TO dms_app;

--
-- Name: TABLE stock_adjustment; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.stock_adjustment TO dms_app;

--
-- Name: SEQUENCE stock_adjustment_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.stock_adjustment_id_seq TO dms_app;

--
-- Name: TABLE stock_adjustment_line; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.stock_adjustment_line TO dms_app;

--
-- Name: SEQUENCE stock_adjustment_line_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.stock_adjustment_line_id_seq TO dms_app;

--
-- Name: TABLE stock_item; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.stock_item TO dms_app;

--
-- Name: SEQUENCE stock_item_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.stock_item_id_seq TO dms_app;

--
-- Name: TABLE stock_transfer; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.stock_transfer TO dms_app;

--
-- Name: SEQUENCE stock_transfer_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.stock_transfer_id_seq TO dms_app;

--
-- Name: TABLE stock_transfer_line; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.stock_transfer_line TO dms_app;

--
-- Name: SEQUENCE stock_transfer_line_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.stock_transfer_line_id_seq TO dms_app;

--
-- Name: TABLE supplier; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE parts.supplier TO dms_app;

--
-- Name: SEQUENCE supplier_id_seq; Type: ACL; Schema: parts; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE parts.supplier_id_seq TO dms_app;

--
-- Name: TABLE delivery; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.delivery TO dms_app;

--
-- Name: SEQUENCE delivery_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.delivery_id_seq TO dms_app;

--
-- Name: TABLE document_template; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.document_template TO dms_app;

--
-- Name: SEQUENCE document_template_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.document_template_id_seq TO dms_app;

--
-- Name: TABLE lead; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.lead TO dms_app;

--
-- Name: TABLE lead_follow_up; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.lead_follow_up TO dms_app;

--
-- Name: SEQUENCE lead_follow_up_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.lead_follow_up_id_seq TO dms_app;

--
-- Name: SEQUENCE lead_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.lead_id_seq TO dms_app;

--
-- Name: TABLE ppf_form; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.ppf_form TO dms_app;

--
-- Name: SEQUENCE ppf_form_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.ppf_form_id_seq TO dms_app;

--
-- Name: TABLE quotation; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.quotation TO dms_app;

--
-- Name: SEQUENCE quotation_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.quotation_id_seq TO dms_app;

--
-- Name: TABLE sales_order; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.sales_order TO dms_app;

--
-- Name: SEQUENCE sales_order_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.sales_order_id_seq TO dms_app;

--
-- Name: TABLE vehicle_variant; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE sales.vehicle_variant TO dms_app;

--
-- Name: SEQUENCE vehicle_variant_id_seq; Type: ACL; Schema: sales; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE sales.vehicle_variant_id_seq TO dms_app;

--
-- Name: TABLE estimate; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.estimate TO dms_app;

--
-- Name: SEQUENCE estimate_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.estimate_id_seq TO dms_app;

--
-- Name: TABLE estimate_line; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.estimate_line TO dms_app;

--
-- Name: SEQUENCE estimate_line_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.estimate_line_id_seq TO dms_app;

--
-- Name: TABLE inspection; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.inspection TO dms_app;

--
-- Name: SEQUENCE inspection_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.inspection_id_seq TO dms_app;

--
-- Name: TABLE inspection_item; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.inspection_item TO dms_app;

--
-- Name: SEQUENCE inspection_item_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.inspection_item_id_seq TO dms_app;

--
-- Name: TABLE inspection_template_item; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.inspection_template_item TO dms_app;

--
-- Name: SEQUENCE inspection_template_item_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.inspection_template_item_id_seq TO dms_app;

--
-- Name: TABLE job_card; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.job_card TO dms_app;

--
-- Name: SEQUENCE job_card_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.job_card_id_seq TO dms_app;

--
-- Name: TABLE job_card_line; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.job_card_line TO dms_app;

--
-- Name: SEQUENCE job_card_line_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.job_card_line_id_seq TO dms_app;

--
-- Name: TABLE schedule_item; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.schedule_item TO dms_app;

--
-- Name: SEQUENCE schedule_item_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.schedule_item_id_seq TO dms_app;

--
-- Name: TABLE vehicle_schedule; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.vehicle_schedule TO dms_app;

--
-- Name: SEQUENCE vehicle_schedule_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.vehicle_schedule_id_seq TO dms_app;

--
-- Name: TABLE visit; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE service.visit TO dms_app;

--
-- Name: SEQUENCE visit_id_seq; Type: ACL; Schema: service; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE service.visit_id_seq TO dms_app;

--
-- PostgreSQL database dump complete
--

