-- The store has four part categories only: Lubricants, Mechanical, Body shop and Accessories.
UPDATE "parts"."part" SET "category" = CASE
  WHEN "category" = 'Accessories' THEN 'Accessories'
  WHEN "category" = 'Lubricants' THEN 'Lubricants'
  WHEN "description" ~* '(^|[^0-9])[0-9]{1,2}W-?[0-9]{2}([^0-9]|$)' OR "description" ~* '^(engine|gear|brake|transmission) (oil|fluid)' OR "description" ~* '(atf|coolant|grease|lubricant)' AND "description" !~* '(filter|sensor|pipe|hose|cap|pump|module|box|seal)' THEN 'Lubricants'
  WHEN "category" IN ('Fenders & body panels', 'Interior', 'Lights', 'Bumpers', 'Glass & mirrors') THEN 'Body shop'
  ELSE 'Mechanical'
END
WHERE "category" IS DISTINCT FROM 'Accessories' OR "category" IS NULL;
