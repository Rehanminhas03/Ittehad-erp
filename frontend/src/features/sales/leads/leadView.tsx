import { z } from 'zod';
import { Badge, StatusBadge } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import {
  dealershipFilter,
  type EntityViewConfig,
  idField,
  muted,
  optionalDate,
  optionalId,
  optionalText,
  requiredText,
  strong,
} from '@/shared/entity';
import { formatDate, formatDateTime, humanize } from '@/shared/lib';
import { DuplicateLeadNotice } from './components/DuplicateLeadNotice';
import { formatAppointment, LeadAppointment } from './components/LeadAppointment';
import { LeadConversion } from './components/LeadConversion';
import { LeadDetailsEditor } from './components/LeadDetailsEditor';
import { LeadFollowUps } from './components/LeadFollowUps';
import { LeadModelSelect } from './components/LeadModelSelect';
import { LeadOrder } from './components/LeadOrder';
import { LeadReassign } from './components/LeadReassign';
import { LeadStatusSummary } from './components/LeadStatusSummary';
import { VariantPicker } from './components/VariantPicker';
import { LeadDocuments, LeadDocumentsButton } from '../documents';
import { formatExpectedDelivery } from '../orders/components/ExpectedDelivery';
import { useLeadOwnerOptions } from '../team/useLeadOwnerOptions';
import { useSalespersonOptions } from '../team/useSalespersonOptions';
import { LAST_ACTIVITY, labelOf, LEAD_SOURCES, LEAD_STATES, OPEN_LEAD_STATES, P, showsVisited } from '../permissions';
import {
  type Lead,
  useCreateLeadMutation,
  useGetLeadHistoryQuery,
  useGetLeadQuery,
  useGetLeadWorkflowQuery,
  useListLeadFollowUpsQuery,
  useListLeadsQuery,
  useListPpfFormsQuery,
  useListQuotationsQuery,
  useTransitionLeadMutation,
  useUpdateLeadMutation,
} from '../salesApi';

/**
 * The lead page's follow-ups and documents, requested while the lead loads (same args as
 * LeadFollowUps / LeadDocumentsPanel). Documents only for users who can see some; the server scopes them.
 */
function usePrefetchLeadSections(id: number) {
  const perm = usePermission();
  useListLeadFollowUpsQuery({ id });
  useListQuotationsQuery({ leadId: id, pageSize: 20 }, { skip: !perm.can([P.quotationsViewAll, P.quotationsViewOwn]) });
  useListPpfFormsQuery({ leadId: id, pageSize: 20 }, { skip: !perm.can([P.ppfViewAll, P.ppfViewOwn]) });
}

/** Who works leads before conversion (not the Sales Admin, who sees them only once converted). */
const WORKS_LEADS = [P.leadsViewAll, P.leadsViewOwn];
const AFTER_CONVERSION = ['converted', 'processing', 'completed'];

/**
 * Status filter options; "Visited" only for the CRO and team views (see showsVisited). The Sales Admin
 * sees leads only once converted, so only those statuses.
 */
function useLeadStatusOptions() {
  const perm = usePermission();
  const convertedOnly = !perm.can(WORKS_LEADS);
  return LEAD_STATES.filter((s) => (s !== 'visited' || showsVisited(perm)) && (!convertedOnly || AFTER_CONVERSION.includes(s))).map((s) => ({
    value: s,
    label: humanize(s),
  }));
}
const day = (v: string) => formatDate(v);

/** "Converted · Today 3:40 PM", "Logged · 20 Sep": what happened last, and when. */
function lastActivity(l: Lead) {
  const at = new Date(l.updatedAt);
  const day = at.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const yesterday = new Date(Date.now() - 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const when =
    day === today || day === yesterday
      ? `${day === today ? 'Today' : 'Yesterday'} ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' })}`
      : formatDate(l.updatedAt);
  return (
    <span className="text-slate-600">
      <span className="font-medium text-slate-800">{LAST_ACTIVITY[l.status] ?? 'Updated'}</span> · {when}
    </span>
  );
}

/** Walk-in / first contact: the customer's name, phone and model are required (variant, colour, email at conversion). */
const fields = {
  prospectName: requiredText(),
  prospectMobile: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Enter a valid phone number, e.g. 03001234567'),
  email: z.union([z.literal(''), z.email('Enter a valid email address')]).optional(),
  source: z.enum(LEAD_SOURCES.map((s) => s.value) as [string, ...string[]]),
  interestedModelId: idField('Model'),
  variant: optionalText(160),
  preferredColor: optionalText(40),
  expectedCloseDate: optionalDate(),
  notes: optionalText(2000),
  branchId: optionalId(),
};
// Empty email -> null; no salesperson chosen -> the lead is yours (the server's default).
const nullIfEmpty = (v: Record<string, unknown>) => ({ ...v, email: v.email || null, ownerId: v.ownerId || undefined });

export const leadView: EntityViewConfig<Lead> = {
  singular: 'Lead',
  plural: 'Leads',
  basePath: '/sales/leads',
  entityType: 'sales.lead',
  permissions: { view: [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted], create: P.leadsCreate, update: [P.leadsUpdate, P.leadsUpdateOwn] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  ownerKey: 'ownerId',
  // Details are fixed once converted (the Admin works from them).
  canEdit: (l, perm) =>
    (OPEN_LEAD_STATES as readonly string[]).includes(l.status) &&
    (perm.canIn(P.leadsUpdate, l.dealershipId, l.branchId) || (l.ownerId === perm.userId && perm.canIn(P.leadsUpdateOwn, l.dealershipId, l.branchId))),
  list: {
    // Latest activity first; the list opens on the last 30 days (an old lead converted today counts as today).
    defaultSort: '-updatedAt',
    dateRange: { label: 'Activity', fromParam: 'activityFrom', toParam: 'activityTo', defaultPreset: '30d' },
    searchPlaceholder: 'Search by customer name, phone (e.g. 03001234567) or PBO number',
    // Total leads and the split by status for the chosen period and filters, above the search.
    header: ({ query, periodLabel }) => <LeadStatusSummary query={query} periodLabel={periodLabel} />,
    filters: [
      { param: 'lost', label: 'Lost leads', type: 'select', options: [{ value: 'true', label: 'Show lost leads' }], visible: (perm) => perm.can(WORKS_LEADS) },
      { param: 'status', label: 'Status', type: 'select', useOptions: useLeadStatusOptions },
      { param: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES },
      { param: 'ownerId', label: 'Salesperson', type: 'select', useOptions: useSalespersonOptions, visible: (perm) => perm.can([P.leadsViewAll, P.leadsViewConverted]) },
      { param: 'escalated', label: 'Sent to AM', type: 'boolean', visible: (perm) => perm.can(WORKS_LEADS) },
      { param: 'upcomingAppointment', label: 'Appointment (today on)', type: 'boolean', visible: (perm) => perm.can(WORKS_LEADS) },
      dealershipFilter,
      // Set by dashboard tiles and "Action needed" links (shown as removable chips).
      { param: 'open', label: 'Open leads only', type: 'hidden', chip: (v) => (v === 'true' ? 'Open leads only' : 'Closed leads only') },
      { param: 'createdOn', label: 'Logged on', type: 'hidden', chip: (v) => `Logged on ${day(v)}` },
      { param: 'createdBefore', label: 'Logged before', type: 'hidden', chip: (v) => `Logged before ${day(v)}` },
      { param: 'convertedFrom', label: 'Converted from', type: 'hidden', chip: (v) => `Converted from ${day(v)}` },
      { param: 'convertedTo', label: 'Converted to', type: 'hidden', chip: (v) => `Converted up to ${day(v)}` },
      { param: 'vehicleStage', label: 'Car', type: 'hidden', chip: (v) => `Car: ${humanize(v).toLowerCase()}` },
      { param: 'appointmentOn', label: 'Appointment on', type: 'hidden', chip: (v) => `Appointment on ${day(v)}` },
    ],
    columns: [
      {
        key: 'prospectName',
        header: 'Customer',
        sortKey: 'prospectName',
        render: (l) => (
          <span className="inline-flex items-center gap-2">
            {strong(l.prospectName)}
            {l.escalatedAt && (OPEN_LEAD_STATES as readonly string[]).includes(l.status) && <Badge tone="amber">Sent to AM</Badge>}
            {!!l.previousPurchases && <Badge tone="green">{`Returning customer · ${l.previousPurchases} car${l.previousPurchases > 1 ? 's' : ''} before`}</Badge>}
            {l.customerType === 'corporate' && l.companyName && <Badge tone="blue">{l.companyName}</Badge>}
            {l.appointmentAt && new Date(l.appointmentAt).getTime() >= Date.now() - 3_600_000 && <Badge tone="blue">{formatAppointment(l.appointmentAt)}</Badge>}
          </span>
        ),
      },
      { key: 'prospectMobile', header: 'Phone', render: (l) => l.prospectMobile },
      { key: 'modelName', header: 'Interested in', render: (l) => muted([l.modelName, l.preferredColor].filter(Boolean).join(' · ') || null) },
      { key: 'source', header: 'Source', render: (l) => labelOf(LEAD_SOURCES, l.source) },
      // Only for team views: someone who sees only their own leads is always the salesperson.
      { key: 'ownerName', header: 'Salesperson', render: (l) => muted(l.ownerName), visible: (perm) => perm.can([P.leadsViewAll, P.leadsViewConverted]) },
      { key: 'followUpCount', header: 'Follow-ups', sortKey: 'followUpCount', className: 'text-right tabular-nums', render: (l) => l.followUpCount },
      { key: 'status', header: 'Status', sortKey: 'status', render: (l) => <StatusBadge status={l.status} /> },
      { key: 'updatedAt', header: 'Last activity', sortKey: 'updatedAt', render: lastActivity },
      // Last column: the lead's Vehicle Quotation / PPF form (issue, view, download, print).
      { key: 'documents', header: 'Documents', className: 'w-px text-right', render: (l) => <LeadDocumentsButton lead={l} /> },
    ],
  },
  detail: {
    title: (l) => l.prospectName,
    subtitle: (l) => `${l.prospectMobile} · ${labelOf(LEAD_SOURCES, l.source)}`,
    fields: [
      { label: 'Status', value: (l) => <StatusBadge status={l.status} /> },
      { label: 'Phone', value: (l) => l.prospectMobile },
      { label: 'Email', value: (l) => l.email },
      {
        label: 'Customer history',
        value: (l) =>
          l.previousPurchases ? (
            <Badge tone="green">{`Returning customer: bought ${l.previousPurchases} car${l.previousPurchases > 1 ? 's' : ''} from us before`}</Badge>
          ) : null,
      },
      { label: 'Customer type', value: (l) => (l.customerType === 'corporate' ? 'Corporate' : l.convertedAt ? 'Individual' : null) },
      { label: 'Company', value: (l) => (l.customerType === 'corporate' ? [l.companyName, l.contactDesignation && `contact: ${l.contactDesignation}`].filter(Boolean).join(' · ') : null) },
      { label: 'Purchase order', value: (l) => (l.customerType === 'corporate' ? l.purchaseOrderNo || 'Without a purchase order' : null) },
      { label: 'Lost', value: (l) => (l.lostAt ? `${formatDateTime(l.lostAt)} by ${l.lostByName ?? '—'}${l.lostReason ? ` — ${l.lostReason}` : ''}` : null) },
      { label: 'Salesperson', value: (l) => l.ownerName },
      { label: 'Interested in', value: (l) => [l.modelName, l.variant, l.preferredColor].filter(Boolean).join(' · ') || null },
      { label: 'Expected close', value: (l) => formatDate(l.expectedCloseDate) },
      { label: 'Last follow-up', value: (l) => formatDateTime(l.lastFollowUpAt) },
      { label: 'Appointment', value: (l) => (l.appointmentAt ? `${formatAppointment(l.appointmentAt)}${l.appointmentNote ? ` — ${l.appointmentNote}` : ''}` : null) },
      {
        label: 'Sent to AM',
        value: (l) =>
          l.escalatedAt ? `${formatDateTime(l.escalatedAt)} by ${l.escalatedByName ?? '—'}${l.escalationNote ? ` — ${l.escalationNote}` : ''}` : null,
      },
      { label: 'Expected delivery', value: (l) => formatExpectedDelivery(l.expectedDeliveryDate, l.expectedDeliveryByMonth) },
      { label: 'Converted', value: (l) => (l.convertedAt ? `${formatDateTime(l.convertedAt)} by ${l.convertedByName ?? '—'}` : null) },
      { label: 'Notes', value: (l) => l.notes },
      { label: 'Logged', value: (l) => `${formatDateTime(l.createdAt)}${l.createdByName ? ` by ${l.createdByName}` : ''}` },
    ],
    sections: (l) => (
      <>
        <LeadConversion lead={l} />
        <LeadAppointment lead={l} />
        <LeadReassign lead={l} />
        <LeadDetailsEditor lead={l} />
        <LeadOrder lead={l} />
        <LeadDocuments lead={l} />
        <LeadFollowUps lead={l} />
      </>
    ),
    usePrefetch: usePrefetchLeadSections,
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.leadsCreate },
      // Team leaders (Assistant Manager, Sales Manager) can log a lead for a salesperson.
      { name: 'ownerId', label: 'Salesperson', type: 'select', mode: 'create', useOptions: useLeadOwnerOptions, hint: 'Empty: the lead is yours', visible: (perm) => perm.can([P.leadsViewAll]) },
      { name: 'prospectName', label: 'Customer name', type: 'text', required: true },
      { name: 'prospectMobile', label: 'Phone', type: 'tel', required: true, placeholder: '03001234567', hint: 'Digits only' },
      { name: 'source', label: 'Source', type: 'select', required: true, options: LEAD_SOURCES },
      { name: 'email', label: 'Email', type: 'email' },
      // The dealership's own brand only (Hyundai Islamabad: Hyundai models).
      {
        name: 'interestedModelId',
        label: 'Model',
        type: 'custom',
        required: true,
        render: ({ id, value, onChange, invalid, values }) => (
          <LeadModelSelect id={id} value={String(value ?? '')} onChange={onChange} invalid={invalid} dealershipId={Number(values.dealershipId) || null} />
        ),
      },
      // The model's variant codes (Hyundai), or typed. Required only at conversion.
      {
        name: 'variant',
        label: 'Variant',
        type: 'custom',
        hint: 'Can be chosen later; needed to convert',
        render: ({ id, value, onChange, invalid, values }) => (
          <VariantPicker
            id={id}
            value={String(value ?? '')}
            onChange={onChange}
            invalid={invalid}
            modelId={Number(values.interestedModelId) || null}
            dealershipId={Number(values.dealershipId) || null}
          />
        ),
      },
      { name: 'preferredColor', label: 'Colour', type: 'text' },
      { name: 'expectedCloseDate', label: 'Expected close', type: 'date' },
      { name: 'branchId', label: 'Branch', type: 'branch', dealershipField: 'dealershipId', scopePermission: P.leadsCreate, mode: 'create' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    defaults: { source: 'walk_in' },
    createSchema: z.object({ dealershipId: idField('Dealership'), ownerId: optionalId(), ...fields }),
    updateSchema: z.object((({ branchId: _b, ...rest }) => rest)(fields)),
    renderConflict: (details, values) => <DuplicateLeadNotice details={details} values={values} />,
  },
  api: {
    useList: useListLeadsQuery,
    useGet: useGetLeadQuery,
    useHistory: useGetLeadHistoryQuery,
    create: { useMutation: useCreateLeadMutation, toArg: (v) => ({ leadCreate: nullIfEmpty(v) }) },
    update: { useMutation: useUpdateLeadMutation, toArg: (id, v) => ({ id, leadUpdate: nullIfEmpty(v) }) },
  },
  workflow: {
    useDefinition: useGetLeadWorkflowQuery,
    transition: { useMutation: useTransitionLeadMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
    // Walk-in salespeople never record visits (the customer is already in the showroom).
    hiddenStates: (perm) => (showsVisited(perm) ? [] : ['visited']),
  },
};
