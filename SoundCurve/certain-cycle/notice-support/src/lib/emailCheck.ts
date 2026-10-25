/**
 * emailCheck.ts — ONE email checker used by the browser (instant, friendly feedback) and the server (final say).
 * Every failure has a code, a human message and, for common typos, a suggestion ("Did you mean ada@gmail.com?").
 * It only checks the SHAPE of an address. The confirmation email (double opt-in) proves the mailbox is real.
 */
export type EmailCode = 'EMPTY' | 'SPACES' | 'TOO_LONG' | 'NO_AT' | 'MANY_AT' | 'NO_LOCAL' | 'NO_DOMAIN' | 'NO_DOT' | 'DOTS' | 'BAD_CHARS' | 'BAD_TLD' | 'TYPO';
export interface EmailCheck { ok: boolean; email: string; code?: EmailCode; message?: string; suggestion?: string }

const MSG: Record<Exclude<EmailCode, 'TYPO'>, string> = {
  EMPTY: 'Please enter your email address.',
  SPACES: "Email addresses can't contain spaces.",
  TOO_LONG: 'That email address is too long.',
  NO_AT: 'That email is missing an @ — it should look like name@example.com.',
  MANY_AT: 'That email has more than one @.',
  NO_LOCAL: 'Add the part before the @ (for example name@…).',
  NO_DOMAIN: 'Add the part after the @ (for example …@gmail.com).',
  NO_DOT: 'The part after the @ needs a dot, like example.com.',
  DOTS: "A dot can't be at the start or end of a part, or appear twice in a row.",
  BAD_CHARS: "That email has a character that isn't allowed.",
  BAD_TLD: 'The ending looks wrong — it should be something like .com or .org.',
};

const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com',
  'yahho.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'iclod.com': 'icloud.com', 'icloud.con': 'icloud.com',
};
const TLD_TYPOS: Record<string, string> = { con: 'com', cmo: 'com', vom: 'com', comm: 'com', coom: 'com', ocm: 'com', cim: 'com' };

export function checkEmail(raw: unknown, opts: { typoCheck?: boolean } = {}): EmailCheck {
  const typoCheck = opts.typoCheck !== false;
  const bad = (code: Exclude<EmailCode, 'TYPO'>, email = ''): EmailCheck => ({ ok: false, email, code, message: MSG[code] });
  if (typeof raw !== 'string') return bad('EMPTY');
  const email = raw.trim().toLowerCase();
  if (!email) return bad('EMPTY');
  if (/\s/.test(email)) return bad('SPACES', email);
  if (email.length > 254) return bad('TOO_LONG', email);
  if (/[<>()\[\]\\,;:"\u0000-\u001f]/.test(email)) return bad('BAD_CHARS', email);
  const at = email.split('@').length - 1;
  if (at === 0) return bad('NO_AT', email);
  if (at > 1) return bad('MANY_AT', email);
  const [local, domain] = email.split('@');
  if (!local) return bad('NO_LOCAL', email);
  if (!domain) return bad('NO_DOMAIN', email);
  if (local.length > 64) return bad('TOO_LONG', email);
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return bad('DOTS', email);
  if (!/^[a-z0-9._%+'\-]+$/.test(local)) return bad('BAD_CHARS', email);
  if (!domain.includes('.')) return bad('NO_DOT', email);
  const labels = domain.split('.');
  if (labels.some(l => l === '')) return bad('DOTS', email);
  if (labels.some(l => l.length > 63)) return bad('TOO_LONG', email);
  if (!labels.every(l => /^[a-z0-9-]+$/.test(l) && !l.startsWith('-') && !l.endsWith('-'))) return bad('BAD_CHARS', email);
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return bad('BAD_TLD', email);
  if (typoCheck) {
    let fixed: string | null = DOMAIN_TYPOS[domain] ?? null;
    if (!fixed && TLD_TYPOS[tld]) fixed = [...labels.slice(0, -1), TLD_TYPOS[tld]].join('.');
    if (fixed) { const s = `${local}@${fixed}`; return { ok: false, email, code: 'TYPO', suggestion: s, message: `Did you mean ${s}?` }; }
  }
  return { ok: true, email };
}
