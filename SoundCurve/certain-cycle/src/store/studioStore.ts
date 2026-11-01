import { create } from 'zustand';
import type { ScaleKey } from '../utils/equationParser';
// Type-only import: the readout type lives in the audio engine, and importing
// it for real would pull the whole Web Audio module into the store's graph.
import type { PlaybackReadout } from '../utils/audioEngine';
import type { Scientist } from '../data/scientists';
import {
  sampleEquationToControlPoints,
  deformControlPointsWithBrush,
  type SplineControlPoint,
} from '../utils/curveSpline';
import { fitClosestEquation, type FitResult } from '../utils/curveFitting';

export type InstrumentType = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'piano' | 'pluck';
export type SonificationMode = 'frequency' | 'note' | 'rhythm' | 'chord';
export type VisualizerMode = '2d-graph' | 'waveform' | 'spectrum' | 'particles' | 'mandala';

export interface StudioState {
  // Playback state
  isPlaying: boolean;
  progress: number;
  currentX: number;
  currentY: number;
  /**
   * Live Learn-mode readout, emitted by the audio engine every frame the
   * playhead moves. Null when not playing or when the current sample is
   * invalid, so the UI never shows a value the engine did not play.
   */
  readout: PlaybackReadout | null;
  /** Learn-mode overlay visibility. Off by default. */
  learnMode: boolean;
  /** Curve-height stereo panning. On by default; off for mono output. */
  panningEnabled: boolean;
  /** Blind/accessibility mode: spoken + written curve description. */
  curveDescriber: boolean;

  // Audio parameters
  volume: number;
  duration: number;
  speed: number;
  instrument: InstrumentType;
  sonificationMode: SonificationMode;
  scale: ScaleKey;
  loop: boolean;
  minFreq: number;
  maxFreq: number;

  // Mathematical bounds & equation
  equation: string;
  /** Equation the current session started from (set when one is picked). */
  originalEquation: string;
  minX: number;
  maxX: number;
  /** Active input source: 'bar' (equation bar) or 'paste' (paste card) */
  inputMode: 'bar' | 'paste';
  /** Raw pasted text (paste mode) */
  raw: string;
  /** Canonical expr from paste normalizer */
  expr: string;
  /** Display string from paste normalizer */
  display: string;
  /** Parameter names from paste normalizer */
  params: string[];

  // Direct Curve Sculpting / Editing state
  isEditingCurve: boolean;
  isCustomCurve: boolean;
  splineControlPoints: SplineControlPoint[];
  brushRadius: number; // Normalized [0.05, 0.8], default 0.35 (Tight ↔ Broad)
  fitResult: FitResult | null;
  isFitting: boolean;

  // Undo/redo history for freehand curve editing
  splineHistory: SplineControlPoint[][];
  splineHistoryIndex: number;

  // Visualizer settings
  visualizerMode: VisualizerMode;
  showGrid: boolean;
  lineWidth: number;
  curveColor: string | null; // null = use theme default

  // Active scientist context (for video export)
  activeScientist: Scientist | null;
  activeEquationName: string | null;

  // Modals & UI triggers
  shareModalOpen: boolean;
  exportModalOpen: boolean;
  presetDrawerOpen: boolean;
  shortcutModalOpen: boolean;
  hasPendingChanges: boolean;
}

export interface StudioActions {
  setPlaying: (playing: boolean) => void;
  setProgress: (
    progress: number,
    currentX: number,
    currentY: number,
    readout?: PlaybackReadout,
  ) => void;
  setLearnMode: (on: boolean) => void;
  setPanningEnabled: (on: boolean) => void;
  setCurveDescriber: (on: boolean) => void;
  setVolume: (volume: number) => void;
  setDuration: (duration: number) => void;
  setSpeed: (speed: number) => void;
  setInstrument: (instrument: InstrumentType) => void;
  setSonificationMode: (mode: SonificationMode) => void;
  setScale: (scale: ScaleKey) => void;
  setLoop: (loop: boolean) => void;
  setMinFreq: (freq: number) => void;
  setMaxFreq: (freq: number) => void;
  setInputMode: (mode: 'bar' | 'paste') => void;
  setRaw: (raw: string) => void;
  setExpr: (expr: string) => void;
  setDisplay: (display: string) => void;
  setParams: (params: string[]) => void;

  // Undo/redo for freehand curve editing
  pushSplineHistory: (points: SplineControlPoint[]) => void;
  undoSpline: () => void;
  redoSpline: () => void;

  setEquation: (equation: string) => void;
  setOriginalEquation: (originalEquation: string) => void;
  resetEquation: () => void;
  setMinX: (minX: number) => void;
  setMaxX: (maxX: number) => void;
  setDomain: (minX: number, maxX: number) => void;

  // Direct Curve Sculpting actions
  setIsEditingCurve: (editing: boolean) => void;
  toggleEditingCurve: () => void;
  initSplineFromCurrent: (count?: number) => void;
  setSplineControlPoints: (points: SplineControlPoint[]) => void;
  deformSplinePoint: (targetIndex: number, deltaY: number) => void;
  setBrushRadius: (radius: number) => void;
  fitCurrentCurve: () => void;
  setFitResult: (result: FitResult | null) => void;
  resetSplineCurve: () => void;

  setVisualizerMode: (mode: VisualizerMode) => void;
  setShowGrid: (show: boolean) => void;
  setLineWidth: (width: number) => void;
  setCurveColor: (color: string | null) => void;

  setActiveScientist: (scientist: Scientist | null, equationName: string | null) => void;

  setShareModalOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  setPresetDrawerOpen: (open: boolean) => void;
  setHasPendingChanges: (pending: boolean) => void;

  loadPreset: (preset: {
    equation: string;
    minX?: number;
    maxX?: number;
    minFreq?: number;
    maxFreq?: number;
    duration?: number;
    instrument?: InstrumentType;
    sonificationMode?: SonificationMode;
    scale?: ScaleKey;
  }) => void;

  resetToDefault: () => void;
}

const initialState: StudioState = {
  isPlaying: false,
  progress: 0,
  currentX: 0,
  currentY: 0,
  readout: null,
  // Learn mode is off by default, per spec, and is deliberately NOT persisted
  // across reloads — it is a per-session aid, not a preference tied to an
  // equation. Keeping it in this in-memory store is what makes that true.
  learnMode: false,
  panningEnabled: true,
  // Blind mode is off by default per spec; the toggle is session state like
  // Learn mode, so it resets on reload rather than becoming a sticky preference.
  curveDescriber: false,

  volume: 0.7,
  duration: 4,
  speed: 1,
  instrument: 'sine',
  sonificationMode: 'frequency',
  scale: 'major',
  loop: false,
  minFreq: 220,
  maxFreq: 750,

  equation: 'sin(x)',
  originalEquation: 'sin(x)',
  inputMode: 'bar',  // Active input source: 'bar' (equation bar) or 'paste' (paste card)
  raw: '',
  expr: '',
  display: '',
  params: [],
  minX: -6.28,
  maxX: 6.28,

  isEditingCurve: false,
  isCustomCurve: false,
  splineControlPoints: [],
  brushRadius: 0.35,
  fitResult: null,
  isFitting: false,
      splineHistory: [],
      splineHistoryIndex: -1,

  visualizerMode: '2d-graph',
  showGrid: true,
  lineWidth: 3,
  curveColor: null,

  activeScientist: null,
  activeEquationName: null,

  shareModalOpen: false,
  exportModalOpen: false,
  presetDrawerOpen: false,
  shortcutModalOpen: false,
  hasPendingChanges: false,
};

export const useStudioStore = create<StudioState & StudioActions>((set) => ({
  ...initialState,

  setPlaying: (playing) => set((state) => ({ isPlaying: playing, progress: playing ? state.progress : 0 })),
  setProgress: (progress, currentX, currentY, readout) =>
    set({ progress, currentX, currentY, readout: readout ?? null }),
  setLearnMode: (learnMode) => set({ learnMode }),
  setPanningEnabled: (panningEnabled) => set({ panningEnabled }),
  setCurveDescriber: (curveDescriber) => set({ curveDescriber }),
  setVolume: (volume) => set({ volume }),
  setDuration: (duration) => set({ duration }),
  setSpeed: (speed) => set({ speed }),
  setInstrument: (instrument) => set({ instrument }),
  setSonificationMode: (mode) => set({ sonificationMode: mode }),
  setScale: (scale) => set({ scale }),
  setLoop: (loop) => set({ loop }),
  setMinFreq: (minFreq) => set({ minFreq }),
  setMaxFreq: (maxFreq) => set({ maxFreq }),
  setInputMode: (inputMode) => set({ inputMode }),
  setRaw: (raw) => set({ raw }),
  setExpr: (expr) => set({ expr }),
  setDisplay: (display) => set({ display }),
  setParams: (params) => set({ params }),

  setEquation: (equation) =>
    set({
      equation,
      isCustomCurve: false,
      isEditingCurve: false,
      splineControlPoints: [],
      fitResult: null,
    }),
  setOriginalEquation: (originalEquation) => set({ originalEquation }),
  resetEquation: () =>
    set((state) => ({
      equation: state.originalEquation,
      isCustomCurve: false,
      isEditingCurve: false,
      splineControlPoints: [],
      fitResult: null,
    })),
  setMinX: (minX) => set({ minX }),
  setMaxX: (maxX) => set({ maxX }),
  setDomain: (minX, maxX) => set({ minX, maxX }),

  setIsEditingCurve: (isEditingCurve) =>
    set((state) => {
      if (isEditingCurve && state.splineControlPoints.length === 0) {
        const points = sampleEquationToControlPoints(state.equation, state.minX, state.maxX, 32);
        return { isEditingCurve, splineControlPoints: points };
      }
      return { isEditingCurve };
    }),
  toggleEditingCurve: () =>
    set((state) => {
      const nextEditing = !state.isEditingCurve;
      if (nextEditing && state.splineControlPoints.length === 0) {
        const points = sampleEquationToControlPoints(state.equation, state.minX, state.maxX, 32);
        return { isEditingCurve: nextEditing, splineControlPoints: points };
      }
      return { isEditingCurve: nextEditing };
    }),
  initSplineFromCurrent: (count = 32) =>
    set((state) => {
      const points = sampleEquationToControlPoints(state.equation, state.minX, state.maxX, count);
      return {
        isEditingCurve: true,
        isCustomCurve: false,
        splineControlPoints: points,
        fitResult: null,
      };
    }),
  setSplineControlPoints: (splineControlPoints) =>
    set({ splineControlPoints, isCustomCurve: true, fitResult: null }),
  pushSplineHistory: (points) =>
    set((state) => {
      // Auto-initialise history if it hasn't been seeded yet.
      if (state.splineHistory.length === 0) {
        return {
          splineHistory: [state.splineControlPoints],
          splineHistoryIndex: 0,
        };
      }
      // Append the new state, dropping any redo history ahead of the cursor.
      const next = state.splineHistory.slice(0, state.splineHistoryIndex + 1);
      next.push(points);
      if (next.length > 50) next.shift();
      return {
        splineHistory: next,
        splineHistoryIndex: next.length - 1,
      };
    }),
  undoSpline: () =>
    set((state) => {
      if (state.splineHistoryIndex <= 0) return state;
      const idx = state.splineHistoryIndex - 1;
      return {
        splineHistoryIndex: idx,
        splineControlPoints: state.splineHistory[idx],
        isCustomCurve: true,
      };
    }),
  redoSpline: () =>
    set((state) => {
      if (state.splineHistoryIndex >= state.splineHistory.length - 1) return state;
      const idx = state.splineHistoryIndex + 1;
      return {
        splineHistoryIndex: idx,
        splineControlPoints: state.splineHistory[idx],
        isCustomCurve: true,
      };
    }),

  deformSplinePoint: (targetIndex, deltaY) =>
    set((state) => {
      if (state.splineControlPoints.length === 0) return state;
      // Snapshot the current shape before deforming so it can be undone.
      getState().pushSplineHistory(state.splineControlPoints);
      const updated = deformControlPointsWithBrush(
        state.splineControlPoints,
        targetIndex,
        deltaY,
        state.brushRadius,
        state.minX,
        state.maxX
      );
      return {
        splineControlPoints: updated,
        isCustomCurve: true,
        fitResult: null,
      };
    }),
  setBrushRadius: (brushRadius) =>
    set({ brushRadius: Math.max(0.05, Math.min(0.8, brushRadius)) }),
  fitCurrentCurve: () =>
    set((state, getState) => {
      if (state.splineControlPoints.length === 0) {
        return { fitResult: null, isFitting: false };
      }
      // Fit commits to the current shape, so clear undo history.
      getState().pushSplineHistory(state.splineControlPoints);
      const result = fitClosestEquation(state.splineControlPoints);
      return { fitResult: result, isFitting: false, splineHistory: [], splineHistoryIndex: -1 };
    }),
  setFitResult: (fitResult) => set({ fitResult }),
  resetSplineCurve: () =>
    set((state) => {
      const targetEq = state.originalEquation || state.equation;
      const points = sampleEquationToControlPoints(targetEq, state.minX, state.maxX, 32);
      return {
        equation: targetEq,
        splineControlPoints: points,
        isCustomCurve: false,
        isEditingCurve: false,
        fitResult: null,
        isPlaying: false,
        progress: 0,
        splineHistory: [],
        splineHistoryIndex: -1,
      };
    }),

  setVisualizerMode: (visualizerMode) => set({ visualizerMode }),
  setShowGrid: (showGrid) => set({ showGrid }),
  setLineWidth: (lineWidth) => set({ lineWidth }),
  setCurveColor: (curveColor) => set({ curveColor }),

  setActiveScientist: (scientist, equationName) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (scientist && equationName) {
        url.searchParams.set('sci', scientist.id);
        url.searchParams.set('eqName', equationName);
      } else {
        url.searchParams.delete('sci');
        url.searchParams.delete('eqName');
      }
      window.history.replaceState({}, '', url.toString());
    }
    return set({ activeScientist: scientist, activeEquationName: equationName });
  },

  setShareModalOpen: (shareModalOpen) => set({ shareModalOpen }),
  setExportModalOpen: (exportModalOpen) => set({ exportModalOpen }),
  setPresetDrawerOpen: (presetDrawerOpen) => set({ presetDrawerOpen }),
  setShortcutModalOpen: (shortcutModalOpen) => set({ shortcutModalOpen }),
  setHasPendingChanges: (hasPendingChanges) => set({ hasPendingChanges }),

  loadPreset: (preset) =>
    set((state) => ({
      equation: preset.equation,
      originalEquation: preset.equation,
      minX: preset.minX ?? state.minX,
      maxX: preset.maxX ?? state.maxX,
      minFreq: preset.minFreq ?? state.minFreq,
      maxFreq: preset.maxFreq ?? state.maxFreq,
      duration: preset.duration ?? state.duration,
      instrument: preset.instrument ?? state.instrument,
      sonificationMode: preset.sonificationMode ?? state.sonificationMode,
      scale: preset.scale ?? state.scale,
      isCustomCurve: false,
      isEditingCurve: false,
      splineControlPoints: [],
      fitResult: null,
      isPlaying: false,
      progress: 0,
      splineHistory: [],
      splineHistoryIndex: -1,
    })),

  resetToDefault: () => set(initialState),
}));
