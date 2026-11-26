-- Sales orders and leads are numbered by month: JET-ITH-SO-2026-11007 (the 7th order of November), 12001 in December.
-- The counter of each month lives in core.document_sequence under the year and month (202611).
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "lead_no" TEXT;

-- Sales orders: the month of the order and the running number they already have (00007 raised in November becomes 11007).
CREATE TEMP TABLE _so ON COMMIT DROP AS
SELECT so.id, so.dealership_id, d.code,
       extract(year from so.created_at at time zone 'Asia/Karachi')::int AS y,
       extract(month from so.created_at at time zone 'Asia/Karachi')::int AS m,
       right(so.order_no, 5)::int AS seq
  FROM "sales"."sales_order" so JOIN "core"."dealership" d ON d.id = so.dealership_id
 WHERE so.order_no ~ '-SO-[0-9]{4}-[0-9]{5}$';
INSERT INTO "core"."document_sequence" (dealership_id, doc_type, year, last_no)
SELECT dealership_id, 'SO', y * 100 + m, max(seq) FROM _so GROUP BY dealership_id, y, m
ON CONFLICT (dealership_id, doc_type, year) DO UPDATE SET last_no = greatest("document_sequence".last_no, EXCLUDED.last_no);
UPDATE "sales"."sales_order" so SET order_no = _so.code || '-SO-' || _so.y || '-' || lpad(_so.m::text, 2, '0') || lpad(_so.seq::text, 3, '0')
  FROM _so WHERE _so.id = so.id;

-- Leads: numbered within their month, oldest first.
CREATE TEMP TABLE _lead ON COMMIT DROP AS
SELECT l.id, l.dealership_id, d.code,
       extract(year from l.created_at at time zone 'Asia/Karachi')::int AS y,
       extract(month from l.created_at at time zone 'Asia/Karachi')::int AS m,
       row_number() OVER (PARTITION BY l.dealership_id, extract(year from l.created_at at time zone 'Asia/Karachi'), extract(month from l.created_at at time zone 'Asia/Karachi') ORDER BY l.id)::int AS rn
  FROM "sales"."lead" l JOIN "core"."dealership" d ON d.id = l.dealership_id
 WHERE l.lead_no IS NULL;
UPDATE "sales"."lead" l SET lead_no = _lead.code || '-LD-' || _lead.y || '-' || lpad(_lead.m::text, 2, '0') || lpad(_lead.rn::text, 3, '0')
  FROM _lead WHERE _lead.id = l.id;
INSERT INTO "core"."document_sequence" (dealership_id, doc_type, year, last_no)
SELECT dealership_id, 'LD', y * 100 + m, max(rn) FROM _lead GROUP BY dealership_id, y, m
ON CONFLICT (dealership_id, doc_type, year) DO UPDATE SET last_no = greatest("document_sequence".last_no, EXCLUDED.last_no);
CREATE UNIQUE INDEX IF NOT EXISTS "lead_dealership_lead_no_uq" ON "sales"."lead" ("dealership_id", "lead_no") WHERE "lead_no" IS NOT NULL;
