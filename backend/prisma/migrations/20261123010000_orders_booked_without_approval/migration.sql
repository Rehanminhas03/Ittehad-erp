-- Orders are booked as soon as the Sales Admin raises them: no Manager approval.
-- Orders still waiting (draft / submitted) become booked ('approved' is the booked state), and nobody holds the
-- approve / submit permissions any more.
UPDATE "sales"."sales_order" SET "status" = 'approved' WHERE "status" IN ('draft', 'submitted');
DELETE FROM "core"."role_permission" rp USING "core"."permission" p
 WHERE p."id" = rp."permission_id" AND p."code" IN ('sales.orders.approve', 'sales.orders.submit');
