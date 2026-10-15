-- Social media leads from Meta (Facebook / Instagram lead ads): campaign, city and the Meta ids.
ALTER TABLE "sales"."lead" ADD COLUMN "campaign_name" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "meta_lead_id" TEXT,
ADD COLUMN "meta_form_id" TEXT,
ADD COLUMN "ad_name" TEXT,
ADD COLUMN "meta_fields" JSONB;

-- One lead per Meta lead (Meta may deliver the same webhook more than once).
CREATE UNIQUE INDEX "lead_meta_lead_id_uq" ON "sales"."lead"("meta_lead_id");
