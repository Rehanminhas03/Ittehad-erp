import { humanize } from '@/shared/lib';
import { Badge, type BadgeTone } from '../Badge';

/**
 * Consistent colours for workflow states across every module. Unknown states are grey;
 * pass `tones` to override for a specific entity.
 */
const DEFAULT_TONES: Record<string, BadgeTone> = {
  draft: 'gray',
  new: 'gray',
  contacted: 'blue',
  qualified: 'blue',
  follow_up: 'blue',
  visited: 'blue',
  converted: 'amber',
  processing: 'amber',
  submitted: 'amber',
  pending: 'amber',
  scheduled: 'amber',
  ready: 'amber',
  partially_received: 'amber',
  partially_issued: 'amber',
  partially_paid: 'amber',
  open: 'blue',
  in_progress: 'blue',
  dispatched: 'blue',
  approved: 'blue',
  issued: 'blue',
  posted: 'green',
  received: 'green',
  delivered: 'green',
  completed: 'green',
  closed: 'green',
  won: 'green',
  paid: 'green',
  active: 'green',
  rejected: 'red',
  cancelled: 'red',
  lost: 'red',
  exhausted: 'red',
  void: 'red',
};

export function StatusBadge({ status, label, tones }: { status: string | null | undefined; label?: string; tones?: Record<string, BadgeTone> }) {
  // A record without a status (e.g. stale data after an update) shows a dash rather than breaking the page.
  if (!status && !label) return <span className="text-slate-400">—</span>;
  return (
    <Badge tone={(status && (tones?.[status] ?? DEFAULT_TONES[status])) || 'gray'} dot>
      {label ?? humanize(status)}
    </Badge>
  );
}
