/**
 * GRAPH GAP CHECK — real Edit path -> 3D evidence (step 1).
 *
 * Drives the REAL Studio UI over CDP:
 *   1. /studio loads with sin(x); the 3D baseline is captured twice (A, then
 *      B after a pause) so idle-drift noise is MEASURED, not guessed.
 *   2. Back to 2D, enters Edit mode, drags the Amplitude handle up 70px
 *      (real Input.dispatchMouseEvent gesture).
 *   3. Captures 2D before/after, switches to 3D, asserts the edited scene
 *      changed well beyond drift noise.
 *   4. Ctrl+Z / Ctrl+Shift+Z recorded as-is (Studio has no undo wiring for
 *      equation edits — this documents the real behaviour).
 *   5. Reset (revert equation edits) -> 3D must return to the baseline.
 *
 * Usage: node scripts/_graph-gap-edit.mjs [baseURL]   (CDP on :9222 required)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { sleep, decodePng, diffPct, openCdp, drag, pressCtrlZ } from './_graph-gap-lib.mjs';

const BASE = process.argv[2] || 'http://localhost:4321/studio';
const SHOT_DIR = 'screenshots/graph-gap';
mkdirSync(SHOT_DIR, { recursive: true });

const { ws, send, evalJs, consoleErrors } = await openCdp();
const shotPng = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(`${SHOT_DIR}/${name}.png`, buf);
  return { path: `${SHOT_DIR}/${name}.png`, buf };
};
const clickViewMode = (label) =>
  evalJs(`(() => {
    const g = [...document.querySelectorAll('[role="group"][aria-label$="view mode"] button')].find(b => (b.textContent || '').trim() === ${JSON.stringify(label)});
    if (!g) return 'no-btn'; g.click(); return 'clicked';
  })()`);
const clickByTitle = (title) =>
  evalJs(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || '') === ${JSON.stringify(title)});
    if (!b) return false; b.click(); return true;
  })()`);
const eqValue = () => evalJs(`(document.getElementById('eq-input') || {}).value || null`);
const amplitudeLabel = () =>
  evalJs(`(() => {
    const b = document.querySelector('button[aria-label^="Amplitude"]');
    return b ? b.getAttribute('aria-label') : null;
  })()`);

const report = { startedAt: new Date().toISOString(), url: BASE, checks: {} };

await send('Page.enable');
await send('Runtime.enable');
try { await send('Log.enable'); } catch { /* optional */ }
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(9000);

report.page = await evalJs(`({
  theme: document.documentElement.dataset.theme,
  eq: (document.getElementById('eq-input') || {}).value || null,
  startupError: !!document.querySelector('#sc-startup-error') && getComputedStyle(document.querySelector('#sc-startup-error')).display !== 'none',
  canvases: document.querySelectorAll('canvas').length,
})`);

/* 3D baseline A + drift control B */
report.checks.to3d = await clickViewMode('3D Graph');
await sleep(5500);
const baseA = await shotPng('g1-01-3d-baseline-a');
await sleep(12000); // idle drift only — measures pure scene noise
const baseB = await shotPng('g1-02-3d-baseline-b-drift');
report.checks.driftPct = Number(diffPct(decodePng(baseA.buf), decodePng(baseB.buf)).toFixed(3));

report.checks.to2d = await clickViewMode('2D Graph');
await sleep(2500);

/* Edit mode + real control-point drag */
report.checks.editEntered = await clickByTitle('Drag up/down to shift the curve');
await sleep(1200);
report.checks.eqBeforeDrag = await eqValue();
report.checks.ampBefore = await amplitudeLabel();
const before2d = await shotPng('g1-03-2d-editmode-before-drag');

const handle = await evalJs(`(() => {
  const b = document.querySelector('button[aria-label^="Amplitude"]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);
report.checks.handle = handle;
if (!handle) throw new Error('Amplitude control-point handle not found');
await drag(send, handle.x, handle.y, -70);
await sleep(1500);
report.checks.eqAfterDrag = await eqValue();
report.checks.ampAfter = await amplitudeLabel();
const after2d = await shotPng('g1-04-2d-after-amplitude-drag');
report.checks.diff2dBeforeAfterPct = Number(diffPct(decodePng(before2d.buf), decodePng(after2d.buf)).toFixed(3));
/* switch to 3D and assert the scene followed the edit */
report.checks.to3dAfterDrag = await clickViewMode('3D Graph');
await sleep(5500);
const afterDrag3d = await shotPng('g1-05-3d-after-drag');
report.checks.diff3dAfterDragPct = Number(diffPct(decodePng(baseA.buf), decodePng(afterDrag3d.buf)).toFixed(3));

/* undo / redo (recorded as-is) */
report.checks.to2dForKeys = await clickViewMode('2D Graph');
await sleep(2000);
await pressCtrlZ(send, false);
await sleep(800);
report.checks.eqAfterCtrlZ = await eqValue();
await pressCtrlZ(send, true);
await sleep(800);
report.checks.eqAfterCtrlShiftZ = await eqValue();
report.checks.undoWorked = report.checks.eqAfterCtrlZ !== report.checks.eqAfterDrag;

/* Reset -> 3D must return to the baseline scene */
report.checks.resetClicked = await clickByTitle('Revert equation edits');
await sleep(1500);
report.checks.eqAfterReset = await eqValue();
report.checks.to3dAfterReset = await clickViewMode('3D Graph');
await sleep(5500);
const afterReset3d = await shotPng('g1-06-3d-after-reset');
report.checks.diff3dAfterResetPct = Number(diffPct(decodePng(baseA.buf), decodePng(afterReset3d.buf)).toFixed(3));

/* verdicts */
const drift = report.checks.driftPct;
report.verdict = {
  dragChanged2D: report.checks.diff2dBeforeAfterPct > 1.0,
  sceneChangedIn3D: report.checks.diff3dAfterDragPct > Math.max(2.0, 3 * drift),
  sceneRestoredAfterReset: report.checks.diff3dAfterResetPct < Math.max(2.0, 2 * drift),
  equationFollowsDrag:
    report.checks.eqAfterDrag !== report.checks.eqBeforeDrag &&
    report.checks.eqAfterReset === 'sin(x)',
};
report.consoleErrors = consoleErrors.slice(0, 20);
report.finishedAt = new Date().toISOString();
console.log(JSON.stringify(report, null, 1));
writeFileSync(`${SHOT_DIR}/edit-3d-report.json`, JSON.stringify(report, null, 2));
ws.close();
process.exit(0);

