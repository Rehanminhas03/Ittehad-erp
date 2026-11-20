-- The customer's occupation (required when a lead is converted to a sale order).
ALTER TABLE "core"."customer" ADD COLUMN "occupation" TEXT;
