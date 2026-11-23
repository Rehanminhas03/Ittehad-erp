-- PPF bay: the car's numbers, the salesperson who pitched the PPF, an amount, and extra cars on a taken day.
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "chassis_no" TEXT;
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "engine_no" TEXT;
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "registration_no" TEXT;
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "salesperson_name" TEXT;
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "amount" NUMERIC(14,2);
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "extra" BOOLEAN NOT NULL DEFAULT false;
DROP INDEX IF EXISTS "sales"."ppf_slot_one_car_per_day";
CREATE UNIQUE INDEX "ppf_slot_one_car_per_day" ON "sales"."ppf_slot" ("slot_date") WHERE "cancelled_at" IS NULL AND NOT "extra";
