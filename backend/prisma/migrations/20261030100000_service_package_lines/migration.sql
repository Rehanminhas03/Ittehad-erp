-- What a periodic service includes (labour and parts to replace); opening the service on a job card adds them.
CREATE TABLE IF NOT EXISTS "service"."schedule_item_line" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "schedule_item_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "part_no" TEXT,
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "schedule_item_line_schedule_item_id_schedule_item_id_fk" FOREIGN KEY ("schedule_item_id") REFERENCES "service"."schedule_item"("id") ON DELETE CASCADE,
    CONSTRAINT "schedule_item_line_kind_check" CHECK ("kind" IN ('labour', 'part')),
    CONSTRAINT "schedule_item_line_quantity_positive" CHECK ("quantity" > 0)
);
CREATE INDEX IF NOT EXISTS "schedule_item_line_schedule_item_id_index" ON "service"."schedule_item_line" ("schedule_item_id");
