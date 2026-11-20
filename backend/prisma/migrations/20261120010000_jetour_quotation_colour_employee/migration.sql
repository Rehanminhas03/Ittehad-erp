-- Jetour quotation: interior colour, optional employee name / ID, and the corrected header and delivery station.
ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "interior_color" TEXT;
ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "employee_name" TEXT;
ALTER TABLE "sales"."quotation" ADD COLUMN IF NOT EXISTS "employee_no" TEXT;

-- Jetour Ittehad's saved quotation format: no website line in the header, "Plot # 415", "JETOUR ITTEHAD, ISLAMABAD".
UPDATE "sales"."document_template"
   SET "tagline" = NULL,
       "address" = replace("address", 'Plot #. 415', 'Plot # 415'),
       "delivery_station" = CASE WHEN "delivery_station" = 'JETOUR ITTEHAD ISLAMABAD' THEN 'JETOUR ITTEHAD, ISLAMABAD' ELSE "delivery_station" END
 WHERE "kind" = 'quotation' AND "company_name" = 'JETOUR ITTEHAD';
