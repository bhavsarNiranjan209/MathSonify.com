import type { Composition, Genre } from '../data/compositions';

export type SoundLabCategory = Genre | 'all';

export interface SoundLabFilters {
  category: SoundLabCategory;
  query: string;
}

/** Search the existing composition catalogue without duplicating its data. */
export function filterCompositions(
  compositions: readonly Composition[],
  { category, query }: SoundLabFilters,
): Composition[] {
  const needle = query.trim().toLocaleLowerCase();
  return compositions.filter((composition) => {
    if (category !== 'all' && composition.genre !== category) return false;
    if (!needle) return true;
    const searchable = [
      composition.title,
      composition.genre,
      composition.description,
      ...composition.tracks.flatMap((track) => [track.equation, track.instrument, track.label, track.voice]),
    ].join(' ').toLocaleLowerCase();
    return searchable.includes(needle);
  });
}

/** Move within the currently visible list; never jump outside search/filter results. */
export function adjacentComposition(
  visible: readonly Composition[],
  selectedId: string | null,
  direction: -1 | 1,
): Composition | null {
  if (visible.length === 0) return null;
  const current = visible.findIndex((composition) => composition.id === selectedId);
  if (current === -1) return visible[0];
  return visible[(current + direction + visible.length) % visible.length];
}
