/**
 * Music Lab store.
 *
 * Three clearly separated concerns, so a knob move does not re-render the
 * timeline and a playhead tick does not re-render the mixer:
 *
 *   project  — serialisable, undoable, saved to localStorage
 *   ui       — panel visibility, selection, editor level (never saved)
 *   runtime  — transport mirrors (playing / audioReady / loop), written rarely
 *
 * The playhead is deliberately NOT here: it is read from the audio clock by the
 * one component that draws it, so it never causes React renders at 60 fps.
 */

import { create } from 'zustand';
import {
  MUSIC_LAB_INSTRUMENTS,
  createDefaultTrack,
  createTrackForInstrument,
  getMusicLabInstrument,
  musicLabId,
  type MusicLabCategory,
  type MusicLabParameters,
  type MusicLabNote,
  type MusicLabTrack,
} from '../data/musicLabInstruments';
import { parameterDescription } from '../utils/musicLabEquation';
import {
  createEmptyProject,
  createStarterProject,
  loadFavourites,
  loadProject,
  pushHistory,
  readAutosave,
  saveFavourites,
  saveProject,
  writeAutosave,
  type HistoryEntry,
  type MusicLabPreset,
  type MusicLabProject,
  type SaveStatus,
} from '../utils/musicLabProject';

export type GraphMode = 'waveform' | 'spectrum' | 'equation' | 'lissajous' | 'particles';
export type EditorLevel = 'beginner' | 'advanced';
export type WorkspacePanel = 'timeline' | 'notes' | 'drums' | 'graph' | 'mixer' | 'inspector';
export type LibraryFilter = 'all' | 'favourites' | MusicLabCategory;

/** Autosave is debounced so dragging a note does not hammer localStorage. */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Snapshot the current project before a mutation, and truncate redo. */
function withHistory(
  state: MusicLabState,
  next: MusicLabProject,
  historyLabel?: string,
  equation?: string,
): Partial<MusicLabState> {
  return {
    project: { ...next, updatedAt: Date.now() },
    past: [...state.past, state.project].slice(-40),
    future: [],
    history: historyLabel
      ? pushHistory(state.history, historyLabel, equation ?? '')
      : state.history,
  };
}

function scheduleAutosave(project: MusicLabProject): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    writeAutosave(project);
    autosaveTimer = null;
  }, 900);
}

export interface MusicLabState {
  /* ── project ── */
  project: MusicLabProject;
  past: MusicLabProject[];
  future: MusicLabProject[];
  history: HistoryEntry[];

  /* ── ui ── */
  selectedTrackId: string | null;
  selectedNoteIds: string[];
  activePanel: WorkspacePanel;
  libraryFilter: LibraryFilter;
  search: string;
  favourites: string[];
  editorLevel: EditorLevel;
  visualizerMode: GraphMode;
  selectedDrumRow: number;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  xyPadOpen: boolean;
  showShortcuts: boolean;
  snapEnabled: boolean;
  zoom: number;

  /* ── runtime mirrors ── */
  playing: boolean;
  loop: boolean;
  audioReady: boolean;
  rendering: boolean;
  saveStatus: SaveStatus;
  message: string;

  /* ─ actions ── */
  replaceProject: (project: MusicLabProject, label?: string) => void;
  hydrate: () => void;
  patchProject: (patch: Partial<MusicLabProject>) => void;
  setTempo: (tempo: number) => void;
  renameProject: (name: string) => void;
  loadPreset: (preset: MusicLabPreset) => void;
  startFromScratch: () => void;

  addInstrument: (instrumentId: string) => MusicLabTrack;
  addDrumKit: () => MusicLabTrack;
  removeTrack: (trackId: string) => void;
  duplicateTrack: (trackId: string) => void;
  selectTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<MusicLabTrack>) => void;

  updateParams: (trackId: string, key: keyof MusicLabParameters, value: number) => void;
  patchParams: (trackId: string, patch: Partial<MusicLabParameters>) => void;
  resetParams: (trackId: string) => void;
  randomiseTrack: (trackId: string) => void;

  addNote: (trackId: string, note: Partial<MusicLabNote>) => MusicLabNote | null;
  updateNotes: (trackId: string, ids: string[], patch: Partial<MusicLabNote>) => void;
  deleteNotes: (trackId: string, ids: string[]) => void;
  duplicateNotes: (trackId: string, ids: string[]) => void;
  clearNotes: (trackId: string) => void;
  setNoteSelection: (ids: string[]) => void;

  toggleDrumStep: (trackId: string, row: number, step: number) => void;
  setDrumStep: (
    trackId: string,
    row: number,
    step: number,
    patch: Partial<{ on: boolean; velocity: number; probability: number }>,
  ) => void;
  clearDrumLane: (trackId: string, row: number) => void;
  clearDrumPattern: (trackId: string) => void;
  selectDrumRow: (row: number) => void;

  setFavourites: (ids: string[]) => void;
  toggleFavourite: (instrumentId: string) => void;
  setSearch: (search: string) => void;
  setLibraryFilter: (filter: LibraryFilter) => void;
  setEditorLevel: (level: EditorLevel) => void;
  setVisualizerMode: (mode: GraphMode) => void;
  setActivePanel: (panel: WorkspacePanel) => void;
  setLibraryOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setXyPadOpen: (open: boolean) => void;
  setShowShortcuts: (open: boolean) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setZoom: (zoom: number) => void;

  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  setAudioReady: (ready: boolean) => void;
  setRendering: (rendering: boolean) => void;
  setSaveStatus: (status: SaveStatus) => void;
  notify: (message: string) => void;

  save: () => boolean;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useMusicLabStore = create<MusicLabState>((set, get) => ({
  project: createStarterProject(),
  past: [],
  future: [],
  history: [],

  selectedTrackId: null,
  selectedNoteIds: [],
  activePanel: 'timeline',
  libraryFilter: 'all',
  search: '',
  favourites: [],
  editorLevel: 'beginner',
  visualizerMode: 'waveform',
  selectedDrumRow: 0,
  libraryOpen: false,
  inspectorOpen: false,
  xyPadOpen: false,
  showShortcuts: false,
  snapEnabled: true,
  zoom: 1,

  playing: false,
  loop: true,
  audioReady: false,
  rendering: false,
  saveStatus: 'idle',
  message: 'Ready when you are.',

  replaceProject: (project, label) => set((state) => ({
    ...withHistory(state, project, label),
    selectedTrackId: project.tracks[0]?.id ?? null,
    selectedNoteIds: [],
  })),

  /** Restores a saved or autosaved session, then selects the first track. */
  hydrate: () => {
    const stored = loadProject() ?? readAutosave();
    set((state) => {
      const project = stored ?? state.project;
      return {
        project,
        favourites: loadFavourites(),
        selectedTrackId: project.tracks[0]?.id ?? null,
        message: stored ? 'Session restored from this browser.' : state.message,
      };
    });
  },

  patchProject: (patch) => set((state) => {
    const next = { ...state.project, ...patch };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  setTempo: (tempo) => set((state) => {
    const next = { ...state.project, tempo: Math.max(40, Math.min(240, Math.round(tempo))) };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  renameProject: (name) => set((state) => {
    const next = { ...state.project, name: name.trim() || 'Untitled Study' };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  loadPreset: (preset) => set((state) => {
    const project = preset.build();
    scheduleAutosave(project);
    return {
      ...withHistory(state, project, `Preset — ${preset.name}`),
      selectedTrackId: project.tracks[0]?.id ?? null,
      selectedNoteIds: [],
      message: `${preset.name} loaded.`,
      activePanel: 'timeline',
    };
  }),

  startFromScratch: () => set((state) => {
    const project = createEmptyProject('Untitled Study');
    scheduleAutosave(project);
    return {
      ...withHistory(state, project, 'New empty project'),
      selectedTrackId: null,
      selectedNoteIds: [],
      message: 'Empty project. Add an instrument to begin.',
    };
  }),

  addInstrument: (instrumentId) => {
    const state = get();
    const track = createTrackForInstrument(instrumentId, state.project.tracks.length);
    const next = { ...state.project, tracks: [...state.project.tracks, track] };
    set({
      ...withHistory(state, next, `Add ${track.name}`),
      selectedTrackId: track.id,
      message: `${track.name} added.`,
    });
    scheduleAutosave(next);
    return track;
  },

  addDrumKit: () => {
    const state = get();
    const track = createDefaultTrack(0, 'kick');
    track.kind = 'drums';
    track.name = 'Drums';
    const next = { ...state.project, tracks: [...state.project.tracks, track] };
    set({
      ...withHistory(state, next, 'Add drum kit'),
      selectedTrackId: track.id,
      activePanel: 'drums',
      message: 'Drum kit added.',
    });
    scheduleAutosave(next);
    return track;
  },

  removeTrack: (trackId) => set((state) => {
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    const next = {
      ...state.project,
      tracks: state.project.tracks.filter((candidate) => candidate.id !== trackId),
    };
    scheduleAutosave(next);
    return {
      ...withHistory(state, next, `Remove ${track?.name ?? 'track'}`),
      selectedTrackId: next.tracks[0]?.id ?? null,
      selectedNoteIds: [],
      message: `${track?.name ?? 'Track'} removed.`,
    };
  }),

  duplicateTrack: (trackId) => set((state) => {
    const source = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!source) return {};
    const copy: MusicLabTrack = {
      ...source,
      id: musicLabId('track'),
      name: `${source.name} copy`,
      notes: source.notes.map((note) => ({ ...note, id: musicLabId('note') })),
      steps: source.steps.map((lane) => lane.map((step) => ({ ...step }))),
      params: { ...source.params },
    };
    const next = { ...state.project, tracks: [...state.project.tracks, copy] };
    scheduleAutosave(next);
    return {
      ...withHistory(state, next, `Duplicate ${source.name}`),
      selectedTrackId: copy.id,
    };
  }),

  selectTrack: (trackId) => set((state) => ({
    selectedTrackId: trackId,
    selectedNoteIds: state.selectedTrackId === trackId ? state.selectedNoteIds : [],
  })),

  updateTrack: (trackId, patch) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId ? { ...track, ...patch } : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  updateParams: (trackId, key, value) => set((state) => {
    if (!state.project.tracks.some((track) => track.id === trackId)) return {};
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? { ...track, params: { ...track.params, [key]: value } }
          : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next, parameterDescription(key, value));
  }),

  patchParams: (trackId, patch) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? { ...track, params: { ...track.params, ...patch } }
          : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  resetParams: (trackId) => set((state) => {
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return {};
    const instrument = getMusicLabInstrument(track.instrumentId);
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((candidate) => (
        candidate.id === trackId ? { ...candidate, params: { ...instrument.defaults } } : candidate
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next, `Reset ${instrument.name} to its base equation`);
  }),

  /**
   * SURPRISE ME. Reshapes the existing partial ladder rather than swapping in a
   * different instrument, so the equation panel and the audio stay in step.
   */
  randomiseTrack: (trackId) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? {
            ...track,
            params: {
              ...track.params,
              brightness: 20 + Math.round(Math.random() * 70),
              warmth: 20 + Math.round(Math.random() * 70),
              harmonics: 30 + Math.round(Math.random() * 65),
              distortion: Math.random() < 0.4 ? Math.round(Math.random() * 40) : 0,
              fm: Math.random() < 0.3 ? Math.round(Math.random() * 60) : 0,
              am: Math.random() < 0.2 ? Math.round(Math.random() * 40) : 0,
              filter: 30 + Math.round(Math.random() * 65),
              sub: Math.random() < 0.3 ? Math.round(Math.random() * 60) : 0,
            },
          }
          : track
      )),
    };
    scheduleAutosave(next);
    return {
      ...withHistory(state, next, 'Surprise me — new equation'),
      message: 'New mathematical starting point generated.',
    };
  }),

  addNote: (trackId, note) => {
    const state = get();
    if (!state.project.tracks.some((track) => track.id === trackId)) return null;
    const created: MusicLabNote = {
      id: musicLabId('note'),
      pitch: note.pitch ?? 60,
      start: note.start ?? 0,
      duration: note.duration ?? 1,
      velocity: note.velocity ?? 0.8,
    };
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId ? { ...track, notes: [...track.notes, created] } : track
      )),
    };
    set({ ...withHistory(state, next), selectedNoteIds: [created.id] });
    scheduleAutosave(next);
    return created;
  },

  updateNotes: (trackId, ids, patch) => set((state) => {
    const idSet = new Set(ids);
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? {
            ...track,
            notes: track.notes.map((note) => (idSet.has(note.id) ? { ...note, ...patch } : note)),
          }
          : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  deleteNotes: (trackId, ids) => set((state) => {
    const idSet = new Set(ids);
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? { ...track, notes: track.notes.filter((note) => !idSet.has(note.id)) }
          : track
      )),
    };
    scheduleAutosave(next);
    return {
      ...withHistory(state, next, `Delete ${ids.length} note${ids.length === 1 ? '' : 's'}`),
      selectedNoteIds: [],
    };
  }),

  duplicateNotes: (trackId, ids) => set((state) => {
    const idSet = new Set(ids);
    const track = state.project.tracks.find((candidate) => candidate.id === trackId);
    if (!track) return {};
    const source = track.notes.filter((note) => idSet.has(note.id));
    if (!source.length) return {};
    const first = Math.min(...source.map((note) => note.start));
    const span = Math.max(...source.map((note) => note.start + note.duration)) - first;
    const offset = Math.max(0.5, span);
    const copies = source.map((note) => ({ ...note, id: musicLabId('note'), start: note.start + offset }));
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((candidate) => (
        candidate.id === trackId ? { ...candidate, notes: [...candidate.notes, ...copies] } : candidate
      )),
    };
    scheduleAutosave(next);
    return {
      ...withHistory(state, next, `Duplicate ${copies.length} note${copies.length === 1 ? '' : 's'}`),
      selectedNoteIds: copies.map((note) => note.id),
    };
  }),

  clearNotes: (trackId) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId ? { ...track, notes: [] } : track
      )),
    };
    scheduleAutosave(next);
    return { ...withHistory(state, next, 'Clear all notes'), selectedNoteIds: [] };
  }),

  setNoteSelection: (ids) => set({ selectedNoteIds: ids }),

  toggleDrumStep: (trackId, row, step) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => {
        if (track.id !== trackId || !track.steps[row]?.[step]) return track;
        return {
          ...track,
          steps: track.steps.map((lane, rowIndex) => (
            rowIndex === row
              ? lane.map((cell, stepIndex) => (stepIndex === step ? { ...cell, on: !cell.on } : cell))
              : lane
          )),
        };
      }),
    };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  setDrumStep: (trackId, row, step, patch) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? {
            ...track,
            steps: track.steps.map((lane, rowIndex) => (
              rowIndex === row
                ? lane.map((cell, stepIndex) => (stepIndex === step ? { ...cell, ...patch } : cell))
                : lane
            )),
          }
          : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next);
  }),

  clearDrumLane: (trackId, row) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? {
            ...track,
            steps: track.steps.map((lane, rowIndex) => (
              rowIndex === row ? lane.map((cell) => ({ ...cell, on: false })) : lane
            )),
          }
          : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next, 'Clear drum lane');
  }),

  clearDrumPattern: (trackId) => set((state) => {
    const next = {
      ...state.project,
      tracks: state.project.tracks.map((track) => (
        track.id === trackId
          ? { ...track, steps: track.steps.map((lane) => lane.map((cell) => ({ ...cell, on: false }))) }
          : track
      )),
    };
    scheduleAutosave(next);
    return withHistory(state, next, 'Clear drum pattern');
  }),

  selectDrumRow: (row) => set({ selectedDrumRow: row }),

  setFavourites: (ids) => {
    saveFavourites(ids);
    set({ favourites: ids });
  },

  toggleFavourite: (instrumentId) => {
    const current = get().favourites;
    const next = current.includes(instrumentId)
      ? current.filter((id) => id !== instrumentId)
      : [...current, instrumentId];
    saveFavourites(next);
    set({ favourites: next });
  },

  setSearch: (search) => set({ search }),
  setLibraryFilter: (libraryFilter) => set({ libraryFilter }),
  setEditorLevel: (editorLevel) => set({ editorLevel }),
  setVisualizerMode: (visualizerMode) => set({ visualizerMode }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setXyPadOpen: (xyPadOpen) => set({ xyPadOpen }),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, zoom)) }),

  setPlaying: (playing) => set({ playing }),
  setLoop: (loop) => set({ loop }),
  setAudioReady: (audioReady) => set({ audioReady }),
  setRendering: (rendering) => set({ rendering }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  notify: (message) => set({ message }),

  save: () => {
    const ok = saveProject(get().project);
    set({
      saveStatus: ok ? 'saved' : 'error',
      message: ok ? 'Project saved in this browser.' : 'Could not save — storage unavailable.',
    });
    return ok;
  },

  undo: () => set((state) => {
    const previous = state.past[state.past.length - 1];
    if (!previous) return {};
    return {
      project: previous,
      past: state.past.slice(0, -1),
      future: [state.project, ...state.future].slice(0, 40),
      message: 'Undo.',
    };
  }),

  redo: () => set((state) => {
    const next = state.future[0];
    if (!next) return {};
    return {
      project: next,
      past: [...state.past, state.project].slice(-40),
      future: state.future.slice(1),
      message: 'Redo.',
    };
  }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

/* ─────────────────────────── derived selectors ─────────────────────────── */

export function selectSelectedTrack(state: MusicLabState): MusicLabTrack | null {
  return state.project.tracks.find((track) => track.id === state.selectedTrackId) ?? null;
}

/** Instrument browser filtering, kept out of components. */
export function filteredInstruments(
  filter: LibraryFilter,
  search: string,
  favourites: string[],
) {
  const query = search.trim().toLowerCase();
  return MUSIC_LAB_INSTRUMENTS.filter((instrument) => {
    if (filter === 'favourites' && !favourites.includes(instrument.id)) return false;
    if (filter !== 'all' && filter !== 'favourites' && instrument.category !== filter) return false;
    if (!query) return true;
    return instrument.name.toLowerCase().includes(query)
      || instrument.category.includes(query)
      || instrument.synthesis.includes(query)
      || instrument.blurb.toLowerCase().includes(query);
  });
}