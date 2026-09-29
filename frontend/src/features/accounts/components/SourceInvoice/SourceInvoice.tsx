import { Link, useNavigate } from 'react-router';
import { Button, Section, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { useCreateInvoiceFromSourceMutation, useListInvoicesQuery } from '../../accountsApi';
import { P } from '../../permissions';

export interface SourceInvoiceProps {
  sourceType: 'sales_order' | 'job_card';
  sourceId: number;
  dealershipId: number;
  /** The document is in a state that can be invoiced (approved order, completed job card). */
  ready: boolean;
}

/**
 * On a sales order or job card: its invoice(s), and drafting one. One engine serves both —
 * the server copies the billable lines and applies tax.
 */
export function SourceInvoice({ sourceType, sourceId, dealershipId, ready }: SourceInvoiceProps) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const canView = perm.can(P.invoicesView);
  const { data } = useListInvoicesQuery({ sourceType, sourceId, pageSize: 20, sort: '-createdAt' }, { skip: !canView });
  const [create, { isLoading }] = useCreateInvoiceFromSourceMutation();
  const live = data?.items.find((i) => !['void', 'cancelled'].includes(i.status));
  const canCreate = ready && !live && perm.canIn(P.invoicesCreate, dealershipId);
  if (!canView) return null;

  return (
    <Section
      title="Invoice"
      actions={
        canCreate && (
          <Button
            size="sm"
            loading={isLoading}
            onClick={async () => {
              try {
                const inv = await create({ invoiceFromSource: { sourceType, sourceId } }).unwrap();
                toast.success(`Draft invoice ${inv.invoiceNo} created`);
                navigate(`/accounts/invoices/${inv.id}`);
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Create invoice
          </Button>
        )
      }
    >
      {data?.items.length ? (
        <ul className="divide-y divide-slate-100">
          {data.items.map((i) => (
            <li key={i.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/accounts/invoices/${i.id}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                {i.invoiceNo}
              </Link>
              <span className="flex items-center gap-3 text-slate-500">
                <span className="tabular-nums text-slate-900">{formatMoney(i.totalAmount)}</span>
                <StatusBadge status={i.status} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{ready ? 'Not invoiced yet.' : 'Can be invoiced once approved / completed.'}</p>
      )}
    </Section>
  );
}
