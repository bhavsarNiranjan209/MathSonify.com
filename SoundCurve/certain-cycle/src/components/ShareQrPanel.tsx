/**
 * QR code panel for the share modal.
 *
 * The encoder is loaded with a dynamic import, so `qrcode-generator` becomes
 * its own chunk that is only fetched the first time someone actually opens the
 * QR panel. Nobody who just copies a text link pays for it.
 *
 * Generation and drawing are entirely client-side — no API call, no backend.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_PX = 256;

export default function ShareQrPanel({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setStatus('loading');
      const { buildQrMatrix, drawQrMatrix } = await import('../utils/qr');
      const matrix = buildQrMatrix(url);
      // Render at device resolution for a crisp, reliably-scannable symbol.
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = CANVAS_PX * dpr;
      canvas.height = CANVAS_PX * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context unavailable');
      ctx.scale(dpr, dpr);
      drawQrMatrix(ctx, matrix, { size: CANVAS_PX });
      setStatus('ready');
      setMessage('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not generate a QR code');
    }
  }, [url]);

  useEffect(() => {
    void render();
  }, [render]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'mathsonify-qr.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, 'image/png');
  };

  const copyImage = async () => {
    const canvas = canvasRef.current;
    // The async clipboard image API is Chromium/Safari only; Firefox has no
    // equivalent, so that case falls back to telling the user to download.
    if (!canvas || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      setMessage('Copying images is not supported here — use Download instead.');
      return;
    }
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('could not read the canvas');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setMessage('Copied to clipboard.');
    } catch {
      setMessage('Could not copy — use Download instead.');
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-sc-text-soft">QR code</label>
      <div className="flex flex-col items-center gap-2">
        <canvas
          ref={canvasRef}
          className="rounded-md bg-white p-1"
          style={{ width: CANVAS_PX, height: CANVAS_PX, imageRendering: 'pixelated' }}
          role="img"
          aria-label={`QR code linking to ${url}`}
        />
        {status === 'loading' && <p className="text-[11px] text-sc-text-faint">Generating…</p>}
        {status === 'error' && <p className="text-[11px] status-error">{message}</p>}
        {message && status === 'ready' && <p className="text-[11px] text-sc-text-faint">{message}</p>}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={download} className="flex-1 btn-ghost text-xs min-h-[44px]">
          Download PNG
        </button>
        <button type="button" onClick={copyImage} className="flex-1 btn-ghost text-xs min-h-[44px]">
          Copy image
        </button>
      </div>
    </div>
  );
}