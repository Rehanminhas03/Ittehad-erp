import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Input } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { P } from '../../permissions';

/** Top-bar search: VIN, registration, engine no., mobile, CNIC or name. Press "/" to focus. */
export function GlobalSearchBox() {
  const perm = usePermission();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearchPage = location.pathname === '/crm/search';
  const [q, setQ] = useState(onSearchPage ? (params.get('q') ?? '') : '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!perm.can([P.customersView, P.vehiclesView])) return null;
  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) navigate(`/crm/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" fill="none" aria-hidden>
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.75" />
        <path d="m17 17-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <Input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search VIN, registration, mobile, CNIC or name  ( / )"
        aria-label="Search customers and vehicles"
        className="border-0 bg-slate-100 py-2 pl-9 ring-0 hover:ring-0 focus:bg-white focus:ring-2"
      />
    </form>
  );
}
