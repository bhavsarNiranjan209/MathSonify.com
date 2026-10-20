/**
 * GRAPH GAP CHECK step 2 — light-mode 3D grid screenshots (ink lines) plus a
 * dark-mode control. Usage: node scripts/_graph-gap-grid.mjs [baseURL]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { sleep, openCdp } from './_graph-gap-lib.mjs';

const BASE = process.argv[2] || 'http://localhost:4321/studio';
const SHOT_DIR = 'screenshots/graph-gap';
mkdirSync(SHOT_DIR, { recursive: true });

const { ws, send, evalJs, consoleErrors } = await openCdp();
const shotPng = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOT_DIR}/${name}.png`, Buffer.from(data, 'base64'));
  return `${SHOT_DIR}/${name}.png`;
};
const clickText = (selector, text) =>
  evalJs(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find(x => (x.textContent || '').trim() === ${JSON.stringify(text)});
    if (!b) return 'no-btn'; b.click(); return 'clicked';
  })()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(9000);

const report = { startedAt: new Date().toISOString(), checks: {} };
report.checks.lightClicked = await clickText('[role="group"][aria-label="Display mode"] button', 'Light');
await sleep(1500);
report.checks.to3d = await clickText('[role="group"][aria-label$="view mode"] button', '3D Graph');
await sleep(5500);
report.checks.lightShot = await shotPng('g2-01-light-3d-ink-grid');
report.checks.themeIn3d = await evalJs(`document.documentElement.dataset.theme`);

report.checks.darkClicked = await clickText('[role="group"][aria-label="Display mode"] button', 'Dark');
await sleep(4000); // re-ink in place, no rebuild needed for theme-only change
report.checks.darkShot = await shotPng('g2-02-dark-3d-unchanged');
report.checks.darkTheme = await evalJs(`document.documentElement.dataset.theme`);

report.consoleErrors = consoleErrors.slice(0, 10);
report.finishedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 1));
writeFileSync(`${SHOT_DIR}/grid-color-report.json`, JSON.stringify(report, null, 2));
ws.close();
process.exit(0);
