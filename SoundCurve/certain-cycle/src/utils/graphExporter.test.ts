/**
 * The image export's size follows the chosen orientation.
 *
 * The owner reported picking landscape and getting a portrait file. The
 * video path was already correct; the image had no orientation control at
 * all, so it always came out in the Studio canvas's shape. v22 gives the
 * image the same orientation choice: the long side of the display becomes
 * the long side of the file, so a portrait pick really is a portrait file
 * and a landscape pick really is landscape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { imageExportSize } from './graphExporter';

test('the image size follows the chosen orientation', () => {
  // A landscape display (697x458 at 2x): landscape keeps the display
  // aspect, portrait swaps it.
  const land = imageExportSize(697, 458, 2, 'landscape');
  assert.deepEqual(land, { exportWidth: 1394, graphH: 916 });
  assert.ok(land.exportWidth > land.graphH, 'landscape file is not wider than tall');

  const port = imageExportSize(697, 458, 2, 'portrait');
  assert.deepEqual(port, { exportWidth: 916, graphH: 1394 });
  assert.ok(port.graphH > port.exportWidth, 'portrait file is not taller than wide');

  // A portrait display: the long side is still the long side of the file.
  const portDisplay = imageExportSize(360, 640, 2, 'portrait');
  assert.deepEqual(portDisplay, { exportWidth: 720, graphH: 1280 });
  const landDisplay = imageExportSize(360, 640, 2, 'landscape');
  assert.deepEqual(landDisplay, { exportWidth: 1280, graphH: 720 });
  assert.ok(landDisplay.exportWidth > landDisplay.graphH, 'landscape pick on a portrait display is not landscape');
});

test('the image size scales with the scale factor', () => {
  const one = imageExportSize(697, 458, 1, 'landscape');
  assert.deepEqual(one, { exportWidth: 697, graphH: 458 });
  const three = imageExportSize(697, 458, 3, 'landscape');
  assert.deepEqual(three, { exportWidth: 2091, graphH: 1374 });
});
