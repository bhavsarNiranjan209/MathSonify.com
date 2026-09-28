/**
 * SoundLab — equation + catalogue validation.
 *
 * Every composition ships original equations that are parsed by the same
 * mathjs pipeline the player uses, then sampled across the *actual* x-domain
 * the engine renders (which grows with tempo, duration and the tempo slider).
 * A composition only reaches production data if all of its tracks survive
 * that check, so the player can never be handed a NaN or an asymptote.
 *
 * Run via the test suite (`soundLabLibrary.test.ts`).
 *
 * © 2026 MathSonify
 */

import { parseEquation, MUSICAL_SCALES, type ScaleKey } from './equationParser';
import { GENRES, type Composition, type CompositionTrack, type SoundLabAccess } from '../data/compositions';
import type { InstrumentType } from '../store/studioStore';

export interface ValidationIssue {
  compositionId: string;
  /** Track id when the issue is track-scoped, otherwise null. */
  trackId: string | null;
  field: string;
  message: string;
}

/** Instruments the synthesis layer can actually render. */
export const SUPPORTED_INSTRUMENTS: readonly InstrumentType[] = [
  'sine', 'triangle', 'sawtooth', 'square', 'piano', 'pluck',
];

export const SUPPORTED_VOICES = ['frequency', 'note', 'chord', 'rhythm', 'drums'] as const;

export const SUPPORTED_ACCESS: readonly SoundLabAccess[] = [
  'free-preview', 'early-access', 'premium', 'full-release',
];

/**
 * Per-genre BPM windows, kept honest so tempos stay musically plausible.
 * The shipped originals are the source of truth: a window that rejects a
 * released composition is a wrong window, not a wrong composition.
 */
export const GENRE_BPM_RANGE: Record<string, [number, number]> = {
  ambient: [50, 80],
  synthwave: [80, 118],
  classical: [60, 110],
  lofi: [65, 90],
  cinematic: [50, 100],
  world: [70, 120],
  // Minimal runs up to 120 for the rhythmic end of the genre
  // (e.g. the shipped "Echo Chamber" sits at 118).
  minimal: [60, 120],
  idm: [90, 150],
  rock: [90, 150],
  jazz: [80, 160],
  edm: [115, 140],
  rnb: [60, 100],
  reggae: [60, 100],
  latin: [90, 130],
  orchestral: [50, 110],
};

/** Durations the library is allowed to use, in seconds. */
export const ALLOWED_DURATIONS = [7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

/**
 * The x-domain the engine will actually evaluate.
 *
 * `compositionEngine` uses `4π · (bpm/60) · (duration/4) · tempoScale`, and
 * the tempo slider goes to 1.5×. Validating against the widest case means a
 * composition can never blow up only when the listener raises the tempo.
 */
export function engineDomain(composition: Composition, tempoScale = 1.5): number {
  const beatsPerSecond = composition.bpm / 60;
  const domainSpan = 4 * Math.PI * beatsPerSecond * (composition.durationSec / 4);
  return domainSpan * Math.max(1, tempoScale);
}

/**
 * Parse + densely sample one equation across `[0, maxX]`.
 * Returns the issues found (empty array = safe to ship).
 */
export function validateEquation(equation: string, maxX: number, samples = 400): string[] {
  const issues: string[] = [];
  if (!equation || !equation.trim()) return ['equation is empty'];

  const parsed = parseEquation(equation);
  if (!parsed.success || !parsed.evaluate) {
    return [`equation failed to parse: ${parsed.error ?? 'unknown error'}`];
  }

  const evaluate = parsed.evaluate;
  // `parseEquation` caps the engine's own samples at 1e6 before rejecting, but
  // we assert strictly so an asymptote can never quietly reach the graph.
  const LIMIT = 1e4;
  /** A step larger than this between neighbouring samples implies a jump. */
  const JUMP = 50;

  let worst = 0;
  let previous: number | null = null;

  const read = (x: number): number => evaluate(x);
  const bounded = (x: number, y: number): boolean => {
    if (typeof y !== 'number' || Number.isNaN(y)) {
      issues.push(`equation evaluates to NaN near x=${x.toFixed(2)}`);
      return false;
    }
    if (!Number.isFinite(y)) {
      issues.push(`equation diverges to Infinity near x=${x.toFixed(2)}`);
      return false;
    }
    const magnitude = Math.abs(y);
    if (magnitude > worst) worst = magnitude;
    if (magnitude > LIMIT) {
      issues.push(`equation peaks at ${magnitude.toFixed(0)}, above the ${LIMIT} ceiling near x=${x.toFixed(2)}`);
      return false;
    }
    return true;
  };

  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * maxX;
    const y = read(x);
    if (!bounded(x, y)) return issues;

    // A discontinuity (tan / sec asymptote, a pole) can fall between two
    // samples and still look finite at both ends. When two neighbouring
    // samples jump a long way, subdivide that interval to look for the blow-up
    // that uniform sampling stepped over.
    if (previous !== null && Math.abs(y - previous) > JUMP) {
      const from = ((i - 1) / samples) * maxX;
      const step = (x - from) / 24;
      for (let k = 1; k < 24; k++) {
        const midX = from + step * k;
        const midY = read(midX);
        if (!bounded(midX, midY)) return issues;
        if (Math.abs(midY) > JUMP * 4) {
          issues.push(`equation is discontinuous near x=${midX.toFixed(2)} (possible asymptote)`);
          return issues;
        }
      }
    }
    previous = y;
  }

  return issues;
}

/** Field-level checks for a single track. */
function validateTrack(compositionId: string, track: CompositionTrack, maxX: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const at = (field: string, message: string) => issues.push({ compositionId, trackId: track.id, field, message });

  if (!track.id.trim()) at('id', 'track id is empty');
  if (!track.label.trim()) at('label', 'track label is empty');
  if (!SUPPORTED_INSTRUMENTS.includes(track.instrument)) {
    at('instrument', `unsupported instrument "${track.instrument}"`);
  }
  if (!(SUPPORTED_VOICES as readonly string[]).includes(track.voice)) {
    at('voice', `unsupported voice "${track.voice}"`);
  }
  if (!(track.mix >= 0 && track.mix <= 1)) {
    at('mix', `mix ${track.mix} is outside 0..1`);
  }
  if (track.minFreq !== undefined && !(track.minFreq > 0 && track.minFreq < 20000)) {
    at('minFreq', `minFreq ${track.minFreq} is outside the audible range`);
  }
  if (track.maxFreq !== undefined && !(track.maxFreq > 0 && track.maxFreq <= 20000)) {
    at('maxFreq', `maxFreq ${track.maxFreq} is outside the audible range`);
  }
  if (track.minFreq !== undefined && track.maxFreq !== undefined && track.minFreq > track.maxFreq) {
    at('minFreq', `minFreq ${track.minFreq} exceeds maxFreq ${track.maxFreq}`);
  }
  if (track.pan !== undefined && !(track.pan >= -1 && track.pan <= 1)) {
    at('pan', `pan ${track.pan} is outside -1..1`);
  }

  for (const message of validateEquation(track.equation, maxX)) {
    at('equation', message);
  }
  return issues;
}

/** Full structural + numerical validation of a single composition. */
export function validateComposition(composition: Composition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const at = (field: string, message: string) =>
    issues.push({ compositionId: composition.id, trackId: null, field, message });

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(composition.id)) {
    at('id', `id "${composition.id}" is not a lowercase slug`);
  }
  if (!composition.title.trim()) at('title', 'title is empty');
  if (composition.title.length > 64) at('title', 'title is longer than 64 characters');
  if (!GENRES.some((genre) => genre.id === composition.genre)) {
    at('genre', `unknown genre "${composition.genre}"`);
  }
  if (!Number.isFinite(composition.durationSec)) {
    at('durationSec', 'durationSec is not a number');
  } else if (!(ALLOWED_DURATIONS as readonly number[]).includes(composition.durationSec)) {
    at('durationSec', `durationSec ${composition.durationSec} is outside the allowed set`);
  }
  if (!isKnownScale(composition.key)) {
    at('key', `unknown scale "${composition.key}"`);
  }
  if (!SUPPORTED_ACCESS.includes(composition.access)) {
    at('access', `unknown access tier "${composition.access}"`);
  }
  if (!/^#[0-9a-f]{6}$/i.test(composition.accent)) {
    at('accent', `accent "${composition.accent}" is not a #rrggbb colour`);
  }
  if (!Number.isFinite(composition.artworkSeed)
    || composition.artworkSeed < 0
    || composition.artworkSeed >= 1) {
    at('artworkSeed', 'artworkSeed must be a 0..1 number');
  }
  if (Number.isNaN(Date.parse(composition.releasedAt))) {
    at('releasedAt', `releasedAt "${composition.releasedAt}" is not a valid date`);
  }

  // BPM is checked against the genre window when the genre is known.
  const bpmRange = GENRE_BPM_RANGE[composition.genre];
  if (bpmRange && !(composition.bpm >= bpmRange[0] && composition.bpm <= bpmRange[1])) {
    at('bpm', `bpm ${composition.bpm} is outside the ${composition.genre} window ${bpmRange[0]}–${bpmRange[1]}`);
  }

  if (composition.tracks.length < 3 || composition.tracks.length > 6) {
    at('tracks', `expected 3–6 tracks, found ${composition.tracks.length}`);
  }
  const trackIds = new Set<string>();
  for (const track of composition.tracks) {
    if (trackIds.has(track.id)) at('tracks', `duplicate track id "${track.id}"`);
    trackIds.add(track.id);
  }

  const maxX = engineDomain(composition);
  for (const track of composition.tracks) {
    issues.push(...validateTrack(composition.id, track, maxX));
  }

  return issues;
}

/** Validate the whole catalogue, including cross-cutting uniqueness rules. */
export function validateCatalogue(compositions: readonly Composition[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenTitles = new Map<string, string>();

  for (const composition of compositions) {
    issues.push(...validateComposition(composition));

    if (seenIds.has(composition.id)) {
      issues.push({ compositionId: composition.id, trackId: null, field: 'id', message: 'duplicate composition id' });
    }
    seenIds.add(composition.id);

    const titleKey = composition.title.trim().toLocaleLowerCase();
    const previousId = seenTitles.get(titleKey);
    if (previousId) {
      issues.push({
        compositionId: composition.id,
        trackId: null,
        field: 'title',
        message: `duplicate title, already used by "${previousId}"`,
      });
    }
    seenTitles.set(titleKey, composition.id);

    // Every track must carry its own mathematical identity.
    const equations = new Set<string>();
    for (const track of composition.tracks) {
      const key = track.equation.replace(/\s+/g, '');
      if (equations.has(key)) {
        issues.push({
          compositionId: composition.id,
          trackId: track.id,
          field: 'equation',
          message: 'two tracks share an identical equation',
        });
      }
      equations.add(key);
    }
  }

  return issues;
}

/** Convenience: does this key exist in the scale table? */
export function isKnownScale(key: string): key is ScaleKey {
  return key in MUSICAL_SCALES;
}

