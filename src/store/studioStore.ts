import { create } from 'zustand';
import type { ScaleKey } from '../utils/equationParser';
import type { Scientist } from '../data/scientists';

export type InstrumentType = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'piano' | 'pluck';
export type SonificationMode = 'frequency' | 'note' | 'rhythm' | 'chord';
export type VisualizerMode = '2d-graph' | 'waveform' | 'spectrum' | 'particles' | 'mandala';

export interface StudioState {
  // Playback state
  isPlaying: boolean;
  progress: number;
  currentX: number;
  currentY: number;

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
  hasPendingChanges: boolean;
}

export interface StudioActions {
  setPlaying: (playing: boolean) => void;
  setProgress: (progress: number, currentX: number, currentY: number) => void;
  setVolume: (volume: number) => void;
  setDuration: (duration: number) => void;
  setSpeed: (speed: number) => void;
  setInstrument: (instrument: InstrumentType) => void;
  setSonificationMode: (mode: SonificationMode) => void;
  setScale: (scale: ScaleKey) => void;
  setLoop: (loop: boolean) => void;
  setMinFreq: (freq: number) => void;
  setMaxFreq: (freq: number) => void;

  setEquation: (equation: string) => void;
  setOriginalEquation: (originalEquation: string) => void;
  resetEquation: () => void;
  setMinX: (minX: number) => void;
  setMaxX: (maxX: number) => void;
  setDomain: (minX: number, maxX: number) => void;

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
  minX: -6.28,
  maxX: 6.28,

  visualizerMode: '2d-graph',
  showGrid: true,
  lineWidth: 3,
  curveColor: null,

  activeScientist: null,
  activeEquationName: null,

  shareModalOpen: false,
  exportModalOpen: false,
  presetDrawerOpen: false,
  hasPendingChanges: false,
};

export const useStudioStore = create<StudioState & StudioActions>((set) => ({
  ...initialState,

  setPlaying: (playing) => set((state) => ({ isPlaying: playing, progress: playing ? state.progress : 0 })),
  setProgress: (progress, currentX, currentY) => set({ progress, currentX, currentY }),
  setVolume: (volume) => set({ volume }),
  setDuration: (duration) => set({ duration }),
  setSpeed: (speed) => set({ speed }),
  setInstrument: (instrument) => set({ instrument }),
  setSonificationMode: (mode) => set({ sonificationMode: mode }),
  setScale: (scale) => set({ scale }),
  setLoop: (loop) => set({ loop }),
  setMinFreq: (minFreq) => set({ minFreq }),
  setMaxFreq: (maxFreq) => set({ maxFreq }),

  setEquation: (equation) => set({ equation }),
  setOriginalEquation: (originalEquation) => set({ originalEquation }),
  resetEquation: () => set((state) => ({ equation: state.originalEquation })),
  setMinX: (minX) => set({ minX }),
  setMaxX: (maxX) => set({ maxX }),
  setDomain: (minX, maxX) => set({ minX, maxX }),

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
      isPlaying: false,
      progress: 0,
    })),

  resetToDefault: () => set(initialState),
}));
