import { useState } from 'react';
import { Button, Input, Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { type PartsRequest, useIssuePartsMutation, useListPartsRequestLinesQuery, useReturnPartsMutation } from '../../partsApi';
import { P } from '../../permissions';

const n = (v: string | null | undefined) => Number(v ?? 0);

/** Parts desk: issue requested parts to the job card, or take unused parts back into stock. */
export function PartsRequestDesk({ request }: { request: PartsRequest }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: lines, isLoading } = useListPartsRequestLinesQuery({ id: request.id });
  const [issue, { isLoading: issuing }] = useIssuePartsMutation();
  const [ret, { isLoading: returning }] = useReturnPartsMutation();
  const [qty, setQty] = useState<Record<number, string>>({});
  const canIssue = perm.canIn(P.issuesCreate, request.dealershipId, request.branchId) && request.status !== 'cancelled';
  const chosen = (lines ?? []).filter((l) => Number(qty[l.id]) > 0).map((l) => ({ lineId: l.id, quantity: qty[l.id]!.trim() }));

  async function submit(kind: 'issue' | 'return') {
    try {
      if (kind === 'issue') await issue({ id: request.id, issuePartsRequest: { lines: chosen } }).unwrap();
      else await ret({ id: request.id, issuePartsRequest: { lines: chosen } }).unwrap();
      toast.success(kind === 'issue' ? 'Parts issued to the job card' : 'Parts returned to stock');
      setQty({});
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Section title="Parts">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-medium">Part</th>
              <th className="py-2 pr-2 text-right font-medium">Requested</th>
              <th className="py-2 pr-2 text-right font-medium">Issued</th>
              <th className="py-2 pr-2 text-right font-medium">Returned</th>
              <th className="py-2 pr-2 text-right font-medium">In store</th>
              {canIssue && <th className="py-2 pr-2 text-right font-medium">Quantity</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines?.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-2">
                  <span className="font-mono text-xs">{l.partNo}</span> <span className="text-slate-600">{l.description}</span>
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{n(l.quantity)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{n(l.issuedQty)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{n(l.returnedQty)}</td>
                <td className={`py-2 pr-2 text-right tabular-nums ${n(l.onHand) < n(l.quantity) - n(l.issuedQty) ? 'text-red-600' : ''}`}>{n(l.onHand)}</td>
                {canIssue && (
                  <td className="py-2 pr-2 text-right">
                    <Input
                      value={qty[l.id] ?? ''}
                      onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                      className="ml-auto w-20 py-1 text-right text-xs"
                      inputMode="decimal"
                      placeholder={String(Math.max(0, n(l.quantity) - n(l.issuedQty)))}
                      aria-label={`Quantity of ${l.partNo}`}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canIssue && (
        <div className="mt-3 flex gap-2">
          {['open', 'partially_issued'].includes(request.status) && (
            <Button size="sm" disabled={!chosen.length} loading={issuing} onClick={() => void submit('issue')}>
              Issue to job card
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={!chosen.length} loading={returning} onClick={() => void submit('return')}>
            Return to stock
          </Button>
        </div>
      )}
    </Section>
  );
}
