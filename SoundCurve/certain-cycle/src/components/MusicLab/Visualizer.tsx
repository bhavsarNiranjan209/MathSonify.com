/**
 * Music Lab — mathematical visualizer.
 *
 * The waveform and spectrum read the REAL analyser from the audio engine; the
 * equation graph is evaluated from the live harmonic recipe; particles ride the
 * actual amplitude. All animation runs on one rAF loop cancelled on unmount —
 * nothing survives navigation away from Music Lab.
 */

import { useEffect, useRef } from 'react';
import type { MusicLabTrack } from '../../data/musicLabInstruments';
import { getMusicLabInstrument } from '../../data/musicLabInstruments';
import {
  harmonicRecipe,
  evaluateRecipe,
  recipePeak,
  lerpRecipe,
  renderEquation,
  type HarmonicRecipe,
} from '../../utils/musicLabEquation';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { useMusicLabStore, type GraphMode } from '../../store/musicLabStore';
import { usePrefersReducedMotion } from './hooks';

const MODES: { id: GraphMode; label: string }[] = [
  { id: 'waveform', label: 'Waveform' },
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'equation', label: 'Equation' },
  { id: 'lissajous', label: 'Lissajous' },
  { id: 'particles', label: 'Particles' },
];

const ACCENT = '#62d4c4';

function tint(alpha: number): string {
  return `rgba(98, 212, 196, ${alpha})`;
}

export default function Visualizer({ track }: { track: MusicLabTrack | null }) {
  const mode = useMusicLabStore((s) => s.visualizerMode);
  const setMode = useMusicLabStore((s) => s.setVisualizerMode);
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const c = ctx2d;

    let raf = 0;
    let disposed = false;
    let lastEquation = '';
    const spectrum = new Uint8Array(1024);
    const time = new Float32Array(2048);

    /* morph state for the equation graph */
    let shownRecipe: HarmonicRecipe | null = null;
    let targetRecipe: HarmonicRecipe | null = null;
    let morphT = 1;

    /* particles — adaptive to device capability and reduced motion */
    const lowPower = (typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) <= 4);
    const particleCount = reducedMotion ? 0 : lowPower ? 40 : 110;
    const particles = Array.from({ length: particleCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.15 + Math.random() * 0.8,
      speed: 0.2 + Math.random() * 0.9,
      size: 1 + Math.random() * 2,
      wobble: Math.random() * Math.PI * 2,
    }));

    function resize(): void {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const width = parent.clientWidth;
      const height = Math.max(180, Math.min(340, Math.round(width * 0.42)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas!.width !== width * dpr || canvas!.height !== height * dpr) {
        canvas!.width = width * dpr;
        canvas!.height = height * dpr;
        canvas!.style.width = `${width}px`;
        canvas!.style.height = `${height}px`;
      }
    }

    function readAnalyser(): { amp: number } {
      const analyser = (track
        ? musicLabTransport.getTrackAnalyser(track.id)
        : null) ?? musicLabTransport.getMasterAnalyser();
      let amp = 0;
      if (analyser) {
        const bins = Math.min(spectrum.length, analyser.frequencyBinCount);
        analyser.getByteFrequencyData(spectrum.subarray(0, bins) as Uint8Array<ArrayBuffer>);
        const samples = Math.min(time.length, analyser.fftSize);
        analyser.getFloatTimeDomainData(time.subarray(0, samples) as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < samples; i += 1) sum += time[i] * time[i];
        amp = Math.sqrt(sum / samples);
      }
      return { amp };
    }

    function drawEquationCurve(alpha: number): void {
      if (!shownRecipe) return;
      const w = canvas!.width;
      const h = canvas!.height;
      const peak = recipePeak(shownRecipe);
      c.strokeStyle = tint(alpha);
      c.lineWidth = Math.max(1.4, w / 700);
      c.beginPath();
      const steps = 220;
      for (let i = 0; i <= steps; i += 1) {
        const x = (i / steps) * w;
        const phase = (i / steps) * Math.PI * 8;
        const y = h / 2 - (evaluateRecipe(shownRecipe, phase) / peak) * h * 0.38;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }

    function drawWaveform(amp: number, playing: boolean): void {
      const w = canvas!.width;
      const h = canvas!.height;
      c.clearRect(0, 0, w, h);
      c.lineWidth = Math.max(1.2, w / 900);
      c.strokeStyle = tint(0.25);
      c.beginPath();
      c.moveTo(0, h / 2);
      c.lineTo(w, h / 2);
      c.stroke();

      if (!playing || amp <= 0.0001) {
        // Not playing: show the equation curve instead of a dead flat line.
        drawEquationCurve(0.7);
        return;
      }
      const samples = Math.min(time.length, 2048);
      c.lineWidth = Math.max(1.6, w / 600);
      c.strokeStyle = ACCENT;
      c.shadowColor = tint(0.6);
      c.shadowBlur = 8 * Math.min(1, amp * 8);
      c.beginPath();
      for (let i = 0; i < samples; i += 1) {
        const x = (i / (samples - 1)) * w;
        const y = h / 2 - time[i] * h * 0.42;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
      c.shadowBlur = 0;
    }

    function drawSpectrum(playing: boolean): void {
      const w = canvas!.width;
      const h = canvas!.height;
      c.clearRect(0, 0, w, h);
      const bins = Math.min(spectrum.length, 512);
      const barWidth = w / bins;
      for (let i = 0; i < bins; i += 1) {
        const v = playing
          ? spectrum[i] / 255
          : 0.04 + 0.03 * Math.sin(i * 0.3 + Date.now() / 900);
        const barHeight = Math.max(1, v * h * 0.92);
        const hue = 168 + (i / bins) * 80;
        c.fillStyle = `hsla(${hue}, 70%, 55%, ${0.35 + v * 0.6})`;
        c.fillRect(i * barWidth, h - barHeight, Math.max(1, barWidth - 1), barHeight);
      }
    }

    function drawLissajous(playing: boolean): void {
      const w = canvas!.width;
      const h = canvas!.height;
      c.clearRect(0, 0, w, h);
      const size = Math.min(w, h) * 0.4;
      const cx = w / 2;
      const cy = h / 2;
      c.lineWidth = Math.max(1.2, w / 1000);
      c.strokeStyle = tint(0.85);
      c.beginPath();
      const phase = performance.now() / 1000;
      const ratioA = shownRecipe?.partials[1]?.multiple ?? 2;
      const ratioB = shownRecipe?.partials[2]?.multiple ?? 3;
      for (let i = 0; i <= 480; i += 1) {
        const t = (i / 480) * Math.PI * 2;
        const drift = playing ? phase * 0.4 : 0;
        const x = cx + Math.sin(t * (ratioA / 2) + drift) * size;
        const y = cy + Math.sin(t * (ratioB / 2)) * size;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }

    function drawParticles(amp: number, playing: boolean): void {
      const w = canvas!.width;
      const h = canvas!.height;
      c.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const energy = playing ? Math.min(1.6, amp * 6) : 0.15;
      const size = Math.min(w, h) * 0.38 * (1 + energy * 0.12);
      c.fillStyle = tint(0.85);
      for (const p of particles) {
        p.angle += p.speed * 0.004 * (0.4 + energy);
        p.wobble += 0.01;
        const r = size * p.radius * (1 + energy * 0.25) + Math.sin(p.wobble) * 4;
        const x = cx + Math.cos(p.angle) * r;
        const y = cy + Math.sin(p.angle) * r * 0.72;
        c.globalAlpha = 0.25 + energy * 0.5;
        c.beginPath();
        c.arc(x, y, p.size * (1 + energy), 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    function frame(): void {
      if (disposed) return;
      resize();
      const snapshot = musicLabTransport.snapshot();
      const playing = snapshot.state === 'playing';
      const { amp } = readAnalyser();

      // Equation source: the selected track's live recipe, morphed smoothly.
      const instrument = track ? getMusicLabInstrument(track.instrumentId) : null;
      if (instrument && track) {
        const next = harmonicRecipe(instrument, track.params);
        const equation = renderEquation(instrument, track.params);
        if (equation !== lastEquation) {
          if (shownRecipe && !reducedMotion) {
            targetRecipe = next;
            morphT = 0;
          } else {
            shownRecipe = next;
            morphT = 1;
          }
          lastEquation = equation;
        }
        if (morphT < 1 && targetRecipe) {
          morphT = Math.min(1, morphT + 0.06);
          shownRecipe = lerpRecipe(shownRecipe!, targetRecipe, morphT);
        }
      }

      switch (mode) {
        case 'spectrum': drawSpectrum(playing); break;
        case 'equation': {
          c.clearRect(0, 0, canvas!.width, canvas!.height);
          drawEquationCurve(0.9);
          break;
        }
        case 'lissajous': drawLissajous(playing); break;
        case 'particles': drawParticles(amp, playing); break;
        default: drawWaveform(amp, playing);
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [track, mode, reducedMotion]);

  return (
    <section className="ml-visualizer" aria-label="Mathematical visualizer">
      <div className="ml-panel-head">
        <div>
          <p className="ml-eyebrow">Mathematical Visualizer</p>
          <h2>{MODES.find((m) => m.id === mode)?.label}</h2>
        </div>
        <span className="ml-count">{track ? track.name : 'master output'}</span>
      </div>
      <div className="ml-tabs" role="tablist" aria-label="Visualizer mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === mode}
            className={m.id === mode ? 'is-active' : undefined}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="ml-vis-stage">
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
    </section>
  );
}
