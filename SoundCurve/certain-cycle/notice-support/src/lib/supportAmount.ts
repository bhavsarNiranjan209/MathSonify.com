/** supportAmount.ts — the Support page's money rules, in US dollars. Min $5, max $1,000,000. */
export const MIN_USD = 5;
export const MAX_USD = 1_000_000;
export type AmountResult = { ok: true; dollars: number; cents: number } | { ok: false; error: string };

export function parseAmount(input: unknown): AmountResult {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return { ok: false, error: 'Enter an amount.' };
  const s = input.replace(/[$\s,]/g, '');
  if (!s) return { ok: false, error: 'Enter an amount.' };
  if (/^-/.test(s)) return { ok: false, error: 'Enter a positive amount.' };
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return { ok: false, error: 'Enter a number, like 25.' };
  if ((s.split('.')[1] ?? '').length > 2) return { ok: false, error: 'Use at most 2 decimals.' };
  const cents = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(cents)) return { ok: false, error: 'Enter a number, like 25.' };
  if (cents < MIN_USD * 100) return { ok: false, error: `The minimum is $${MIN_USD}.` };
  if (cents > MAX_USD * 100) return { ok: false, error: `The maximum is $${MAX_USD.toLocaleString('en-US')}.` };
  return { ok: true, dollars: cents / 100, cents };
}

export function formatUSD(dollars: number): string {
  const whole = Number.isInteger(dollars);
  return '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Only https links; {amount} is replaced with the dollars (platforms differ: some accept it in the URL, some don't). */
export function buildDonateUrl(template: string, dollars: number): string | null {
  try {
    const filled = template.replace('{amount}', encodeURIComponent(String(dollars)));
    const u = new URL(filled);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch { return null; }
}

/** 0..1 "how full is the cup" for the animation: log scale, so $5 -> $15 -> $500 -> $1M all look different. */
export function cupLevel(dollars: number): number {
  const d = Math.min(MAX_USD, Math.max(MIN_USD, dollars));
  return 0.22 + 0.78 * (Math.log10(d / MIN_USD) / Math.log10(MAX_USD / MIN_USD));
}
