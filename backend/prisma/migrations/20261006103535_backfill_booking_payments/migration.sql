-- Orders raised before payments were recorded: their booking amount becomes the first payment
-- (as raising an order now does), so the received / balance figures are right.
INSERT INTO "sales"."order_payment" ("dealership_id", "sales_order_id", "kind", "amount", "instrument", "reference", "bank", "received_on", "note", "created_at", "created_by_id")
SELECT o.dealership_id, o.id, 'booking', o.booking_amount,
       coalesce(l.payment_instrument, 'pay_order'), o.payment_reference, l.payment_instrument_bank,
       (o.created_at at time zone 'Asia/Karachi')::date, 'Booking amount (recorded on the order)', o.created_at, o.created_by_id
  FROM "sales"."sales_order" o
  LEFT JOIN "sales"."lead" l ON l.id = o.lead_id
 WHERE o.booking_amount > 0
   AND o.status <> 'cancelled'
   AND NOT EXISTS (SELECT 1 FROM "sales"."order_payment" p WHERE p.sales_order_id = o.id);
