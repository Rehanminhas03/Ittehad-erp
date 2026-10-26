-- The vehicle invoice received for the car of a sales order (recorded by the Sales Admin / Assistant Manager / Manager).
ALTER TABLE "sales"."sales_order" ADD COLUMN "invoice_no" TEXT,
ADD COLUMN "invoice_received_on" DATE,
ADD COLUMN "invoice_received_by_id" BIGINT,
ADD COLUMN "invoice_notes" TEXT;

CREATE INDEX "sales_order_invoice_no_index" ON "sales"."sales_order"("dealership_id", "invoice_no");
