-- NEV levy and CVT (1%) on the variant price list and on the quotation (hybrid / electric cars, e.g. Palisade HEV).
ALTER TABLE "sales"."vehicle_variant" ADD COLUMN IF NOT EXISTS "nev_levy" DECIMAL(14,2), ADD COLUMN IF NOT EXISTS "cvt" DECIMAL(14,2);
ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "nev_levy" DECIMAL(14,2), ADD COLUMN IF NOT EXISTS "cvt" DECIMAL(14,2);
