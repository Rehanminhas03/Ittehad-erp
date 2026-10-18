-- Stock received straight from head office (a challan / invoice), without a purchase order.
ALTER TABLE "parts"."goods_receipt" ALTER COLUMN "purchase_order_id" DROP NOT NULL;
ALTER TABLE "parts"."goods_receipt_line" ALTER COLUMN "purchase_order_line_id" DROP NOT NULL;

-- The price a part was issued / returned at (revenue in the monthly store report).
ALTER TABLE "parts"."inventory_transaction" ADD COLUMN "unit_price" DECIMAL(14,2);
