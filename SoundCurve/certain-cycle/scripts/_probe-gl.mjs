/** Probe: does the CDP browser support WebGL (needed for Stage-3 3D render check)? */
const CDP = 'http://localhost:9222';
const res = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, bad) => {
	ws.addEventListener('open', ok, { once: true });
	ws.addEventListener('error', bad, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) {
		const { ok, bad } = pending.get(m.id);
		pending.delete(m.id);
		m.error ? bad(new Error(JSON.stringify(m.error))) : ok(m.result);
	}
});
const send = (method, params = {}) =>
	new Promise((ok, bad) => {
		const mid = ++id;
		pending.set(mid, { ok, bad });
		ws.send(JSON.stringify({ id: mid, method, params }));
	});
await send('Page.enable');
await send('Page.navigate', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 500));
const ev = await send('Runtime.evaluate', {
	expression: `(() => {
		const out = {};
		try {
			const c = document.createElement('canvas');
			const gl2 = c.getContext('webgl2');
			out.webgl2 = !!gl2;
			if (gl2) {
				const dbg = gl2.getExtension('WEBGL_debug_renderer_info');
				out.renderer = dbg ? gl2.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
			}
		} catch (e) { out.webgl2Error = String(e); }
		try {
			const c2 = document.createElement('canvas');
			out.webgl1 = !!c2.getContext('webgl');
		} catch (e) { out.webgl1Error = String(e); }
		return JSON.stringify(out);
	})()`,
});
console.log(ev.result.value);
ws.close();
