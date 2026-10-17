/**
 * GROUP 1 runtime audit: 3D chain part 1 — flip, fps, first frame.
 * Usage: node scripts\_audit-group1-3d.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
const CDP = 'http://localhost:9222';
const BASE = 'http://localhost:4321';
const SHOTS = 'c:/Projects(NiJo)/SoundCurve/certain-cycle/screenshots/audit';
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + '/studio')}`, { method: 'PUT' });
if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => {
  ws.addEventListener('open', ok, { once: true });
  ws.addEventListener('error', bad, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, bad } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((ok, bad) => {
    const mid = ++id;
    pending.set(mid, { ok, bad });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(s.data, 'base64'));
  console.log(`shot: ${name}.png`);
};
const click3D = () => evalJs(`(() => {
  const btns = [...document.querySelectorAll('[role="group"][aria-label*="view mode"] button')];
  const b = btns.find((x) => x.textContent.trim() === '3D Graph');
  if (!b) return 'no-3d-btn';
  b.click();
  return 'clicked';
})()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/studio` });
await sleep(9000);
await shot('g1-01-studio-2d-dark');

console.log('flip:', await click3D());
await sleep(300);
await shot('g1-02-flip-midway');
await sleep(1700);
await shot('g1-03-3d-first-frame-dark');

const firstFrame = await evalJs(`(() => {
  const canvases = [...document.querySelectorAll('canvas')];
  const gl = canvases.find((c) => c.width > 200 && (c.getContext('webgl2') || c.getContext('webgl')));
  const err = [...document.querySelectorAll('p')].find((d) => d.textContent?.trim().startsWith('3D visualization unavailable'));
  return {
    canvasCount: canvases.length,
    canvasSize: gl ? { w: gl.width, h: gl.height } : null,
    fallbackShown: !!err,
  };
})()`);
console.log('firstFrame:', JSON.stringify(firstFrame));

const fps = await evalJs(`(async () => {
  const canvases = [...document.querySelectorAll('canvas')];
  const c = canvases.find((x) => x.getAttribute('role') === 'img') || canvases[canvases.length - 1];
  if (!c) return { error: 'no canvas' };
  const rect = c.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: cx, clientY: cy, bubbles: true }));
  let frames = 0;
  const t0 = performance.now();
  const stop = t0 + 2500;
  while (performance.now() < stop) {
    const a = (performance.now() - t0) / 250;
    c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: cx + Math.cos(a) * 120, clientY: cy + Math.sin(a) * 40, bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => { frames++; r(); }));
  }
  c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: cx, clientY: cy, bubbles: true }));
  return { fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1), frames };
})()`);
console.log('orbit-fps:', JSON.stringify(fps));
await shot('g1-04-3d-after-orbit-dark');

ws.close();
process.exit(0);

