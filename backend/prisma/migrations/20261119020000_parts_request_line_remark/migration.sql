-- The store's remark on a requested part it cannot give yet (not in stock, available in 3-4 days ...).
ALTER TABLE "parts"."parts_request_line" ADD COLUMN "store_remark" TEXT;
