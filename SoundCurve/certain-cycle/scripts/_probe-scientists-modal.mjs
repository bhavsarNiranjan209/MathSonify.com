/**
 * Functional check: click a scientist card, confirm the React modal mounts and
 * becomes interactive; also report island hydration markers.
 * Usage: node scripts/_probe-scientists-modal.mjs [url]
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

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: BASE });
await sleep(9000);

const before = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const isl = document.querySelector('astro-island');
    return {
      hasClientRenderTime: !!isl?.getAttribute('client-render-time'),
      hasSsrAttr: isl?.hasAttribute('ssr'),
      children: isl?.children.length,
      errorPanelVisible: (() => { const p = document.getElementById('sc-startup-error'); return p ? getComputedStyle(p).display !== 'none' : null; })(),
    };
  })()`,
});
console.log('[before click]', JSON.stringify(before.result?.value));

const click = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const card = document.querySelector('.scientist-card');
    if (!card) return { ok: false, reason: 'no card' };
    card.click();
    return { ok: true, id: card.getAttribute('data-scientist-id') };
  })()`,
});
console.log('[click]', JSON.stringify(click.result?.value));
await sleep(1500);

const after = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const isl = document.querySelector('astro-island');
    const modalTitle = document.querySelector('astro-island h2, astro-island h3, astro-island button[aria-label]');
    return {
      islandChildren: isl?.children.length,
      islandHTMLLen: isl?.innerHTML.length ?? -1,
      closeBtn: !!document.querySelector('astro-island button[aria-label]'),
      anyFixedPanel: !!document.querySelector('astro-island .fixed'),
    };
  })()`,
});
console.log('[after click]', JSON.stringify(after.result?.value));

for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails;
    console.log(`[EXCEPTION] ${d.text || ''} ${d.exception?.description || ''}`);
  } else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
    const txt = e.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    console.log(`[console.${e.params.type}] ${txt}`);
  }
}
ws.close();
process.exit(0);
