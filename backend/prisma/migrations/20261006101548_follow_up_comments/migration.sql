-- CreateTable
CREATE TABLE "sales"."lead_follow_up_comment" (
    "id" BIGSERIAL NOT NULL,
    "dealership_id" BIGINT NOT NULL,
    "lead_id" BIGINT NOT NULL,
    "follow_up_id" BIGINT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" BIGINT NOT NULL,

    CONSTRAINT "lead_follow_up_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_follow_up_comment_follow_up_id_index" ON "sales"."lead_follow_up_comment"("follow_up_id");

-- CreateIndex
CREATE INDEX "lead_follow_up_comment_lead_id_index" ON "sales"."lead_follow_up_comment"("lead_id");


-- Row-level security: each dealership sees only its own rows.
ALTER TABLE "sales"."lead_follow_up_comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales"."lead_follow_up_comment" USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));
