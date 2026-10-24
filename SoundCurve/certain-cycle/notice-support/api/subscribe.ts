/**
 * /api/subscribe — Vercel Function (lives in certain-cycle/api/, so Astro needs NO adapter).
 * POST { email, topic, website, t }  ->  { ok, message }
 *
 * The provider adapter below is deliberately a stub: implement it from your chosen provider's CURRENT docs
 * (Buttondown / MailerLite / Brevo ...). Requirements for the adapter:
 *   - create the subscriber with double opt-in ON (confirmation email) and tag/group = topic
 *   - treat "already subscribed" as success (never reveal it)
 *   - read secrets only from process.env (EMAIL_PROVIDER_API_KEY, EMAIL_LIST_ID) — never from the repo
 *   - never log the email address or the key
 */
import { handleSubscribe, makeRateLimiter, type Provider } from '../src/server/subscribeCore';

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { status(n: number): Res; json(b: unknown): void; setHeader(k: string, v: string): void };

const limiter = makeRateLimiter(5, 10 * 60 * 1000);

const provider: Provider = {
  async subscribe(_email, _topic) {
    if (!process.env.EMAIL_PROVIDER_API_KEY || !process.env.EMAIL_LIST_ID) throw new Error('not configured');
    throw new Error('provider adapter not implemented yet'); // TODO: implement from the provider's docs
  },
};

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, message: 'Method not allowed.' }); }
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  let body: unknown = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const r = await handleSubscribe(body, ip, { provider, now: Date.now, rateLimit: limiter });
  return res.status(r.status).json(r.body);
}
