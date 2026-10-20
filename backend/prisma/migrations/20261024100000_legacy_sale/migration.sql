-- Sales recorded before the system (the store's sale report sheet): one line per part, by invoice number.
CREATE TABLE IF NOT EXISTS "parts"."legacy_sale" (
    "id" BIGSERIAL NOT NULL,
    "dealership_id" BIGINT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "ro_no" TEXT,
    "invoice_no" TEXT,
    "part_no" TEXT NOT NULL,
    "part_name" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "total_price" DECIMAL(14,2) NOT NULL,
    "remarks" TEXT,
    "source" TEXT NOT NULL DEFAULT 'sale_report_sheet',
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_sale_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "legacy_sale_dealership_id_index" ON "parts"."legacy_sale"("dealership_id");
CREATE INDEX IF NOT EXISTS "legacy_sale_invoice_no_index" ON "parts"."legacy_sale"("invoice_no");

-- Row-level security: each dealership sees only its own rows.
ALTER TABLE "parts"."legacy_sale" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "parts"."legacy_sale";
CREATE POLICY tenant_isolation ON "parts"."legacy_sale" USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));
