-- A periodic service also lists the inspection points it covers ('check'); its job card line knows which service it is.
ALTER TABLE "service"."schedule_item_line" DROP CONSTRAINT IF EXISTS "schedule_item_line_kind_check";
ALTER TABLE "service"."schedule_item_line" ADD CONSTRAINT "schedule_item_line_kind_check" CHECK ("kind" IN ('labour', 'part', 'check'));
ALTER TABLE "service"."job_card_line" ADD COLUMN IF NOT EXISTS "schedule_item_id" BIGINT;
