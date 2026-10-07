/**
 * Stage-2 throttled-mobile verification for /scientists:
 *  - mobile viewport + CPU/network throttling (the environment content-visibility exists for)
 *  - cards off-screen are actually SKIPPED (checkVisibility with contentVisibilityAuto)
 *  - scrolling brings them back (skipping is not hiding)
 *  - page still functional: 100 cards, filter works under throttle
 * Prints a JSON report; exits 1 on any failed expectation.
 *
 * Usage: node scripts/verify-mobile-throttle.mjs   (dev server + CDP Edge must be up)
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
	await send('Network.enable');
	// iPhone 14-ish viewport, 3x DPR.
	await send('Emulation.setDeviceMetricsOverride', {
		width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
	});
	// 4x CPU slowdown + Fast 3G network — the phone-in-elevator case.
	await send('Emulation.setCPUThrottlingRate', { rate: 4 });
	await send('Network.emulateNetworkConditions', {
		offline: false,
		latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
	});

	const t0 = Date.now();
	await send('Page.navigate', { url: 'http://localhost:4321/scientists' });
	await new Promise((r) => setTimeout(r, 5000));

	const expression = `(async () => {
		const all = [...document.querySelectorAll('.scientist-card')];
		// A content-visibility:auto element's own BOX keeps rendering (with its
		// intrinsic placeholder), so the element itself always checkVisibility()s
		// true. What the browser actually skips is its CONTENT — probe the first
		// descendant with contentVisibilityAuto:true to observe skipping.
		const isSkipped = (card) => {
			const el = card.querySelector('*');
			return !!el && !el.checkVisibility({ contentVisibilityAuto: true });
		};
		const skipped = () => all.filter(isSkipped).length;
		const first = all[0];
		const last = all[all.length - 1];

		const report = {
			totalCards: all.length,
			contentVisibility: getComputedStyle(first).contentVisibility,
			skippedAtTop: skipped(),
			viewport: [innerWidth, innerHeight],
			lastCardSkippedAtTop: isSkipped(last),
		};

		// Scroll to the very bottom — the LAST card must come back, the first must skip.
		const scroller = document.scrollingElement || document.documentElement;
		window.scrollTo(0, scroller.scrollHeight);
		await new Promise((r) => setTimeout(r, 1200)); // throttled CPU: give frames time
		report.scrolledToBottom = scrollY > 1000;
		report.scrollYAtBottom = scrollY;
		report.maxScroll = scroller.scrollHeight - innerHeight;
		report.lastRectAtBottom = Math.round(last.getBoundingClientRect().top);
		report.lastCardSkippedAtBottom = isSkipped(last);
		report.firstCardSkippedAtBottom = isSkipped(first);

		// Back to top, then a functional check under throttle.
		window.scrollTo(0, 0);
		await new Promise((r) => setTimeout(r, 300));
		const phys = [...document.querySelectorAll('.category-filter-btn')].find((b) => /physicist/i.test(b.textContent));
		phys.click();
		await new Promise((r) => setTimeout(r, 100));
		report.visibleAfterPhysicists = all.filter((c) => c.style.display !== 'none').length;

		// Real-user timing: when did first contentful paint actually land?
		const nav = performance.getEntriesByType('navigation')[0];
		const fcp = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint');
		report.fcpMs = fcp ? Math.round(fcp.startTime) : null;
		report.domContentLoadedMs = nav ? Math.round(nav.domContentLoadedEventEnd) : null;

		return JSON.stringify(report);
	})()`;

	const evaluated = await send('Runtime.evaluate', { expression, awaitPromise: true, userGesture: true });
	if (evaluated.exceptionDetails) {
		console.error('EVAL FAILED:', JSON.stringify(evaluated.exceptionDetails));
		process.exit(1);
	}
	const report = JSON.parse(evaluated.result.value);
	report.wallClockLoadMs = Date.now() - t0;
	console.log(JSON.stringify(report, null, 2));

	const failures = [];
	if (report.totalCards !== 100) failures.push(`expected 100 cards, got ${report.totalCards}`);
	if (report.contentVisibility !== 'auto') failures.push(`content-visibility not applied: ${report.contentVisibility}`);
	if (report.skippedAtTop <= 0) failures.push('no cards skipped at top — virtualization is not engaging');
	if (report.skippedAtTop >= report.totalCards) failures.push('EVERY card skipped — nothing is rendering');
	if (report.lastCardSkippedAtTop !== true) failures.push('last card should be skipped at top of page');
	if (!report.scrolledToBottom) failures.push('scroll to bottom failed');
	if (report.lastCardSkippedAtBottom !== false) {
		failures.push('last card still skipped after scrolling to it — skip is sticky, not virtualization');
	}
	if (report.firstCardSkippedAtBottom !== true) {
		failures.push('first card should be skipped once scrolled far away');
	}
	if (report.visibleAfterPhysicists === 0 || report.visibleAfterPhysicists === 100) {
		failures.push(`Physicists filter broken under throttle: ${report.visibleAfterPhysicists} visible`);
	}

	// Screenshot at the bottom so the re-rendered cards are in frame.
	const shot = await send('Page.captureScreenshot', { format: 'png' });
	const fs = await import('node:fs');
	fs.mkdirSync('screenshots', { recursive: true });
	fs.writeFileSync('screenshots/stage2-mobile-throttled.png', Buffer.from(shot.data, 'base64'));
	console.log('saved screenshots/stage2-mobile-throttled.png');

	ws.close();
	if (failures.length) {
		console.error('FAILURES:\n' + failures.join('\n'));
		process.exit(1);
	}
	console.log('PASS: throttled-mobile checks');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});