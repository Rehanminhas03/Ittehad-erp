-- AlterTable
ALTER TABLE "core"."user" ADD COLUMN     "cnic" TEXT,
ADD COLUMN     "employee_code" TEXT,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "user_employee_code_unique" ON "core"."user"("employee_code");

