-- The customer's CNIC, printed on the PPF voucher.
ALTER TABLE "sales"."ppf_form" ADD COLUMN IF NOT EXISTS "customer_cnic" TEXT;
