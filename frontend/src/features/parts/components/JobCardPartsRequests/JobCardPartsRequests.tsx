import { useState } from 'react';
import { Link } from 'react-router';
import { Button, ConfirmDialog, Input, Section, Select, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { useCreatePartsRequestMutation, useListPartsRequestsQuery, useListPendingPartReturnsQuery, useTransitionPartsRequestMutation } from '../../partsApi';
import { P } from '../../permissions';
import { PartPicker } from '../PartPicker';
import { ReturnRequestParts } from '../ReturnRequestParts';

interface JobCardRef {
  id: number;
  dealershipId: number;
  branchId: number | null;
  status: string;
}

interface Row {
  partNo: string;
  description: string;
  quantity: string;
}

/**
 * On a job card: its parts requests, and asking the parts desk for parts. Parts are found by number or name in
 * the catalogue (a drop-down of matches), so the advisor never types a part number from memory.
 * (Issued parts appear on the job card's work lines at the selling price.)
 */
export function JobCardPartsRequests({ jobCard }: { jobCard: JobCardRef }) {
  const perm = usePermission();
  const toast = useToast();
  const canView = perm.can(P.requestsView);
  const { data } = useListPartsRequestsQuery({ jobCardId: jobCard.id, pageSize: 50 }, { skip: !canView });
  const { data: pendingReturns } = useListPendingPartReturnsQuery({ jobCardId: jobCard.id }, { skip: !canView });
  const [create, { isLoading }] = useCreatePartsRequestMutation();
  const stores = perm.branchesFor(P.requestsCreate, jobCard.dealershipId);
  const canCreate = ['open', 'in_progress'].includes(jobCard.status) && perm.canIn(P.requestsCreate, jobCard.dealershipId, jobCard.branchId) && stores.length > 0;
  const [branchId, setBranchId] = useState(String(jobCard.branchId ?? stores[0]?.id ?? ''));
  const [rows, setRows] = useState<Row[]>([]);
  // Delete = cancel a request the store has not started on (it stays in the history).
  const [removing, setRemoving] = useState<{ id: number; requestNo: string } | null>(null);
  const [transition, { isLoading: removingNow }] = useTransitionPartsRequestMutation();
  const valid = rows.filter((r) => Number(r.quantity) > 0);

  if (!canView) return null;
  return (
    <Section title="Parts requests">
      {data?.items.length ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {data.items.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/parts/requests/${r.id}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                {r.requestNo}
                {r.kind === 'return' && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-amber-800">Return</span>}
              </Link>
              <span className="flex items-center gap-3 text-slate-500">
                {r.branchName} · {formatDateTime(r.createdAt)}
                {r.kind !== 'return' && ['issued', 'partially_issued'].includes(r.status) && ['open', 'in_progress'].includes(jobCard.status) && perm.canIn(P.requestsCreate, jobCard.dealershipId, jobCard.branchId) && (
                  <ReturnRequestParts jobCardId={jobCard.id} requestId={r.id} pending={pendingReturns} />
                )}
                <StatusBadge status={r.status} />
                {r.status === 'open' && perm.canIn(P.requestsCancel, jobCard.dealershipId, jobCard.branchId) && (
                  <button type="button" className="text-xs font-medium text-red-600 hover:underline" onClick={() => setRemoving({ id: r.id, requestNo: r.requestNo })}>
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-slate-500">No parts requested yet.</p>
      )}
      {canCreate && (
        <div className="space-y-3">
          <PartPicker
            placeholder="Search the part by number or name, then choose it…"
            onPick={(p) =>
              setRows((cur) =>
                cur.some((r) => r.partNo === p.partNo)
                  ? cur.map((r) => (r.partNo === p.partNo ? { ...r, quantity: String(Number(r.quantity || 0) + 1) } : r))
                  : [...cur, { partNo: p.partNo, description: p.description, quantity: '1' }],
              )
            }
          />
          {rows.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {rows.map((r) => (
                <li key={r.partNo} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs text-slate-900">{r.partNo}</span>
                    <span className="block truncate text-slate-600">{r.description}</span>
                  </span>
                  <Input
                    value={r.quantity}
                    onChange={(e) => setRows(rows.map((x) => (x.partNo === r.partNo ? { ...x, quantity: e.target.value } : x)))}
                    className="w-20 py-1 text-right text-xs"
                    inputMode="decimal"
                    aria-label={`Quantity of ${r.partNo}`}
                  />
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setRows(rows.filter((x) => x.partNo !== r.partNo))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto py-1 text-xs" aria-label="Store">
              {stores.map((b) => (
                <option key={b.id} value={b.id}>
                  From {b.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              disabled={!valid.length}
              loading={isLoading}
              onClick={async () => {
                try {
                  const req = await create({
                    partsRequestCreate: { jobCardId: jobCard.id, branchId: Number(branchId), lines: valid.map((r) => ({ partNo: r.partNo, quantity: r.quantity.trim() })) },
                  }).unwrap();
                  toast.success(`Parts request ${req.requestNo} sent to the parts desk`);
                  setRows([]);
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Request parts
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!removing}
        danger
        title="Delete parts request"
        message={`Delete ${removing?.requestNo ?? ''}? The store will no longer see it. This cannot be done once the store has started on it.`}
        confirmLabel="Delete"
        loading={removingNow}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await transition({ id: removing.id, body: { action: 'cancel', comment: 'Deleted from the job card' } }).unwrap();
            toast.success(`${removing.requestNo} deleted`);
            setRemoving(null);
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </Section>
  );
}
