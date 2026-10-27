import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, Section, Select, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { useCreatePartsRequestMutation, useListPartsRequestsQuery } from '../../partsApi';
import { P } from '../../permissions';
import { PartPicker } from '../PartPicker';

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
  const [create, { isLoading }] = useCreatePartsRequestMutation();
  const stores = perm.branchesFor(P.requestsCreate, jobCard.dealershipId);
  const canCreate = ['open', 'in_progress'].includes(jobCard.status) && perm.canIn(P.requestsCreate, jobCard.dealershipId, jobCard.branchId) && stores.length > 0;
  const [branchId, setBranchId] = useState(String(jobCard.branchId ?? stores[0]?.id ?? ''));
  const [rows, setRows] = useState<Row[]>([]);
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
    </Section>
  );
}
