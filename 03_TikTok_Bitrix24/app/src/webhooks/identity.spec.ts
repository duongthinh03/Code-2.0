import { normalizeEmail, normalizePhone } from './identity';

describe('mock lead identity normalization', () => {
  it('normalizes usable email and phone values', () => {
    expect(normalizeEmail('  Demo@Example.COM  ')).toBe('demo@example.com');
    expect(normalizePhone('+84 901 234 567')).toBe('+84901234567');
    expect(normalizePhone('0901-234-567')).toBe('+84901234567');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
  });

  it('does not deduplicate on malformed contact values', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('09123abc456')).toBeNull();
  });
});
