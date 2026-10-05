import { useState } from 'react';
import { Button, Field, Input, Section, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../../permissions';
import { type Lead, useListSalesTeamMembersQuery, useReassignLeadMutation } from '../../../salesApi';

/**
 * Assistant Manager / Manager: give the lead to another salesperson (e.g. the first one is on
 * leave). Its quotations and PPF vouchers go with it; the new salesperson is notified.
 */
export function LeadReassign({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const allowed = lead.status !== 'completed' && perm.canIn(P.leadsReassign, lead.dealershipId, lead.branchId);
  const { data: members } = useListSalesTeamMembersQuery({ dealershipId: lead.dealershipId }, { skip: !allowed });
  const [reassign, { isLoading }] = useReassignLeadMutation();
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState('');
  const [note, setNote] = useState('');
  if (!allowed) return null;
  // Salespersons and CROs (the staff who work their own leads), not the current one.
  const options = (members ?? []).filter((m) => m.takesLeads && m.id !== lead.ownerId);

  return (
    <Section
      title="Salesperson"
      actions={
        !open && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Reassign
          </Button>
        )
      }
    >
      <p className="text-sm text-slate-700">
        This lead is with <span className="font-semibold">{lead.ownerName ?? '—'}</span>.
      </p>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[16rem_1fr_auto] sm:items-end">
          <Field label="Give it to" htmlFor="ra-owner" required>
            <Select id="ra-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Select a salesperson…</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" htmlFor="ra-note">
            <Input id="ra-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. On leave this week" maxLength={500} />
          </Field>
          <div className="flex gap-2">
            <Button
              disabled={!ownerId}
              loading={isLoading}
              onClick={async () => {
                try {
                  const l = await reassign({ id: lead.id, reassignLeadRequest: { ownerId: Number(ownerId), note: note.trim() || null } }).unwrap();
                  toast.success(`Lead given to ${l.ownerName ?? 'the new salesperson'}; they have been notified`);
                  setOpen(false);
                  setOwnerId('');
                  setNote('');
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Reassign
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-slate-500 sm:col-span-3">Its quotations and PPF vouchers go with it. A sales order already raised stays credited to the original salesperson.</p>
        </div>
      )}
    </Section>
  );
}
