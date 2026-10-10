/**
 * How-it-works card: stress and touch verification.
 *
 * Follow-ups 1-3 of the 3D card work, checked in a real browser:
 *
 *   1. PREFETCH — the viewer chunk is requested because the card came near the
 *      viewport, NOT because 3D was pressed.
 *   2. DISPOSE  — flip 2D<->3D twenty times and watch the console: a viewer
 *      that leaked contexts would emit Chromium's "too many active WebGL
 *      contexts" warning, and the last flip must still render.
 *   3. TOUCH    — on a phone-sized, touch-emulated viewport: a horizontal
 *      drag over the 3D face orbits, and a vertical drag still scrolls the
 *      page (the embedded card opts into `pan-y`).
 *
 * Usage: node scripts/verify-hiw-3d-stress.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:4321';
const CDP = 'http://localhost:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checks = [];
const expect = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

async function main() {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + '/how-it-works')}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', bad, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const warnings = [];
  const viewerRequests = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'warning' || msg.params.type === 'error')) {
      warnings.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level !== 'info') {
      warnings.push(`[log] ${msg.params.entry.text}`);
    } else if (msg.method === 'Network.requestWillBeSent') {
      const u = msg.params.request.url;
      if (/Curve3DViewer/.test(u)) viewerRequests.push({ at: Date.now() - t0, url: u.split('/').pop() });
    }
  });
  const send = (method, params = {}) =>
    new Promise((ok, bad) => {
      const mid = ++id;
      pending.set(mid, { ok, bad });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evalJs = async (expression) => {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) return { __throw: JSON.stringify(out.exceptionDetails) };
    return out.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const t0 = Date.now();
  await send('Page.navigate', { url: BASE + '/how-it-works' });
  await sleep(4000);

  // ── 1. prefetch ────────────────────────────────────────────────────────
  // The card is in the viewport here, so the chunk must arrive WITHOUT a click.
  const chunkBeforeClick = viewerRequests.length;
  expect('the viewer chunk is prefetched while the card is in view', chunkBeforeClick > 0,
    `requested at ${viewerRequests[0]?.at}ms, before any click (${chunkBeforeClick} request(s))`);

  const toggle = async (index) => {
    await evalJs(`[...document.querySelectorAll('[aria-label="Demo graph view mode"] button')][${index}].click()`);
  };

  await toggle(1);
  await sleep(1500);

  // ── 2. twenty flips, watching for leaked contexts ──────────────────────
  const contextWarningsBefore = warnings.filter((w) => /too many active WebGL|THREE\.WebGLRenderer|Error creating WebGL/i.test(w)).length;
  for (let i = 0; i < 20; i++) {
    await toggle(i % 2 === 0 ? 0 : 1);
    await sleep(260);
  }
  await toggle(1);
  await sleep(900);

  const contextWarningsAfter = warnings.filter((w) => /too many active WebGL|THREE\.WebGLRenderer|Error creating WebGL/i.test(w)).length;
  expect('no WebGL context warnings across 20 flips', contextWarningsAfter === contextWarningsBefore,
    `${contextWarningsAfter - contextWarningsBefore} new warning(s)`);

  const lastFlip = await evalJs(`(() => {
    const c = [...document.querySelector('div[style*="perspective"]').querySelectorAll('canvas')]
      .find((el) => (el.getAttribute('aria-label') || '').startsWith('3D view of'));
    return c ? { w: c.clientWidth, h: c.clientHeight, label: c.getAttribute('aria-label') } : null;
  })()`);
  expect('the last flip still renders a sized 3D canvas',
    !!lastFlip && lastFlip.w > 100 && lastFlip.h > 100, JSON.stringify(lastFlip));
  expect('the 3D canvas keeps its accessible name',
    !!lastFlip && /3D view of /.test(lastFlip.label || ''), lastFlip?.label);

// __APPEND__
}