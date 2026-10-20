/**
 * Shared CDP + screenshot-diff helpers for the graph-gap rig.
 * Same harness as scripts/_verify-tour-items.mjs (Edge/Chrome on :9222).
 */
import zlib from 'node:zlib';

export const CDP = 'http://localhost:9222';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) ─────────────── */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8;
  let width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  let prev = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const row = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) row[i] = (row[i] + a) & 0xff;
      else if (filter === 2) row[i] = (row[i] + b) & 0xff;
      else if (filter === 3) row[i] = (row[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) row[i] = (row[i] + paeth(a, b, c)) & 0xff;
    }
    row.copy(out, y * stride); prev = row;
  }
  return { width, height, bpp, pixels: out };
}

/** % of pixels whose max channel delta exceeds `tol`. */
export function diffPct(a, b, tol = 24) {
  if (a.width !== b.width || a.height !== b.height) return 100;
  const stride = a.width * a.bpp;
  let changed = 0;
  const total = a.width * a.height;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = y * stride + x * a.bpp;
      const dr = Math.abs(a.pixels[i] - b.pixels[i]);
      const dg = Math.abs(a.pixels[i + 1] - b.pixels[i + 1]);
      const db = Math.abs(a.pixels[i + 2] - b.pixels[i + 2]);
      if (Math.max(dr, dg, db) > tol) changed++;
    }
  }
  return (changed / total) * 100;
}

/* ── CDP session ──────────────────────────────────────────────────────── */
export async function openCdp() {
  const res = await fetch(`${CDP}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
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
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, bad } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'exception'));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  const send = (method, params = {}) =>
    new Promise((ok, bad) => {
      const mid = ++id;
      pending.set(mid, { ok, bad });
      ws.send(JSON.stringify({ id: mid, method, params }));
      setTimeout(() => (pending.has(mid) ? (pending.delete(mid), bad(new Error('timeout ' + method))) : undefined), 30000);
    });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalJs, consoleErrors };
}

/* ── gesture helpers ──────────────────────────────────────────────────── */
/** Real pointer gesture: press at (x0,y0), drag to (x0,y0+dy), release. */
export async function drag(send, x0, y0, dy, steps = 10) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 + (dy * i) / steps, button: 'left', buttons: 1 });
    await sleep(30);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0, y: y0 + dy, button: 'left', buttons: 1, clickCount: 1 });
}

/** Ctrl+Z or Ctrl+Shift+Z, delivered as real key events. */
export async function pressCtrlZ(send, shift) {
  const modifiers = shift ? 3 : 2; // 1=Alt 2=Ctrl 4=Shift
  for (const type of ['rawKeyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type, modifiers, key: shift ? 'Z' : 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
    });
  }
}
