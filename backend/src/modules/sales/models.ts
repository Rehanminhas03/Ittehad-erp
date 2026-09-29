// Tables: defined in prisma/schema.prisma (Prisma ORM); these are their generated identifiers for
// hand-written SQL (see src/db/tables.generated.ts). Prisma Client: tx.<table>.findMany(...).
export { lead, leadFollowUp, salesOrder, delivery, quotation, ppfForm, documentTemplate, vehicleVariant } from '../../db/tables.generated';

export const LEAD_SOURCES = ['walk_in', 'phone', 'website', 'social', 'referral', 'event', 'other'] as const;
/**
 * new → follow_up / visited (follow-ups recorded) → converted ("Convert to Lead": qualified, visible
 * to Admin) → processing (Admin raised the order) → completed (order delivered).
 * exhausted: given up after at least MIN_FOLLOW_UPS_TO_EXHAUST follow-ups.
 */
export const LEAD_STATES = ['new', 'follow_up', 'visited', 'converted', 'processing', 'completed', 'exhausted'] as const;
/** A phone number can have only one lead in these states per dealership (duplicate control). */
export const ACTIVE_LEAD_STATES = ['new', 'follow_up', 'visited', 'converted', 'processing'] as const;
export const FOLLOW_UP_OUTCOMES = ['interested', 'not_interested', 'visited'] as const;
export const PAYMENT_INSTRUMENTS = ['pay_order', 'bank_draft', 'cheque', 'online_transfer', 'cash'] as const;
export const ORDER_TYPES = ['pbo', 'cbo'] as const;
export const ORDER_STATES = ['draft', 'submitted', 'approved', 'delivered', 'cancelled'] as const;
export const DELIVERY_STATES = ['scheduled', 'delivered', 'cancelled'] as const;
/** A vehicle's logistics pipeline while an order holds it (see master.VEHICLE_STATUSES). */
export const VEHICLE_PIPELINE = ['booked', 'in_transit', 'received', 'ready_for_delivery'] as const;
/** Fixed checklist of documents handed over at delivery (kept small and controlled for compliance). */
export const DELIVERY_DOCUMENTS = ['invoice', 'registration_book', 'warranty_card', 'owners_manual', 'insurance_cover_note'] as const;

/** Paint Protection Film: coverage the customer agreed to, with its price. */
export const PPF_COVERAGES = ['full_body', 'front_package', 'partial', 'custom'] as const;
export const PPF_FINISHES = ['gloss', 'matte'] as const;
/** The PPF voucher's printed fields (in order). Labels can be renamed in the dealership's PPF format. */
export const PPF_VOUCHER_FIELDS = ['pbo', 'customerName', 'email', 'phone', 'chassis', 'engine', 'vehicle', 'salesExecutive', 'promiseDate', 'ppf', 'price', 'paid', 'unpaid', 'notes'] as const;
/** Fields the format may leave off the voucher (PBO, customer, chassis, engine and the amounts always print). */
export const PPF_HIDEABLE_FIELDS = ['email', 'phone', 'vehicle', 'salesExecutive', 'promiseDate', 'ppf', 'notes'] as const;
// ---- Document formats (letterhead, terms) per dealership ---------------------------------------
/** Documents whose printed format a dealership can edit.  */
export const DOCUMENT_KINDS = ['quotation', 'ppf'] as const;
