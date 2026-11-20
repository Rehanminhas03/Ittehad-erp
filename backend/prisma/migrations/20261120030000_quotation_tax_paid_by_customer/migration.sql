ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "tax_paid_by_customer" BOOLEAN NOT NULL DEFAULT false;
