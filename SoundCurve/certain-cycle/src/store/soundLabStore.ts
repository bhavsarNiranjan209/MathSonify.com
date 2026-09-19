/**
 * SoundLab Zustand store — selected composition + transport / tweak state.
 * Isolated from studioStore so future YT-driven features do not entangle studio.
 */

import { create } from 'zustand';
import type { ScaleKey } from '../utils/equationParser';

// ── State shape ────────────────────────────────────────────────────────

export interface SoundLabState {
  selectedId: string | null;
  isPlaying: boolean;
  progress: number; // 0..1
  volume: number; // 0..1
  tempoScale: number; // 0.5..2.0 (1 = original tempo)
  scaleOverride: ScaleKey | null; // null = composition's own key
  /** Per-track mix override (null entry = use composition default). */
  trackMix: Record<string, number>;
  mutedTracks: Record<string, boolean>;
  soloTrackId: string | null;
  loop: boolean;
}

export interface SoundLabActions {
  select: (id: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setProgress: (progress: number) => void;
  setVolume: (volume: number) => void;
  setTempoScale: (scale: number) => void;
  setScaleOverride: (scale: ScaleKey | null) => void;
  setTrackMix: (trackId: string, mix: number) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setSolo: (trackId: string | null) => void;
  setLoop: (loop: boolean) => void;
  resetForComposition: (trackIds: string[]) => void;
}

const initialState: SoundLabState = {
  selectedId: null,
  isPlaying: false,
  progress: 0,
  volume: 0.7,
  tempoScale: 1,
  scaleOverride: null,
  trackMix: {},
  mutedTracks: {},
  soloTrackId: null,
  loop: false,
};

export const useSoundLabStore = create<SoundLabState & SoundLabActions>((set) => ({
  ...initialState,

  select: (id) => set({ selectedId: id, isPlaying: false, progress: 0 }),
  setPlaying: (playing) => set((s) => ({ isPlaying: playing, progress: playing ? s.progress : s.progress })),
  setProgress: (progress) => set({ progress }),
  setVolume: (volume) => set({ volume }),
  setTempoScale: (scale) => set({ tempoScale: Math.min(2, Math.max(0.5, scale)) }),
  setScaleOverride: (scaleOverride) => set({ scaleOverride }),
  setTrackMix: (trackId, mix) => set((s) => ({ trackMix: { ...s.trackMix, [trackId]: Math.min(1, Math.max(0, mix)) } })),
  setTrackMuted: (trackId, muted) => set((s) => ({ mutedTracks: { ...s.mutedTracks, [trackId]: muted } })),
  setSolo: (soloTrackId) => set({ soloTrackId }),
  setLoop: (loop) => set({ loop }),
  resetForComposition: (trackIds) => set({
    isPlaying: false,
    progress: 0,
    trackMix: {},
    mutedTracks: {},
    soloTrackId: null,
  }),
}));
