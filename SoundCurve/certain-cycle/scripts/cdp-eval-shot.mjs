/**
 * Like cdp-shot.mjs, but runs a JS snippet in the page after the wait and
 * before the screenshot. Used to capture expanded <details> states and to
 * drive the Studio UI in verification passes.
 *
 * Usage:
 *   node scripts/cdp-eval-shot.mjs <url> <outfile.png> <evalJs> [width] [height] [waitMs]
 *   evalJs is optional — pass "" to behave exactly like cdp-shot.
 */
const [url, outfile, evalJs = '', width = '1440', height = '900', waitMs = '2500'] = process.argv.slice(2);
if (!url || !outfile) {
	console.error('usage: node scripts/cdp-eval-shot.mjs <url> <outfile.png> [evalJs] [w] [h] [waitMs]');
	process.exit(1);
}

const CDP = 'http://localhost:9222';

async function main() {
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
	await new Promise((r) => setTimeout(r, Number(waitMs)));

	if (evalJs) {
		const evaluated = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true });
		if (evaluated.exceptionDetails) {
			throw new Error('eval failed: ' + JSON.stringify(evaluated.exceptionDetails));
		}
		if (evaluated.result?.value !== undefined) {
			console.log('eval result:', JSON.stringify(evaluated.result.value));
		}
		// Let styles/layout settle after the mutation.
		await new Promise((r) => setTimeout(r, 400));
	}

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
