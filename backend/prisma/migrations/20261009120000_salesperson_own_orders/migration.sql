-- Salespeople and CROs see the sales orders raised for their own leads (Sales orders tab).
INSERT INTO "core"."role_permission" ("role_id", "permission_id")
SELECT r.id, p.id
  FROM "core"."role" r
 CROSS JOIN "core"."permission" p
 WHERE r.name IN ('Salesperson', 'CRO') AND p.code = 'sales.orders.view_own'
ON CONFLICT DO NOTHING;
