import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import {
  type Invoice,
  type InvoiceLine,
  useAddInvoiceLineMutation,
  useListInvoiceLinesQuery,
  useRemoveInvoiceLineMutation,
  useUpdateInvoiceLineMutation,
} from '../../accountsApi';
import { INVOICE_LINE_KINDS, P } from '../../permissions';

const clean = (v: string) => v.replace(/,/g, '').trim();

/**
 * Invoice lines, copied from the sales order or job card. Extra charges can be added while the
 * invoice is a draft; tax is applied per line kind by the server (config/accounting.ts).
 */
export function InvoiceLines({ invoice }: { invoice: Invoice }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: lines, isLoading } = useListInvoiceLinesQuery({ id: invoice.id });
  const [add] = useAddInvoiceLineMutation();
  const [update] = useUpdateInvoiceLineMutation();
  const [remove] = useRemoveInvoiceLineMutation();
  const editable = invoice.status === 'draft' && perm.canIn(P.invoicesCreate, invoice.dealershipId);
  const withToast = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  return (
    <Section title="Lines">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <>
          <LineItemsTable<InvoiceLine>
            lines={lines ?? []}
            kinds={INVOICE_LINE_KINDS}
            editable={editable}
            showTotal={false}
            onAdd={(d: LineDraft) =>
              withToast(
                add({
                  id: invoice.id,
                  invoiceLineCreate: { kind: d.kind as InvoiceLine['kind'], description: d.description.trim(), partNo: d.partNo.trim() || null, quantity: clean(d.quantity), unitPrice: clean(d.unitPrice) },
                }).unwrap(),
              )
            }
            onUpdate={(lineId, d) =>
              withToast(update({ id: invoice.id, lineId, invoiceLineUpdate: { description: d.description.trim(), quantity: clean(d.quantity), unitPrice: clean(d.unitPrice) } }).unwrap())
            }
            onRemove={(lineId) => withToast(remove({ id: invoice.id, lineId }).unwrap())}
            extraHeader="Tax"
            renderExtra={(l) => (
              <span className="whitespace-nowrap tabular-nums text-slate-500">
                {Number(l.taxRate)}% · {formatMoney(l.taxAmount)}
              </span>
            )}
          />
          <dl className="mt-4 ml-auto w-72 text-sm">
            {[
              ['Subtotal', invoice.subtotal],
              ['Sales tax', invoice.taxAmount],
              ['Total', invoice.totalAmount],
            ].map(([label, value], i) => (
              <div key={label} className={i === 2 ? 'flex justify-between border-t border-slate-300 pt-2 font-semibold text-slate-900' : 'flex justify-between py-1 text-slate-600'}>
                <dt>{label}</dt>
                <dd className="tabular-nums">{formatMoney(value)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Section>
  );
}
