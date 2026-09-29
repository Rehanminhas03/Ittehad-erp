import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, Section, Select, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate, formatMoney } from '@/shared/lib';
import { type Invoice, type PaymentCreate, useCreatePaymentMutation, useListInvoicePaymentsQuery } from '../../accountsApi';
import { P, PAYMENT_METHODS } from '../../permissions';

const outstandingOf = (i: Invoice) => (Number(i.totalAmount) - Number(i.amountPaid)).toFixed(2);

/** Payments received against an invoice, and receiving one (settles this invoice). */
export function InvoicePayments({ invoice }: { invoice: Invoice }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: allocations } = useListInvoicePaymentsQuery({ id: invoice.id }, { skip: invoice.status === 'draft' });
  const [create, { isLoading }] = useCreatePaymentMutation();
  const outstanding = outstandingOf(invoice);
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<PaymentCreate['method']>('cash');
  const [reference, setReference] = useState('');
  const canReceive = ['issued', 'partially_paid'].includes(invoice.status) && perm.canIn(P.paymentsCreate, invoice.dealershipId);
  if (invoice.status === 'draft' || invoice.status === 'cancelled') return null;

  return (
    <Section title={`Payments · ${formatMoney(outstanding)} outstanding`}>
      {allocations?.length ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {allocations.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/accounts/payments/${a.paymentId}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                {a.paymentNo}
              </Link>
              <span className="flex items-center gap-3 text-slate-500">
                {formatDate(a.paymentDate)}
                <span className="tabular-nums text-slate-900">{formatMoney(a.amount)}</span>
                <StatusBadge status={a.paymentStatus} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-slate-500">No payments yet.</p>
      )}
      {canReceive && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-40 text-right" aria-label="Amount" />
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentCreate['method'])} className="w-auto" aria-label="Method">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (cheque / txn no.)" className="max-w-56" aria-label="Reference" />
          <Button
            loading={isLoading}
            disabled={!(Number(amount.replace(/,/g, '')) > 0)}
            onClick={async () => {
              const value = amount.replace(/,/g, '').trim();
              try {
                const p = await create({
                  paymentCreate: {
                    dealershipId: invoice.dealershipId,
                    branchId: invoice.branchId,
                    direction: 'receipt',
                    customerId: invoice.customerId,
                    method,
                    reference: reference.trim() || null,
                    amount: value,
                    allocations: [{ invoiceId: invoice.id, amount: value }],
                  },
                }).unwrap();
                toast.success(`Receipt ${p.paymentNo} posted`);
                setReference('');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Receive payment
          </Button>
        </div>
      )}
    </Section>
  );
}
