import { useState } from 'react';
import { Badge, Button, Field, Input, Section, Select, Spinner } from '@/shared/components/ui';
import { karachiToday } from '@/shared/components';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate, formatMoney } from '@/shared/lib';
import { labelOf, ORDER_PAYMENT_KINDS, P, PAYMENT_INSTRUMENTS } from '../../../permissions';
import { type SalesOrder, useAddOrderPaymentMutation, useListOrderPaymentsQuery, useRemoveOrderPaymentMutation } from '../../../salesApi';

/**
 * Payments against the order: the booking amount, part payments and the final payment (Sales Admin).
 * Everyone who sees the order sees the total, what has been received and the balance still due.
 */
export function OrderPayments({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const { data, isLoading } = useListOrderPaymentsQuery({ id: order.id });
  const [add, { isLoading: adding }] = useAddOrderPaymentMutation();
  const [remove, { isLoading: removing }] = useRemoveOrderPaymentMutation();
  const canRecord = order.status !== 'cancelled' && perm.canIn(P.paymentsManage, order.dealershipId, order.branchId);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const blank = { kind: 'partial', amount: '', instrument: 'pay_order', reference: '', bank: '', receivedOn: karachiToday(), note: '' };
  const [v, setV] = useState(blank);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const balance = Number(data?.balance ?? 0);

  return (
    <Section
      title="Payments"
      actions={
        canRecord &&
        !open &&
        balance > 0 && (
          <Button size="sm" onClick={() => setOpen(true)}>
            + Record payment
          </Button>
        )
      }
    >
      {isLoading || !data ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">Order total</p>
              <p className="text-lg font-semibold text-slate-900">{formatMoney(data.total)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-emerald-700">Received</p>
              <p className="text-lg font-semibold text-emerald-800">{formatMoney(data.received)}</p>
            </div>
            <div className={balance > 0 ? 'rounded-xl bg-amber-50 p-3' : 'rounded-xl bg-emerald-50 p-3'}>
              <p className={balance > 0 ? 'text-amber-700' : 'text-emerald-700'}>{balance > 0 ? 'Balance due' : 'Fully paid'}</p>
              <p className={balance > 0 ? 'text-lg font-semibold text-amber-800' : 'text-lg font-semibold text-emerald-800'}>{formatMoney(data.balance)}</p>
            </div>
          </div>
          {data.items.length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.items.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={p.kind === 'final' ? 'green' : p.kind === 'booking' ? 'blue' : 'gray'}>{labelOf(ORDER_PAYMENT_KINDS, p.kind)}</Badge>
                    <span className="font-semibold text-slate-900">{formatMoney(p.amount)}</span>
                    <span className="text-slate-600">
                      {[labelOf(PAYMENT_INSTRUMENTS, p.instrument), p.reference, p.bank].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {formatDate(p.receivedOn)}
                    {p.createdByName ? ` · by ${p.createdByName}` : ''}
                    {canRecord && order.clearanceStatus !== 'approved' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={removing}
                        onClick={async () => {
                          if (!window.confirm('Remove this payment? Use this only for a payment entered by mistake.')) return;
                          try {
                            await remove({ id: order.id, paymentId: p.id }).unwrap();
                            toast.success('Payment removed');
                          } catch (e) {
                            toast.error(e);
                          }
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {open && (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
          <Field label="Payment" htmlFor="op-kind" required>
            <Select id="op-kind" value={v.kind} onChange={set('kind')}>
              {ORDER_PAYMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (PKR)" htmlFor="op-amount" required error={errors.amount} hint={balance > 0 ? `Balance due: ${formatMoney(String(balance))}` : undefined}>
            <Input id="op-amount" inputMode="decimal" value={v.amount} onChange={set('amount')} invalid={!!errors.amount} placeholder="e.g. 2500000" />
          </Field>
          <Field label="Received on" htmlFor="op-date" required error={errors.receivedOn}>
            <Input id="op-date" type="date" max={karachiToday()} value={v.receivedOn} onChange={set('receivedOn')} />
          </Field>
          <Field label="Instrument" htmlFor="op-instrument" required>
            <Select id="op-instrument" value={v.instrument} onChange={set('instrument')}>
              {PAYMENT_INSTRUMENTS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Instrument no. / reference" htmlFor="op-ref">
            <Input id="op-ref" value={v.reference} onChange={set('reference')} />
          </Field>
          <Field label="Bank" htmlFor="op-bank">
            <Input id="op-bank" value={v.bank} onChange={set('bank')} />
          </Field>
          <Field label="Note" htmlFor="op-note" className="sm:col-span-2">
            <Input id="op-note" value={v.note} onChange={set('note')} placeholder="e.g. Full payment before delivery" />
          </Field>
          <div className="flex items-end gap-2">
            <Button
              disabled={!v.amount.trim()}
              loading={adding}
              onClick={async () => {
                setErrors({});
                try {
                  await add({
                    id: order.id,
                    orderPaymentCreate: {
                      kind: v.kind as 'partial',
                      amount: v.amount.trim(),
                      instrument: v.instrument as 'pay_order',
                      reference: v.reference.trim() || null,
                      bank: v.bank.trim() || null,
                      receivedOn: v.receivedOn,
                      note: v.note.trim() || null,
                    },
                  }).unwrap();
                  toast.success('Payment recorded');
                  setV(blank);
                  setOpen(false);
                } catch (e) {
                  const issues = (e as { data?: { error?: { details?: { path: string; message: string }[] } } }).data?.error?.details;
                  if (Array.isArray(issues)) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
                  toast.error(e);
                }
              }}
            >
              Save payment
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
