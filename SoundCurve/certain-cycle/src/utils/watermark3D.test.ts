/**
 * 3D billboard watermark (v30): pure geometry + source wiring.
 *
 * The canvas drawing itself is DOM-only (covered by the headless visual
 * proof); what is tested here is the sizing math that makes the mark read
 * ~50px on a 720px-tall view — the same size as the 2D watermark — plus
 * the wiring that puts a camera-facing sprite in the scene.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  WATERMARK_3D_TEXT,
  WATERMARK_3D_TILT,
  WATERMARK_3D_OPACITY,
  WATERMARK_3D_CAP_PX_AT_720,
  watermarkBillboardCanvasSize,
  watermarkBillboardSpriteScale,
  watermarkBillboardFont,
} from '../utils/watermark3D';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('the billboard carries the same mark as the 2D watermark', () => {
  assert.equal(WATERMARK_3D_TEXT, 'Mathsonify.com');
  // Same tilt as the 2D diagonal watermark: -30°.
  assert.ok(Math.abs(WATERMARK_3D_TILT - -Math.PI / 6) < 1e-9, 'tilt is not -30°');
  // Same ghost as the 2D watermark: 50%.
  assert.equal(WATERMARK_3D_OPACITY, 0.5);
  assert.equal(WATERMARK_3D_CAP_PX_AT_720, 50);
  // Manrope regular 400 — the owner's font pick, NOT bold.
  assert.match(watermarkBillboardFont(200), /^400 200px "Manrope"/);
});

test('watermarkBillboardCanvasSize: fits the -30° rotated text', () => {
  // Zero-width text: the box is just the rotated em square + padding.
  const empty = watermarkBillboardCanvasSize(0, 100);
  assert.equal(empty.width, 66, 'empty canvas width');
  assert.equal(empty.height, 103, 'empty canvas height');
  // A wider text widens the box (rotation spreads width into height too).
  const a = watermarkBillboardCanvasSize(1000, 200);
  const b = watermarkBillboardCanvasSize(2000, 200);
  assert.ok(b.width > a.width, 'wider text must widen the canvas');
  assert.ok(b.height > a.height, 'wider text must also raise the canvas (tilt)');
  assert.ok(a.width > 1000 * 0.8 && a.height > 200, 'canvas must contain the text');
});

test('watermarkBillboardSpriteScale: cap height reads ~50px on a 720p view', () => {
  const { scaleX, scaleY } = watermarkBillboardSpriteScale(999, 706, 144, 40);
  // Aspect is preserved.
  assert.ok(Math.abs(scaleX / scaleY - 999 / 706) < 0.001, 'sprite aspect is not the canvas aspect');
  // With sizeAttenuation off, a sprite of world height S covers
  // S·cot(fov/2)/2 of the viewport height. The cap height is
  // capHeightPx/canvasH of the sprite height — it must come out at 50px
  // on a 720px-tall view.
  const fov = 40;
  const spriteScreenPx = scaleY * (1 / Math.tan((fov * Math.PI) / 360)) / 2 * 720;
  const capScreenPx = spriteScreenPx * (144 / 706);
  assert.ok(Math.abs(capScreenPx - 50) < 0.5, `cap height is ${capScreenPx}px, not ~50px`);
  // A narrower field of view needs a smaller sprite for the same screen size.
  const narrow = watermarkBillboardSpriteScale(999, 706, 144, 20);
  assert.ok(narrow.scaleY < scaleY, 'narrower fov must shrink the sprite');
});

test('the viewer builds a camera-facing billboard sprite, hidden by default', () => {
  const viewer = read('../components/Studio/Curve3DViewer.tsx');
  // A THREE.Sprite always faces the camera — that is the billboard.
  assert.match(viewer, /new THREE\.Sprite\(/, 'viewer creates no Sprite');
  assert.match(viewer, /buildWatermarkBillboardCanvas\(pal\.text\)/, 'watermark does not use the theme ink colour');
  assert.match(viewer, /watermarkBillboardSpriteScale\(/, 'watermark is not scaled by the billboard math');
  // Ghosted, always on top, never occluded by the curve or the box.
  assert.match(viewer, /opacity: WATERMARK_3D_OPACITY/, 'watermark is not ghosted at 50%');
  assert.match(viewer, /depthTest: false/, 'watermark can be occluded by the scene');
  assert.match(viewer, /renderOrder = 20/, 'watermark does not draw above the labels');
  assert.match(viewer, /sizeAttenuation: false/, 'watermark size changes with zoom');
  // Hidden in the live view; exports turn it on.
  assert.match(viewer, /s\.visible = false; \/\/ exports only/, 'watermark is visible in the live view');
  // Rebuilt when the theme changes and when the webfonts arrive (Manrope).
  assert.match(viewer, /safeBuildWatermark\(\)/, 'watermark is not rebuilt on theme change');
  assert.match(viewer, /document\.fonts\.ready\.then/, 'watermark is not rebuilt once fonts load');
  // The sprite is disposed with the scene, not leaked.
  assert.match(viewer, /watermark\.material\.dispose\(\)/, 'watermark material is not disposed');
});

test('the billboard is shown only while an export renders', () => {
  const viewer = read('../components/Studio/Curve3DViewer.tsx');
  // Single picture: visible around the render3DImage call, hidden after.
  assert.match(viewer, /if \(watermark\) watermark\.visible = true;\n\s+try \{\n\s+return await render3DImage/, 'exportImage does not show the watermark');
  // Turntable: every angle renders with the watermark on.
  assert.match(viewer, /renderFrameAt\(null, theta \+ offsetRad, true\)/, 'turntable does not show the watermark per view');
  // Video frames: the watermark flag is threaded through renderFrame.
  assert.match(viewer, /watermark\.visible = showWm/, 'renderFrame does not apply the watermark flag');
  // And restored after the frame, so the live view never flashes it.
  assert.match(viewer, /if \(watermark\) watermark\.visible = prevVisible/, 'renderFrame does not restore watermark visibility');
});
