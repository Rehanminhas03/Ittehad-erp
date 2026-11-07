import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

export interface SectionProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A tighter card (less padding and spacing), for form-heavy pages. */
  compact?: boolean;
}

/** A titled card of a page. Sections stack with a gap; each is its own visual block. */
export function Section({ title, actions, children, className, compact }: SectionProps) {
  return (
    <section className={cn('surface', compact ? 'mb-4 p-3 sm:p-4' : 'mb-4 p-3.5 sm:p-4', className)}>
      {(title || actions) && (
        <div className={cn('flex items-center justify-between gap-3', compact ? 'mb-2' : 'mb-3')}>
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
