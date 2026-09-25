export function normalizeEmail(value: string | null): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/[\s().-]/g, '');
  if (/^0\d{9,10}$/.test(compact)) return `+84${compact.slice(1)}`;
  if (/^84\d{9,10}$/.test(compact)) return `+${compact}`;
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}
