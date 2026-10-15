import { describe, expect, it } from 'vitest';
import { JETOUR_PRICES, JETOUR_VARIANTS } from '../src/modules/sales/variantCatalog';

// The net prices printed on Jetour's price list (October 2026).
const NET_FILER: Record<string, number> = { 'DASHING-1.5TCI': 8167140, 'X70-1.5TCI': 8575140, 'T2-IDM': 13127400, 'T2-PETROL': 14348250, 'T1-IDM': 11089980 };
const NET_NON_FILER: Record<string, number> = { 'DASHING-1.5TCI': 8487420, 'X70-1.5TCI': 8911420 };

describe('Jetour price list', () => {
  it('has every variant, and ex-factory + advance tax + freight gives the net price on the list', () => {
    for (const [code] of JETOUR_VARIANTS) expect(JETOUR_PRICES[code], code).toBeDefined();
    for (const [code, net] of Object.entries(NET_FILER)) {
      const p = JETOUR_PRICES[code]!;
      expect(Number(p.exFactoryPrice) + Number(p.advanceTaxFiler) + Number(p.freightCharges), code).toBe(net);
    }
    for (const [code, net] of Object.entries(NET_NON_FILER)) {
      const p = JETOUR_PRICES[code]!;
      expect(Number(p.exFactoryPrice) + Number(p.advanceTaxNonFiler) + Number(p.freightCharges), code).toBe(net);
    }
  });

  it('has booking prices, and no price yet for the T1 Petrol', () => {
    expect(JETOUR_PRICES['T2-IDM']!.bookingPrice).toBe('2500000');
    expect(JETOUR_PRICES['T2-PETROL']!.bookingPrice).toBe('3000000');
    expect(JETOUR_PRICES['T1-IDM']!.bookingPrice).toBe('2000000');
    expect(JETOUR_PRICES['T1-PETROL']).toEqual({ bookingPrice: '2000000' });
  });
});
