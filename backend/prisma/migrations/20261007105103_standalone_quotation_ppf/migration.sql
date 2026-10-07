-- AlterTable
ALTER TABLE "sales"."ppf_form" ADD COLUMN     "color" TEXT,
ADD COLUMN     "customer_mobile" TEXT,
ADD COLUMN     "model_id" BIGINT,
ADD COLUMN     "variant" TEXT,
ALTER COLUMN "lead_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sales"."quotation" ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "customer_mobile" TEXT,
ADD COLUMN     "customer_name" TEXT,
ALTER COLUMN "lead_id" DROP NOT NULL;

