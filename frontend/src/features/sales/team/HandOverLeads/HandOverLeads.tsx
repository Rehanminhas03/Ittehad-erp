import { useState } from 'react';
import { Button, Checkbox, Field, Section, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { useGetLeadsToHandOverQuery, useHandOverLeadsMutation, useListSalesTeamMembersQuery } from '../../salesApi';
import { P } from '../../permissions';

type Person = { id: number; fullName: string; isActive: boolean; roles: { dealershipId: number | null; dealershipName: string | null }[] };

/**
 * On a staff member's page (Sales Manager): gives their leads, with the quotations and PPF vouchers,
 * to someone else in the team, e.g. when they leave. One panel per dealership where they have leads.
 */
export function HandOverLeads({ user }: { user: Person }) {
  const perm = usePermission();
  const dealerships = new Map<number, string>();
  for (const r of user.roles) {
    if (r.dealershipId !== null && perm.canIn(P.teamManage, r.dealershipId)) dealerships.set(r.dealershipId, r.dealershipName ?? `#${r.dealershipId}`);
  }
  if (!dealerships.size) return null;
  return (
    <>
      {[...dealerships].map(([id, name]) => (
        <HandOverAt key={id} user={user} dealershipId={id} dealershipName={dealerships.size > 1 ? name : null} />
      ))}
    </>
  );
}

function HandOverAt({ user, dealershipId, dealershipName }: { user: Person; dealershipId: number; dealershipName: string | null }) {
  const toast = useToast();
  const { data: counts } = useGetLeadsToHandOverQuery({ dealershipId, userId: user.id });
  const { data: members } = useListSalesTeamMembersQuery({ dealershipId });
  const [handOver, { isLoading }] = useHandOverLeadsMutation();
  const [toUserId, setToUserId] = useState('');
  const [includeInProgress, setIncludeInProgress] = useState(!user.isActive);

  if (!counts || counts.open + counts.inProgress === 0) return null;
  const others = (members ?? []).filter((m) => m.id !== user.id);
  const count = counts.open + (includeInProgress ? counts.inProgress : 0);

  return (
    <Section title={`Hand over leads${dealershipName ? ` — ${dealershipName}` : ''}`}>
      <p className="mb-3 text-sm text-slate-700">
        {user.fullName} has <b>{counts.open}</b> open lead{counts.open === 1 ? '' : 's'} (new / follow-up)
        {counts.inProgress > 0 && (
          <>
            {' '}and <b>{counts.inProgress}</b> converted or in progress (car not yet delivered)
          </>
        )}
        . {!user.isActive && 'They have left: give these customers to someone else so they are followed up.'}
      </p>
      <div className="grid max-w-xl grid-cols-1 gap-3">
        <Field label="Give the leads to" htmlFor={`ho-to-${dealershipId}`} required>
          <Select id={`ho-to-${dealershipId}`} value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
            <option value="">Select a person…</option>
            {others.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
        </Field>
        {counts.inProgress > 0 && (
          <Checkbox
            checked={includeInProgress}
            onChange={(e) => setIncludeInProgress(e.target.checked)}
            label="Also the converted / in-progress customers (the new person becomes their contact until delivery; the sale stays credited to the original salesperson)"
          />
        )}
        <div>
          <Button
            disabled={!toUserId || count === 0}
            loading={isLoading}
            onClick={async () => {
              try {
                const r = await handOver({ handOverLeadsRequest: { dealershipId, fromUserId: user.id, toUserId: Number(toUserId), includeInProgress } }).unwrap();
                toast.success(`${r.moved} lead${r.moved === 1 ? '' : 's'} handed over to ${r.toName}`);
                setToUserId('');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Hand over {count} lead{count === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Section>
  );
}
