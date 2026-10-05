import { useState } from 'react';
import { Badge, Button, Field, Input, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../../permissions';
import { type Lead, useSetLeadAppointmentMutation } from '../../../salesApi';

const CLOSED = ['completed', 'exhausted'];
const KARACHI = 'Asia/Karachi';
const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: KARACHI });

/** "Today, 3:30 pm", "Tomorrow, 11:00 am", "Mon 12 Oct, 4:00 pm" (Pakistan time). */
export function formatAppointment(iso: string) {
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-PK', { timeZone: KARACHI, hour: 'numeric', minute: '2-digit', hour12: true });
  const today = dayOf(new Date());
  const tomorrow = dayOf(new Date(Date.now() + 86_400_000));
  const day = dayOf(at);
  const date = day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : at.toLocaleDateString('en-GB', { timeZone: KARACHI, weekday: 'short', day: 'numeric', month: 'short' });
  return `${date}, ${time}`;
}

/** The value for a datetime-local input in Pakistan time ("2026-10-05T15:30"). */
const toLocalInput = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  return d.toISOString().slice(0, 16);
};

/**
 * The customer's appointment (showroom visit, test drive…): set by the lead's salesperson, the
 * Assistant Manager or the Manager. On the day, all of them are reminded (notification and
 * "Action needed").
 */
export function LeadAppointment({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const [save, { isLoading }] = useSetLeadAppointmentMutation();
  const [editing, setEditing] = useState(false);
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');

  const canSet =
    !CLOSED.includes(lead.status) &&
    (perm.canIn(P.leadsAppointment, lead.dealershipId, lead.branchId) || (lead.ownerId === perm.userId && perm.canIn(P.leadsUpdateOwn, lead.dealershipId, lead.branchId)));
  if (!lead.appointmentAt && !canSet) return null;

  const past = !!lead.appointmentAt && new Date(lead.appointmentAt).getTime() < Date.now();
  const isToday = !!lead.appointmentAt && dayOf(new Date(lead.appointmentAt)) === dayOf(new Date());
  const open = () => {
    setAt(lead.appointmentAt && !past ? toLocalInput(lead.appointmentAt) : '');
    setNote(lead.appointmentAt && !past ? (lead.appointmentNote ?? '') : '');
    setEditing(true);
  };
  const submit = async (value: string | null) => {
    try {
      // The time typed is Pakistan time (UTC+5).
      await save({ id: lead.id, leadAppointmentRequest: { appointmentAt: value ? `${value}:00+05:00` : null, note: value ? note.trim() || null : null } }).unwrap();
      toast.success(value ? 'Appointment saved. Everyone following this lead is reminded on the day.' : 'Appointment cancelled');
      setEditing(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Section
      title="Appointment"
      actions={
        canSet &&
        !editing && (
          <Button size="sm" variant="secondary" onClick={open}>
            {lead.appointmentAt && !past ? 'Change' : 'Set appointment'}
          </Button>
        )
      }
    >
      {lead.appointmentAt && !editing ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={past ? 'text-slate-500 line-through' : 'text-base font-semibold text-slate-900'}>{formatAppointment(lead.appointmentAt)}</span>
          {isToday && !past && <Badge tone="amber">Today</Badge>}
          {past && <Badge tone="gray">Past</Badge>}
          {lead.appointmentNote && <span className="text-slate-700">“{lead.appointmentNote}”</span>}
          {lead.appointmentSetByName && <span className="text-slate-500">Set by {lead.appointmentSetByName}</span>}
          {canSet && !past && (
            <Button size="sm" variant="ghost" loading={isLoading} onClick={() => void submit(null)}>
              Cancel appointment
            </Button>
          )}
        </div>
      ) : !editing ? (
        <p className="text-sm text-slate-500">No appointment. Set one when the customer agrees to come (showroom visit, test drive…); the salesperson, Assistant Manager and Manager are reminded on the day.</p>
      ) : null}
      {editing && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[16rem_1fr_auto] sm:items-end">
          <Field label="Date and time" htmlFor="ap-at" required>
            <Input id="ap-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="Note" htmlFor="ap-note">
            <Input id="ap-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Test drive, Tucson HEV" maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <Button disabled={!at} loading={isLoading} onClick={() => void submit(at)}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
