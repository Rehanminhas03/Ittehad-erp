// Tables: defined in prisma/schema.prisma (Prisma ORM); these are their generated identifiers for
// hand-written SQL (see src/db/tables.generated.ts). Prisma Client: tx.<table>.findMany(...).
export { vehicleModel, customer, vehicle, vehicleDealership, vehicleOwnership } from '../../db/tables.generated';

// Master data lives in the `core` schema: every other module (sales, service, parts, accounts)
// references customers and vehicles. `*_trgm` GIN indexes serve partial (ILIKE '%…%') search;
// pg_trgm is enabled by the baseline migration.

// ---------------------------------------------------------------------------
// Vehicles: one row per physical vehicle across the whole group (no duplicates anywhere).
// Dealerships see a vehicle once it is linked to them (vehicle_dealership).
// ---------------------------------------------------------------------------
/**
 * Pre-sale logistics through to after-sale stock control. `available` is the resting state; a
 * sales order allocation moves a vehicle to `booked`, physical logistics move it on to
 * `in_transit` / `received` / `ready_for_delivery`, and completing the delivery sets `delivered`.
 * `reserved` (held against interest before an order exists), `transferred` (moved to another
 * dealership's stock) and `hold` (pulled off sale) are manually set, outside that automatic chain.
 */
export const VEHICLE_STATUSES = [
  'available',
  'reserved',
  'booked',
  'in_transit',
  'received',
  'ready_for_delivery',
  'delivered',
  'transferred',
  'hold',
] as const;

