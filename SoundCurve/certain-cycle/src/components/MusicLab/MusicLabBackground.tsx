/**
 * Music Lab — studio background.
 *
 * CONTAINMENT: this canvas is absolutely positioned inside the Music Lab shell
 * (never `fixed`) and stops moving the moment playback stops or the component
 * unmounts. Nothing here can reach another page.
 */

import { useEffect, useRef } from 'react';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { usePrefersReducedMotion } from './hooks';

interface Props {
  playing: boolean;
  accent: string;
}

/** Reduced on small screens and for reduced-motion users. */
function particleBudget(width: number): number {
  if (width < 480) return 16;
  if (width < 900) return 28;
  return 48;
}

export default function MusicLabBackground({ playing, accent }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = usePrefersReducedMotion();
  const accentRef = useRef(accent);
  accentRef.current = accent;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let particles: { x: number; y: number; z: number; speed: number }[] = [];
    let spectrum = new Uint8Array(0);
    let energy = 0;
    let time = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const budget = particleBudget(width);
      if (particles.length !== budget) {
        particles = Array.from({ length: budget }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random(),
          speed: 0.08 + Math.random() * 0.3,
        }));
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const hexToRgb = (hex: string) => {
      const value = hex.replace('#', '');
      return {
        r: parseInt(value.slice(0, 2), 16) || 200,
        g: parseInt(value.slice(2, 4), 16) || 160,
        b: parseInt(value.slice(4, 6), 16) || 90,
      };
    };

    const draw = () => {
      // Motion stops entirely when nothing plays: the background is a playback
      // companion, not wallpaper.
      const still = !playingRef.current || reduceMotion;
      if (!still) time += 0.0032;

      const { r, g, b } = hexToRgb(accentRef.current);
      context.clearRect(0, 0, width, height);

      const base = context.createLinearGradient(0, 0, 0, height);
      base.addColorStop(0, 'rgba(6, 10, 18, 0.94)');
      base.addColorStop(0.55, 'rgba(4, 7, 13, 0.9)');
      base.addColorStop(1, 'rgba(2, 4, 8, 0.96)');
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      const auroraX = width * (0.3 + 0.18 * Math.sin(time * 0.7));
      const auroraY = height * (0.28 + 0.1 * Math.cos(time * 0.5));
      const aurora = context.createRadialGradient(
        auroraX, auroraY, 0, auroraX, auroraY, Math.max(width, height) * 0.62,
      );
      aurora.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.1 + energy * 0.08})`);
      aurora.addColorStop(
        0.5,
        `rgba(${Math.round(r * 0.5)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.9)}, 0.05)`,
      );
      aurora.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = aurora;
      context.fillRect(0, 0, width, height);

      context.lineWidth = 1;
      for (let curve = 0; curve < 3; curve += 1) {
        context.beginPath();
        const amplitude = height * (0.06 + curve * 0.035) * (1 + energy * 0.5);
        const frequency = 0.004 + curve * 0.0016;
        const drift = time * (0.5 + curve * 0.35);
        for (let x = 0; x <= width; x += 6) {
          const y = height * (0.5 + curve * 0.06)
            + Math.sin(x * frequency + drift) * amplitude * Math.sin(x * 0.0009 + drift * 0.4);
          if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.035 - curve * 0.008})`;
        context.stroke();
      }

      const glowY = height * (0.72 + 0.03 * Math.sin(time * 0.9));
      const glow = context.createRadialGradient(
        width * 0.5, glowY, 0, width * 0.5, glowY, width * 0.55,
      );
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.05 + energy * 0.05})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      // High-frequency energy drives particle speed.
      const analyser = musicLabTransport.getMasterAnalyser();
      if (analyser && playingRef.current) {
        if (spectrum.length !== analyser.frequencyBinCount) {
          spectrum = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(spectrum);
        let sum = 0;
        let count = 0;
        for (let index = Math.floor(spectrum.length * 0.66); index < spectrum.length; index += 1) {
          sum += spectrum[index];
          count += 1;
        }
        energy = energy * 0.82 + (count ? sum / count / 255 : 0) * 0.18;
      } else {
        energy *= 0.9;
      }

      for (const particle of particles) {
        if (!still) {
          particle.y -= particle.speed * (0.35 + particle.z) * (1 + energy * 2.4);
          if (particle.y < -4) {
            particle.y = height + 4;
            particle.x = Math.random() * width;
          }
        }
        context.beginPath();
        context.arc(particle.x, particle.y, 0.6 + particle.z * 1.5, 0, Math.PI * 2);
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.06 + particle.z * 0.16 + energy * 0.2})`;
        context.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      particles = [];
      spectrum = new Uint8Array(0);
    };
  }, [reduceMotion]);

  return <canvas ref={canvasRef} className="ml-bg-canvas" aria-hidden="true" />;
}