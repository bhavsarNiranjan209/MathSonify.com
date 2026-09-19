/**
 * Music Lab — instrument browser.
 *
 * Cards show the instrument's real base equation (`renderBaseEquation` derives
 * it from the same partial ladder the synth plays) plus a wave glyph.
 */

import { useMemo } from 'react';
import {
  MUSIC_LAB_CATEGORIES,
  type MusicLabInstrument,
} from '../../data/musicLabInstruments';
import { renderBaseEquation } from '../../utils/musicLabEquation';
import { filteredInstruments, useMusicLabStore, type LibraryFilter } from '../../store/musicLabStore';

/** Tiny waveform glyph drawn from the instrument's own partials. */
function WaveformGlyph({ instrument, accent }: { instrument: MusicLabInstrument; accent: string }) {
  const path = useMemo(() => {
    const width = 54;
    const height = 18;
    const points: string[] = [];
    for (let x = 0; x <= width; x += 1) {
      const t = (x / width) * Math.PI * 4;
      let y = 0;
      for (const partial of instrument.harmonics.slice(0, 5)) {
        y += partial.gain * Math.sin(partial.multiple * t);
      }
      points.push(`${x},${(height / 2 - (y / 2.2) * (height / 2.4)).toFixed(2)}`);
    }
    return `M${points.join(' L')}`;
  }, [instrument]);
  return (
    <svg className="ml-glyph" viewBox="0 0 54 18" aria-hidden="true">
      <path d={path} stroke={accent} />
    </svg>
  );
}

interface CardProps {
  instrument: MusicLabInstrument;
  isActive: boolean;
  isFavourite: boolean;
  onAdd: (id: string) => void;
  onPreview: (id: string) => void;
  onToggleFavourite: (id: string) => void;
}

function InstrumentCard({
  instrument,
  isActive,
  isFavourite,
  onAdd,
  onPreview,
  onToggleFavourite,
}: CardProps) {
  return (
    <article
      className={`ml-instrument ${isActive ? 'is-active' : ''}`}
      style={{ '--ml-accent': instrument.accent } as React.CSSProperties}
    >
      <div className="ml-instrument__head">
        <span className="ml-instrument__icon" aria-hidden="true">{instrument.icon}</span>
        <div className="ml-instrument__title">
          <strong>{instrument.name}</strong>
          <small>{instrument.category}</small>
        </div>
        <button
          type="button"
          className={`ml-star ${isFavourite ? 'is-on' : ''}`}
          aria-pressed={isFavourite}
          aria-label={`${isFavourite ? 'Remove' : 'Save'} ${instrument.name}`}
          onClick={() => onToggleFavourite(instrument.id)}
        >
          {isFavourite ? '★' : '☆'}
        </button>
      </div>

      <WaveformGlyph instrument={instrument} accent={instrument.accent} />
      <code className="ml-instrument__equation">{renderBaseEquation(instrument)}</code>

      <div className="ml-instrument__actions">
        <button
          type="button"
          className="ml-mini-button"
          onClick={() => onPreview(instrument.id)}
          aria-label={`Preview ${instrument.name}`}
        >
          ▶ Preview
        </button>
        <button
          type="button"
          className="ml-mini-button ml-mini-button--primary"
          onClick={() => onAdd(instrument.id)}
          aria-label={`Add ${instrument.name} to the timeline`}
        >
          + Add
        </button>
      </div>
    </article>
  );
}

interface Props {
  activeTrackInstrumentId?: string;
  onAdd: (instrumentId: string) => void;
  onPreview: (instrumentId: string) => void;
  layout?: 'sidebar' | 'sheet';
}

export default function InstrumentBrowser({
  activeTrackInstrumentId,
  onAdd,
  onPreview,
  layout = 'sidebar',
}: Props) {
  const filter = useMusicLabStore((state) => state.libraryFilter);
  const search = useMusicLabStore((state) => state.search);
  const favourites = useMusicLabStore((state) => state.favourites);
  const setFilter = useMusicLabStore((state) => state.setLibraryFilter);
  const setSearch = useMusicLabStore((state) => state.setSearch);
  const toggleFavourite = useMusicLabStore((state) => state.toggleFavourite);
  const addDrumKit = useMusicLabStore((state) => state.addDrumKit);

  const results = useMemo(
    () => filteredInstruments(filter, search, favourites),
    [filter, search, favourites],
  );

  const filters: { id: LibraryFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'favourites', label: '★ Saved' },
    ...MUSIC_LAB_CATEGORIES.map((category) => ({
      id: category.id as LibraryFilter,
      label: category.label,
    })),
  ];

  return (
    <section
      className={`ml-library ${layout === 'sheet' ? 'is-sheet' : ''}`}
      aria-label="Instrument library"
    >
      <div className="ml-panel-head">
        <div>
          <p className="ml-eyebrow">Sources</p>
          <h2>Instrument library</h2>
        </div>
        <span className="ml-count">{results.length}</span>
      </div>

      <label className="ml-search">
        <input
          type="search"
          value={search}
          placeholder="Search instruments…"
          aria-label="Search instruments"
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <div className="ml-filter-row" role="tablist" aria-label="Instrument categories">
        {filters.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={filter === entry.id}
            className={`ml-chip ${filter === entry.id ? 'is-active' : ''}`}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="ml-library__list">
        {results.length === 0 && (
          <p className="ml-empty-note">
            Nothing matches “{search}”. Try another word or pick a category.
          </p>
        )}
        {results.map((instrument) => (
          <InstrumentCard
            key={instrument.id}
            instrument={instrument}
            isActive={activeTrackInstrumentId === instrument.id}
            isFavourite={favourites.includes(instrument.id)}
            onAdd={onAdd}
            onPreview={onPreview}
            onToggleFavourite={toggleFavourite}
          />
        ))}
      </div>

      <button type="button" className="ml-drum-cta" onClick={addDrumKit}>
        Add a drum kit — 8 lanes, 16 steps
      </button>
    </section>
  );
}