import { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import type { MusicLabProject, MusicLabTrack, MusicLabNote, MusicLabInstrument } from './types';

const STORAGE_KEY = 'music-lab-project-v1';

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyProject(): MusicLabProject {
  return {
    name: 'Untitled',
    tempo: 120,
    tracks: [],
    masterVolume: 0.8,
    snap: 0.25,
  };
}

function loadProject(): MusicLabProject {
  if (typeof window === 'undefined') return createEmptyProject();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return createEmptyProject();
}

function saveProject(project: MusicLabProject) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {}
}

function createEmptyDrumSteps(): { on: boolean; velocity: number; probability: number }[][] {
  const rows = 8;
  const steps = 16;
  return Array.from({ length: rows }, () => 
    Array.from({ length: steps }, () => ({ on: false, velocity: 0.8, probability: 1 }))
  );
}

type Action =
  | { type: 'SET_PROJECT'; payload: MusicLabProject }
  | { type: 'SET_TEMPO'; payload: number }
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_TRACK'; payload: { instrument: MusicLabInstrument } }
  | { type: 'REMOVE_TRACK'; payload: string }
  | { type: 'UPDATE_TRACK'; payload: { id: string; changes: Partial<MusicLabTrack> } }
  | { type: 'ADD_NOTE'; payload: { trackId: string; note: MusicLabNote } }
  | { type: 'UPDATE_NOTE'; payload: { trackId: string; noteId: string; changes: Partial<MusicLabNote> } }
  | { type: 'DELETE_NOTE'; payload: { trackId: string; noteId: string } }
  | { type: 'SET_MASTER_VOLUME'; payload: number }
  | { type: 'SET_SNAP'; payload: number }
  | { type: 'SET_PANEL'; payload: 'timeline' | 'notes' | 'drums' | 'graph' | 'mixer' | 'inspector' }
  | { type: 'SET_SELECTED_TRACK'; payload: string | null };

interface State {
  project: MusicLabProject;
  selectedTrackId: string | null;
  activePanel: 'timeline' | 'notes' | 'drums' | 'graph' | 'mixer' | 'inspector';
  playing: boolean;
  loop: boolean;
  audioReady: boolean;
}

function reducer(state: State, action: Action): State {
  let nextProject = state.project;
  let nextSelectedTrackId = state.selectedTrackId;
  let nextActivePanel = state.activePanel;

  switch (action.type) {
    case 'SET_PROJECT':
      nextProject = action.payload;
      break;
    case 'SET_TEMPO':
      nextProject = { ...state.project, tempo: Math.max(40, Math.min(240, Math.round(action.payload))) };
      break;
    case 'SET_NAME':
      nextProject = { ...state.project, name: action.payload };
      break;
    case 'ADD_TRACK': {
      const { instrument } = action.payload;
      const newTrack: MusicLabTrack = {
        id: generateId(),
        instrumentId: instrument.id,
        name: instrument.name,
        kind: instrument.category === 'drums' ? 'drums' : 'notes',
        notes: [],
        steps: instrument.category === 'drums' ? createEmptyDrumSteps() : [],
        volume: 0.8,
        pan: 0,
        muted: false,
        solo: false,
        params: { ...instrument.defaults },
      };
      nextProject = { ...state.project, tracks: [...state.project.tracks, newTrack] };
      nextSelectedTrackId = newTrack.id;
      break;
    }
    case 'REMOVE_TRACK':
      nextProject = { ...state.project, tracks: state.project.tracks.filter(t => t.id !== action.payload) };
      if (state.selectedTrackId === action.payload) {
        nextSelectedTrackId = state.project.tracks[0]?.id || null;
      }
      break;
    case 'UPDATE_TRACK':
      nextProject = {
        ...state.project,
        tracks: state.project.tracks.map(t => t.id === action.payload.id ? { ...t, ...action.payload.changes } : t),
      };
      break;
    case 'ADD_NOTE':
      nextProject = {
        ...state.project,
        tracks: state.project.tracks.map(t => 
          t.id === action.payload.trackId ? { ...t, notes: [...t.notes, action.payload.note] } : t
        ),
      };
      break;
    case 'UPDATE_NOTE':
      nextProject = {
        ...state.project,
        tracks: state.project.tracks.map(t => 
          t.id === action.payload.trackId 
            ? { ...t, notes: t.notes.map(n => n.id === action.payload.noteId ? { ...n, ...action.payload.changes } : n) }
            : t
        ),
      };
      break;
    case 'DELETE_NOTE':
      nextProject = {
        ...state.project,
        tracks: state.project.tracks.map(t =>
          t.id === action.payload.trackId
            ? { ...t, notes: t.notes.filter(n => n.id !== action.payload.noteId) }
            : t
        ),
      };
      break;
    case 'SET_MASTER_VOLUME':
      nextProject = { ...state.project, masterVolume: Math.max(0, Math.min(1, action.payload)) };
      break;
    case 'SET_SNAP':
      nextProject = { ...state.project, snap: action.payload };
      break;
    case 'SET_PANEL':
      nextActivePanel = action.payload;
      break;
    case 'SET_SELECTED_TRACK':
      nextSelectedTrackId = action.payload;
      break;
  }

  const nextState = { ...state, project: nextProject, selectedTrackId: nextSelectedTrackId, activePanel: nextActivePanel };
  saveProject(nextProject);
  return nextState;
}

const initialState: State = {
  project: createEmptyProject(),
  selectedTrackId: null,
  activePanel: 'timeline',
  playing: false,
  loop: true,
  audioReady: false,
};

const MusicLabContext = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
  getInstrument: (id: string) => MusicLabInstrument;
  addTrack: (instrument: MusicLabInstrument) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, changes: Partial<MusicLabTrack>) => void;
  addNote: (trackId: string, note: Omit<MusicLabNote, 'id'>) => void;
  updateNote: (trackId: string, noteId: string, changes: Partial<MusicLabNote>) => void;
  deleteNote: (trackId: string, noteId: string) => void;
  setTempo: (tempo: number) => void;
  setName: (name: string) => void;
  setMasterVolume: (vol: number) => void;
  setSnap: (snap: number) => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  setAudioReady: (ready: boolean) => void;
  setSelectedTrack: (id: string | null) => void;
  setActivePanel: (panel: State['activePanel']) => void;
} | null>(null);

export function MusicLabProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const loaded = loadProject();
    dispatch({ type: 'SET_PROJECT', payload: loaded });
  }, []);

  const { MUSIC_LAB_INSTRUMENTS } = require('./presets');

  const getInstrument = (id: string) => MUSIC_LAB_INSTRUMENTS.find((i: MusicLabInstrument) => i.id === id) || MUSIC_LAB_INSTRUMENTS[0];

  const addTrack = (instrument: MusicLabInstrument) => dispatch({ type: 'ADD_TRACK', payload: { instrument } });
  const removeTrack = (id: string) => dispatch({ type: 'REMOVE_TRACK', payload: id });
  const updateTrack = (id: string, changes: Partial<MusicLabTrack>) => dispatch({ type: 'UPDATE_TRACK', payload: { id, changes } });
  const addNote = (trackId: string, note: Omit<MusicLabNote, 'id'>) => dispatch({ type: 'ADD_NOTE', payload: { trackId, note: { ...note, id: generateId() } } });
  const updateNote = (trackId: string, noteId: string, changes: Partial<MusicLabNote>) => dispatch({ type: 'UPDATE_NOTE', payload: { trackId, noteId, changes } });
  const deleteNote = (trackId: string, noteId: string) => dispatch({ type: 'DELETE_NOTE', payload: { trackId, noteId } });
  const setTempo = (tempo: number) => dispatch({ type: 'SET_TEMPO', payload: tempo });
  const setName = (name: string) => dispatch({ type: 'SET_NAME', payload: name });
  const setMasterVolume = (vol: number) => dispatch({ type: 'SET_MASTER_VOLUME', payload: vol });
  const setSnap = (snap: number) => dispatch({ type: 'SET_SNAP', payload: snap });
  const setPlaying = (playing: boolean) => { /* handled by transport */ };
  const setLoop = (loop: boolean) => { /* handled by transport */ };
  const setAudioReady = (ready: boolean) => { /* handled by transport */ };
  const setSelectedTrack = (id: string | null) => dispatch({ type: 'SET_SELECTED_TRACK', payload: id });
  const setActivePanel = (panel: State['activePanel']) => dispatch({ type: 'SET_PANEL', payload: panel });

  return (
    <MusicLabContext.Provider value={{ state, dispatch, getInstrument, addTrack, removeTrack, updateTrack, addNote, updateNote, deleteNote, setTempo, setName, setMasterVolume, setSnap, setPlaying, setLoop, setAudioReady, setSelectedTrack, setActivePanel }}>
      {children}
    </MusicLabContext.Provider>
  );
}

export function useMusicLab() {
  const ctx = useContext(MusicLabContext);
  if (!ctx) throw new Error('useMusicLab must be used within MusicLabProvider');
  return ctx;
}