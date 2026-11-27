import { useState } from 'react';
import { Button, Checkbox, Field, Input } from '@/shared/components/ui';
import { PDI_CHECKLIST } from '../../../permissions';
import { type CompleteDeliveryRequest, useGetOrderPdiQuery, useListDeliveryDocumentsQuery } from '../../../salesApi';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

interface HandOverFormProps {
  /** The order being handed over: its saved PDI and delivery documents tick the checklist. */
  orderId: number;
  customerName: string | null | undefined;
  submitLabel: string;
  loading: boolean;
  onSubmit: (request: CompleteDeliveryRequest) => void;
  onCancel?: () => void;
}

/**
 * The hand-over details: the pre-delivery checklist (every item required), date and odometer. Used on a scheduled delivery,
 * by "Mark as delivered" on the order and by "Car delivered" on the dashboard.
 */
export function HandOverForm({ orderId, customerName, submitLabel, loading, onSubmit, onCancel }: HandOverFormProps) {
  const [deliveredOn, setDeliveredOn] = useState(today());
  const [odometer, setOdometer] = useState('');
  // The checklist ticks itself from what is already saved on the order; a tick changed by hand wins.
  const [byHand, setByHand] = useState<Record<string, boolean>>({});
  const { data: pdi, isFetching: loadingPdi } = useGetOrderPdiQuery({ id: orderId }, { refetchOnMountOrArgChange: true });
  const { data: savedDocs, isFetching: loadingDocs } = useListDeliveryDocumentsQuery({ orderId }, { refetchOnMountOrArgChange: true });
  const saved: Record<string, boolean> = { pdi_done: !!pdi?.done && !pdi.issue, documents_ready: !!savedDocs?.length };
  const checklist = PDI_CHECKLIST.map((c) => c.value as string).filter((value) => byHand[value] ?? saved[value]);
  const missing = [
    pdi && !saved.pdi_done ? (pdi.issue ? 'the PDI has an issue' : 'no completed PDI is saved') : null,
    savedDocs && !saved.documents_ready ? 'no delivery document is saved' : null,
  ]
    .filter(Boolean)
    .join(' and ');

  const km = Number(odometer);
  const checked = PDI_CHECKLIST.every((c) => checklist.includes(c.value));
  const valid = checked && odometer !== '' && Number.isInteger(km) && km >= 0 && km <= 100000;
  const toggleCheck = (value: string) => setByHand((h) => ({ ...h, [value]: !checklist.includes(value) }));

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Handing over records <b>{customerName ?? 'the customer'}</b> as the owner, starts the warranty and service schedule, and closes the
        order.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Pre-delivery checklist" required className="sm:col-span-3" hint={checked ? undefined : loadingPdi || loadingDocs ? 'Checking the saved PDI and documents…' : `Tick every item before handing the car over${missing ? ` (on this order ${missing})` : ''}`}>
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-amber-50/60 px-3 py-2">
            {PDI_CHECKLIST.map((c) => (
              <Checkbox key={c.value} label={c.label} checked={checklist.includes(c.value)} onChange={() => toggleCheck(c.value)} />
            ))}
          </div>
        </Field>
        <Field label="Delivered on" htmlFor="ho-date" required>
          <Input id="ho-date" type="date" max={today()} value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} />
        </Field>
        <Field label="Odometer (km)" htmlFor="ho-km" required>
          <Input id="ho-km" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="e.g. 12" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          disabled={!valid}
          loading={loading}
          onClick={() =>
            onSubmit({
              deliveredOn,
              odometerKm: km,
              documentsHandedOver: [],
              accessoriesHandedOver: [],
              checklist: checklist as never,
              customerAcknowledged: false,
            })
          }
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
