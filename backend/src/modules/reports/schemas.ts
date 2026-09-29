import { z } from '../../lib/zod';

export const DASHBOARD_KEYS = ['sales', 'service', 'parts', 'accounts'] as const;
export type DashboardKey = (typeof DASHBOARD_KEYS)[number];

export const DashboardQuery = z.object({
  dealershipId: z.coerce.number().int().positive().optional(),
  /** Period (inclusive); defaults to the current month up to today. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const Format = z.enum(['number', 'money', 'percent', 'hours']);
const Value = z.union([z.string(), z.number()]).nullable();

/** One generic shape for every dashboard, so a single renderer draws them all. */
export const DashboardSchema = z
  .object({
    key: z.enum(DASHBOARD_KEYS),
    title: z.string(),
    /** group = all dealerships, dealership = the granted dealerships/branches, own = the caller's own work. */
    mode: z.enum(['group', 'dealership', 'own']),
    period: z.object({ from: z.string(), to: z.string() }),
    metrics: z.array(
      z.object({ key: z.string(), label: z.string(), format: Format, value: Value, hint: z.string().nullable(), to: z.string().nullable() }).openapi('DashboardMetric'),
    ),
    charts: z.array(
      z
        .object({
          key: z.string(),
          title: z.string(),
          format: Format,
          data: z.array(z.object({ label: z.string(), value: z.number() })),
          to: z.string().nullable(),
        })
        .openapi('DashboardChart'),
    ),
    tables: z.array(
      z
        .object({
          key: z.string(),
          title: z.string(),
          columns: z.array(z.object({ key: z.string(), header: z.string(), format: z.enum(['text', 'number', 'money', 'percent', 'hours']) })),
          rows: z.array(z.record(z.string(), Value)),
        })
        .openapi('DashboardTable'),
    ),
  })
  .openapi('Dashboard');
export type Dashboard = z.infer<typeof DashboardSchema>;

export const DashboardListSchema = z
  .array(z.object({ key: z.enum(DASHBOARD_KEYS), title: z.string(), mode: z.enum(['group', 'dealership', 'own']) }))
  .openapi('DashboardList');

export const DashboardParams = z.object({ key: z.enum(DASHBOARD_KEYS) });
