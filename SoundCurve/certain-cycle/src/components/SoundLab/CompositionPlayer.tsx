/**
 * CompositionPlayer — primary SoundLab React island.
 *
 * Manages: transport (play/pause/loop/progress), tweak controls (tempo, scale,
 * per-track faders + mute/solo), live canvas visualizer, WAV export, and share.
 *
 * Uses CompositionEngine singleton via the shared AudioContext — no duplicate graph.
 *
 * © 2026 MathSonify — proprietary composition playback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { COMPOSITIONS, GENRES, type Composition } from '../../data/compositions';
import { useSoundLabStore } from '../../store/soundLabStore';
import { compositionEngine } from '../../utils/compositionEngine';
import { MUSICAL_SCALES, type ScaleKey } from '../../utils/equationParser';
import { getCanvasPalette, onThemeChange, type CanvasPalette } from '../../utils/theme';
import { contactHref } from '../../utils/productConfig';

// ── Helpers ─────────────────────────────────────────────────────────────

function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Append a WAV LIST/INFO chunk (ICMT = comment, IART = artist) to an ArrayBuffer. */
function appendWavCopyright(wavBuffer: ArrayBuffer, comment: string, artist = 'MathSonify'): ArrayBuffer {
  const encoder = new TextEncoder();
  const padToEven = (n: number) => (n % 2 === 0 ? n : n + 1);

  // INFO tag helper
  const tag = (id: string, text: string): Uint8Array => {
    const bytes = encoder.encode(text);
    const paddedLen = padToEven(bytes.length + 1); // +1 for null terminator
    const chunk = new Uint8Array(4 + 4 + paddedLen);
    const dv = new DataView(chunk.buffer);
    chunk[0] = id.charCodeAt(0); chunk[1] = id.charCodeAt(1); chunk[2] = id.charCodeAt(2); chunk[3] = id.charCodeAt(3);
    dv.setUint32(4, paddedLen, true);
    chunk.set(bytes, 8);
    // null-terminator already 0 from Uint8Array init
    return chunk;
  };

  const artChunk = tag('IART', artist);
  const cmtChunk = tag('ICMT', comment);
  // LIST chunk: 4 bytes "LIST" + 4 bytes size + 4 bytes "INFO" + tags
  const listDataSize = 4 + artChunk.length + cmtChunk.length; // INFO + tags
  const listChunk = new Uint8Array(8 + listDataSize);
  const listDv = new DataView(listChunk.buffer);
  listChunk[0] = 76; listChunk[1] = 73; listChunk[2] = 83; listChunk[3] = 84; // "LIST"
  listDv.setUint32(4, listDataSize, true);
  listChunk[8] = 73; listChunk[9] = 78; listChunk[10] = 70; listChunk[11] = 79; // "INFO"
  listChunk.set(artChunk, 12);
  listChunk.set(cmtChunk, 12 + artChunk.length);

  // Patch RIFF size (bytes 4..7) and splice LIST before data or append after data
  const orig = new Uint8Array(wavBuffer);
  const riffSize = new DataView(wavBuffer).getUint32(4, true);
  const newRiffSize = riffSize + listChunk.length;

  const out = new ArrayBuffer(12 + 4 + newRiffSize + orig.length - 12);
  const outView = new Uint8Array(out);
  // Copy original RIFF header (12 bytes) but patch size
  outView.set(orig.subarray(0, 4), 0);
  new DataView(out.buffer).setUint32(4, newRiffSize, true);
  outView.set(orig.subarray(8, 12), 8);
  // LIST chunk immediately after RIFF header
  outView.set(listChunk, 12);
  // Rest of original WAV (skip original RIFF header 12 bytes)
  outView.set(orig.subarray(12), 12 + listChunk.length);

  return out.buffer;
}

// ── Main component ──────────────────────────────────────────────────────

interface Props {
  initialId?: string | null;
  /** When false the transport is replaced with a launch-phase access gate. */
  playable?: boolean;
  /** SoundLab launch phase — drives gate copy and CTA routing. */
  phase?: string;
}

export default function CompositionPlayer({ initialId, playable = true, phase = 'full-release' }: Props) {
  const reduceMotion = !!useReducedMotion();

  // ── Store selectors ─────────────────────────────────────────────────
  const selectedId     = useSoundLabStore((s) => s.selectedId);
  const isPlaying      = useSoundLabStore((s) => s.isPlaying);
  const progress       = useSoundLabStore((s) => s.progress);
  const volume         = useSoundLabStore((s) => s.volume);
  const tempoScale     = useSoundLabStore((s) => s.tempoScale);
  const scaleOverride  = useSoundLabStore((s) => s.scaleOverride);
  const trackMix       = useSoundLabStore((s) => s.trackMix);
  const mutedTracks    = useSoundLabStore((s) => s.mutedTracks);
  const soloTrackId    = useSoundLabStore((s) => s.soloTrackId);
  const loop           = useSoundLabStore((s) => s.loop);
  const select         = useSoundLabStore((s) => s.select);
  const setPlaying     = useSoundLabStore((s) => s.setPlaying);
  const setProgress    = useSoundLabStore((s) => s.setProgress);
  const setVolume      = useSoundLabStore((s) => s.setVolume);
  const setTempoScale  = useSoundLabStore((s) => s.setTempoScale);
  const setScaleOverride = useSoundLabStore((s) => s.setScaleOverride);
  const setTrackMix    = useSoundLabStore((s) => s.setTrackMix);
  const setTrackMuted  = useSoundLabStore((s) => s.setTrackMuted);
  const setSolo        = useSoundLabStore((s) => s.setSolo);
  const setLoop        = useSoundLabStore((s) => s.setLoop);
  const resetForComposition = useSoundLabStore((s) => s.resetForComposition);

  // ── Derived state ───────────────────────────────────────────────────
  const composition: Composition = COMPOSITIONS.find((c) => c.id === selectedId) ?? COMPOSITIONS[0];
  const genre = GENRES.find((g) => g.id === composition.genre);

  // ── Refs ────────────────────────────────────────────────────────────
  const progressRef = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const progressVal = useRef(0);
  const paletteRef  = useRef<CanvasPalette>(getCanvasPalette());
  const isPlayingRef = useRef(false);

  // Keep refs in sync with store
  isPlayingRef.current = isPlaying;

  // Throttled store progress to avoid React thrash at 60Hz
  const lastProgressUpdate = useRef(0);
  const throttledProgress = useCallback((p: number) => {
    progressVal.current = p;
    // Update bar via DOM ref directly (no re-render)
    if (progressRef.current) progressRef.current.style.width = `${(p * 100).toFixed(1)}%`;
    if (performance.now() - lastProgressUpdate.current > 100) {
      lastProgressUpdate.current = performance.now();
      setProgress(p);
    }
  }, [setProgress]);

  // ── Init / hash deep-link ──────────────────────────────────────────
  useEffect(() => {
    if (initialId) {
      const comp = COMPOSITIONS.find((c) => c.id === initialId);
      if (comp) {
        select(comp.id);
        resetForComposition(comp.tracks.map((t) => t.id));
      }
    }
  }, [initialId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lifecycle ──
  // Ensure no audio / graph loop survives if the island is unmounted (e.g. a
  // future client-side route swap or StrictMode remount). stop() cancels the
  // RAF + timeouts and disconnects every active node, so the analyser never
  // keeps feeding a dangling visualizer after we leave.
  useEffect(() => {
    return () => {
      compositionEngine.stop();
      useSoundLabStore.getState().setPlaying(false);
    };
  }, []);

  // ── Theme watcher ──────────────────────────────────────────────────
  useEffect(() => onThemeChange(() => { paletteRef.current = getCanvasPalette(); }), []);

  // ── Canvas visualizer (spectrum + waveform minimal) ────────────────
  useEffect(() => {
    let raf: number;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.save();
      ctx.scale(dpr, dpr);
      const p = paletteRef.current;
      ctx.fillStyle = p.canvas;
      ctx.fillRect(0, 0, w, h);

      const analyser = compositionEngine.getAnalyser();
      const playing = isPlaying;

      if (analyser && playing) {
        // Spectrum bars (bottom layer)
        const bufLen = analyser.frequencyBinCount;
        const dataArr = new Uint8Array(bufLen);
        analyser.getByteFrequencyData(dataArr);
        const barCount = 48;
        const barW = (w / barCount) * 0.7;
        const step = Math.floor(bufLen / barCount);
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += dataArr[i * step + j] || 0;
          const val = sum / step;
          const barH = (val / 255) * h * 0.6;
          const x = i * (w / barCount) + (w / barCount - barW) / 2;
          const y = h - barH;
          const grad = ctx.createLinearGradient(0, h, 0, y);
          grad.addColorStop(0, tint(p.live, 0.08));
          grad.addColorStop(1, tint(p.live, 0.45));
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barW, barH);
        }
        // Waveform line (top layer)
        analyser.getByteTimeDomainData(dataArr);
        ctx.beginPath();
        ctx.strokeStyle = p.live;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = p.live;
        ctx.shadowBlur = 10;
        const slice = w / bufLen;
        let x = 0;
        for (let i = 0; i < bufLen; i++) {
          const y = (dataArr[i] / 128) * (h / 2);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          x += slice;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Idle — faint baseline
        ctx.strokeStyle = tint(p.curve, 0.15);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      ctx.restore();
    };
    let cancelled = false;
    const renderLoop = () => {
      if (cancelled) return;
      draw();
      raf = requestAnimationFrame(renderLoop);
    };

    // Drive the visualizer only while audio is actually playing. When idle,
    // paint a single static baseline frame — no perpetual 60fps loop in a
    // silent / hidden tab.
    if (isPlaying) {
      raf = requestAnimationFrame(renderLoop);
    } else {
      draw();
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  // ── Keyboard: Space = toggle play, Esc = stop ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest('input, textarea, select')) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); togglePlay(); }
      if (e.code === 'Escape') { stopPlayback(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }); // intentionally no deps — reads latest state via refs/closures

  // ── Transport helpers ──────────────────────────────────────────────

  const effectiveGain = useCallback((trackId: string, defaultMix: number): number => {
    const muted = mutedTracks[trackId];
    const isSoloed = soloTrackId !== null;
    if (muted) return 0;
    if (isSoloed && soloTrackId !== trackId) return 0;
    return trackMix[trackId] ?? defaultMix;
  }, [mutedTracks, soloTrackId, trackMix]);

  const buildTrackMixOverrides = useCallback(() => {
    const overrides: Record<string, number> = {};
    for (const t of composition.tracks) {
      overrides[t.id] = effectiveGain(t.id, t.mix);
    }
    return overrides;
  }, [composition, effectiveGain]);

  const restartPlayback = useCallback(async () => {
    const opts = {
      volume,
      tempoScale,
      scaleOverride,
      trackMixOverrides: buildTrackMixOverrides(),
      loop,
    };
    await compositionEngine.play(composition, opts, throttledProgress, () => setPlaying(false));
    setPlaying(true);
  }, [composition, volume, tempoScale, scaleOverride, loop, buildTrackMixOverrides, throttledProgress, setPlaying]);

  const togglePlay = useCallback(async () => {
    if (isPlayingRef.current) {
      compositionEngine.stop();
      setPlaying(false);
    } else {
      await restartPlayback();
    }
  }, [restartPlayback, setPlaying]);

  const stopPlayback = useCallback(() => {
    compositionEngine.stop();
    setPlaying(false);
  }, [setPlaying]);

  // ── Tweaks (apply immediately if playing) ──────────────────────────

  const handleVolumeChange = useCallback((val: number) => {
    setVolume(val);
    compositionEngine.setVolume(val);
  }, [setVolume]);

  const handleTempoChange = useCallback((val: number) => {
    setTempoScale(val);
    if (isPlayingRef.current) restartPlayback();
  }, [setTempoScale, restartPlayback]);

  const handleScaleChange = useCallback((val: ScaleKey | null) => {
    setScaleOverride(val);
    if (isPlayingRef.current) restartPlayback();
  }, [setScaleOverride, restartPlayback]);

  const handleTrackMixChange = useCallback((trackId: string, val: number) => {
    setTrackMix(trackId, val);
    compositionEngine.setTrackMix(trackId, val);
  }, [setTrackMix]);

  const handleMuteToggle = useCallback((trackId: string) => {
    const next = !mutedTracks[trackId];
    setTrackMuted(trackId, next);
    // Update engine gain for all tracks (solo/mute logic)
    for (const t of composition.tracks) {
      compositionEngine.setTrackMix(t.id, effectiveGain(t.id, t.mix));
    }
  }, [mutedTracks, setTrackMuted, composition, effectiveGain]);

  const handleSoloToggle = useCallback((trackId: string) => {
    const next = soloTrackId === trackId ? null : trackId;
    setSolo(next);
    for (const t of composition.tracks) {
      compositionEngine.setTrackMix(t.id, effectiveGain(t.id, t.mix));
    }
  }, [soloTrackId, setSolo, composition, effectiveGain]);

  // ── Loop toggle ────────────────────────────────────────────────────
  const handleLoopToggle = useCallback(() => {
    const next = !loop;
    setLoop(next);
    if (isPlayingRef.current) restartPlayback();
  }, [loop, setLoop, restartPlayback]);

  // ── Export WAV ─────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await compositionEngine.renderCompositionToWav(composition, {
        volume,
        tempoScale,
        scaleOverride,
        trackMixOverrides: buildTrackMixOverrides(),
      });
      // Append copyright metadata
      const rawBuffer = await blob.arrayBuffer();
      const patched = appendWavCopyright(rawBuffer, composition.copyright, 'MathSonify');
      const finalBlob = new Blob([patched], { type: 'audio/wav' });
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mathsonify-${composition.id}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('WAV export failed:', err);
    } finally {
      setExporting(false);
    }
  }, [composition, volume, tempoScale, scaleOverride, buildTrackMixOverrides, exporting]);

  // ── Share (copy deep-link) ─────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/soundlab#${composition.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: create temp input
      const inp = document.createElement('input');
      inp.value = url;
      document.body.appendChild(inp);
      inp.select();
      document.execCommand('copy');
      document.body.removeChild(inp);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [composition.id]);

  // ── Elapsed time display ───────────────────────────────────────────
  const effectiveDuration = composition.durationSec / Math.min(2, Math.max(0.5, tempoScale));
  const elapsed = progress * effectiveDuration;

  // ── Render ─────────────────────────────────────────────────────────

  // ── Launch-phase access gate ──
  // All hooks have run above; an early return is safe and swaps the live
  // transport for a read-only gate panel when playback is disabled.
  if (!playable) {
    // Tint the accent to ~55% opacity. Composition accents are hex strings
    // (e.g. "#4f46e5"); we expand 3-digit forms to 6 and append an alpha
    // channel so the border stays faithful to the accent in both themes.
    // We render the panel directly (no `display: none`) so it paints on
    // first paint and SSR/hydration stays consistent.
    const hex = composition.accent.replace("#", "");
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const tintedAccent = `#${full}8C`;
    return (
      <div
        className="soundlab-player panel overflow-hidden"
        style={{ borderTop: `2px solid ${tintedAccent}` }}
      >
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-sc-text">{composition.title}</h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-sc-accent/30 bg-sc-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-sc-accent">
            © Proprietary
          </span>
        </div>
        <div className="px-5 pt-6 pb-5 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-sc-accent/10 border border-sc-accent/30 mb-3">
            <svg className="w-5 h-5 text-sc-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0l-4 4m4-4l4 4M5 12h14" />
            </svg>
          </div>
          {phase === 'teaser' ? (
            <p className="text-sm text-sc-text-soft max-w-sm mx-auto">
              SoundLab is in preview. Playback opens for early-access listeners soon.
            </p>
          ) : phase === 'premium' ? (
            <p className="text-sm text-sc-text-soft max-w-sm mx-auto">
              This composition is reserved for MathSonify Premium subscribers.
            </p>
          ) : (
            <p className="text-sm text-sc-text-soft max-w-sm mx-auto">
              Playback is locked while this feature is being prepared.
            </p>
          )}
        </div>
        <div className="px-5 pb-5 border-t border-sc-line/10">
          <a
            href={phase === 'teaser' ? contactHref() : '/pricing'}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs"
          >
            {phase === 'teaser' ? 'Request early access' : 'Unlock SoundLab →'}
          </a>
          <a href="/pricing" className="ml-3 btn-ghost px-4 py-2 text-xs">
            View plans
          </a>
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div
      className="soundlab-player panel overflow-hidden"
      style={{ borderTop: `2px solid ${tint(composition.accent, 0.55)}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-sc-line/20 bg-sc-surface px-2 py-0.5 text-[11px] font-mono text-sc-text-soft">
              <span aria-hidden="true">{genre?.emoji ?? '🎵'}</span>
              {genre?.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-sc-accent/30 bg-sc-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-sc-accent">
              © Proprietary
            </span>
          </div>
          <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-sc-text">{composition.title}</h2>
          <p className="mt-1 text-xs text-sc-text-soft">{composition.description}</p>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] text-sc-text-faint">
          <div>{composition.bpm} BPM</div>
          <div className="uppercase">{scaleOverride ?? composition.key}</div>
          <div>{composition.durationSec}s</div>
        </div>
      </div>

      {/* Transport */}
      <div className="px-5 py-3 flex items-center gap-3 border-t border-sc-line/10">
        {/* Play / Pause */}
        <button
          type="button"
          onClick={togglePlay}
          className="soundlab-play-btn flex items-center justify-center w-11 h-11 rounded-full bg-sc-accent text-sc-on-accent hover:brightness-110 transition shrink-0"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        {/* Progress bar */}
        <div className="flex-1 min-w-0">
          <div className="w-full h-1.5 rounded-full bg-sc-line/15 overflow-hidden relative">
            <div ref={progressRef} className="h-full rounded-full bg-sc-live transition-none" style={{ width: 0 }} />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] text-sc-text-faint mt-1">
            <span>{fmtTime(elapsed)}</span>
            <span>{fmtTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Loop */}
        <button
          type="button"
          onClick={handleLoopToggle}
          className={`w-8 h-8 rounded-md border flex items-center justify-center transition text-xs ${loop ? 'bg-sc-live/15 border-sc-live/40 text-sc-live' : 'border-sc-line/20 text-sc-text-faint hover:text-sc-text hover:border-sc-accent'}`}
          aria-label={`Loop ${loop ? 'on' : 'off'}`}
          title={`Loop ${loop ? 'on' : 'off'}`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
        </button>
      </div>

      {/* Live badge */}
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            className="absolute right-5 top-4 z-10 flex items-center gap-1.5 px-2 py-1 rounded-md bg-sc-live/15 border border-sc-live/40"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sc-live animate-ping" />
            <span className="text-[10px] font-mono text-sc-live uppercase tracking-wider font-semibold">Live</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas visualizer */}
      <div className="relative w-full h-[120px] sm:h-[140px] border-t border-sc-line/10">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Tweak controls */}
      <div className="px-5 py-4 border-t border-sc-line/10 space-y-4">
        {/* Tempo + Scale row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Tempo */}
          <div className="flex-1 min-w-0">
            <label className="block text-[11px] font-mono text-sc-text-faint mb-1">Tempo</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.01}
                value={tempoScale}
                onChange={(e) => handleTempoChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5"
              />
              <span className="font-mono text-[11px] text-sc-text-soft w-10 text-right">{tempoScale.toFixed(2)}×</span>
            </div>
          </div>

          {/* Scale override */}
          <div className="w-full sm:w-40">
            <label className="block text-[11px] font-mono text-sc-text-faint mb-1">Scale</label>
            <select
              value={scaleOverride ?? ''}
              onChange={(e) => handleScaleOverride(e.target.value ? (e.target.value as ScaleKey) : null)}
              className="w-full h-8 rounded-md border border-sc-line/20 bg-sc-surface text-xs text-sc-text px-2"
            >
              <option value="">Original</option>
              {(Object.keys(MUSICAL_SCALES) as ScaleKey[]).map((k) => (
                <option key={k} value={k}>{MUSICAL_SCALES[k].name}</option>
              ))}
            </select>
          </div>

          {/* Volume */}
          <div className="w-full sm:w-32">
            <label className="block text-[11px] font-mono text-sc-text-faint mb-1">Volume</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="flex-1 h-1.5"
              />
              <span className="font-mono text-[11px] text-sc-text-soft w-8 text-right">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Per-track faders */}
        <div className="space-y-2">
          <div className="text-[11px] font-mono text-sc-text-faint uppercase tracking-wider">Tracks</div>
          {composition.tracks.map((track) => {
            const effective = effectiveGain(track.id, track.mix);
            const isMuted = mutedTracks[track.id];
            const isSoloed = soloTrackId === track.id;
            return (
              <div
                key={track.id}
                className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${isMuted ? 'bg-sc-surface/50' : 'bg-transparent'}`}
              >
                <span className="shrink-0 w-24 truncate text-[11px] font-mono text-sc-text-soft">{track.label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={trackMix[track.id] ?? track.mix}
                  onChange={(e) => handleTrackMixChange(track.id, parseFloat(e.target.value))}
                  className="flex-1 h-1.5"
                  disabled={isMuted}
                />
                <span className="w-8 text-right font-mono text-[10px] text-sc-text-faint">
                  {Math.round((trackMix[track.id] ?? track.mix) * 100)}
                </span>
                {/* Mute */}
                <button
                  type="button"
                  onClick={() => handleMuteToggle(track.id)}
                  className={`w-6 h-6 rounded text-[10px] font-bold border transition flex items-center justify-center ${isMuted ? 'bg-red-500/15 text-red-400 border-red-500/40' : 'border-sc-line/20 text-sc-text-faint hover:text-sc-text hover:border-sc-accent'}`}
                  aria-label={`Mute ${track.label}`}
                >
                  M
                </button>
                {/* Solo */}
                <button
                  type="button"
                  onClick={() => handleSoloToggle(track.id)}
                  className={`w-6 h-6 rounded text-[10px] font-bold border transition flex items-center justify-center ${isSoloed ? 'bg-sc-live/15 text-sc-live border-sc-live/40' : 'border-sc-line/20 text-sc-text-faint hover:text-sc-text hover:border-sc-accent'}`}
                  aria-label={`Solo ${track.label}`}
                >
                  S
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Equation read-only chips + Export/Share */}
      <div className="px-5 pb-5 pt-3 border-t border-sc-line/10 space-y-3">
        {/* Read-only equations */}
        <div className="space-y-1">
          {composition.tracks.map((track) => (
            <div
              key={track.id}
              className="code-mat flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
              title="Proprietary equation — listening only"
            >
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider"
                style={{ backgroundColor: tint(composition.accent, 0.1), color: composition.accent }}
              >
                {track.label}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sc-text/80">{track.equation}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="btn-ghost px-3.5 py-2 text-xs disabled:opacity-50"
          >
            {exporting ? 'Rendering…' : '⬇ WAV'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="btn-ghost px-3.5 py-2 text-xs"
          >
            {copied ? '✓ Link copied' : '🔗 Share'}
          </button>
          <span className="ml-auto text-[10px] font-mono text-sc-text-faint">{composition.copyright}</span>
        </div>
      </div>
    </div>
  );
}