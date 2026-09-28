/**
 * SoundLab — composition builder.
 *
 * Every composition in the library is authored through `defineComposition`,
 * which fills in copyright, genre accent, deterministic artwork and the
 * access/release metadata. That keeps each catalogue entry focused on what
 * actually makes it musical — title, description, tempo, key, tracks — and
 * means adding, gating or re-releasing a composition never requires touching
 * the UI.
 *
 * © 2026 MathSonify — https://mathsonify.com
 */

import {
  COPYRIGHT,
  GENRE_ACCENT,
  seedFromId,
  type Composition,
  type CompositionTrack,
  type Genre,
  type SoundLabAccess,
  type SoundLabArtworkForm,
  type SoundLabReleaseState,
} from './compositionTypes';
import type { ScaleKey } from '../utils/equationParser';
import type { InstrumentType } from '../store/studioStore';
import type { TrackVoice } from './compositionTypes';

/** The parts a catalogue author must supply. Everything else is derived. */
export interface CompositionDraft {
  id: string;
  title: string;
  genre: Genre;
  bpm: number;
  key: ScaleKey;
  durationSec: number;
  description: string;
  tracks: CompositionTrack[];
  tags?: string[];
  access?: SoundLabAccess;
  release?: SoundLabReleaseState;
  premium?: boolean;
  featured?: boolean;
  /** Override the derived artwork silhouette. */
  artwork?: SoundLabArtworkForm;
  releasedAt?: string;
  /** Per-composition accent override (defaults to the genre accent). */
  accent?: string;
}

const ARTWORK_FORMS: SoundLabArtworkForm[] = ['orbit', 'wave', 'lattice', 'spiral', 'prism', 'ripple'];

/** Deterministic artwork silhouette + seed derived from the composition id. */
function artworkFor(id: string): { artwork: SoundLabArtworkForm; artworkSeed: number } {
  const artworkSeed = seedFromId(id);
  const index = Math.floor(artworkSeed * ARTWORK_FORMS.length) % ARTWORK_FORMS.length;
  return { artwork: ARTWORK_FORMS[index], artworkSeed };
}

/**
 * Turn a draft into a complete, validated-at-runtime `Composition`.
 * Access defaults to 'free-preview' so nothing is locked by accident —
 * premium gating is an explicit, opt-in decision per composition.
 */
export function defineComposition(draft: CompositionDraft): Composition {
  const { artwork, artworkSeed } = artworkFor(draft.id);
  const access = draft.access ?? 'free-preview';
  return {
    id: draft.id,
    title: draft.title,
    genre: draft.genre,
    bpm: draft.bpm,
    key: draft.key,
    durationSec: draft.durationSec,
    description: draft.description,
    copyright: COPYRIGHT,
    tracks: draft.tracks,
    accent: draft.accent ?? GENRE_ACCENT[draft.genre],
    version: 1,
    tags: draft.tags ?? [],
    access,
    release: draft.release ?? (access === 'premium' ? 'premium' : 'live'),
    premium: draft.premium ?? access === 'premium',
    featured: draft.featured ?? false,
    artworkSeed,
    artwork: draft.artwork ?? artwork,
    releasedAt: draft.releasedAt ?? '2026-01-15',
  };
}

/** Shorthand for a track entry inside a draft. */
export function track(
  id: string,
  label: string,
  equation: string,
  instrument: InstrumentType,
  voice: TrackVoice,
  mix: number,
  extra: { minFreq?: number; maxFreq?: number; pan?: number } = {}
): CompositionTrack {
  return { id, label, equation, instrument, voice, mix, ...extra };
}
