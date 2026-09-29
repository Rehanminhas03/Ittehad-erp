import { type ReactNode, useState } from 'react';
import { Button, Input, Select } from '@/shared/components/ui';
import { formatMoney } from '@/shared/lib';

/** The common shape of document lines (estimate, job card, purchase order, transfer, invoice...). */
export interface DocumentLine {
  id: number;
  kind?: string;
  description: string;
  partNo?: string | null;
  quantity: string;
  unitPrice?: string | null;
  amount?: string | null;
}

export interface LineDraft {
  kind: string;
  description: string;
  partNo: string;
  quantity: string;
  unitPrice: string;
}

export interface LineItemsTableProps<L extends DocumentLine> {
  lines: L[];
  /** Line kinds offered in the add row (omit to hide the kind column). */
  kinds?: { value: string; label: string }[];
  editable: boolean;
  /** Price and amount columns (false for quantity-only documents such as transfers). Default true. */
  priced?: boolean;
  /** Price is optional (e.g. adjustment cost defaults to the average cost). */
  priceOptional?: boolean;
  priceLabel?: string;
  /** Lines are entered by part number; the server fills the description from the catalogue. */
  descriptionFromPart?: boolean;
  /** Allow negative quantities (e.g. stock adjustments). */
  allowNegative?: boolean;
  /** Price offered for a new line of this kind (e.g. the labour rate). */
  defaultPrice?: (kind: string) => string;
  onAdd?: (draft: LineDraft) => Promise<unknown>;
  onUpdate?: (id: number, draft: LineDraft) => Promise<unknown>;
  onRemove?: (id: number) => Promise<unknown>;
  /** Per-line lock (e.g. customer-approved work); locked lines show the reason instead of actions. */
  lineLocked?: (line: L) => string | null;
  /** Extra trailing cell per line (status, done toggle, received quantity...). */
  renderExtra?: (line: L) => ReactNode;
  extraHeader?: string;
  /** A note under the description (source, free/warranty...). */
  rowNote?: (line: L) => ReactNode;
  showTotal?: boolean;
}

const empty = (kind = ''): LineDraft => ({ kind, description: '', partNo: '', quantity: '1', unitPrice: '' });
const toDraft = (l: DocumentLine): LineDraft => ({
  kind: l.kind ?? '',
  description: l.description,
  partNo: l.partNo ?? '',
  quantity: l.quantity,
  unitPrice: l.unitPrice ?? '',
});
const clean = (v: string) => v.replace(/,/g, '').trim();

/**
 * Editable document lines. Amounts shown while typing are a preview; the server computes the
 * stored amount (exact decimal arithmetic) and the document total.
 */
export function LineItemsTable<L extends DocumentLine>(props: LineItemsTableProps<L>) {
  const {
    lines,
    kinds,
    editable,
    priced = true,
    priceOptional,
    priceLabel = 'Price',
    descriptionFromPart,
    allowNegative,
    onAdd,
    onUpdate,
    onRemove,
    lineLocked,
    renderExtra,
    extraHeader,
    rowNote,
  } = props;
  const showTotal = (props.showTotal ?? true) && priced;
  const [draft, setDraft] = useState<LineDraft>(empty(kinds?.[0]?.value));
  const [editing, setEditing] = useState<{ id: number; draft: LineDraft } | null>(null);
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l) => s + Math.round(Number(l.amount ?? 0) * 100), 0) / 100;

  const qtyOk = (q: string) => /^-?\d+(\.\d{1,2})?$/.test(q.trim()) && (allowNegative ? Number(q) !== 0 : Number(q) > 0);
  const priceOk = (p: string) => (priceOptional && clean(p) === '') || /^\d+(\.\d{1,2})?$/.test(clean(p));
  const valid = (d: LineDraft) =>
    (descriptionFromPart ? d.partNo.trim().length >= 2 : d.description.trim().length >= 2) && qtyOk(d.quantity) && (!priced || priceOk(d.unitPrice));
  const preview = (d: LineDraft) => {
    const v = Number(d.quantity) * Number(clean(d.unitPrice));
    return Number.isFinite(v) && clean(d.unitPrice) !== '' ? v.toFixed(2) : '';
  };

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch {
      // The caller shows the error (toast); keep the user's input.
    } finally {
      setBusy(false);
    }
  }

  // Switching kind in the add row offers that kind's default price (e.g. the labour rate) if none typed.
  const setKind = (kind: string) => setDraft({ ...draft, kind, unitPrice: draft.unitPrice || props.defaultPrice?.(kind) || '' });

  const editorCells = (d: LineDraft, set: (d: LineDraft) => void, onKind?: (kind: string) => void, isNew = false) => (
    <>
      {kinds && (
        <td className="py-1.5 pr-2">
          <Select value={d.kind} onChange={(e) => (onKind ? onKind(e.target.value) : set({ ...d, kind: e.target.value }))} className="py-1 text-xs" aria-label="Kind">
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </td>
      )}
      <td className="py-1.5 pr-2">
        {descriptionFromPart ? (
          <span className="text-xs text-slate-400">{isNew ? 'From the catalogue' : d.description}</span>
        ) : (
          <Input value={d.description} onChange={(e) => set({ ...d, description: e.target.value })} className="py-1 text-xs" placeholder="Description" aria-label="Description" />
        )}
      </td>
      <td className="py-1.5 pr-2">
        <Input
          value={d.partNo}
          onChange={(e) => set({ ...d, partNo: e.target.value })}
          className="py-1 text-xs"
          placeholder={descriptionFromPart ? 'Part no. *' : 'Part no.'}
          aria-label="Part number"
        />
      </td>
      <td className="py-1.5 pr-2">
        <Input value={d.quantity} onChange={(e) => set({ ...d, quantity: e.target.value })} className="w-20 py-1 text-right text-xs" inputMode="decimal" aria-label="Quantity" />
      </td>
      {priced && (
        <>
          <td className="py-1.5 pr-2">
            <Input
              value={d.unitPrice}
              onChange={(e) => set({ ...d, unitPrice: e.target.value })}
              className="w-28 py-1 text-right text-xs"
              inputMode="decimal"
              placeholder={priceOptional ? 'Average' : '0.00'}
              aria-label={priceLabel}
            />
          </td>
          <td className="py-1.5 pr-2 text-right text-xs text-slate-400 tabular-nums">{preview(d) && formatMoney(preview(d))}</td>
        </>
      )}
    </>
  );

  const cols = (kinds ? 1 : 0) + 3 + (priced ? 2 : 0) + (renderExtra ? 1 : 0) + (editable ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
            {kinds && <th className="py-2 pr-2 font-medium">Kind</th>}
            <th className="py-2 pr-2 font-medium">Description</th>
            <th className="py-2 pr-2 font-medium">Part no.</th>
            <th className="py-2 pr-2 text-right font-medium">Qty</th>
            {priced && (
              <>
                <th className="py-2 pr-2 text-right font-medium">{priceLabel}</th>
                <th className="py-2 pr-2 text-right font-medium">Amount</th>
              </>
            )}
            {renderExtra && <th className="py-2 pr-2 font-medium">{extraHeader}</th>}
            {editable && <th className="py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((l) => {
            const locked = lineLocked?.(l) ?? null;
            if (editing?.id === l.id) {
              return (
                <tr key={l.id}>
                  {editorCells(editing.draft, (d) => setEditing({ id: l.id, draft: d }))}
                  {renderExtra && <td />}
                  <td className="py-1.5 whitespace-nowrap">
                    <Button size="sm" disabled={!valid(editing.draft) || busy} onClick={() => void run(() => onUpdate!(l.id, editing.draft), () => setEditing(null))}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={l.id} className="align-top">
                {kinds && <td className="py-2 pr-2 text-xs text-slate-500">{kinds.find((k) => k.value === l.kind)?.label ?? l.kind}</td>}
                <td className="py-2 pr-2 text-slate-800">
                  {l.description}
                  {rowNote?.(l) && <div className="text-xs text-slate-500">{rowNote(l)}</div>}
                </td>
                <td className="py-2 pr-2 font-mono text-xs text-slate-500">{l.partNo ?? ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{Number(l.quantity)}</td>
                {priced && (
                  <>
                    <td className="py-2 pr-2 text-right tabular-nums">{l.unitPrice == null ? '—' : formatMoney(l.unitPrice)}</td>
                    <td className="py-2 pr-2 text-right font-medium tabular-nums">{l.amount == null ? '—' : formatMoney(l.amount)}</td>
                  </>
                )}
                {renderExtra && <td className="py-2 pr-2">{renderExtra(l)}</td>}
                {editable && (
                  <td className="py-2 whitespace-nowrap text-right">
                    {locked ? (
                      <span className="text-xs text-slate-400" title={locked}>
                        Locked
                      </span>
                    ) : (
                      <>
                        {onUpdate && (
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ id: l.id, draft: toDraft(l) })}>
                            Edit
                          </Button>
                        )}
                        {onRemove && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => onRemove(l.id))}>
                            Remove
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={cols} className="py-4 text-center text-sm text-slate-500">
                No lines yet.
              </td>
            </tr>
          )}
          {editable && onAdd && (
            <tr className="bg-slate-50/60">
              {editorCells(draft, setDraft, setKind, true)}
              {renderExtra && <td />}
              <td className="py-1.5">
                <Button size="sm" disabled={!valid(draft) || busy} onClick={() => void run(() => onAdd(draft), () => setDraft(empty(draft.kind)))}>
                  Add
                </Button>
              </td>
            </tr>
          )}
        </tbody>
        {showTotal && (
          <tfoot>
            <tr className="border-t border-slate-200">
              <td colSpan={(kinds ? 1 : 0) + 4} className="py-2 pr-2 text-right text-xs font-medium tracking-wide text-slate-500">
                Total
              </td>
              <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatMoney(total.toFixed(2))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
