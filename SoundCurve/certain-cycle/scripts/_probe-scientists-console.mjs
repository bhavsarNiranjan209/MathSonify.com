/**
 * Diagnostic: open /scientists via CDP, capture ALL console messages and
 * uncaught exceptions, then report island mount state after 9s.
 * Usage: node scripts/_probe-scientists-console.mjs [url] [waitMs]
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
await send('Log.enable');
await send('Page.navigate', { url: BASE });
await new Promise((r) => setTimeout(r, WAIT));

const fmt = (args = []) =>
  args.map((a) => a.value ?? a.description ?? a.type ?? '').join(' ');

for (const e of events) {
  if (e.method === 'Runtime.consoleAPICalled') {
    console.log(`[console.${e.params.type}] ${fmt(e.params.args)}`);
  } else if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails;
    console.log(`[EXCEPTION] ${d.text || ''} ${d.exception?.description || ''}`);
  } else if (e.method === 'Log.entryAdded') {
    const l = e.params.entry;
    if (l.level === 'error' || l.level === 'warning') {
      console.log(`[log.${l.level}] ${l.source}: ${l.text} ${l.url || ''}`);
    }
  }
}

const check = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const isl = document.querySelector('astro-island');
    return {
      astroIslandPresent: !!isl,
      islandEmpty: isl ? isl.childNodes.length === 0 : null,
      islandHTMLLen: isl ? isl.innerHTML.length : -1,
      firstChild: isl && isl.firstElementChild ? isl.firstElementChild.tagName : null,
      readyState: document.readyState,
      bodyChildren: document.body ? document.body.children.length : -1,
    };
  })()`,
});
console.log('\n[island state]', JSON.stringify(check.result?.value, null, 2));
ws.close();
process.exit(0);
