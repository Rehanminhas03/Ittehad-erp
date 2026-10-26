-- CSM: the specification lines (battery capacity, torque ...) of a variant and of its quotation.
ALTER TABLE "sales"."vehicle_variant" ADD COLUMN IF NOT EXISTS "specs" TEXT;
ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "specs" TEXT;
