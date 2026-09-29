import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

const tones = {
  gray: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
  amber: 'bg-amber-50 text-amber-800',
  blue: 'bg-brand-50 text-brand-700',
} as const;

const dots = {
  gray: 'bg-slate-400',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-brand-500',
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = 'gray', dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', dots[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Active/Inactive status badge used across list and detail screens. */
export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="green" dot>
      Active
    </Badge>
  ) : (
    <Badge dot>Inactive</Badge>
  );
}
