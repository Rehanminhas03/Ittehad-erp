import { useState } from 'react';
import { Link } from 'react-router';
import { VEHICLE_PIPELINE, VEHICLE_STATUSES } from '@/features/crm';
import { Button, Dialog, Section, Select, Spinner, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../../permissions';
import {
  type SalesOrder,
  useAdvanceVehicleStatusMutation,
  useAllocateVehicleMutation,
  useDeliverOrderMutation,
  useListAllocatableVehiclesQuery,
  useReleaseVehicleMutation,
} from '../../../salesApi';
import { HandOverForm } from '../../../deliveries/components/HandOverForm';

const labelOf = (status: string) => VEHICLE_STATUSES.find((s) => s.value === status)?.label ?? status;

/** Orders the Delivery Team works: booked (raised by the Admin) until delivered or cancelled. */
const LIVE = ['draft', 'submitted', 'approved'];

/**
 * Delivery Team, from the moment the order is booked: allocate a vehicle from open stock (or register
 * the arriving car for this order), move it through logistics one step at a time (booked → in
 * transit → received → ready for delivery), put it on hold, or release it back to stock. The car is
 * handed over ("Mark as delivered") once it is ready for delivery and the Manager has approved the order.
 * "In transit" follows the Manager's approval; the Sales Admin / Assistant Manager / Manager may set it
 * too (dispatch) and see the car's progress, the rest is the Delivery Team's.
 */
export function OrderLogistics({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const canAllocate = LIVE.includes(order.status) && perm.canIn(P.ordersAllocate, order.dealershipId, order.branchId);
  const canDispatch = order.status === 'approved' && perm.canIn(P.ordersDispatch, order.dealershipId, order.branchId);
  if (canAllocate) return <DeliveryTeamLogistics order={order} />;
  if (canDispatch) return <DispatchLogistics order={order} />;
  return null;
}

function Pipeline({ status }: { status: string | null | undefined }) {
  const step = status ? VEHICLE_PIPELINE.indexOf(status as (typeof VEHICLE_PIPELINE)[number]) : -1;
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Vehicle progress">
      {VEHICLE_PIPELINE.map((p, i) => (
        <li key={p} className="flex items-center gap-2">
          <span
            className={
              i <= step ? 'rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500'
            }
          >
            {labelOf(p)}
          </span>
          {i < VEHICLE_PIPELINE.length - 1 && <span className="text-slate-300">→</span>}
        </li>
      ))}
      {status === 'hold' && <StatusBadge status="hold" label="On hold" />}
    </ol>
  );
}

/** Sales Admin / Assistant Manager / Manager: the car's progress, and "Mark in transit" once the plant dispatches it. */
function DispatchLogistics({ order }: { order: SalesOrder }) {
  const toast = useToast();
  const [advance, { isLoading }] = useAdvanceVehicleStatusMutation();
  return (
    <Section title="Logistics">
      {order.vehicleId ? (
        <div className="space-y-4 text-sm">
          <Pipeline status={order.vehicleStatus} />
          {order.vehicleStatus === 'booked' ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                loading={isLoading}
                onClick={async () => {
                  try {
                    await advance({ id: order.id, advanceVehicleStatusRequest: { status: 'in_transit' } }).unwrap();
                    toast.success('Vehicle marked in transit');
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              >
                Mark in transit
              </Button>
              <span className="text-slate-500">When the plant / head office has dispatched the car.</span>
            </div>
          ) : (
            order.vehicleStatus === 'in_transit' && <p className="text-slate-500">The Delivery Team marks the car received when it arrives.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-600">The Delivery Team allocates the car to this order; it can then be marked in transit.</p>
      )}
    </Section>
  );
}

function DeliveryTeamLogistics({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: options, isFetching } = useListAllocatableVehiclesQuery({ id: order.id }, { skip: !!order.vehicleId });
  const [allocate, { isLoading: allocating }] = useAllocateVehicleMutation();
  const [release, { isLoading: releasing }] = useReleaseVehicleMutation();
  const [advance, { isLoading: advancing }] = useAdvanceVehicleStatusMutation();
  const [choice, setChoice] = useState('');
  const [resumeTo, setResumeTo] = useState('');
  const [deliver, { isLoading: delivering }] = useDeliverOrderMutation();
  const [handingOver, setHandingOver] = useState(false);

  const status = order.vehicleStatus;
  const step = status ? VEHICLE_PIPELINE.indexOf(status as (typeof VEHICLE_PIPELINE)[number]) : -1;
  // In transit comes after the Manager's approval.
  const nextStep = step >= 0 && step < VEHICLE_PIPELINE.length - 1 ? VEHICLE_PIPELINE[step + 1] : null;
  const next = nextStep === 'in_transit' && order.status !== 'approved' ? null : nextStep;

  const run = async (target: string) => {
    try {
      await advance({ id: order.id, advanceVehicleStatusRequest: { status: target as never } }).unwrap();
      toast.success(target === 'hold' ? 'Vehicle put on hold' : `Vehicle marked ${labelOf(target).toLowerCase()}`);
      setResumeTo('');
    } catch (e) {
      toast.error(e);
    }
  };

  // The arriving car, registered in open stock straight onto this order (marked received).
  const registerLink = `/sales/stock/new?dealershipId=${order.dealershipId}&modelId=${order.modelId}&orderId=${order.id}`;

  return (
    <Section title="Logistics">
      {order.status !== 'approved' && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Booked, waiting for the Manager's approval. You can already allocate the car; it goes in transit and is handed over after approval.
        </p>
      )}
      {order.vehicleId ? (
        <div className="space-y-4 text-sm">
          <Pipeline status={status} />
          {/* Ready: hand the car over (after the Manager's approval). */}
          {status === 'ready_for_delivery' &&
            (order.status === 'approved' ? (
              perm.canIn(P.deliveriesComplete, order.dealershipId, order.branchId) && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2">
                  <span className="text-emerald-900">The car is ready. When the customer takes it, record the hand-over.</span>
                  <Button size="sm" onClick={() => setHandingOver(true)}>
                    Mark as delivered
                  </Button>
                </div>
              )
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                The car is ready. It can be handed over once the Manager approves the order.
              </p>
            ))}
          <div className="flex flex-wrap items-center gap-2">
            {next && (
              <Button size="sm" loading={advancing} onClick={() => run(next)}>
                Mark {labelOf(next).toLowerCase()}
              </Button>
            )}
            {status !== 'hold' && (
              <Button size="sm" variant="secondary" loading={advancing} onClick={() => run('hold')}>
                Put on hold
              </Button>
            )}
            {status === 'hold' && (
              <>
                <Select value={resumeTo} onChange={(e) => setResumeTo(e.target.value)} className="w-auto" aria-label="Resume at">
                  <option value="">Resume at…</option>
                  {VEHICLE_PIPELINE.map((p) => (
                    <option key={p} value={p}>
                      {labelOf(p)}
                    </option>
                  ))}
                </Select>
                <Button size="sm" disabled={!resumeTo} loading={advancing} onClick={() => run(resumeTo)}>
                  Resume
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              loading={releasing}
              onClick={async () => {
                try {
                  await release({ id: order.id }).unwrap();
                  toast.success('Vehicle released back to stock');
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Release to stock
            </Button>
          </div>
        </div>
      ) : isFetching ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !options?.length ? (
        <p className="text-sm text-slate-600">
          No free {order.modelName} in open stock. When the car arrives,{' '}
          <Link to={registerLink} className="font-medium text-brand-700 hover:underline">
            register it for this order
          </Link>{' '}
          (it is marked received), or enter its chassis and engine numbers above.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)} className="w-full sm:w-auto sm:min-w-72" aria-label="Stock vehicle">
            <option value="">Choose from open stock…</option>
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vin ?? v.engineNo}
                {v.color ? ` · ${v.color}` : ''}
                {v.modelYear ? ` · ${v.modelYear}` : ''}
              </option>
            ))}
          </Select>
          <Button
            disabled={!choice}
            loading={allocating}
            onClick={async () => {
              try {
                await allocate({ id: order.id, allocationRequest: { vehicleId: Number(choice) } }).unwrap();
                toast.success('Vehicle allocated');
                setChoice('');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Allocate
          </Button>
          <Link to={registerLink} className="text-sm font-medium text-brand-700 hover:underline">
            or register the arriving car for this order
          </Link>
        </div>
      )}
      {handingOver && (
        <Dialog open onClose={() => setHandingOver(false)} size="lg" title={`Mark as delivered — ${order.customerName ?? order.orderNo}`}>
          <HandOverForm
            customerName={order.customerName}
            submitLabel="Mark as delivered"
            loading={delivering}
            onCancel={() => setHandingOver(false)}
            onSubmit={async (request) => {
              try {
                await deliver({ id: order.id, completeDeliveryRequest: request }).unwrap();
                toast.success('Car delivered: the order is closed and the customer is the owner');
                setHandingOver(false);
              } catch (e) {
                toast.error(e);
              }
            }}
          />
        </Dialog>
      )}
    </Section>
  );
}
