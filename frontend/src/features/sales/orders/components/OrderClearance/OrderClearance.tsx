import { useState } from 'react';
import { Badge, Button, Field, Input, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime, formatMoney } from '@/shared/lib';
import { CLEARANCE_LABELS, P } from '../../../permissions';
import { type SalesOrder, useDecideDeliveryClearanceMutation, useRequestDeliveryClearanceMutation } from '../../../salesApi';

const CAR_AT_DEALERSHIP = ['received', 'ready_for_delivery'];

/**
 * Delivery clearance: once the car is at the dealership, the Delivery Team asks the Sales Admin to
 * confirm everything is clear (all payments received). The car is handed over only once cleared.
 */
export function OrderClearance({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const [request, { isLoading: requesting }] = useRequestDeliveryClearanceMutation();
  const [decide, { isLoading: deciding }] = useDecideDeliveryClearanceMutation();
  const [note, setNote] = useState('');
  const status = order.clearanceStatus ?? 'none';
  const carHere = CAR_AT_DEALERSHIP.includes(order.vehicleStatus ?? '');
  const canRequest =
    order.status === 'approved' &&
    carHere &&
    (status === 'none' || status === 'rejected') &&
    (perm.canIn(P.deliveriesComplete, order.dealershipId, order.branchId) || perm.canIn(P.deliveriesSchedule, order.dealershipId, order.branchId));
  const canDecide = status === 'requested' && perm.canIn(P.ordersClear, order.dealershipId, order.branchId);
  // Not relevant yet (no approved order with its car here, and nothing asked).
  if (order.status !== 'approved' && status === 'none') return null;
  if (!carHere && status === 'none' && !canDecide) return null;
  const balance = Number(order.balanceDue ?? 0);
  const info = CLEARANCE_LABELS[status] ?? CLEARANCE_LABELS.none!;

  return (
    <Section title="Delivery clearance">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={info.tone}>{info.label}</Badge>
        {status !== 'none' && order.clearanceRequestedAt && (
          <span className="text-slate-600">
            Requested {formatDateTime(order.clearanceRequestedAt)} by {order.clearanceRequestedByName ?? '—'}
            {order.clearanceRequestNote ? ` — “${order.clearanceRequestNote}”` : ''}
          </span>
        )}
        {(status === 'approved' || status === 'rejected') && order.clearanceDecidedAt && (
          <span className="text-slate-600">
            {status === 'approved' ? 'Cleared' : 'Rejected'} {formatDateTime(order.clearanceDecidedAt)} by {order.clearanceDecidedByName ?? '—'}
            {order.clearanceDecisionNote ? ` — “${order.clearanceDecisionNote}”` : ''}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm">
        Payments: received <b>{formatMoney(order.amountReceived ?? '0')}</b> of {formatMoney(order.totalAmount)} ·{' '}
        {balance > 0 ? <b className="text-amber-700">balance due {formatMoney(String(balance))}</b> : <b className="text-emerald-700">fully paid</b>}
      </p>
      {status !== 'approved' && (
        <p className="mt-1 text-xs text-slate-500">The car is handed over only after the Sales Admin clears it (all payments clear).</p>
      )}

      {(canRequest || canDecide) && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={canDecide ? 'Note (required to reject)' : 'Note for the Sales Admin'} htmlFor="cl-note">
            <Input id="cl-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={canDecide ? 'e.g. Balance payment pending' : 'e.g. Delivery planned on Friday'} maxLength={500} />
          </Field>
          <div className="flex gap-2">
            {canRequest && (
              <Button
                loading={requesting}
                onClick={async () => {
                  try {
                    await request({ id: order.id, clearanceRequest: { note: note.trim() || null } }).unwrap();
                    toast.success('Clearance requested: the Sales Admin is notified');
                    setNote('');
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              >
                Request clearance from Sales Admin
              </Button>
            )}
            {canDecide && (
              <>
                <Button
                  disabled={balance > 0}
                  title={balance > 0 ? 'Record the remaining payments first' : undefined}
                  loading={deciding}
                  onClick={async () => {
                    try {
                      await decide({ id: order.id, clearanceDecision: { approve: true, note: note.trim() || null } }).unwrap();
                      toast.success('Car cleared for delivery: the Delivery Team is notified');
                      setNote('');
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  Approve: all clear
                </Button>
                <Button
                  variant="secondary"
                  loading={deciding}
                  onClick={async () => {
                    if (!note.trim()) return toast.error('Write what is not clear (e.g. balance payment pending)');
                    try {
                      await decide({ id: order.id, clearanceDecision: { approve: false, note: note.trim() } }).unwrap();
                      toast.success('Clearance rejected: the Delivery Team is notified');
                      setNote('');
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
          {canDecide && balance > 0 && <p className="text-xs text-amber-700 sm:col-span-2">Balance still due: record the payments above before approving, or reject with a note.</p>}
        </div>
      )}
    </Section>
  );
}
