import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, Section, Spinner, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { type PartsRequest, type PartsRequestLine, useIssuePartsMutation, useListPartsRequestLinesQuery, useReturnPartsMutation, useSetPartsRequestLineRemarkMutation } from '../../partsApi';
import { P } from '../../permissions';

const n = (v: string | null | undefined) => Number(v ?? 0);

/** The store's remark on a part it cannot give yet (not in stock, available in 3-4 days ...); saved when the box is left. Others just read it. */
function RemarkCell({ requestId, line, editable }: { requestId: number; line: PartsRequestLine; editable: boolean }) {
  const toast = useToast();
  const [save] = useSetPartsRequestLineRemarkMutation();
  const [text, setText] = useState(line.storeRemark ?? '');
  useEffect(() => setText(line.storeRemark ?? ''), [line.storeRemark]);
  if (!editable) return <span className="text-xs text-amber-800">{line.storeRemark ?? ''}</span>;
  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={async () => {
        if (text.trim() === (line.storeRemark ?? '')) return;
        try {
          await save({ id: requestId, partsRequestRemarkRequest: { lineId: line.id, remark: text.trim() || null } }).unwrap();
        } catch (e) {
          toast.error(e);
        }
      }}
      maxLength={300}
      className="w-56 py-1 text-xs"
      placeholder="Remark, e.g. not in stock, available in 3-4 days"
      aria-label={`Remark for ${line.partNo}`}
    />
  );
}

/** The parts of one request as table rows; they report their lines up, so one button can issue all of them. */
function RequestRows({ request, canIssue, qty, setQty, onLines }: { request: PartsRequest; canIssue: boolean; qty: Record<number, string>; setQty: (v: Record<number, string>) => void; onLines: (id: number, lines: PartsRequestLine[]) => void }) {
  const { data: lines, isLoading } = useListPartsRequestLinesQuery({ id: request.id });
  useEffect(() => {
    if (lines) onLines(request.id, lines);
  }, [lines, request.id, onLines]);
  if (isLoading) {
    return (
      <tr>
        <td colSpan={8} className="py-1.5">
          <Spinner className="size-4 text-slate-400" />
        </td>
      </tr>
    );
  }
  return (
    <>
      {(lines ?? []).map((l) => (
        <tr key={l.id}>
          <td className="py-1.5 pr-2">
            <span className="font-mono text-xs">{l.partNo}</span> <span className="text-slate-600">{l.description}</span>
          </td>
          <td className="py-1.5 pr-2 text-xs whitespace-nowrap text-slate-500">
            <Link to={`/parts/requests/${request.id}`} className="font-mono hover:text-brand-700">
              {request.requestNo.split('-').pop()}
            </Link>{' '}
            · {formatDateTime(request.createdAt)}
          </td>
          <td className="py-1.5 pr-2 text-right tabular-nums">{n(l.quantity)}</td>
          <td className="py-1.5 pr-2 text-right tabular-nums">{n(l.issuedQty)}</td>
          <td className="py-1.5 pr-2 text-right tabular-nums">{n(l.returnedQty)}</td>
          <td className={`py-1.5 pr-2 text-right tabular-nums ${n(l.onHand) < n(l.quantity) - n(l.issuedQty) ? 'text-red-600' : ''}`}>{n(l.onHand)}</td>
          <td className="py-1.5 pr-2">
            <RemarkCell requestId={request.id} line={l} editable={canIssue} />
          </td>
          <td className="py-1.5 text-right">
            {canIssue ? (
              <Input
                value={qty[l.id] ?? ''}
                onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                className="ml-auto w-20 py-1 text-right text-xs"
                inputMode="decimal"
                placeholder={String(Math.max(0, n(l.quantity) - n(l.issuedQty)))}
                aria-label={`Quantity of ${l.partNo}`}
              />
            ) : null}
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Every part asked for on one job card, from all its requests, in one table: the store enters the quantities and issues them all
 * with one button (each part is issued against the request it was asked for).
 */
export function JobCardPartsDesk({ requests }: { requests: PartsRequest[] }) {
  const perm = usePermission();
  const toast = useToast();
  const [issue, { isLoading: issuing }] = useIssuePartsMutation();
  const [ret, { isLoading: returning }] = useReturnPartsMutation();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [linesBy, setLinesBy] = useState<Record<number, PartsRequestLine[]>>({});
  const active = requests.filter((r) => r.status !== 'cancelled');
  // The quantity to issue is filled in: what is still to be given, as far as the store has it (nothing for a part that is out of stock).
  const onLines = (id: number, lines: PartsRequestLine[]) => {
    setLinesBy((cur) => (cur[id] === lines ? cur : { ...cur, [id]: lines }));
    if (!active.some((r) => r.id === id && ['open', 'partially_issued'].includes(r.status))) return;
    setQty((cur) => {
      const next = { ...cur };
      for (const l of lines) {
        const left = Math.min(n(l.quantity) - n(l.issuedQty), n(l.onHand));
        if (!(l.id in next) && left > 0) next[l.id] = String(left);
      }
      return next;
    });
  };
  const canIssue = active.some((r) => perm.canIn(P.issuesCreate, r.dealershipId, r.branchId));
  const chosenFor = (r: PartsRequest) => (linesBy[r.id] ?? []).filter((l) => Number(qty[l.id]) > 0).map((l) => ({ lineId: l.id, quantity: qty[l.id]!.trim() }));
  const toIssue = active.filter((r) => ['open', 'partially_issued'].includes(r.status)).map((r) => ({ r, lines: chosenFor(r) })).filter((x) => x.lines.length);
  const toReturn = active.map((r) => ({ r, lines: chosenFor(r) })).filter((x) => x.lines.length);

  async function submit(kind: 'issue' | 'return') {
    try {
      for (const { r, lines } of kind === 'issue' ? toIssue : toReturn) {
        if (kind === 'issue') await issue({ id: r.id, issuePartsRequest: { lines } }).unwrap();
        else await ret({ id: r.id, issuePartsRequest: { lines } }).unwrap();
      }
      toast.success(kind === 'issue' ? 'Parts issued to the job card' : 'Parts returned to stock');
      setQty({});
    } catch (e) {
      toast.error(e);
    }
  }

  if (!active.length) return <p className="text-sm text-slate-500">No parts were requested on this job card.</p>;
  const waiting = active.filter((r) => ['open', 'partially_issued'].includes(r.status)).length;
  return (
    <Section title="Parts requested">
      <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>
          {active.length} request{active.length > 1 ? 's' : ''} on this job card
        </span>
        <StatusBadge status={waiting ? 'open' : 'issued'} />
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-1.5 pr-2 font-medium">Part</th>
              <th className="py-1.5 pr-2 font-medium">Request</th>
              <th className="py-1.5 pr-2 text-right font-medium">Requested</th>
              <th className="py-1.5 pr-2 text-right font-medium">Issued</th>
              <th className="py-1.5 pr-2 text-right font-medium">Returned</th>
              <th className="py-1.5 pr-2 text-right font-medium">In store</th>
              <th className="py-1.5 pr-2 font-medium">Remark</th>
              <th className="py-1.5 text-right font-medium">{canIssue ? 'Quantity' : ''}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((r) => (
              <RequestRows key={r.id} request={r} canIssue={canIssue && r.status !== 'cancelled'} qty={qty} setQty={setQty} onLines={onLines} />
            ))}
          </tbody>
        </table>
      </div>
      {canIssue && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={!toIssue.length} loading={issuing} onClick={() => void submit('issue')}>
            Issue to job card
          </Button>
          <Button size="sm" variant="secondary" disabled={!toReturn.length} loading={returning} onClick={() => void submit('return')}>
            Return to stock
          </Button>
        </div>
      )}
    </Section>
  );
}
