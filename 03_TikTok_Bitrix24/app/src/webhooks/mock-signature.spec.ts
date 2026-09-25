import { createHmac } from 'node:crypto';
import { isValidMockSignature } from './mock-signature';

describe('mock webhook signature', () => {
  const raw = Buffer.from('{"event_id":"abc"}');
  const secret = 'test-secret';
  const now = 1_780_000_000;
  const timestamp = String(now);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest('hex');

  it('accepts a fresh, correctly signed raw body', () => {
    expect(isValidMockSignature(raw, timestamp, signature, secret, now)).toBe(true);
  });

  it('rejects a modified body', () => {
    expect(isValidMockSignature(Buffer.from('{}'), timestamp, signature, secret, now)).toBe(false);
  });

  it('rejects stale timestamps and malformed signatures', () => {
    expect(isValidMockSignature(raw, String(now - 301), signature, secret, now)).toBe(false);
    expect(isValidMockSignature(raw, timestamp, 'bad', secret, now)).toBe(false);
  });
});
