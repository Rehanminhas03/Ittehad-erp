-- Jetour T1 i-DM PHEV price update: ex-factory 10,798,999, advance tax (filer) 217,479, freight 74,999, booking 2,000,000.
UPDATE "sales"."vehicle_variant"
   SET "ex_factory_price" = 10798999, "advance_tax_filer" = 217479, "freight_charges" = 74999, "booking_price" = 2000000
 WHERE "code" = 'T1-IDM'
   AND "dealership_id" IN (SELECT id FROM "core"."dealership" WHERE "code" = 'JET-ITH');
