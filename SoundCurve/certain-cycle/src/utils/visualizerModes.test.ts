/**
 * Regression test for the garbled mode-tab icons.
 *
 * The icons once lived inline in Visualizer.tsx and were silently destroyed
 * by a Latin-1/UTF-8 double-encoding — the file contained mojibake like
 * 'ðŸ“ˆ' (the bytes of 📈 read as Latin-1) and the tabs rendered garbage
 * ("∂Y~", "â€¢", "â—Z"). These tests pin the icons as real characters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { VISUALIZER_MODES } from './visualizerModes';

test('mode tabs: all five modes, in order, with their labels', () => {
  assert.deepEqual(
    VISUALIZER_MODES.map((m) => [m.id, m.label]),
    [
      ['2d-graph', '2D curve'],
      ['waveform', 'Waveform'],
      ['spectrum', 'Spectrum'],
      ['particles', 'Lissajous'],
      ['mandala', 'Mandala'],
    ],
  );
});

test('mode icons: real emoji/symbols, never Latin-1 mojibake', () => {
  for (const mode of VISUALIZER_MODES) {
    assert.ok(mode.icon.length > 0, `${mode.id} has an icon`);
    for (const ch of mode.icon) {
      const cp = ch.codePointAt(0)!;
      // Every code point is a symbol/emoji (>= U+2000) or the emoji variation
      // selector. Mojibake characters (ð U+00F0, ã U+00E3, â U+00E2, ï
      // U+00EF, €, Ž) all sit below U+2000 and fail this.
      assert.ok(
        cp >= 0x2000 || cp === 0xfe0f,
        `${mode.id} icon ${JSON.stringify(mode.icon)} contains a non-symbol code point U+${cp.toString(16)}`,
      );
    }
  }
});

test('mode icons: the exact characters', () => {
  assert.deepEqual(
    VISUALIZER_MODES.map((m) => m.icon),
    ['📈', '〰️', '📊', '◉', '🏵️'],
  );
});
