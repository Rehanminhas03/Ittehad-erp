/**
 * Meta (Facebook / Instagram) lead ads → social media leads for the dealership's CROs.
 *
 * Meta calls POST /api/integrations/meta/webhook for every new lead form submission on a subscribed
 * Page (any ad, including the ones started later: the subscription is on the Page, not on an ad).
 * The webhook only carries the lead's id, so the details are fetched from the Graph API with the
 * Page's access token, then saved as a lead (source "social") for the Page's dealership, given to the
 * CRO with the fewest Meta leads (an even share). Every CRO of that dealership sees all of them.
 *
 * Settings (environment, see backend/.env.example): META_APP_SECRET (signs the webhook calls),
 * META_VERIFY_TOKEN (typed into Meta once, when the webhook is added) and META_PAGES, a JSON list
 * mapping each Facebook Page to a dealership code with its access token.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../../config/env';
import { type Executor, applyTenant, db, query, transaction, withTenantTx } from '../../db/client';
import { sql } from '../../db/sql';
import { logger } from '../../lib/logger';
import { normalizeMobile } from '../master/normalize';
import { writeAudit } from '../core/audit';
import { publishNotifications } from '../core/notifications';
import { pakistanToday } from '../../lib/dates';
import { nextFollowUpAfter } from '../sales/models';
import { SalesPerm as P } from '../sales/permissions';

export interface MetaPage {
  pageId: string;
  dealership: string;
  accessToken: string;
}

/**
 * META_PAGES: one entry per Facebook Page, e.g. [{"pageId":"123","dealership":"JET-ITH"}, …]. Each entry
 * may carry its own "accessToken"; without one the shared META_ACCESS_TOKEN (a System User token covers
 * every Page of the Business) is used.
 */
export function parsePages(json: string | undefined): (Omit<MetaPage, 'accessToken'> & { accessToken?: string })[] {
  if (!json?.trim()) return [];
  const list = JSON.parse(json) as Partial<MetaPage>[];
  return list
    .filter((p) => !!p.pageId && !!p.dealership)
    .map((p) => ({ pageId: String(p.pageId), dealership: p.dealership!, accessToken: p.accessToken }));
}

/** Meta signs the raw request body with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifySignature(raw: Buffer | undefined, header: string | undefined, secret: string): boolean {
  if (!raw || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface MetaFieldData {
  name: string;
  values?: string[];
}

/** The lead form's answers: the customer's name, phone, email and city, and every answer by question. */
export function parseLeadFields(fieldData: MetaFieldData[]) {
  const answers: Record<string, string> = {};
  for (const f of fieldData) {
    const v = (f.values ?? []).join(', ').trim();
    if (v) answers[f.name] = v;
  }
  const pick = (re: RegExp) => Object.entries(answers).find(([k]) => re.test(k.toLowerCase()))?.[1];
  const first = pick(/^first_?name$/);
  const last = pick(/^last_?name$/);
  const name = pick(/^full_?name$/) ?? ([first, last].filter(Boolean).join(' ') || pick(/name/));
  // Meta sends phone numbers like "p:+923001234567".
  const rawPhone = pick(/phone|mobile|whatsapp|contact/)?.replace(/^p:/i, '').trim();
  const email = pick(/e_?mail/);
  const city = pick(/city/);
  return { name: name ?? null, rawPhone: rawPhone ?? null, email: email ?? null, city: city ?? null, answers };
}

interface GraphLead {
  id: string;
  created_time?: string;
  field_data?: MetaFieldData[];
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
}

async function fetchLead(leadgenId: string, accessToken: string): Promise<GraphLead> {
  const fields = 'created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform';
  const res = await fetch(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/${leadgenId}?fields=${fields}&access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) throw new Error(`Meta Graph API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as GraphLead;
}

/** The CRO with the fewest Meta leads so far (an even share); a team leader when the dealership has no CRO. */
async function pickOwner(tx: Executor, dealershipId: number): Promise<number | null> {
  for (const code of [P.leadsRecordVisit, P.leadsConvertOwn]) {
    const [row] = await query<{ id: number }>(
      tx,
      sql`select u.id::int as id
            from core."user" u
            join core.user_role ur on ur.user_id = u.id and ur.dealership_id = ${dealershipId}
            join core.role_permission rp on rp.role_id = ur.role_id
            join core.permission p on p.id = rp.permission_id and p.code = ${code}
            left join sales.lead l on l.owner_id = u.id and l.meta_lead_id is not null
           where u.is_active
           group by u.id
           order by count(l.id), u.id
           limit 1`,
    );
    if (row) return row.id;
  }
  return null;
}

/** Saves one Meta lead; returns what happened ("created", "exists", "duplicate", "no_phone", "no_owner"). */
export async function ingestMetaLead(page: MetaPage, leadgenId: string): Promise<string> {
  const lead = await fetchLead(leadgenId, page.accessToken);
  const f = parseLeadFields(lead.field_data ?? []);
  // Meta's Lead Ads Testing Tool sends dummy answers ("<test lead: dummy data for phone_number>"): a number
  // is made up from the lead id, so the whole flow can be tried (the lead is marked as a test).
  const isTest = /test lead/i.test(f.rawPhone ?? '');
  if (isTest) f.rawPhone = `0300${leadgenId.replace(/\D/g, '').slice(-7).padStart(7, '0')}`;
  const normalized = f.rawPhone ? normalizeMobile(f.rawPhone) : null;
  if (!f.rawPhone || !normalized) {
    logger.warn({ leadgenId, page: page.pageId }, 'Meta lead without a usable phone number: skipped');
    return 'no_phone';
  }
  const mobile = (f.rawPhone.startsWith('+') ? '+' : '') + f.rawPhone.replace(/\D/g, '');

  const recipients: number[] = [];
  let leadId = 0;
  let dealershipId = 0;
  const outcome = await transaction(db, async (tx) => {
    // A system job: sees every dealership.
    await applyTenant(tx, { userId: 0, dealershipIds: 'all' });
    const d = await tx.dealership.findUnique({ where: { code: page.dealership }, select: { id: true } });
    if (!d) throw new Error(`META_PAGES: unknown dealership code ${page.dealership}`);
    dealershipId = d.id;
    // Meta may deliver the same lead more than once.
    if (await tx.lead.findFirst({ where: { metaLeadId: leadgenId }, select: { id: true } })) return 'exists';
    // One open lead per phone and dealership: the existing lead keeps the customer.
    const open = await tx.lead.findFirst({
      where: { dealershipId, prospectMobileNormalized: normalized, status: { in: ['new', 'follow_up', 'visited', 'converted', 'processing'] } },
      select: { id: true },
    });
    if (open) {
      logger.info({ leadgenId, existingLeadId: open.id }, 'Meta lead: the phone number already has an open lead');
      return 'duplicate';
    }
    const ownerId = await pickOwner(tx, dealershipId);
    if (!ownerId) {
      logger.error({ dealership: page.dealership }, 'Meta lead: the dealership has no CRO to give it to');
      return 'no_owner';
    }
    const row = await tx.lead.create({
      data: {
        dealershipId,
        ownerId,
        prospectName: f.name ?? 'Meta lead',
        prospectMobile: mobile,
        prospectMobileNormalized: normalized,
        email: f.email,
        source: 'social',
        city: f.city,
        campaignName: lead.campaign_name ?? lead.adset_name ?? null,
        adName: lead.ad_name ?? null,
        nextFollowUpOn: nextFollowUpAfter(0, pakistanToday()),
        metaLeadId: leadgenId,
        metaFormId: lead.form_id ?? null,
        metaFields: f.answers,
        notes: (isTest ? 'TEST lead from Meta Lead Ads Testing Tool: ' : '') + (lead.platform ? `Meta lead ad (${lead.platform})` : 'Meta lead ad'),
        ...(lead.created_time ? { createdAt: new Date(lead.created_time) } : {}),
      },
      select: { id: true },
    });
    leadId = row.id;
    await writeAudit(tx, { actorId: null }, { entityType: 'sales.lead', entityId: leadId, action: 'create', dealershipId, changes: { source: 'social', campaign: lead.campaign_name ?? null, metaLeadId: leadgenId } });

    // Tell the dealership's CROs (the assigned one and the others who see every social lead).
    const cros = await query<{ id: number }>(
      tx,
      sql`select distinct u.id::int as id
            from core."user" u
            join core.user_role ur on ur.user_id = u.id and ur.dealership_id = ${dealershipId}
            join core.role_permission rp on rp.role_id = ur.role_id
            join core.permission p on p.id = rp.permission_id and p.code = ${P.leadsViewSocial}
           where u.is_active`,
    );
    recipients.push(...cros.map((c) => c.id));
    if (recipients.length) {
      await tx.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          dealershipId,
          entityType: 'sales.lead',
          entityId: String(leadId),
          action: 'meta.lead',
          title: 'New social media lead',
          detail: lead.campaign_name ?? null,
          href: `/sales/leads/${leadId}`,
          actorName: 'Meta ads',
        })),
      });
    }
    return 'created';
  });

  // Live pop-up, once the lead is saved (each person reads back their own notification).
  if (outcome === 'created') {
    for (const userId of recipients) {
      const rows = await withTenantTx({ userId, dealershipIds: [dealershipId] }, (tx) =>
        tx.notification.findMany({ where: { userId, entityId: String(leadId), action: 'meta.lead' } }),
      ).catch(() => []);
      publishNotifications(rows);
    }
  }
  return outcome;
}

interface WebhookBody {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: { leadgen_id?: string; page_id?: string } }[] }[];
}

/**
 * The Page's dealership and token. With META_PAGES set, only the listed Pages are accepted (each goes to
 * its own dealership, so Jetour, Hyundai and CSM leads never mix). Without it, every Page uses the single
 * META_ACCESS_TOKEN and goes to META_DEFAULT_DEALERSHIP.
 */
export function pageFor(pageId: string): MetaPage | undefined {
  const pages = parsePages(env.META_PAGES);
  if (pages.length) {
    const mapped = pages.find((p) => p.pageId === pageId);
    const accessToken = mapped?.accessToken ?? env.META_ACCESS_TOKEN;
    return mapped && accessToken ? { ...mapped, accessToken } : undefined;
  }
  return env.META_ACCESS_TOKEN ? { pageId, dealership: env.META_DEFAULT_DEALERSHIP, accessToken: env.META_ACCESS_TOKEN } : undefined;
}

export const metaRouter = Router();

// Meta checks the address once, when the webhook is added: it must echo the challenge.
metaRouter.get('/webhook', (req, res) => {
  const verifyToken = env.META_VERIFY_TOKEN ?? env.VERIFY_TOKEN;
  if (verifyToken && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''));
    return;
  }
  res.sendStatus(403);
});

metaRouter.post('/webhook', async (req, res) => {
  if (!env.META_APP_SECRET) {
    res.status(503).json({ error: 'META_APP_SECRET is not set' });
    return;
  }
  if (!verifySignature(req.rawBody, req.get('x-hub-signature-256'), env.META_APP_SECRET)) {
    res.sendStatus(401);
    return;
  }
  const jobs: Promise<string>[] = [];
  for (const entry of (req.body as WebhookBody).entry ?? []) {
    for (const change of entry.changes ?? []) {
      const leadgenId = change.value?.leadgen_id;
      if (change.field !== 'leadgen' || !leadgenId) continue;
      const pageId = String(change.value?.page_id ?? entry.id ?? '');
      const page = pageFor(pageId);
      if (!page) {
        logger.warn({ pageId, leadgenId }, 'Meta lead for a Page that is not in META_PAGES (and no META_ACCESS_TOKEN): ignored');
        continue;
      }
      jobs.push(ingestMetaLead(page, leadgenId));
    }
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') logger.error({ err: r.reason }, 'Meta lead failed');
  // 500 makes Meta deliver it again later (saving is idempotent).
  res.sendStatus(results.some((r) => r.status === 'rejected') ? 500 : 200);
});
