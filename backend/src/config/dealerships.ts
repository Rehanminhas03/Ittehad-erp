/**
 * The group's dealerships: the single place they are defined. The seed creates them (plus a
 * main branch each); after that they are ordinary data, managed under Administration → Dealerships.
 * Nothing else in the backend or frontend hard-codes a dealership; the UI reads them from the API.
 */
export interface DealershipSeed {
  code: string;
  name: string;
  brand: string;
  city: string | null;
}

export const DEALERSHIPS: readonly DealershipSeed[] = [
  { code: 'HYD-ISB', name: 'Hyundai Islamabad', brand: 'Hyundai', city: 'Islamabad' },
  { code: 'JET-ITH', name: 'Jetour Ittehad', brand: 'Jetour', city: null },
  { code: 'CSM-ITH', name: 'CSM Ittehad', brand: 'Capital Smart Motors', city: null },
];
