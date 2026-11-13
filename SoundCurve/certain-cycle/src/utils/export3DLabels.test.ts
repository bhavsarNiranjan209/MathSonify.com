/**
 * v32: 3D export labels — the names on a 3D picture / turntable / video.
 *
 * Mirrors the 2D export rule (v24): a scientist equation gets its scientist
 * name (Instrument Serif italic) + its equation name at the top, and the
 * equation itself at the bottom in the theme colour; a user equation gets
 * NO name at the top, but the equation still appears at the bottom. The
 * layout math is pure (no canvas), so it is unit-tested here; the actual
 * drawing is covered by the headless visual proof.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  drawExport3DLabels,
  export3DEquationColor,
  export3DEquationFont,
  export3DEquationNameFont,
  export3DEquationText,
  export3DLabelLayout,
  export3DScientistFont,
  isScientist3DExport,
  type Export3DLabelInfo,
} from './export3DLabels';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const SCI: Export3DLabelInfo = {
  equation: 'sin(x)',
  equationName: 'Sine Wave',
  scientistName: 'Joseph Fourier',
  colorTheme: 'purple',
  canvasColor: '#080A0C',
};
const USER: Export3DLabelInfo = {
  equation: 'sin(x)',
  equationName: null,
  scientistName: null,
  colorTheme: 'purple',
  canvasColor: '#080A0C',
};

test('isScientist3DExport: only a scientist name makes a scientist export', () => {
  assert.equal(isScientist3DExport(SCI), true);
  assert.equal(isScientist3DExport(USER), false);
  // An equation name alone (a preset, no scientist) is still a user export.
  assert.equal(
    isScientist3DExport({ ...USER, equationName: 'Sine Wave' }),
    false,
    'a preset without a scientist must not get the top names',
  );
});

test('export3DLabelLayout: header ~15%, footer 8%, names follow the 2D proportions', () => {
  const layout = export3DLabelLayout(1280, 720);
  assert.equal(layout.uiScale, 1, '720p short side must give uiScale 1');
  assert.equal(layout.headerH, Math.round(720 * 0.15));
  assert.equal(layout.footerH, Math.max(12, Math.round(720 * 0.08)));
  assert.equal(layout.footerY, 720 - layout.footerH);
  // Top lines follow the 2D video layout (scientist ~5.5%, name ~11.5%).
  assert.ok(Math.abs(layout.scientistNameY - 0.055 * 720) < 0.01);
  assert.ok(Math.abs(layout.equationNameY - 0.115 * 720) < 0.01);
  // The bottom equation sits in the middle of the footer band.
  assert.equal(layout.equationY, 720 - layout.footerH / 2);
});

test('the top names use the 2D fonts', () => {
  // Scientist name: Instrument Serif italic, like the 2D export.
  assert.match(export3DScientistFont(1), /italic 500 22px "Instrument Serif"/);
  // Equation name: Fraunces bold, like the 2D export.
  assert.match(export3DEquationNameFont(1), /700 28px "Fraunces"/);
  // Bottom equation: Instrument Serif italic, like the 2D export.
  assert.match(export3DEquationFont(1), /italic 400 34px "Instrument Serif"/);
});

test('the bottom equation is "f(x) = …" in the theme colour', () => {
  assert.equal(export3DEquationText('sin(x)'), 'f(x) = sin(x)');
  assert.equal(export3DEquationText('  x^2  '), 'f(x) = x^2', 'the equation is trimmed');
  // Purple is the theme the user asked about.
  assert.equal(export3DEquationColor('purple'), '#E879F9');
  assert.equal(export3DEquationColor('blue'), '#7C6CFF');
  assert.equal(export3DEquationColor('green'), '#22FF88');
  assert.equal(export3DEquationColor('white'), '#FFFFFF');
  assert.equal(export3DEquationColor(undefined), '#FFFFFF', 'missing theme falls back to white');
  assert.equal(
    export3DEquationColor('not-a-theme' as never),
    '#FFFFFF',
    'unknown theme falls back to white',
  );
});

test('drawExport3DLabels: scientist gets top names, user gets none (mock canvas)', () => {
  // A minimal mock 2D context that records the fillText calls.
  function mockCtx() {
    const texts: { text: string; x: number; y: number; font: string; fillStyle: string | CanvasGradient | CanvasPattern }[] = [];
    const rects: { x: number; y: number; w: number; h: number }[] = [];
    const ctx = {
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'top' as CanvasTextBaseline,
      font: '',
      fillStyle: '' as string | CanvasGradient | CanvasPattern,
      fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h }); },
      fillText(text: string, x: number, y: number) {
        texts.push({ text, x, y, font: ctx.font, fillStyle: ctx.fillStyle });
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, rects };
  }

  const sci = mockCtx();
  drawExport3DLabels(sci.ctx, 1280, 720, SCI);
  const sciTexts = sci.texts.map((t) => t.text);
  assert.ok(sciTexts.includes('Joseph Fourier'), 'scientist name missing at the top');
  assert.ok(sciTexts.includes('Sine Wave'), 'equation name missing at the top');
  assert.ok(sciTexts.includes('f(x) = sin(x)'), 'bottom equation missing');
  assert.ok(sciTexts.includes('mathsonify.com'), 'domain missing in the footer');
  const sciEq = sci.texts.find((t) => t.text === 'f(x) = sin(x)');
  assert.equal(sciEq?.fillStyle, '#E879F9', 'bottom equation must be the purple theme colour');
  assert.match(sciEq?.font ?? '', /Instrument Serif/, 'bottom equation must be Instrument Serif italic');
  // The header band is drawn (a rect at the top).
  assert.ok(sci.rects.some((r) => r.y === 0 && r.h > 0), 'scientist header band missing');

  const user = mockCtx();
  drawExport3DLabels(user.ctx, 1280, 720, USER);
  const userTexts = user.texts.map((t) => t.text);
  assert.ok(!userTexts.includes('Joseph Fourier'), 'user export must not show a scientist name');
  assert.ok(!userTexts.includes('Sine Wave'), 'user export must not show an equation name at the top');
  assert.ok(userTexts.includes('f(x) = sin(x)'), 'user export still shows the equation at the bottom');
  assert.ok(userTexts.includes('mathsonify.com'), 'domain missing in the footer');
  assert.ok(!user.rects.some((r) => r.y === 0 && r.h > 0), 'user export must not draw a header band');
});

test('v32: the picture, turntable and video exporters all use the shared labels', () => {
  // One shared helper for all three 3D exporters, so they never drift apart.
  assert.match(
    read('../utils/render3DImage.ts'),
    /drawExport3DLabels\(ctx, width, height, \{/,
    'single 3D picture does not use the shared labels',
  );
  assert.match(
    read('../utils/render3DTurntable.ts'),
    /drawExport3DLabels\(ctx, width, height, \{/,
    'turntable 3D picture does not use the shared labels',
  );
  assert.match(
    read('../utils/export3DVideoOffline.ts'),
    /drawExport3DLabels\(ctx, VIDEO_W, VIDEO_H, labelInfo\)/,
    '3D video does not use the shared labels',
  );
  // The video passes the scientist name from the scientist record.
  assert.match(
    read('../utils/export3DVideoOffline.ts'),
    /scientistName: scientist\?\.name \?\? null/,
    '3D video does not pass the scientist name',
  );
});
