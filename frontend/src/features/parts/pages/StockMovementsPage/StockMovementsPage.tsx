import { useSearchParams } from 'react-router';
import { PageHeader, Select } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { StockMovementsTable } from '../../components/StockMovementsTable';
import { MOVEMENT_LABELS, P } from '../../permissions';

/** The whole stock ledger (append-only), filterable by branch and movement type. */
export default function StockMovementsPage() {
  const perm = usePermission();
  const [params, setParams] = useSearchParams();
  const branchId = params.get('branchId') ?? '';
  const type = params.get('type') ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  return (
    <div>
      <PageHeader title="Stock movements" subtitle="Every receipt, issue, return, transfer and adjustment. Entries can never be changed." />
      <div className="flex flex-wrap gap-3 py-4">
        <Select value={branchId} onChange={(e) => set('branchId', e.target.value)} className="w-auto" aria-label="Branch">
          <option value="">All branches</option>
          {perm.branchesFor(P.stockView).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => set('type', e.target.value)} className="w-auto" aria-label="Movement type">
          <option value="">All movements</option>
          {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>
      <div className="surface p-5 sm:p-6">
        <StockMovementsTable
          key={`${branchId}-${type}`}
          filter={{ branchId: branchId ? Number(branchId) : undefined, type: (type || undefined) as never }}
          pageSize={50}
        />
      </div>
    </div>
  );
}
