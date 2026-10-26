import { useState } from 'react';
import { Button, Dialog, Field, Input } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { type InventoryRow, useSetStockSettingsMutation } from '../../partsApi';
import { P } from '../../permissions';
import { StoreTargetFields, useStoreTarget } from '../StoreTarget';

/** The Store Manager sets where a part sits (bin / shelf) and the level at which it counts as low stock. */
export function StockSettings({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const toast = useToast();
  const t = useStoreTarget(P.stockManage);
  const [bin, setBin] = useState(row.binLocation ?? '');
  const [level, setLevel] = useState(String(Number(row.reorderLevel)));
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading }] = useSetStockSettingsMutation();

  const submit = async () => {
    if (!t.branchId) return setError('Choose the store');
    if (Number.isNaN(Number(level)) || Number(level) < 0) return setError('The reorder level must be 0 or more');
    setError(null);
    try {
      await save({ stockSettingsRequest: { partId: row.partId, branchId: t.branchId, binLocation: bin.trim() || null, reorderLevel: level } }).unwrap();
      toast.success(`${row.partNo} saved`);
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${row.partNo} · bin and reorder level`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{row.description}</p>
        <StoreTargetFields t={t} />
        <Field label="Bin / shelf" htmlFor="ss-bin" hint="Where the part is kept, e.g. A-3-2">
          <Input id="ss-bin" value={bin} onChange={(e) => setBin(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Reorder level" htmlFor="ss-level" hint="At or below this quantity the part shows as Low. 0: no alert">
          <Input id="ss-level" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  );
}
