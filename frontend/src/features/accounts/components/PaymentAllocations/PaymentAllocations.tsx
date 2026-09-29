import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Input, Section, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { type Payment, useAllocatePaymentMutation, useListInvoicesQuery, useListPaymentAllocationsQuery } from '../../accountsApi';
import { P } from '../../permissions';

/** Invoices a customer receipt settled, and applying any unallocated remainder (customer credit). */
export function PaymentAllocations({ payment }: { payment: Payment }) {
  const perm = usePermission();
  const toast = useToast();
  const { data } = useListPaymentAllocationsQuery({ id: payment.id }, { skip: payment.direction !== 'receipt' });
  const [allocate, { isLoading }] = useAllocatePaymentMutation();
  const allocated = (data ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const credit = Number(payment.amount) - allocated;
  const canApply = payment.status === 'posted' && credit > 0.005 && perm.canIn(P.paymentsCreate, payment.dealershipId);

  const { data: openInvoices } = useListInvoicesQuery(
    { dealershipId: payment.dealershipId, customerId: payment.customerId ?? undefined, pageSize: 100, sort: 'dueDate' },
    { skip: !canApply || !payment.customerId },
  );
  const open = (openInvoices?.items ?? []).filter((i) => ['issued', 'partially_paid'].includes(i.status));
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');

  if (payment.direction !== 'receipt') return null;

  return (
    <Section title="Settled invoices">
      {data?.length ? (
        <ul className="divide-y divide-slate-100">
          {data.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/accounts/invoices/${a.invoiceId}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                {a.invoiceNo}
              </Link>
              <span className="tabular-nums">{formatMoney(a.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Not allocated to any invoice.</p>
      )}
      {credit > 0.005 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Badge tone="amber">Unallocated credit</Badge>
          <span className="font-medium tabular-nums">{formatMoney(credit)}</span>
          {canApply && (
            <>
              <span className="text-amber-700">apply to</span>
              <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="w-auto py-1 text-xs" aria-label="Invoice">
                <option value="">Choose an invoice…</option>
                {open.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoiceNo} — {formatMoney(Number(i.totalAmount) - Number(i.amountPaid))} outstanding
                  </option>
                ))}
              </Select>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={formatMoney(credit)}
                inputMode="decimal"
                className="w-32 py-1 text-right text-xs"
                aria-label="Amount to apply"
              />
              <Button
                size="sm"
                loading={isLoading}
                disabled={!invoiceId}
                onClick={async () => {
                  try {
                    await allocate({ id: payment.id, allocatePaymentRequest: { invoiceId: Number(invoiceId), amount: (amount.replace(/,/g, '').trim() || credit.toFixed(2)) } }).unwrap();
                    toast.success('Credit applied to the invoice');
                    setInvoiceId('');
                    setAmount('');
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              >
                Apply
              </Button>
            </>
          )}
        </div>
      )}
    </Section>
  );
}
