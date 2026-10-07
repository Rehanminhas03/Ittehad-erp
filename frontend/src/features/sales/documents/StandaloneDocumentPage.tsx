import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Field, PageHeader, Section, Select } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { P } from '../permissions';
import { PpfDialog, QuotationDialog } from './CreateDocumentDialogs';

const KINDS = {
  quotation: { title: 'Create quotation', list: '/sales/quotations', permission: P.quotationsCreate, Dialog: QuotationDialog },
  ppf: { title: 'Create PPF voucher', list: '/sales/ppf-forms', permission: P.ppfCreate, Dialog: PpfDialog },
} as const;

/**
 * "Create quotation" / "Create PPF voucher" on the list: a document without a lead (the customer is
 * written on it). Someone at several dealerships first picks the dealership. Once saved, the
 * document opens (preview, download, print).
 */
export default function StandaloneDocumentPage({ kind }: { kind: keyof typeof KINDS }) {
  const k = KINDS[kind];
  const perm = usePermission();
  const navigate = useNavigate();
  const dealerships = perm.dealershipsFor(k.permission);
  const [dealershipId, setDealershipId] = useState<number | null>(dealerships.length === 1 ? dealerships[0]!.id : null);
  const Dialog = k.Dialog;

  return (
    <div>
      <PageHeader title={k.title} breadcrumbs={[{ label: kind === 'quotation' ? 'Quotations' : 'PPF vouchers', to: k.list }, { label: 'Create' }]} />
      {dealerships.length > 1 && (
        <Section>
          <Field label="Dealership" htmlFor="sd-dealer" required>
            <Select id="sd-dealer" value={dealershipId ?? ''} onChange={(e) => setDealershipId(Number(e.target.value) || null)} className="max-w-sm">
              <option value="">Choose the dealership…</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        </Section>
      )}
      {dealershipId && (
        <Dialog key={dealershipId} dealershipId={dealershipId} open onClose={() => navigate(k.list)} onCreated={(id) => navigate(`${k.list}/${id}`, { replace: true })} />
      )}
    </div>
  );
}
