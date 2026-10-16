-- A social media lead whose customer visited and was dealt with by a salesperson.
ALTER TABLE "sales"."lead" ADD COLUMN "dealt_by_id" BIGINT,
ADD COLUMN "dealt_at" TIMESTAMPTZ(6);

CREATE INDEX "lead_dealt_by_id_index" ON "sales"."lead"("dealt_by_id");
