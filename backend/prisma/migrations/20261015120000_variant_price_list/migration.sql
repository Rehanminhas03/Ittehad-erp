-- Price list per variant (ex-factory, advance tax filer / non-filer, freight, booking price) and the tax status of a quotation.
ALTER TABLE "sales"."vehicle_variant" ADD COLUMN "ex_factory_price" DECIMAL(14,2),
ADD COLUMN "advance_tax_filer" DECIMAL(14,2),
ADD COLUMN "advance_tax_non_filer" DECIMAL(14,2),
ADD COLUMN "freight_charges" DECIMAL(14,2),
ADD COLUMN "booking_price" DECIMAL(14,2);

ALTER TABLE "sales"."quotation" ADD COLUMN "tax_status" TEXT NOT NULL DEFAULT 'filer';

-- Jetour Ittehad's price list (October 2026). T1 Petrol has no price yet (booking price only).
UPDATE "sales"."vehicle_variant" v
   SET "ex_factory_price" = p.ex, "advance_tax_filer" = p.adv_f, "advance_tax_non_filer" = p.adv_nf, "freight_charges" = p.fr, "booking_price" = p.bk
  FROM (VALUES
    ('DASHING-1.5TCI', 7899000::numeric, 160140::numeric, 480420::numeric, 108000::numeric, NULL::numeric),
    ('X70-1.5TCI', 8299000::numeric, 168140::numeric, 504420::numeric, 108000::numeric, NULL::numeric),
    ('T2-IDM', 12795000::numeric, 257400::numeric, NULL::numeric, 75000::numeric, 2500000::numeric),
    ('T2-PETROL', 13590000::numeric, 683250::numeric, NULL::numeric, 75000::numeric, 3000000::numeric),
    ('T1-IDM', 10799000::numeric, 215980::numeric, NULL::numeric, 75000::numeric, 2000000::numeric),
    ('T1-PETROL', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, 2000000::numeric)
  ) AS p(code, ex, adv_f, adv_nf, fr, bk)
 WHERE v."code" = p.code
   AND v."dealership_id" IN (SELECT id FROM "core"."dealership" WHERE "code" = 'JET-ITH');
