-- PDI (pre-delivery inspection) of the car on a sales order, recorded when the Delivery Team receives it.
ALTER TABLE "sales"."sales_order" ADD COLUMN "pdi_done" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pdi_issue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pdi_notes" TEXT,
ADD COLUMN "pdi_recorded_at" TIMESTAMPTZ(6),
ADD COLUMN "pdi_recorded_by_id" BIGINT;

-- Comments on the PDI
CREATE TABLE "sales"."order_pdi_comment" (
    "id" BIGSERIAL NOT NULL,
    "dealership_id" BIGINT NOT NULL,
    "sales_order_id" BIGINT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" BIGINT NOT NULL,

    CONSTRAINT "order_pdi_comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_pdi_comment_dealership_id_index" ON "sales"."order_pdi_comment"("dealership_id");
CREATE INDEX "order_pdi_comment_sales_order_id_index" ON "sales"."order_pdi_comment"("sales_order_id");

-- Row-level security: each dealership sees only its own rows.
ALTER TABLE "sales"."order_pdi_comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales"."order_pdi_comment" USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));
