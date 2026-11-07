import test from 'node:test';
import assert from 'node:assert/strict';
import { darkenHex, lightAccent } from './lightAccent';
import { GUESS_FAMILY_ACCENT } from '../data/guessLibrary';

// WCAG relative luminance + contrast, so the test proves legibility rather
// than pinning magic hex values.
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

test('darkenHex scales channels', () => {
  assert.equal(darkenHex('#FFFFFF'), '#949494'); // 255 * 0.58 = 148
  assert.equal(darkenHex('#000000'), '#000000');
  assert.equal(darkenHex('not-a-color'), 'not-a-color');
});

test('every Guess family accent clears AA on white after darkening', () => {
  for (const [family, accent] of Object.entries(GUESS_FAMILY_ACCENT)) {
    const dark = darkenHex(accent);
    const ratio = contrastOnWhite(dark);
    assert.ok(ratio >= 4.5, `${family} ${accent} -> ${dark} is only ${ratio.toFixed(2)}:1 on white`);
  }
});

test('lightAccent is a no-op in dark mode', () => {
  // getThemeMode() returns 'dark' when document is undefined (node test env).
  assert.equal(lightAccent('#E8B33C'), '#E8B33C');
});
