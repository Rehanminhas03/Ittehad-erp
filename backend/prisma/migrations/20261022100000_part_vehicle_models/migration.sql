-- Which vehicle models a part fits (core.vehicle_model ids), to find prices by vehicle (X70 Plus, Dashing, T1, T2).
ALTER TABLE "parts"."part" ADD COLUMN "model_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
CREATE INDEX "part_model_ids_gin" ON "parts"."part" USING GIN ("model_ids");
