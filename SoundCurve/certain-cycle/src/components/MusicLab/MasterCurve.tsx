import { useEffect, useRef } from 'react';
import { musicLabTransport } from '../../utils/musicLabEngine';

export default function MasterCurve() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let disposed = false;
    let raf = 0;
    let width = 0;
    let height = 0;
    const timeData = new Float32Array(2048);

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const nextWidth = Math.max(0, parent.clientWidth);
      const nextHeight = Math.max(56, Math.min(96, Math.round(nextWidth * 0.12)));
      const nextDpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const pixelWidth = Math.max(1, Math.floor(nextWidth * nextDpr));
      const pixelHeight = Math.max(1, Math.floor(nextHeight * nextDpr));

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight || width !== nextWidth || height !== nextHeight || dpr !== nextDpr) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${nextWidth}px`;
        canvas.style.height = `${nextHeight}px`;
        ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);
      }
      width = nextWidth;
      height = nextHeight;
    }

    function draw() {
      if (disposed) return;
      resize();
      const h = height;

      ctx.clearRect(0, 0, width, h);

      // Background
      ctx.fillStyle = 'rgba(8,14,28,0.85)';
      ctx.fillRect(0, 0, width, h);

      // Grid
      ctx.strokeStyle = 'rgba(148,178,255,0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(width, h / 2); ctx.stroke();

      // Get analyser data
      const analyser = musicLabTransport.getMasterAnalyser();
      const snapshot = musicLabTransport.snapshot();
      const playing = snapshot.state === 'playing';

      if (analyser && playing) {
        analyser.getFloatTimeDomainData(timeData);
        const samples = Math.min(timeData.length, 2048);
        
        // Calculate RMS for amplitude
        let sum = 0;
        for (let i = 0; i < samples; i++) sum += timeData[i] * timeData[i];
        const amp = Math.sqrt(sum / samples);

        // Draw waveform
        ctx.lineWidth = Math.max(1.5, width / 800);
        ctx.strokeStyle = '#e9b444';
        ctx.shadowColor = 'rgba(233,180,68,0.6)';
        ctx.shadowBlur = 8 * Math.min(1, amp * 8);
        ctx.beginPath();
        for (let i = 0; i < samples; i++) {
          const x = (i / (samples - 1)) * width;
          const y = h / 2 - timeData[i] * h * 0.42;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Flat line when paused/stopped
        ctx.strokeStyle = 'rgba(98,212,196,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(width, h / 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    }

    resize();
    raf = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="ml-master-curve" aria-label="Master curve">
      <div className="ml-master-curve__stage">
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </section>
  );
}