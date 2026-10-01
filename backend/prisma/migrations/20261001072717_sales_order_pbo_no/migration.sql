-- AlterTable
ALTER TABLE "sales"."sales_order" ADD COLUMN     "pbo_no" TEXT;

-- CreateIndex
CREATE INDEX "sales_order_dealership_id_pbo_no_index" ON "sales"."sales_order"("dealership_id", "pbo_no");

