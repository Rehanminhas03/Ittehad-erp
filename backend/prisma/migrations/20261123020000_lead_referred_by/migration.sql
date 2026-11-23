-- Who referred the customer (entered when the lead is converted); shown as the Reference on the bookings report.
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "referred_by" TEXT;
