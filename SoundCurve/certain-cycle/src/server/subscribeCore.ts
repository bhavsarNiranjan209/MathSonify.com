/**
 * subscribeCore.ts — all the decisions of the email sign-up endpoint, with NO network and NO provider inside,
 * so it can be tested exhaustively. api/subscribe.ts only wires it to Vercel + the real list provider.
 *
 * Rules:
 *  - topic must be on an allowlist (soundlab | music-lab | maintenance)
 *  - honeypot field filled, or form submitted < 2 s after it rendered  -> pretend success, store nothing (bots learn nothing)
 *  - per-IP rate limit
 *  - the reply NEVER reveals whether an address was already subscribed
 *  - errors from the provider are never shown to the visitor; the email is never logged
 */
import { checkEmail } from '../lib/emailCheck';

export const TOPICS = ['soundlab', 'music-lab', 'maintenance'] as const;
export type Topic = (typeof TOPICS)[number];

export interface Provider { subscribe(email: string, topic: Topic): Promise<void> }
export interface Deps {
  provider: Provider;
  now: () => number;
  /** true = allowed. Best-effort in serverless; the provider's own limits are the real backstop. */
  rateLimit: (key: string) => boolean;
}
export interface Body { email?: unknown; topic?: unknown; website?: unknown; t?: unknown }
export interface Result { status: number; body: { ok: boolean; message: string; code?: string } }

export const MSG_OK = 'Thanks! Check your inbox and confirm your email — then we will let you know.';
const MSG_BAD_EMAIL = 'Please enter a valid email address.';
const MSG_BAD_REQUEST = 'Something went wrong. Please reload the page and try again.';
const MSG_RATE = 'Too many attempts. Please try again in a little while.';
const MSG_FAIL = "We couldn't save that right now. Please try again later.";
const MIN_FILL_MS = 2000;

export function isValidEmail(raw: string): boolean { return checkEmail(raw, { typoCheck: false }).ok; }

export async function handleSubscribe(body: unknown, ip: string, deps: Deps): Promise<Result> {
  const reply = (status: number, ok: boolean, message: string, code?: string): Result => ({ status, body: code ? { ok, message, code } : { ok, message } });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, false, MSG_BAD_REQUEST);
  const b = body as Body;

  if (typeof b.topic !== 'string' || !(TOPICS as readonly string[]).includes(b.topic)) return reply(400, false, MSG_BAD_REQUEST);
  const topic = b.topic as Topic;
  if (typeof b.t !== 'number' || !Number.isFinite(b.t)) return reply(400, false, MSG_BAD_REQUEST);

  // bots: honeypot filled or form submitted impossibly fast -> look successful, do nothing
  if (typeof b.website === 'string' && b.website.length > 0) return reply(200, true, MSG_OK);
  if (deps.now() - b.t < MIN_FILL_MS) return reply(200, true, MSG_OK);

  if (!deps.rateLimit(ip || 'unknown')) return reply(429, false, MSG_RATE);

  const chk = checkEmail(b.email, { typoCheck: false }); // typos are only a browser-side nudge; the server just checks the shape
  if (!chk.ok) return reply(400, false, chk.message ?? MSG_BAD_EMAIL, chk.code);
  const email = chk.email;

  try {
    await deps.provider.subscribe(email, topic);
  } catch {
    return reply(502, false, MSG_FAIL); // never echo provider errors (they can contain the address or keys)
  }
  return reply(200, true, MSG_OK); // identical whether new or already subscribed
}

/** Simple fixed-window limiter: max `limit` hits per `windowMs` per key. */
export function makeRateLimiter(limit = 5, windowMs = 10 * 60 * 1000, now: () => number = Date.now) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const t = now();
    const h = hits.get(key);
    if (!h || t >= h.reset) { hits.set(key, { n: 1, reset: t + windowMs }); if (hits.size > 5000) hits.clear(); return true; }
    h.n++;
    return h.n <= limit;
  };
}
