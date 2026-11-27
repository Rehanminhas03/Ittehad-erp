-- The Sales Manager (like the Sales Admin and the Dealership Manager) can correct sales orders.
INSERT INTO "core"."role_permission" (role_id, permission_id)
SELECT r.id, p.id FROM "core"."role" r CROSS JOIN "core"."permission" p
 WHERE r.name = 'Sales Manager' AND p.code = 'sales.orders.update'
ON CONFLICT DO NOTHING;
