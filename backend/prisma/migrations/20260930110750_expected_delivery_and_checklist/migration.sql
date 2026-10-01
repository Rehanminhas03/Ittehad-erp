-- AlterTable
ALTER TABLE "sales"."delivery" ADD COLUMN     "checklist" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "sales"."lead" ADD COLUMN     "expected_delivery_by_month" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expected_delivery_date" DATE;

-- AlterTable
ALTER TABLE "sales"."sales_order" ADD COLUMN     "expected_delivery_by_month" BOOLEAN NOT NULL DEFAULT false;

