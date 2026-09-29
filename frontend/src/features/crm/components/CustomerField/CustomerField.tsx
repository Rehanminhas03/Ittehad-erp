import { Spinner } from '@/shared/components/ui';
import { useGetCustomerQuery } from '../../crmApi';
import { CustomerPicker } from '../CustomerPicker';

export interface CustomerFieldProps {
  id?: string;
  /** Selected customer id ('' / null when none). */
  value: unknown;
  onChange: (customerId: number | '') => void;
  /** Only customers in dealerships where the user holds this permission. */
  permission: string;
  /** Restrict to one dealership (e.g. the document's dealership). */
  dealershipId?: number | null;
}

/** A form control holding a customer id, with type-ahead search. For use in any module's forms. */
export function CustomerField({ id, value, onChange, permission, dealershipId }: CustomerFieldProps) {
  const selectedId = typeof value === 'number' ? value : Number(value) || 0;
  const { data: selected, isFetching } = useGetCustomerQuery({ id: selectedId }, { skip: !selectedId });
  if (selectedId && isFetching && !selected) return <Spinner className="size-4 text-slate-400" />;
  return (
    <CustomerPicker
      id={id}
      value={selectedId && selected ? selected : null}
      onChange={(c) => onChange(c ? c.id : '')}
      permission={permission}
      dealershipId={dealershipId}
    />
  );
}
