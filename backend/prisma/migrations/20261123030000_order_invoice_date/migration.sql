-- The date on the vehicle invoice (entered by hand when the invoice is recorded), next to the day it was received.
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "invoice_date" DATE;
