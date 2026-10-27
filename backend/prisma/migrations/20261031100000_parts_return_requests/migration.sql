-- The workshop sends issued parts back to the store: a parts request of kind 'return' (the store accepts it and the parts go back into stock).
ALTER TABLE "parts"."parts_request" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'request';
ALTER TABLE "parts"."parts_request_line" ADD COLUMN IF NOT EXISTS "reason" TEXT;
