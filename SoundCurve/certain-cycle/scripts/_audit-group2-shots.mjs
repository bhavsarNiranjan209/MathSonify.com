import { mkdirSync } from 'node:fs';

// CDP screenshot prober for GROUP 2 audit evidence.
const target = process.argv[2] ?? 'http://localhost:4321/';
const shots = (process.argv[3] ?? '').split(',').filter(Boolean);
const waitMs = Number(process.argv[4] ?? 6000);

const res = await fetch('http://localhost:9222/json/list');
const tabs = await res.json();
let tab = tabs.find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
if (!tab) {
  const created = await (
    await fetch('http://localhost:9222/json/new?' + new URLSearchParams({ url: 'about:blank' }), { method: 'PUT' })
  ).json();
  tab = created;
}
const wsUrl = tab.webSocketDebuggerUrl;
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const cur = ++id;
    pending.set(cur, { resolve, reject });
    ws.send(JSON.stringify({ id: cur, method, params }));
    setTimeout(() => {
      if (pending.has(cur)) {
        pending.delete(cur);
        reject(new Error('timeout ' + method));
      }
    }, 30000);
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: target });
await sleep(waitMs);
mkdirSync('screenshots/audit', { recursive: true });
for (const name of shots) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`screenshots/audit/${name}.png`, Buffer.from(data, 'base64'));
  console.log('saved', name);
}
// Console dump for error evidence
const evalRes = await send('Runtime.evaluate', {
  expression: `(() => { const els = [...document.querySelectorAll('[data-i18n]')].length; return { url: location.href, title: document.title, i18n: els }; })()`,
  returnByValue: true,
});
console.log(JSON.stringify(evalRes.result.value));
ws.close();
