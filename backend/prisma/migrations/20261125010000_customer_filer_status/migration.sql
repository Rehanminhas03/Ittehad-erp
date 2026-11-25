-- The customer's tax filer status (active filer / inactive non-filer): entered at conversion, or by the Sales Admin when raising the order.
ALTER TABLE "core"."customer" ADD COLUMN IF NOT EXISTS "filer_status" TEXT;
