import { useEffect, useRef } from 'react';

interface Props {
  playing: boolean;
}

export default function MusicLabBackground({ playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let disposed = false;
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Simple particle system
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0003,
      vy: (Math.random() - 0.5) * 0.0003,
      size: 1 + Math.random() * 2,
      alpha: 0.1 + Math.random() * 0.3,
    }));

    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const nextWidth = parent.clientWidth;
      const nextHeight = parent.clientHeight;
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
      dpr = nextDpr;
    }

    function draw() {
      if (disposed) return;
      resize();
      ctx.clearRect(0, 0, width, height);

      // Dark background
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, width, height);

      // Draw particles
      for (const p of particles) {
        if (playing) {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.x < 0) p.x = 1;
        if (p.x > 1) p.x = 0;
        if (p.y < 0) p.y = 1;
        if (p.y > 1) p.y = 0;

        ctx.globalAlpha = p.alpha * (playing ? 1.5 : 0.5);
        ctx.fillStyle = '#e9b444';
        ctx.beginPath();
        ctx.arc(p.x * width, p.y * height, p.size * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }

    resize();
    raf = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  return <canvas ref={canvasRef} className="ml-bg-canvas" aria-hidden="true" />;
}