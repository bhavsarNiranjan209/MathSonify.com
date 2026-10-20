/**
 * Studio tour checklist verification (items 2-6).
 *
 * Item 2: axis ticks remain visible during playback (2D)
 * Item 5: tan(x) 3D percentile y-trim overlay note
 * Item 4: 3D reference tick labels include 0/negatives (visual evidence)
 * Item 3: light-mode 3D floor grid visible
 * Item 6: live equation change while in 3D rebuilds the scene (trim note
 *         appears/disappears without flipping 2D <-> 3D)
 *
 * Usage: node scripts/_verify-tour-items.mjs [baseURL]
 * Requires: dev server on :4321, Chrome/Edge CDP on :9222 (headless ok).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const CDP = 'http://localhost:9222';
const BASE = process.argv[2] || 'http://localhost:4321/studio';
const SHOT_DIR = 'screenshots/tour';
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => {
  ws.addEventListener('open', ok, { once: true });
  ws.addEventListener('error', bad, { once: true });
});
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, bad } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'exception'));
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});
const send = (method, params = {}) =>
  new Promise((ok, bad) => {
    const mid = ++id;
    pending.set(mid, { ok, bad });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => (pending.has(mid) ? (pending.delete(mid), bad(new Error('timeout ' + method))) : undefined), 30000);
  });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${SHOT_DIR}/${name}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
};

/** Click the primary Play/Pause/Stop button; return its text before click. */
const clickPrimary = (exactText) =>
  evalJs(`(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = ${exactText ? `btns.find(x => (x.textContent || '').trim() === ${JSON.stringify(exactText)})` : `btns.find(x => /^(play audio|pause|stop)$/i.test((x.textContent || '').replace(/[^a-z]/gi, '').trim()))`};
    if (!b) return { clicked: false, text: null };
    const before = (b.textContent || '').trim();
    b.click();
    return { clicked: true, text: before };
  })()`);

const playbackState = () =>
  evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^(play audio|pause|stop)$/i.test((x.textContent || '').replace(/[^a-z]/gi, '').trim()));
    const pct = [...document.querySelectorAll('span.tabular-nums')].map(x => (x.textContent || '').trim()).find(t => /^\\d{1,3}%$/.test(t));
    return { btn: b ? (b.textContent || '').trim() : null, pct: pct ?? null };
  })()`);

const setEquation = (eq) =>
  evalJs(`(() => {
    const el = document.getElementById('eq-input');
    if (!el) return { ok: false, why: 'no #eq-input' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(eq)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // VISIBLE alerts only — the always-present startup failsafe panel lives in
    // the DOM with display:none and must not be mistaken for a live error.
    const alert = [...document.querySelectorAll('[role="alert"]')]
      .filter(a => a.getClientRects().length > 0)
      .map(a => (a.textContent || '').trim()).filter(Boolean);
    return { ok: true, value: el.value, alerts: alert.slice(0, 3) };
  })()`);

const trimNoteVisible = () =>
  evalJs(`!![...document.querySelectorAll('p,span,div')].find(e => e.children.length === 0 && (e.textContent || '').trim() === 'y-range trimmed to show the shape')`);

const clickViewMode = (label) =>
  evalJs(`(() => {
    const g = [...document.querySelectorAll('[role="group"][aria-label*="view mode"] button')].find(b => (b.textContent || '').trim() === ${JSON.stringify(label)});
    if (!g) return 'no-btn'; g.click(); return 'clicked';
  })()`);

const report = { startedAt: new Date().toISOString(), url: BASE, checks: {} };

await send('Page.enable');
await send('Runtime.enable');
try { await send('Log.enable'); } catch { /* optional */ }
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(9000);

report.page = await evalJs(`({
  theme: document.documentElement.dataset.theme,
  eq: (document.getElementById('eq-input') || {}).value || null,
  startupError: !!document.querySelector('#sc-startup-error') && getComputedStyle(document.querySelector('#sc-startup-error')).display !== 'none',
  canvases: document.querySelectorAll('canvas').length,
})`);

/* ---------- Item 2: ticks during playback ---------- */
{
  const clicked = await clickPrimary('Play audio');
  await sleep(1700);
  const state1 = await playbackState();
  report.checks.item2 = { playClicked: clicked.clicked, at1700ms: state1 };
  report.checks.item2.shot = await shot('tour-item2-ticks-during-playback');
  await sleep(800);
  const state2 = await playbackState();
  report.checks.item2.at2500ms = state2;
  report.checks.item2.progressAdvanced = state1.pct !== null && state2.pct !== null && state1.pct !== state2.pct;
  report.checks.item2.playing = state1.btn !== 'Play audio';
  report.checks.item2.stopped = await clickPrimary(null);
  await sleep(600);
}

/* ---------- Item 5 + 4: tan(x) -> 3D trim note + ref ticks (dark) ---------- */
{
  report.checks.item5_set = await setEquation('tan(x)');
  await sleep(2200);
  report.checks.item5_mode = await clickViewMode('3D Graph');
  await sleep(4500);
  report.checks.item5_trimNote = await trimNoteVisible();
  report.checks.item5_shots = [await shot('tour-item5-tan-trim-note'), await shot('tour-item4-ref-ticks-3d-dark')];
}

/* ---------- Item 3: light-mode floor ---------- */
{
  const clicked = await evalJs(`(() => {
    const b = [...document.querySelectorAll('[role="group"][aria-label="Display mode"] button')].find(x => (x.textContent || '').trim() === 'Light');
    if (!b) return false; b.click(); return true;
  })()`);
  await sleep(2800);
  report.checks.item3 = {
    lightClicked: clicked,
    theme: await evalJs(`document.documentElement.dataset.theme`),
    canvases: await evalJs(`document.querySelectorAll('canvas').length`),
    shot: await shot('tour-item3-light-3d-floor'),
  };
}

/* ---------- Item 6: live re-render while staying in 3D ---------- */
{
  report.checks.item6_set = await setEquation('sin(x)');
  await sleep(4000);
  report.checks.item6_trimNoteGone = !(await trimNoteVisible());
  report.checks.item6_eq = await evalJs(`(document.getElementById('eq-input') || {}).value || null`);
  report.checks.item6_shot = await shot('tour-item6-live-rerender');
}

report.consoleErrors = consoleErrors.slice(0, 20);
report.finishedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 1));
ws.close();
process.exit(0);

