-- PPF bay status on the voucher (booked / received / done), so the salesperson sees it; the day the car was received.
ALTER TABLE "sales"."ppf_form" ADD COLUMN IF NOT EXISTS "bay_status" TEXT;
ALTER TABLE "sales"."ppf_form" ADD COLUMN IF NOT EXISTS "received_on" DATE;
ALTER TABLE "sales"."ppf_form" ADD COLUMN IF NOT EXISTS "finished_on" DATE;
ALTER TABLE "sales"."ppf_slot" ADD COLUMN IF NOT EXISTS "received_on" DATE;
UPDATE "sales"."ppf_form" f SET "bay_status" = 'booked' WHERE f."start_date" IS NOT NULL AND f."bay_status" IS NULL;
