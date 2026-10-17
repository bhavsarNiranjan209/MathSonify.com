import { createPlot2D } from '../src/utils/plot2d.ts';
type Call = { fn: string; args: any[] };
function fakeCtx() {
  const calls: Call[] = [];
  return new Proxy({} as any, {
    get(t: any, k: string) {
      if (k === '__calls') return calls;
      if (k === 'measureText') return (s: string) => ({ width: s.length * 6.6 });
      if (k in t) return t[k];
      return (...args: any[]) => { calls.push({ fn: k, args }); };
    },
    set(t: any, k: string, v: any) { t[k] = v; return true; },
  });
}
function fakeCanvas(w = 0, h = 0) { const ctx = fakeCtx(); return { width: 0, height: 0, clientWidth: w, clientHeight: h, getContext: () => ctx, ctx } as any; }
const made: any[] = [];
(globalThis as any).document = { createElement: () => { const c = fakeCanvas(); made.push(c); return c; } };
(globalThis as any).window = { devicePixelRatio: 2 };
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const main = fakeCanvas(400, 240);
const plot = createPlot2D(main);
const layer = made[0];
const pts = Array.from({ length: 800 }, (_, i) => { const x = -6.28 + (12.56 * i) / 799; return { x, y: Math.sin(x) }; });
plot.setPoints(pts); plot.setTheme('dark'); plot.resize();
const texts = () => layer.ctx.__calls.filter((c: Call) => c.fn === 'fillText').map((c: Call) => c.args[0]);
ok(['-6', '0', '6'].every(t => texts().includes(t)), 'x-axis numbers incl. negatives (-6, 0, 6) are painted');
ok(['-1', '-0.5', '0', '0.5', '1'].every(t => texts().includes(t)), 'y-axis numbers incl. negatives (-1, -0.5) are painted');
const before = texts().length;
let all = true;
for (let f = 0; f <= 60; f++) {
  main.ctx.__calls.length = 0; plot.draw(f / 60);
  const calls: Call[] = main.ctx.__calls;
  const iClear = calls.findIndex(c => c.fn === 'clearRect');
  const iImg = calls.findIndex(c => c.fn === 'drawImage' && c.args[0] === layer);
  if (iImg < 0 || iImg < iClear) all = false;
}
ok(all, 'all 61 playback frames: clearRect is followed by drawImage(layer) — labels cannot vanish');
ok(texts().length === before, 'labels are cached, not re-rasterised each frame');
main.ctx.__calls.length = 0; plot.draw(0.5);
ok(main.ctx.__calls.some((c: Call) => c.fn === 'arc'), 'playhead dot drawn while playing');
main.ctx.__calls.length = 0; plot.draw(null);
ok(!main.ctx.__calls.some((c: Call) => c.fn === 'arc'), 'no dot when idle');
plot.setTheme('light');
ok(texts().length > before, 'theme change re-paints the label layer once');
plot.resize(); main.ctx.__calls.length = 0; plot.draw(0.3);
ok(main.ctx.__calls.some((c: Call) => c.fn === 'drawImage'), 'after resize + theme change, frames still composite the layer');
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
