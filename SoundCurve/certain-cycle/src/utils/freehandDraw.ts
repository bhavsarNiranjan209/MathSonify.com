/** Shared, DOM-free data contract for the standalone freehand Draw page. */
export type DrawAction =
  | { type: 'draw'; index: number; stroke: FreehandStroke }
  | { type: 'erase'; index: number; stroke: FreehandStroke };

export interface DrawHistory {
  undo: DrawAction[];
  redo: DrawAction[];
}

export const EMPTY_DRAW_HISTORY: DrawHistory = { undo: [], redo: [] };

/** Record a new user action. Standard history semantics clear redo immediately. */
export function pushDrawAction(history: DrawHistory, action: DrawAction): DrawHistory {
  return { undo: [...history.undo, action], redo: [] };
}

function removeStrokeAt(strokes: FreehandStroke[], action: DrawAction): FreehandStroke[] {
  const next = [...strokes];
  const expectedId = action.stroke.id;
  const index = next.findIndex((stroke) => stroke.id === expectedId);
  if (index >= 0) next.splice(index, 1);
  return next;
}

function restoreStrokeAt(strokes: FreehandStroke[], action: DrawAction): FreehandStroke[] {
  const next = [...strokes];
  next.splice(Math.min(action.index, next.length), 0, action.stroke);
  return next;
}

/** Undo the newest action and make it available for redo. */
export function undoDrawAction(
  strokes: FreehandStroke[],
  history: DrawHistory,
): { strokes: FreehandStroke[]; history: DrawHistory } | null {
  const action = history.undo.at(-1);
  if (!action) return null;
  const next = action.type === 'draw' ? removeStrokeAt(strokes, action) : restoreStrokeAt(strokes, action);
  return {
    strokes: next,
    history: {
      undo: history.undo.slice(0, -1),
      redo: [action, ...history.redo],
    },
  };
}

/** Redo the most recently undone action. */
export function redoDrawAction(
  strokes: FreehandStroke[],
  history: DrawHistory,
): { strokes: FreehandStroke[]; history: DrawHistory } | null {
  const action = history.redo[0];
  if (!action) return null;
  const next = action.type === 'draw' ? restoreStrokeAt(strokes, action) : removeStrokeAt(strokes, action);
  return {
    strokes: next,
    history: {
      undo: [...history.undo, action],
      redo: history.redo.slice(1),
    },
  };
}

export interface FreehandPoint {
  /** Normalised canvas coordinates: 0..1, origin at top-left. */
  x: number;
  y: number;
  /** Milliseconds from the beginning of the drawing session. */
  t: number;
}


export type DrawInstrument = 'sine' | 'triangle';

export interface FreehandStroke {
  id: string;
  color: string;
  instrument: DrawInstrument;
  /** Stroke width in CSS pixels, captured when the stroke begins. */
  brushSize: number;
  points: FreehandPoint[];
}

/** Fourteen distinct inks; only gentle sine/triangle voices are used. */
export const DRAW_PALETTE: ReadonlyArray<{
  color: string;
  instrument: DrawInstrument;
  name: string;
  waveform: string;
}> = [
  { color: '#e11d48', instrument: 'sine', name: 'Ruby', waveform: 'Pure sine' },
  { color: '#f97316', instrument: 'triangle', name: 'Tangerine', waveform: 'Soft triangle' },
  { color: '#d97706', instrument: 'sine', name: 'Amber', waveform: 'Pure sine' },
  { color: '#ca8a04', instrument: 'triangle', name: 'Gold', waveform: 'Soft triangle' },
  { color: '#65a30d', instrument: 'sine', name: 'Lime', waveform: 'Pure sine' },
  { color: '#10b981', instrument: 'triangle', name: 'Emerald', waveform: 'Soft triangle' },
  { color: '#14b8a6', instrument: 'sine', name: 'Teal', waveform: 'Pure sine' },
  { color: '#06b6d4', instrument: 'triangle', name: 'Cyan', waveform: 'Soft triangle' },
  { color: '#3b82f6', instrument: 'sine', name: 'Blue', waveform: 'Pure sine' },
  { color: '#6366f1', instrument: 'triangle', name: 'Indigo', waveform: 'Soft triangle' },
  { color: '#8b5cf6', instrument: 'sine', name: 'Violet', waveform: 'Pure sine' },
  { color: '#d946ef', instrument: 'triangle', name: 'Fuchsia', waveform: 'Soft triangle' },
  { color: '#ec4899', instrument: 'sine', name: 'Pink', waveform: 'Pure sine' },
  { color: '#64748b', instrument: 'triangle', name: 'Slate', waveform: 'Soft triangle' },
];

export const DRAW_STORAGE_KEY = 'mathsonify-freehand-session-v2';
export const DRAW_THEME_STORAGE_KEY = 'mathsonify-draw-theme';
export const DRAW_STORAGE_VERSION = 2;
export const DEFAULT_BRUSH_SIZE = 5;
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 28;
export const MIN_TRANSPOSE = -12;
export const MAX_TRANSPOSE = 12;
export const DEFAULT_SWEEP_SECONDS = 6;
export const MIN_SWEEP_SECONDS = 2;
export const MAX_SWEEP_SECONDS = 12;

const BASE_MIDI = 48; // C3
const PITCH_SPAN = 36; // Three octaves, C3..C6
const MIN_MIDI = 36;
const MAX_MIDI = 96;
const MINOR_PENTATONIC = new Set([0, 3, 5, 7, 10]);

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function canvasYToNormalizedPitch(y: number): number {
  // Canvas y grows down; pitch grows up.
  return clamp(1 - clamp(y, 0, 1), 0, 1);
}

export function quantizeMidiToMinorPentatonic(midi: number): number {
  const target = Math.round(midi);
  for (let distance = 0; distance <= 2; distance++) {
    if (MINOR_PENTATONIC.has((target - distance + 120) % 12)) return target - distance;
    if (MINOR_PENTATONIC.has((target + distance) % 12)) return target + distance;
  }
  return target;
}

/** The single Y→pitch contract used by the always-on scanner. */
export function yToFrequency(y: number, transposeSemitones = 0, snapToScale = true): number {
  const normalized = canvasYToNormalizedPitch(y);
  const rawMidi = BASE_MIDI + normalized * PITCH_SPAN + clamp(transposeSemitones, MIN_TRANSPOSE, MAX_TRANSPOSE);
  const midi = clamp(snapToScale ? quantizeMidiToMinorPentatonic(rawMidi) : rawMidi, MIN_MIDI, MAX_MIDI);
  return clamp(440 * Math.pow(2, (midi - 69) / 12), 20, 12_000);
}

interface SavedSession {
  version: number;
  savedAt: number;
  strokes: FreehandStroke[];
}

export function saveSession(strokes: FreehandStroke[], storage: Pick<Storage, 'setItem'>): void {
  const payload: SavedSession = {
    version: DRAW_STORAGE_VERSION,
    savedAt: Date.now(),
    strokes,
  };
  storage.setItem(DRAW_STORAGE_KEY, JSON.stringify(payload));
}

function isInstrument(value: unknown): value is DrawInstrument {
  return value === 'sine' || value === 'triangle';
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Tolerant decoder: malformed/truncated autosave data becomes an empty session. */
export function loadSession(storage: Pick<Storage, 'getItem'>): FreehandStroke[] {
  try {
    const text = storage.getItem(DRAW_STORAGE_KEY);
    if (!text) return [];
    const parsed = JSON.parse(text) as Partial<SavedSession>;
    if (parsed.version !== DRAW_STORAGE_VERSION || !Array.isArray(parsed.strokes)) return [];

    const strokes: FreehandStroke[] = [];
    for (const raw of parsed.strokes.slice(0, 100)) {
      if (!raw || typeof raw !== 'object' || !isColor(raw.color) || !isInstrument(raw.instrument)) continue;
      if (!Array.isArray(raw.points) || !isFiniteNumber(raw.brushSize)) continue;
      const points: FreehandPoint[] = [];
      let lastT = 0;
      for (const p of raw.points.slice(0, 50_000)) {
        if (!p || !isFiniteNumber(p.x) || !isFiniteNumber(p.y) || !isFiniteNumber(p.t)) continue;
        lastT = Math.max(lastT, p.t, 0);
        points.push({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), t: lastT });
      }
      if (points.length === 0) continue;
      strokes.push({
        id: typeof raw.id === 'string' ? raw.id : `restored-${strokes.length}`,
        color: raw.color,
        instrument: raw.instrument,
        brushSize: clamp(raw.brushSize, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE),
        points,
      });
    }
    return strokes;
  } catch {
    return [];
  }
}

export function clearSession(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(DRAW_STORAGE_KEY);
}
