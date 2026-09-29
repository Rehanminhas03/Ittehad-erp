import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

export interface SectionProps {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled card of a page. Sections stack with a gap; each is its own visual block. */
export function Section({ title, actions, children, className }: SectionProps) {
  return (
    <section className={cn('surface mb-6 p-5 sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
