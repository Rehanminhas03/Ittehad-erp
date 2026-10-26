import { useState } from 'react';
import { Button, ErrorState, Input, Section, Spinner, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { apiErrorMessage, formatAmount, formatMoney } from '@/shared/lib';
import { type VariantCode, useListVariantCodesQuery, useUpdateVariantCodeMutation } from '../salesApi';

const FIELDS = [
  ['exFactoryPrice', 'Ex-factory'],
  ['advanceTaxFiler', 'Advance tax (filer)'],
  ['advanceTaxNonFiler', 'Advance tax (non-filer)'],
  ['freightCharges', 'Freight charges'],
  ['nevLevy', 'NEV levy'],
  ['cvt', 'CVT (1%)'],
  ['bookingPrice', 'Booking price'],
] as const;
type Key = (typeof FIELDS)[number][0];
type Values = Record<Key, string>;

const show = (x: string | null | undefined) => (x == null ? '' : formatAmount(String(Number(x))));
const toValues = (v: VariantCode): Values => Object.fromEntries(FIELDS.map(([k]) => [k, show(v[k])])) as Values;
const plain = (s: string) => s.replace(/,/g, '').trim();
const num = (s: string) => Number(plain(s)) || 0;

function Row({ variant }: { variant: VariantCode }) {
  const toast = useToast();
  const [update, { isLoading }] = useUpdateVariantCodeMutation();
  const saved = toValues(variant);
  const [v, setV] = useState<Values>(saved);
  const [specs, setSpecs] = useState(variant.specs ?? '');
  const dirty = FIELDS.some(([k]) => plain(v[k]) !== plain(saved[k])) || specs.trim() !== (variant.specs ?? '').trim();
  const net = (nonFiler: boolean) => (plain(v.exFactoryPrice) ? num(v.exFactoryPrice) + num(nonFiler ? v.advanceTaxNonFiler : v.advanceTaxFiler) + num(v.freightCharges) + num(v.nevLevy) + num(v.cvt) : null);
  const nf = net(true);

  const save = async () => {
    try {
      await update({
        id: variant.id,
        vehicleVariantUpdate: { ...Object.fromEntries(FIELDS.map(([k]) => [k, plain(v[k]) || null])), specs: specs.trim() || null },
      }).unwrap();
      toast.success(`Prices of ${variant.code} saved: new quotations use them`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <tr className="align-top">
      <td className="min-w-52 px-3 py-2.5">
        <div className="font-mono text-xs font-semibold text-slate-900">{variant.code}</div>
        <div className="text-xs text-slate-500">{variant.description}</div>
      </td>
      {FIELDS.map(([k, label]) => (
        <td key={k} className="px-2 py-2">
          <Input inputMode="decimal" aria-label={`${label} of ${variant.code}`} value={v[k]} onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))} className="min-w-28 text-right tabular-nums" placeholder="—" />
        </td>
      ))}
      <td className="px-2 py-2">
        <Textarea rows={2} aria-label={`Specifications of ${variant.code}`} value={specs} onChange={(e) => setSpecs(e.target.value)} className="min-w-56 text-xs" placeholder="CSM: Battery Capacity: 66 kWh" />
      </td>
      <td className="px-3 py-2.5 text-right text-sm font-semibold whitespace-nowrap tabular-nums text-slate-900">{net(false) === null ? '—' : formatMoney(String(net(false)))}</td>
      <td className="px-3 py-2.5 text-right text-sm whitespace-nowrap tabular-nums text-slate-700">{nf === null || !plain(v.advanceTaxNonFiler) ? '—' : formatMoney(String(nf))}</td>
      <td className="px-3 py-2.5 text-right">
        <Button size="sm" disabled={!dirty} loading={isLoading} onClick={save}>
          Save
        </Button>
      </td>
    </tr>
  );
}

/**
 * Price list (Assistant Manager / Sales Manager): the ex-factory price, advance tax (filer / non-filer),
 * freight and booking price of each variant. A salesperson who picks a variant on a quotation gets these
 * filled in (and can still change them). Update them here when the prices change.
 */
export function PriceListEditor({ dealershipId, brand }: { dealershipId: number; brand: string }) {
  const { data, isLoading, error, refetch } = useListVariantCodesQuery({ dealershipId, isActive: 'true', pageSize: 100, sort: 'code' }, { refetchOnMountOrArgChange: true });
  return (
    <Section title={`${brand} price list`}>
      <p className="mb-4 text-sm text-slate-600">
        Net price = ex-factory + advance tax + freight. When a salesperson picks a variant on a quotation, these amounts are filled in automatically (Jetour: for the Filer or Non-filer tax they choose). A variant without a price (e.g. T1 Petrol) is
        filled in by the salesperson. New variants are added under <span className="font-medium">Variant codes</span>.
      </p>
      {error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading ? (
        <Spinner className="mx-auto my-6 size-5 text-slate-400" />
      ) : !data?.items.length ? (
        <p className="text-sm text-slate-500">This dealership has no variant codes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Variant</th>
                {FIELDS.map(([k, label]) => (
                  <th key={k} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                    {label}
                  </th>
                ))}
                <th className="px-2 py-2 text-left font-medium whitespace-nowrap">Specifications</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Net price (filer)</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Net price (non-filer)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((variant) => (
                <Row key={`${variant.id}-${variant.updatedAt}`} variant={variant} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
