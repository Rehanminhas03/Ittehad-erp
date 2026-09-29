import { useEffect, useRef } from 'react';
import { Select } from '@/shared/components/ui';
import { humanize } from '@/shared/lib';
import { useListSalesOrdersQuery } from '../salesApi';

interface WaitingOrderSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  dealershipId: number | null;
  modelId: number | null;
}

/**
 * "For order" when registering an arriving car: the booked orders of that model at the dealership
 * still waiting for a car, oldest first. The oldest is preselected; "None" keeps the car as free stock.
 */
export function WaitingOrderSelect({ id, value, onChange, dealershipId, modelId }: WaitingOrderSelectProps) {
  const { data, isFetching } = useListSalesOrdersQuery(
    { live: 'true', hasVehicle: 'false', modelId: modelId ?? 0, sort: 'createdAt', pageSize: 50 },
    { skip: !modelId },
  );
  // Only this dealership's orders (someone working several dealerships sees them all).
  const waiting = modelId ? (data?.items ?? []).filter((o) => !dealershipId || o.dealershipId === dealershipId) : [];
  // Preselect the oldest order once per model, unless the user already chose (or chose "None").
  const chosen = useRef(false);
  useEffect(() => {
    if (!data || isFetching) return;
    if (value && !waiting.some((o) => String(o.id) === value)) {
      onChange('');
      return;
    }
    if (!chosen.current && !value && waiting.length) onChange(String(waiting[0]!.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the list for the model arrives
  }, [data, isFetching]);
  useEffect(() => {
    chosen.current = false;
  }, [modelId]);

  if (!modelId) return <Select id={id} disabled value=""><option value="">Choose the model first</option></Select>;
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => {
        chosen.current = true;
        onChange(e.target.value);
      }}
    >
      <option value="">{waiting.length ? 'None: keep as free stock' : isFetching ? 'Loading…' : 'No booked order is waiting for this model'}</option>
      {waiting.map((o) => (
        <option key={o.id} value={o.id}>
          {o.orderNo} · {o.customerName ?? 'Customer'}
          {o.color ? ` · ${o.color}` : ''} · {o.status === 'approved' ? 'approved' : `${humanize(o.status)} (awaiting approval)`}
        </option>
      ))}
    </Select>
  );
}
