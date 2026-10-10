/**
 * READ-ONLY diagnosis of a blank /studio.
 *
 * Collects evidence and classifies; it changes no source and writes no state.
 * Classification (per the brief):
 *   (a) compile/import error      (b) runtime exception on mount
 *   (c) preloader stuck           (d) rendered but hidden / zero-size
 *   (e) page frozen by a render loop
 *
 * Usage:  node scripts/diagnose-studio.mjs [baseUrl] [label]
 * e.g.    node scripts/diagnose-studio.mjs http://localhost:4321 dev
 *
 * Requires Edge/Chrome on :9222 (same harness as verify-hiw-3d.mjs).
 */
const BASE = process.argv[2] || 'http://localhost:4321';
const LABEL = process.argv[3] || 'dev';
const CDP = 'http://localhost:9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
      return;
    }
    for (const fn of listeners) fn(msg);
  });
  const send = (method, params = {}) =>
    new Promise((ok, bad) => {
      const mid = ++id;
      pending.set(mid, { ok, bad });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  // ── evidence: console, exceptions, network ──────────────────────────────
  const consoleErrors = [];
  const consoleWarnings = [];
  const exceptions = [];
  const failedRequests = [];
  const badResponses = [];
  const requests = new Map();

  const onEvent = (msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      const line = `[${msg.params.type}] ${text}`;
      if (msg.params.type === 'error') consoleErrors.push(line);
      if (msg.params.type === 'warning') consoleWarnings.push(line);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      exceptions.push({
        text: d.text,
        message: d.exception?.description || d.exception?.value || '',
        url: `${d.url || ''}:${d.lineNumber || 0}`,
      });
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') consoleErrors.push(`[log:${e.source}] ${e.text}`);
      if (e.level === 'warning') consoleWarnings.push(`[log:${e.source}] ${e.text}`);
    } else if (msg.method === 'Network.requestWillBeSent') {
      requests.set(msg.params.requestId, msg.params.request.url);
    } else if (msg.method === 'Network.loadingFailed') {
      const url = requests.get(msg.params.requestId) || '(unknown)';
      failedRequests.push(`${msg.params.errorText} :: ${url}`);
    } else if (msg.method === 'Network.responseReceived') {
      const s = msg.params.response.status;
      if (s >= 400) badResponses.push(`${s} :: ${msg.params.response.url}`);
    }
  };
  listeners.push(onEvent);

  const evalJs = async (expression) => {
    const out = await send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (out.exceptionDetails) return { __throw: JSON.stringify(out.exceptionDetails) };
    return out.result?.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const t0 = Date.now();
  await send('Page.navigate', { url: BASE + '/studio' });

  /** One snapshot of everything that decides the classification. */
  const PROBE = `(() => {
    const pre = document.getElementById('sc-preloader');
    const islands = [...document.querySelectorAll('astro-island')];
    const eq = document.getElementById('eq-input');
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      return true;
    };
    const chain = [];
    for (let el = eq; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') chain.push('display:none@' + (el.tagName + (el.id ? '#' + el.id : '')));
      if (parseFloat(cs.opacity) === 0) chain.push('opacity0@' + (el.tagName + (el.id ? '#' + el.id : '')));
      if (cs.visibility === 'hidden') chain.push('visibility:hidden@' + (el.tagName + (el.id ? '#' + el.id : '')));
      const r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) chain.push('zero-size@' + (el.tagName + (el.id ? '#' + el.id : '')));
    }
    return {
      readyState: document.readyState,
      hidden: document.hidden,
      preloaderPresent: !!pre,
      preloaderVisible: pre ? (getComputedStyle(pre).display !== 'none' && parseFloat(getComputedStyle(pre).opacity) > 0.01) : false,
      preloaderZ: pre ? getComputedStyle(pre).zIndex : null,
      islandCount: islands.length,
      islandChildren: islands.map((i) => i.children.length),
      islandHtml: islands[0] ? islands[0].innerHTML.slice(0, 200) : null,
      eqPresent: !!eq,
      eqVisible: visible(eq),
      eqRect: rect(eq),
      eqHiddenAncestors: chain,
      inputCount: document.querySelectorAll('input').length,
      bodyTextLen: (document.body.innerText || '').length,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      boundaryError: /could not start|hit an error while loading/i.test(document.body.innerText || ''),
    };
  })()`;

  // Poll until the island renders, up to 10s.
  const timeline = [];
  let probe = null;
  for (let i = 0; i < 20; i++) {
    probe = await evalJs(PROBE);
    timeline.push({ ms: Date.now() - t0, eq: probe?.eqPresent, pre: probe?.preloaderPresent, kids: JSON.stringify(probe?.islandChildren) });
    if (probe?.eqPresent || (Date.now() - t0) > 9500) break;
    await sleep(500);
  }

  // ── is the page frozen? (rAF ticks over 600ms) ──────────────────────────
  const ticks = await evalJs(`(async () => {
    let n = 0; const start = performance.now();
    await new Promise((res) => {
      const step = () => { n++; if (performance.now() - start < 600) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    });
    return n;
  })()`);
  // How long does a trivial synchronous evaluate take? A blocked main thread
  // shows up here even when rAF still schedules.
  const evalStart = Date.now();
  await evalJs('1+1');
  const evalLatencyMs = Date.now() - evalStart;

  // ── settle: is the preloader still there AFTER its own failsafe? ────────
  // The poll above exits the moment #eq-input appears, which can be the same
  // instant the preloader starts its 450ms fade. A preloader caught mid-fade
  // is not stuck, so watch a further window before judging it.
  await sleep(4000);
  const settled = await evalJs(PROBE);
  const settleTimeline = { msAfterNav: Date.now() - t0, settled };

  // ── experiment: does removing #sc-preloader reveal the Studio? ──────────
  let afterRemoval = null;
  let removedPreloader = false;
  if (settled?.preloaderVisible) {
    await evalJs(`(() => { const p = document.getElementById('sc-preloader'); if (p) p.remove(); return true; })()`);
    await sleep(600);
    afterRemoval = await evalJs(PROBE);
    removedPreloader = true;
  }

  // ── classification ──────────────────────────────────────────────────────
  const moduleFailures = [
    ...failedRequests.filter((f) => /\.(m?js|ts|tsx|astro|css)(\?|$)/.test(f)),
    ...badResponses,
  ];
  const importErrors = consoleErrors.filter((e) =>
    /dynamically imported|Failed to fetch|Import module failed|500 \(Internal|Failed to resolve|Transform failed|Unexpected token|SyntaxError/i.test(e),
  );

  let classification, why;
  if (removedPreloader && afterRemoval?.eqPresent && afterRemoval?.eqVisible) {
    classification = '(c) preloader stuck';
    why = 'removing #sc-preloader revealed a fully rendered Studio underneath';
  } else if (moduleFailures.length || importErrors.length) {
    classification = '(a) compile/import error';
    why = JSON.stringify({ moduleFailures, importErrors }, null, 2);
  } else if (exceptions.length) {
    classification = '(b) runtime exception on mount';
    why = JSON.stringify(exceptions, null, 2);
  } else if (typeof ticks === 'number' && ticks < 10) {
    classification = '(e) page frozen by a render loop';
    why = `only ${ticks} rAF ticks in 600ms (a healthy page does ~36)`;
  } else if (evalLatencyMs > 800) {
    classification = '(e) page frozen by a render loop';
    why = `main thread latency ${evalLatencyMs}ms for \`1+1\``;
  } else if (probe?.eqPresent && !probe?.eqVisible) {
    classification = '(d) rendered but hidden or zero-size';
    why = JSON.stringify({ eqRect: probe.eqRect, hiddenAncestors: probe.eqHiddenAncestors }, null, 2);
  } else if (probe?.islandCount && (probe.islandChildren || []).every((n) => n === 0)) {
    classification = '(d) rendered but hidden or zero-size';
    why = `astro-island exists but rendered no children: ${JSON.stringify(probe.islandHtml)}`;
  } else {
    classification = 'NOT REPRODUCING / no evidence captured';
    why = 'island never produced #eq-input within 10s, with no exception, no failed module and no stuck preloader';
  }

  const report = {
    label: LABEL,
    base: BASE,
    elapsedMs: Date.now() - t0,
    classification,
    why,
    probe,
    settled,
    settleTimeline,
    afterPreloaderRemoval: afterRemoval,
    rafTicksIn600ms: ticks,
    mainThreadLatencyMs: evalLatencyMs,
    consoleErrors,
    consoleWarnings: consoleWarnings.slice(0, 20),
    exceptions,
    failedRequests,
    badResponses,
    timeline,
  };
  console.log(JSON.stringify(report, null, 2));
  ws.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});