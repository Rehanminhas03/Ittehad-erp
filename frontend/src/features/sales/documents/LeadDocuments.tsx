import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Dialog, Section, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatDateTime, formatMoney } from '@/shared/lib';
import { P } from '../permissions';
import { type Lead, type PpfForm, type Quotation, useListPpfFormsQuery, useListQuotationsQuery } from '../salesApi';
import { PpfDialog, QuotationDialog } from './CreateDocumentDialogs';
import { type DocKind, DocumentPreview, DownloadIcon, EyeIcon } from './DocumentPreview';

/** Which document actions the signed-in user has on this lead (mirrors the server rules). */
export function useLeadDocumentRights(lead: Lead) {
  const perm = usePermission();
  const at = (code: string) => perm.canIn(code, lead.dealershipId, lead.branchId);
  const own = lead.ownerId === perm.userId;
  return {
    viewQuotations: at(P.quotationsViewAll) || (own && at(P.quotationsViewOwn)),
    viewPpf: at(P.ppfViewAll) || (own && at(P.ppfViewOwn)),
    // Its salesperson for their own lead, the Assistant Manager for any lead.
    createQuotation: at(P.quotationsCreate) && (own || at(P.quotationsUpdate)),
    createPpf: at(P.ppfCreate) && (own || at(P.ppfUpdate)),
  };
}

function DocRow({ no, to, amount, by, at, onPreview }: { no: string; to: string; amount: string; by: string | null | undefined; at: string; onPreview: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      <Link to={to} className="font-mono text-xs font-medium text-brand-700 hover:underline">
        {no}
      </Link>
      <span className="text-sm font-medium tabular-nums text-slate-900">{formatMoney(amount)}</span>
      <span className="text-xs text-slate-500">
        {by ?? '—'} · {formatDateTime(at)}
      </span>
      <button
        type="button"
        onClick={onPreview}
        className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        <EyeIcon className="size-4" />
        View · Download · Print
      </button>
    </li>
  );
}

/**
 * The lead's quotations and PPF forms: issue new ones (then preview before download / print) and
 * open existing ones. Shown on the lead page and from the icon at the end of each leads-list row.
 */
export function LeadDocumentsPanel({ lead }: { lead: Lead }) {
  const rights = useLeadDocumentRights(lead);
  const quotations = useListQuotationsQuery({ leadId: lead.id, pageSize: 20 }, { skip: !rights.viewQuotations });
  const ppf = useListPpfFormsQuery({ leadId: lead.id, pageSize: 20 }, { skip: !rights.viewPpf });
  const [creating, setCreating] = useState<DocKind | null>(null);
  const [preview, setPreview] = useState<{ kind: DocKind; id: number } | null>(null);

  const created = (kind: DocKind) => (id: number) => {
    setCreating(null);
    setPreview({ kind, id });
  };
  const list = (kind: DocKind, title: string, rows: (Quotation | PpfForm)[] | undefined, loading: boolean) => (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {loading ? (
        <Spinner />
      ) : rows?.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <DocRow
              key={r.id}
              no={'quotationNo' in r ? r.quotationNo : r.formNo}
              to={`/sales/${kind === 'quotation' ? 'quotations' : 'ppf-forms'}/${r.id}`}
              amount={r.totalAmount}
              by={r.updatedById !== r.createdById ? `${r.createdByName}, changed by ${r.updatedByName}` : r.createdByName}
              at={r.updatedAt}
              onPreview={() => setPreview({ kind, id: r.id })}
            />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-slate-500">None yet.</p>
      )}
    </div>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {rights.createQuotation && (
          <Button variant="secondary" onClick={() => setCreating('quotation')}>
            + Vehicle quotation
          </Button>
        )}
        {rights.createPpf && (
          <Button variant="secondary" onClick={() => setCreating('ppf')}>
            + PPF voucher
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {rights.viewQuotations && list('quotation', 'Vehicle quotations', quotations.data?.items, quotations.isLoading)}
        {rights.viewPpf && list('ppf', 'PPF vouchers', ppf.data?.items, ppf.isLoading)}
      </div>
      {creating === 'quotation' && <QuotationDialog lead={lead} open onClose={() => setCreating(null)} onCreated={created('quotation')} />}
      {creating === 'ppf' && <PpfDialog lead={lead} open onClose={() => setCreating(null)} onCreated={created('ppf')} />}
      {preview && <DocumentPreview kind={preview.kind} id={preview.id} open onClose={() => setPreview(null)} />}
    </>
  );
}

/** Lead page section. */
export function LeadDocuments({ lead }: { lead: Lead }) {
  const rights = useLeadDocumentRights(lead);
  if (!rights.viewQuotations && !rights.viewPpf) return null;
  return (
    <Section title="Quotations & PPF">
      <LeadDocumentsPanel lead={lead} />
    </Section>
  );
}

/** Icon at the end of each leads-list row: the lead's documents in a dialog. */
export function LeadDocumentsButton({ lead }: { lead: Lead }) {
  const rights = useLeadDocumentRights(lead);
  const [open, setOpen] = useState(false);
  if (!rights.viewQuotations && !rights.viewPpf) return null;
  return (
    // The list opens a lead when its row is clicked: keep clicks here (and in the dialogs) from reaching the row.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        aria-label={`Quotation and PPF voucher for ${lead.prospectName}`}
        title="Vehicle quotation / PPF voucher"
      >
        <DownloadIcon className="size-5" />
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} size="lg" title={`Quotations & PPF — ${lead.prospectName}`} footer={<Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>}>
          <LeadDocumentsPanel lead={lead} />
        </Dialog>
      )}
    </span>
  );
}
