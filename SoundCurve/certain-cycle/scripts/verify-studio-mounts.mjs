/**
 * /studio must actually mount.
 *
 * Guards against the reported "Studio is blank": polls the real page and
 * asserts that within 10s BOTH of these are true
 *   - `#eq-input` is present and visible (the island painted)
 *   - `#sc-preloader` is gone (the opaque overlay did not strand)
 * and that the startup error panel did NOT appear.
 *
 * Same headless-Edge harness as verify-hiw-3d.mjs. Run it against both
 * servers, because dev and the production build fail differently:
 *
 *   node scripts/verify-studio-mounts.mjs http://localhost:4321 dev
 *   node scripts/verify-studio-mounts.mjs http://localhost:4322 preview
 *
 * Prints a JSON report; exits 1 if any expectation fails.
 */
const BASE = process.argv[2] || 'http://localhost:4321';
const LABEL = process.argv[3] || 'dev';
const CDP = 'http://localhost:9222';
const DEADLINE_MS = 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const checks = [];
const expect = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

async function main() {
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
  const consoleErrors = [];
  const exceptions = [];
  const badResponses = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    } else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) {
      badResponses.push(`${msg.params.response.status} :: ${msg.params.response.url}`);
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

  const PROBE = `(() => {
    const pre = document.getElementById('sc-preloader');
    const eq = document.getElementById('eq-input');
    const err = document.getElementById('sc-startup-error');
    const vis = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    return {
      href: location.href,
      readyState: document.readyState,
      preloaderGone: !pre,
      preloaderVisible: pre ? vis(pre) : false,
      inputVisible: vis(eq),
      inputRect: eq ? (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(eq.getBoundingClientRect()) : null,
      startupErrorShown: err ? getComputedStyle(err).display !== 'none' : false,
      islandMounted: [...document.querySelectorAll('astro-island')].some((i) => i.children.length > 0),
    };
  })()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const t0 = Date.now();
  await send('Page.navigate', { url: BASE + '/studio' });

  const timeline = [];
  let probe = null;
  let inputAt = null;
  let preloaderGoneAt = null;
  while (Date.now() - t0 < DEADLINE_MS) {
    probe = await evalJs(PROBE);
    const ms = Date.now() - t0;
    // Two phantom conditions to ignore before recording anything:
    //  - the probe can land in the PREVIOUS document, before navigation commits
    //  - or in the new document while it is still streaming, before the body
    //    (which contains #sc-preloader) has been parsed — where the preloader
    //    genuinely does not exist yet and would be recorded as "already gone".
    if (!probe?.href || !probe.href.startsWith(BASE) || probe.readyState === 'loading') {
      timeline.push({ ms, skipped: probe?.readyState || 'navigation not committed' });
      await sleep(150);
      continue;
    }
    if (probe && probe.inputVisible && inputAt === null) inputAt = ms;
    if (probe && probe.preloaderGone && preloaderGoneAt === null) preloaderGoneAt = ms;
    timeline.push({ ms, in: probe?.inputVisible, pre: probe?.preloaderGone });
    if (probe && probe.inputVisible && probe.preloaderGone) break;
    await sleep(300);
  }

  expect(`the equation input is visible within ${DEADLINE_MS / 1000}s`,
    !!probe?.inputVisible, `first visible at ${inputAt}ms; ${JSON.stringify(probe?.inputRect)}`);
  expect(`the preloader is gone within ${DEADLINE_MS / 1000}s`,
    !!probe?.preloaderGone, `removed at ${preloaderGoneAt}ms`);
  expect('the island actually mounted', !!probe?.islandMounted);
  expect('the startup error panel did NOT appear', probe?.startupErrorShown === false,
    'the error panel showing means the 8s failsafe fired');
  expect('no uncaught exceptions', exceptions.length === 0, JSON.stringify(exceptions.slice(0, 3)));
  expect('no failed module responses', badResponses.length === 0, JSON.stringify(badResponses.slice(0, 3)));
  expect('no console errors', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

  console.log(JSON.stringify({
    label: LABEL,
    base: BASE,
    inputVisibleAtMs: inputAt,
    preloaderGoneAtMs: preloaderGoneAt,
    elapsedMs: Date.now() - t0,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    checks,
    timeline,
  }, null, 2));

  ws.close();
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});