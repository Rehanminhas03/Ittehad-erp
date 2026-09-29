import { DashboardWidget } from '@/shared/components';
import { EmptyState, ErrorState, Spinner } from '@/shared/components/ui';
import { apiErrorMessage, cn } from '@/shared/lib';
import { formatValue } from '../../lib/format';
import { type GetDashboardApiArg, useGetDashboardQuery } from '../../reportsApi';

/**
 * Renders any dashboard the server returns: headline figures, charts and tables. The server
 * decides the figures and their reach; this component only lays them out.
 */
export function ReportDashboard({ arg }: { arg: GetDashboardApiArg }) {
  const { data, isLoading, isFetching, isError, error, refetch } = useGetDashboardQuery(arg);
  if (isLoading) return <Spinner className="my-8 size-5 text-slate-400" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (!data) return <EmptyState title="No data" />;

  return (
    <div className={cn('space-y-8 transition-opacity', isFetching && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
        {data.metrics.map((m) => (
          <DashboardWidget key={m.key} kind="kpi" title={m.label} value={formatValue(m.value, m.format)} hint={m.hint ?? undefined} to={m.to ?? undefined} />
        ))}
      </div>
      {data.charts.length > 0 && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          {data.charts.map((c) => (
            <DashboardWidget
              key={c.key}
              kind="chart"
              title={c.title}
              data={c.data}
              format={(v) => formatValue(v, c.format)}
              to={c.to ?? undefined}
            />
          ))}
        </div>
      )}
      {data.tables.map((t) => (
        <DashboardWidget
          key={t.key}
          kind="table"
          title={t.title}
          columns={t.columns.map((col) => ({
            key: col.key,
            header: col.header,
            align: col.format === 'text' ? undefined : ('right' as const),
            render: (r: Record<string, unknown>) => formatValue(r[col.key] as string | number | null, col.format),
          }))}
          rows={t.rows as Record<string, unknown>[]}
          empty="Nothing in this period."
        />
      ))}
    </div>
  );
}
