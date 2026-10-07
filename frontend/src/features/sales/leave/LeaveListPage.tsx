import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Badge, Button, Dialog, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/shared/components/ui';
import { karachiToday } from '@/shared/components';
import { useAuth, usePermission, useToast } from '@/shared/hooks';
import { cn, formatDate } from '@/shared/lib';
import { labelOf, LEAVE_TYPES, P } from '../permissions';
import { useApplyForLeaveMutation, useListLeaveApplicationsQuery } from '../salesApi';

export const LEAVE_STATUS: Record<string, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  submitted: { label: 'Waiting for approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

const TABS = [
  { key: '', label: 'All' },
  { key: 'submitted', label: 'Waiting for approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

/** The department printed on the form, from the person's role (can be changed). */
function useDefaultDepartment() {
  const perm = usePermission();
  if (perm.can(P.leaveApprove)) return 'Sales (Management)';
  if (perm.can(P.deliveriesComplete)) return 'Delivery';
  if (perm.can(P.ordersCreate)) return 'Sales Admin';
  return 'Sales';
}

/**
 * Leave applications: everyone applies for their own sick / emergency leave; the Assistant Manager /
 * Manager see the team's and approve or reject them (the employee is notified). Each prints on the
 * dealership's leave form.
 */
export default function LeaveListPage() {
  const perm = usePermission();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const approver = perm.can(P.leaveApprove);
  const { data, isLoading, isFetching } = useListLeaveApplicationsQuery({ status: (status || undefined) as never, pageSize: 100 });
  const [applying, setApplying] = useState(false);

  return (
    <div>
      <PageHeader
        title="Leave applications"
        subtitle={approver ? "Your own and your team's applications. Approve or reject the ones waiting." : 'Apply for sick or emergency leave; your manager approves it.'}
        actions={
          perm.can(P.leaveApply) && (
            <Button onClick={() => setApplying(true)}>
              + Apply for leave
            </Button>
          )
        }
      />
      <div className="surface mb-4 flex flex-wrap items-center gap-1.5 p-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParams(t.key ? { status: t.key } : {}, { replace: true })}
            className={cn(
              'rounded-xl px-3.5 py-2 text-sm font-medium transition',
              t.key === status ? 'bg-brand-600 text-white shadow-sm' : 'bg-white/70 text-slate-700 ring-1 ring-slate-200 hover:bg-white',
            )}
          >
            {t.label}
          </button>
        ))}
        {isFetching && <Spinner className="ml-2 size-4 text-slate-400" />}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : !data?.items.length ? (
        <div className="surface p-8">
          <EmptyState title="No leave applications" description={status ? 'None with this status.' : 'Applications appear here once submitted.'} />
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Application</th>
                {approver && <th className="px-4 py-3 text-left">Employee</th>}
                <th className="px-4 py-3 text-left">Leave</th>
                <th className="px-4 py-3 text-left">From – to</th>
                <th className="px-4 py-3 text-right">Days</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((l) => (
                <tr key={l.id} onClick={() => navigate(`/sales/leave/${l.id}`)} className="cursor-pointer hover:bg-brand-50/40">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to={`/sales/leave/${l.id}`} className="text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {l.applicationNo}
                    </Link>
                  </td>
                  {approver && <td className="px-4 py-3 font-medium text-slate-900">{l.employeeName}</td>}
                  <td className="px-4 py-3">{labelOf(LEAVE_TYPES, l.leaveType)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(l.fromDate)} – {formatDate(l.toDate)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.days}</td>
                  <td className="px-4 py-3">
                    <Badge tone={LEAVE_STATUS[l.status]!.tone}>{LEAVE_STATUS[l.status]!.label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {applying && <ApplyDialog onClose={() => setApplying(false)} />}
    </div>
  );
}

function ApplyDialog({ onClose }: { onClose: () => void }) {
  const perm = usePermission();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [apply, { isLoading }] = useApplyForLeaveMutation();
  const dealerships = perm.dealershipsFor(P.leaveApply);
  const today = karachiToday();
  const [v, setV] = useState({ dealershipId: String(dealerships[0]?.id ?? ''), leaveType: 'sick', fromDate: today, toDate: today, department: useDefaultDepartment(), employeeNo: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const days = v.fromDate && v.toDate && v.toDate >= v.fromDate ? Math.round((Date.parse(v.toDate) - Date.parse(v.fromDate)) / 86_400_000) + 1 : 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Apply for leave"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!days || !v.department.trim()}
            loading={isLoading}
            onClick={async () => {
              setErrors({});
              try {
                const l = await apply({
                  leaveApplicationCreate: {
                    dealershipId: Number(v.dealershipId),
                    leaveType: v.leaveType as 'sick',
                    fromDate: v.fromDate,
                    toDate: v.toDate,
                    department: v.department.trim(),
                    employeeNo: v.employeeNo.trim() || null,
                    reason: v.reason.trim() || null,
                  },
                }).unwrap();
                toast.success('Leave application submitted: your manager is notified');
                onClose();
                navigate(`/sales/leave/${l.id}`);
              } catch (e) {
                const issues = (e as { data?: { error?: { details?: { path: string; message: string }[] } } }).data?.error?.details;
                if (Array.isArray(issues)) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
                toast.error(e);
              }
            }}
          >
            Submit application
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2">
          Employee: <span className="font-medium">{user?.fullName}</span>
        </p>
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="lv-dealer" required className="sm:col-span-2">
            <Select id="lv-dealer" value={v.dealershipId} onChange={set('dealershipId')}>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Leave" htmlFor="lv-type" required>
          <Select id="lv-type" value={v.leaveType} onChange={set('leaveType')}>
            {LEAVE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department" htmlFor="lv-dept" required error={errors.department}>
          <Input id="lv-dept" value={v.department} onChange={set('department')} />
        </Field>
        <Field label="From" htmlFor="lv-from" required error={errors.fromDate}>
          <Input id="lv-from" type="date" value={v.fromDate} onChange={set('fromDate')} />
        </Field>
        <Field label="To" htmlFor="lv-to" required error={errors.toDate} hint={days ? `${days} day${days > 1 ? 's' : ''}` : 'The last day must be on or after the first'}>
          <Input id="lv-to" type="date" min={v.fromDate} value={v.toDate} onChange={set('toDate')} />
        </Field>
        <Field label="Employee no." htmlFor="lv-no" hint="Optional: your employee code is used if set">
          <Input id="lv-no" value={v.employeeNo} onChange={set('employeeNo')} />
        </Field>
        <div className="hidden sm:block" />
        <Field label="Reason" htmlFor="lv-reason" className="sm:col-span-2">
          <Textarea id="lv-reason" rows={2} value={v.reason} onChange={set('reason')} placeholder="e.g. Fever, doctor advised two days rest" />
        </Field>
      </div>
    </Dialog>
  );
}
