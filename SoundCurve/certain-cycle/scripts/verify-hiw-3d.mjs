/**
 * Runtime verification for the /how-it-works hero card's 2D / 3D mode.
 *
 * Static contract tests pin the wiring; this pins the behaviour the wiring is
 * FOR, in a real browser at the real card size (~340px wide, 200px tall):
 *
 *   1. the toggle exists, starts on 2D, and flips in place (no navigation)
 *   2. the 3D face is Studio's own viewer and gets a NON-ZERO canvas at card size
 *   3. orbit and zoom actually move the scene at that size
 *   4. ONE Play state drives both faces: the 3D scene must visibly change when
 *      the card's Play button is pressed, with nothing else moving
 *
 * (4) is the interesting one. The viewer takes no progress prop — it subscribes
 * to the studio store — so if the card failed to mirror its transport, pressing
 * Play would change NOTHING in the 3D frame. Idle drift is suppressed by doing
 * an interaction first: drift waits `IDLE_DRIFT.resumeDelaySeconds` (3.2s) after
 * any input and then eases in over 1.5s, so the whole playback comparison fits
 * inside a window where the camera is provably still.
 *
 * Requires a dev server on :4321 and Edge/Chrome on :9222, e.g.:
 *   astro dev --background
 *   msedge --headless=new --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required --user-data-dir=%TEMP%\edge-cdp about:blank
 *
 * Prints a JSON report; exits 1 if any expectation fails.
 */
const CDP = 'http://localhost:9222';
const PAGE = 'http://localhost:4321/how-it-works';
const SHOTS = 'screenshots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every expectation, in one list, so the report reads as a checklist. */
const checks = [];
const expect = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

async function main() {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`/json/new failed: ${res.status} ${await res.text()}`);
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
    const out = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      // Objects and numbers only cross the wire as values with this set;
      // without it a returned object arrives as a bare remote handle.
      returnByValue: true,
    });
    if (out.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(out.exceptionDetails));
    return out.result?.value;
  };

  /** Percent of pixels that differ by more than 40 in any channel. */
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

  /** Screenshots the graph frame only, so the diff is not diluted by the page. */
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

  const save = async (b64, file) => {
    const fs = await import('node:fs');
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(`${SHOTS}/${file}`, Buffer.from(b64, 'base64'));
  };

  // ── look at the card ────────────────────────────────────────────────────
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url: PAGE });
  await sleep(4500);
  // elementFromPoint and CDP input both work in viewport space, so put the
  // card on screen first — otherwise the very first probe reads null.
  await evalJs(`document.querySelector('div[style*="perspective"]').scrollIntoView({ block: 'center' })`);
  await sleep(400);

  const before = await evalJs(`(() => {
    const group = document.querySelector('[aria-label="Demo graph view mode"]');
    const btns = group ? [...group.querySelectorAll('button')] : [];
    const frame = document.querySelector('div[style*="perspective"]');
    const card = frame ? frame.parentElement : null;
    const canvases = frame ? [...frame.querySelectorAll('canvas')] : [];
    const three = canvases.find((c) => (c.getAttribute('aria-label') || '').startsWith('3D view of'));
    const two = canvases.find((c) => (c.getAttribute('aria-label') || '').startsWith('Graph of'));
    const flip = frame ? frame.firstElementChild : null;
    const r = frame ? frame.getBoundingClientRect() : null;
    const hit = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null;
    const play = [...document.querySelectorAll('button')].find((b) => /Play|Pause/.test(b.textContent));
    return {
      hasGroup: !!group,
      labels: btns.map((b) => b.textContent.trim()),
      pressed: btns.map((b) => b.getAttribute('aria-pressed')),
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0,
      frameW: r ? Math.round(r.width) : 0,
      frameH: r ? Math.round(r.height) : 0,
      flipTransform: flip ? getComputedStyle(flip).transform : null,
      threeMounted: !!three,
      twoDisplay: two ? getComputedStyle(two).display : null,
      twoW: two ? Math.round(two.getBoundingClientRect().width) : 0,
      hitIsTwoD: hit === two,
      playLabel: play ? play.textContent.trim() : null,
    };
  })()`);

  expect('the 2D/3D toggle is rendered', before.hasGroup, JSON.stringify(before.labels));
  expect('it starts on 2D', before.pressed?.[0] === 'true' && before.pressed?.[1] === 'false',
    before.pressed?.join(','));
  expect('the frame is the small card size',
    before.cardWidth >= 300 && before.cardWidth <= 345 && before.frameH === 200,
    `card ${before.cardWidth}px, frame ${before.frameW}x${before.frameH}`);
  expect('the 2D face is laid out, not display:none',
    before.twoDisplay !== 'none' && before.twoW > 0, `display=${before.twoDisplay} ${before.twoW}px`);
  expect('3D is not mounted until asked for', before.threeMounted === false);
  expect('2D is the face under the pointer', before.hitIsTwoD === true);
  expect('the flip starts un-rotated',
    before.flipTransform === 'none' || before.flipTransform?.startsWith('matrix(1, 0, 0, 1'),
    before.flipTransform);

  // ── flip to 3D ──────────────────────────────────────────────────────────
  await evalJs(`[...document.querySelectorAll('[aria-label="Demo graph view mode"] button')][1].click()`);
  await sleep(2000); // 500ms transition + first-time chunk fetch + scene build

  const after = await evalJs(`(() => {
    const group = document.querySelector('[aria-label="Demo graph view mode"]');
    const btns = [...group.querySelectorAll('button')];
    const frame = document.querySelector('div[style*="perspective"]');
    const canvases = [...frame.querySelectorAll('canvas')];
    const three = canvases.find((c) => (c.getAttribute('aria-label') || '').startsWith('3D view of'));
    const two = canvases.find((c) => (c.getAttribute('aria-label') || '').startsWith('Graph of'));
    const flip = frame.firstElementChild;
    const r = frame.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      pressed: btns.map((b) => b.getAttribute('aria-pressed')),
      flipTransform: getComputedStyle(flip).transform,
      three: three ? { w: three.clientWidth, h: three.clientHeight } : null,
      twoDisplay: two ? getComputedStyle(two).display : null,
      twoW: two ? Math.round(two.getBoundingClientRect().width) : 0,
      hitIsThree: hit === three,
      fallback: /3D visualization unavailable/.test(document.body.innerText),
    };
  })()`);

  expect('the toggle moved to 3D', after.pressed?.[1] === 'true', after.pressed?.join(','));
  expect('the frame rotated', after.flipTransform?.startsWith('matrix3d'), after.flipTransform);
  expect('the shared 3D viewer mounted with a real, sized canvas',
    !!after.three && after.three.w > 100 && after.three.h > 100, JSON.stringify(after.three));
  expect('no "3D unavailable" fallback for sin(x)', after.fallback === false);
  expect('the 3D face is now under the pointer', after.hitIsThree === true);
  expect('the 2D canvas is still laid out behind it',
    after.twoDisplay !== 'none' && after.twoW > 0, `display=${after.twoDisplay} ${after.twoW}px`);

  // ── orbit, at card size ─────────────────────────────────────────────────
  const idleA = await shot();
  await save(idleA, 'hiw-3d-idle.png');

  const box = JSON.parse(await evalJs(`(() => {
    const c = [...document.querySelector('div[style*="perspective"]').querySelectorAll('canvas')]
      .find((el) => (el.getAttribute('aria-label') || '').startsWith('3D view of'));
    const r = c.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
  })()`));

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 90, y: box.y - 35, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 90, y: box.y - 35, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(700); // the damped orbit eases toward its target rather than snapping
  const orbited = await shot();
  const orbitPct = await diffPct(idleA, orbited);
  expect('orbit moves the scene at card size', orbitPct > 1, `${orbitPct}% of pixels changed`);

  // ── zoom ────────────────────────────────────────────────────────────────
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -300 });
  await sleep(700);
  const zoomed = await shot();
  const zoomPct = await diffPct(orbited, zoomed);
  expect('zoom moves the scene at card size', zoomPct > 1, `${zoomPct}% of pixels changed`);

  // ── ONE Play state drives both faces ────────────────────────────────────
  // The baseline is taken straight after an interaction, so idle drift (3.2s
  // delay, then a 1.5s ease-in) cannot contribute to the playback comparison.
  await sleep(350);
  const base = await shot();

  // A trusted click on the real Play button, so the browser lets Web Audio
  // start — a synthetic .click() would be blocked by the autoplay policy.
  const playBox = JSON.parse(await evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find((el) => /Play/.test(el.textContent));
    const r = b.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
  })()`));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: playBox.x, y: playBox.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: playBox.x, y: playBox.y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(500);

  const playingState = await evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find((el) => /Play|Pause/.test(el.textContent));
    return { label: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') };
  })()`);
  expect('Play started', playingState.pressed === 'true' && /Pause/.test(playingState.label),
    JSON.stringify(playingState));

  await sleep(2200); // ~0.43 of the 6s sweep, still inside the drift window
  const playing = await shot();
  await save(playing, 'hiw-3d-playing.png');
  const playPct = await diffPct(base, playing);
  expect('the 3D face reveals with the shared Play state', playPct > 0.5,
    `${playPct}% of pixels changed (0 would mean the store mirror is not wired)`);

  // Flipping back mid-run must not stop or restart anything.
  await evalJs(`[...document.querySelectorAll('[aria-label="Demo graph view mode"] button')][0].click()`);
  await sleep(900);
  const roundTrip = await evalJs(`(() => {
    const btns = [...document.querySelector('[aria-label="Demo graph view mode"]').querySelectorAll('button')];
    const b = [...document.querySelectorAll('button')].find((el) => /Play|Pause/.test(el.textContent));
    const two = [...document.querySelector('div[style*="perspective"]').querySelectorAll('canvas')]
      .find((el) => (el.getAttribute('aria-label') || '').startsWith('Graph of'));
    const r = two.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      pressed: btns.map((el) => el.getAttribute('aria-pressed')),
      play: b.getAttribute('aria-pressed'),
      hitIsTwo: hit === two,
      twoDisplay: getComputedStyle(two).display,
    };
  })()`);
  expect('flipping back lands on 2D', roundTrip.pressed?.[0] === 'true' && roundTrip.hitIsTwo,
    JSON.stringify(roundTrip));
  expect('playback survives the round trip', roundTrip.play === 'true',
    `aria-pressed=${roundTrip.play}`);

  const report = {
    card: `frame ${before.frameW}x${before.frameH} in a ${before.cardWidth}px card`,
    orbitPct, zoomPct, playPct,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    checks,
  };
  console.log(JSON.stringify(report, null, 2));
  ws.close();
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});