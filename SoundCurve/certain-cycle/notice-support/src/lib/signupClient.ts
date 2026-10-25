/**
 * signupClient.ts — the sign-up form's brain, with no framework in it. The Notice page (Astro script) and the
 * React hook both use it, so the behaviour is identical and testable.
 * Flow: check locally (friendly message, typo suggestion) -> POST /api/subscribe -> map every outcome to a state.
 */
import { checkEmail, type EmailCode } from './emailCheck';

export type SignupState =
  | { status: 'idle' } | { status: 'sending' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; code?: EmailCode | 'RATE' | 'SERVER' | 'NETWORK'; suggestion?: string };

export interface SignupDeps { fetch?: typeof fetch; now?: () => number; endpoint?: string }

export function createSignup(topic: string, deps: SignupDeps = {}) {
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = deps.now ?? Date.now;
  const endpoint = deps.endpoint ?? '/api/subscribe';
  const renderedAt = now();
  let state: SignupState = { status: 'idle' };
  const listeners = new Set<(s: SignupState) => void>();
  const set = (s: SignupState) => { state = s; listeners.forEach(l => l(s)); return s; };

  return {
    get state() { return state; },
    subscribe(fn: (s: SignupState) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    reset() { return set({ status: 'idle' }); },
    /** instant feedback while typing / on blur: null when fine */
    check(email: string) { const c = checkEmail(email); return c.ok ? null : c; },
    /** website = the hidden honeypot field's value; force = "use it anyway" after a typo suggestion */
    async submit(email: string, website = '', force = false): Promise<SignupState> {
      if (state.status === 'sending') return state;
      const c = checkEmail(email, { typoCheck: !force });
      if (!c.ok) return set({ status: 'error', message: c.message ?? 'Please check your email address.', code: c.code, suggestion: c.suggestion });
      set({ status: 'sending' });
      try {
        const res = await doFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: c.email, topic, website, t: renderedAt }) });
        let data: { ok?: boolean; message?: string; code?: EmailCode } = {};
        try { data = await res.json(); } catch { /* non-JSON error page */ }
        if (res.ok && data.ok) return set({ status: 'success', message: data.message ?? 'Thanks! Check your inbox to confirm your email.' });
        if (res.status === 429) return set({ status: 'error', code: 'RATE', message: data.message ?? 'Too many attempts. Please try again in a little while.' });
        if (res.status === 400) return set({ status: 'error', code: data.code, message: data.message ?? 'Please check your email address.' });
        return set({ status: 'error', code: 'SERVER', message: "We couldn't save that right now. Please try again later." });
      } catch {
        return set({ status: 'error', code: 'NETWORK', message: 'No connection. Check your internet and try again.' });
      }
    },
  };
}
