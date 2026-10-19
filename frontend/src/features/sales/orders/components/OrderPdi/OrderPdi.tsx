import { useState } from 'react';
import { Badge, Button, Dialog, Section, Spinner, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { P } from '../../../permissions';
import { useCommentOnPdiMutation, useGetOrderPdiQuery, useRecordOrderPdiMutation } from '../../../salesApi';
import { PdiForm } from './PdiForm';

/**
 * The PDI (pre-delivery inspection) of the car on an order: done / issue found, the description, who
 * recorded it, and the comments (the Manager and others ask or answer, like the follow-up comments).
 * Shown to everyone who sees the order, once a car is on it.
 */
export function OrderPdi({ orderId, dealershipId, branchId, hasCar }: { orderId: number; dealershipId: number; branchId?: number | null; hasCar: boolean }) {
  const perm = usePermission();
  const toast = useToast();
  const { data, isLoading, isError } = useGetOrderPdiQuery({ id: orderId }, { skip: !hasCar });
  const [record, { isLoading: saving }] = useRecordOrderPdiMutation();
  const [comment, { isLoading: posting }] = useCommentOnPdiMutation();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState('');

  if (!hasCar || isError) return null;
  const atDealership = data?.carStatus === 'received' || data?.carStatus === 'ready_for_delivery';
  // Before the car arrives there is nothing to show yet.
  if (!isLoading && !data?.recorded && !atDealership && data?.carStatus !== 'delivered') return null;
  const canRecord = atDealership && perm.canIn(P.ordersAllocate, dealershipId, branchId);

  return (
    <Section
      title="PDI (pre-delivery inspection)"
      actions={canRecord && data?.recorded && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Update PDI</Button>}
    >
      {isLoading || !data ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !data.recorded ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone="amber">PDI not recorded yet</Badge>
          {canRecord ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              Record the PDI
            </Button>
          ) : (
            <span className="text-slate-500">The Delivery Team records it.</span>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {data.issue ? <Badge tone="red" dot>PDI not clear</Badge> : data.done ? <Badge tone="green" dot>PDI done</Badge> : <Badge tone="amber" dot>PDI pending</Badge>}
          </div>
          {data.notes && <p className={data.issue ? 'rounded-lg bg-red-50 px-3 py-2 text-red-900' : 'text-slate-800'}>{data.notes}</p>}
          <p className="text-xs text-slate-500">
            {data.recordedByName ?? 'Delivery Team'} · {formatDateTime(data.recordedAt)}
          </p>
        </div>
      )}

      {data?.recorded && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {data.comments.length > 0 && (
            <ul className="mb-3 space-y-2 border-l-2 border-brand-100 pl-3">
              {data.comments.map((c) => (
                <li key={c.id} className="text-sm">
                  <p className="text-slate-800">{c.body}</p>
                  <p className="text-xs text-slate-500">
                    {c.createdByName ?? 'Unknown'} · {formatDateTime(c.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Comment on the PDI, e.g. please share a photo of the scratch"
              aria-label="Comment on the PDI"
              className="flex-1"
              maxLength={1000}
            />
            <Button
              size="sm"
              disabled={!body.trim()}
              loading={posting}
              onClick={async () => {
                try {
                  await comment({ id: orderId, pdiCommentRequest: { body: body.trim() } }).unwrap();
                  toast.success('Comment added: everyone linked to this car is notified');
                  setBody('');
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Comment
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <Dialog open onClose={() => setEditing(false)} title="PDI (pre-delivery inspection)">
          <PdiForm
            initial={data?.recorded ? { done: data.done, issue: data.issue, notes: data.notes ?? '' } : undefined}
            submitLabel="Save PDI"
            loading={saving}
            onCancel={() => setEditing(false)}
            onSubmit={async (pdi) => {
              try {
                await record({ id: orderId, pdiRequest: pdi }).unwrap();
                toast.success(pdi.issue ? 'PDI saved: the issue is reported to everyone linked to this car' : 'PDI saved');
                setEditing(false);
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
