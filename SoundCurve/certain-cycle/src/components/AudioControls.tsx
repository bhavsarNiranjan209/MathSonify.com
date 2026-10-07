import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStudioStore, type InstrumentType, type SonificationMode } from '../store/studioStore';
import { useTranslation } from '../i18n/index';
import { audioEngine } from '../utils/audioEngine';
import { resolveActiveCurve } from '../utils/activeCurve';
import { MUSICAL_SCALES, type ScaleKey } from '../utils/equationParser';
import type { SamplePoint } from '../utils/equationParser';
import LearnPanel from './LearnPanel';
import CurveDescriber from './CurveDescriber';

const INSTRUMENTS: { id: InstrumentType; labelKey: string; descKey: string; icon: string }[] = [
  { id: 'sine', labelKey: 'inst.sine', descKey: 'inst.sineDesc', icon: '∿' },
  { id: 'triangle', labelKey: 'inst.triangle', descKey: 'inst.triangleDesc', icon: '▲' },
  { id: 'sawtooth', labelKey: 'inst.sawtooth', descKey: 'inst.sawtoothDesc', icon: '🪚' },
  { id: 'square', labelKey: 'inst.square', descKey: 'inst.squareDesc', icon: '■' },
  { id: 'piano', labelKey: 'inst.piano', descKey: 'inst.pianoDesc', icon: '🎹' },
  { id: 'pluck', labelKey: 'inst.pluck', descKey: 'inst.pluckDesc', icon: '🪕' },
];

const MODES: { id: SonificationMode; labelKey: string; descKey: string; icon: string }[] = [
  { id: 'frequency', labelKey: 'mode.frequency', descKey: 'mode.frequencyDesc', icon: '📈' },
  { id: 'note', labelKey: 'mode.note', descKey: 'mode.noteDesc', icon: '🎵' },
  { id: 'rhythm', labelKey: 'mode.rhythm', descKey: 'mode.rhythmDesc', icon: '🥁' },
  { id: 'chord', labelKey: 'mode.chord', descKey: 'mode.chordDesc', icon: '🎼' },
];

export default function AudioControls() {
  const { t } = useTranslation();
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const setPlaying = useStudioStore((s) => s.setPlaying);
  const setProgress = useStudioStore((s) => s.setProgress);

  const volume = useStudioStore((s) => s.volume);
  const setVolume = useStudioStore((s) => s.setVolume);
  const duration = useStudioStore((s) => s.duration);
  const setDuration = useStudioStore((s) => s.setDuration);
  const speed = useStudioStore((s) => s.speed);
  const setSpeed = useStudioStore((s) => s.setSpeed);
  const loop = useStudioStore((s) => s.loop);
  const setLoop = useStudioStore((s) => s.setLoop);
  const learnMode = useStudioStore((s) => s.learnMode);
  const setLearnMode = useStudioStore((s) => s.setLearnMode);
  const panningEnabled = useStudioStore((s) => s.panningEnabled);
  const setPanningEnabled = useStudioStore((s) => s.setPanningEnabled);
  const curveDescriber = useStudioStore((s) => s.curveDescriber);
  const setCurveDescriber = useStudioStore((s) => s.setCurveDescriber);

  // The toggle lives in the store; the engine owns the actual StereoPannerNode.
  // Keeping them in step here is the only place the two meet.
  const handleTogglePanning = () => {
    const next = !panningEnabled;
    setPanningEnabled(next);
    audioEngine.setPanningEnabled(next);
  };
  const instrument = useStudioStore((s) => s.instrument);
  const setInstrument = useStudioStore((s) => s.setInstrument);
  const sonificationMode = useStudioStore((s) => s.sonificationMode);
  const setSonificationMode = useStudioStore((s) => s.setSonificationMode);
  const scale = useStudioStore((s) => s.scale);
  const setScale = useStudioStore((s) => s.setScale);
  const minFreq = useStudioStore((s) => s.minFreq);
  const setMinFreq = useStudioStore((s) => s.setMinFreq);
  const maxFreq = useStudioStore((s) => s.maxFreq);
  const setMaxFreq = useStudioStore((s) => s.setMaxFreq);

  const equation = useStudioStore((s) => s.equation);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);
  const isCustomCurve = useStudioStore((s) => s.isCustomCurve);
  const splineControlPoints = useStudioStore((s) => s.splineControlPoints);

  const setShareModalOpen = useStudioStore((s) => s.setShareModalOpen);

  const reduceMotion = !!useReducedMotion();
  const setExportModalOpen = useStudioStore((s) => s.setExportModalOpen);
  const hasPendingChanges = useStudioStore((s) => s.hasPendingChanges);
  const setHasPendingChanges = useStudioStore((s) => s.setHasPendingChanges);

  const [audioError, setAudioError] = useState<string>('');

  // Collapse rapid successive restarts (instrument mashing) into one playback.
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    };
  }, []);

  // Clearing pending-changes kills the "hit refresh" banner.
  // Only clear when playback stops entirely — NOT when loop is toggled off,
  // so the notification persists until the user explicitly restarts.
  useEffect(() => {
    if (!isPlaying) {
      if (hasPendingChanges) setHasPendingChanges(false);
    }
  }, [isPlaying, hasPendingChanges, setHasPendingChanges]);

  // Heartbeat pulse for the "needs refresh" refresh button
  const refreshPulse = hasPendingChanges && !reduceMotion ? { scale: [1, 1.06, 1] } : undefined;

  const handlePlay = async () => {
    try {
      setAudioError('');
      setPlaying(true);

      // Same resolver the exporter uses, so the button and the video always
      // sonify the identical curve. Throws inside this try/catch for an
      // unparseable equation, which is surfaced via audioError below.
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
        (prog, cx, cy) => {
          setProgress(prog, cx, cy);
        },
        () => {
          setPlaying(false);
          setProgress(0, 0, 0);
        }
      );
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Error playing audio');
      setPlaying(false);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    setPlaying(false);
    setProgress(0, 0, 0);
    setHasPendingChanges(false);
  };

  const handleRestart = () => {
    if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    handleStop();
    setHasPendingChanges(false);
    restartTimeoutRef.current = setTimeout(() => {
      handlePlay();
    }, 60);
  };

  // Switching instruments / modes while playing: mark pending so the user
  // sees the refresh notification and can apply the change.
  const handleInstrumentPick = (id: InstrumentType) => {
    setInstrument(id);
    if (isPlaying) setHasPendingChanges(true);
  };

  const handleModePick = (id: SonificationMode) => {
    setSonificationMode(id);
    if (isPlaying) setHasPendingChanges(true);
  };

  return (
    <div className="space-y-5">
      {/* Transport bar */}
      <div className="p-3 bg-sc-sunken border border-sc-line/15 rounded-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!isPlaying ? (
            <button
              type="button"
              onClick={handlePlay}
              className="px-6 py-2.5 text-sm btn-primary"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>{t('audio.play')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="px-6 py-2.5 text-sm btn-live"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
              <span>{t('audio.stop')}</span>
            </button>
          )}

          <motion.button
            type="button"
            onClick={handleRestart}
            className={`p-2.5 rounded-md border transition-colors ${
              hasPendingChanges
                ? 'bg-sc-accent text-sc-on-accent border-sc-accent shadow-sm shadow-sc-accent/30'
                : 'bg-sc-surface text-sc-text-soft hover:bg-sc-accent hover:text-sc-on-accent border-sc-line/20'
            }`}
            title={hasPendingChanges ? t('audio.applyTooltip') : t('audio.refreshTooltip')}
            animate={refreshPulse}
            transition={
              hasPendingChanges && !reduceMotion
                ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' as const }
                : { duration: reduceMotion ? 0 : 0.15 }
            }
            aria-label={hasPendingChanges ? t('audio.applyTooltip') : t('audio.refreshTooltip')}
          >
            <svg className="w-4 h-4 fill-none stroke-current" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </motion.button>
        </div>

        {/*
          Export / Share used to sit HERE, directly beside Play. They are
          end-of-session actions — what you do once you are happy with the result
          — and placing them next to the transport implied you needed them before
          playing at all. They now render last in this panel, below every control.
        */}
      </div>

      {/*
          PLAYBACK-ADJACENT CONTROLS — immediately below the transport.

          Learn mode, Stereo pan, Describe curve and Loop playback used to sit at
          the BOTTOM of the sliders block, buried under Volume/Duration/Speed. But
          they are not tuning: they change what playing the equation MEANS, while
          the sliders only change how it sounds once it is playing. Sitting next to
          Play/Stop puts them where the decision to press play is actually made.

          Order is deliberate: the three toggles first, then the loop switch
          directly beneath them, so the whole "how will this play" group reads as
          one block before the secondary tuning sliders.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLearnMode(!learnMode)}
            aria-pressed={learnMode}
            className={`px-3 py-2 rounded-md text-xs font-medium transition-colors min-h-[44px] ${
              learnMode
                ? 'bg-sc-accent text-sc-on-accent'
                : 'bg-sc-surface border border-sc-line/20 text-sc-text-soft hover:border-sc-accent'
            }`}
            title="Show x, y and the frequency being played"
          >
            Learn mode
          </button>
          <button
            type="button"
            onClick={handleTogglePanning}
            aria-pressed={panningEnabled}
            className={`px-3 py-2 rounded-md text-xs font-medium transition-colors min-h-[44px] ${
              panningEnabled
                ? 'bg-sc-accent text-sc-on-accent'
                : 'bg-sc-surface border border-sc-line/20 text-sc-text-soft hover:border-sc-accent'
            }`}
            title="Pan the sound with the curve's height. Turn off for mono speakers or a single earbud."
          >
            Stereo pan {panningEnabled ? 'on' : 'off'}
          </button>
          <button
            type="button"
            onClick={() => setCurveDescriber(!curveDescriber)}
            aria-pressed={curveDescriber}
            className={`px-3 py-2 rounded-md text-xs font-medium transition-colors min-h-[44px] ${
              curveDescriber
                ? 'bg-sc-accent text-sc-on-accent'
                : 'bg-sc-surface border border-sc-line/20 text-sc-text-soft hover:border-sc-accent'
            }`}
            title="Describe the curve's shape in words, and optionally speak it aloud"
          >
            Describe curve
          </button>
        </div>

        <LearnPanel />
        <CurveDescriber />

        <div className="flex items-center justify-between p-2 rounded-md bg-sc-surface border border-sc-line/15">
          <div>
            <div className="text-xs font-medium text-sc-text">{t('audio.loopPlayback')}</div>
            <div className="text-[10px] text-sc-text-faint">{t('audio.continuousCycle')}</div>
          </div>
          <button
            type="button"
            onClick={() => { setLoop(!loop); if (isPlaying) setHasPendingChanges(true); }}
            // The only child is a decorative circle, so this button had no
            // accessible name at all and its on/off state was invisible.
            aria-label={t('audio.loopPlayback')}
            aria-pressed={loop}
            className={`relative inline-flex h-5 w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
              loop ? 'bg-sc-accent' : 'bg-sc-line/20'
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                loop ? 'translate-x-4 bg-sc-on-accent' : 'translate-x-1 bg-sc-text-soft'
              }`}
            />
          </button>
        </div>

      {/* Nudge banner — looping playback is cut-proof, so tell the user to hit refresh to apply selections */}
      <AnimatePresence>
        {hasPendingChanges && (
          <motion.div
            initial={reduceMotion ? { opacity: 1, height: 'auto', y: 0 } : { opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={reduceMotion ? { opacity: 1, height: 'auto', y: 0 } : { opacity: 0, height: 0, y: -6 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-sc-accent/15 border border-sc-accent/50 rounded-md flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-sc-text">
                <span className="text-sm mt-0.5" aria-hidden="true">🔄</span>
                <div>
                  <p className="font-semibold text-sc-text">{t('audio.pendingTitle')}</p>
                  <p className="text-sc-text-soft mt-0.5 leading-relaxed">
                    {t('audio.pendingDesc')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRestart}
                className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md bg-sc-accent text-sc-on-accent hover:bg-sc-accent/90 transition-colors"
              >
                {t('audio.apply')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {audioError && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-md text-red-400 text-xs">
          {audioError}
        </div>
      )}

      <p className="text-[11px] text-sc-text-faint flex items-center gap-2 -mt-1">
        <kbd className="px-1.5 py-0.5 rounded bg-sc-surface border border-sc-line/20 font-mono text-[10px]">Space</kbd>
        <span>{t('audio.spaceStartsStops')}</span>
      </p>

      {/* Instrument selection */}
      <div>
        <label className="block text-xs font-semibold text-sc-text-soft mb-2">
          {t('audio.chooseInstrument')}
        </label>
        <div
          className="grid grid-cols-3 sm:grid-cols-6 gap-2"
          role="group"
          aria-label={t('audio.chooseInstrument')}
        >
          {INSTRUMENTS.map((inst) => (
            <motion.button
              key={inst.id}
              type="button"
              onClick={() => handleInstrumentPick(inst.id)}
              // Without this the selection is conveyed by colour alone, so a
              // screen reader announces six identical buttons and never says
              // which voice is active.
              aria-pressed={instrument === inst.id}
              className={`p-2 rounded-md border text-center transition-colors ${
                instrument === inst.id
                  ? 'bg-sc-accent/15 border-sc-accent/60 text-sc-text'
                  : 'bg-sc-surface border-sc-line/20 hover:border-sc-line/50 text-sc-text-soft hover:text-sc-text'
              }`}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              whileHover={reduceMotion ? undefined : { y: -1.5 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.1 }}
            >
              <div className="text-base mb-0.5">{inst.icon}</div>
              <div className="text-xs font-medium">{t(inst.labelKey as any)}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Sonification mode */}
      <div>
        <label className="block text-xs font-semibold text-sc-text-soft mb-2">
          {t('audio.howMathMakesSound')}
        </label>
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          role="group"
          aria-label={t('audio.howMathMakesSound')}
        >
          {MODES.map((m) => (
            <motion.button
              key={m.id}
              type="button"
              onClick={() => handleModePick(m.id)}
              aria-pressed={sonificationMode === m.id}
              className={`p-2 rounded-md border text-left transition-colors ${
                sonificationMode === m.id
                  ? 'bg-sc-accent/15 border-sc-accent/60 text-sc-text'
                  : 'bg-sc-surface border-sc-line/20 hover:border-sc-line/50 text-sc-text-soft hover:text-sc-text'
              }`}
              whileTap={reduceMotion ? undefined : { scale: 0.95 }}
              whileHover={reduceMotion ? undefined : { y: -1.5 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.1 }}
            >
              <div className="flex items-center gap-1.5 font-medium text-xs">
                <span>{m.icon}</span>
                <span>{t(m.labelKey as any)}</span>
              </div>
              <div className="text-[10px] text-sc-text-faint mt-1 truncate">{t(m.descKey as any)}</div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Musical scale */}
      {(sonificationMode === 'note' || sonificationMode === 'chord') && (
        <div className="p-3 bg-sc-accent/10 border border-sc-accent/30 rounded-md">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="scale-select" className="text-xs font-medium text-sc-text flex items-center gap-1.5">
              <span>🎼</span>
              <span>{t('audio.musicalScale')}</span>
            </label>
            <span className="text-[10px] font-mono text-sc-accent">{t('audio.tuned')}</span>
          </div>
          <select
            id="scale-select"
            value={scale}
            onChange={(e) => { setScale(e.target.value as ScaleKey); if (isPlaying) setHasPendingChanges(true); }}
            className="w-full px-3 py-2 panel-inset text-xs text-sc-text focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
          >
            {Object.entries(MUSICAL_SCALES).map(([key, sc]) => (
              <option key={key} value={key}>
                {sc.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div>
          <div className="flex justify-between text-xs text-sc-text-soft mb-1 font-mono">
            <span>{t('audio.volume')}</span>
            <span>{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            // The visible label is a sibling div, not a <label for>, so without
            // these the control is announced as a bare unnamed slider.
            aria-label={t('audio.volume')}
            aria-valuetext={`${Math.round(volume * 100)}%`}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              audioEngine.setVolume(v);
              if (isPlaying) setHasPendingChanges(true);
            }}
            className="w-full min-h-[44px] cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs text-sc-text-soft mb-1 font-mono">
            <span>{t('audio.duration')}</span>
            <span>{duration}s</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={duration}
            aria-label={t('audio.duration')}
            // "12" alone is ambiguous to a screen reader; say what it is.
            aria-valuetext={`${duration} seconds`}
            onChange={(e) => { setDuration(parseInt(e.target.value)); if (isPlaying) setHasPendingChanges(true); }}
            className="w-full min-h-[44px] cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs text-sc-text-soft mb-1 font-mono">
            <span>{t('audio.speed')}</span>
            <span>{speed}x</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="2"
            step="0.25"
            value={speed}
            aria-label={t('audio.speed')}
            aria-valuetext={`${speed}×`}
            onChange={(e) => { setSpeed(parseFloat(e.target.value)); if (isPlaying) setHasPendingChanges(true); }}
            className="w-full min-h-[44px] cursor-pointer"
          />
        </div>
      </div>

      {/* Frequency bounds */}
      <div className="p-3 bg-sc-surface border border-sc-line/15 rounded-md space-y-2">
        <div className="flex justify-between text-xs text-sc-text-soft font-mono">
          <span>{t('audio.frequencyBounds')}</span>
          <span>{minFreq}Hz — {maxFreq}Hz</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[10px] text-sc-text-faint block">{t('audio.lowPitch')}</span>
            <input
              type="range"
              min="50"
              max="400"
              step="10"
              value={minFreq}
              aria-label={t('audio.lowPitch')}
              aria-valuetext={`${minFreq} hertz`}
              onChange={(e) => { setMinFreq(parseInt(e.target.value)); if (isPlaying) setHasPendingChanges(true); }}
              className="w-full min-h-[44px] cursor-pointer"
            />
          </div>
          <div>
            <span className="text-[10px] text-sc-text-faint block">{t('audio.highPitch')}</span>
            <input
              type="range"
              min="400"
              max="2000"
              step="20"
              value={maxFreq}
              aria-label={t('audio.highPitch')}
              aria-valuetext={`${maxFreq} hertz`}
              onChange={(e) => { setMaxFreq(parseInt(e.target.value)); if (isPlaying) setHasPendingChanges(true); }}
              className="w-full min-h-[44px] cursor-pointer"
            />
          </div>
        </div>

        {/*
          Export WAV and Share, LAST in this panel.

          These are end-of-session actions: you save or share once you are happy
          with what you made. Sitting beside Play/Stop they read as
          prerequisites — something to do before you have even heard the curve —
          so they have been moved below every tuning control instead.

          Only the two trigger BUTTONS moved. The modals themselves are rendered
          by Studio.tsx as full-screen overlays and take no part in this panel's
          layout, so their position here never affected where they appear.
        */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-sc-line/10">
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="px-3.5 py-2 min-h-[44px] btn-ghost text-xs"
            title={t('audio.exportTooltip')}
          >
            <span>💾</span>
            <span>{t('audio.exportWav')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="px-3.5 py-2 min-h-[44px] btn-ghost text-xs"
            title={t('audio.shareTooltip')}
          >
            <span>🔗</span>
            <span>{t('audio.share')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}