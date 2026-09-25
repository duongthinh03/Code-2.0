import { reportPeriod, shouldAlertLowConversion } from './automation.service';

describe('reportPeriod', () => {
  it('rounds to the UTC hour for idempotent scheduled reports', () => {
    expect(reportPeriod(new Date('2026-09-24T07:32:33.123Z')).toISOString())
      .toBe('2026-09-24T07:00:00.000Z');
  });
});

describe('low conversion alert', () => {
  it('requires at least five Leads and a strictly sub-20% rate', () => {
    expect(shouldAlertLowConversion(4, 0)).toBe(false);
    expect(shouldAlertLowConversion(5, 0)).toBe(true);
    expect(shouldAlertLowConversion(5, 1)).toBe(false);
  });
});
