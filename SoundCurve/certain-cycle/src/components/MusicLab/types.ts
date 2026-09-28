export type TrackKind = 'notes' | 'drums';

export interface MusicLabNote {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface DrumStep {
  on: boolean;
  velocity: number;
  probability: number;
}

export interface MusicLabTrack {
  id: string;
  instrumentId: string;
  name: string;
  kind: TrackKind;
  notes: MusicLabNote[];
  steps: DrumStep[][];
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  params: Record<string, number>;
}

export interface MusicLabProject {
  name: string;
  tempo: number;
  tracks: MusicLabTrack[];
  masterVolume: number;
  snap: number;
}

export interface MusicLabInstrument {
  id: string;
  name: string;
  category: string;
  icon: string;
  accent: string;
  defaults: Record<string, number>;
}