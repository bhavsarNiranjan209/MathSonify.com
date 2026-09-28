/**
 * SoundLab — compact catalogue format.
 *
 * Compositions are authored as compact tuples rather than repeated object
 * literals. At 100+ entries the ceremony of spelling out `id`/`label`/
 * `instrument`/`voice` on every track costs more characters than the actual
 * mathematics does, which makes the data harder to review and harder to
 * extend. The tuple keeps the equation — the part that matters — front and
 * centre, and `expandComposition` produces the full `CompositionDraft`.
 *
 * Tuple shapes are fixed-width and positional; the parser below is the only
 * place that knows the layout.
 *
 * © 2026 MathSonify
 */

import type { InstrumentType } from '../store/studioStore';
import type { ScaleKey } from '../utils/equationParser';
import type {
  CompositionDraft,
} from './compositionBuilder';
import type {
  CompositionTrack,
  Genre,
  SoundLabAccess,
  SoundLabArtworkForm,
  SoundLabReleaseState,
  TrackVoice,
} from './compositionTypes';

/** [id, label, equation, instrument, voice, mix, minFreq, maxFreq] */
export type TrackTuple = [
  id: string,
  label: string,
  equation: string,
  instrument: InstrumentType,
  voice: TrackVoice,
  mix: number,
  minFreq?: number,
  maxFreq?: number,
];

/**
 * [id, title, genre, bpm, key, durationSec, artwork, tags, description,
 *  options?, ...tracks]
 */
export type CompositionTuple = [
  id: string,
  title: string,
  genre: Genre,
  bpm: number,
  key: ScaleKey,
  durationSec: number,
  artwork: SoundLabArtworkForm,
  tags: string,
  description: string,
  options?: {
    access?: SoundLabAccess;
    release?: SoundLabReleaseState;
    featured?: boolean;
    releasedAt?: string;
  },
  ...tracks: TrackTuple[]
];

function trackFromTuple(tuple: TrackTuple): CompositionTrack {
  const [id, label, equation, instrument, voice, mix, minFreq, maxFreq] = tuple;
  const track: CompositionTrack = { id, label, equation, instrument, voice, mix };
  if (minFreq !== undefined) track.minFreq = minFreq;
  if (maxFreq !== undefined) track.maxFreq = maxFreq;
  return track;
}

/** Expand one tuple into a full `CompositionDraft`. */
export function expandComposition(tuple: CompositionTuple): CompositionDraft {
  const [id, title, genre, bpm, key, durationSec, artwork, tags, description, options, ...tracks] = tuple;
  const draft: CompositionDraft = {
    id,
    title,
    genre,
    bpm,
    key,
    durationSec,
    description,
    tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    artwork,
    tracks: tracks.map(trackFromTuple),
  };
  if (options) {
    if (options.access) draft.access = options.access;
    if (options.release) draft.release = options.release;
    if (options.featured !== undefined) draft.featured = options.featured;
    if (options.releasedAt) draft.releasedAt = options.releasedAt;
  }
  return draft;
}

/** Expand a whole catalogue file. */
export function expandCatalogue(tuples: readonly CompositionTuple[]): CompositionDraft[] {
  return tuples.map(expandComposition);
}
