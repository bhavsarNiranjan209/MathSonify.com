/**
 * GROUP 1 runtime audit part 2 — tall/wide/oscillatory/Σ equations + light mode.
 * Fresh CDP tab per equation to avoid navigation/eval races.
 * Usage: node scripts\_audit-group1-3d-part2.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
const CDP = 'http://localhost:9222';
const BASE = 'http://localhost:4321';
const SHOTS = 'c:/Projects(NiJo)/SoundCurve/certain-cycle/screenshots/audit';
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openTab(url) {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
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
  const close = () => fetch(`${CDP}/json/close/${target.id}`).catch(() => {});
  return { send, evalJs, close };
}

const probe = (tab) => tab.evalJs(`(() => {
  const canvases = [...document.querySelectorAll('canvas')];
  const gl = canvases.find((c) => c.width > 200 && (c.getContext('webgl2') || c.getContext('webgl')));
  const err3d = [...document.querySelectorAll('p')].find((d) => d.textContent?.includes('3D visualization unavailable'));
  const textErrs = [...document.querySelectorAll('p,div')].map((e) => e.childElementCount === 0 ? (e.textContent || '').trim() : '')
    .filter((t) => t && (t.includes('couldn') || t.includes('understand') || t.includes('unsupported') || t.includes('unavailable'))).slice(0, 3);
  return { glCanvas: gl ? { w: gl.width, h: gl.height } : null, fallback3d: err3d?.textContent?.trim() || null, textErrs };
})()`);

async function testEquation(name, eq, shotName) {
  const tab = await openTab(`${BASE}/studio?eq=${encodeURIComponent(eq)}`);
  await tab.send('Page.enable');
  await tab.send('Runtime.enable');
  await tab.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(6500);
  const clicked = await tab.evalJs(`(() => {
    const b = [...document.querySelectorAll('[role="group"][aria-label*="view mode"] button')].find((x) => x.textContent.trim() === '3D Graph');
    if (!b) return 'no-btn';
    if (b.disabled) return 'disabled';
    b.click();
    return 'clicked';
  })()`);
  await sleep(2000);
  const info = await probe(tab);
  const s = await tab.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${shotName}.png`, Buffer.from(s.data, 'base64'));
  console.log(`${name}: click=${clicked} ${JSON.stringify(info)} -> ${shotName}.png`);
  await tab.close();
  await sleep(500);
}

await testEquation('tall 1000sin(x)/x', '1000*sin(x)/x', 'g1-05-3d-tall');
await testEquation('wide sin(x/20)', 'sin(x/20)', 'g1-06-3d-wide');
await testEquation('oscillatory sin(x^2)', 'sin(x^2)', 'g1-07-3d-oscillatory');
await testEquation('sum()', 'sum(k, 1, 10, k*x)', 'g1-08-sum');
await testEquation('unicode Σ', 'Σ(k=1..10, k*x)', 'g1-09-sigma-unicode');

// Light mode: seed localStorage in a tab, then navigate into 3D.
const tab = await openTab(`${BASE}/studio`);
await tab.send('Page.enable');
await tab.send('Runtime.enable');
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(5000);
await tab.evalJs(`localStorage.setItem('mathsonify-theme', 'light'); true`);
await tab.send('Page.navigate', { url: `${BASE}/studio?eq=sin(x)` });
await sleep(6500);
const lightClick = await tab.evalJs(`(() => {
  const b = [...document.querySelectorAll('[role="group"][aria-label*="view mode"] button')].find((x) => x.textContent.trim() === '3D Graph');
  if (!b) return 'no-btn';
  b.click();
  return 'clicked';
})()`);
await sleep(2000);
console.log('light:', JSON.stringify(await probe(tab)), 'click:', lightClick, 'theme:', await tab.evalJs(`document.documentElement.dataset.theme`));
const ls = await tab.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}/g1-10-light-mode.png`, Buffer.from(ls.data, 'base64'));
console.log('shot: g1-10-light-mode.png');
await tab.evalJs(`localStorage.setItem('mathsonify-theme', 'dark'); true`);
await tab.close();

process.exit(0);
