-- When the vehicle invoice was handed over to the customer (date and time) and by whom.
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "invoice_delivered_at" TIMESTAMPTZ;
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "invoice_delivered_by_id" BIGINT;
