-- PPF bay slots: one bay for the whole group (Hyundai, Jetour, CSM), one car starts per day (the partial unique index),
-- booked by a PPF voucher or directly by the PPF team. The voucher keeps the day the car comes (start_date).
CREATE TABLE IF NOT EXISTS "sales"."ppf_slot" (
    "id" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "dealership_id" BIGINT NOT NULL,
    "slot_date" DATE NOT NULL,
    "ppf_form_id" BIGINT,
    "customer_name" TEXT NOT NULL,
    "customer_mobile" TEXT,
    "vehicle" TEXT,
    "notes" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by_id" BIGINT,
    CONSTRAINT "ppf_slot_dealership_id_dealership_id_fk" FOREIGN KEY ("dealership_id") REFERENCES "core"."dealership"("id"),
    CONSTRAINT "ppf_slot_ppf_form_id_ppf_form_id_fk" FOREIGN KEY ("ppf_form_id") REFERENCES "sales"."ppf_form"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "ppf_slot_dealership_id_slot_date_index" ON "sales"."ppf_slot" ("dealership_id", "slot_date");
DROP INDEX IF EXISTS "sales"."ppf_slot_one_car_per_day";
CREATE UNIQUE INDEX "ppf_slot_one_car_per_day" ON "sales"."ppf_slot" ("slot_date") WHERE "cancelled_at" IS NULL;
ALTER TABLE "sales"."ppf_form" ADD COLUMN IF NOT EXISTS "start_date" DATE;
