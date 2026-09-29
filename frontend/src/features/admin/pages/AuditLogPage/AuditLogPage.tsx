import { useSearchParams } from 'react-router';
import { describeChanges } from '@/shared/components';
import { EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage, formatDateTime, humanize } from '@/shared/lib';
import { useListAuditLogQuery } from '../../adminApi';
import { P } from '../../permissions';

const ENTITY_TYPES = ['core.dealership', 'core.branch', 'core.user', 'core.role', 'core.legal_entity', 'core.accounting_entity'];

export default function AuditLogPage() {
  const [params, setParams] = useSearchParams();
  const perm = usePermission();
  const page = Number(params.get('page') ?? 1) || 1;
  const entityType = params.get('entityType') ?? '';
  const dealershipId = params.get('dealershipId') ?? '';
  const action = params.get('action') ?? '';

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (k !== 'page') next.delete('page');
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  // Always fresh: the audit log changes with every write anywhere in the system.
  const { data, isLoading, isError, error, refetch } = useListAuditLogQuery(
    {
      page,
      pageSize: 50,
      entityType: entityType || undefined,
      dealershipId: dealershipId ? Number(dealershipId) : undefined,
      action: action || undefined,
    },
    { refetchOnMountOrArgChange: true },
  );

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every change, append-only. Shown within your scope." />
      <div className="flex flex-wrap gap-3 py-4">
        <Select value={entityType} onChange={(e) => set('entityType', e.target.value)} className="w-auto" aria-label="Record type">
          <option value="">All record types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t.split('.')[1]!)}
            </option>
          ))}
        </Select>
        <Select value={dealershipId} onChange={(e) => set('dealershipId', e.target.value)} className="w-auto" aria-label="Dealership">
          <option value="">All dealerships</option>
          {perm.dealershipsFor(P.auditView).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Input defaultValue={action} onBlur={(e) => set('action', e.target.value.trim())} placeholder="Action, e.g. update" className="max-w-48" aria-label="Action" />
      </div>
      <div className="surface overflow-hidden">
        {isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : isLoading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Spinner />
          </div>
        ) : !data?.items.length ? (
          <EmptyState title="No audit entries" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium">Who</th>
                    <th className="px-4 py-2.5 font-medium">Record</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-4 py-2.5 font-medium">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDateTime(e.occurredAt)}</td>
                      <td className="px-4 py-3">{e.actorName ?? 'system'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {humanize(e.entityType.split('.')[1] ?? e.entityType)} #{e.entityId}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{humanize(e.action)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {describeChanges(e.changes).slice(0, 4).join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4">
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', p > 1 ? String(p) : '')} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
