-- An estimate on its own also keeps the car's variant, VIN / chassis, engine number, colour and model year.
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "vehicle_variant" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "vin" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "engine_no" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "service"."estimate" ADD COLUMN IF NOT EXISTS "model_year" INTEGER;
