import { useState } from 'react';
import { Button, Dialog, Field, Input, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { type Invoice, type PaymentCreate, useCreatePaymentMutation, useTransitionInvoiceMutation } from '../../accountsApi';
import { P, PAYMENT_METHODS } from '../../permissions';

/**
 * "Customer has paid": on a draft or issued invoice, issues it if it is still a draft and records the payment in full
 * (cash, card, transfer or cheque). The invoice is then Paid and can be printed for the customer to sign.
 */
export function CustomerPaid({ invoice }: { invoice: Invoice }) {
  const perm = usePermission();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentCreate['method']>('cash');
  const [reference, setReference] = useState('');
  const [transition, { isLoading: issuing }] = useTransitionInvoiceMutation();
  const [pay, { isLoading: paying }] = useCreatePaymentMutation();
  const due = (Number(invoice.totalAmount) - Number(invoice.amountPaid)).toFixed(2);
  const draft = invoice.status === 'draft';
  const canPay = (draft || ['issued', 'partially_paid'].includes(invoice.status)) && Number(due) > 0 && perm.canIn(P.paymentsCreate, invoice.dealershipId) && (!draft || perm.canIn(P.invoicesIssue, invoice.dealershipId));
  if (!canPay) return null;

  const confirm = async () => {
    try {
      if (draft) await transition({ id: invoice.id, body: { action: 'issue' } }).unwrap();
      const p = await pay({
        paymentCreate: {
          dealershipId: invoice.dealershipId,
          branchId: invoice.branchId,
          direction: 'receipt',
          customerId: invoice.customerId,
          method,
          reference: reference.trim() || null,
          amount: due,
          allocations: [{ invoiceId: invoice.id, amount: due }],
        },
      }).unwrap();
      toast.success(`Paid: receipt ${p.paymentNo}. You can print the invoice for the customer to sign`);
      setOpen(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Customer has paid
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Customer has paid"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={issuing || paying} onClick={confirm}>
                Record payment of {formatMoney(due)}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              {draft ? 'The invoice is issued and the full amount is received.' : 'The remaining amount is received.'} The invoice is then marked Paid.
            </p>
            <Field label="How did the customer pay?" htmlFor="cp-method">
              <Select id="cp-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentCreate['method'])}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reference (cheque / transaction no.), if any" htmlFor="cp-ref">
              <Input id="cp-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
