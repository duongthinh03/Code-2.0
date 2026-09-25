import { createHmac, timingSafeEqual } from 'node:crypto';

export function isValidMockSignature(
  rawBody: Buffer,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!timestampHeader || !/^[0-9]{10}$/.test(timestampHeader)) return false;
  const timestamp = Number(timestampHeader);
  if (Math.abs(nowSeconds - timestamp) > 300) return false;
  if (!signatureHeader || !/^[a-f0-9]{64}$/i.test(signatureHeader)) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.`)
    .update(rawBody)
    .digest();
  const received = Buffer.from(signatureHeader, 'hex');
  return timingSafeEqual(expected, received);
}
