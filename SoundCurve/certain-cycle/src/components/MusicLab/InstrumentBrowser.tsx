import { useMemo } from 'react';
import { useMusicLab } from './store';
import { MUSIC_LAB_INSTRUMENTS, MUSIC_LAB_CATEGORIES, filterInstruments } from './presets';

interface Props {
  activeTrackInstrumentId?: string;
  onAdd: (instrumentId: string) => void;
  onPreview: (instrumentId: string) => void;
}

function renderBaseEquation(instrument: any): string {
  const { defaults } = instrument;
  const parts = [];
  if (defaults.intensity) parts.push(`intensity: ${defaults.intensity}%`);
  if (defaults.brightness) parts.push(`brightness: ${defaults.brightness}%`);
  if (defaults.warmth) parts.push(`warmth: ${defaults.warmth}%`);
  return parts.join(' · ');
}

export default function InstrumentBrowser({ activeTrackInstrumentId, onAdd, onPreview }: Props) {
  const { state } = useMusicLab();
  const filter = state.libraryFilter || 'all';
  const search = state.search || '';
  const favourites = state.favourites || [];
  const setFilter = state.setLibraryFilter || (() => {});
  const setSearch = state.setSearch || (() => {});
  const toggleFavourite = state.toggleFavourite || (() => {});

  const results = useMemo(
    () => filterInstruments(filter, search),
    [filter, search],
  );

  const filters: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'favourites', label: '★ Saved' },
    ...MUSIC_LAB_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
    })),
  ];

  return (
    <section className="ml-library" aria-label="Instrument library">
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
            className={filter === entry.id ? 'active' : ''}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="ml-library__list">
        {results.length === 0 && (
          <p className="ml-empty-note">Nothing matches "{search}". Try another word or pick a category.</p>
        )}
        {results.map((instrument) => (
          <article
            key={instrument.id}
            className={`ml-instrument ${activeTrackInstrumentId === instrument.id ? 'is-active' : ''}`}
            style={{ '--ml-accent': instrument.accent } as React.CSSProperties}
            draggable={true}
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-musiclab-instrument', instrument.id);
              event.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <div className="ml-instrument__head">
              <span className="ml-instrument__icon" aria-hidden="true">{instrument.icon}</span>
              <div className="ml-instrument__title">
                <strong>{instrument.name}</strong>
                <small>{instrument.category}</small>
              </div>
              <button
                type="button"
                className={`ml-star ${favourites.includes(instrument.id) ? 'is-on' : ''}`}
                aria-pressed={favourites.includes(instrument.id)}
                aria-label={`${favourites.includes(instrument.id) ? 'Remove' : 'Save'} ${instrument.name}`}
                onClick={() => toggleFavourite(instrument.id)}
              >
                {favourites.includes(instrument.id) ? '★' : '☆'}
              </button>
            </div>

            <div className="ml-instrument__equation-wrap">
              <code className="ml-instrument__equation" data-math={renderBaseEquation(instrument)}>∞</code>
              <button type="button" className="ml-math-expand" aria-label={`Show equation for ${instrument.name}`} title="Show equation">Σ</button>
            </div>

            <div className="ml-instrument__actions">
              <button type="button" className="ml-mini-button" onClick={() => onPreview(instrument.id)} aria-label={`Preview ${instrument.name}`}>
                ▶ Preview
              </button>
              <button type="button" className="ml-mini-button ml-mini-button--primary" onClick={() => onAdd(instrument.id)} aria-label={`Add ${instrument.name} to timeline`}>
                + Add
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}