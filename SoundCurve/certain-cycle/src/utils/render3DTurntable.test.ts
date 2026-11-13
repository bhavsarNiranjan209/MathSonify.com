/**
 * 360° turntable picture (v30): layout math + wiring.
 *
 * The 2D composition itself is DOM-only (covered by the headless visual
 * proof); what is tested here is the pure layout — a 2×2 grid of the four
 * angles above the footer band — plus the wiring from the scene API
 * through the Export modal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  TURNTABLE_ANGLES_DEG,
  turntableAngleLabel,
  turntableLayout,
} from '../utils/render3DTurntable';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('the turntable covers all four sides', () => {
  assert.deepEqual([...TURNTABLE_ANGLES_DEG], [0, 90, 180, 270]);
  assert.equal(turntableAngleLabel(0), '0°');
  assert.equal(turntableAngleLabel(270), '270°');
});

test('turntableLayout: 2×2 grid above the footer band', () => {
  const { cells, footer } = turntableLayout(1600, 900);
  // Footer is 8% of the height, like the single 3D picture.
  assert.equal(footer.h, 72);
  assert.equal(footer.y, 828);
  // Four cells, reading order 0° / 90° / 180° / 270°.
  assert.equal(cells.length, 4);
  assert.deepEqual(cells[0], { x: 0, y: 0, w: 800, h: 414, angleDeg: 0 });
  assert.deepEqual(cells[1], { x: 800, y: 0, w: 800, h: 414, angleDeg: 90 });
  assert.deepEqual(cells[2], { x: 0, y: 414, w: 800, h: 414, angleDeg: 180 });
  assert.deepEqual(cells[3], { x: 800, y: 414, w: 800, h: 414, angleDeg: 270 });
  // The grid exactly fills the space above the footer, with no gaps.
  for (const c of cells) {
    assert.ok(c.y + c.h <= footer.y, 'a cell overlaps the footer');
    assert.ok(c.x + c.w <= 1600, 'a cell overflows the width');
  }
});

test('the scene API exposes the turntable picture', () => {
  const viewer = read('../components/Studio/Curve3DViewer.tsx');
  assert.match(
    viewer,
    /exportTurntableImage\(equation: string, labels\?: SceneApiLabelInfo\): Promise<\{ blob: Blob; filename: string \}>/,
    'SceneApi has no exportTurntableImage',
  );
  // It renders the four angles through the turntable composer.
  assert.match(viewer, /render3DTurntableImage\(/, 'exportTurntableImage does not use the turntable composer');
  // The live loop is paused while the four views render, so it cannot
  // redraw between them.
  assert.match(viewer, /async exportTurntableImage\(equation: string, labels\?: SceneApiLabelInfo\) \{\n\s+pauseLoop\(\);/, 'turntable does not pause the live loop');
});

test('the turntable composer draws four views plus the footer', () => {
  const source = read('../utils/render3DTurntable.ts');
  // Each view is drawn in the same task as its render (the WebGL canvas is
  // only valid until the next render).
  assert.match(source, /const first = renderView\(0\);/, 'composer does not render the first view up front');
  assert.match(source, /const view = renderView\(\(cells\[i\]\.angleDeg \* Math\.PI\) \/ 180\);/, 'composer does not render the other angles');
  assert.match(source, /ctx\.drawImage\(view, cells\[i\]\.x, cells\[i\]\.y, cells\[i\]\.w, cells\[i\]\.h\);/, 'composer does not draw each view into its cell');
  // Same footer as the single 3D picture (v32: the shared labels helper —
  // scientist name + equation name at the top for scientist equations,
  // bottom equation in the theme colour), and a distinct filename.
  assert.match(source, /drawExport3DLabels\(ctx, width, height, \{/, 'turntable does not use the shared 3D labels');
  assert.match(source, /mathsonify-\$\{slug\}-3d-360\.png/, 'turntable filename carries no -3d-360 marker');
});

test('the ExportModal offers the turntable picture in the 3D image tab', () => {
  const modal = read('../components/ExportModal.tsx');
  assert.match(modal, /const handleExport3DTurntableImage = async/, 'modal has no turntable handler');
  // v32: the handler passes the labels (name + scientist + theme).
  assert.match(modal, /await threeDApi\.exportTurntableImage\(s\.equation, \{/, 'turntable handler does not call exportTurntableImage');
  assert.match(modal, /Turntable · 4 views/, 'image tab offers no turntable choice');
  assert.match(
    modal,
    /onClick=\{imageDimension === '3d' && threeDApi \? \(image360 \? handleExport3DTurntableImage : handleExport3DImage\) : handleExportImage\}/,
    'image button does not route to the turntable handler',
  );
});
