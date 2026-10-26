import { describe, expect, it } from 'vitest';
import { amountInWords, csmVehicleLine, fillTemplateLine, jetourVehicleLine, quotationRef } from './pdf';

describe('amountInWords (Pakistani lakh / crore)', () => {
  it('writes typical vehicle prices', () => {
    expect(amountInWords('9350000.00')).toBe('Ninety Three Lakh Fifty Thousand Rupees Only');
    expect(amountInWords('12500000')).toBe('One Crore Twenty Five Lakh Rupees Only');
    expect(amountInWords('4799000')).toBe('Forty Seven Lakh Ninety Nine Thousand Rupees Only');
  });
  it('handles hundreds, paisa and zero', () => {
    expect(amountInWords('1234567.50')).toBe('Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paisa Only');
    expect(amountInWords(105)).toBe('One Hundred Five Rupees Only');
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });
  it('handles more than 99 crore', () => {
    expect(amountInWords('1500000000')).toBe('One Hundred Fifty Crore Rupees Only');
  });
});

describe('quotation format lines', () => {
  const ctx = { vehicle: 'TUCSON HYBRID SIGNATURE-AWD', nonFilerTax: '1,311,450', validityDays: 7, deliveryStation: 'Hyundai Islamabad', dealership: 'Hyundai Islamabad', hybrid: true };
  it('fills placeholders', () => {
    expect(fillTemplateLine('Withholding tax for non-filer: {vehicle}: Rs. {nonFilerTax} will be applied.', ctx)).toBe(
      'Withholding tax for non-filer: TUCSON HYBRID SIGNATURE-AWD: Rs. 1,311,450 will be applied.',
    );
    expect(fillTemplateLine('Validity: {validityDays} days at {deliveryStation}', ctx)).toBe('Validity: 07 days at Hyundai Islamabad');
  });
  it('leaves out lines that do not apply', () => {
    expect(fillTemplateLine('Rs. {nonFilerTax}', { ...ctx, nonFilerTax: null })).toBeNull();
    expect(fillTemplateLine('[Hybrid only] 8 YEARS FOR HYBRID BATTERY.', { ...ctx, hybrid: false })).toBeNull();
    expect(fillTemplateLine('[Hybrid only] 8 YEARS FOR HYBRID BATTERY.', ctx)).toBe('8 YEARS FOR HYBRID BATTERY.');
  });
});

describe('quotation Ref', () => {
  const base = { issuedAt: '2026-06-03T10:00:00+05:00', quotationNo: 'HYD-ISB-QT-2026-00001', variantCode: 'NX4FL16THAW' };
  it('is HI/<variant code>/<dd-mm-yy> for Hyundai', () => {
    expect(quotationRef({ ...base, template: { refPrefix: 'HI' } as never })).toBe('HI/NX4FL16THAW/03-06-26');
  });
  it('is the quotation number without a prefix or a code', () => {
    expect(quotationRef({ ...base, template: { refPrefix: null } as never })).toBe('HYD-ISB-QT-2026-00001');
    expect(quotationRef({ ...base, variantCode: null, template: { refPrefix: 'HI' } as never })).toBe('HYD-ISB-QT-2026-00001');
  });
});

describe('jetourVehicleLine', () => {
  it('writes the vehicle as Jetour does: the variant (with the model when it does not name it), i-DM kept', () => {
    expect(jetourVehicleLine('Jetour Dashing', 'Dashing 1.5 TCI')).toBe('JETOUR DASHING 1.5 TCI');
    expect(jetourVehicleLine('Jetour T2', 'T2 i-DM PHEV')).toBe('JETOUR T2 i-DM PHEV');
    expect(jetourVehicleLine('Jetour X70 Plus', '1.5 TCI')).toBe('JETOUR X70 PLUS 1.5 TCI');
    expect(jetourVehicleLine('Jetour T1', null)).toBe('JETOUR T1');
  });
});

describe('csmVehicleLine', () => {
  it('writes the vehicle as CSM does, with the model when the variant does not name it', () => {
    expect(csmVehicleLine('Capital Smart Motors JMEV EV3', 'JMEV EV3 Premium')).toBe('CSM – JMEV EV3 PREMIUM');
    expect(csmVehicleLine('JMEV EV3', 'JMEV EV3 Premium', 'Capital Smart Motors', true)).toBe('CSM – JMEV EV3 Premium');
    expect(csmVehicleLine('Zeekr X', 'Flagship AWD')).toBe('CSM – ZEEKR X FLAGSHIP AWD');
    expect(csmVehicleLine('Riddara RD6', null)).toBe('CSM – RIDDARA RD6');
  });
});

describe('CSM quotation lines', () => {
  const ctx = { vehicle: 'JMEV EV3 Premium', nonFilerTax: null, validityDays: 7, deliveryStation: 'CSM', dealership: 'CSM Ittehad', hybrid: false, advance: '1,500,000', deliveryPeriod: '60 to 90 days', advancePercent: '30', balancePercent: '70' };
  it('fills the advance, the delivery time and the percentages', () => {
    expect(fillTemplateLine('Rs. Advance payment/ ({advance}) in favor of CSM', ctx)).toBe('Rs. Advance payment/ (1,500,000) in favor of CSM');
    expect(fillTemplateLine('The vehicle delivery time is {deliveryPeriod} from the date of Advance Payment Clearing.', ctx)).toBe('The vehicle delivery time is 60 to 90 days from the date of Advance Payment Clearing.');
    expect(fillTemplateLine('{advancePercent}% Advance payment and {balancePercent}% 30 days before vehicle delivery.', ctx)).toBe('30% Advance payment and 70% 30 days before vehicle delivery.');
  });
  it('leaves out the percentage line when there is no advance', () => {
    expect(fillTemplateLine('{advancePercent}% Advance', { ...ctx, advancePercent: null, balancePercent: null })).toBeNull();
    expect(fillTemplateLine('({advance})', { ...ctx, advance: '' })).toBeNull();
  });
});
