-- AlterTable
ALTER TABLE "sales"."lead" ADD COLUMN     "vehicle_price" DECIMAL(14,2);


-- Hyundai Staria is no longer sold: switched off (kept for the leads and documents that name it).
UPDATE "core"."vehicle_model" SET "is_active" = false WHERE "brand" = 'Hyundai' AND "name" = 'Staria';

-- The Assistant Manager and the Sales Manager see the dealership's customers (Customers tab).
INSERT INTO "core"."role_permission" ("role_id", "permission_id")
SELECT r.id, p.id FROM "core"."role" r CROSS JOIN "core"."permission" p
 WHERE r.name IN ('Assistant Manager', 'Sales Manager') AND p.code = 'master.customers.view'
ON CONFLICT DO NOTHING;
