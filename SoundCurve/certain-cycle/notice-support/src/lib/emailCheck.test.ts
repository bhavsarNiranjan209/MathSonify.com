import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkEmail } from './emailCheck';

describe('emailCheck: every mistake gets a specific, friendly message', () => {
  const CASES: [string, string, RegExp][] = [
    ['', 'EMPTY', /enter your email/i], ['   ', 'EMPTY', /enter your email/i], ['ada example@x.com', 'SPACES', /spaces/],
    ['ada.example.com', 'NO_AT', /missing an @/], ['ada@@example.com', 'MANY_AT', /more than one @/], ['@example.com', 'NO_LOCAL', /before the @/],
    ['ada@', 'NO_DOMAIN', /after the @/], ['ada@example', 'NO_DOT', /needs a dot/], ['ada@example.c', 'BAD_TLD', /ending looks wrong/],
    ['ada@example.123', 'BAD_TLD', /ending looks wrong/], ['.ada@example.com', 'DOTS', /dot/i], ['ada..b@example.com', 'DOTS', /dot/i],
    ['ada@example..com', 'DOTS', /dot/i], ['ada@-example.com', 'BAD_CHARS', /character/], ['a<b>@example.com', 'BAD_CHARS', /character/],
    ['ada@example.com,bob@x.org', 'BAD_CHARS', /character/], ['x'.repeat(65) + '@example.com', 'TOO_LONG', /too long/], ['ada@' + 'x'.repeat(64) + '.com', 'TOO_LONG', /too long/],
    ['ada@example.com\nBcc: evil@x.com', 'SPACES', /spaces/],
  ];
  for (const [input, code, re] of CASES) test(`${JSON.stringify(input.slice(0, 40))} -> ${code}`, () => {
    const r = checkEmail(input); assert.equal(r.ok, false); assert.equal(r.code, code); assert.match(r.message ?? '', re);
  });
  test('non-strings are treated as empty', () => { for (const v of [null, undefined, 42, {}, []]) assert.equal(checkEmail(v).code, 'EMPTY'); });
});
describe('emailCheck: typo suggestions', () => {
  const T: [string, string][] = [['ada@gmial.com', 'ada@gmail.com'], ['ada@gmail.con', 'ada@gmail.com'], ['ada@gamil.com', 'ada@gmail.com'], ['ada@yahho.com', 'ada@yahoo.com'], ['ada@hotmial.com', 'ada@hotmail.com'], ['ada@school.cmo', 'ada@school.com'], ['ada@company.vom', 'ada@company.com']];
  for (const [input, fix] of T) test(`${input} -> did you mean ${fix}`, () => {
    const r = checkEmail(input); assert.equal(r.ok, false); assert.equal(r.code, 'TYPO'); assert.equal(r.suggestion, fix); assert.match(r.message!, /Did you mean/);
  });
  test('typo check can be switched off (server)', () => assert.equal(checkEmail('ada@gmial.com', { typoCheck: false }).ok, true));
  test('real addresses pass untouched', () => { for (const e of ['ada@gmail.com', 'a.b+tag@example.co.in', "o'brien@example.org", 'x@sub.domain.example.org', 'USER@Example.COM']) assert.equal(checkEmail(e).ok, true, e); });
  test('normalises case and whitespace', () => assert.equal(checkEmail('  Ada@Example.COM ').email, 'ada@example.com'));
});
