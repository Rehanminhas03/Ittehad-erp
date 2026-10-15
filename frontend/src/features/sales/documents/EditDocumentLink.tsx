import { Link } from 'react-router';
import { usePermission } from '@/shared/hooks';
import { P } from '../permissions';

export const PencilIcon = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
    <path d="m12.5 4.5 3 3M4 16l.7-3.3L13.4 4a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2l-8.7 8.7L4 16Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface Doc {
  id: number;
  ownerId: number;
  dealershipId: number;
  branchId?: number | null;
}

/** May the signed-in user correct this quotation / PPF voucher? Its salesperson (own), the Assistant Manager (any). */
export function useCanEditDocument(kind: 'quotation' | 'ppf', d: Doc | undefined) {
  const perm = usePermission();
  if (!d) return false;
  const [all, own] = kind === 'quotation' ? [P.quotationsUpdate, P.quotationsUpdateOwn] : [P.ppfUpdate, P.ppfUpdateOwn];
  return perm.canIn(all, d.dealershipId, d.branchId) || (d.ownerId === perm.userId && perm.canIn(own, d.dealershipId, d.branchId));
}

export const editPathOf = (kind: 'quotation' | 'ppf', id: number) => `/sales/${kind === 'quotation' ? 'quotations' : 'ppf-forms'}/${id}/edit`;

/** "Edit" next to a quotation / PPF voucher (an icon in lists, text where there is room). Hidden when the user cannot edit it. */
export function EditDocumentLink({ kind, doc, text = false }: { kind: 'quotation' | 'ppf'; doc: Doc; text?: boolean }) {
  const can = useCanEditDocument(kind, doc);
  if (!can) return null;
  const label = kind === 'quotation' ? 'Edit quotation' : 'Edit PPF voucher';
  return (
    // Lists open a record when the row is clicked: keep this click from reaching the row.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <Link
        to={editPathOf(kind, doc.id)}
        aria-label={label}
        title={label}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <PencilIcon className="size-4" />
        {text && 'Edit'}
      </Link>
    </span>
  );
}
