-- Calls to customers about a due service (the CRO's / advisor's call list).
CREATE TABLE "service"."reminder_call" (
    "id" BIGSERIAL NOT NULL,
    "dealership_id" BIGINT NOT NULL,
    "schedule_id" BIGINT NOT NULL,
    "vehicle_id" BIGINT NOT NULL,
    "outcome" TEXT NOT NULL,
    "remarks" TEXT,
    "next_call_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" BIGINT NOT NULL,

    CONSTRAINT "reminder_call_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reminder_call_dealership_id_index" ON "service"."reminder_call"("dealership_id");
CREATE INDEX "reminder_call_schedule_id_index" ON "service"."reminder_call"("schedule_id");

-- Row-level security: each dealership sees only its own rows.
ALTER TABLE "service"."reminder_call" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "service"."reminder_call" USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));
