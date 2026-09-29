import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge, Button, EmptyState, ErrorState, Input, PageHeader, Section, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage } from '@/shared/lib';
import { LinkVehicleNotice } from '../../components/LinkVehicleNotice';
import { useUnifiedSearchQuery } from '../../crmApi';
import { formatCnic, prefillFromQuery } from '../../lib/format';
import { P } from '../../permissions';

const Exact = () => <Badge tone="blue">Exact match</Badge>;

/**
 * One search box for the front desk: VIN (full or partial), registration, engine number,
 * mobile (any format), CNIC or name. Results are scoped server-side; exact matches registered
 * at another dealership are offered for linking, never duplicated.
 */
export default function SearchPage() {
  const perm = usePermission();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { data, isFetching, isError, error, refetch } = useUnifiedSearchQuery({ q }, { skip: q.length < 2 });
  const prefill = prefillFromQuery(q);
  const nothing = data && !data.vehicles.length && !data.customers.length && !data.groupMatches.length;

  return (
    <div>
      <PageHeader title="Search" subtitle="VIN, registration, engine no., mobile, CNIC or name" />
      <div className="flex items-center gap-3 py-4">
        <Input
          autoFocus
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. LEA-1234, 0300-1234567, 35202-1234567-1, last 6 of VIN"
          className="max-w-xl"
          aria-label="Search"
        />
        {isFetching && <Spinner className="size-4 text-slate-400" />}
      </div>

      {q.length < 2 ? (
        <EmptyState title="Start typing to search" description="Customers and vehicles from the dealerships you can access." />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : !data ? null : nothing ? (
        <EmptyState
          title={`Nothing found for “${q}”`}
          description="Check the spelling, or register it now."
          action={
            <div className="flex justify-center gap-2">
              {perm.can(P.customersCreate) && (
                <Link to={`/crm/customers/new?${new URLSearchParams(prefill.customer)}`}>
                  <Button variant="secondary">New customer</Button>
                </Link>
              )}
              {perm.can(P.vehiclesCreate) && (
                <Link to={`/crm/vehicles/new?${new URLSearchParams(prefill.vehicle)}`}>
                  <Button variant="secondary">New vehicle</Button>
                </Link>
              )}
            </div>
          }
        />
      ) : (
        <>
          {data.groupMatches.map((g) => (
            <div key={g.vin} className="mb-4 border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <LinkVehicleNotice identifier={g.vin ?? g.registrationNo ?? ''} description={`${g.modelName} ${g.registrationNo ?? ''} (${g.vin ?? 'no chassis no.'})`.trim()} />
            </div>
          ))}
          {data.vehicles.length > 0 && (
            <Section title={`Vehicles (${data.vehicles.length})`}>
              <ul className="divide-y divide-slate-100">
                {data.vehicles.map((v) => (
                  <li key={v.id}>
                    <Link to={`/crm/vehicles/${v.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-slate-50">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{v.registrationNo ?? 'Unregistered'}</span>
                        <span className="text-slate-500">
                          {v.modelName}
                          {v.modelYear ? ` · ${v.modelYear}` : ''}
                        </span>
                        <span className="font-mono text-xs text-slate-400">{v.vin}</span>
                        {v.exact && <Exact />}
                      </span>
                      <span className="text-slate-500">{v.currentOwner ? `${v.currentOwner.fullName} · ${v.currentOwner.mobile}` : 'No owner recorded'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {data.customers.length > 0 && (
            <Section title={`Customers (${data.customers.length})`}>
              <ul className="divide-y divide-slate-100">
                {data.customers.map((c) => (
                  <li key={c.id}>
                    <Link to={`/crm/customers/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:bg-slate-50">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{c.fullName}</span>
                        <span className="text-slate-500">{c.mobile}</span>
                        {c.cnic && <span className="text-xs text-slate-400">{formatCnic(c.cnic)}</span>}
                        {c.exact && <Exact />}
                      </span>
                      <span className="text-slate-500">{c.dealershipName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
