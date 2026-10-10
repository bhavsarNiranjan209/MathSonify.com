/** Throwaway probe: what does the island actually look like over time? */
const CDP = 'http://localhost:9222';
const BASE = process.argv[2] || 'http://localhost:4321';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const res = await fetch(`${CDP}/json/new?${encodeURIComponent(BASE + '/studio')}`, { method: 'PUT' });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((ok) => { const i = ++id; pending.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: BASE + '/studio' });
const t0 = Date.now();
for (let i = 0; i < 28; i++) {
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const isl = document.querySelector('astro-island');
      const pre = document.getElementById('sc-preloader');
      const eq = document.getElementById('eq-input');
      return {
        islPresent: !!isl,
        childCount: isl ? isl.children.length : -1,
        nodeCount: isl ? isl.childNodes.length : -1,
        firstChildTag: isl && isl.firstElementChild ? isl.firstElementChild.tagName : null,
        grandKids: isl && isl.firstElementChild ? isl.firstElementChild.childNodes.length : -1,
        textLen: isl ? isl.textContent.trim().length : -1,
        prePresent: !!pre,
        preOpacity: pre ? getComputedStyle(pre).opacity : null,
        eqVisible: eq ? eq.getBoundingClientRect().height > 1 : false,
      };
    })()`,
  });
  console.log(JSON.stringify({ ms: Date.now() - t0, ...(r.result?.value || {}) }));
  await sleep(150);
}
ws.close();
process.exit(0);