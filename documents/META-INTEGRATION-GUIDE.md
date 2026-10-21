# Meta lead ads → CRO portal: setup guide

How leads from your Facebook / Instagram ads land in the dealership portal, and how to connect
**Hyundai Islamabad**, **Jetour Ittehad** and **CSM Ittehad** (one Meta Business Suite, three Pages).

> The portal side is built and typechecked, but it has **not yet been tried against real Meta**.
> Do the test in step 9 before spending money on ads. Meta renames menus from time to time, so a
> button may be called slightly differently from what is written here.

---

## 1. What happens

```
Customer fills the form in your ad (Facebook / Instagram)
        │
        ▼
Meta calls your server:  POST https://ittehad-erp-production.up.railway.app/api/meta/webhook
        │  (signed with your App Secret, so nobody can fake it)
        ▼
The server asks Meta for the lead's details (name, phone, email, city, campaign, ad, every answer)
        │
        ▼
A "social media lead" is saved for the dealership that owns that Facebook Page
        │   Jetour Page → Jetour Ittehad     Hyundai Page → Hyundai Islamabad     CSM Page → CSM Ittehad
        ▼
It is given to the CRO of that dealership with the fewest Meta leads (an even share),
all CROs of that dealership get a live notification, and the lead is due a follow-up in 2 days.
```

- A lead only ever appears for the dealership of the Page it came from. Hyundai CROs never see Jetour leads.
- **You connect once per Page. New ads need nothing**: every ad that runs from a connected Page flows in automatically.
- If the same phone number already has an open lead at that dealership, no second lead is created.
- If Meta delivers the same lead twice, it is saved once.

---

## 2. What you need before starting

- [ ] Admin access to the **Meta Business Suite / Business Manager** that owns the three Pages.
- [ ] The three Facebook **Pages** (Hyundai, Jetour, CSM) inside that Business.
- [ ] Your Railway **backend** address: `https://ittehad-erp-production.up.railway.app`
      (check `https://ittehad-erp-production.up.railway.app/api/health` shows `{"status":"ok"}`).
- [ ] The latest code deployed to Railway, and `npm run db:migrate` run (the leads need the new columns).

---

## 3. Step by step

### Step 1: find the three Page IDs
Meta Business Suite → choose the Page → **Settings** → **Page setup / Page details**
(or the Page's **About** → **Page transparency** → *Page ID*). Write them down:

| Page | Dealership code | Page ID |
|---|---|---|
| Hyundai | `HYD-ISB` | _______________ |
| Jetour | `JET-ITH` | _______________ |
| Capital Smart Motors (CSM) | `CSM-ITH` | _______________ |

### Step 2: create one Meta app (one app serves all three Pages)
1. Go to **developers.facebook.com** → **My Apps** → **Create App**.
2. Use case: **Other** → app type **Business**. Name it e.g. *Ittehad CRM*.
3. Link it to your Business.
4. **App settings → Basic**: copy the **App ID** and **App Secret** (you will need both).
5. Add a **Privacy Policy URL** and a category (Meta requires them before the app can go Live).

### Step 3: add the webhook (once)
1. In the app: **Add product → Webhooks**.
2. Choose the object **Page** → **Subscribe to this object** (or **Edit subscription**).
3. **Callback URL:** `https://ittehad-erp-production.up.railway.app/api/meta/webhook`
4. **Verify token:** the value of `VERIFY_TOKEN` in `backend/.env` (any long random text; use the same text on Railway).
5. Press **Verify and save**. Meta calls your server; it answers with Meta's challenge when the token matches.
   *If it fails:* the backend with this code is not deployed yet, or `VERIFY_TOKEN` is not set on Railway.
6. In the list of fields, **subscribe to `leadgen`**.

### Step 4: give the app access to the three Pages' leads (Leads Access) ⚠️ most common mistake
**Business Settings → Integrations → Leads Access** (called *CRM integrations* in some versions):
1. Select each Page (Hyundai, Jetour, CSM).
2. **CRMs** → assign / connect your app (*Ittehad CRM*).
Without this, Meta accepts the webhook but refuses to give the lead details.

### Step 5: one access token for all three Pages (System User)
1. **Business Settings → Users → System users → Add**. Name: *CRM leads*. Role: **Admin** (or Employee with the assets below).
2. **Add assets** → **Pages**: add the Hyundai, Jetour and CSM Pages with *full control*.
3. **Generate new token**: choose your app, tick the permissions
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`.
4. Copy the token (shown once). This is `META_ACCESS_TOKEN`.
5. A System User token does not expire in 60 days like a personal token, so you will not have to renew it.

### Step 6: subscribe each Page to the app (once per Page)
In the **Graph API Explorer** (developers.facebook.com/tools/explorer), with the System User or a Page token for that Page, run:

```
POST /{PAGE_ID}/subscribed_apps?subscribed_fields=leadgen
```

Repeat for the three Pages. It answers `{"success": true}`. (You can check with `GET /{PAGE_ID}/subscribed_apps`.)

### Step 7: set the variables on Railway (backend service) and redeploy

| Variable | Value |
|---|---|
| `VERIFY_TOKEN` | the verify token from step 3 |
| `META_APP_ID` | App ID from step 2 |
| `META_APP_SECRET` | App Secret from step 2 |
| `META_ACCESS_TOKEN` | the System User token from step 5 |
| `META_PAGES` | `[{"pageId":"<HYUNDAI_PAGE_ID>","dealership":"HYD-ISB"},{"pageId":"<JETOUR_PAGE_ID>","dealership":"JET-ITH"},{"pageId":"<CSM_PAGE_ID>","dealership":"CSM-ITH"}]` |

- `META_PAGES` is what keeps the dealerships apart: a lead from a Page that is not listed is **ignored** (never sent to another dealership).
- If one Page needs its own token, add `"accessToken":"..."` to that entry.
- Put the same lines in `backend/.env` if you also run the backend on your computer (the file is already set up with placeholders).
- **Never** put these values in the code or in a chat/commit: they are secrets.

### Step 8: make sure the CROs exist and are set up
- Each dealership needs at least one user with the **CRO** role (Hyundai: `cro@hyundai.com`, Jetour: `cro@jetour.com`, CSM: `cro@csm.com`).
- After the latest `npm run db:migrate`, the CRO sees **Social media leads**, **Salesperson leads** and **Leads report** in the menu
  (sign out and in again after the migration).

### Step 9: test before running ads (Lead Ads Testing Tool)
1. Open **developers.facebook.com/tools/lead-ads-testing**.
2. Choose the **Page** (start with Jetour) and a **form**, then **Create lead**.
3. Within seconds the lead appears for the Jetour CRO under **Social media leads**, with the notification pop-up.
   Test leads are marked *"TEST lead from Meta Lead Ads Testing Tool"* in the notes; the name and phone are dummy values.
4. Repeat for Hyundai and CSM, and check each lead appears **only** at its own dealership.
5. Delete the test leads afterwards (ask for it: they can be removed from the database).

### Step 10: put the app Live
In the Meta app dashboard, switch the app from **Development** to **Live** (top bar). In Development mode Meta only
sends leads created by people who have a role on the app, so real customers' leads would not arrive.

---

## 4. Creating the ad (so the leads contain what the CRO needs)

1. **Ads Manager** (or Business Suite) → **Create** → objective **Leads**.
2. Conversion location: **Instant forms**.
3. Run the ad **from the right Page** (Jetour ads from the Jetour Page, etc.): the Page decides the dealership.
4. In the **instant form** keep these questions:
   - **Full name**
   - **Phone number** ← mandatory: a lead without a phone number is skipped
   - **City**
   - Email (optional)
   - Optional custom question, e.g. *"Which model are you interested in?"*. Every answer is saved on the lead.
5. **Name the campaign clearly**, e.g. `Jetour – X70 Plus & Dashing – Oct`. The campaign name is shown on every lead
   and in the reports.
6. New ad next week? Just create it from the same Page. Nothing to change in the portal.

---

## 5. What the CRO does with a lead

1. **Social media leads** (menu): every Meta lead of the dealership: campaign, city, phone, interest, next follow-up.
2. Open the lead and **call the customer**. Record the follow-up:
   - **Interest**: Hot / Warm / Cold,
   - **Remarks**: what the customer said,
   - **Outcome**: Interested / Not interested (*Not interested* closes the lead as **Lost**; no more follow-ups).
3. **Follow-up schedule:** 1st follow-up 2 days after the lead arrives, 2nd 3 days later (day 5), 3rd 6 days later (about day 11).
   On the due day the CRO gets a pop-up notification and the lead shows under *Action needed*.
4. **Too many leads?** Use **Transfer** on a lead, or tick several leads in the list and **Assign selected** to any salesperson.
5. When the customer is ready to buy, **Convert to Lead** (the salesperson / Sales Admin continue from there).
6. A manager can fix a mistake made at conversion with **Edit conversion details**.

### Leads report (CRO, Assistant Manager, Sales Manager)
Menu → **Leads report**: choose *All leads / Social media / Salesperson leads*, a period, a status and an interest, see the
summary, then **Download Excel (CSV)** or **Download PDF**. Every follow-up with its remarks is included
(date, who, outcome, interest, what they wrote). The dashboard also has separate downloads for social media leads and other leads.

---

## 6. Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| **Verify and save** fails in Meta | The new code is not deployed, or `VERIFY_TOKEN` on Railway differs from what you typed. Open `https://…/api/meta/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=123` in a browser: it must show `123`. |
| Test lead does not appear | (a) Step 4 *Leads Access* not done; (b) the Page is not subscribed (step 6); (c) the Page ID is missing or wrong in `META_PAGES`; (d) the app is not Live and you have no role on it. Look at the Railway logs for lines starting with `Meta lead`. |
| Log says *Meta Graph API 400/403* | The token lacks `leads_retrieval`, or the Page is not assigned to the System User. Regenerate the token (step 5). |
| Log says *Meta lead for a Page that is not in META_PAGES: ignored* | Add that Page's ID to `META_PAGES`. |
| Log says *the dealership has no CRO to give it to* | Create a user with the **CRO** role at that dealership. |
| Log says *without a usable phone number: skipped* | The form has no phone question (or Meta sent an invalid number). Add **Phone number** to the instant form. |
| Log says *phone number already has an open lead* | That customer is already in the portal; no duplicate is created. |
| CRO does not see the new menu items | Run `npm run db:migrate` (it grants the new permissions to the CRO role), restart the backend, sign out and in. |
| Webhook returns **401** | The `META_APP_SECRET` on Railway is wrong, or the request did not come from Meta. |

---

## 7. Security

- `META_APP_SECRET`, `META_ACCESS_TOKEN` and `VERIFY_TOKEN` are secrets. Keep them only in Railway variables and `backend/.env`
  (which is not committed).
- Every call to the webhook is checked against the App Secret; unsigned or forged calls are refused (401).
- If a token was ever pasted in a chat or email, regenerate it in Meta and update Railway.

---

## 8. Quick reference

| | |
|---|---|
| Callback URL | `https://ittehad-erp-production.up.railway.app/api/meta/webhook` (also works at `/api/integrations/meta/webhook`) |
| Verify token | the `VERIFY_TOKEN` value in `backend/.env` / Railway |
| Webhook object / field | **Page** → **leadgen** |
| Dealership codes | Hyundai `HYD-ISB`, Jetour `JET-ITH`, CSM `CSM-ITH` |
| Code | `backend/src/modules/integrations/meta.ts` |
