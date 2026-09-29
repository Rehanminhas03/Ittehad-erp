import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Field, Input, Section, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { P } from '../../../permissions';
import { type SalesOrder, useListOrderDeliveriesQuery, useScheduleDeliveryMutation } from '../../../salesApi';

// Pakistan calendar day (between midnight and 5 AM the UTC date is still yesterday).
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

/**
 * Deliveries of an order, and scheduling one once the order is approved and its car is at the
 * dealership (the Delivery Team marked it received); the Delivery Team sees the date on Deliveries.
 */
export function OrderDelivery({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: list } = useListOrderDeliveriesQuery({ id: order.id }, { skip: !['approved', 'delivered', 'cancelled'].includes(order.status) });
  const [schedule, { isLoading }] = useScheduleDeliveryMutation();
  const [date, setDate] = useState(today());
  const live = list?.find((d) => d.status !== 'cancelled');
  // Only those who can open deliveries get a link (the Sales Admin sees the number only).
  const canOpen = perm.can([P.deliveriesViewAll, P.deliveriesViewOwn]);
  const maySchedule =
    order.status === 'approved' && !!order.vehicleId && !live && perm.canIn(P.deliveriesSchedule, order.dealershipId, order.branchId);
  const arrived = order.vehicleStatus === 'received' || order.vehicleStatus === 'ready_for_delivery';
  const canSchedule = maySchedule && arrived;

  if (!list?.length && !maySchedule) return null;
  return (
    <Section title="Delivery">
      {list && list.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100">
          {list.map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              {canOpen ? (
                <Link to={`/sales/deliveries/${d.id}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                  {d.deliveryNo}
                </Link>
              ) : (
                <span className="font-mono text-xs text-slate-800">{d.deliveryNo}</span>
              )}
              <span className="flex items-center gap-2 text-slate-500">
                {d.deliveredOn ? `Delivered ${formatDate(d.deliveredOn)}` : `Scheduled ${formatDate(d.scheduledDate)}`}
                <StatusBadge status={d.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {maySchedule && !arrived && (
        <p className="text-sm text-slate-600">The delivery can be scheduled once the Delivery Team marks the car received.</p>
      )}
      {canSchedule && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Delivery date" htmlFor="delivery-date">
            <Input id="delivery-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button
            loading={isLoading}
            onClick={async () => {
              try {
                await schedule({ id: order.id, scheduleDeliveryRequest: { scheduledDate: date } }).unwrap();
                toast.success('Delivery scheduled');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Schedule delivery
          </Button>
        </div>
      )}
    </Section>
  );
}
