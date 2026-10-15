import { useState } from 'react';
import { Button, Input, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../../permissions';
import { useBulkReassignLeadsMutation, useListSalesTeamMembersQuery } from '../../../salesApi';

/**
 * The bar above the leads list while leads are selected: give them all to one salesperson / CRO.
 * The Assistant Manager / Manager transfer any lead; a CRO their own leads and the social media ones
 * (e.g. when the workload is too much).
 */
export function BulkTransfer({ ids, clear }: { ids: number[]; clear: () => void }) {
  const perm = usePermission();
  const toast = useToast();
  const dealershipId = [P.leadsReassign, P.leadsTransfer].flatMap((c) => perm.dealershipsFor(c))[0]?.id;
  const { data: members } = useListSalesTeamMembersQuery({ dealershipId: dealershipId ?? 0 }, { skip: !dealershipId });
  const [assign, { isLoading }] = useBulkReassignLeadsMutation();
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  // Salespersons and CROs: the staff who work their own leads.
  const options = (members ?? []).filter((m) => m.takesLeads);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <p className="text-sm font-semibold text-slate-900">
        {ids.length} lead{ids.length > 1 ? 's' : ''} selected
      </p>
      <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="lg:w-64" aria-label="Give the leads to">
        <option value="">Give them to…</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.fullName}
            {m.id === perm.userId ? ' (me)' : ''}
          </option>
        ))}
      </Select>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional), e.g. too many leads today" maxLength={500} className="lg:flex-1" aria-label="Reason" />
      <div className="flex gap-2">
        <Button
          disabled={!ownerId}
          loading={isLoading}
          onClick={async () => {
            try {
              const r = await assign({ bulkReassignRequest: { leadIds: ids, ownerId: Number(ownerId), note: note.trim() || null } }).unwrap();
              toast.success(`${r.moved} lead${r.moved === 1 ? '' : 's'} given to ${r.toName}; they have been notified`);
              if (r.skipped.length) toast.error(`${r.skipped.length} not moved: ${r.skipped[0]!.reason}`);
              clear();
              setOwnerId('');
              setNote('');
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Assign selected
        </Button>
        <Button variant="secondary" onClick={clear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
