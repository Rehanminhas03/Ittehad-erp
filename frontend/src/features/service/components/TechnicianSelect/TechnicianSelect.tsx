import { useParams } from 'react-router';
import { Select } from '@/shared/components/ui';
import { useListJobCardTechniciansQuery } from '../../serviceApi';

/** Form control: technicians who may work job cards at the job card's dealership. */
export function TechnicianSelect({ id, value, onChange }: { id?: string; value: unknown; onChange: (v: number | '') => void }) {
  const jobCardId = Number(useParams().id);
  const { data } = useListJobCardTechniciansQuery({ id: jobCardId }, { skip: !jobCardId });
  return (
    <Select id={id} value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}>
      <option value="">Not assigned</option>
      {data?.map((t) => (
        <option key={t.id} value={t.id}>
          {t.fullName}
        </option>
      ))}
    </Select>
  );
}
