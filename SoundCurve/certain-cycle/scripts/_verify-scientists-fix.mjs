/**
 * Post-fix verification for /scientists: no watchdog error, no console
 * errors, preloader removed, island hydrated, modal opens/closes.
 * Usage: node scripts/_verify-scientists-fix.mjs [url]
 */
const CDP = 'http://localhost:9222';
const BASE = process.argv[2] || 'http://localhost:4321/scientists';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${CDP}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' });
if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => {
  ws.addEventListener('open', ok, { once: true });
  ws.addEventListener('error', bad, { once: true });
});
let id = 0;
const pending = new Map();
const events = [];
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
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(9000); // past the watchdog's 8s ceiling

const report = {};
report.boot = await evalJs(`(() => {
  const isl = document.querySelector('astro-island');
  const pre = document.getElementById('sc-preloader');
  const err = document.getElementById('sc-startup-error');
  return {
    preloaderRemoved: pre === null,
    errorPanelHidden: err ? getComputedStyle(err).display === 'none' : 'no-panel',
    islandHydrated: !!isl && !isl.hasAttribute('ssr') && !!isl.getAttribute('client-render-time'),
    scHydratedMark: isl?.dataset.scHydrated || null,
  };
})()`);

report.cardClick = await evalJs(`(async () => {
  document.querySelector('.scientist-card').click();
  await new Promise((r) => setTimeout(r, 600));
  const modalOpen = !!document.querySelector('astro-island .fixed') &&
    !!document.querySelector('astro-island button[aria-label]');
  const name = document.querySelector('astro-island h2')?.textContent?.trim() || null;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 600));
  return { modalOpen, name, closedAgain: !document.querySelector('astro-island .fixed') };
})()`);

report.filterAndSearch = await evalJs(`(() => {
  const all = [...document.querySelectorAll('.scientist-card')];
  const phys = [...document.querySelectorAll('.category-filter-btn')].find((b) => /physicist/i.test(b.textContent));
  phys.click();
  const vis = all.filter((c) => c.style.display !== 'none');
  const allPhysicists = vis.every((c) => c.dataset.category === phys.dataset.category);
  document.querySelectorAll('.category-filter-btn')[0].click();
  const search = document.getElementById('scientist-search');
  search.value = 'einstein';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  const hits = all.filter((c) => c.style.display !== 'none').map((c) => c.dataset.name);
  search.value = '';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  return { visiblePhysicists: vis.length, allPhysicists, searchHits: hits };
})()`);

const problems = [];
for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails;
    problems.push(`[exception] ${d.text || ''} ${d.exception?.description || ''}`);
  } else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
    const txt = e.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    if (txt.includes('[vite]')) continue; // dev-server noise
    problems.push(`[console.${e.params.type}] ${txt}`);
  } else if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
    problems.push(`[log.error] ${e.params.entry.text} ${e.params.entry.url || ''}`);
  } else if (e.method === 'Network.loadingFailed' && !e.params.canceled) {
    problems.push(`[net.fail] ${e.params.errorText}`);
  }
}
report.consoleProblems = problems;
console.log(JSON.stringify(report, null, 2));

const failures = [];
if (!report.boot.preloaderRemoved) failures.push('preloader still in DOM after 9s');
if (report.boot.errorPanelHidden !== true) failures.push('error panel visible');
if (!report.boot.islandHydrated) failures.push('island not hydrated');
if (!report.cardClick.modalOpen) failures.push('modal did not open on card click');
if (!report.cardClick.closedAgain) failures.push('modal did not close on Escape');
if (!report.filterAndSearch.allPhysicists) failures.push('category filter wrong');
if (report.filterAndSearch.searchHits[0] !== 'albert einstein') failures.push('search wrong');
if (problems.length) failures.push(`${problems.length} console/network problems`);

ws.close();
if (failures.length) {
  console.error('FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('PASS: scientists boot + interactions verified');
process.exit(0);
