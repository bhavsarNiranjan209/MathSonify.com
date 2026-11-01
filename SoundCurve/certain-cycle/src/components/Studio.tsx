import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useStudioStore, type InstrumentType, type SonificationMode } from '../store/studioStore';
import { useTranslation } from '../i18n/index';
import EquationInput from './EquationInput';
import PasteCard from './paste-card/PasteCard';
import Visualizer from './Visualizer';
import GraphPanel from './GraphPanel';
import AudioControls from './AudioControls';
import PresetDrawer from './PresetDrawer';
import ShareModal from './ShareModal';
import ShortcutModal from './ShortcutModal';
import ExportModal from './ExportModal';
import { audioEngine } from '../utils/audioEngine';
import { resolveActiveCurve } from '../utils/activeCurve';
import StudioErrorBoundary from './Studio/StudioErrorBoundary';

import { getEquationOfTheDay } from '../lib/equationOfTheDay';
import { sortPresets, type EquationPreset } from '../data/presets';
import { parseEquation } from '../utils/equationParser';

// The 3D viewer is no longer dev-only: it is a mode of the shared GraphPanel and
// ships to real users. The old `Curve3DDevPanel` harness has been retired — the
// panel itself is the single reusable implementation.

// The Create page is a `client:only` island, so Astro ships no markup for it.
// Without a boundary, any throw inside the studio unmounts the entire island
// and the visitor gets a blank page under a working nav bar. The boundary
// keeps the failure contained and shows the real message.
export default function Studio() {
  return (
    <StudioErrorBoundary area="MathSonify Studio">
      <StudioInner />
    </StudioErrorBoundary>
  );
}

function StudioInner() {
  const { t } = useTranslation();
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const setPlaying = useStudioStore((s) => s.setPlaying);
  const setProgress = useStudioStore((s) => s.setProgress);

  const equation = useStudioStore((s) => s.equation);
  const setEquation = useStudioStore((s) => s.setEquation);
  const setOriginalEquation = useStudioStore((s) => s.setOriginalEquation);
  const instrument = useStudioStore((s) => s.instrument);
  const setInstrument = useStudioStore((s) => s.setInstrument);
  const sonificationMode = useStudioStore((s) => s.sonificationMode);
  const setSonificationMode = useStudioStore((s) => s.setSonificationMode);
  const duration = useStudioStore((s) => s.duration);
  const setDuration = useStudioStore((s) => s.setDuration);
  const minX = useStudioStore((s) => s.minX);
  const setMinX = useStudioStore((s) => s.setMinX);
  const maxX = useStudioStore((s) => s.maxX);
  const setMaxX = useStudioStore((s) => s.setMaxX);
  const speed = useStudioStore((s) => s.speed);
  const volume = useStudioStore((s) => s.volume);
  const loop = useStudioStore((s) => s.loop);
  const hasPendingChanges = useStudioStore((s) => s.hasPendingChanges);
  const setHasPendingChanges = useStudioStore((s) => s.setHasPendingChanges);
  const minFreq = useStudioStore((s) => s.minFreq);
  const maxFreq = useStudioStore((s) => s.maxFreq);
  const scale = useStudioStore((s) => s.scale);
  const isCustomCurve = useStudioStore((s) => s.isCustomCurve);
  const splineControlPoints = useStudioStore((s) => s.splineControlPoints);
  const splineHistory = useStudioStore((s) => s.splineHistory);
  const splineHistoryIndex = useStudioStore((s) => s.splineHistoryIndex);
  const canUndo = useStudioStore((s) => s.splineHistoryIndex > 0);
  const canRedo = useStudioStore((s) => s.splineHistoryIndex < s.splineHistory.length - 1);
  const undoSpline = useStudioStore((s) => s.undoSpline);
  const redoSpline = useStudioStore((s) => s.redoSpline);
  const inputMode = useStudioStore((s) => s.inputMode);

  const setEquationOfTheDay = useStudioStore((s) => s.setEquationOfTheDay);

  const graphSectionRef = useRef<HTMLDivElement>(null);
  const wasPlayingRef = useRef(false);

  // Stop audio on unmount / tab hide / page navigation
  useEffect(() => {
    return () => {
      audioEngine.stop();
    };
  }, []);

  // Mobile: scroll to graph when playback starts
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current && typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        document.getElementById('graph-area')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Read URL query params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const eqParam = urlParams.get('eq');
    const instParam = urlParams.get('inst');
    const modeParam = urlParams.get('mode');
    const durParam = urlParams.get('dur');
    const minXParam = urlParams.get('minX');
    const maxXParam = urlParams.get('maxX');

    if (eqParam) {
      setEquation(eqParam);
      setOriginalEquation(eqParam);
    }
    if (instParam) setInstrument(instParam as InstrumentType);
    if (modeParam) setSonificationMode(modeParam as SonificationMode);
    if (durParam) setDuration(parseInt(durParam) || 4);
    if (minXParam) setMinX(parseFloat(minXParam) || -6.28);
    if (maxXParam) setMaxX(parseFloat(maxXParam) || 6.28);

    // Restore active scientist context from URL (survives reload / link)
    const sciParam = urlParams.get('sci');
    const eqNameParam = urlParams.get('eqName');
    if (sciParam && eqNameParam) {
      // Import dynamically to avoid SSR issues — already safely wrapped by client:only
      import('../data/scientists').then(({ SCIENTISTS }) => {
        const sci = SCIENTISTS.find((s) => s.id === sciParam);
        if (sci) {
          useStudioStore.getState().setActiveScientist(sci, eqNameParam);
        }
      }).catch(() => {});
    }

    // Equation of the Day: when no explicit eq/sci, open with a deterministic pick.
    if (!eqParam && !sciParam) {
      // Build the usable list ONCE: presets that parse and give a finite curve
      // on their default domain (Funny Questions included).
      const usable: EquationPreset[] = [];
      const sorted = sortPresets();
      for (const preset of sorted) {
        const res = parseEquation(preset.equation);
        if (!res.success || !res.evaluate) continue;
        const { minX, maxX } = preset.recommendedSettings;
        let finite = false;
        try {
          for (const tp of [minX, (minX + maxX) / 2, maxX]) {
            const yy = res.evaluate(tp);
            if (typeof yy === 'number' && Number.isFinite(yy)) { finite = true; break; }
          }
        } catch {
          finite = false;
        }
        if (finite) usable.push(preset);
      }

      // DEV-only preview date
      let now: number = Date.now();
      if (import.meta.env.DEV) {
        const eodDate = urlParams.get('eodDate');
        if (eodDate && /^\d{4}-\d{2}-\d{2}$/.test(eodDate)) {
          const [y, m, d] = eodDate.split('-').map(Number);
          now = new Date(y, m - 1, d, 12, 0, 0).getTime();
        }
      }

      const pick = getEquationOfTheDay(now, usable) as EquationPreset | undefined;
      if (pick) {
        const s = useStudioStore.getState();
        s.setEquation(pick.equation);
        s.setOriginalEquation(pick.equation);
        const rs = pick.recommendedSettings;
        if (rs.minX !== undefined) s.setMinX(rs.minX);
        if (rs.maxX !== undefined) s.setMaxX(rs.maxX);
        if (rs.instrument) s.setInstrument(rs.instrument as InstrumentType);
        if (rs.sonificationMode) s.setSonificationMode(rs.sonificationMode as SonificationMode);
        if (rs.duration) s.setDuration(rs.duration);
        if (rs.minFreq) s.setMinFreq(rs.minFreq);
        if (rs.maxFreq) s.setMaxFreq(rs.maxFreq);
        if (rs.scale) s.setScale(rs.scale as any);
        s.setActiveScientist(null, pick.name);
        s.setEquationOfTheDay(pick.name);
      }
    }
  }, [setEquation, setOriginalEquation, setInstrument, setSonificationMode, setDuration, setMinX, setMaxX]);

  // One deliberate hero moment on load: the studio shell eases in with a gentle
  // stagger. Motion elsewhere only follows real user actions (Play/Stop, taps).
  //
  // These variants start at `opacity: 0` and rely on framer-motion animating
  // them to `show`. That is a real availability risk: the studio is a
  // `client:only` island, so if the animation never runs — a reduced-motion
  // edge case, a framer-motion/React version mismatch, or a tab that mounts
  // while the document is hidden — the entire page stays at opacity 0 and the
  // visitor sees nothing but the navbar.
  //
  // The fix is to start VISIBLE and only animate upward from a small offset.
  // A failed or skipped animation now costs a 16px nudge instead of the whole
  // product. The entrance still reads the same; it just can no longer hide the
  // content.
  const reduceMotion = !!useReducedMotion();

  const entranceContainer = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: reduceMotion ? 0 : 0.04 },
    },
  };

  const entranceItem = {
    // Opacity starts at 1 on purpose — see the note above. `initial={false}`
    // on the container below also skips the "hidden" state entirely.
    hidden: { opacity: 1, y: reduceMotion ? 0 : 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduceMotion ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  // Keyboard shortcut: ? opens shortcut modal (with guards)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || active?.isContentEditable;
      if (isInput || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        useStudioStore.getState().setShortcutModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          audioEngine.stop();
          setPlaying(false);
          setProgress(0, 0, 0);
          setHasPendingChanges(false);
        } else {
          setHasPendingChanges(false);
          // Same resolver the exporter uses, so what you hear on Play is the
          // exact curve the export will capture.
          //
          // resolveActiveCurve THROWS on an unparseable equation (it used to be
          // a rejected promise from audioEngine.play, which the .catch() below
          // absorbed). It has to be inside the async boundary or the throw
          // escapes this event listener and tears down the handler.
          const playPromise = (async () => {
            const s = useStudioStore.getState();
            const curve = resolveActiveCurve({
              equation: s.equation,
              minX: s.minX,
              maxX: s.maxX,
              isCustomCurve: s.isCustomCurve,
              splineControlPoints: s.splineControlPoints,
            });
            await audioEngine.playPoints(
              curve.points,
              s.minX,
              s.maxX,
              s.minFreq,
              s.maxFreq,
              s.duration / s.speed,
              s.volume,
              s.instrument,
              s.sonificationMode,
              s.loop,
              s.scale,
              (prog, cx, cy, readout) => { setProgress(prog, cx, cy, readout); },
              () => { setPlaying(false); setProgress(0, 0, 0); }
            );
          })();
          playPromise.then(() => setPlaying(true)).catch((err) => {
            // Surface it the same way the export modal would, and make sure a
            // failed start never leaves the UI stuck in a "playing" state.
            console.error(err);
            setPlaying(false);
            setProgress(0, 0, 0);
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isCustomCurve, splineControlPoints, equation, minX, maxX, minFreq, maxFreq, duration, speed, volume, instrument, sonificationMode, loop, scale, setPlaying, setProgress]);

  return (
    <motion.div
      className="min-h-screen pt-20 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto"
      // `initial={false}` mounts straight into the visible state. The entrance
      // still animates (the y-offset is the only thing that moves), but the
      // content can never be left stuck at opacity 0 if the animation is
      // skipped or never starts.
      initial={false}
      animate="show"
      variants={entranceContainer}
    >
      {/* Studio Header */}
      <motion.div variants={entranceItem} className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-xs font-mono text-sc-accent">{t('studio.interactiveLabel')}</span>
            <span className="text-xs font-mono text-sc-text-faint">{t('studio.version')}</span>
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-sc-text tracking-tight">
            MathSonify <em className="text-sc-accent">Studio</em>
          </h1>
          <p className="text-sm text-sc-text-soft mt-1 max-w-xl leading-relaxed">
            {t('studio.subtitle')}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <div className="panel-inset px-3 py-1.5 text-xs font-mono text-sc-text-faint flex items-center gap-2 min-h-[44px]">
            <kbd className="px-1.5 py-0.5 rounded bg-sc-accent text-sc-on-accent font-semibold">Space</kbd>
            <span>{t('studio.spaceHint')}</span>
            <kbd className="px-1.5 py-0.5 rounded bg-sc-surface border text-sc-text-faint font-mono hidden sm:inline-block">?</kbd>
            <span className="hidden sm:inline text-xs text-sc-text-faint">{t('studio.shortcutsHint') || 'Shortcuts'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => undoSpline()}
              className="rounded-md bg-sc-surface hover:bg-sc-surface-active transition-colors disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 text-xs font-mono text-sc-text"
              disabled={!canUndo}
              aria-label={canUndo ? t('studio.undo') : t('studio.cannotUndo')}
            >
              {t('studio.undo')}
            </button>
            <button
              onClick={() => redoSpline()}
              className="rounded-md bg-sc-surface hover:bg-sc-surface-active transition-colors disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 text-xs font-mono text-sc-text"
              disabled={!canRedo}
              aria-label={canRedo ? t('studio.redo') : t('studio.cannotRedo')}
            >
              {t('studio.redo')}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Studio Grid */}
      <motion.div variants={entranceItem} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Equation Input & Audio Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6 w-full min-w-0">
          <PasteCard />
          <div className="panel p-5 sm:p-6 border-t-2 border-sc-accent/60">
            <EquationInput />
          </div>

          <div className="panel p-5 sm:p-6 border-t-2 border-sc-accent/40">
            <AudioControls />
          </div>
        </div>

        {/* Right Column: the shared GraphPanel (2 cols of 12 on lg) */}
        <div id="graph-area" ref={graphSectionRef} className="lg:col-span-7 space-y-6 w-full min-w-0">
          {/* ONE shared panel owns the 2D/3D toggle. The Studio's own toolbar
              (waveform, spectrum, Lissajous, mandala) lives inside the 2D branch;
              3D is a MODE of this panel, not a separate card or page. */}
          <GraphPanel label={equation || 'curve'}>
            <Visualizer />
          </GraphPanel>

          <div className="p-4 rounded-sc-md bg-sc-surface/60 border border-sc-line/15 text-xs text-sc-text-soft flex items-start gap-3">
            <span className="text-base">💡</span>
            <div>
              <span className="text-sc-text font-medium">{t('studio.howMathTitle')}</span> {t('studio.howMathDesc')}
            </div>
          </div>
        </div>
      </motion.div>

      <PresetDrawer />
      <ShortcutModal />
      <ShareModal />
      <ExportModal />
    </motion.div>
  );
}