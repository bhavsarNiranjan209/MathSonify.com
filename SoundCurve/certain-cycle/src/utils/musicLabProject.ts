/**
 * Music Lab — project model, starter presets and persistence.
 *
 * Everything needed to reopen a session lives in one serialisable
 * `MusicLabProject`. Audio runtime state is deliberately NOT in here: tempo,
 * notes and parameters are saved; playhead position is not.
 */

import {
  DRUM_ROWS,
  DRUM_STEP_COUNT,
  createEmptyDrumSteps,
  createStarterDrumSteps,
  createTrackForInstrument,
  getMusicLabInstrument,
  musicLabId,
  type DrumRowId,
  type DrumStep,
  type MusicLabNote,
  type MusicLabParameters,
  type MusicLabTrack,
} from '../data/musicLabInstruments';
import { midiForScaleDegree } from './musicLabEquation';

export const MUSIC_LAB_PROJECT_VERSION = 1;
const STORAGE_KEY = 'mathsonify-music-lab-project-v1';
const AUTOSAVE_KEY = 'mathsonify-music-lab-autosave-v1';
const FAVORITES_KEY = 'mathsonify-music-lab-favorites-v1';

export interface MusicLabProject {
  version: number;
  name: string;
  tempo: number;
  key: string;
  scale: string;
  tracks: MusicLabTrack[];
  masterVolume: number;
  /** 0..1 — pushes every second 16th step late. */
  swing: number;
  /** Grid snap in beats. 0 = free (no snap). */
  snap: number;
  /** Pattern length in bars (4/4). */
  loopBars: number;
  updatedAt: number;
}

/* ─────────────────────────────── factories ─────────────────────────────── */

export function createNote(
  pitch: number,
  start: number,
  duration: number,
  velocity = 0.8,
): MusicLabNote {
  return { id: musicLabId('note'), pitch, start, duration, velocity };
}

export function createEmptyProject(name = 'Untitled Study'): MusicLabProject {
  return {
    version: MUSIC_LAB_PROJECT_VERSION,
    name,
    tempo: 96,
    key: 'C',
    scale: 'minor-pentatonic',
    tracks: [],
    masterVolume: 0.8,
    swing: 0,
    snap: 0.5,
    loopBars: 2,
    updatedAt: Date.now(),
  };
}

/** The "start here" project — one piano track with a two-note motif. */
export function createStarterProject(): MusicLabProject {
  const project = createEmptyProject();
  const piano = createTrackForInstrument('grand-piano', 0);
  piano.notes = [
    createNote(60, 0, 2, 0.85),
    createNote(64, 2, 2, 0.72),
  ];
  project.tracks = [piano];
  return project;
}

/* ──────────────────────────── geometry helpers ─────────────────────────── */

export const BEATS_PER_BAR = 4;

/** Seconds per beat at the project tempo. */
export function secondsPerBeat(project: Pick<MusicLabProject, 'tempo'>): number {
  return 60 / Math.max(20, Math.min(300, project.tempo));
}

export function secondsPerStep(project: MusicLabProject): number {
  return secondsPerBeat(project) / 4;
}

/** Last note end in beats. Never below the loop length, so the grid has room. */
export function projectLengthBeats(project: MusicLabProject): number {
  const noteEnd = project.tracks.reduce((longest, track) => {
    const trackEnd = track.notes.reduce(
      (end, note) => Math.max(end, note.start + note.duration),
      0,
    );
    return Math.max(longest, trackEnd);
  }, 0);
  return Math.max(BEATS_PER_BAR * project.loopBars, Math.ceil(noteEnd));
}

export function projectBars(project: MusicLabProject): number {
  return Math.max(1, Math.ceil(projectLengthBeats(project) / BEATS_PER_BAR));
}

export function projectDurationSeconds(project: MusicLabProject): number {
  return projectLengthBeats(project) * secondsPerBeat(project);
}

/** Pattern length of a drum track, in 16th steps. */
export function drumPatternLength(track: MusicLabTrack): number {
  return track.steps[0]?.length ?? DRUM_STEP_COUNT;
}

/** Seconds offset applied to a step so swing pushes every other 16th late. */
export function swingOffset(project: MusicLabProject, stepIndex: number): number {
  if (project.swing <= 0) return 0;
  return stepIndex % 2 === 1 ? secondsPerStep(project) * project.swing * 0.5 : 0;
}

/* ──────────────────────────── history entries ──────────────────────────── */

export interface HistoryEntry {
  id: string;
  /** Clock label, e.g. `09:31`. */
  at: string;
  /** Human description, e.g. `Pitch +3 semitones`. */
  label: string;
  /** Equation text at this point, so undo restores maths as well as audio. */
  equation: string;
}

export function clockLabel(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function pushHistory(list: HistoryEntry[], label: string, equation: string): HistoryEntry[] {
  return [...list, { id: musicLabId('hist'), at: clockLabel(), label, equation }].slice(-12);
}

export function drumRowIndex(row: DrumRowId): number {
  return DRUM_ROWS.findIndex((candidate) => candidate.id === row);
}

/**
 * Drum lanes keep their own mathematical DNA (harmonics / noise / body decay)
 * but inherit the kit's shape controls from the track. Both the scheduler and
 * the equation panel call this, so the printed maths and the sound agree.
 */
export function drumLaneParams(
  track: MusicLabTrack,
  instrument: MusicLabInstrument,
): MusicLabParameters {
  return {
    ...instrument.defaults,
    intensity: track.params.intensity,
    decay: track.params.decay,
    reverb: track.params.reverb,
    distortion: track.params.distortion,
  };
}

/* ───────────────────────────── persistence ─────────────────────────────── */

/** Guard so hand-edited or older JSON cannot poison the studio. */
function sanitiseSteps(value: unknown): DrumStep[][] {
  if (!Array.isArray(value)) return createEmptyDrumSteps();
  // Legacy files stored a flat boolean array — migrate it into the kick lane.
  if (value.length > 0 && typeof value[0] === 'boolean') {
    const migrated = createEmptyDrumSteps();
    (value as boolean[]).forEach((on, index) => {
      if (on && migrated[0]?.[index]) {
        migrated[0][index] = { on: true, velocity: 0.95, probability: 1 };
      }
    });
    return migrated;
  }
  return DRUM_ROWS.map((_row, rowIndex) => {
    const lane = Array.isArray(value[rowIndex]) ? (value[rowIndex] as unknown[]) : [];
    return Array.from({ length: DRUM_STEP_COUNT }, (_unused, stepIndex) => {
      const step = lane[stepIndex] as Partial<DrumStep> | undefined;
      return {
        on: Boolean(step?.on),
        velocity: Math.max(0, Math.min(1, step?.velocity ?? 0.85)),
        probability: Math.max(0, Math.min(1, step?.probability ?? 1)),
      };
    });
  });
}

function sanitiseTracks(value: unknown): MusicLabTrack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): MusicLabTrack[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<MusicLabTrack>;
    const instrument = getMusicLabInstrument(String(raw.instrumentId ?? 'grand-piano'));
    const notes: MusicLabNote[] = Array.isArray(raw.notes)
      ? raw.notes.flatMap((note) => {
        if (!note || typeof note !== 'object') return [];
        const candidate = note as Partial<MusicLabNote>;
        if (typeof candidate.pitch !== 'number' || typeof candidate.start !== 'number') return [];
        return [{
          id: typeof candidate.id === 'string' ? candidate.id : musicLabId('note'),
          pitch: Math.max(12, Math.min(120, Math.round(candidate.pitch))),
          start: Math.max(0, candidate.start),
          duration: Math.max(0.0625, candidate.duration ?? 1),
          velocity: Math.max(0, Math.min(1, candidate.velocity ?? 0.8)),
        }];
      })
      : [];
    const isDrum = raw.kind === 'drums' || instrument.category === 'drums';
    return [{
      id: typeof raw.id === 'string' ? raw.id : musicLabId('track'),
      instrumentId: instrument.id,
      name: typeof raw.name === 'string' ? raw.name : instrument.name,
      kind: isDrum ? 'drums' : 'notes',
      notes,
      steps: isDrum ? sanitiseSteps(raw.steps) : createEmptyDrumSteps(),
      volume: Math.max(0, Math.min(1.4, raw.volume ?? 0.78)),
      pan: Math.max(-1, Math.min(1, raw.pan ?? 0)),
      muted: Boolean(raw.muted),
      solo: Boolean(raw.solo),
      params: { ...instrument.defaults, ...(raw.params ?? {}) } as MusicLabParameters,
      collapsed: Boolean(raw.collapsed),
    }];
  });
}

export function sanitiseProject(value: unknown): MusicLabProject | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MusicLabProject>;
  const base = createEmptyProject();
  return {
    version: MUSIC_LAB_PROJECT_VERSION,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : base.name,
    tempo: Math.max(40, Math.min(240, Math.round(raw.tempo ?? base.tempo))),
    key: typeof raw.key === 'string' ? raw.key : base.key,
    scale: typeof raw.scale === 'string' ? raw.scale : base.scale,
    tracks: sanitiseTracks(raw.tracks),
    masterVolume: Math.max(0, Math.min(1, raw.masterVolume ?? base.masterVolume)),
    swing: Math.max(0, Math.min(1, raw.swing ?? 0)),
    snap: Math.max(0, Math.min(4, raw.snap ?? 0.5)),
    loopBars: Math.max(1, Math.min(32, Math.round(raw.loopBars ?? base.loopBars))),
    updatedAt: Date.now(),
  };
}

export function saveProject(project: MusicLabProject): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...project, updatedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function loadProject(): MusicLabProject | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitiseProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Lightweight debounced snapshot, so a refresh never loses work. */
export function writeAutosave(project: MusicLabProject): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...project, updatedAt: Date.now() }));
  } catch {
    /* quota exceeded — the explicit Save still works */
  }
}

export function readAutosave(): MusicLabProject | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? sanitiseProject(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearProjectStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function projectToJson(project: MusicLabProject): string {
  return JSON.stringify(project, null, 2);
}

export function downloadProjectFile(project: MusicLabProject): void {
  const blob = new Blob([projectToJson(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'music-lab'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/* ────────────────────────────── favourites ─────────────────────────────── */

export function loadFavourites(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveFavourites(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* non-critical */
  }
}

/* ──────────────────────── starter project presets ─────────────────────── */

export interface MusicLabPreset {
  id: string;
  name: string;
  description: string;
  accent: string;
  tempo: number;
  key: string;
  scale: string;
  build: () => MusicLabProject;
}

/** Melody helper: scale degree → MIDI, so presets read musically. */
function degree(key: string, scale: string, index: number, octave = 4): number {
  return midiForScaleDegree(key, scale, index, octave);
}

/** Melody helper: build a note list from `[degree, start, duration, velocity]`. */
function melody(
  key: string,
  scale: string,
  octave: number,
  rows: [number, number, number, number?][],
): MusicLabNote[] {
  return rows.map(([scaleDegree, start, duration, velocity]) =>
    createNote(degree(key, scale, scaleDegree, octave), start, duration, velocity ?? 0.8));
}

/** Drum helper: lane → the 16th steps that fire. */
function drumTrack(
  instrumentId: string,
  part: Partial<Record<DrumRowId, number[]>>,
  volume = 0.82,
): MusicLabTrack {
  const track = createTrackForInstrument(instrumentId, 0);
  track.name = 'Drums';
  track.kind = 'drums';
  track.volume = volume;
  for (const row of DRUM_ROWS) {
    const hits = part[row.id];
    if (!hits) continue;
    const rowIndex = drumRowIndex(row.id);
    for (const step of hits) {
      const cell = track.steps[rowIndex]?.[step];
      if (cell) {
        track.steps[rowIndex][step] = { on: true, velocity: step % 4 === 0 ? 0.95 : 0.72, probability: 1 };
      }
    }
  }
  return track;
}

function assemble(
  preset: Omit<MusicLabPreset, 'build'>,
  tracks: MusicLabTrack[],
  masterVolume = 0.8,
  swing = 0,
): MusicLabProject {
  return {
    ...createEmptyProject(preset.name),
    tempo: preset.tempo,
    key: preset.key,
    scale: preset.scale,
    tracks,
    masterVolume,
    swing,
    loopBars: 4,
  };
}

export const MUSIC_LAB_PRESETS: MusicLabPreset[] = [
  {
    id: 'celestial-ambient',
    name: 'Celestial Ambient',
    description: 'Slow pad drift over a deep drone. Nothing hurries.',
    accent: '#22D3EE',
    tempo: 72,
    key: 'D',
    scale: 'dorian',
    build: () => {
      const pad = createTrackForInstrument('soft-pad', 0);
      pad.notes = melody('D', 'dorian', 4, [
        [0, 0, 6, 0.7], [2, 6, 4, 0.62], [4, 10, 6, 0.68],
      ]);
      const drone = createTrackForInstrument('drone', 1);
      drone.notes = melody('D', 'dorian', 2, [[0, 0, 16, 0.55]]);
      const air = createTrackForInstrument('atmosphere', 2);
      air.notes = [{ ...createNote(degree('D', 'dorian', 5, 5), 0, 8, 0.4), }];
      return assemble(
        { id: 'celestial-ambient', name: 'Celestial Ambient', description: '', accent: '#22D3EE', tempo: 72, key: 'D', scale: 'dorian' },
        [pad, drone, air],
        0.74,
      );
    },
  },
  {
    id: 'neon-synth',
    name: 'Neon Synth',
    description: 'Wide supersaw lead, driving bass, four-on-the-floor.',
    accent: '#C86BFF',
    tempo: 128,
    key: 'A',
    scale: 'minor',
    build: () => {
      const lead = createTrackForInstrument('supersaw', 0);
      lead.notes = melody('A', 'minor', 4, [
        [0, 0, 1.5, 0.85], [2, 1.5, 0.5, 0.7], [4, 2, 1.5, 0.82], [3, 3.5, 0.5, 0.68],
        [2, 4, 1.5, 0.8], [0, 5.5, 0.5, 0.66], [4, 6, 2, 0.86],
      ]);
      const bass = createTrackForInstrument('synth-bass', 1);
      bass.notes = melody('A', 'minor', 2, [
        [0, 0, 0.75, 0.9], [0, 1, 0.75, 0.7], [0, 2, 0.75, 0.86], [0, 3, 0.75, 0.68],
        [3, 4, 0.75, 0.9], [3, 5, 0.75, 0.7], [4, 6, 1.5, 0.88],
      ]);
      const drums = drumTrack('kick', {
        kick: [0, 4, 8, 12],
        snare: [4, 12],
        'closed-hat': [2, 6, 10, 14],
        'open-hat': [14],
      });
      return assemble(
        { id: 'neon-synth', name: 'Neon Synth', description: '', accent: '#C86BFF', tempo: 128, key: 'A', scale: 'minor' },
        [lead, bass, drums],
        0.78,
      );
    },
  },
  {
    id: 'lo-fi-evening',
    name: 'Lo-Fi Evening',
    description: 'Relaxed Rhodes, soft bass and vinyl hiss. Swung.',
    accent: '#5BA8F5',
    tempo: 82,
    key: 'F',
    scale: 'dorian',
    build: () => {
      const keys = createTrackForInstrument('rhodes', 0);
      keys.notes = melody('F', 'dorian', 4, [
        [0, 0, 1, 0.72], [3, 1, 0.5, 0.6], [2, 1.5, 2.5, 0.78],
        [4, 4, 1, 0.7], [6, 5, 0.5, 0.58], [5, 5.5, 2.5, 0.75],
      ]);
      const bass = createTrackForInstrument('finger-bass', 1);
      bass.notes = melody('F', 'dorian', 2, [
        [0, 0, 1.5, 0.85], [5, 2, 1.5, 0.72], [3, 4, 1.5, 0.84], [4, 6, 1.5, 0.74],
      ]);
      const hiss = createTrackForInstrument('vinyl', 2);
      hiss.notes = [createNote(60, 0, 8, 0.34)];
      hiss.volume = 0.4;
      const drums = drumTrack('kick', {
        kick: [0, 6, 8],
        snare: [4, 12],
        'closed-hat': [0, 2, 4, 6, 8, 10, 12, 14],
      }, 0.66);
      return assemble(
        { id: 'lo-fi-evening', name: 'Lo-Fi Evening', description: '', accent: '#5BA8F5', tempo: 82, key: 'F', scale: 'dorian' },
        [keys, bass, hiss, drums],
        0.76,
        0.32,
      );
    },
  },
  {
    id: 'cinematic-rise',
    name: 'Cinematic Rise',
    description: 'String swell building into a sweeping impact.',
    accent: '#3FB49A',
    tempo: 90,
    key: 'C',
    scale: 'minor',
    build: () => {
      const strings = createTrackForInstrument('string-ensemble', 0);
      strings.notes = melody('C', 'minor', 3, [
        [0, 0, 4, 0.5], [2, 4, 4, 0.62], [4, 8, 8, 0.78],
      ]);
      const riser = createTrackForInstrument('sweep', 1);
      riser.notes = [createNote(60, 8, 8, 0.6)];
      riser.volume = 0.5;
      const hit = createTrackForInstrument('impact', 2);
      hit.notes = [createNote(36, 16, 4, 0.95)];
      const drums = drumTrack('kick', { crash: [16], tom: [12] }, 0.7);
      return assemble(
        { id: 'cinematic-rise', name: 'Cinematic Rise', description: '', accent: '#3FB49A', tempo: 90, key: 'C', scale: 'minor' },
        [strings, riser, hit, drums],
        0.76,
      );
    },
  },
  {
    id: 'midnight-jazz',
    name: 'Midnight Jazz',
    description: 'Electric piano voicings over a walking bass.',
    accent: '#E9B444',
    tempo: 104,
    key: 'G',
    scale: 'dorian',
    build: () => {
      const keys = createTrackForInstrument('electric-piano', 0);
      keys.notes = [
        ...melody('G', 'dorian', 4, [[0, 0, 1.5, 0.74], [2, 1.5, 0.5, 0.6], [4, 2, 2, 0.72]]),
        ...melody('G', 'dorian', 4, [[3, 4, 1.5, 0.7], [5, 5.5, 0.5, 0.58], [6, 6, 2, 0.68]]),
      ];
      const bass = createTrackForInstrument('finger-bass', 1);
      bass.notes = melody('G', 'dorian', 2, [
        [0, 0, 1, 0.85], [2, 1, 1, 0.7], [4, 2, 1, 0.78], [6, 3, 1, 0.7],
        [5, 4, 1, 0.84], [3, 5, 1, 0.7], [2, 6, 1, 0.78], [0, 7, 1, 0.72],
      ]);
      const drums = drumTrack('kick', {
        kick: [0, 8],
        snare: [4, 12],
        'closed-hat': [2, 6, 10, 14],
        perc: [3, 11],
      }, 0.62);
      return assemble(
        { id: 'midnight-jazz', name: 'Midnight Jazz', description: '', accent: '#E9B444', tempo: 104, key: 'G', scale: 'dorian' },
        [keys, bass, drums],
        0.78,
        0.24,
      );
    },
  },
  {
    id: 'minimal-pulse',
    name: 'Minimal Pulse',
    description: 'One plucked figure, a sub bass and a tight pulse.',
    accent: '#8B5CF6',
    tempo: 120,
    key: 'E',
    scale: 'minor-pentatonic',
    build: () => {
      const figure: [number, number, number, number?][] = [
        [0, 0, 0.24, 0.8], [0, 0.5, 0.24, 0.62], [2, 1, 0.24, 0.78], [0, 1.5, 0.24, 0.6],
        [3, 2, 0.24, 0.76], [0, 2.5, 0.24, 0.58], [2, 3, 0.24, 0.74], [4, 3.5, 0.24, 0.6],
      ];
      const pluck = createTrackForInstrument('pluck-synth', 0);
      pluck.notes = [
        ...melody('E', 'minor-pentatonic', 4, figure),
        ...melody('E', 'minor-pentatonic', 4, figure.map(([d, s, len, v]) => [d, s + 4, len, v] as [number, number, number, number?])),
      ];
      const bass = createTrackForInstrument('sub-bass', 1);
      bass.notes = melody('E', 'minor-pentatonic', 2, [
        [0, 0, 2, 0.9], [0, 2, 2, 0.7], [0, 4, 2, 0.88], [3, 6, 2, 0.72],
      ]);
      const drums = drumTrack('kick', {
        kick: [0, 8],
        clap: [4, 12],
        'closed-hat': [0, 2, 4, 6, 8, 10, 12, 14],
      }, 0.72);
      return assemble(
        { id: 'minimal-pulse', name: 'Minimal Pulse', description: '', accent: '#8B5CF6', tempo: 120, key: 'E', scale: 'minor-pentatonic' },
        [pluck, bass, drums],
        0.78,
      );
    },
  },
];