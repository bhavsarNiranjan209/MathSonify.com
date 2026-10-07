/**
 * Stage-2 functional verification for /scientists:
 *  - content-visibility is actually applied to cards
 *  - delegated click still opens the modal event
 *  - category filter and search still show/hide the right cards
 * Prints a JSON report; exits 1 on any failed expectation.
 */
const CDP = 'http://localhost:9222';

async function main() {
	const res = await fetch(`${CDP}/json/new?${encodeURIComponent('http://localhost:4321/scientists')}`, { method: 'PUT' });
	if (!res.ok) throw new Error(`/json/new failed: ${res.status}`);
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
	await send('Page.navigate', { url: 'http://localhost:4321/scientists' });
	await new Promise((r) => setTimeout(r, 3000));

	const expression = `(async () => {
		const seen = [];
		window.addEventListener('mathsonify:open-scientist', (e) => seen.push(e.detail));
		const all = [...document.querySelectorAll('.scientist-card')];
		const first = all[0];
		const report = {
			totalCards: all.length,
			contentVisibility: getComputedStyle(first).contentVisibility,
		};
		first.click();
		report.delegatedEventDetail = seen;

		const phys = [...document.querySelectorAll('.category-filter-btn')].find((b) => /physicist/i.test(b.textContent));
		phys.click();
		const visibleAfterCat = all.filter((c) => c.style.display !== 'none');
		report.visibleAfterPhysicists = visibleAfterCat.length;
		report.visibleAllPhysicists = visibleAfterCat.every((c) => c.dataset.category === (phys.dataset.category));

		const search = document.getElementById('scientist-search');
		[...document.querySelectorAll('.category-filter-btn')][0].click(); // back to "All"
		search.value = 'einstein';
		search.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 100));
		const afterSearch = all.filter((c) => c.style.display !== 'none');
		report.visibleAfterSearchEinstein = afterSearch.length;
		report.searchHits = afterSearch.map((c) => c.dataset.name);

		return JSON.stringify(report);
	})()`;

	const evaluated = await send('Runtime.evaluate', { expression, awaitPromise: true });
	if (evaluated.exceptionDetails) {
		console.error('EVAL FAILED:', JSON.stringify(evaluated.exceptionDetails));
		process.exit(1);
	}
	const report = JSON.parse(evaluated.result.value);
	console.log(JSON.stringify(report, null, 2));

	const failures = [];
	if (report.totalCards !== 100) failures.push(`expected 100 cards, got ${report.totalCards}`);
	if (report.contentVisibility !== 'auto') failures.push(`content-visibility not applied: ${report.contentVisibility}`);
	if (report.delegatedEventDetail.length < 1 || report.delegatedEventDetail[0] !== 'lovelace') {
		failures.push(`delegated click did not fire with ada-lovelace: ${JSON.stringify(report.delegatedEventDetail)}`);
	}
	if (report.visibleAfterPhysicists === 0 || report.visibleAfterPhysicists === 100 || !report.visibleAllPhysicists) {
		failures.push(`Physicists filter wrong: ${report.visibleAfterPhysicists} visible, allPhysicists=${report.visibleAllPhysicists}`);
	}
	if (report.searchHits.length !== 1 || report.searchHits[0] !== 'albert einstein') {
		failures.push(`search for einstein wrong: ${JSON.stringify(report.searchHits)}`);
	}

	ws.close();
	if (failures.length) {
		console.error('FAILURES:\n' + failures.join('\n'));
		process.exit(1);
	}
	console.log('PASS: scientists grid checks');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
