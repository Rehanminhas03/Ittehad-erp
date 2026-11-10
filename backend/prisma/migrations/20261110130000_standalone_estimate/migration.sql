-- An estimate can be made on its own, without a job card: the customer and the car are typed on it.
ALTER TABLE "service"."estimate" ALTER COLUMN "job_card_id" DROP NOT NULL;
ALTER TABLE "service"."estimate" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "customer_name" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "customer_mobile" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "vehicle_model" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "registration_no" TEXT;
