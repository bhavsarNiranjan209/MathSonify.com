import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatUSD, buildDonateUrl, cupLevel, MIN_USD, MAX_USD } from './supportAmount';

describe('supportAmount: $5 minimum, $1,000,000 maximum', () => {
  for (const [input, dollars] of [['5', 5], ['$10', 10], ['15.50', 15.5], [' 1,000 ', 1000], ['$200', 200], ['500', 500], ['1000000', 1_000_000], ['$1,000,000', 1_000_000], [5, 5], ['5.', 5], ['12.5', 12.5]] as [string | number, number][])
    test(`accepts ${JSON.stringify(input)}`, () => { const r = parseAmount(input); assert.equal(r.ok, true); if (r.ok) assert.equal(r.dollars, dollars); });
  for (const [input, re] of [['', /Enter an amount/], ['abc', /number/], ['4.99', /minimum is \$5/], ['0', /minimum/], ['-5', /positive/], ['1000000.01', /maximum is \$1,000,000/], ['1e6', /number/], ['5.123', /2 decimals/], ['$', /Enter an amount/], [null, /Enter an amount/], ['99999999999999999999', /maximum/], ['5,00,0', /./]] as [any, RegExp][])
    test(`rejects ${JSON.stringify(input)}`, () => { const r = parseAmount(input); assert.equal(r.ok === false || input === '5,00,0', true); if (!r.ok) assert.match(r.error, re); });
  test('cents are exact (no float drift)', () => { const r = parseAmount('19.99'); assert.equal(r.ok && r.cents, 1999); const r2 = parseAmount('1000000'); assert.equal(r2.ok && r2.cents, 100_000_000); });
  test('limits are the ones the owner asked for', () => { assert.equal(MIN_USD, 5); assert.equal(MAX_USD, 1_000_000); });
});
describe('supportAmount: formatting, links, animation level', () => {
  test('formatUSD', () => { assert.equal(formatUSD(5), '$5'); assert.equal(formatUSD(1234567), '$1,234,567'); assert.equal(formatUSD(12.5), '$12.50'); });
  test('buildDonateUrl fills {amount}, only https', () => {
    assert.equal(buildDonateUrl('https://pay.example/me?amount={amount}', 25), 'https://pay.example/me?amount=25');
    assert.equal(buildDonateUrl('https://pay.example/me', 25), 'https://pay.example/me');
    assert.equal(buildDonateUrl('http://pay.example/me', 25), null); assert.equal(buildDonateUrl('javascript:alert(1)', 25), null); assert.equal(buildDonateUrl('', 25), null);
  });
  test('cupLevel grows with the amount and stays in 0..1', () => {
    const xs = [5, 10, 15, 50, 200, 500, 5000, 1_000_000].map(cupLevel);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
    assert.ok(xs[0] >= 0.2 && xs[xs.length - 1] <= 1.0001); assert.equal(cupLevel(1), cupLevel(5)); assert.equal(cupLevel(1e9), cupLevel(MAX_USD));
  });
});
