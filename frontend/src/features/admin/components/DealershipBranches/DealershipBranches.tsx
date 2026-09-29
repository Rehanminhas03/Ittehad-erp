import { Link } from 'react-router';
import { Badge, Button, Section, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { useListBranchesQuery } from '../../adminApi';
import { P } from '../../permissions';

export function DealershipBranches({ dealershipId }: { dealershipId: number }) {
  const perm = usePermission();
  const canView = perm.can(P.branchesView);
  const { data, isLoading } = useListBranchesQuery({ dealershipId, pageSize: 100 }, { skip: !canView });
  if (!canView) return null;
  return (
    <Section
      title="Branches"
      actions={
        perm.canIn(P.branchesCreate, dealershipId, null) && (
          <Link to="/admin/branches/new">
            <Button size="sm" variant="secondary">
              Add branch
            </Button>
          </Link>
        )
      }
    >
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !data?.items.length ? (
        <p className="text-sm text-slate-500">No branches.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/admin/branches/${b.id}`} className="font-medium text-slate-800 hover:text-brand-700">
                {b.name} <span className="font-mono text-xs text-slate-400">{b.code}</span>
              </Link>
              {b.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
