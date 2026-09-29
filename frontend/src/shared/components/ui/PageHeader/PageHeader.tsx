import type { ReactNode } from 'react';
import { Link } from 'react-router';

export interface Breadcrumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
}

/** Title row at the top of every page. */
export function PageHeader({ title, subtitle, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="pb-6">
      {breadcrumbs && (
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg viewBox="0 0 16 16" className="size-3 text-slate-300" fill="currentColor" aria-hidden>
                  <path d="M6 3.5 9.5 8 6 12.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {b.to ? (
                <Link to={b.to} className="transition-colors hover:text-brand-700">
                  {b.label}
                </Link>
              ) : (
                <span className="text-slate-600">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
