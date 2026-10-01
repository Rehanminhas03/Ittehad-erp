# Dealership DMS

Multi-tenant dealership ERP/DMS for **Hyundai Islamabad**, **Jetour Ittehad** and **CSM Ittehad**, built on the PERN stack.

```
/backend    Express 5 + TypeScript, Prisma ORM, PostgreSQL, Zod (validation + OpenAPI), Vitest
/frontend   React 19 + TypeScript (Vite), Redux Toolkit + RTK Query (generated client), React Router,
            React Hook Form + Zod, Tailwind
/scripts    setup.mjs (one-time local setup), dev.mjs (runs backend + frontend together)
package.json   root commands: setup, dev, test, typecheck, build
```

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: auth, users, roles/permissions, dealerships/branches, audit log | done |
| 2 | Master data: customers, vehicles, ownership, unified search | done |
| 3 | Sales: five per-dealership roles, walk-ins, duplicate-phone control with escalation, follow-ups, Convert to Lead, Admin raises PBO / CBO, team report — **restructured** | done |
| 3b | Delivery Team / Open Stock: stock intake, allocation, logistics pipeline, delivery hand-over; Sales Manager manages staff | done |
| 4 | Service: schedules, visits, job cards, inspections, estimates + approval | done |
| 5 | Parts: suppliers, PO → GRN → stock, append-only inventory ledger | done |
| 6 | Accounts: shared invoicing, payments, append-only journal | done |
| 7 | Reporting: role-scoped dashboards | done |

---

## Running it

Requirements: Node 22+ and a running PostgreSQL 16+. No Docker.

```bash
# once: installs dependencies (and generates Prisma Client), creates the dms / dms_app roles and the
# dms / dms_test / dms_shadow databases, writes backend/.env, applies the Prisma migrations and seeds
PG_SUPERUSER_URL=postgres://postgres:<password>@127.0.0.1:5432/postgres npm run setup

# every day: backend + frontend together (Ctrl+C stops both)
npm run dev

# only start the database (npm run dev already does this when it is not running)
npm run db:start
```

`npm run dev` first checks the database from `backend/.env`. If nothing answers there and it is on this machine, it starts the project's PostgreSQL with `pg_ctl`, for example after the PC was restarted. It uses `%LOCALAPPDATA%\pgsql` and `%LOCALAPPDATA%\pgdata16` by default; set `PG_CTL` and `PG_DATA` for another install. It only starts that data folder on the port from `.env`, never another PostgreSQL server.

In PowerShell, set the variable first: `$env:PG_SUPERUSER_URL="postgres://postgres:<password>@127.0.0.1:5432/postgres"; npm run setup`.

- App: http://localhost:5173 (Vite proxies `/api` to the backend). The app opens on the **login page**. Sign in with one of
  the seeded logins below, for example `sales1@hyundai.com` / `hyundai123`, and use **Sign out** in the avatar menu to switch users.
  Optional development shortcut: set `VITE_DEV_AUTO_LOGIN=true` in `frontend/.env.local` and `DEV_AUTO_LOGIN=true` in
  `backend/.env` to open already signed in as `admin@dms.local`, with a user switcher. The backend only offers this
  password-less sign-in when `NODE_ENV=development`.
- **Only Sales is on for now.** Service, Parts and Accounts are hidden from the menu, pages and dashboard
  (`frontend/src/shared/config/modules.ts`) and their API routes are not served (`backend/src/config/modules.ts`)
  while Sales & Delivery is completed. Their code, tables and data stay; switch a module back on in both files.
- API: http://localhost:4000/api/health (OpenAPI at `/api/openapi.json`)

Setup can be re-run safely: existing roles and databases are kept, but the dev database is rebuilt and reseeded.

The two database roles:

- `dms` owns the schema and is used by the Prisma migrations and the seed (`MIGRATION_DATABASE_URL`).
- `dms_app` is what the running app connects as. It can only read and write rows, and Row-Level Security applies to it.

For production, run `npm run build`, then `npm start` (backend). Serve `frontend/dist` from any static web server that forwards `/api` to the backend. If that server is plain HTTP, set `COOKIE_SECURE=false`.

### Seeded logins (development only)

| Email | Password | Access |
|---|---|---|
| admin@dms.local | Admin@12345 | System Admin, all dealerships |
| management@dms.local | Demo@12345 | Management (read-only), all dealerships |
| manager.hyundai@dms.local | Demo@12345 | Dealership Manager, Hyundai Islamabad |
| manager.jetour@dms.local | Demo@12345 | Dealership Manager, Jetour Ittehad |
| manager.csm@dms.local | Demo@12345 | Dealership Manager, CSM Ittehad |

The 21 sales logins (Hyundai, Jetour and CSM) are listed under [Seeded sales logins](#seeded-sales-logins-development-and-testing-only).

---

## Project structure

Everything reused lives in one place: `shared/` on the frontend, and `lib/`, `entity/`, `http/` on the backend. Every feature and module follows the same layout.

### Backend (`backend/src`)

```
config/        env.ts (validated settings), dealerships.ts (the three dealerships: the only place they're defined)
db/            client.ts (Prisma Client + per-request tenant transaction, query/execute for raw SQL),
               sql.ts (raw SQL helpers), setup.ts (db:migrate), tables.generated.ts (table/column identifiers)
auth/          access.ts (scopes → SQL), grants.ts, tokens.ts, permissions.ts (catalog), middleware.ts
http/          apiRouter.ts (validation + OpenAPI + permission per route), errorHandler.ts, openapi.ts
entity/        generic engines: EntityConfig (entityService, buildEntityRouter), document lines (lines.ts),
               display-name lookups (names.ts)
events/        domain events: catalog.ts (every event + payload), bus.ts (publish / subscribe)
config/        also policies.ts (discount cap, approvals, warranty, free-service grace, labour rate)
lib/           errors, logger, pagination, zod helpers
modules/<name>/
  models.ts        table identifiers, enums    permissions.ts  permission codes
  schemas.ts       request/response (Zod)      entities.ts     EntityConfig per entity
  repository.ts    queries                     service.ts      business rules
  router.ts        endpoints
  (core = foundation; master = customers & vehicles; sales; service; parts; accounts)
scripts/       dbSync, dbReset, seed, exportOpenapi
test/          one file per area + structural rules (routes, schema, RLS)
```

### Frontend (`frontend/src`)

```
app/                store, router (lazy module routes), navigation, AppShell/ (Sidebar, Topbar)
shared/
  api/              baseApi (RTK Query + token refresh)
  components/
    ui/             Button/ Input/ Select/ Field/ Dialog/ PageHeader/ Section/ Badge/ ...  (one folder each)
    EntityListView/ EntityDetailView/ EntityFormView/ ApprovalWorkflow/ AuditTrailPanel/ DashboardWidget/
  entity/           config contract (types), presets (shared columns/filters), zodFields (shared form rules)
  routing/          entityRoutes (list/new/detail/edit routes from one config)
  hooks/            useAuth, usePermission, useToast, typed store hooks
  lib/              apiError, format, cn
features/<name>/
  <name>Api.ts            + <name>Api.generated.ts (typed client, generated from the backend)
  permissions.ts          routes.tsx          index.ts (public surface)
  config/                 one EntityViewConfig per entity
  components/<Component>/ Component.tsx, index.ts (+ test)
  pages/<Page>/           Page.tsx, index.ts
  types/                  domain types
  (auth, admin, crm, sales, service, parts, accounts, reports, ui)
```

Import rules:
- Shared code is imported through its folder's `index.ts`, e.g. `@/shared/components/ui` or `@/shared/hooks`.
- Features import each other only through the other feature's `index.ts` (or its `<name>Api.ts`).

---

## Customers & vehicles (Phase 2)

- **Customers belong to a dealership.** Duplicates are blocked per dealership:
  - by mobile, which is normalised, so `0300-1234567`, `+92 300 1234567` and `923001234567` are the same number;
  - and by CNIC.

  The server answers a duplicate with **409** plus the existing record's id, and the form offers to open it.
- **Vehicles have one identity across the whole group.** VIN, engine number and registration are unique group-wide.
  - Each dealership sees only the vehicles linked to it (sold or serviced there).
  - Typing the exact VIN, engine or registration of a vehicle registered at another dealership offers **Add to my dealership**, never a second copy.
- **Ownership** is a history per dealership: one current owner, and a transfer closes the previous record.
- **Unified search** (top bar, or press `/`) takes a VIN (full or partial), registration, engine number, mobile in any format, CNIC or name.

---

## Sales (Phase 3, restructured)

The Sales module is built around five roles. Every role is assigned **per dealership**, never globally.

```
Walk-in / call / social ──► Lead: new ──follow-ups──► follow_up / visited ──Convert to Lead──► converted
   (name, phone + model)                                 ↘ exhausted (after ≥ 3 follow-ups)       │
                                                                                                 ▼
             completed ◄──delivery completed── processing ◄──Admin raises the sales order (PBO / CBO)
```

**Access matrix** (all within one dealership):

| Role | Own leads | All leads | Convert to Lead | Create sales order |
|---|---|---|---|---|
| Salesperson | yes | no | own leads | no |
| CRO | yes (social / digital) | no | own leads | no |
| Assistant Manager | yes (logs own) | yes | own leads, and duplicate customers sent to them | no |
| Sales Manager | yes (logs own) | yes, plus the team report and all orders | own leads | no (approves orders) |
| Sales Admin | — | only once converted | no | yes |
| Delivery Team | — | no | no | no (allocates stock, delivers) |

- **Walk-ins.** The customer's name, phone and **model** are required; the **variant** can be chosen then or later (it is required at conversion). The variant is picked from the model's variant codes (Hyundai), or typed with **Other (type it)**; for models without codes (Jetour, CSM) it is typed. The lead belongs to whoever logged it. Salespeople see only their own leads, and this is enforced on the server.
- **Duplicate phone numbers.** A phone number can have only one open lead per dealership: new, follow-up, visited, converted or processing. A second attempt is rejected with **"Duplicate lead already exists"**. The salesperson can then **Send to Assistant Manager**, which flags that exact record. The Assistant Manager sees it under **Duplicate customers**. Once the earlier lead is **completed** (its order was delivered) or **exhausted**, the number can be logged again. The database enforces this with a partial unique index.
- **Convert to Lead** requires the model, variant (same picker), vehicle colour, customer email and payment instrument (type and number; bank and amount are optional). The customer's **name and phone** can be corrected in the same form; a new phone that already has another open lead is refused. The customer record is reused by phone number, or created. After conversion, the lead is visible to the dealership's Admin and its details are locked.
  - The owner (Salesperson or CRO) converts their own leads.
  - The Assistant Manager and Sales Manager convert their own leads. The Assistant Manager converts another salesperson's lead only when it was sent to them as a duplicate customer, for example when its salesperson is unavailable. The lead stays with its owner, and the Assistant Manager is recorded as the one who converted it.
- **Follow-ups** have an outcome (Interested / Not interested / Visited) and remarks. A lead needs **at least 3 follow-ups** before it can be marked exhausted, and the server enforces this. Recording a *Visited* follow-up sets the lead to **Visited**.
- **Sales orders** are raised by the **Admin** from a converted lead, as a **PBO** or **CBO**. The order records the price, discount, booking amount, payment reference and expected delivery date. It is credited to the lead's salesperson, and the lead moves to **Processing**, which the Salesperson and Assistant Manager can see. After that, the order follows draft → submitted → approved; the Sales Manager approves it, also straight from draft. Cancelling the order returns the lead to *converted*.
- **Vehicle allocation.** The Admin (or the Delivery Team) enters the **chassis and engine number** on the order when the vehicle is in stock; **both are required**. Until then the vehicle shows as **Pending**. Both numbers can be edited until delivery. If the numbers match an existing undelivered vehicle, that vehicle is linked; otherwise a new vehicle is created. Chassis and engine numbers are unique across the group.
- **Team report** (Sales Manager, **Sales → Team report**) shows, for any period of up to 92 days:
  - per Salesperson and CRO (team leaders only with work of their own in the period; never the Dealership Manager): leads, walk-ins, follow-ups, conversions, escalations converted, and orders raised and completed;
  - leads and walk-ins per day;
  - totals, including how many salespeople produced at least one order.
- **Completing a delivery** still does everything in one transaction: the order and lead are marked delivered and completed, the customer becomes the owner, the vehicle is activated, and `vehicle.activated` is published.
- **Code layout.**
  - Backend, in `backend/src/modules/sales/`: `models.ts` holds the tables, `permissions.ts` the access matrix, `entities.ts` the lead, order and delivery configs and workflows, and `services/` holds `leads.ts`, `orders.ts`, `deliveries.ts`, `stock.ts` and `teamReport.ts`.
  - Frontend, in `frontend/src/features/sales/`: `leads/`, `orders/`, `deliveries/`, `stock/` and `team/`.

### Delivery Team and Open Stock (Phase 3b)

The **Delivery Team** role is also assigned per dealership. It has no access to leads.

- **Open stock** (**Sales → Open stock**) lists the dealership's undelivered vehicles, showing each vehicle's stage and the order holding it (or *Free*). The Sales Admin and Sales Manager can view it; only the Delivery Team can change it.
  - The Delivery Team registers incoming vehicles (model, chassis number and engine number, both required, plus colour and year) as **Available**, or for a waiting order (see below).
  - Chassis and engine numbers are unique across the group.
  - A vehicle's model can't be changed while it is on an order.
- **One Delivery Team for the group:** a single login (`delivery@ittehad.com`, dev password `ittehad123`) holds the Delivery Team role at Hyundai, Jetour and CSM, and works the stock and orders of all three.
- **Car arrives for an order:** registering a vehicle in Open stock has a **For order** field listing the booked orders of that model still waiting for a car (oldest first, preselected). The car is linked to that order and marked **Received** in one step; **None** keeps it as free (Available) stock. The order's Logistics panel links straight to this form.
- **The delivery workflow:**
  1. The Admin books the order (expected delivery about 30 days out); the Manager approves it.
  2. **In transit:** when the plant / head office dispatches the car, the **Sales Admin, Assistant Manager or Manager** (or the Delivery Team) clicks **Mark in transit** on the order. Only after the Manager's approval.
  3. **Received:** when the car arrives, **only the Delivery Team** clicks **Mark received**.
  4. **Schedule delivery:** once the car is received, the **Sales Admin, Assistant Manager, Manager** (or the Delivery Team) picks the delivery date on the order. The car becomes **Ready for delivery** and the Delivery Team sees the date under **Deliveries** (and gets a notification).
  5. **Delivered:** the Delivery Team completes the delivery (or **Mark as delivered** on the order).

  Everyone at the dealership, including the salesperson, is notified at each step and sees the car's stage on the order.
- **Deliveries page** (**Sales → Deliveries**): every booked order until its car is delivered, in tabs with counts: **Waiting for car · In transit · Received · Scheduled · Delivered**. Search by order, customer, chassis or engine number; a dealership filter for people at several dealerships; **Overdue only** (past the expected delivery). The **Scheduled** tab is grouped **Overdue · Today · Tomorrow · This week · Later**. The Delivery Team, Sales Admin, Assistant Manager and Manager see their dealerships' orders (a row opens the order); a **salesperson sees their own customers' cars** (a row opens the lead). It replaces the former Delivery queue and Deliveries menu items (the deliveries list is still behind the dashboard tiles). API: `GET /api/sales/delivery-pipeline`.
- **Customer CNIC** (every dealership): required when the Salesperson, Assistant Manager or Manager **converts the lead**. It is shown, prefilled, on the Admin's Raise sales order form, where the Admin checks it against the CNIC copy and corrects it if needed. A new or corrected CNIC is saved on the customer; one that belongs to another customer at the dealership is refused.
- **PBO number** (every dealership): the number from head office's software. The Admin must enter it when raising the order. A PBO number already used on another order at the dealership (not cancelled) is refused, ignoring case. It is shown on the order, where the Admin can edit it (e.g. for older orders that have none), and on the delivery note and PPF voucher. **Leads, Sales orders, Deliveries** and the **Deliveries page** can be searched by PBO number, in full or by its last 2–3 digits.
- **Car status on the lead**: the lead's Sales order section shows a large coloured **Car status** banner (Booked · In transit · Received · Ready for delivery · Delivered) with the steps so far ticked, so the salesperson can tell the customer at a glance.
- **Expected delivery**: a **month** (usual; some cars take 3–5 months) or an exact **date**. The salesperson enters it when converting the lead (what the customer is told); it is copied to the sales order, where the Admin can change it. Stored as a date (a month as its last day) with `expectedDeliveryByMonth`.
- **Action needed — overdue**: orders past their expected delivery whose car has not arrived (Delivery Team and whoever marks cars in transit); cars received over 3 days ago with no delivery scheduled (whoever schedules deliveries).
- **Pre-delivery checklist**: *PDI done · Documents ready · Accessories fitted* must all be ticked before the car is handed over (scheduled delivery or Mark as delivered); saved on the delivery.
- **Delivery note** (every dealership, on one page with its own letterhead: brand logo and name, the Ittehad logo): "This is to certify that I … CNIC # … on behalf of … have thoroughly inspected and taken delivery of the vehicle against PBO # …", Model / Variant / Engine # / Chassis # / Color / Misc (accessories), the confirmation, "…once the vehicle leaves [dealership] Premises", signature and date & time; then, for the office, Authority Letter & CNIC (YES / NO / NA), Invoice Attached (YES / Undertaking) and the Sales / Finance / Service Manager sign-offs. Known values are filled in (PBO # from the customer's PPF voucher, else the order number), the rest are lines to write on. **Delivery note** button on the delivery, on the order's Delivery section and on the Deliveries page (Scheduled / Delivered); view, download or print. API: `GET /api/sales/deliveries/:id/note`.
- **Delivery report** (**Sales → Delivery report**): delivered this month / this year / last 30 days / all time / in a chosen period, per dealership and all together (or one dealership), with the **average days from approval to delivery**; by model (with its average); **orders booked vs cars delivered** per month. Download CSV or print. API: `GET /api/sales/delivery-report`.
- **Delivery queue** (**Sales → Delivery queue**, `?live=true`) lists orders **from booking** (the Admin raised it) until delivered, marked "waiting for approval" until the Manager approves. The car can be allocated before approval; **in transit and the delivery (hand-over) need an approved order**. On each order, the **Logistics** panel lets the Delivery Team:
  - allocate a free stock vehicle of the ordered model, or enter its chassis and engine number;
  - move it one step at a time: booked → in transit → received → ready for delivery (steps can't be skipped);
  - put it on hold and resume it, or release it back to stock.
- **Mark as delivered:** once the car is **Ready for delivery** and the Manager has approved the order, the order's Logistics panel shows **Mark as delivered**. It opens the hand-over details (date, odometer, plate if issued, documents and accessories handed over, notes, and the customer's acknowledgement) and hands the car over in one step (`POST /api/sales/orders/:id/deliver`). If the order is not approved yet, the panel says it is waiting for the Manager.
- **Manager approvals:** the Manager can approve an order that is **submitted or still a draft** (a draft needs its price). The dashboard's "Awaiting your approval" and the list filter `awaitingApproval=true` show both, with the car's stage.
- **Delivery (scheduled):** once the car is received, a delivery is scheduled for a date (step 4 above) and the Delivery Team completes it. Completing records the documents and accessories handed over and requires the customer's acknowledgement. In one transaction, the order is marked delivered, the lead completed, the customer becomes the owner and the vehicle is activated. The vehicle then leaves the open stock.

### Managing the sales team (Sales Manager)

Under **Administration → Users & staff**, the Sales Manager can do the following for their own dealership only:

- create employees in the **Salesperson, CRO, Assistant Manager, Sales Admin or Delivery Team** roles (the role list only offers these);
- reset an employee's password;
- change an employee's role;
- **deactivate a leaver** by unticking *Active*. This signs them out immediately and blocks sign-in. Ticking it again restores access.

A Sales Manager cannot create or manage other managers, administrators, or staff of other dealerships. Roles that manage users are appointed by a System Admin only. Technically, these five roles are *delegated* to the `sales.team.manage` permission (`role.delegated_by`), so a manager can grant them without holding their lead or stock permissions.

### Sales dashboards and the glass UI

Every sales role's home page is a dashboard. Its figures come from `GET /api/sales/dashboard?days=7|14|30`, which is computed within the user's own view scope: a Salesperson counts only their own leads, the Admin only converted ones, and so on. Each dashboard has:

- four KPI tiles, each linking to its records;
- a daily trend (leads logged and converted), or open stock by stage for the Delivery Team;
- a breakdown (by status, by salesperson, or by stage);
- the latest relevant records.

Which dashboard a person sees depends on their permissions, not on role names.

The signed-in app uses the same glass style as the login page. The styles live in `frontend/src/index.css` (`.surface`, `.glass`, `.glass-soft`) and the backdrop in `GlassBackdrop`. On phones and tablets, the menu is a slide-in drawer.

**Lead search and phone numbers.** The Leads search matches a customer's name or phone number, however it is typed: full or partial, with or without dashes or spaces (`03001234567`, `0300 123`, `+92 300…`). Phone fields accept digits only; dashes, spaces and letters are dropped as you type.

**Date ranges.** The dashboard can show the last 7, 14 or 30 days, or a **Custom** range of any length up to 92 days. "Today" figures always mean today. The dashboard and the Leads page also show **total leads** and each status's share of the total.

**The Leads list opens on the last 30 days.** It is filtered and sorted by each lead's **latest activity**: logged, followed up, converted, order raised, delivered or corrected. An old lead converted today therefore shows under today as "Converted · Today", not on the day it was entered. The **Activity** date filter offers Today, Yesterday, 1 week, 2 weeks, 3 weeks, 4 weeks, Last 30 days, 1 year, All time and Custom (API: `activityFrom` / `activityTo`). The **total leads** box and the status counts above the list follow the same period and filters (salesperson, source, sent to AM), e.g. "1 total leads · today" (`GET /api/sales/leads/summary`). Dashboard links into the list open the period that matches their figure (e.g. "Leads today" opens Today, "Open leads" All time).

**Models on lead forms.** New lead, Edit lead and Convert to Lead list only the dealership's own brand (Hyundai Islamabad: Hyundai models). After picking the model, the Variant list shows that model's codes from **Variant codes**.

**Team leaders log leads.** The Assistant Manager and Sales Manager can add a **New lead** too. The **Salesperson** field gives it to a Salesperson or CRO of the dealership; left empty, the lead is theirs, and they follow it up and convert it like a salesperson. The lead's page says who logged it ("Logged … by …"). If the phone number already has an open lead, they see whose it is and a link to open it.

**Duplicate customers** (called "escalation" in the code). A salesperson blocked by "Duplicate lead already exists" presses **Send to Assistant Manager**. The existing lead gets a **Sent to AM** label and appears under **Duplicate customers** for the Assistant Manager, who can convert it if its salesperson is unavailable. The lead stays with its salesperson.

**Vehicle quotations and PPF vouchers.** Two separate customer documents are issued from a lead:

- a **Vehicle quotation** (`HYD-ISB-QT-2026-00001`) in Hyundai Islamabad's format. It has:
  - the brand logo (top left) and the Ittehad logo (top right), with the Ittehad Automotive letterhead;
  - **To** (the customer, or e.g. a bank A/C the customer) and **Ref**: Hyundai's `HI/<variant code>/<dd-mm-yy>`, e.g. `HI/NX4FL16THAW/26-09-26` (Jetour / CSM: the quotation number);
  - line items: the vehicle (model and variant), discount, **freight & transit insurance** and **withholding tax (filer)**, each × quantity, and the total;
  - "Standard Equipment: As per Brochure";
  - the terms and conditions, with the tentative delivery period, validity, delivery station, payment mode and the **non-filer withholding tax**;
  - the closing lines and the "Owners and Operators of …" sign-off.
  - **For letterhead paper** (an option in the preview, ticked by default for Hyundai and Jetour): Hyundai and Jetour quotations are printed on pre-printed letterhead, so the logos, header, address and footer are left out and only the middle of the page is printed (from about 52 mm down to 255 mm). Untick it for the full page, e.g. to send on WhatsApp. CSM always prints the full page.
- a **PPF voucher** (`HYD-ISB-PF-2026-00001`), filled in when the customer agrees to Paint Protection Film. It shows the PBO, customer name, email, phone, chassis, engine, sales executive, promise date, price, paid, un-paid and the manager's signature. Once the lead has a sales order (processing, vehicle received, delivered), the PBO, chassis and engine are taken from the order and locked on the form. Before that, or while the order has no vehicle yet, they are typed in (`GET /api/sales/leads/:id/order-vehicle`). PBO, chassis and engine are **required**. The customer's name, email and phone come from the lead. The coverage, film, warranty and discount are recorded too.

Every lead row ends with a document icon, and the lead's page has a **Quotations & PPF** section. After saving, the document opens in a **preview**, so it can be checked before it is **downloaded** or **printed**. Print is enabled once the preview has loaded. Hyundai and CSM use the Hyundai layout, each with its own logo. **Jetour Ittehad has its own layout** (from its Dashing / X70 and T2 i-DM quotations, one format for every Jetour model): JETOUR ITTEHAD in the Ittehad green with its contact lines and the JETOUR logo; QUOTATION with the date and the quotation's note under it (e.g. "(Limited Stock & Limited Time Offer Price)"); the To / bank name heading the table; "EX FACTORY (colour)" under the vehicle; a "Booking Price" row when a booking amount is entered; the tentative delivery period as a sentence (e.g. "ONE MONTH AFTER FULL PAYMENT.", entered on each quotation); Jetour's terms (the battery warranty line only for the i-DM PHEV); "Owned & Operated by: Ittehad Motors" and a blank STAMP & SIGNATURE space.

**Variant codes (Hyundai)** (menu → Variant codes; managed by the Assistant Manager / Sales Manager, seen by everyone who issues quotations). These are the manufacturer's codes with the description printed on the quotation, e.g. `NX4FL16THAW` — TUCSON HEV 1598CC 6A/T AWD SIGNATURE. Hyundai Islamabad starts with 19 codes. **Paste from Excel** adds the rest: copy the Code and Description columns and paste. New codes are added, known codes get the new description, and each code is linked to its model automatically. On a quotation the salesperson picks the **Model** (from the lead, changeable if the customer now wants another model; the lead keeps its own) and then the **Variant**: that model's codes, or **Other (type it)**. A code's description becomes the vehicle line and the code goes in the Ref. A typed variant is printed as typed, and the Ref is then the quotation number. For Hyundai (a format with a Ref prefix) a code or a typed variant is required when the model has codes. Jetour has no manufacturer codes, so its variants use short codes (Dashing and X70 Plus: 1.5 TCI only, `DASHING-1.5TCI`, `X70-1.5TCI`; T1: `T1-IDM` — T1 i-DM PHEV, `T1-PETROL` — T1 Petrol 1.5 TGDI; T2: `T2-IDM` — T2 i-DM PHEV, `T2-PETROL` — T2 Petrol 2.0 TGDI AWD); its quotation Ref stays the quotation number. CSM has none yet, so its salespeople type the variant.

**Models of the dealership's brand** (top of the Variant codes page; Assistant Manager / Sales Manager, permission `master.models.manage_brand`): add a model (the brand comes from the dealership, e.g. Jetour T1), rename it, or deactivate it (no longer offered on new leads). Then add its variants below with **New variant code**, choosing the model. Salespeople see the new models and variants on their lead and quotation forms straight away. API: `POST /api/master/vehicle-models/for-dealership`, `PATCH /api/master/vehicle-models/:id/for-dealership`. API: `/api/sales/variants` (list / create / update) and `POST /api/sales/variants/import`.

**PPF voucher format** (Document formats → *PPF voucher* tab). The Assistant Manager and Sales Manager can change:

- the voucher's title;
- each field's label, and which optional fields print (PBO, customer, chassis, engine and the amounts always print);
- **the dealership's own fields** (up to 10, e.g. "Film roll no."): **+ Add field** adds one, **Remove** takes it off. They print before the price, and salespeople fill them in on each voucher;
- notes printed on the voucher, and the signature lines (default "Manager Sign").

There is a sample preview before saving. Every voucher prints with the saved format, and the letterhead is the quotation format's. API: `GET|PUT /api/sales/document-templates/ppf`; a voucher's own-field values are in `extraFields`.

**Document formats** (menu → Document formats; Assistant Manager, Sales Manager, Dealership Manager and System Admin, `sales.templates.manage`). It has two tabs, **Quotation** and **PPF voucher** (above). The Quotation tab edits a dealership's quotation format:

- the letterhead (company name, tagline, address, tel, e-mail);
- the default validity, delivery period and payment mode;
- the delivery station and delivery lines;
- the terms and conditions (one per line);
- the closing lines and sign-off.

`**bold**`, `{vehicle}` and `{nonFilerTax}` can be used in the text. A line starting `[Hybrid only]` prints only for hybrid vehicles, and the non-filer line only when an amount is entered. **Preview a sample quotation** shows unsaved changes. Once saved, every quotation of the dealership, old and new, prints with the new format. The PPF voucher uses the same letterhead. Hyundai and Jetour start from their own formats; CSM starts from the Hyundai format with its own name. Their managers can adjust the wording. Each change is recorded in the activity log (before / after).

| | Issue | Correct afterwards | View / download / print |
|---|---|---|---|
| Salesperson / CRO | own leads | own documents | own documents |
| Assistant Manager | any lead | any document | all |
| Sales Manager, Sales Admin | — | — | all |

Documents are stored, so a mistake can be corrected later (**Quotations** / **PPF vouchers** in the menu, then Edit). Totals are recomputed on every change: quotation total = quantity × (price − discount + freight & insurance + withholding tax), with the discount within the order discount policy; the PPF discount and paid amount cannot exceed the price. Each document shows who created it and who last changed it. Its **History** lists every change with before and after, and all of it appears in the activity log under **Quotations & PPF**. The PDF always reflects the latest saved version and format, and jsPDF 4 is loaded only when needed (about 30 KB per file).

API: `POST /api/sales/leads/:id/quotations`, `POST /api/sales/leads/:id/ppf-forms`, `GET|PATCH /api/sales/quotations/:id` and `/ppf-forms/:id` (plus `/history` and `/document`). Formats: `GET|PUT /api/sales/document-templates/quotation?dealershipId=`. The lists filter by `leadId`, `ownerId` and `createdFrom` / `createdTo`.

**Track record** (menu → Track record; `GET /api/sales/team/track-record?dealershipId&year&month`). This shows, month by month and per salesperson:

- **leads logged** and **leads converted**, credited to the lead's salesperson (also when a team leader logged the lead for them, or the Assistant Manager converts a duplicate customer). A converted lead counts here straight away, before the Sales Admin raises its order;
- **cars booked** (sales orders raised by the Sales Admin, not cancelled) and **cars delivered**;
- **PPF sold**: how many, the total amount after discount, and the advance received;
- **quotations issued**.

The page has twelve-month charts (click a month to see it per salesperson), a table with totals, and links to the matching PPF records. Who sees what:

- **Sales Manager:** the Salespersons and CROs, plus the Assistant Manager and Sales Manager **only when they logged or converted leads of their own** in the period (never the Dealership Manager), and staff who have since left if they have records. The **Show** picker offers Everyone, **All salespersons** together, **All CROs** together (`group=salespeople|cros`), or one person (grouped as Salespersons / CROs / Team leaders).
- **Assistant Manager and Sales Admin:** the **Salespersons**, plus the Assistant Manager / Sales Manager when they logged or converted leads of their own in the period. CROs are not listed.
- **Salesperson:** their own record.

Team views have a **Salesperson** picker (`userId`) that narrows the whole page to one person. **Custom dates** (next to Year and Month; `from` / `to`, up to a year) replace the month for the tiles and the table; the chart keeps showing the year. **Download PDF** opens a preview to download or print. It shows the totals and one row per person for the chosen period only; the twelve-month table is added only for a whole-year view. After that, **each salesperson gets their own page**: their name, a one-line summary, then the customers behind the figures. That is **Leads logged** (customer, phone, interested in, source, status, **entered by**, **converted by**, dates), **Converted leads** (the same, with who entered and who converted each) and **PPF customers** (voucher, customer, phone, date, coverage, price, paid, un-paid). These details are fetched only for the download (`details=true`). It uses exactly what is on screen (the same people, period and filter), so a salesperson gets their own record, the Assistant Manager the salespeople (all or one), and the Manager everyone including CROs (all or one).

**Notifications (live).** Every change someone saves — a new lead, a lead converted, a quotation or PPF voucher, a car added to stock or moved along, a variant code, a document format change, an approval request or approval, a delivery, a new user or role — becomes a notification for **the others at that dealership whose portal it belongs to** (and group-wide users): a lead reaches whoever oversees all leads (CRO/AM/Manager as their role allows) and its own salesperson, not the other salespeople or the Delivery Team; an order, the car's stage (in transit, received…) and its delivery reach everyone who works orders or deliveries and the order's salesperson (their link opens the lead); variant codes and document formats reach those who manage them; users and roles reach those who manage staff, e.g. "New lead added · by Hyundai Salesperson 1 · just now". It is pushed **live** over a socket (Socket.IO on `/socket.io`, same port as the API): a **pop-up** appears bottom right (with **mark as read**; clicking it opens the Notifications page), and the **bell** in the top bar shows the unread count. The bell's dropdown lists the **latest 4**, with **See more** leading to **Notifications** in the sidebar: 10 per page with paging, All / Unread, and for each one what happened, who did it, the date and time, **Open** (the record), **mark as read** and **delete**; **Mark all as read** at the top.
- One action gives one notification: the most meaningful of what it saved (e.g. "Car delivered", not the paperwork around it); bulk actions collapse ("New variant code added — 12 records").
- Notifications never include customer details (names, phones), only the task, the person and a reference such as a quotation number or chassis number. Sign-ins and personal profile changes are not broadcast.
- API: `GET /api/notifications?page&pageSize&unread`, `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`, `DELETE /api/notifications/:id`. Table `core.notification` (one row per recipient; each person sees, marks and deletes only their own).

**Action needed** (`GET /api/sales/dashboard/actions`, `services/actionItems.ts`, `features/sales/actions/`). What is waiting for the signed-in person, within their own scope, shown three ways: a **clipboard** button with a count in the top bar (every page), an **Action needed** panel at the top of the dashboard, and a **pop-up** on the dashboard when something new is waiting (once per new situation in the browser session). Red items need doing now. Each item opens the list to act on:

- **Sales Manager:** cars ready for delivery whose order still needs approval (now); orders awaiting approval.
- **Sales Admin:** converted leads that need a sales order; draft orders to submit.
- **Delivery Team:** cars ready to hand over (now); booked orders waiting for a car; deliveries due today (now).
- **Assistant Manager:** duplicate customers sent to them.
- **Salesperson / CRO** (and team leaders' own leads): new leads not followed up for over a day; customers whose car is ready.

It refreshes every minute and after every change. Orders can also be filtered by the car's stage (`vehicleStage`).

**The Dealership Manager is not a salesperson.** That role runs the whole dealership and does not sell, so it is left out of every sales people list and report: the track record (rows, totals and the Show picker), the team report, and the Salesperson filters on Leads and the dashboard (`dealershipManagersSql` in `modules/sales/repository.ts`). Its login and approvals are unchanged.

**Filter by salesperson.** People who see the whole team get a person filter in three places:

- **Leads** list: a **Salesperson** filter (`ownerId`).
- **Dashboard:** a **Salesperson** picker next to the dates (`GET /api/sales/dashboard?ownerId=`). Every figure, chart and list, and the this-month panel, then shows that person only.
- **Track record:** as above.

The Manager can pick anyone in the sales team; the Assistant Manager and Sales Admin only salespeople. Salespeople never get these filters. Each sales dashboard also has a **this month** panel with the same figures (leads logged, converted, cars booked and delivered, PPF, quotations) and the latest quotations and PPF forms. The monthly chart shows converted, booked and delivered side by side, so conversions still waiting for an order are visible.

**"Visited" belongs to the CRO.** The CRO records in-person visits on social and digital leads (`sales.leads.record_visit`). A walk-in customer is already in the showroom, so salespeople don't get the option, and the server refuses "visited" on walk-in leads. Managers and the Assistant Manager still see "Visited" on the CRO's leads.

### Activity log

**Activity** (in the menu and in the avatar menu) is recorded for everyone and never edited:

- sign-ins and sign-outs, failed sign-in attempts and blocked (deactivated) accounts, password changes;
- every change to leads (logged, follow-ups, conversions, escalations, corrected details), quotations and PPF forms (issued, corrected), orders, deliveries and stock;
- staff changes: accounts created, deactivated, passwords reset, roles given.

- **My activity:** everyone always sees their own.
- **Team activity:** people with `core.activity.view_team` (the Sales Manager, the Dealership Manager and admins) see everyone's activity in their dealership, and can filter by person, name search, type (sign-ins, leads, orders, deliveries, stock, staff) and date. The date filter has quick ranges (today, yesterday, last 7 or 30 days, this month) and custom dates.
- **API:** `GET /api/core/activity/mine` and `GET /api/core/activity/team`.
- **Dealership:** sign-ins are recorded under the user's first dealership, so that dealership's managers see them.

### Correcting lead details after conversion

The salesperson who owns a lead, or the Sales Admin (`sales.leads.update_converted`), can correct the customer's name, phone, email, colour, variant and notes after conversion as well (**Customer details → Correct details** on the lead). The customer on the sales order is updated too. The model and payment details stay as converted, and completed or exhausted leads are final. Every correction is recorded in the activity log.

The Sales Manager can also change a staff member's **email** (Users & staff → Edit); emails stay unique.

**Signing out** (avatar menu → Sign out) ends the session on the server, clears everything cached in the browser, and returns to the login page.

### Seeded sales logins (development and testing only)

Each user is scoped to their own dealership only.

| Dealership | Password | Sales Manager | Assistant Manager | CRO | Sales Admin | Salespersons | Delivery Team |
|---|---|---|---|---|---|---|---|
| Hyundai Islamabad | `hyundai123` | manager@hyundai.com | am@hyundai.com | cro@hyundai.com | admin@hyundai.com | sales1@hyundai.com, sales2@hyundai.com | delivery@hyundai.com |
| Jetour Ittehad | `jetour123` | manager@jetour.com | am@jetour.com | cro@jetour.com | admin@jetour.com | sales1@jetour.com, sales2@jetour.com | delivery@jetour.com |
| Capital Smart Motors (CSM Ittehad) | `csm123` | manager@csm.com | am@csm.com | cro@csm.com | admin@csm.com | sales1@csm.com, sales2@csm.com | delivery@csm.com |

> These are **shared test passwords**. They are shorter than the 10-character password policy; the seed writes them directly. Before go-live, replace them with unique passwords and require a password reset on first sign-in.

---

## Service (Phase 4)

```
vehicle.activated ─► vehicle schedule (from the model's service schedule: 1st @1,000 km/1 mo, ...)

Check-in (visit) ──► Job card ──► Inspection ──► Estimate ──approve──► lines added to job card
open → in_progress → ready → delivered        draft → submitted → approved / rejected → revise
        (driven by the job card)   ↑ hand back marks the scheduled service done
```

- **Service schedules** are configuration: *Service → Service schedules*, one list per vehicle model, maintained with a global grant.
  - Delivering a car (Sales) publishes `vehicle.activated`; Service subscribes and builds that car's own schedule (due km and due date).
  - Cars delivered before a schedule existed have none; they are serviced as paid or repair visits.
- **Check-in computes**:
  - the **service number**: the car's next pending scheduled service;
  - the **visit number across the group**: a car can be serviced at any dealership, and servicing links it there;
  - **free-service eligibility**: free per the schedule, and within `freeServiceGraceKm` / `freeServiceGraceDays`;
  - **warranty validity**.

  It also rejects:
  - an odometer reading lower than the car's last recorded km;
  - a second live visit for the same car anywhere in the group;
  - a warranty visit out of warranty.
- **Job card**
  - A scheduled visit gets its labour line automatically (not billable when free).
  - Technicians are chosen from the users who may work job cards at that dealership.
  - Starting work requires a technician. Completing requires every line done and no estimate awaiting approval.
  - Starting and completing the job card move the visit; handing the car back marks the scheduled service done.
- **Inspection**: seeded from the configurable checklist (*Service → Inspection checklist*); each item is OK / attention / urgent.
- **Estimates**
  - Can be pre-filled from inspection findings. Lines are priced on the server; the total is recomputed on every change.
  - Locked once submitted.
  - Approval uses the same `ApprovalWorkflow` component as sales orders. It copies the lines onto the job card, where they can't be edited any more (customer-approved).
- **Line items** (`backend/src/entity/lines.ts`, `LineItemsTable` on the frontend) are a reusable engine for document lines: estimates and job cards now, and purchase orders, goods receipts and invoices next.

Seeded users for the DEV switcher (password `Demo@12345`):

- `advisor.hyundai@`, `advisor.jetour@`, `advisor.csm@dms.local`: service advisors;
- `tech.hyundai@`, `tech.jetour@`, `tech.csm@dms.local`: technicians;
- the dealership managers: approve estimates.

---

## Parts & inventory (Phase 5)

```
Purchase order ──approve──► Goods receipt (GRN) ──► stock in (receipt)      Job card ─► Parts request ─► issue ─► stock out, part line on the job card
draft → submitted → approved → partially_received → received                                              return ◄─ stock back at issue cost
Transfer: draft → dispatched (out of source) → received (into destination)    Adjustment: draft → submitted → posted (approved) / rejected
```

- **Stock engine** (`backend/src/modules/parts/stock.ts`) is the only code that changes stock. Each movement:
  - locks the branch's stock row;
  - applies the quantity, refusing to go below zero (also enforced by a database check);
  - updates the **moving-average cost** in exact Postgres numeric arithmetic;
  - appends a row to `parts.inventory_transaction`, an **append-only** ledger holding the balance and average cost after the movement.

  Multi-line documents lock rows in a fixed order to avoid deadlocks. Tests prove on-hand always equals the sum of the ledger.
- **Purchase orders**
  - Lines are entered by part number; the server looks the part up and prices the line, and a part can't appear twice.
  - Approval must come from someone other than the creator (`POLICIES.parts`).
  - Receiving can never exceed what is outstanding. It posts an immutable GRN and publishes `goods.received` for accounting.
- **Parts requests**
  - The workshop requests parts for a job card from a store branch.
  - The parts desk issues them: stock goes out at average cost, and the part appears on the job card at the selling price as a locked line.
  - Returns put stock back at the cost it was issued at and reduce the job card line.
- **Transfers**: dispatch takes stock out of the source; only staff of the destination branch can receive. Stock arrives at the dispatch cost.
- **Adjustments** (count, damage, expiry, opening stock) need approval by someone other than the preparer. Posting publishes `stock.moved`.

Seeded for the DEV switcher (password `Demo@12345`):

- `store.hyundai@`, `store.jetour@`, `store.csm@dms.local` (Storekeepers).
- A starter parts catalogue, a supplier per dealership, and opening stock at each main branch.

---

## Accounts (Phase 6)

```
Sales order (approved) ─┐                    ┌─► issue ─► Dr Receivables / Cr Sales + Sales tax
                        ├─► Invoice (draft) ─┤
Job card (completed) ───┘                    └─► cancel      issued → partially_paid → paid;  issued → void (reversal)
Receipt ─► Dr Cash/Bank / Cr Receivables (settles invoices)   Supplier payment ─► Dr Payables / Cr Cash/Bank
Goods received ─► Dr Parts inventory / Cr Payables            Parts issued ─► Dr Cost of parts / Cr Parts inventory
```

- **General journal** (`accounts.journal_entry` / `journal_line`)
  - Append-only: a trigger and revoked grants stop any update or delete.
  - Every entry balances. The posting engine (`accounts/ledger.ts`) checks this, and a deferred constraint trigger re-checks it at commit, so an unbalanced entry can never be stored.
  - Mistakes are corrected by a **reversal** (a mirror entry). Each entry can be reversed at most once.
- **Chart of accounts**
  - Each dealership gets the standard chart (`config/accounting.ts`) the first time anything posts.
  - Automatic postings find accounts by **role** (receivables, parts_inventory…), never by code. Accountants can rename accounts and add their own.
  - Accounts that have a role can't be deactivated.
- **Invoicing**
  - One engine serves both vehicle sales and service. The server copies the source's billable lines; free and warranty work is left off.
  - Tax is set per line kind in `TAX_RATES`. The defaults are parts 18%, labour 16% and vehicles 0%. **Confirm these with finance.**
  - A source document can have only one live invoice.
  - Extra charges (registration, towing…) can be added while the invoice is a draft.
- **Payments**
  - A receipt settles one or more of the customer's open invoices; any remainder stays as customer credit. It can never over-settle an invoice.
  - Voiding a payment posts the reversal and reopens the invoice.
  - An invoice can only be voided once nothing is paid against it.
- **Operational postings** run as event subscribers (`accounts/subscriptions.ts`) inside the same transaction as the stock movement, so stock and books can't disagree:
  - goods received;
  - parts issued to and returned from job cards;
  - stock adjustments.
- **Reports** (for one dealership):
  - **trial balance**, which must balance;
  - **account ledger**, with a running balance;
  - **receivables aging** (not yet due, 1–30, 31–60, 61–90, 90+ days);
  - **payables by supplier**.
- On screen:
  - sales orders and job cards show an **Invoice** panel for raising the invoice;
  - an invoice shows its lines, payments and ledger posting.

Seeded for the DEV switcher (password `Demo@12345`):

- `accounts.hyundai@`, `accounts.jetour@`, `accounts.csm@dms.local` (Accountants).
- The seed also posts the opening parts stock to the books (Dr Parts inventory / Cr Owner's equity), so the trial balance starts balanced.

---

## Dashboards (Phase 7)

The home page has two parts.

- **Right now**: live queues for the user's roles, such as orders awaiting approval, parts requests to issue and invoices to issue.
- **Performance dashboards** for a chosen period (this month, last month, last 90 days, this year or custom dates), optionally filtered to one dealership:

| Dashboard | Figures |
|---|---|
| Sales | leads and conversion, orders booked, value booked and delivered, average discount, open pipeline; deliveries per month, orders by model, leads by source, top salespeople |
| Service | check-ins, vehicles handed back, average turnaround, workshop load, job cards completed, labour and parts billed, estimate approval rate; check-ins per month and by type, advisors |
| Parts & inventory | stock value at cost, low stock, goods received, parts issued, adjustments, open requests, POs awaiting approval and on order; monthly consumption, most-used parts, stock by branch |
| Finance | invoiced (vehicles and service), collected, receivables, overdue, owed to suppliers, cash and bank, sales tax; invoiced and collected per month, largest customer balances |

**Every figure is aggregated on the server.** The query only covers what the caller's report permission reaches, and RLS applies underneath:

- `reports.<area>.view` held **globally** covers the whole group, and each dashboard adds a **By dealership** comparison table.
- `reports.<area>.view` held for **a dealership or branch** covers just that scope.
- `reports.sales.view_own` / `reports.service.view_own` cover the caller's **own** leads, orders and deliveries, or the visits they handle as advisor. Salespeople and advisors get these by default.

How it's built:

- One generic response shape: metrics, charts and tables, with a format for each value.
- Figures are computed per dealership and then added up exactly, so the headline totals and the dealership comparison always agree.
- Adding a dashboard means one builder in `backend/src/modules/reports/dashboards/` and one registry entry. The frontend's single renderer (`ReportDashboard`) draws it without changes.

---

## Database: Prisma ORM + Prisma Migrate

- **Schema:** `backend/prisma/schema.prisma` (PostgreSQL, multi-schema: core, audit, sales, service, parts, accounts). Config: `backend/prisma.config.ts`. Migrations run as the owner (`MIGRATION_DATABASE_URL`); `SHADOW_DATABASE_URL` is used by `db:migration`.
- **Migrations:** `backend/prisma/migrations/`. `0_init` is the baseline: every table, index, RLS policy, function, trigger and grant.
- **Client:** `npm install` / `npm run db:generate` generate Prisma Client into `backend/src/generated/prisma` (git-ignored). It uses the `pg` driver adapter. The app connects as `dms_app` (`DATABASE_URL`), so RLS applies.
- **Values** come back as before: ids as numbers, money as `"123.00"` strings, and `date` columns as `"YYYY-MM-DD"` (result extension in `src/db/resultExtension.generated.ts`).
- **Raw SQL** (reports, joins, row locks, RLS context) goes through Prisma: `` query(tx, sql`…`) `` / `` execute(tx, sql`…`) `` from `src/db/client.ts`. `${lead}` renders `"sales"."lead"` and `${lead.status}` renders `"lead"."status"`.

| Command (in `backend/`) | What it does |
|---|---|
| `npm run db:migrate` | `prisma migrate deploy` (applies pending migrations, keeps data), then re-applies the `dms_app` grants and syncs the permission catalog and role templates. |
| `npm run db:migration -- --name <name>` | Creates a new migration from the changes in `schema.prisma` (`prisma migrate dev --create-only`). Review the SQL and add what Prisma does not model (RLS policy, append-only trigger), then run `npm run db:generate` and `npm run db:migrate`. |
| `npm run db:generate` | Regenerates Prisma Client and `src/db/tables.generated.ts` / `resultExtension.generated.ts` after a schema change. |
| `npm run db:reset` | Drops every module schema and the migration history, then migrates from scratch. Destroys all data; refused when `NODE_ENV=production`. |
| `npm run db:seed` | Idempotent seed: dealerships, a main branch each, and the users above. |
| `npm run db:fresh` | `db:reset` followed by `db:seed`. |

An existing local database that already has this schema (built before the Prisma baseline) must be marked once with `npx prisma migrate resolve --applied 0_init`, then run `npm run db:migrate`.

### Hosted PostgreSQL (Neon)

The backend works against any PostgreSQL 16+, local or hosted. For testing it currently uses a Neon database (`backend/.env`; the local URLs are kept there as comments, so switch back by swapping the comments):

- `DATABASE_URL`: the **`dms_app`** role through Neon's **pooler** host (`…-pooler…`), `sslmode=verify-full&channel_binding=require`. The app must not use the owner role, or RLS would not apply.
- `MIGRATION_DATABASE_URL`: the owner (`neondb_owner`) through the **direct** host, `sslmode=require&connect_timeout=60` (Prisma Migrate needs a direct connection and can be slow to connect).
- One-time preparation of a new Neon database (done for the current one): as the owner, `create role dms_app login password '<strong password>'`, `grant connect on database neondb to dms_app`, and `alter database neondb set timezone to 'Asia/Karachi'` (the app's "today" is Pakistan time). Then `npm run db:migrate` and `npm run db:seed`.
- Tests always use the local `dms_test` (`backend/.env.test`) and refuse to run against any database whose name does not end in `_test`.
- Speed depends on the distance to the Neon region: every request makes several round trips to the database.

> Prisma does not model RLS policies or triggers, so they live in the migration SQL. `test/schema.test.ts` fails if a table has no RLS, or if an FK or tenant column has no index.

---

## Testing

```bash
npm test                    # backend (rebuilds dms_test from the migrations) then frontend tests
npm run typecheck           # both projects
```

The backend tests run against a real PostgreSQL database (`dms_test`), connecting as the non-owner role so RLS is exercised. Some tests enforce rules across the whole codebase, so every future module is checked automatically:

- `routes.test.ts`: every non-auth route declares a permission; every secured route returns **401** without a token and **403** for a user lacking the permission; operationIds are unique.
- `schema.test.ts`: every foreign key is indexed; every table with `dealership_id` has RLS enabled; every `dealership_id`/`branch_id` column is indexed.
- `rls.test.ts`: RLS isolates tenants even for unfiltered queries, tenant context does not leak across pooled connections, and the audit log is append-only.
- `auth`, `tenancy`, `users`, `roles` tests: login, refresh-token rotation with reuse detection, scope visibility (a record out of scope returns 404, not 403), privilege-escalation guards, and permission edits taking effect on the next request.

---

## Security model

1. **Authentication**: a 15-minute JWT access token, kept in memory on the client, plus a rotating refresh token in an httpOnly `SameSite=Strict` cookie scoped to `/api/auth`. Reusing a rotated refresh token revokes every session for that user. Deactivating a user or resetting their password invalidates their access tokens immediately (`token_version`).
2. **RBAC**: users → roles → permissions (`module.resource.action`, e.g. `sales.orders.view_own`).
   - Each role assignment carries a scope: global (all dealerships), one dealership, or one branch.
   - Roles and their permissions are data, editable at runtime under *Roles & permissions*. Authorization code never checks role names.
   - Permission codes are declared in code (`modules/*/permissions.ts`) and synced into the database.
3. **Server-side scope on every endpoint**: `ApiRouter.route()` requires a permission declaration. Every list and detail query adds a WHERE clause for the caller's scope, including own-vs-all rules. Writes are checked against the target dealership/branch.
4. **Postgres RLS underneath**: each request runs in one transaction that sets `app.dealership_ids` / `app.global`. RLS policies on tenant tables hide everything else, even from a buggy query. The app connects as `dms_app`, a non-owner role, so RLS applies.
5. **Append-only tables**: the audit log and workflow history (and, from later phases, the inventory ledger and journal) reject UPDATE/DELETE through grants and a trigger.
6. **No privilege escalation**: you can only assign a role if you hold all of its permissions over the target scope. Users cannot change their own role assignments.

---

## Adding a module with the generic pattern

Example: a `Supplier` entity in the `parts` module.

### Backend

1. **Model**: add it to `prisma/schema.prisma`, then create the migration and regenerate:

   ```prisma
   model Supplier {
     id           BigInt     @id @default(autoincrement())
     dealershipId BigInt     @map("dealership_id")
     name         String
     createdAt    DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt    DateTime   @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
     dealership   Dealership @relation(fields: [dealershipId], references: [id])

     @@index([dealershipId])
     @@map("supplier")
     @@schema("parts")
   }
   ```

   ```bash
   npm run db:migration -- --name add_supplier   # then add to the generated migration.sql:
   #   alter table parts.supplier enable row level security;
   #   create policy tenant_isolation on parts.supplier
   #     using (core.app_tenant_visible(dealership_id)) with check (core.app_tenant_visible(dealership_id));
   npm run db:generate && npm run db:migrate
   ```

   Re-export the identifier from `src/modules/parts/models.ts` (`export { supplier } from '../../db/tables.generated'`). The schema tests fail if you forget RLS, or an index on an FK or tenant column.

2. **Permissions**: `src/modules/parts/permissions.ts`:

   ```ts
   export const PartsPerm = definePermissions('parts', {
     suppliersView: ['parts.suppliers.view', 'View suppliers'],
     suppliersCreate: ['parts.suppliers.create', 'Create suppliers'],
     suppliersUpdate: ['parts.suppliers.update', 'Edit suppliers'],
   });
   ```

   New codes are granted automatically to existing default roles whose template patterns match (`src/modules/core/defaultRoles.ts`).

3. **Schemas + EntityConfig**: `schemas.ts` holds Zod read/create/update schemas. `entities.ts`:

   ```ts
   export const supplierEntity: EntityConfig = {
     entityType: 'parts.supplier', module: 'parts', path: 'suppliers',
     names: { singular: 'Supplier', plural: 'Suppliers' },
     table: supplier,
     schemas: { read: SupplierSchema, create: SupplierCreate, update: SupplierUpdate },
     permissions: { view: PartsPerm.suppliersView, create: PartsPerm.suppliersCreate, update: PartsPerm.suppliersUpdate },
     tenant: { dealershipKey: 'dealershipId' },
     search: ['name'],
     sort: { default: 'name', keys: ['name', 'createdAt'] },
     // optional: ownerKey (enables *_own permissions), filters, hooks, workflow
   };
   ```

4. **Router**: `router.ts` exports `[buildEntityRouter(supplierEntity).router, ...customRouters]`, then add it to `src/modules/index.ts`. That gives you paginated, searchable list, detail, create, update, history and workflow endpoints, all scope-filtered and audited.

   For approvals, add a `workflow` (states + transitions, each with its own permission, optional guard and effect). You then get `GET /workflow` and `POST /:id/transitions`, with history recorded in `core.workflow_transition`.

5. `npm run db:migrate`, then `npm test`. The coverage tests cover the new routes automatically.

### Frontend

1. `npm run api:sync` re-exports the OpenAPI schema and regenerates the typed RTK Query hooks. For a new module, add an `outputFiles` entry in `openapi-config.cjs` (e.g. `./src/features/parts/partsApi.generated.ts` for `/api/parts`) and a `partsApi.ts` next to it that re-exports the hooks.

2. Describe the screens once in an `EntityViewConfig`: list columns and filters, detail fields and sections, form fields and Zod schema, and the generated hooks.

3. Route it: `entityRoutes('suppliers', supplierView)` inside the module's `routes.tsx`. The router lazy-loads each module as its own chunk. Add a sidebar entry in `src/app/navigation.ts`, and dashboard widgets in `src/features/reports/dashboardWidgets.tsx`.

The shared building blocks are `EntityListView`, `EntityDetailView`, `EntityFormView`, `ApprovalWorkflow`, `AuditTrailPanel` and `DashboardWidget`. The `usePermission()` hook hides actions in the UI; the server enforces the same rules independently.
