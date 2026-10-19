-- Freight and withholding tax may be left empty (the row is not printed) or entered as 0 (printed as 0).
ALTER TABLE "sales"."quotation" ALTER COLUMN "freight_insurance" DROP NOT NULL, ALTER COLUMN "freight_insurance" DROP DEFAULT;
ALTER TABLE "sales"."quotation" ALTER COLUMN "withholding_tax" DROP NOT NULL, ALTER COLUMN "withholding_tax" DROP DEFAULT;
-- Until now a zero meant "not quoted" (no row printed): keep existing quotations looking the same.
UPDATE "sales"."quotation" SET "freight_insurance" = NULL WHERE "freight_insurance" = 0;
UPDATE "sales"."quotation" SET "withholding_tax" = NULL WHERE "withholding_tax" = 0;
