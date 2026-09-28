/**
 * SoundLab — shared composition schema.
 *
 * Types, genre catalogue and the approved accent palette live here so that
 * composition *content* (see ./compositionSets/*) and the aggregator
 * (./compositions.ts) can both depend on the schema without a cycle.
 *
 * © 2026 MathSonify — https://mathsonify.com
 */

import type { InstrumentType } from '../store/studioStore';
import type { ScaleKey } from '../utils/equationParser';

// ── Genre & track types ──────────────────────────────────────────────

export type Genre =
  | 'ambient'
  | 'synthwave'
  | 'classical'
  | 'lofi'
  | 'cinematic'
  | 'world'
  | 'minimal'
  | 'idm'
  | 'rock'
  | 'jazz'
  | 'edm'
  | 'rnb'
  | 'reggae'
  | 'latin'
  | 'orchestral';

export type TrackVoice = 'frequency' | 'note' | 'chord' | 'rhythm' | 'drums';

/**
 * Commercial access tier for a composition.
 * Drives badges + gating without hardcoding any of it into the UI.
 */
export type SoundLabAccess = 'free-preview' | 'early-access' | 'premium' | 'full-release';

/** Lifecycle state used by the progressive launch plan. */
export type SoundLabReleaseState = 'teaser' | 'early-access' | 'limited' | 'premium' | 'live';

/** Presentation metadata for the lightweight card artwork (pure JSX, no assets). */
export type SoundLabArtworkForm = 'orbit' | 'wave' | 'lattice' | 'spiral' | 'prism' | 'ripple';

export interface CompositionTrack {
  id: string;
  label: string;
  equation: string;
  instrument: InstrumentType;
  voice: TrackVoice;
  /** Default mix gain 0..1 */
  mix: number;
  minFreq?: number;
  maxFreq?: number;
  pan?: number; // -1..1
}

export interface Composition {
  id: string;
  title: string;
  genre: Genre;
  bpm: number;
  key: ScaleKey;
  durationSec: number;
  description: string;
  copyright: string;
  tracks: CompositionTrack[];
  /** Desaturated accent CSS colour for card top-border tint */
  accent: string;
  version: 1;
  /** Free-text discovery tags surfaced in search. */
  tags: string[];
  /** Access tier — 'free-preview' entries are audible for everyone. */
  access: SoundLabAccess;
  /** Lifecycle state; 'live' means fully released. */
  release: SoundLabReleaseState;
  /** True when the composition is part of the Premium tier. */
  premium: boolean;
  /** Featured compositions surface first in the library. */
  featured: boolean;
  /** Deterministic 0..1 seed that drives the generated card artwork. */
  artworkSeed: number;
  /** Artwork silhouette used by the card. */
  artwork: SoundLabArtworkForm;
  /** ISO date used by the "Recently added" sort. */
  releasedAt: string;
}

// ── Genre catalogue ──────────────────────────────────────────────────

export const GENRES: { id: Genre; label: string; emoji: string }[] = [
  { id: 'ambient', label: 'Ambient', emoji: '🌌' },
  { id: 'synthwave', label: 'Synthwave', emoji: '🌆' },
  { id: 'classical', label: 'Classical', emoji: '🎻' },
  { id: 'lofi', label: 'Lo-Fi', emoji: '☕' },
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬' },
  { id: 'world', label: 'World', emoji: '🌍' },
  { id: 'minimal', label: 'Minimal', emoji: '▪️' },
  { id: 'idm', label: 'IDM', emoji: '⚙️' },
  { id: 'rock', label: 'Rock', emoji: '🎸' },
  { id: 'jazz', label: 'Jazz', emoji: '🎷' },
  { id: 'edm', label: 'EDM', emoji: '🎛️' },
  { id: 'rnb', label: 'R&B', emoji: '🎤' },
  { id: 'reggae', label: 'Reggae', emoji: '🌴' },
  { id: 'latin', label: 'Latin', emoji: '💃' },
  { id: 'orchestral', label: 'Orchestral', emoji: '🏛️' },
];

/** Approved desaturated accent palette — limited, vibe-forward. */
export const ACCENT = {
  ambient:   '#6b7a8d', // slate-blue
  synthwave: '#8b6b5e', // muted copper
  classical: '#7d7a6a', // warm stone
  lofi:      '#6d7a6e', // mossy grey
  cinematic: '#7a6b7d', // dusty violet
  world:     '#7a7258', // sandstone
  minimal:   '#7a7a7a', // pure grey
  idm:       '#5e7a7a', // dark teal
  rock:      '#8b5e5e', // muted ember
  jazz:      '#8b7a5e', // brass
  edm:       '#5e7a7a', // teal
  rnb:       '#7a5e6b', // mauve
  reggae:    '#6b8b5e', // olive
  latin:     '#8b6b5e', // warm copper
  orchestral:'#7a6b5e', // warm taupe
};

/** Genre → accent colour, used by the composition builder. */
export const GENRE_ACCENT: Record<Genre, string> = ACCENT;

export const COPYRIGHT = '© 2026 MathSonify — proprietary composition. All rights reserved.';

/** Human-facing labels for access / release states (single source of truth). */
export const ACCESS_LABEL: Record<SoundLabAccess, string> = {
  'free-preview': 'Free',
  'early-access': 'Early Access',
  premium: 'Premium',
  'full-release': 'Full Release',
};

export const RELEASE_LABEL: Record<SoundLabReleaseState, string> = {
  teaser: 'Coming Soon',
  'early-access': 'Early Access',
  limited: 'Limited',
  premium: 'Premium',
  live: 'Full Release',
};

/** Stable 0..1 hash so a composition always renders identical artwork. */
export function seedFromId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}
