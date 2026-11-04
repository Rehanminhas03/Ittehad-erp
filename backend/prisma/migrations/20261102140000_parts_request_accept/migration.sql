-- The workshop accepts the parts the store gave: what was accepted, by whom and when.
ALTER TABLE "parts"."parts_request_line" ADD COLUMN IF NOT EXISTS "accepted_qty" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "parts"."parts_request_line" ADD COLUMN IF NOT EXISTS "accepted_by_id" BIGINT;
ALTER TABLE "parts"."parts_request_line" ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMPTZ(6);
