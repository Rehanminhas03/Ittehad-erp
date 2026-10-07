-- AlterTable
ALTER TABLE "sales"."lead" ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "contact_designation" TEXT,
ADD COLUMN     "customer_type" TEXT NOT NULL DEFAULT 'individual',
ADD COLUMN     "lost_at" TIMESTAMPTZ(6),
ADD COLUMN     "lost_by_id" BIGINT,
ADD COLUMN     "lost_reason" TEXT,
ADD COLUMN     "purchase_order_no" TEXT;

-- AlterTable
ALTER TABLE "sales"."sales_order" ADD COLUMN     "clearance_decided_at" TIMESTAMPTZ(6),
ADD COLUMN     "clearance_decided_by_id" BIGINT,
ADD COLUMN     "clearance_decision_note" TEXT,
ADD COLUMN     "clearance_request_note" TEXT,
ADD COLUMN     "clearance_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "clearance_requested_by_id" BIGINT,
ADD COLUMN     "clearance_status" TEXT NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "sales"."order_payment" (
    "id" BIGSERIAL NOT NULL,
    "dealership_id" BIGINT NOT NULL,
    "sales_order_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "instrument" TEXT NOT NULL,
    "reference" TEXT,
    "bank" TEXT,
    "received_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" BIGINT,

    CONSTRAINT "order_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales"."leave_application" (
    "id" BIGSERIAL NOT NULL,
    "dealership_id" BIGINT NOT NULL,
    "application_no" TEXT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "employee_no" TEXT,
    "department" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "decided_at" TIMESTAMPTZ(6),
    "decided_by_id" BIGINT,
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" BIGINT,
    "updated_by_id" BIGINT,

    CONSTRAINT "leave_application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_payment_sales_order_id_index" ON "sales"."order_payment"("sales_order_id");

-- CreateIndex
CREATE INDEX "order_payment_dealership_id_received_on_index" ON "sales"."order_payment"("dealership_id", "received_on");

-- CreateIndex
CREATE UNIQUE INDEX "leave_application_no_unique" ON "sales"."leave_application"("application_no");

-- CreateIndex
CREATE INDEX "leave_application_dealership_id_created_at_index" ON "sales"."leave_application"("dealership_id", "created_at");

-- CreateIndex
CREATE INDEX "leave_application_employee_id_index" ON "sales"."leave_application"("employee_id");

-- CreateIndex
CREATE INDEX "sales_order_dealership_id_clearance_status_index" ON "sales"."sales_order"("dealership_id", "clearance_status");

-- AddForeignKey
ALTER TABLE "sales"."order_payment" ADD CONSTRAINT "order_payment_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "sales"."sales_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Row-level security: each dealership sees only its own rows (as every other dealership table).
ALTER TABLE "sales"."order_payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales"."order_payment" USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));
ALTER TABLE "sales"."leave_application" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sales"."leave_application" USING (core.app_tenant_visible(dealership_id)) WITH CHECK (core.app_tenant_visible(dealership_id));
