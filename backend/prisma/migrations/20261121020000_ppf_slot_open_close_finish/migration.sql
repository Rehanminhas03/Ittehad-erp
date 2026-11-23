ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "finished_on" DATE;
