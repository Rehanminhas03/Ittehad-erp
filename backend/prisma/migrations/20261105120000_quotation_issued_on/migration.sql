-- The date printed on a quotation can be changed (to send it again), separately from when it was created.
ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "issued_on" DATE;
