-- The price received from the company, and discounts (percent) on parts issued, job card lines and estimate lines.
ALTER TABLE "parts"."part" ADD COLUMN "purchase_price" DECIMAL(14,2);
ALTER TABLE "parts"."inventory_transaction" ADD COLUMN "discount_percent" DECIMAL(5,2);
ALTER TABLE "service"."job_card_line" ADD COLUMN "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "service"."estimate_line" ADD COLUMN "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
