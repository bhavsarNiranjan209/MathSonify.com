/**
 * Multi-page boot check: visit every nav route, confirm the preloader is
 * removed, the startup error panel never shows, and no console/network
 * errors occurred. Exits 1 on any failure.
 * Usage: node scripts\_verify-all-pages-boot.mjs [baseUrl] [waitMsPerPage] [routesCsv]
 */
const CDP = 'http://localhost:9222';
const BASE = process.argv[2] || 'http://localhost:4321';
const WAIT = Number(process.argv[3] || 10000);
const ROUTES = (process.argv[4] || '/,/soundlab,/how-it-works,/studio,/guess,/draw,/scientists,/equations,/music-lab,/about').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + '/')}`, { method: 'PUT' });
if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => {
  ws.addEventListener('open', ok, { once: true });
  ws.addEventListener('error', bad, { once: true });
});
let id = 0;
const pending = new Map();
let events = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { ok, bad } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
  } else if (msg.method) events.push(msg);
});
const send = (method, params = {}) =>
  new Promise((ok, bad) => {
    const mid = ++id;
    pending.set(mid, { ok, bad });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { evalError: JSON.stringify(r.exceptionDetails) };
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');

const failures = [];
for (const route of ROUTES) {
  events = [];
  await send('Page.navigate', { url: BASE + route });
  await sleep(WAIT);

  const boot = await evalJs(`(() => {
    const pre = document.getElementById('sc-preloader');
    const err = document.getElementById('sc-startup-error');
    const islands = [...document.querySelectorAll('astro-island')];
    return {
      preloaderRemoved: pre === null,
      errorPanelVisible: err ? getComputedStyle(err).display !== 'none' : false,
      islands: islands.length,
      hydrated: islands.filter((el) => el.children.length > 0 || el.dataset.scHydrated === '1' || !el.hasAttribute('ssr')).length,
    };
  })()`);

  const problems = [];
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails;
      problems.push(`exception: ${d.text || ''} ${d.exception?.description || ''}`);
    } else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
      const txt = e.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      if (txt.includes('[vite]')) continue;
      problems.push(`console.${e.params.type}: ${txt}`);
    } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
      problems.push(`log.error: ${e.params.entry.text}`);
    } else if (e.method === 'Network.loadingFailed' && !e.params.canceled) {
      problems.push(`net.fail: ${e.params.errorText}`);
    }
  }

  const routeFailures = [];
  if (boot?.evalError) routeFailures.push('eval error: ' + boot.evalError);
  else {
    if (!boot.preloaderRemoved) routeFailures.push('preloader still in DOM');
    if (boot.errorPanelVisible) routeFailures.push('startup error panel VISIBLE');
    if (boot.islands !== boot.hydrated) routeFailures.push(`islands ${boot.hydrated}/${boot.islands} hydrated`);
  }
  routeFailures.push(...problems);

  const status = routeFailures.length ? 'FAIL' : 'ok';
  console.log(`${status} ${route} (islands: ${boot?.islands ?? '?'}, hydrated: ${boot?.hydrated ?? '?'})${routeFailures.length ? ' :: ' + routeFailures.join(' | ') : ''}`);
  failures.push(...routeFailures.map((f) => `${route}: ${f}`));
}

ws.close();
if (failures.length) {
  console.error(`\nFAILURES (${failures.length}):\n` + failures.join('\n'));
  process.exit(1);
}
console.log('\nPASS: all pages boot clean');
process.exit(0);
