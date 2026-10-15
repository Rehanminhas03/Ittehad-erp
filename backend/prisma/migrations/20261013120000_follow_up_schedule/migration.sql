-- Lead temperature (hot / warm / cold) and the follow-up schedule (day 2, day 5, about day 11).
ALTER TABLE "sales"."lead" ADD COLUMN "temperature" TEXT,
ADD COLUMN "next_follow_up_on" DATE,
ADD COLUMN "follow_up_reminded_on" DATE;

ALTER TABLE "sales"."lead_follow_up" ADD COLUMN "temperature" TEXT,
ADD COLUMN "next_follow_up_on" DATE;

CREATE INDEX "lead_next_follow_up_on_index" ON "sales"."lead"("next_follow_up_on");

-- Open leads already in the system: their next follow-up from the schedule (overdue ones are due now).
UPDATE "sales"."lead"
   SET "next_follow_up_on" = ((coalesce("last_follow_up_at", "created_at") AT TIME ZONE 'Asia/Karachi')::date
        + CASE "follow_up_count" WHEN 0 THEN 2 WHEN 1 THEN 3 ELSE 6 END)
 WHERE "status" IN ('new', 'follow_up', 'visited') AND "follow_up_count" < 3;
