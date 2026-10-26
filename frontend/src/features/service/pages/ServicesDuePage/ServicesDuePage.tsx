import { useState } from 'react';
import { Badge, Button, Dialog, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate, formatDateTime, formatNumber } from '@/shared/lib';
import { P } from '../../permissions';
import { type ServiceDueRow, useListReminderCallsQuery, useListServicesDueQuery, useRecordReminderCallMutation } from '../../serviceApi';

const OUTCOMES = [
  { value: 'booked', label: 'Booked: customer will bring the car on a day', needsDay: 'Day of the visit' },
  { value: 'will_come', label: 'Will come (no day fixed yet)', needsDay: 'Expected day' },
  { value: 'call_later', label: 'Call again later', needsDay: 'Call again on' },
  { value: 'no_answer', label: 'No answer / phone off' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'already_serviced', label: 'Already serviced elsewhere' },
] as const;
const label = (v: string) => OUTCOMES.find((o) => o.value === v)?.label.split(':')[0] ?? v;
const tone = (v: string) => (v === 'booked' || v === 'will_come' ? 'green' : v === 'call_later' || v === 'no_answer' ? 'amber' : 'gray');

/**
 * Services due: the call list. Every car whose next service (free check-up, free service, paid service) is due
 * soon or overdue, with the owner's phone. Call, then record what the customer said; the list shows who was
 * called, when, and when to call again.
 */
export default function ServicesDuePage() {
  const perm = usePermission();
  const dealerships = perm.dealershipsFor(P.remindersView);
  const [dealershipId, setDealershipId] = useState('');
  const [days, setDays] = useState('30');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [uncalledOnly, setUncalledOnly] = useState(false);
  const [calling, setCalling] = useState<ServiceDueRow | null>(null);
  const { data, isFetching, isError } = useListServicesDueQuery({
    dealershipId: dealershipId ? Number(dealershipId) : undefined,
    days: Number(days),
    overdueOnly: overdueOnly ? 'true' : 'false',
    uncalledOnly: uncalledOnly ? 'true' : 'false',
  });
  const canCall = perm.can(P.remindersUpdate);

  return (
    <div>
      <PageHeader title="Services due" subtitle="Customers to call: cars whose next service is due soon or overdue. Record each call so the next person knows." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="sd-d">
            <Select id="sd-d" value={dealershipId} onChange={(e) => setDealershipId(e.target.value)}>
              <option value="">All my dealerships</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Due within" htmlFor="sd-days">
          <Select id="sd-days" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">Next 7 days</option>
            <option value="30">Next 30 days</option>
            <option value="60">Next 60 days</option>
            <option value="0">Overdue and today only</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} /> Overdue only
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={uncalledOnly} onChange={(e) => setUncalledOnly(e.target.checked)} /> Not called yet
        </label>
      </div>
      {data && (
        <p className="mb-3 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{data.total}</span> customers to call, <span className="font-medium text-red-700">{data.overdue}</span> overdue
        </p>
      )}
      <div className="surface relative overflow-x-auto p-2 sm:p-4">
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-slate-400" />}
        {isError && <p className="py-8 text-center text-sm text-red-600">The list could not be loaded.</p>}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Due</th>
              <th className="py-2 pr-3 font-medium">Service</th>
              <th className="py-2 pr-3 font-medium">Car</th>
              <th className="py-2 pr-3 font-medium">Customer</th>
              <th className="py-2 pr-3 font-medium">Last call</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No service is due in this period.
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.scheduleId} className="align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  <span className={r.overdue ? 'font-semibold text-red-700' : ''}>{formatDate(r.dueDate)}</span>
                  {r.overdue && <span className="ml-1 text-xs text-red-700">overdue</span>}
                </td>
                <td className="py-2 pr-3">
                  {r.service} {r.isFree && <Badge tone="green">Free</Badge>}
                  <div className="text-xs text-slate-500">at {formatNumber(r.dueKm)} km</div>
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-slate-900">{r.registrationNo ?? 'Unregistered'}</div>
                  <div className="text-xs text-slate-500">
                    {r.modelName} {r.lastOdometerKm != null && `· last ${formatNumber(r.lastOdometerKm)} km`}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-slate-900">{r.customerName}</div>
                  <a className="text-xs text-brand-700 hover:underline" href={`tel:${r.mobile}`}>
                    {r.mobile}
                  </a>
                  <span className="mx-1 text-slate-300">·</span>
                  <a className="text-xs text-brand-700 hover:underline" href={`https://wa.me/${r.mobile.replace(/^0/, '92').replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                  <div className="text-xs text-slate-400">{r.dealershipName}</div>
                </td>
                <td className="py-2 pr-3">
                  {r.lastCall ? (
                    <div className="space-y-0.5">
                      <Badge tone={tone(r.lastCall.outcome)}>{label(r.lastCall.outcome)}</Badge>
                      {r.lastCall.nextCallOn && <span className="ml-1 text-xs text-slate-600">{formatDate(r.lastCall.nextCallOn)}</span>}
                      {r.lastCall.remarks && <div className="max-w-56 text-xs text-slate-600">{r.lastCall.remarks}</div>}
                      <div className="text-xs text-slate-400">
                        {r.lastCall.by} · {formatDateTime(r.lastCall.at)} · {r.callCount} call{r.callCount === 1 ? '' : 's'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not called yet</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {canCall && (
                    <Button size="sm" onClick={() => setCalling(r)}>
                      Record call
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {calling && <CallDialog row={calling} onClose={() => setCalling(null)} />}
    </div>
  );
}

function CallDialog({ row, onClose }: { row: ServiceDueRow; onClose: () => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]['value'] | ''>('');
  const [remarks, setRemarks] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading }] = useRecordReminderCallMutation();
  const { data: history } = useListReminderCallsQuery({ id: row.scheduleId });
  const picked = OUTCOMES.find((o) => o.value === outcome);
  const needsDay = picked && 'needsDay' in picked ? picked.needsDay : null;

  const submit = async () => {
    if (!outcome) return setError('Choose what the customer said');
    if (needsDay && !day) return setError(`Choose: ${needsDay.toLowerCase()}`);
    setError(null);
    try {
      await save({ reminderCallRequest: { scheduleId: row.scheduleId, outcome, remarks: remarks.trim() || null, nextCallOn: day || null } }).unwrap();
      toast.success('Call recorded');
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Call ${row.customerName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Save call
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {row.service} due {formatDate(row.dueDate)} · {row.registrationNo ?? 'Unregistered'} {row.modelName} ·{' '}
          <a className="font-medium text-brand-700" href={`tel:${row.mobile}`}>
            {row.mobile}
          </a>
        </p>
        <Field label="What the customer said" htmlFor="rc-outcome" required>
          <Select id="rc-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
            <option value="">Choose…</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {needsDay && (
          <Field label={needsDay} htmlFor="rc-day" required>
            <Input id="rc-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        )}
        <Field label="Remarks" htmlFor="rc-remarks">
          <Textarea id="rc-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything to note from the call" />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {history && history.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Earlier calls</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{label(h.outcome)}</span> · {h.by} · {formatDateTime(h.at)}
                  {h.nextCallOn ? ` · ${formatDate(h.nextCallOn)}` : ''}
                  {h.remarks ? ` · ${h.remarks}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
