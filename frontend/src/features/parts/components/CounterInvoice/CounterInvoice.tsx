import { useGetInvoiceQuery } from '@/features/accounts/accountsApi';
import { InvoicePrintButton } from '@/features/accounts/components/InvoicePrint';
import { usePermission } from '@/shared/hooks';

/**
 * After a counter sale: the invoice that was made for the customer and sent to Accounts, with a button to view and print it
 * (shown to those who may see invoices; the invoice number is shown to everyone).
 */
export function CounterInvoice({ invoiceId, invoiceNo }: { invoiceId: number; invoiceNo: string | null | undefined }) {
  const perm = usePermission();
  const canView = perm.can('accounts.invoices.view');
  const { data: invoice } = useGetInvoiceQuery({ id: invoiceId }, { skip: !canView });
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <p>
        Invoice <span className="font-mono font-semibold">{invoiceNo}</span> was made for this counter sale and sent to Accounts, where the customer pays.
      </p>
      {invoice && <InvoicePrintButton invoice={invoice} label="View and print invoice" />}
    </div>
  );
}
