import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, Input, PageHeader, Section, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { cn, formatMoney } from '@/shared/lib';
import { useListAccountsQuery, usePostManualJournalMutation } from '../../accountsApi';
import { P } from '../../permissions';

interface Row {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): Row => ({ accountId: '', debit: '', credit: '', description: '' });
const clean = (v: string) => v.replace(/,/g, '').trim();
/** Sum in paisa, so the balance check is exact. */
const paisa = (rows: Row[], k: 'debit' | 'credit') => rows.reduce((s, r) => s + Math.round((Number(clean(r[k])) || 0) * 100), 0);

/**
 * A manual journal entry (opening balances, expenses, corrections). It must balance; once posted
 * it can only be corrected by a reversal.
 */
export default function NewJournalPage() {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const dealerships = perm.dealershipsFor(P.journalsPost);
  const [dealershipId, setDealershipId] = useState(dealerships[0]?.id ?? 0);
  const [entryDate, setEntryDate] = useState(today());
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const { data: accounts } = useListAccountsQuery({ dealershipId, isActive: 'true', pageSize: 100, sort: 'code' }, { skip: !dealershipId });
  const [post, { isLoading }] = usePostManualJournalMutation();

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.accountId && (Number(clean(r.debit)) > 0 || Number(clean(r.credit)) > 0));
  const dr = paisa(filled, 'debit');
  const cr = paisa(filled, 'credit');
  const oneSided = filled.every((r) => (Number(clean(r.debit)) > 0) !== (Number(clean(r.credit)) > 0));
  const valid = dealershipId && memo.trim().length >= 3 && filled.length >= 2 && oneSided && dr === cr && dr > 0;

  return (
    <div className="max-w-4xl">
      <PageHeader title="New journal entry" subtitle="Debits must equal credits. Posted entries are never edited; reverse them instead." />
      <Section>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {dealerships.length > 1 && (
            <Field label="Dealership" htmlFor="dealership" required>
              <Select
                id="dealership"
                value={dealershipId}
                onChange={(e) => {
                  setDealershipId(Number(e.target.value));
                  setRows([blank(), blank()]);
                }}
              >
                {dealerships.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Date" htmlFor="date" required>
            <Input id="date" type="date" value={entryDate} max={today()} onChange={(e) => setEntryDate(e.target.value)} />
          </Field>
          <Field label="Memo" htmlFor="memo" required className="sm:col-span-3">
            <Input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Office rent for September" />
          </Field>
        </div>
      </Section>

      <Section title="Lines">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-medium">Account</th>
              <th className="py-2 pr-2 font-medium">Description</th>
              <th className="py-2 pr-2 text-right font-medium">Debit</th>
              <th className="py-2 pr-2 text-right font-medium">Credit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <Select value={r.accountId} onChange={(e) => set(i, { accountId: e.target.value })} className="py-1 text-xs" aria-label="Account">
                    <option value="">Choose an account</option>
                    {accounts?.items.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Input value={r.description} onChange={(e) => set(i, { description: e.target.value })} className="py-1 text-xs" aria-label="Description" />
                </td>
                <td className="py-1 pr-2">
                  <Input value={r.debit} onChange={(e) => set(i, { debit: e.target.value, credit: '' })} inputMode="decimal" className="w-32 py-1 text-right text-xs" aria-label="Debit" />
                </td>
                <td className="py-1 pr-2">
                  <Input value={r.credit} onChange={(e) => set(i, { credit: e.target.value, debit: '' })} inputMode="decimal" className="w-32 py-1 text-right text-xs" aria-label="Credit" />
                </td>
                <td className="py-1 text-right">
                  {rows.length > 2 && (
                    <Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove line">
                      ✕
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-2 pr-2">
                <Button size="sm" variant="ghost" onClick={() => setRows([...rows, blank()])}>
                  + Add line
                </Button>
              </td>
              <td className={cn('py-2 pr-2 text-right text-xs', dr === cr ? 'text-emerald-700' : 'text-red-600')}>
                {dr === cr ? (dr > 0 ? 'Balanced' : '') : `Difference ${formatMoney(Math.abs(dr - cr) / 100)}`}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(dr / 100)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(cr / 100)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Section>

      <div className="flex gap-2 pt-4">
        <Button
          disabled={!valid}
          loading={isLoading}
          onClick={async () => {
            try {
              const e = await post({
                manualJournalCreate: {
                  dealershipId,
                  entryDate,
                  memo: memo.trim(),
                  lines: filled.map((r) => ({
                    accountId: Number(r.accountId),
                    debit: clean(r.debit) || undefined,
                    credit: clean(r.credit) || undefined,
                    description: r.description.trim() || null,
                  })),
                },
              }).unwrap();
              toast.success(`Journal entry ${e.entryNo} posted`);
              navigate(`/accounts/journals/${e.id}`);
            } catch (err) {
              toast.error(err);
            }
          }}
        >
          Post entry
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
