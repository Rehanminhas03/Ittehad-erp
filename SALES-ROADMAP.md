# Sales portal: features worth adding

Suggested additions to the Sales portal, most valuable first. None of these are built yet.
Status: proposal, 1 October 2026.

| # | Feature | Why it helps | Priority |
|---|---|---|---|
| 1 | Payment tracking per order | Stops a car leaving unpaid; balance due always visible | High |
| 2 | Registration and file tracking after delivery | Answers the customer's most common question after delivery | High |
| 3 | SMS / WhatsApp updates to the customer | Fewer "where is my car?" calls to salespeople | Medium |
| 4 | Targets and performance | Manager sees each salesperson against target | Medium |
| 5 | Cancellation and refund steps | Cancellations get a reason, approval and refund record | Medium |
| 6 | Follow-up after delivery | Customer satisfaction; leads into the Service module | Low |
| 7 | Bank / leasing cases | Many quotations already go to banks; track them to the DO | Low |git

---

## 1. Payment tracking per order

Today the order records only the booking amount and one payment reference.

- Each order gets a list of payments: booking, part payments, final payment, bank delivery order (DO).
- Each payment records the date, amount, mode (cash, pay order, cheque, online transfer, bank DO) and reference number. A scan of the instrument can be attached.
- The order shows **Total price · Received · Balance due**.
- The Sales Admin (or Accounts) marks a payment as **cleared** once it is realised.
- **The car cannot be handed over until the balance is zero and every payment is cleared.** The Manager can override with a written reason.
- A **Balance due** list and report shows every order with money outstanding.

## 2. Registration and file tracking after delivery

- Steps after hand-over: **Invoice issued → File sent for registration → Registered (number plate no.) → Number plate received → Original file and documents handed to the customer**.
- Each step records the date and who did it. The registration number is searchable everywhere.
- "Action needed" flags files that are stuck, e.g. not registered 15 days after delivery.
- The salesperson sees this on the lead, just like the car status banner.

## 3. SMS / WhatsApp updates to the customer

- Automatic messages at key steps: order booked (with PBO number), car in transit, car received / ready for delivery, delivery scheduled (date and time), delivered (thank-you message).
- The Manager can turn each message on or off per dealership and edit its wording.
- Each message sent is logged on the lead.
- Needs an SMS gateway or WhatsApp Business API account. This is the only feature here with a running cost.

## 4. Targets and performance

- The Manager sets a monthly target per salesperson: bookings and deliveries, optionally per model.
- The dashboard shows achieved vs. target with a progress bar for each salesperson and for the dealership.
- Reports:
  - lead-to-booking conversion rate per salesperson;
  - leads by source (walk-in, phone, Facebook, referral…) and which sources convert best;
  - reasons for lost leads (price, waiting time, bought elsewhere…);
  - average days from lead to booking, and from booking to delivery.

## 5. Cancellation and refund steps

- Cancelling an order requires a reason from a fixed list plus a note.
- The Manager approves the cancellation.
- If money was received, a refund record is created: amount, deductions, mode, date and reference. The refund is tracked until it is paid.
- Cancellation reasons appear in the reports.

## 6. Follow-up after delivery

- A call reminder for the salesperson 3 days after delivery; they record the customer's feedback (satisfied / issue + note).
- A reminder for the first free service (e.g. 1,000 km or 1 month), passed to the Service module once it is switched on.
- A simple satisfaction score per salesperson and per dealership.

## 7. Bank / leasing cases

- On the lead or order: bank name, branch, application date and status (**Applied → Approved → DO received**), and the approved amount.
- Flags cases waiting too long for bank approval.
- The DO, once received, feeds into payment tracking (feature 1).

---

## Suggested order

1. **Payment tracking** and **registration tracking** first: they close the biggest gaps on the showroom floor.
2. Then **targets and performance** and **cancellation and refunds**: they need no outside service.
3. **SMS / WhatsApp** once a gateway account is chosen.
4. **Follow-up after delivery** and **bank cases**, then switch on the **Service** module.
