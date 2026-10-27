-- A discount agreed on a requested part: applied to its job card line when the store issues it.
ALTER TABLE "parts"."parts_request_line" ADD COLUMN IF NOT EXISTS "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
