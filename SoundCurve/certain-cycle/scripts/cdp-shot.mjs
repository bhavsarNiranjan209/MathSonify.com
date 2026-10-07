/**
 * Minimal CDP screenshot tool against an Edge instance with
 * --remote-debugging-port. Uses Node's built-in WebSocket (Node 22+),
 * so no new dependencies.
 *
 * Usage:
 *   node scripts/cdp-shot.mjs <url> <outfile.png> [width] [height] [waitMs]
 *
 * Launch Edge first, e.g.:
 *   msedge --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\edge-cdp about:blank
 */
const [url, outfile, width = '1440', height = '900', waitMs = '2500'] = process.argv.slice(2);
if (!url || !outfile) {
	console.error('usage: node scripts/cdp-shot.mjs <url> <outfile.png> [w] [h] [waitMs]');
	process.exit(1);
}

const CDP = 'http://localhost:9222';

async function main() {
	// Create a fresh page target (the /json/new endpoint returns its ws URL).
	const res = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
	if (!res.ok) throw new Error(`/json/new failed: ${res.status} ${await res.text()}`);
	const target = await res.json();

	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((ok, bad) => {
		ws.addEventListener('open', ok, { once: true });
		ws.addEventListener('error', bad, { once: true });
	});

	let id = 0;
	const pending = new Map();
	ws.addEventListener('message', (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && pending.has(msg.id)) {
			const { ok, bad } = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? bad(new Error(JSON.stringify(msg.error))) : ok(msg.result);
		}
	});
	const send = (method, params = {}) =>
		new Promise((ok, bad) => {
			const mid = ++id;
			pending.set(mid, { ok, bad });
			ws.send(JSON.stringify({ id: mid, method, params }));
		});

	await send('Page.enable');
	await send('Emulation.setDeviceMetricsOverride', {
		width: Number(width),
		height: Number(height),
		deviceScaleFactor: 1,
		mobile: false,
	});
	await send('Page.navigate', { url });
	// Give Astro islands time to hydrate and paint.
	await new Promise((r) => setTimeout(r, Number(waitMs)));

	const shot = await send('Page.captureScreenshot', { format: 'png' });
	const fs = await import('node:fs');
	fs.mkdirSync(outfile.replace(/[\\/][^\\/]*$/, '') || '.', { recursive: true });
	fs.writeFileSync(outfile, Buffer.from(shot.data, 'base64'));
	ws.close();
	console.log(`saved ${outfile}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});