-- Jetour's quotation says "valid for 7 Days" (the days chosen on the quotation), not "07 Working Days".
UPDATE "sales"."document_template"
   SET "terms" = array_replace("terms", '**VALIDITY:** This Quotation is valid for {validityDays} Working Days', '**VALIDITY:** This Quotation is valid for {validityDaysPlain} Days')
 WHERE "kind" = 'quotation' AND "company_name" = 'JETOUR ITTEHAD';
