# HANDOVER — Dealership DMS (Ittehad group), Sales portal

This file is the hand-over for any new Claude Code session (or developer) picking up this project.
It explains what the software is, what has been built, how to run and test it, the rules the owner
has set, and the lessons learned so far. **Read it fully before changing anything.**

`README.md` is the detailed feature reference (one section per module); this file is the map.

---

## 1. Prompt to give a new Claude Code session

Open Claude Code in `E:\Hyundai dealership software\Portal` and paste this:

```text
You are continuing work on my dealership software in this folder (E:\Hyundai dealership software\Portal).
Before doing anything, read HANDOVER.md in the project root completely, then skim README.md
(sections "Running it", "Project structure", "Sales", "Database: Prisma ORM + Prisma Migrate", "Testing",
"Adding a module with the generic pattern").

Context in short:
- It is a multi-dealership DMS (Hyundai Islamabad, Jetour Ittehad, CSM Ittehad) under Ittehad.
- Stack: Express 5 + TypeScript + Prisma ORM + PostgreSQL (RLS) backend, React + Vite + Tailwind 4
  frontend, RTK Query generated from the backend's OpenAPI. No Docker. Schema changes go through
  Prisma migrations (backend/prisma/).
- Right now I am ONLY working on the SALES portal (leads, orders, delivery, quotations, PPF
  vouchers, dashboards, track record). Service, Parts and Accounts exist but are hidden; do not
  work on them unless I ask.

How I want you to work:
- Follow the rules in HANDOVER.md section 6 (no Docker, Prisma migrations + db:migrate, api:sync, folder
  structure, tests, README updates, never touch my dev servers on ports 4000/5173 or the
  PostgreSQL 18 on port 5432).
- For every change: backend + frontend + tests, then run typecheck, tests and build, and verify
  in a browser on the test copy (HANDOVER.md section 8). Tell me honestly what passed and what did not.
- Update README.md (and HANDOVER.md section 9/10 if something important changes).
- I write informally; if something I ask is unclear, ask me one short question before building.

First, confirm you have read HANDOVER.md by summarising in 5 bullet points what the sales portal
does today and what is still open (section 10). Then wait for my next request.
```

---

## 2. What this software is

- **Dealership DMS / ERP** for the Ittehad group's dealerships:
  - **Hyundai Islamabad** — code `HYD-ISB`, brand Hyundai
  - **Jetour Ittehad** — code `JET-ITH`, brand Jetour
  - **CSM Ittehad** — code `CSM-ITH`, brand Capital Smart Motors
- Dealerships are data (defined once in `backend/src/config/dealerships.ts`, seeded, then managed
  in Administration). Everything is **multi-tenant**: every record belongs to a dealership (and
  optionally a branch) and PostgreSQL Row-Level Security keeps dealerships apart.
- Modules in the code: core (users, roles, dealerships, activity), master (customers, vehicles,
  models), **sales**, service, parts, accounts, reports.
- **Current phase: Sales only.** Service, Parts and Accounts are hidden in the UI through
  `frontend/src/shared/config/modules.ts` (their code and API still exist). Work on them comes later.

## 3. Stack

| Part | Technology |
|---|---|
| Backend | Node 24, Express 5, TypeScript, Prisma ORM 7 (`pg` driver adapter; models camelCase mapped to snake_case), Zod 4 + zod-to-openapi, JWT auth, Vitest |
| Database | PostgreSQL 16 with Row-Level Security; schema in `backend/prisma/schema.prisma`, applied by Prisma Migrate (`backend/prisma/migrations`, baseline `0_init`) via `npm run db:migrate` |
| Frontend | React 19, Vite, Tailwind CSS 4, React Router, RTK Query **generated** from the backend OpenAPI (`npm run api:sync`), Zod forms, jsPDF 4 (lazy-loaded) for PDFs |
| Tests | Backend Vitest against the `dms_test` database; frontend Vitest + jsdom |

## 4. Running it (this Windows machine)

- **PostgreSQL 16** (project database) lives in `%LOCALAPPDATA%\pgsql`, data in
  `%LOCALAPPDATA%\pgdata16`, **port 5433**. Start it (PowerShell):
  `& "$env:LOCALAPPDATA\pgsql\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\pgdata16" -l "$env:LOCALAPPDATA\pgdata16.log" -o "-p 5433" -w start`
  - Roles: `dms` (owner: schema sync, seed) and `dms_app` (runtime, RLS applies). Databases: `dms` (development) and `dms_test` (tests / test copy).
  - **A separate PostgreSQL 18 service on port 5432 belongs to the owner — never touch it.**
- First time: root `npm run setup` (with `PG_SUPERUSER_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres`).
- Every day: root `npm run dev` → backend **http://localhost:4000**, frontend **http://localhost:5173**.
  It first **starts the project's PostgreSQL if it is not running** (`scripts/ensure-db.mjs`; e.g. after a restart). `npm run db:start` does only that.
  Symptom when the database is down: API logs `connect ECONNREFUSED 127.0.0.1:5433`; the API answers **503 "The system cannot reach its database right now"** (`http/errorHandler.ts`), so sign-in fails. The project's PostgreSQL is not a Windows service: **after a PC restart it is off** until something starts it. `npm run dev` in the root **and** in `backend/` (its `predev` script) start it first; otherwise run `npm run db:start`.
  These are the **owner's own dev servers — never stop or restart them**; use the test copy (section 8).
- The app opens on the **login page** (dev auto sign-in is off by default).
- Seeded logins (**development / testing only**; shared passwords, replace before go-live):
  - Per dealership, 7 sales users: `manager@`, `am@`, `cro@`, `admin@`, `sales1@`, `sales2@`, `delivery@`
    - `…@hyundai.com` password `hyundai123`
    - `…@jetour.com` password `jetour123`
    - `…@csm.com` password `csm123`
  - System admin `admin@dms.local` / `Admin@12345`.

### Useful commands

| Where | Command | What it does |
|---|---|---|
| backend | `npm run db:migrate` | Apply pending Prisma migrations to the dev DB, re-apply app-role grants and sync permissions (new permission codes are granted to existing roles from `defaultRoles.ts`) |
| backend | `npm run db:migration -- --name <name>` | Create a migration from `schema.prisma` changes (add RLS policy / triggers by hand), then `npm run db:generate` |
| backend | `npm run db:seed` | Idempotent seed (adds only what is missing) |
| backend | `npm run db:fresh` | Reset + seed (**wipes data**; use only on `dms_test` via the test helper) |
| backend | `npm test` | All backend tests (about 700; ~12 min) — **resets `dms_test`** |
| backend | `npx tsc --noEmit -p .` | Typecheck |
| frontend | `npm run api:sync` | Export OpenAPI from the backend and regenerate RTK Query hooks — run after **any** backend route/schema change |
| frontend | `npx tsc -b --noEmit`, `npm test`, `npm run build` | Typecheck, tests, production build |

## 5. Architecture in brief

### Backend (`backend/src`)
- `entity/` — the **generic entity engine**: `EntityConfig` + `EntityService` + `buildEntityRouter`
  give list / get / create / update / history / workflow transitions for any table, with
  permissions (`view`, `viewOwn`, `create`, `update`, `updateOwn`, `viewWhen`), tenant scope,
  owner key, filters, search, sort, hooks (`beforeCreate`, `beforeUpdate`, `decorate`) and an
  audit record for every change. Most sales records are entity configs in `modules/sales/entities.ts`.
- `modules/<module>/` — `models.ts` (generated table identifiers for raw SQL + constants), `schemas.ts` (Zod + OpenAPI), `permissions.ts`,
  `entities.ts`, `services/*.ts` (business operations), `router.ts` (routes via `ApiRouter`).
- `modules/core/defaultRoles.ts` — role templates (patterns of permission codes). `db:migrate` adds new codes to existing roles.
- `modules/core/documents.ts` — document numbering `CODE-XX-YYYY-00001` (e.g. `HYD-ISB-QT-2026-00001`).
- `lib/money.ts` — exact money in paisa (`toPaisa`, `fromPaisa`, `addMoney`, `mulMoney`…). Never use floats for money.
- `db/client.ts` — Prisma Client (`db`), `transaction`, `withTenantTx` (sets the RLS context), `query` / `execute` for raw SQL (`sql` helpers in `db/sql.ts`). RLS helper functions (`core.app_tenant_visible`, `core.app_user_id`…) are in the `0_init` migration.
- Dates are **Pakistan time** (`Asia/Karachi`) for "today", day filters and documents: use `pakistanToday()` / `addDays()` from `lib/dates.ts`, never `new Date().toISOString().slice(0, 10)` (that is the UTC date — still yesterday between midnight and 5 AM in Pakistan; the database's `current_date` is Pakistan time).

### Frontend (`frontend/src`)
- `features/<feature>/` — one folder per feature; `features/sales/` holds leads, orders, deliveries,
  stock, documents (quotations / PPF / formats / variant codes), team (team report, track record), dashboard.
- `shared/entity` + `shared/components/EntityListView|EntityDetailView|EntityFormView` —
  **config-driven screens**: a feature describes columns, filters, fields and API hooks in an
  `EntityViewConfig`, the shared views render list / detail (with history) / form.
- `features/<f>/<f>Api.generated.ts` — generated by `api:sync`; `salesApi.ts` adds cache invalidation.
- `app/navigation.ts` — menu (items shown by permission). `shared/config/modules.ts` — which modules are visible.
- Glass UI: `.surface`, `.glass`, `.glass-soft` in `index.css`, `GlassBackdrop` component.

## 6. Owner's rules (follow these)

1. **Sales only** for now. Do not change Service / Parts / Accounts unless asked.
2. **No Docker.** Schema changes = edit `prisma/schema.prisma` → `npm run db:migration -- --name <name>` (add RLS policy / triggers to the SQL) → `npm run db:generate` → `npm run db:migrate`.
3. After backend route/schema changes run `npm run api:sync` in `frontend` (never hand-edit generated files).
4. Keep the **clean structure**: a folder per feature/component, `index.ts` exports, shared code in `shared/`, same shape in every feature. Match the surrounding code's naming, comments and style.
5. Every feature gets **tests** (backend Vitest; frontend where logic is pure) and a **README.md** update.
6. **Never touch** the owner's dev servers (ports 4000 / 5173) or PostgreSQL 18 on port 5432. Test in the test copy (section 8).
7. Permissions are decided by **permission codes**, never by role names.
8. Real dealership names only (Hyundai Islamabad, Jetour Ittehad, CSM Ittehad).
9. Internal software: no rate limiter; keep Zod.
10. The owner writes informally (short, mixed English); when a request is ambiguous ask one short question, otherwise build it end-to-end and verify it.
11. Report honestly: what passed, what failed, what was not verified.

## 7. The Sales portal — what is built

### Roles (each scoped to one dealership)
| Role | What they do |
|---|---|
| **Salesperson** | Logs walk-ins / calls, follows up, converts own leads; issues and corrects **own** quotations and PPF vouchers; sees own dashboard, own track record |
| **CRO** | Like salesperson for social / digital leads; the only one who records **"Visited"** (walk-ins are already in the showroom) |
| **Assistant Manager (AM)** | Sees all leads; logs and converts own leads (or logs them for a salesperson); converts duplicate customers sent to them; reopens exhausted leads; issues / corrects **any** quotation and PPF voucher; edits **Document formats** and **Variant codes** |
| **Sales Manager** | Department head: all leads, orders, stock; logs and converts own leads (with quotations / PPF); reopens exhausted leads; approves orders (draft or submitted); team report, track record; manages staff (create, reset password, deactivate, assign sales roles); views / downloads / prints documents; edits **Document formats** and **Variant codes** |
| **Sales Admin** | Sees leads once converted; raises the sales order (PBO / CBO), enters chassis / engine; corrects converted lead details; views / downloads / prints documents |
| **Delivery Team** | One login for all dealerships: open stock (registers incoming vehicles, straight onto a waiting order), allocates stock to booked orders (from draft), logistics statuses, hands over once the order is approved ("Mark as delivered"); no access to leads |

### Lead → order → delivery
- **Leads** (`features/sales/leads`, `modules/sales/entities.ts` + `services/leads.ts`): statuses `new → follow_up → (visited) → converted → processing → completed`, or `exhausted` (needs ≥ 3 follow-ups).
  - One active lead per phone per dealership; a salesperson who hits a duplicate presses **Send to Assistant Manager** (on screen: "Duplicate customers" menu, "Sent to AM" label; in code and API: *escalate / escalated*). Never show the word "escalate" to users.
  - The list opens on the **last 30 days by latest activity** (an old lead converted today shows under today); date presets + custom range.
  - Search by name or phone (typed any way); phone inputs accept digits only.
  - Status summary with totals and share per status.
  - Salesperson / Sales Admin can **correct customer details after conversion** (`PATCH /sales/leads/:id/details`).
- **Leads list** defaults to the last 30 days of activity (`dateRange.defaultPreset: '30d'`; presets in `EntityListView` RANGES). The summary above it (`LeadStatusSummary`, `GET /sales/leads/summary`) uses the list's period and filters; list `header` gets `{ query, periodLabel }`. Links into the list set `range` explicitly; the sidebar ignores `range` when choosing the active item.
- **Custom form fields get live values** (`FormFieldControl` → `CustomControl` with `useWatch`); before, `values` was a snapshot, so a field depending on another (variant on model) never updated.
- **Lead model list = the dealership's brand** (`leads/useLeadModelOptions.ts`, `components/LeadModelSelect`; `useVehicleModelOptions(brands?)` in crm). UI only: the server does not check the model's brand.
- **Model is required** on every lead; **variant, colour and email only at conversion** (`ConvertLeadBody`), and the variant cannot be cleared afterwards (`LeadDetailsBody`). Conversion also takes an optional corrected `prospectName` / `prospectMobile` (duplicate-checked; the customer record follows; audited as `details.update`). The variant field is `features/sales/leads/components/VariantPicker`: a dropdown of the chosen model's variant codes (`/sales/variants?modelId=`) plus **Other (type it)**; models without codes get a text box. The lead stores the text (a code's description or typed).
- **Convert to Lead** captures model, variant, colour, email, payment instrument → the Admin raises the **sales order** (PBO / CBO) → the Delivery Team allocates and tracks the car from booking → the Manager approves (draft or submitted) → hand-over ("Mark as delivered"); the lead moves to processing → completed.
- **Open stock / Delivery Team** (`features/sales/stock`, `deliveries`). One group-wide login (`delivery@ittehad.com`, role at all three dealerships; seeded in `scripts/seed.ts`; the old per-brand delivery logins are deactivated in the dev DB). Orders are worked from booking (`LIVE_ORDER_STATES` = draft / submitted / approved in `services/orders.ts`; list filter `live=true`); scheduling a delivery still requires `approved`. `POST /sales/stock` takes an optional `orderId`: the car is linked to that order and created as `received` (`services/stock.ts`, form field `stock/WaitingOrderSelect.tsx`). The lead carries `vehicleStage` (`ORDER_VEHICLE_STAGE` in `repository.ts`), shown to the salesperson / AM in the lead's Sales order section.

### Dashboards, reports, activity
- **Notifications (live)** (`modules/core/notifications.ts`, `lib/realtime.ts`, `features/notifications/`): built in `http/apiRouter.ts` from each request's audit entries (`ctx.audit`), saved in the same transaction (`core.notification`, one row per recipient: active users with a role at the change's dealership, or a global role, except the actor), and pushed over Socket.IO (`notification:new` to room `user:<id>`) **after commit**. The socket authenticates with the access token (`handshake.auth.token`); the Vite dev proxy forwards `/socket.io` with `ws: true`. Titles: `describeChange()` (highest weight per request wins; same kind collapses). No customer data in titles/details. RLS: read own (+ ones you caused, for `RETURNING`), mark/delete own. Test: `test/notifications.test.ts` (real listening server + socket client). The top-bar clipboard is **Action needed**; the bell is **Notifications**.
- **Role dashboards** (`features/sales/dashboard/SalesDashboard.tsx`): KPI tiles, daily trend chart, breakdowns, latest records, periods 7/14/30 days or custom (≤ 92 days), and a **"This month" panel** (leads logged, converted, cars booked / delivered, PPF sold + amount, quotations, latest documents).
- **Team report** (Sales Manager): per-person record for a period.
- **Track record** (`/sales/track-record`, `services/trackRecord.ts`): month by month and per salesperson — every stage: leads logged, **converted** (credited to the lead's salesperson, counted before any order exists), cars booked (orders raised by the Sales Admin), cars delivered, PPF sold (count, amount, advance), quotations. **Sales Manager sees Salespersons and CROs (plus team leaders with activity; never the Dealership Manager); AM / Sales Admin see the salespeople** (users who hold `sales.leads.convert_own` but neither `sales.leads.view_all` nor `sales.leads.record_visit` — Salespersons, not CROs) **plus team leaders (`view_all` holders) with activity of their own in the period** (e.g. the AM's own leads); a salesperson sees their own. Detail rows (`details=true`) carry `enteredBy` (lead `created_by_id`) and `convertedBy`; the PDF prints both. The lead response has `createdByName` ("Logged … by …" on the lead page). Team views narrow to one person (`userId`). Custom dates (`from` / `to`). **Download PDF** of what is on screen (`features/sales/team/trackRecordPdf.ts`).
- **Person filter** for team viewers: Leads (`ownerId`), dashboard (`ownerId`, all figures and lists follow), Track record (`userId`). Options come from `/sales/team/members` (`sellsCars` flag); the Manager can pick anyone, AM / Admin only salespeople (`features/sales/team/useSalespersonOptions.ts`).
- **Activity log** (`/activity`): everyone sees their own sign-ins and every change; managers see the team with filters (person, type, dates). Categories include "Quotations & PPF".
- **Staff management** by the Sales Manager (delegated roles via `role.delegatedBy = 'sales.team.manage'`).
- **Login page**: glass design, Ittehad Motors logo, Hyundai / Jetour / CSM logos in one row, no page scroll, mobile-compact.

### Customer documents (`features/sales/documents`, `modules/sales/services/documents.ts`)
Issued from a lead (row icon at the end of every lead, or "Quotations & PPF" on the lead page).
After saving, the document opens in a **preview** → **Download PDF** / **Print** (print enabled once the preview has loaded; download saves exactly the previewed bytes).

- **Vehicle quotation** — Hyundai Islamabad's own format, **always one page** (terms text shrinks slightly only if a format has many terms):
  - Header: brand logo top-left, **Ittehad logo top-right**, "Ittehad Automotive", tagline "(An Ittehad Steel Company)", address, tel, e-mail.
  - "QUOTATION" bar with date `dd-mm-yy`; **To** (customer or e.g. "Bank … A/C customer") and **Ref**.
  - **Ref = `HI/<variant code>/<dd-mm-yy>`** for Hyundai (e.g. `HI/NX4FL16THAW/26-09-26`); Jetour / CSM print the quotation number. The prefix "HI" is in the dealership's format (Ref prefix).
  - Items table: SR, vehicle description, QTY, unit price, total — vehicle, less discount (if any), **freight & transit insurance**, **withholding tax (filer)**, TOTAL. Total = qty × (price − discount + freight + WHT). Discount follows the order discount policy.
  - "Standard Equipment: As per Brochure"; terms: tentative delivery period, delivery lines, validity, delivery station, payment mode, "ORDER WILL BE BOOKED ON CONFIRM PURCHASE ORDER", the numbered terms (with **non-filer withholding tax** filled in), closing lines (hybrid battery line only for hybrids), sign-off "Owners and Operators of Hyundai Islamabad", "Prepared by" salesperson. **No stamp** (stamped by hand after printing).
- **Variant codes (Hyundai)** (`/sales/variants`, table `sales.vehicle_variant`): manufacturer codes + the description printed on the quotation (19 seeded in `modules/sales/variantCatalog.ts`, e.g. `NX4FL16THAW — TUCSON HEV 1598CC 6A/T AWD SIGNATURE`). AM / Manager **paste from Excel** (Code / Description columns) to add or update. On a quotation the salesperson picks from **all vehicles' codes** (lead's model first); the code sets the model, the printed description and the Ref. For Hyundai a code is **required**. Jetour / CSM have no codes and type the variant.
- **Document formats** (`/sales/document-formats`, table `sales.document_template`, `services/templates.ts`; tabs Quotation / PPF voucher; `sales.templates.manage` = AM, Sales Manager, Dealership Manager, System Admin): they edit the letterhead, Ref prefix, default validity / delivery days / payment mode, delivery station and lines, terms (one per line; `**bold**`, `{vehicle}`, `{nonFilerTax}`, `[Hybrid only]`), closing lines, sign-off; **sample preview** before saving. Saved formats apply to every quotation (old and new) of that dealership. Built-in default: Hyundai's text; Jetour / CSM get the same format with their own names.
- **PPF voucher** (Paint Protection Film): PBO, customer name, email, phone #, chassis, engine, sales executive, promise date, price, paid, un-paid, manager sign (+ coverage / film / warranty). **One page**, same header. **PBO, chassis and engine are required**. When the lead has a sales order (processing / vehicle received / delivered) they come from the order and are locked; otherwise they are typed in (`GET /sales/leads/:id/order-vehicle`). Customer name / email / phone come from the lead.
- **PPF voucher format** (Document formats → PPF voucher tab; `document_template.kind = 'ppf'`): title, renamed labels (`fieldLabels`), optional fields left off (`hiddenFields`), the dealership's own fields (`customFields`, edited as a list with **+ Add field** / Remove; values stored per voucher in `ppf_form.extra_fields`), notes (`terms`) and signature lines (`signOff`). Letterhead = the quotation format's.
- Documents are **stored and correctable**: salesperson (own) and AM (any) edit them later; Manager and Admin only view / download / print. Each shows **who created and who last changed** it; full history with before / after; everything in the activity log.
- Permission codes: `sales.quotations.*`, `sales.ppf.*`, `sales.templates.manage`, `sales.variants.view`.

## 8. Testing and verification (how work is checked here)

- **Backend:** `cd backend && npm test` (Vitest, ~700 tests, ~12 min). Uses **`dms_test` and resets it** — anything else using `dms_test` (the test copy) loses its data.
- **Frontend:** `cd frontend && npx tsc -b --noEmit && npm test && npm run build`.
- **Browser checks on a test copy** (never the owner's servers):
  1. Reset + seed `dms_test`: run `npm run db:fresh` in `backend` with `DATABASE_URL` / `MIGRATION_DATABASE_URL` taken from `backend/.env.test` (both must point at `dms_test`).
  2. Test backend on **port 4001** with the same env (`PORT=4001`, `NODE_ENV=development`): `npx tsx src/server.ts`.
  3. Test frontend on **port 5191**: `API_URL=http://localhost:4001 npx vite --port 5191 --strictPort` (in `frontend`).
  4. Drive headless Chrome over the DevTools protocol (Node script), sign in as the seeded users, click through, download PDFs and read their text.
  5. Afterwards stop only ports 4001 / 5191 (find the PID by port; a stopped `tsx` can leave node listening).
- Run backend tests **before** or **after** a browser session, not during (they wipe `dms_test`).

## 9. Lessons learned / gotchas

- **Editor overwrote a file once**: `schemas.ts` was replaced by an older copy open in VS Code. If VS Code says "file changed on disk", choose *Revert*. After big edits, grep that expected exports still exist.
- **jsPDF**: outputting the same document twice gives an **uncompressed** second file — output once and reuse the blob (see `DocumentPreview.tsx`). jsPDF escapes `(` `)` in text streams, so PDF text checks must allow `\(`.
- **Postgres**: an output alias cannot be used inside an `ORDER BY` expression — wrap the query (see `trackRecord.ts`).
- **OpenAPI names**: entity read schemas are named from `names.singular` without spaces ("PPF form" → `PPFForm` → type `PpfForm`).
- **RTK cache tags** come from OpenAPI tags (the entity's singular name, e.g. `'PPF form'`, `'Variant code'`); add invalidations in `salesApi.ts`.
- **Shell on Windows**: inline `node -e` / `sed` strips backslashes in regexes — write edit scripts to files instead. `.ts` scratch scripts with top-level await must be `.mts` and run from inside `backend/` to resolve packages.
- **Test dealership brand** in backend tests is `TestBrand`; Hyundai-only behaviour (Ref prefix, code required, model detection) needs `brand: 'Hyundai'` set in the test.
- **Starting PostgreSQL from Node on Windows**: run `pg_ctl start` with `stdio: 'ignore'` — with pipes the server inherits them and the call never returns (fixed in `scripts/ensure-db.mjs`).
- **Midnight–5 AM bugs**: anything using the UTC date shows up only in that window. Sales / master code uses `lib/dates.ts`; tests must use `pakistanToday()` too. Running the backend suite in that window is a good check.
- **A page crash** shows `app/RouteError` (message + Reload) inside the layout instead of the React Router developer screen. After `api:sync` changes generated hooks, an open tab can be in a mixed state until reloaded.
- **Tests are not run unless the owner asks** (their instruction, 2026-09-28): still run typecheck + build, write/update tests, and offer to run them.
- **db:migrate only grants NEW permission codes to existing roles.** When a role template gains an existing code (e.g. 2026-09-28: AM / Sales Manager got `sales.leads.create`, `update_own`, `convert_own`), grant it to existing roles with a one-off SQL insert into `core.role_permission` (done on the dev DB); a fresh DB gets it from the template.
- **Stale seed data**: `db:seed` only adds missing rows; to add new reference data to the dev DB without re-adding deleted demo data, write a small targeted script.

## 10. Status and open items (as of 2026-09-28)

Done and verified: everything in section 7 (backend ~698 tests, frontend 34 tests, browser checks on the test copy).

Open / waiting on the owner:
- **More Hyundai variant codes**: the owner will send the full list → AM / Manager paste them under Variant codes (or add them to `variantCatalog.ts` for new databases).
- **Jetour / CSM**: same quotation layout with their logos; they have no variant codes and use the quotation number as Ref. If they get their own codes / Ref format or terms, add them via Variant codes / Document formats.
- **Go-live**: replace the shared seeded passwords; review `DEV_AUTO_LOGIN` stays off.
- **Later phases**: Service, Parts, Accounts (hidden now; switch on in `modules.ts` when the owner asks).
- **Accounts / Reports use the UTC date** (`accounts/entities.ts`, `ledger.ts`, `reports.ts`, `service.ts`, `reports/scope.ts` define `today()` with `toISOString`) while their SQL uses `current_date` (Pakistan). Between midnight and 5 AM invoice dates, overdue ageing and report periods are a day off, and 3 tests in `accounts.test.ts` / `reports.test.ts` fail in that window. Fix with `lib/dates.ts` (and the tests' `today()`) when those modules are picked up.

## 11. History (short)

1. Built the full DMS (phases 1–7: core, customers & vehicles, sales, service, parts, accounts, dashboards) on PERN; removed Docker; schema pushed with Drizzle (later replaced by Prisma, see below).
2. Focus switched to **Sales**: real login page, other modules hidden, sales folder restructured, Delivery Team / Open stock, Sales Manager manages staff.
3. Login page redesign (glass, logos), glass dashboards with charts, leads search / filters, activity log, custom date ranges, lead detail corrections, leads default to today, "Visited" CRO-only.
4. Customer documents: vehicle quotation → stored quotations + PPF, preview / download / print, edit history, track record, this-month dashboard panel.
5. Hyundai quotation format (one page), editable Document formats, PPF voucher layout, variant codes with paste-from-Excel, Ref `HI/<code>/<date>`, both logos in the header, PPF data from the order.
6. **Drizzle → Prisma** (2026-09-29): Prisma ORM 7 + Prisma Migrate replace Drizzle completely (baseline `0_init` = the previous schema incl. RLS/triggers/grants; raw SQL via `$queryRaw`; API values unchanged). Existing databases: `npx prisma migrate resolve --applied 0_init` once.
