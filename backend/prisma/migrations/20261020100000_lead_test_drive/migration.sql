-- Test drive: has the customer driven the car yet, and on which day.
ALTER TABLE "sales"."lead" ADD COLUMN "test_drive_done" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "test_drive_on" DATE;

CREATE INDEX "lead_test_drive_done_index" ON "sales"."lead"("dealership_id", "test_drive_done");
