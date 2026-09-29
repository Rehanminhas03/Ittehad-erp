/**
 * Hyundai variant codes (Hyundai Nishat's model codes) as used on Hyundai Islamabad's quotations.
 * Jetour and CSM do not use codes. More codes are added by the Assistant Manager / Sales Manager
 * under Variant codes (paste from Excel); this list only seeds a new database.
 */
import { and, eq } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { vehicleModel } from '../master/models';
import { vehicleVariant } from './models';

export const HYUNDAI_VARIANTS: [code: string, description: string][] = [
  ['AD16ATSRBEIG', 'ELANTRA 1591CC 6A/T SR (BEIG)'],
  ['AD16ATSRBUR', 'ELANTRA 1591CC 6A/T SR (BUR)'],
  ['AD16ATSRCAP', 'ELANTRA 1591CC 6A/T SR (CAP)'],
  ['AD16ATSR', 'ELANTRA 1591CC 6A/T SR HIGH'],
  ['CN7HEV16ATNNB', 'ELANTRA HYBRID 1580CC 6A/T BLUE (NNB)'],
  ['CN7HEV16ATSSS', 'ELANTRA HYBRID 1580CC 6A/T BLUE (SSS)'],
  ['LX3HEVCAL3NB', 'PALISADE HEV 2.5T CALLIGRAPHY 3NB (NNB)'],
  ['LX3HEVCALISB', 'PALISADE HEV 2.5T CALLIGRAPHY ISB'],
  ['LX3HEVSMTNNB', 'PALISADE HEV 2.5T SMART (NNB)'],
  ['HR26S7FD', 'Porter H100 2607cc Diesel S7 FD'],
  ['HR26S7HD', 'Porter H100 2607cc Diesel S7 HD'],
  ['HR26S7HDAC', 'Porter H100 2607cc Diesel S7 HD AC'],
  ['TM16AT4WDNNB', 'SANTA FE HEV 1598CC-T AWD SIGNATURE (B)'],
  ['TM16AT4WDMMX', 'SANTA FE HEV 1598CC-T AWD SIGNATURE (C)'],
  ['TM16AT2WDMMX', 'SANTA FE HEV 1598CC-T FWD SMART (C)'],
  ['DN825ATSR', 'SONATA 2497CC 6A/T SR DELUXE'],
  ['DN8FLN25T', 'SONATA N LINE 2497CC'],
  ['NX4FL16THAW', 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE'],
  ['NX4FL16THFW', 'TUCSON HEV 1598CC 6A/T FWD SMART'],
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The catalogue model a description belongs to (its name appears in it, e.g. "TUCSON HEV ..." -> Tucson). */
export async function detectModel(ex: Executor, brand: string, description: string): Promise<number | null> {
  const models = await ex.select({ id: vehicleModel.id, name: vehicleModel.name }).from(vehicleModel).where(eq(vehicleModel.brand, brand));
  const d = squash(description);
  // Longest name first, so "Santa Fe" wins over a shorter match.
  const hit = models.sort((a, b) => b.name.length - a.name.length).find((m) => d.includes(squash(m.name)));
  return hit?.id ?? null;
}

/** Adds the missing Hyundai codes to a dealership (existing codes are left as they are). */
export async function seedHyundaiVariants(ex: Executor, dealershipId: number) {
  for (const [code, description] of HYUNDAI_VARIANTS) {
    const [exists] = await ex
      .select({ id: vehicleVariant.id })
      .from(vehicleVariant)
      .where(and(eq(vehicleVariant.dealershipId, dealershipId), eq(vehicleVariant.code, code)));
    if (exists) continue;
    await ex.insert(vehicleVariant).values({ dealershipId, code, description, modelId: await detectModel(ex, 'Hyundai', description) });
  }
}
