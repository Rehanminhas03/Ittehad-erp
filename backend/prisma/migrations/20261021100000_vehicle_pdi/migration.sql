-- The PDI of a car when it is received (also for free stock, which has no sales order): done | pending | issue.
ALTER TABLE "core"."vehicle" ADD COLUMN "pdi_status" TEXT,
ADD COLUMN "pdi_issue" TEXT,
ADD COLUMN "pdi_recorded_at" TIMESTAMPTZ(6),
ADD COLUMN "pdi_recorded_by_id" BIGINT;
-- Cars whose PDI was recorded on their sales order keep it.
UPDATE "core"."vehicle" v SET "pdi_status" = CASE WHEN o."pdi_issue" THEN 'issue' WHEN o."pdi_done" THEN 'done' ELSE 'pending' END,
  "pdi_issue" = CASE WHEN o."pdi_issue" THEN o."pdi_notes" END, "pdi_recorded_at" = o."pdi_recorded_at", "pdi_recorded_by_id" = o."pdi_recorded_by_id"
FROM "sales"."sales_order" o WHERE o."vehicle_id" = v."id" AND o."pdi_recorded_at" IS NOT NULL AND o."status" <> 'cancelled';
