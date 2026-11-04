import { useState } from 'react';
import { Button, Dialog, Field, Input } from '@/shared/components/ui';
import { amountNumber } from '@/shared/lib';
import { useListPartCategoriesQuery } from '../../partsApi';

export interface NewPartLine {
  partNo: string;
  description: string;
  quantity: string;
  unitCost: string;
  newPart: { description: string; category: string | null; sellingPrice: string };
}

/**
 * On "Receive parts": a part that is not in the catalogue yet is added as it is received. It is created for the
 * dealership's brand and marked as fitting the vehicles ticked on the delivery, then goes into stock with the rest.
 */
export function NewPartOnReceipt({ brand, vehicles, onAdd }: { brand?: string; vehicles: string[]; onAdd: (line: NewPartLine) => void }) {
  const [open, setOpen] = useState(false);
  const [partNo, setPartNo] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [received, setReceived] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: categories } = useListPartCategoriesQuery({ brand: brand || undefined }, { skip: !open });

  const close = () => {
    setOpen(false);
    setError(null);
  };
  const submit = () => {
    if (partNo.trim().length < 2) return setError('Enter the part number');
    if (description.trim().length < 2) return setError('Enter the part name');
    if (!(amountNumber(quantity) > 0)) return setError('Enter the quantity received');
    if (!received.trim()) return setError('Enter the price received (what you paid head office)');
    onAdd({
      partNo: partNo.trim(),
      description: description.trim(),
      quantity: quantity.trim(),
      unitCost: received.trim(),
      newPart: { description: description.trim(), category: category.trim() || null, sellingPrice: price.trim() || '0' },
    });
    setPartNo('');
    setDescription('');
    setCategory('');
    setPrice('');
    setQuantity('1');
    setReceived('');
    close();
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} disabled={vehicles.length === 0} title={vehicles.length === 0 ? 'Tick the vehicle the parts are for first' : undefined}>
        Not in the list? Add a new part
      </Button>
      {open && (
        <Dialog
          open
          onClose={close}
          size="lg"
          title="Add a new part"
          footer={
            <>
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button onClick={submit}>Add to this delivery</Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              The part is added to the catalogue for <span className="font-medium">{[brand, ...vehicles].filter(Boolean).join(' · ')}</span> and received into stock with this delivery.
            </p>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Part number" htmlFor="np-no" required>
                <Input id="np-no" value={partNo} onChange={(e) => setPartNo(e.target.value)} autoFocus />
              </Field>
              <Field label="Part name" htmlFor="np-name" required>
                <Input id="np-name" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <Field label="Category" htmlFor="np-cat" hint="Optional, e.g. Filters, Brakes">
                <Input id="np-cat" list="np-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
                <datalist id="np-cats">
                  {(categories ?? []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Customer price (PKR)" htmlFor="np-price" hint="The price told to the customer. Leave empty to set it later in Manage parts">
                <Input id="np-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <Field label="Quantity received" htmlFor="np-qty" required>
                <Input id="np-qty" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Price received (PKR per piece)" htmlFor="np-cost" required hint="What you paid head office, not the customer price">
                <Input id="np-cost" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
              </Field>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
