/**
 * QR code generation for share links.
 *
 * Thin wrapper around `qrcode-generator` (zero dependencies, ~15 KB). Chosen
 * over the more common `qrcode` package, which drags in pngjs + yargs +
 * dijkstrajs purely for server-side PNG output this client never uses.
 *
 * Deliberately separated from the canvas that renders it: matrix generation is
 * pure maths with no DOM, so it is unit-tested in Node, while the drawing and
 * the download live in the component.
 *
 * Everything is client-side — no API call, no backend.
 */
import qrcode from 'qrcode-generator';

/** A generated symbol: a square grid of dark/light modules. */
export interface QrMatrix {
  /** Side length in modules (always odd). */
  size: number;
  /** True when the module at (row, col) is dark. */
  isDark(row: number, col: number): boolean;
}

/**
 * Encode text as a QR matrix.
 *
 * Error correction `M` (~15% recovery) is the sweet spot here: share URLs are
 * short, and `Q`/`H` would push the symbol into a larger version — more modules
 * on screen for no benefit, since these are printed or shown, not scanned off a
 * scratched sticker.
 *
 * Throws if the text is too long for the largest symbol, rather than silently
 * producing an unscannable code.
 */
export function buildQrMatrix(text: string, errorCorrection: 'L' | 'M' | 'Q' | 'H' = 'M'): QrMatrix {
  if (!text) throw new Error('Cannot build a QR code from empty text');
  // Type number 0 lets the library pick the smallest version that fits.
  const qr = qrcode(0, errorCorrection);
  qr.addData(text);
  qr.make();
  return {
    size: qr.getModuleCount(),
    isDark: (row: number, col: number) => qr.isDark(row, col),
  };
}

/**
 * Paint a matrix onto a 2D context, with a quiet zone.
 *
 * The quiet zone (the blank margin) is not optional: without it most scanners
 * fail to find the finder patterns, so the code looks fine and scans as nothing.
 */
export function drawQrMatrix(
  ctx: CanvasRenderingContext2D,
  matrix: QrMatrix,
  options: { size?: number; quietZoneModules?: number; dark?: string; light?: string } = {},
): void {
  const { size = 220, quietZoneModules = 4, dark = '#000000', light = '#ffffff' } = options;

  const totalModules = matrix.size + quietZoneModules * 2;
  const scale = Math.max(1, Math.floor(size / totalModules));
  const drawn = scale * totalModules;
  // Centre the symbol in the requested square rather than leaving a ragged edge.
  const offset = Math.floor((size - drawn) / 2);

  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = dark;
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.isDark(row, col)) {
        ctx.fillRect(offset + (col + quietZoneModules) * scale, offset + (row + quietZoneModules) * scale, scale, scale);
      }
    }
  }
}