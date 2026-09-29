// Tables: defined in prisma/schema.prisma (Prisma ORM); these are their generated identifiers for
// hand-written SQL (see src/db/tables.generated.ts). Prisma Client: tx.<table>.findMany(...).
export { scheduleItem, inspectionTemplateItem, vehicleSchedule, visit, jobCard, jobCardLine, inspection, inspectionItem, estimate, estimateLine } from '../../db/tables.generated';

export const VISIT_TYPES = ['scheduled', 'paid_service', 'repair', 'warranty', 'accident', 'inspection'] as const;
export const VISIT_STATES = ['open', 'in_progress', 'ready', 'delivered', 'cancelled'] as const;
export const JOB_CARD_STATES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export const ESTIMATE_STATES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export const INSPECTION_STATES = ['in_progress', 'completed'] as const;
export const LINE_KINDS = ['labour', 'part'] as const;
export const CONDITIONS = ['not_checked', 'ok', 'attention', 'urgent'] as const;

