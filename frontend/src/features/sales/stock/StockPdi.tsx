import { useState } from 'react';
import { Badge, Button, Dialog, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { PdiForm } from '../orders/components/OrderPdi';
import { P } from '../permissions';
import { type StockVehicle, useRecordStockVehiclePdiMutation } from '../salesApi';

/** The PDI badge of a car in stock: done, pending or not clear (issue found); nothing when never recorded. */
export function PdiBadge({ status }: { status?: string | null }) {
  if (status === 'done') return <Badge tone="green" dot>PDI done</Badge>;
  if (status === 'issue') return <Badge tone="red" dot>PDI not clear</Badge>;
  if (status === 'pending') return <Badge tone="amber" dot>PDI pending</Badge>;
  return <span className="text-slate-400">—</span>;
}

/** On a car's page: its PDI and the issue found, and a button for the Delivery Team to record or correct it. */
export function StockPdi({ v }: { v: StockVehicle }) {
  const perm = usePermission();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [save, { isLoading }] = useRecordStockVehiclePdiMutation();
  const canEdit = v.dealershipId ? perm.canIn(P.stockManage, v.dealershipId) : perm.can(P.stockManage);

  return (
    <Section title="PDI (pre-delivery inspection)" actions={canEdit && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{v.pdiStatus ? 'Update PDI' : 'Record the PDI'}</Button>}>
      {v.pdiStatus ? (
        <div className="space-y-2 text-sm">
          <PdiBadge status={v.pdiStatus} />
          {v.pdiStatus === 'issue' && v.pdiIssue && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900">{v.pdiIssue}</p>}
          {v.pdiRecordedAt && <p className="text-xs text-slate-500">Recorded {formatDateTime(v.pdiRecordedAt)}</p>}
        </div>
      ) : (
        <p className="text-sm text-slate-500">The PDI has not been recorded for this car.</p>
      )}
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="PDI (pre-delivery inspection)">
          <PdiForm
            initial={v.pdiStatus ? { done: v.pdiStatus !== 'pending', issue: v.pdiStatus === 'issue', notes: v.pdiIssue ?? null } : undefined}
            submitLabel="Save PDI"
            loading={isLoading}
            onCancel={() => setOpen(false)}
            onSubmit={async (pdi) => {
              try {
                await save({ id: v.id, pdiRequest: pdi }).unwrap();
                toast.success('PDI saved');
                setOpen(false);
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
