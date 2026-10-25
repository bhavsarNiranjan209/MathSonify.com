import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createSignup } from './signupClient';

const res = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const make = (f: typeof fetch) => createSignup('soundlab', { fetch: f, now: () => 1000 });

describe('signupClient: local checks never reach the network', () => {
  test('bad email -> specific message, no request', async () => {
    let called = 0; const s = make((async () => { called++; return new Response('{}'); }) as typeof fetch);
    const r = await s.submit('ada.example.com'); assert.equal(r.status, 'error'); assert.equal((r as any).code, 'NO_AT'); assert.equal(called, 0);
  });
  test('typo -> suggestion first, "use anyway" sends it', async () => {
    let called = 0; const s = make((async () => { called++; return new Response(JSON.stringify({ ok: true, message: 'ok' }), { status: 200 }); }) as typeof fetch);
    const a = await s.submit('ada@gmial.com'); assert.equal((a as any).suggestion, 'ada@gmail.com'); assert.equal(called, 0);
    const b = await s.submit('ada@gmial.com', '', true); assert.equal(b.status, 'success'); assert.equal(called, 1);
  });
});
describe('signupClient: every server outcome maps to a friendly state', () => {
  test('200 -> success with the server message', async () => { const r = await make(res(200, { ok: true, message: 'Thanks!' }) as any).submit('ada@example.com'); assert.deepEqual(r, { status: 'success', message: 'Thanks!' }); });
  test('400 -> shows the server message and code', async () => { const r: any = await make(res(400, { ok: false, message: 'bad', code: 'NO_AT' }) as any).submit('ada@example.com'); assert.equal(r.status, 'error'); assert.equal(r.code, 'NO_AT'); });
  test('429 -> rate message', async () => { const r: any = await make(res(429, { ok: false, message: 'slow down' }) as any).submit('ada@example.com'); assert.equal(r.code, 'RATE'); });
  test('502 -> generic, leaks nothing', async () => { const r: any = await make(res(502, { ok: false, message: 'KEY sk_live' }) as any).submit('ada@example.com'); assert.equal(r.code, 'SERVER'); assert.doesNotMatch(r.message, /sk_live|KEY/); });
  test('non-JSON error page -> generic', async () => { const r: any = await make((async () => new Response('<html>oops</html>', { status: 500 })) as typeof fetch).submit('ada@example.com'); assert.equal(r.code, 'SERVER'); });
  test('network failure -> offline message', async () => { const r: any = await make((async () => { throw new TypeError('fetch failed'); }) as typeof fetch).submit('ada@example.com'); assert.equal(r.code, 'NETWORK'); });
  test('sends the honeypot, topic and render time; double-submit while sending is ignored', async () => {
    let body: any, calls = 0; let release!: () => void; const gate = new Promise<void>(r => (release = r));
    const s = make((async (_u: any, init: any) => { calls++; body = JSON.parse(init.body); await gate; return new Response(JSON.stringify({ ok: true, message: 'ok' }), { status: 200 }); }) as typeof fetch);
    const p1 = s.submit('Ada@Example.com ', 'bot'); const p2 = s.submit('ada@example.com'); release(); await p1; await p2;
    assert.equal(calls, 1); assert.deepEqual(body, { email: 'ada@example.com', topic: 'soundlab', website: 'bot', t: 1000 });
  });
  test('listeners hear idle->sending->success', async () => {
    const s = make(res(200, { ok: true, message: 'ok' }) as any); const seen: string[] = []; s.subscribe(x => seen.push(x.status)); await s.submit('ada@example.com'); assert.deepEqual(seen, ['sending', 'success']);
  });
});
