/**
 * Root-cause probe: do the 2D axis tick numbers survive Playback?
 *
 * Captures the /studio canvas twice — idle, then mid-play — and reports:
 *   - a screenshot of the whole page for each state (human-checkable), and
 *   - an in-page count of "label-coloured" pixels on the visualizer canvas,
 *     which drops to ~0 iff the numbers stop being drawn.
 *
 * Usage:
 *   node scripts/verify-graph/probe-ticks.mjs [baseUrl] [equation] [outDir]
 * Requires headless Chrome with CDP on 9222:
 *   chrome --headless=new --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required --user-data-dir=%TEMP%\cdp-graph about:blank
 */
const BASE = process.argv[2] || 'http://localhost:4321';
const EQUATION = process.argv[3] || 'sin(2x)*sin(3x)';
const OUT = process.argv[4] || 'screenshots/graph';
const CDP = 'http://localhost:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Counts pixels close to the palette's `label` colour on the 2D canvas.
 * Runs in the page: reads the live canvas, no React internals needed.
 */
const COUNT_LABEL_PIXELS = `
(() => {
  const canvas = document.querySelector('[data-export-canvas="visualizer"]');
  if (!canvas) return { error: 'no visualizer canvas' };
  const ctx = canvas.getContext('2d');
  if (!ctx) return { error: 'no 2d context' };
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Dark theme label ≈ rgb(163,167,172); light theme label ≈ rgb(102,102,102)
  // on its canvas. Count any mid-luminance, low-saturation pixel that is NOT
  // the background, the grid (#1C2024) or the pure-white curve.
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 200) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min > 18) continue;                 // coloured = curve/beam, not label
    if (max > 235) continue;                      // white curve / light canvas
    if (max < 40) continue;                       // dark canvas / grid
    if (max >= 130 && max <= 215) n++;            // grey label text band
  }
  return { labelPixels: n, canvasW: canvas.width, canvasH: canvas.height };
})()`;

async function main() {
  const fs = await import('node:fs');
  fs.mkdirSync(OUT, { recursive: true });

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

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  const shot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}/${file}`, Buffer.from(s.data, 'base64'));
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}/studio?eq=${encodeURIComponent(EQUATION)}` });
  await sleep(3500);

  const idle = await evaluate(COUNT_LABEL_PIXELS);
  await shot('probe-ticks-idle.png');

  // Click Play (trusted input via coordinates so the AudioContext gets a gesture).
  const btn = await evaluate(`(() => {
    const b = document.querySelector('button.btn-primary');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.textContent.trim() };
  })()`);
  if (!btn) throw new Error('Play button not found');
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: btn.x, y: btn.y, button: 'left', clickCount: 1 });
  }
  await sleep(1800);

  const playing = await evaluate(COUNT_LABEL_PIXELS);
  const stopped = await evaluate(`!!document.querySelector('button.btn-live')`); // Stop shown = still playing
  await shot('probe-ticks-playing.png');

  ws.close();

  const verdict = {
    equation: EQUATION,
    idle,
    playing,
    stillPlaying: stopped,
    vanished: playing?.labelPixels !== undefined && idle?.labelPixels !== undefined
      ? playing.labelPixels < idle.labelPixels * 0.25
      : 'insufficient data',
  };
  console.log(JSON.stringify(verdict, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
