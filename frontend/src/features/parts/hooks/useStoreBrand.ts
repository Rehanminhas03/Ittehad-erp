import { useState } from 'react';
import { usePermission } from '@/shared/hooks';

/** The brand(s) a person's store looks after (Jetour staff: Jetour). More than one brand: they choose. */
export function useStoreBrand(code: string) {
  const perm = usePermission();
  const brands = [...new Set(perm.dealershipsFor(code).map((d) => d.brand))];
  const [chosen, setChosen] = useState('');
  return { brands, brand: chosen || brands[0] || '', setBrand: setChosen };
}
