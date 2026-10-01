import { useState } from 'react';
import { Button, Checkbox, Field, Input, Textarea } from '@/shared/components/ui';
import { DELIVERY_DOCUMENTS, PDI_CHECKLIST } from '../../../permissions';
import type { CompleteDeliveryRequest } from '../../../salesApi';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

interface HandOverFormProps {
  customerName: string | null | undefined;
  submitLabel: string;
  loading: boolean;
  onSubmit: (request: CompleteDeliveryRequest) => void;
  onCancel?: () => void;
}

/**
 * The hand-over details: the pre-delivery checklist (every item required), date, odometer, plate
 * (if issued), documents and accessories handed over, notes, and the customer's acknowledgement (required). Used on a scheduled delivery and by
 * "Mark as delivered" on the order.
 */
export function HandOverForm({ customerName, submitLabel, loading, onSubmit, onCancel }: HandOverFormProps) {
  const [deliveredOn, setDeliveredOn] = useState(today());
  const [odometer, setOdometer] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [documents, setDocuments] = useState<string[]>([]);
  const [accessories, setAccessories] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);

  const km = Number(odometer);
  const checked = PDI_CHECKLIST.every((c) => checklist.includes(c.value));
  const valid = checked && odometer !== '' && Number.isInteger(km) && km >= 0 && km <= 100000 && acknowledged;
  const toggleCheck = (value: string) => setChecklist((c) => (c.includes(value) ? c.filter((x) => x !== value) : [...c, value]));
  const toggleDoc = (value: string) => setDocuments((d) => (d.includes(value) ? d.filter((x) => x !== value) : [...d, value]));

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Handing over records <b>{customerName ?? 'the customer'}</b> as the owner, starts the warranty and service schedule, and closes the
        order.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Pre-delivery checklist" required className="sm:col-span-3" hint={checked ? undefined : 'Tick every item before handing the car over'}>
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
        <Field label="Registration no." htmlFor="ho-reg" hint="If the plate is issued now">
          <Input id="ho-reg" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} placeholder="ICT-2024" />
        </Field>
        <Field label="Documents handed over" className="sm:col-span-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DELIVERY_DOCUMENTS.map((d) => (
              <Checkbox key={d.value} label={d.label} checked={documents.includes(d.value)} onChange={() => toggleDoc(d.value)} />
            ))}
          </div>
        </Field>
        <Field label="Accessories handed over" htmlFor="ho-accessories" hint="Comma-separated, e.g. Floor mats, Mud flaps" className="sm:col-span-3">
          <Input id="ho-accessories" value={accessories} onChange={(e) => setAccessories(e.target.value)} placeholder="Floor mats, Mud flaps" />
        </Field>
        <Field label="Notes" htmlFor="ho-notes" className="sm:col-span-3">
          <Textarea id="ho-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <Checkbox
            label="The customer acknowledges receipt of the vehicle and the items listed above"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          disabled={!valid}
          loading={loading}
          onClick={() =>
            onSubmit({
              deliveredOn,
              odometerKm: km,
              registrationNo: registrationNo.trim() || null,
              documentsHandedOver: documents as never,
              accessoriesHandedOver: accessories
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean),
              checklist: checklist as never,
              customerAcknowledged: acknowledged,
              notes: notes.trim() || null,
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
