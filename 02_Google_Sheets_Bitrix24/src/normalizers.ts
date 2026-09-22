import { createHash } from 'node:crypto';

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeEmail(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('84') && digits.length >= 10) {
    digits = `0${digits.slice(2)}`;
  }

  return digits;
}

export function parseBudget(value: string): number | undefined {
  const input = value.trim();
  // VND: integers, optionally grouped with the same separator; reject 12abc/1.5.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+|\d{1,3}(?: \d{3})+)$/.test(input)) return undefined;
  const parsed = Number(input.replace(/[,. ]/g, ''));
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function sortForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForHash);
  }

  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortForHash(source[key]);
        return result;
      }, {});
  }

  return value;
}

export function makeSyncHash(fields: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(sortForHash(fields)))
    .digest('hex');
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
