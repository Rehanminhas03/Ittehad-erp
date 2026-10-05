-- AlterTable
ALTER TABLE "sales"."lead" ADD COLUMN     "appointment_at" TIMESTAMPTZ(6),
ADD COLUMN     "appointment_note" TEXT,
ADD COLUMN     "appointment_reminded_at" TIMESTAMPTZ(6),
ADD COLUMN     "appointment_set_by_id" BIGINT;

-- AlterTable
ALTER TABLE "sales"."ppf_form" ADD COLUMN     "customer_address" TEXT,
ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "protection_package" TEXT;

-- CreateIndex
CREATE INDEX "lead_appointment_at_index" ON "sales"."lead"("appointment_at");

