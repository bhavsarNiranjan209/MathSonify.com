import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleSubscribe, isValidEmail, makeRateLimiter, MSG_OK, TOPICS, type Deps } from './subscribeCore';

function deps(over: Partial<Deps> = {}) {
  const calls: Array<[string, string]> = [];
  const d: Deps = {
    provider: { subscribe: async (e, t) => { calls.push([e, t]); } },
    now: () => 100_000,
    rateLimit: () => true,
    ...over,
  };
  return { d, calls };
}
const good = (extra: Record<string, unknown> = {}) => ({ email: 'Ada@Example.com ', topic: 'soundlab', website: '', t: 90_000, ...extra });

describe('subscribe: happy path', () => {
  test('stores a trimmed, lower-cased email under the topic', async () => {
    const { d, calls } = deps();
    const r = await handleSubscribe(good(), '1.2.3.4', d);
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(r.body.message, MSG_OK);
    assert.deepEqual(calls, [['ada@example.com', 'soundlab']]);
  });
  for (const topic of TOPICS) test(`accepts topic ${topic}`, async () => {
    const { d, calls } = deps(); const r = await handleSubscribe(good({ topic }), 'ip', d);
    assert.equal(r.status, 200); assert.equal(calls[0][1], topic);
  });
});

describe('subscribe: bots look successful but store nothing', () => {
  test('honeypot filled', async () => { const { d, calls } = deps(); const r = await handleSubscribe(good({ website: 'http://spam' }), 'ip', d); assert.equal(r.status, 200); assert.equal(calls.length, 0); });
  test('submitted faster than 2 s', async () => { const { d, calls } = deps(); const r = await handleSubscribe(good({ t: 99_500 }), 'ip', d); assert.equal(r.status, 200); assert.equal(calls.length, 0); });
  test('bot reply is identical to a real success', async () => {
    const a = await handleSubscribe(good(), 'ip', deps().d); const b = await handleSubscribe(good({ website: 'x' }), 'ip', deps().d);
    assert.deepEqual(a, b);
  });
});

describe('subscribe: rejects bad input', () => {
  for (const bad of [null, undefined, 'x', 42, [], true]) test(`body ${JSON.stringify(bad)}`, async () => { assert.equal((await handleSubscribe(bad, 'ip', deps().d)).status, 400); });
  for (const topic of ['', 'other', 'soundlab;drop', 'SOUNDLAB', 'soundlab ', 42, null, undefined, ['soundlab']]) test(`topic ${JSON.stringify(topic)}`, async () => { assert.equal((await handleSubscribe(good({ topic }), 'ip', deps().d)).status, 400); });
  test('missing timestamp', async () => { assert.equal((await handleSubscribe({ email: 'a@b.co', topic: 'draw', website: '' }, 'ip', deps().d)).status, 400); });
  for (const email of ['', 'a', 'a@b', 'a@b.c', '@b.com', 'a@@b.com', 'a b@c.com', 'a@b..com', 'a@-b.com', 'a@b-.com', '.a@b.com', 'a.@b.com', 'a@b.com\nBcc: x@y.com', 'a@b.com,c@d.com', '<a@b.com>', 'a"b@c.com', 'x'.repeat(65) + '@b.com', 'a@' + 'x'.repeat(64) + '.com', 'a@' + 'x'.repeat(250) + '.com', 'a@b.123', 42 as unknown as string, null as unknown as string])
    test(`invalid email ${JSON.stringify(email)}`, async () => { const { d, calls } = deps(); const r = await handleSubscribe(good({ email }), 'ip', d); assert.equal(r.status, 400); assert.equal(calls.length, 0); });
  for (const email of ['a.b+tag@example.com', "o'brien@example.co.in", 'x@sub.domain.example.org', 'user_name@my-site.io']) test(`valid email ${email}`, () => assert.equal(isValidEmail(email), true));
});

describe('subscribe: rate limit and failures', () => {
  test('429 when over the limit and nothing is stored', async () => { const { d, calls } = deps({ rateLimit: () => false }); const r = await handleSubscribe(good(), 'ip', d); assert.equal(r.status, 429); assert.equal(calls.length, 0); });
  test('limiter allows 5 then blocks, per key, and resets', () => {
    let t = 0; const lim = makeRateLimiter(5, 1000, () => t);
    for (let i = 0; i < 5; i++) assert.equal(lim('a'), true);
    assert.equal(lim('a'), false); assert.equal(lim('b'), true); t = 1001; assert.equal(lim('a'), true);
  });
  test('provider failure -> 502 with a generic message that leaks nothing', async () => {
    const { d } = deps({ provider: { subscribe: async () => { throw new Error('API key sk_live_SECRET failed for ada@example.com'); } } });
    const r = await handleSubscribe(good(), 'ip', d);
    assert.equal(r.status, 502); assert.equal(r.body.ok, false);
    assert.doesNotMatch(JSON.stringify(r), /SECRET|ada@|sk_live|Error/);
  });
  test('already-subscribed (provider resolves) looks exactly like a new sign-up', async () => {
    const a = await handleSubscribe(good(), 'ip', deps().d); const b = await handleSubscribe(good(), 'ip', deps().d); assert.deepEqual(a, b);
  });
});
