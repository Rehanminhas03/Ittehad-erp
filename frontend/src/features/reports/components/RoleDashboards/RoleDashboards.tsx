import { useSearchParams } from 'react-router';
import { Badge, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { isModuleEnabled, type ModuleKey } from '@/shared/config';
import { cn } from '@/shared/lib';
import { presetRange, type PeriodPreset } from '../../lib/period';
import { DASHBOARD_PERMISSIONS, type DashboardKey, MODE_LABELS } from '../../permissions';
import { useListDashboardsQuery } from '../../reportsApi';
import { PeriodPicker, type PeriodValue } from '../PeriodPicker';
import { ReportDashboard } from '../ReportDashboard';

/**
 * The dashboards the user may open (sales, service, parts, finance), each scoped by the server to
 * the group, their dealerships or their own work. Tab, period and dealership live in the URL.
 */
export function RoleDashboards() {
  const perm = usePermission();
  const [params, setParams] = useSearchParams();
  const { data: all, isLoading } = useListDashboardsQuery();
  const available = all?.filter((d) => isModuleEnabled(d.key as ModuleKey));

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  if (isLoading) return <Spinner className="size-5 text-slate-400" />;
  if (!available?.length) return null;

  const current = available.find((d) => d.key === params.get('report')) ?? available[0]!;
  const preset = (params.get('period') as PeriodPreset | null) ?? 'this_month';
  const range = preset === 'custom' ? { from: params.get('from') ?? presetRange('this_month').from, to: params.get('to') ?? presetRange('this_month').to } : presetRange(preset);
  const period: PeriodValue = { preset, ...range };

  const dealerships = [...new Map(DASHBOARD_PERMISSIONS[current.key as DashboardKey].flatMap((c) => perm.dealershipsFor(c)).map((d) => [d.id, d])).values()];
  const dealershipId = Number(params.get('dealershipId')) || undefined;
  const validDealership = dealerships.some((d) => d.id === dealershipId) ? dealershipId : undefined;

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex items-center gap-1 rounded-xl bg-slate-200/60 p-1" aria-label="Dashboards">
          {available.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => update({ report: d.key, dealershipId: null })}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                d.key === current.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
              aria-current={d.key === current.key ? 'page' : undefined}
            >
              {d.title}
            </button>
          ))}
        </nav>
        <Badge tone="blue">{MODE_LABELS[current.mode]}</Badge>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <PeriodPicker
          value={period}
          onChange={(v) =>
            update(
              v.preset && v.preset !== 'custom'
                ? { period: v.preset === 'this_month' ? null : v.preset, from: null, to: null }
                : { period: 'custom', from: v.from ?? period.from, to: v.to ?? period.to },
            )
          }
        />
        {dealerships.length > 1 && current.mode !== 'own' && (
          <Select value={validDealership ?? ''} onChange={(e) => update({ dealershipId: e.target.value || null })} className="w-auto" aria-label="Dealership">
            <option value="">All my dealerships</option>
            {dealerships.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <ReportDashboard arg={{ key: current.key, from: period.from, to: period.to, dealershipId: validDealership }} />
    </section>
  );
}
