/**
 * SoundLab — proprietary multi-track equation compositions.
 *
 * This module is the public catalogue surface. It re-exports the schema and
 * aggregates every composition set, so all existing imports of
 * `data/compositions` keep working unchanged.
 *
 * Adding work: drop a `CompositionDraft[]` into ./compositionSets/<name>.ts
 * and include it in the aggregate below. Nothing else needs to change.
 *
 * © 2026 MathSonify — https://mathsonify.com
 */

import { defineComposition, type CompositionDraft } from './compositionBuilder';
import type { Composition } from './compositionTypes';

import { ORIGINAL_COMPOSITIONS } from './compositionSets/original';
import { ATMOSPHERE_COMPOSITIONS } from './compositionSets/atmosphere';
import { HARMONIC_COMPOSITIONS } from './compositionSets/harmonic';
import { PULSE_COMPOSITIONS } from './compositionSets/pulse';
import { ORGANIC_COMPOSITIONS } from './compositionSets/organic';

/**
 * The originals were authored before the builder existed, so they carry
 * `copyright` and `accent` inline. Those two fields are now derived, so they
 * are stripped here and the rest of each entry is passed through untouched.
 */
const STRIPPED_ORIGINALS: CompositionDraft[] = ORIGINAL_COMPOSITIONS.map((draft) => {
  const { copyright: _copyright, accent: _accent, ...rest } = draft as CompositionDraft & {
    copyright?: string;
    accent?: string;
  };
  return rest;
});

/** Every authored draft, in catalogue order (originals first, then new work). */
const DRAFTS: CompositionDraft[] = [
  ...STRIPPED_ORIGINALS,
  ...ATMOSPHERE_COMPOSITIONS,
  ...HARMONIC_COMPOSITIONS,
  ...PULSE_COMPOSITIONS,
  ...ORGANIC_COMPOSITIONS,
];

/** The complete SoundLab catalogue. */
export const COMPOSITIONS: Composition[] = DRAFTS.map(defineComposition);

/** Fast id → composition lookup for deep links, share URLs and the engine. */
export const COMPOSITION_BY_ID: ReadonlyMap<string, Composition> = new Map(
  COMPOSITIONS.map((composition) => [composition.id, composition]),
);

export {
  ACCESS_LABEL,
  COPYRIGHT,
  GENRE_ACCENT,
  GENRES,
  RELEASE_LABEL,
  seedFromId,
  type Composition,
  type CompositionTrack,
  type Genre,
  type SoundLabAccess,
  type SoundLabArtworkForm,
  type SoundLabReleaseState,
  type TrackVoice,
} from './compositionTypes';

export { defineComposition, track, type CompositionDraft } from './compositionBuilder';
