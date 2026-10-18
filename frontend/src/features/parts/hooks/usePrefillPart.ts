import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { type Part, useListPartsQuery } from '../partsApi';

/** "Stock in / Stock out" from a row of the stock page opens the form with that part already on the list. */
export function usePrefillPart(onPart: (p: Part) => void) {
  const [params] = useSearchParams();
  const partNo = params.get('partNo') ?? '';
  const { data } = useListPartsQuery({ q: partNo, pageSize: 5 }, { skip: !partNo });
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !data) return;
    const p = data.items.find((x) => x.partNo.toUpperCase() === partNo.toUpperCase());
    if (p) {
      done.current = true;
      onPart(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the part arrives
  }, [data]);
}
