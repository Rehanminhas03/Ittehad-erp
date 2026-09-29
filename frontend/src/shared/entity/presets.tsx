import type { ReactNode } from 'react';
import { humanize } from '@/shared/lib';
import type { FilterDef } from './types';

/** Reusable pieces for entity view configs, so every module's lists and details look the same. */

/** Primary text in a list cell (e.g. the record's name). */
export const strong = (text: ReactNode) => <span className="font-medium text-slate-900">{text}</span>;

/** Secondary text in a list cell. */
export const muted = (text: ReactNode) => <span className="text-slate-500">{text ?? '—'}</span>;

/** Monospace identifiers (codes, VINs, plates). */
export const mono = (text: ReactNode) => <span className="font-mono text-xs">{text ?? '—'}</span>;

/** Standard "Status: all / yes / no" filter over an `isActive` column. */
export const activeFilter: FilterDef = { param: 'isActive', label: 'Status', type: 'boolean' };

/** Workflow status filter from the entity's state keys. */
export const statusFilter = (states: readonly string[]): FilterDef => ({
  param: 'status',
  label: 'Status',
  type: 'select',
  options: states.map((s) => ({ value: s, label: humanize(s) })),
});

/** Standard dealership filter (options come from the caller's reachable dealerships). */
export const dealershipFilter: FilterDef = { param: 'dealershipId', label: 'Dealership', type: 'dealership' };
