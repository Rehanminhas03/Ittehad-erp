import { describe, expect, it } from 'vitest';
import { pakistanToday } from '../src/lib/dates';
import { testDriveDates } from '../src/modules/sales/entities';

describe('test drive day', () => {
  it('changes nothing when the flag is not part of the change', () => {
    expect(testDriveDates({ prospectName: 'Ali' }, null)).toEqual({});
  });
  it('sets today when marked done, and clears the day when marked not done', () => {
    expect(testDriveDates({ testDriveDone: true }, null)).toEqual({ testDriveOn: pakistanToday() });
    expect(testDriveDates({ testDriveDone: false }, { id: 1, testDriveDone: true, testDriveOn: '2026-10-01' })).toEqual({ testDriveOn: null });
  });
  it('keeps the day already recorded', () => {
    expect(testDriveDates({ testDriveDone: true }, { id: 1, testDriveDone: true, testDriveOn: '2026-10-01' })).toEqual({ testDriveOn: '2026-10-01' });
  });
});
