-- Referred by on the order itself (imported old orders have no lead); the Sales Admin can create and convert their own leads.
ALTER TABLE "sales"."sales_order" ADD COLUMN IF NOT EXISTS "referred_by" TEXT;
INSERT INTO "core"."role_permission" (role_id, permission_id)
SELECT r.id, p.id FROM "core"."role" r CROSS JOIN "core"."permission" p
 WHERE r.name = 'Sales Admin' AND p.code IN ('sales.leads.create', 'sales.leads.view_own', 'sales.leads.update_own', 'sales.leads.convert_own')
ON CONFLICT DO NOTHING;
