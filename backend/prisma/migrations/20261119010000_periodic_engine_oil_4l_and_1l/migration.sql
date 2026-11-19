-- Every periodic service that replaces the engine oil takes both the 4 litre and the 1 litre engine oil (5W-30): the 1 litre line is added
-- next to each 4 litre line, and the 4 litre line says so.
UPDATE "service"."schedule_item_line"
   SET "description" = 'Engine oil: replace (4 litres)'
 WHERE "kind" = 'part' AND "part_no" = '5W-30SP/GF-6ASS4L(JETOUR)' AND "description" = 'Engine oil: replace';

INSERT INTO "service"."schedule_item_line" ("schedule_item_id", "kind", "description", "part_no", "quantity", "sort_order")
SELECT l."schedule_item_id", 'part', 'Engine oil: replace (1 litre)', '5W-30SP/GF-6ASS1L(JETOUR)', 1, l."sort_order"
  FROM "service"."schedule_item_line" l
 WHERE l."kind" = 'part' AND l."part_no" = '5W-30SP/GF-6ASS4L(JETOUR)'
   AND NOT EXISTS (SELECT 1 FROM "service"."schedule_item_line" x WHERE x."schedule_item_id" = l."schedule_item_id" AND x."part_no" = '5W-30SP/GF-6ASS1L(JETOUR)');
