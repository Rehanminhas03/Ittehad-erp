import { useState } from 'react';
import { DateRangePicker, LIST_RANGES, rangeLabel } from '@/shared/components';
import { Badge, Button, ErrorState, PageHeader, Select, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiErrorMessage, humanize } from '@/shared/lib';
import { downloadCsv, downloadTablePdf, LEAD_COLUMNS, LEAD_PDF_COLUMNS } from '../../exports/exporters';
import { LEAD_STATES, LEAD_TEMPERATURES, P } from '../../permissions';
import { useExportLeadsQuery } from '../../salesApi';

type Group = '' | 'social' | 'salespeople';
const GROUPS: { value: Group; label: string }[] = [
  { value: '', label: 'All leads' },
  { value: 'social', label: 'Social media leads (Meta ads)' },
  { value: 'salespeople', label: 'Salesperson leads (walk-in, calls…)' },
];

/**
 * Leads report (CRO, Assistant Manager, Sales Manager): choose the period, which leads (social media,
 * salespeople's, or all), a status and an interest, see the summary and a preview, then download it as
 * Excel (CSV) or PDF. Every follow-up with the remarks entered is included.
 */
export default function LeadsReportPage() {
  const perm = usePermission();
  const toast = useToast();
  const dealerships = [P.leadsViewAll, P.leadsViewSocial, P.leadsViewTeam].flatMap((c) => perm.dealershipsFor(c)).filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i);
  const [dealershipId, setDealershipId] = useState<number | undefined>(undefined);
  const [group, setGroup] = useState<Group>('');
  const [status, setStatus] = useState('');
  const [temperature, setTemperature] = useState('');
  const [rangeKey, setRangeKey] = useState('28d');
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const period = rangeKey === 'custom' ? custom : (LIST_RANGES.find((r) => r.key === rangeKey) ?? LIST_RANGES[0]!).range();
  const periodText = rangeKey === 'custom' ? rangeLabel({ from: custom.from, to: custom.to }) || 'the chosen dates' : (LIST_RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase() ?? '');
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useExportLeadsQuery({
    from: period.from,
    to: period.to,
    dealershipId,
    status: status || undefined,
    group: group || undefined,
    temperature: (temperature || undefined) as never,
  });
  const rows = (data ?? []) as Record<string, unknown>[];
  const social = rows.filter((r) => r.source === 'social').length;
  const byStatus = rows.reduce<Record<string, number>>((a, r) => ({ ...a, [String(r.status)]: (a[String(r.status)] ?? 0) + 1 }), {});
  const byInterest = rows.reduce<Record<string, number>>((a, r) => (r.interest ? { ...a, [String(r.interest)]: (a[String(r.interest)] ?? 0) + 1 } : a), {});

  const title = group === 'social' ? 'Social media leads' : group === 'salespeople' ? 'Salesperson leads' : 'Leads report';
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const name = `${title} - ${periodText} - ${stamp}`.replace(/[\\/:*?"<>|]/g, '');
  const run = async (as: 'csv' | 'pdf') => {
    if (!rows.length) return toast.error('Nothing to export for these filters');
    setBusy(as);
    try {
      if (as === 'csv') downloadCsv(name, LEAD_COLUMNS, rows);
      else await downloadTablePdf(name, title, `${rows.length} leads with activity ${periodText} · ${social} from social media`, LEAD_PDF_COLUMNS, rows);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Leads report" subtitle="Social media and salesperson leads, with every follow-up remark. Download as Excel (CSV) or PDF." />
      <div className="surface relative z-20 mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="!w-auto min-w-56" aria-label="Leads from">
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto min-w-36" aria-label="Status">
            <option value="">Status: all</option>
            {LEAD_STATES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Select value={temperature} onChange={(e) => setTemperature(e.target.value)} className="!w-auto min-w-36" aria-label="Interest">
            <option value="">Interest: all</option>
            {LEAD_TEMPERATURES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {dealerships.length > 1 && (
            <Select value={dealershipId ?? ''} onChange={(e) => setDealershipId(e.target.value ? Number(e.target.value) : undefined)} className="!w-auto min-w-44" aria-label="Dealership">
              <option value="">All my dealerships</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Activity</span>
          <DateRangePicker
            presets={LIST_RANGES}
            value={rangeKey}
            custom={rangeKey === 'custom' ? custom : undefined}
            onChange={(key, r) => {
              setRangeKey(key);
              if (key === 'custom') setCustom({ from: r.from, to: r.to });
            }}
          />
          {isFetching && <Spinner className="size-4 text-slate-400" />}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" loading={busy === 'csv'} disabled={!rows.length} onClick={() => void run('csv')}>
              Download Excel (CSV)
            </Button>
            <Button loading={busy === 'pdf'} disabled={!rows.length} onClick={() => void run('pdf')}>
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : (
        <>
          <div className="surface mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
            <span>
              <span className="text-2xl font-semibold text-slate-900">{rows.length}</span> leads {periodText}
            </span>
            <span className="text-slate-600">{social} social media · {rows.length - social} other</span>
            <span className="flex flex-wrap gap-1.5">
              {Object.entries(byStatus).map(([s, n]) => (
                <Badge key={s}>{`${humanize(s)}: ${n}`}</Badge>
              ))}
            </span>
            <span className="flex flex-wrap gap-1.5">
              {LEAD_TEMPERATURES.filter((t) => byInterest[t.value]).map((t) => (
                <Badge key={t.value} tone={t.tone} dot>{`${t.label}: ${byInterest[t.value]}`}</Badge>
              ))}
            </span>
          </div>
          <div className="surface overflow-x-auto">
            {!rows.length ? (
              <p className="p-8 text-center text-sm text-slate-500">No leads for these filters.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500">
                    {['Logged', 'Customer', 'Source', 'Salesperson / CRO', 'Interest', 'Status', 'Remarks'].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 50).map((r) => {
                    const t = LEAD_TEMPERATURES.find((x) => x.value === r.interest);
                    return (
                      <tr key={String(r.leadId)} className="align-top">
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{String(r.loggedOn ?? '')}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">{String(r.customerName ?? '')}</div>
                          <div className="text-xs text-slate-500">{String(r.phone ?? '')}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {humanize(String(r.source))}
                          {r.campaign ? <div className="max-w-56 truncate text-xs text-slate-500">{String(r.campaign)}{r.city ? ` · ${String(r.city)}` : ''}</div> : null}
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">{String(r.salesperson ?? '')}</td>
                        <td className="px-4 py-2.5">{t ? <Badge tone={t.tone} dot>{t.label}</Badge> : null}</td>
                        <td className="px-4 py-2.5 text-slate-700">{humanize(String(r.status))}</td>
                        <td className="max-w-md px-4 py-2.5 text-xs whitespace-pre-line text-slate-700">{String(r.remarks ?? '')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {rows.length > 50 && <p className="mt-2 text-center text-xs text-slate-500">Showing the first 50 of {rows.length}: the download has all of them.</p>}
        </>
      )}
    </div>
  );
}
