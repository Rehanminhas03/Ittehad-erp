-- Delivery documents (Vehicle Delivery Acceptance Note, Delivery Note) saved with the data entered, to view and print again.
CREATE TABLE IF NOT EXISTS "sales"."delivery_document" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "dealership_id" BIGINT NOT NULL,
    "sales_order_id" BIGINT,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by_id" BIGINT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_by_id" BIGINT,
    CONSTRAINT "delivery_document_dealership_id_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "core"."dealership"("id"),
    CONSTRAINT "delivery_document_sales_order_id_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "sales"."sales_order"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "delivery_document_dealership_id_created_at_index" ON "sales"."delivery_document" ("dealership_id", "created_at");
CREATE INDEX IF NOT EXISTS "delivery_document_sales_order_id_index" ON "sales"."delivery_document" ("sales_order_id");
