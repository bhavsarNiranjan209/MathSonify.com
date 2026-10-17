/**
 * Diagnostic: open /scientists via CDP, capture network failures and the
 * astro-island script URLs, then report island mount state.
 * Usage: node scripts/_probe-scientists-network.mjs [url] [waitMs]
 */
const CDP = 'http://localhost:9222';
const BASE = process.argv[2] || 'http://localhost:4321/scientists';
const WAIT = Number(process.argv[3] || 9000);

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
  } else if (msg.method) {
    events.push(msg);
  }
});
const send = (method, params = {}) =>
  new Promise((ok, bad) => {
    const mid = ++id;
    pending.set(mid, { ok, bad });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url: BASE });
await new Promise((r) => setTimeout(r, WAIT));

const urls = new Map();
for (const e of events) {
  if (e.method === 'Network.responseReceived') {
    const { requestId, response, type } = e.params;
    urls.set(requestId, { url: response.url, status: response.status, type });
    if (response.status >= 400) {
      console.log(`[HTTP ${response.status}] ${type} ${response.url}`);
    }
  } else if (e.method === 'Network.loadingFailed') {
    const info = urls.get(e.params.requestId) || {};
    console.log(`[LOAD FAILED] ${info.type || '?'} ${info.url || '?'} :: ${e.params.errorText} ${e.params.blockedReason || ''}`);
  } else if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails;
    console.log(`[EXCEPTION] ${d.text || ''} ${d.exception?.description || ''}`);
  }
}

const check = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const isl = document.querySelector('astro-island');
    if (!isl) return { present: false };
    return {
      present: true,
      componentUrl: isl.getAttribute('component-url'),
      rendererUrl: isl.getAttribute('renderer-url'),
      componentExport: isl.getAttribute('component-export'),
      propsKeys: Object.keys(JSON.parse(isl.getAttribute('props') || '{}')),
      attrs: [...isl.attributes].map((a) => a.name),
    };
  })()`,
});
console.log('\n[island attrs]', JSON.stringify(check.result?.value, null, 2));
ws.close();
process.exit(0);
