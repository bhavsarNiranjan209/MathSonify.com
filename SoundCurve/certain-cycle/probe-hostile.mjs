import { parse } from 'mathjs';
import { parseEquation } from './src/utils/equationParser.ts';

// Which hostile inputs does mathjs itself accept (i.e. only our allowlist
// stands between them and evaluation), and does OUR parser always refuse
// with the normal "couldn't understand" error and no evaluator?
const hostile = [
  'constructor(1)',
  '__proto__',
  'toString(1)',
  'hasOwnProperty("x")',
  'valueOf',
  'this',
  'x.constructor',
  '[1,2][0]',
  'a=1',
  'f(x)=x',
  'eval(x)',
  'Function(x)',
  'import(x)',
  'sin(x.constructor)',
  '2 + constructor(1)',
  'sum(k=1,3,k)*toString(1)',
  'this + 1',
  'x.__proto__',
];

for (const eq of hostile) {
  let mathjs = 'PARSES';
  try { parse(eq); } catch (e) { mathjs = 'rejects: ' + String(e.message).slice(0, 50); }
  const r = parseEquation(eq);
  const ours = r.success
    ? `!!! ACCEPTED -> evaluate=${typeof r.evaluate}`
    : `REJECT  error=${JSON.stringify(r.error)} suggestion=${r.suggestion ? r.suggestion.equation : 'none'}`;
  console.log(`${eq.padEnd(32)} | mathjs ${mathjs.padEnd(40)} | ours ${ours}`);
}
