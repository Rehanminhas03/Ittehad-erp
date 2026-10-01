/**
 * Hyundai variant codes (Hyundai Nishat's model codes) as used on Hyundai Islamabad's quotations.
 * Jetour and CSM do not use codes. More codes are added by the Assistant Manager / Sales Manager
 * under Variant codes (paste from Excel); this list only seeds a new database.
 */
import type { Executor } from '../../db/client';

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
  const models = await ex.vehicleModel.findMany({ where: { brand }, select: { id: true, name: true } });
  const d = squash(description);
  // Longest name first, so "Santa Fe" wins over a shorter match.
  const hit = models.sort((a, b) => b.name.length - a.name.length).find((m) => d.includes(squash(m.name)));
  return hit?.id ?? null;
}

/**
 * Jetour variants as used at Jetour Ittehad (2026-09-30: Dashing and X70 Plus 1.5 TCI only; T1 and T2
 * i-DM PHEV; T1 petrol 1.5 TGDI; T2 petrol 2.0 TGDI AWD). Jetour has
 * no manufacturer codes, so short codes; the description is what the lead and the quotation show.
 * Jetour's quotation Ref stays the quotation number (no Ref prefix), so these codes never go in it.
 */
export const JETOUR_VARIANTS: [code: string, description: string, model: string][] = [
  ['DASHING-1.5TCI', 'Dashing 1.5 TCI', 'Dashing'],
  ['X70-1.5TCI', 'X70 Plus 1.5 TCI', 'X70 Plus'],
  ['T1-IDM', 'T1 i-DM PHEV', 'T1'],
  ['T1-PETROL', 'T1 Petrol 1.5 TGDI', 'T1'],
  ['T2-IDM', 'T2 i-DM PHEV', 'T2'],
  ['T2-PETROL', 'T2 Petrol 2.0 TGDI AWD', 'T2'],
];

/** Adds the missing Jetour variants to a dealership (existing codes are left as they are). */
export async function seedJetourVariants(ex: Executor, dealershipId: number) {
  for (const [code, description, model] of JETOUR_VARIANTS) {
    const exists = await ex.vehicleVariant.findFirst({ where: { dealershipId, code }, select: { id: true } });
    if (exists) continue;
    const m = await ex.vehicleModel.findFirst({ where: { brand: 'Jetour', name: model }, select: { id: true } });
    await ex.vehicleVariant.create({ data: { dealershipId, code, description, modelId: m?.id ?? null }, select: { id: true } });
  }
}

/** Adds the missing Hyundai codes to a dealership (existing codes are left as they are). */
export async function seedHyundaiVariants(ex: Executor, dealershipId: number) {
  for (const [code, description] of HYUNDAI_VARIANTS) {
    const exists = await ex.vehicleVariant.findFirst({ where: { dealershipId, code }, select: { id: true } });
    if (exists) continue;
    await ex.vehicleVariant.create({ data: { dealershipId, code, description, modelId: await detectModel(ex, 'Hyundai', description) }, select: { id: true } });
  }
}
