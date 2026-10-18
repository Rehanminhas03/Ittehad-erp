import { useEffect, useState } from 'react';
import { Field, Select } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';

/** Which dealership and branch (store) the stock is for; one choice each is picked automatically. */
export function useStoreTarget(code: string) {
  const perm = usePermission();
  const dealerships = perm.dealershipsFor(code);
  const [dealershipId, setDealershipId] = useState<number | null>(dealerships[0]?.id ?? null);
  const branches = dealershipId ? perm.branchesFor(code, dealershipId) : [];
  const [branchId, setBranchId] = useState<number | null>(null);
  useEffect(() => {
    if (!dealershipId && dealerships[0]) setDealershipId(dealerships[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the permissions load
  }, [dealerships.length]);
  useEffect(() => {
    if (!branches.some((b) => b.id === branchId)) setBranchId(branches.find((b) => /main/i.test(`${b.code} ${b.name}`))?.id ?? branches[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the dealership changes
  }, [dealershipId, branches.length]);
  return { dealerships, branches, dealershipId, setDealershipId, branchId, setBranchId };
}

export function StoreTargetFields({ t }: { t: ReturnType<typeof useStoreTarget> }) {
  return (
    <>
      {t.dealerships.length > 1 && (
        <Field label="Dealership" htmlFor="st-dealership">
          <Select id="st-dealership" value={t.dealershipId ?? ''} onChange={(e) => t.setDealershipId(Number(e.target.value))}>
            {t.dealerships.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Store (branch)" htmlFor="st-branch">
        <Select id="st-branch" value={t.branchId ?? ''} onChange={(e) => t.setBranchId(Number(e.target.value))}>
          {t.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
