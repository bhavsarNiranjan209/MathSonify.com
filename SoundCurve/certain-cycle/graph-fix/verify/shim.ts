let pass = 0, fail = 0; const stack: string[] = [];
export function describe(n: string, f: () => void) { stack.push(n); f(); stack.pop(); }
export function it(n: string, f: () => void) {
  const name = [...stack, n].join(' › ');
  try { f(); pass++; console.log('  ✓', name); } catch (e: any) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function mk(v: any, neg = false) {
  const t = (c: boolean, m: string) => { if (neg ? c : !c) throw new Error((neg ? 'NOT ' : '') + m); };
  return {
    toBe: (e: any) => t(Object.is(v, e), `expected ${v} toBe ${e}`),
    toEqual: (e: any) => t(eq(v, e), `expected ${JSON.stringify(v)} toEqual ${JSON.stringify(e)}`),
    toContain: (e: any) => t(v.includes(e), `expected ${JSON.stringify(v)} toContain ${e}`),
    toBeLessThan: (e: number) => t(v < e, `expected ${v} < ${e}`),
    toBeGreaterThan: (e: number) => t(v > e, `expected ${v} > ${e}`),
    toBeCloseTo: (e: number, d = 2) => t(Math.abs(v - e) < Math.pow(10, -d) / 2, `expected ${v} ≈ ${e}`),
  };
}
export const expect = (v: any) => Object.assign(mk(v), { not: mk(v, true) });
process.on('exit', () => { console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exitCode = 1; });
