-- When the invoice is handed over: someone other than the customer may take it (name, contact, CNIC).
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "invoice_taken_by_name" TEXT;
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "invoice_taken_by_contact" TEXT;
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "invoice_taken_by_cnic" TEXT;
