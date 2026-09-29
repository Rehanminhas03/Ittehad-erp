import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CustomerField } from '@/features/crm';
import { useSupplierOptions } from '@/features/parts';
import { Button, Field, Input, PageHeader, Section, Select, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate, formatMoney } from '@/shared/lib';
import { type PaymentCreate, useCreatePaymentMutation, useListInvoicesQuery } from '../../accountsApi';
import { P, PAYMENT_METHODS } from '../../permissions';

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => Number(v.replace(/,/g, '')) || 0;
const toFixed = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * Record a customer receipt (settling any of their open invoices; the rest is held as credit) or a
 * supplier payment. Posting happens on the server: Dr cash/bank – Cr receivables, or Dr payables – Cr cash/bank.
 */
export default function RecordPaymentPage() {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dealerships = perm.dealershipsFor(P.paymentsCreate);
  const [dealershipId, setDealershipId] = useState(Number(params.get('dealershipId')) || dealerships[0]?.id || 0);
  const [direction, setDirection] = useState<PaymentCreate['direction']>(params.get('direction') === 'disbursement' ? 'disbursement' : 'receipt');
  const [customerId, setCustomerId] = useState<number | ''>(Number(params.get('customerId')) || '');
  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '');
  const [method, setMethod] = useState<PaymentCreate['method']>('cash');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [create, { isLoading }] = useCreatePaymentMutation();
  const suppliers = useSupplierOptions(dealershipId || null);

  const receipt = direction === 'receipt';
  const { data: invoices } = useListInvoicesQuery({ dealershipId, customerId: customerId || undefined, pageSize: 100, sort: 'dueDate' }, { skip: !receipt || !customerId || !dealershipId });
  const open = useMemo(() => (invoices?.items ?? []).filter((i) => ['issued', 'partially_paid'].includes(i.status)), [invoices]);
  const outstanding = (i: (typeof open)[number]) => Number(i.totalAmount) - Number(i.amountPaid);
  const allocated = Object.values(alloc).reduce((s, v) => s + num(v), 0);

  /** Oldest due first, up to the amount received. */
  const autoAllocate = () => {
    let left = num(amount);
    const next: Record<number, string> = {};
    for (const i of open) {
      if (left <= 0) break;
      const take = Math.min(left, outstanding(i));
      next[i.id] = toFixed(take);
      left -= take;
    }
    setAlloc(next);
  };

  const party = receipt ? !!customerId : !!supplierId;
  const valid = dealershipId && party && num(amount) > 0 && allocated <= num(amount) + 0.001;

  const submit = async () => {
    try {
      const p = await create({
        paymentCreate: {
          dealershipId,
          direction,
          customerId: receipt ? Number(customerId) : null,
          supplierId: receipt ? null : Number(supplierId),
          method,
          reference: reference.trim() || null,
          paymentDate,
          amount: amount.replace(/,/g, '').trim(),
          notes: notes.trim() || null,
          allocations: receipt
            ? Object.entries(alloc)
                .filter(([, v]) => num(v) > 0)
                .map(([invoiceId, v]) => ({ invoiceId: Number(invoiceId), amount: v.replace(/,/g, '').trim() }))
            : [],
        },
      }).unwrap();
      toast.success(`${receipt ? 'Receipt' : 'Payment'} ${p.paymentNo} posted`);
      navigate(`/accounts/payments/${p.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Record payment" subtitle="Posted to the ledger immediately. A mistake is corrected by voiding the payment." />
      <Section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {dealerships.length > 1 && (
            <Field label="Dealership" htmlFor="dealership" required>
              <Select
                id="dealership"
                value={dealershipId}
                onChange={(e) => {
                  setDealershipId(Number(e.target.value));
                  setCustomerId('');
                  setSupplierId('');
                  setAlloc({});
                }}
              >
                {dealerships.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Type" htmlFor="direction" required>
            <Select
              id="direction"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as PaymentCreate['direction']);
                setAlloc({});
              }}
            >
              <option value="receipt">Customer receipt</option>
              <option value="disbursement">Supplier payment</option>
            </Select>
          </Field>
          {receipt ? (
            <Field label="Customer" htmlFor="customer" required className="sm:col-span-2">
              <CustomerField
                id="customer"
                value={customerId}
                onChange={(id) => {
                  setCustomerId(id);
                  setAlloc({});
                }}
                permission="master.customers.view"
                dealershipId={dealershipId}
              />
            </Field>
          ) : (
            <Field label="Supplier" htmlFor="supplier" required className="sm:col-span-2">
              <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Choose a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Amount" htmlFor="amount" required>
            <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="text-right" />
          </Field>
          <Field label="Date" htmlFor="date" required>
            <Input id="date" type="date" value={paymentDate} max={today()} onChange={(e) => setPaymentDate(e.target.value)} />
          </Field>
          <Field label="Method" htmlFor="method" required>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentCreate['method'])}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" htmlFor="reference" hint="Cheque, transfer or card slip number">
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Section>

      {receipt && customerId !== '' && (
        <Section
          title="Settle invoices"
          actions={
            open.length > 0 && (
              <Button size="sm" variant="ghost" onClick={autoAllocate} disabled={!(num(amount) > 0)}>
                Allocate oldest first
              </Button>
            )
          }
        >
          {open.length ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-medium">Invoice</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                  <th className="py-2 pr-3 text-right font-medium">Outstanding</th>
                  <th className="py-2 text-right font-medium">Apply</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {open.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2 pr-3 font-mono text-xs">{i.invoiceNo}</td>
                    <td className="py-2 pr-3">{formatDate(i.dueDate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(outstanding(i))}</td>
                    <td className="py-2 text-right">
                      <Input
                        value={alloc[i.id] ?? ''}
                        onChange={(e) => setAlloc({ ...alloc, [i.id]: e.target.value })}
                        inputMode="decimal"
                        className="ml-auto w-36 py-1 text-right"
                        aria-label={`Apply to ${i.invoiceNo}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">This customer has no open invoices; the receipt will be held as customer credit.</p>
          )}
          {open.length > 0 && (
            <p className={allocated > num(amount) + 0.001 ? 'mt-2 text-sm text-red-600' : 'mt-2 text-sm text-slate-500'}>
              Applied {formatMoney(allocated)} of {formatMoney(num(amount))}
              {num(amount) - allocated > 0.001 && ` · ${formatMoney(num(amount) - allocated)} held as customer credit`}
            </p>
          )}
        </Section>
      )}

      <div className="flex gap-2 pt-4">
        <Button onClick={submit} disabled={!valid} loading={isLoading}>
          Post {receipt ? 'receipt' : 'payment'}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
