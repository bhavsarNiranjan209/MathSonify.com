/**
 * The image-export watermark must never sit on the curve.
 *
 * It used to be drawn dead-centre over the graph — right on top of the curve
 * and the y-axis. It now lives in the bottom-right corner of the graph area,
 * small and quiet, so the graph stays the subject and the watermark stays the
 * signature.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { imageWatermarkRect } from './graphExporter';

test('the image watermark sits in the bottom-right corner, never on the curve', () => {
  for (const scaleFactor of [1, 2]) {
    const exportWidth = 1394;
    const graphH = 900;
    const r = imageWatermarkRect(exportWidth, graphH, scaleFactor);
    // Inside the graph area.
    assert.ok(r.x >= 0 && r.y >= 0, 'watermark escapes the top/left edge');
    assert.ok(r.x + r.w <= exportWidth, 'watermark escapes the right edge');
    assert.ok(r.y + r.h <= graphH, 'watermark escapes the bottom edge');
    // Bottom-right quadrant, not the centre.
    assert.ok(r.x > exportWidth / 2, 'watermark must be on the right half');
    assert.ok(r.y > graphH / 2, 'watermark must be on the bottom half');
    // Hugging the corner: right edge within the 16px margin, bottom likewise.
    assert.ok(exportWidth - (r.x + r.w) <= 16 * scaleFactor + 1, 'watermark drifts from the right edge');
    assert.ok(graphH - (r.y + r.h) <= 16 * scaleFactor + 1, 'watermark drifts from the bottom edge');
    // Nowhere near the centre of the graph.
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    assert.ok(Math.abs(cx - exportWidth / 2) > exportWidth / 4, 'watermark sits near the horizontal centre');
    assert.ok(Math.abs(cy - graphH / 2) > graphH / 4, 'watermark sits near the vertical centre');
  }
});
