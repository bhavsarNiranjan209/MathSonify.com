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
 *   4. A11Y     — the 3D canvas keeps its accessible name, and under an
 *      emulated `prefers-reduced-motion` the flip has no transition and the
 *      idle camera drift stays off (measured: ~0 pixels over 1.4s).
 *
 * The reduced-motion emulation is set BEFORE the first navigation, so every
 * pass above runs in that mode — it also makes the pixel diffs deterministic,
 * because the ambient drift can never fire.
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
  // Follow-up 4: run the whole pass under reduced motion. Set BEFORE the first
  // navigation so the viewer reads `matches === true` at mount — the frame loop
  // samples matchMedia once, deliberately, rather than re-subscribing per frame.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

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

  // ── 3. touch on a phone-sized viewport ──────────────────────────────────
  //
  // The DECISION under test (documented on `Curve3DViewerProps.touchAction`):
  // the Studio keeps the default `touch-action: none` — its graph IS the page,
  // so a one-finger drag must orbit and never scroll — while this embedded card
  // opts into `pan-y`, because swallowing a reader's scroll gesture in the
  // middle of an article is a worse failure than a restricted tilt. `pan-y`
  // means: horizontal finger movement reaches the orbit, vertical still scrolls
  // the page.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await sleep(600);

  await evalJs(`(() => {
    const el = document.querySelector('div[style*="perspective"]');
    if (el) el.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await sleep(400);

  const phoneCanvas = await evalJs(`(() => {
    const c = [...document.querySelectorAll('div[style*="perspective"] canvas')]
      .find((el) => (el.getAttribute('aria-label') || '').startsWith('3D view of'));
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             touchAction: getComputedStyle(c).touchAction };
  })()`);
  expect('the 3D canvas reflows to the phone viewport with non-zero size',
    !!phoneCanvas && phoneCanvas.w > 100 && phoneCanvas.h > 100, JSON.stringify(phoneCanvas));
  // The card's opt-in must be on the canvas the visitor actually touches.
  expect('the embedded canvas negotiates touch as pan-y',
    !!phoneCanvas && phoneCanvas.touchAction === 'pan-y', phoneCanvas?.touchAction);

  /** Clip-screenshot of the graph frame, same helper shape as verify-hiw-3d. */
  const shot = async () => {
    const clip = JSON.parse(await evalJs(`(() => {
      const r = document.querySelector('div[style*="perspective"]').getBoundingClientRect();
      return JSON.stringify({ x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height });
    })()`));
    const out = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 },
    });
    return out.data;
  };

  /** Percent of pixels differing by >40 in any channel, computed in the page. */
  const diffPct = async (aB64, bB64) =>
    evalJs(`(async () => {
      const load = (d) => new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('image decode failed'));
        i.src = 'data:image/png;base64,' + d;
      });
      const [ia, ib] = await Promise.all([load(${JSON.stringify(aB64)}), load(${JSON.stringify(bB64)})]);
      const c = document.createElement('canvas');
      c.width = ia.width; c.height = ia.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, c.width, c.height).data;
      let changed = 0;
      const total = da.length / 4;
      for (let i = 0; i < da.length; i += 4) {
        if (Math.abs(da[i] - db[i]) > 40 || Math.abs(da[i + 1] - db[i + 1]) > 40 || Math.abs(da[i + 2] - db[i + 2]) > 40) changed++;
      }
      return +(changed / total * 100).toFixed(3);
    })()`);

  /** One finger: touchStart, `steps` touchMoves, touchEnd. */
  const drag = async (x0, y0, dx, dy, steps = 8) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps, id: 1 }],
      });
      await sleep(20);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  const cx = phoneCanvas.x + phoneCanvas.w / 2;
  const cyMid = phoneCanvas.y + phoneCanvas.h / 2;

  // A tap first: it resets the viewer's lastInteraction clock so the diff below
  // measures the DRAG, never an ambient camera movement.
  await drag(cx, cyMid, 0, 0, 1);
  await sleep(400);

  const scrollBefore = await evalJs('window.scrollY');
  const beforeOrbit = await shot();
  await drag(cx, cyMid, 140, 4, 12);
  await sleep(800);
  const afterOrbit = await shot();
  const orbitPct = await diffPct(beforeOrbit, afterOrbit);
  expect('a one-finger HORIZONTAL drag orbits the 3D scene', orbitPct > 0.5,
    `${orbitPct}% of the frame changed`);
  const scrollAfterH = await evalJs('window.scrollY');
  expect('a horizontal drag does not scroll the page', Math.abs(scrollAfterH - scrollBefore) < 4,
    `scrollY ${scrollBefore} -> ${scrollAfterH}`);

  // Vertical: `pan-y` hands this gesture to the page. Start low in the frame
  // and drag up so the document scrolls down — the orbit must NOT eat it.
  const scrollBeforeV = await evalJs('window.scrollY');
  await drag(cx, phoneCanvas.y + phoneCanvas.h - 24, 2, -150, 12);
  await sleep(700);
  const scrollAfterV = await evalJs('window.scrollY');
  expect('a one-finger VERTICAL drag still scrolls the page (pan-y honoured)',
    scrollAfterV - scrollBeforeV > 40, `scrollY ${scrollBeforeV} -> ${scrollAfterV}`);

  // ── 4. reduced motion, measured ─────────────────────────────────────────
  const flipStyle = await evalJs(`(() => {
    const flip = document.querySelector('div[style*="perspective"] > div');
    if (!flip) return null;
    const cs = getComputedStyle(flip);
    return { property: cs.transitionProperty, duration: cs.transitionDuration };
  })()`);
  expect('under prefers-reduced-motion the flip has NO transition',
    !!flipStyle && (flipStyle.property === 'none' || flipStyle.duration === '0s'),
    JSON.stringify(flipStyle));

  const idleA = await shot();
  await sleep(1400);
  const idleB = await shot();
  const idlePct = await diffPct(idleA, idleB);
  expect('under prefers-reduced-motion the idle camera drift stays off',
    idlePct < 0.1, `${idlePct}% of the frame changed over 1.4s of idling`);

  // ── report ──────────────────────────────────────────────────────────────
  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ passed: checks.length - failed.length, failed: failed.length, checks }, null, 2));
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});