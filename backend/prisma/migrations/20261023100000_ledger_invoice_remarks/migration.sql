-- The sale report: the invoice number and the remarks of parts issued.
ALTER TABLE "parts"."inventory_transaction" ADD COLUMN IF NOT EXISTS "invoice_no" TEXT, ADD COLUMN IF NOT EXISTS "remarks" TEXT;
