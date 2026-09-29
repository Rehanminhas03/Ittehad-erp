/** Permission codes used by the service screens (defined server-side in service/permissions.ts). */
export const P = {
  setupView: 'service.setup.view',
  setupManage: 'service.setup.manage',
  visitsView: 'service.visits.view',
  visitsViewOwn: 'service.visits.view_own',
  visitsCreate: 'service.visits.create',
  visitsUpdate: 'service.visits.update',
  jobCardsView: 'service.job_cards.view',
  jobCardsCreate: 'service.job_cards.create',
  jobCardsUpdate: 'service.job_cards.update',
  jobCardsWork: 'service.job_cards.work',
  inspectionsView: 'service.inspections.view',
  inspectionsCreate: 'service.inspections.create',
  inspectionsUpdate: 'service.inspections.update',
  estimatesView: 'service.estimates.view',
  estimatesViewOwn: 'service.estimates.view_own',
  estimatesCreate: 'service.estimates.create',
  estimatesUpdate: 'service.estimates.update',
  estimatesApprove: 'service.estimates.approve',
} as const;

export const VISIT_STATES = ['open', 'in_progress', 'ready', 'delivered', 'cancelled'] as const;
export const JOB_CARD_STATES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export const ESTIMATE_STATES = ['draft', 'submitted', 'approved', 'rejected'] as const;

export const VISIT_TYPES = [
  { value: 'scheduled', label: 'Scheduled service' },
  { value: 'paid_service', label: 'Paid service' },
  { value: 'repair', label: 'Repair' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'accident', label: 'Accident' },
  { value: 'inspection', label: 'Inspection only' },
];
export const visitTypeLabel = (v: string) => VISIT_TYPES.find((t) => t.value === v)?.label ?? v;

export const LINE_KINDS = [
  { value: 'labour', label: 'Labour' },
  { value: 'part', label: 'Part' },
];

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th" */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
