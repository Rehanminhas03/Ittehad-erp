import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, Section, Select, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { useCreatePartsRequestMutation, useListPartsRequestsQuery } from '../../partsApi';
import { P } from '../../permissions';

interface JobCardRef {
  id: number;
  dealershipId: number;
  branchId: number | null;
  status: string;
}

/**
 * On a job card: its parts requests, and asking the parts desk for parts.
 * (Issued parts appear on the job card's work lines at the selling price.)
 */
export function JobCardPartsRequests({ jobCard }: { jobCard: JobCardRef }) {
  const perm = usePermission();
  const toast = useToast();
  const canView = perm.can(P.requestsView);
  const { data } = useListPartsRequestsQuery({ jobCardId: jobCard.id, pageSize: 50 }, { skip: !canView });
  const [create, { isLoading }] = useCreatePartsRequestMutation();
  const stores = perm.branchesFor(P.requestsCreate, jobCard.dealershipId);
  const canCreate = ['open', 'in_progress'].includes(jobCard.status) && perm.canIn(P.requestsCreate, jobCard.dealershipId, jobCard.branchId) && stores.length > 0;
  const [branchId, setBranchId] = useState(String(jobCard.branchId ?? stores[0]?.id ?? ''));
  const [rows, setRows] = useState([{ partNo: '', quantity: '1' }]);
  const valid = rows.filter((r) => r.partNo.trim() && Number(r.quantity) > 0);

  if (!canView) return null;
  return (
    <Section title="Parts requests">
      {data?.items.length ? (
        <ul className="mb-4 divide-y divide-slate-100">
          {data.items.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/parts/requests/${r.id}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                {r.requestNo}
              </Link>
              <span className="flex items-center gap-3 text-slate-500">
                {r.branchName} · {formatDateTime(r.createdAt)}
                <StatusBadge status={r.status} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-slate-500">No parts requested yet.</p>
      )}
      {canCreate && (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={r.partNo}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, partNo: e.target.value } : x)))}
                placeholder="Part no."
                className="max-w-48 py-1 text-xs"
                aria-label="Part number"
              />
              <Input
                value={r.quantity}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                className="w-20 py-1 text-right text-xs"
                inputMode="decimal"
                aria-label="Quantity"
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { partNo: '', quantity: '1' }])}>
              + Add part
            </Button>
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
                    partsRequestCreate: { jobCardId: jobCard.id, branchId: Number(branchId), lines: valid.map((r) => ({ partNo: r.partNo.trim(), quantity: r.quantity.trim() })) },
                  }).unwrap();
                  toast.success(`Parts request ${req.requestNo} sent to the parts desk`);
                  setRows([{ partNo: '', quantity: '1' }]);
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
    </Section>
  );
}
