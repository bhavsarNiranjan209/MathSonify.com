import { COMPOSITIONS, GENRES, type Composition } from '../../data/compositions';
import { useTranslation } from '../../i18n/index';
import { useSoundLabStore } from '../../store/soundLabStore';
import { filterCompositions, type SoundLabCategory } from '../../utils/soundLabLibrary';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  category: SoundLabCategory;
  onCategoryChange: (value: SoundLabCategory) => void;
  onSelect: (composition: Composition) => void;
  onNavigate?: () => void;
}

function accentTint(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((part) => part + part).join('') : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function SoundLabLibrary({
  query, onQueryChange, category, onCategoryChange, onSelect, onNavigate,
}: Props) {
  const { t } = useTranslation();
  const selectedId = useSoundLabStore((state) => state.selectedId);
  const filtered = filterCompositions(COMPOSITIONS, { category, query });
  const categoryOptions = [{ id: 'all' as const, label: t('soundlab.all'), emoji: '◎' }, ...GENRES];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-sc-line/15 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sc-text-faint">{t('soundlab.library')}</p>
        <div className="relative mt-3">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sc-text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
          </svg>
          <input
            type="search"
            name="soundlab-search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('soundlab.searchPlaceholder')}
            aria-label={t('soundlab.searchLabel')}
            className="panel-inset min-h-[44px] w-full rounded-md py-2 pl-10 pr-3 text-sm text-sc-text placeholder:text-sc-text-faint focus:border-sc-accent focus:outline-none focus:ring-2 focus:ring-sc-accent/30"
          />
        </div>
      </div>

      <nav className="border-b border-sc-line/15 p-3" aria-label={t('soundlab.categories')}>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible">
          {categoryOptions.map((item) => {
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onCategoryChange(item.id)}
                aria-pressed={active}
                className={`chip min-h-[36px] shrink-0 justify-start whitespace-nowrap text-[11px] ${active ? 'chip-active' : 'chip-idle'}`}
              >
                <span aria-hidden="true">{item.emoji}</span>{item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-live="polite">
        {filtered.length === 0 ? (
          <div className="panel-inset px-4 py-8 text-center">
            <p className="text-sm font-medium text-sc-text">{t('soundlab.noResults')}</p>
            <button type="button" onClick={() => { onQueryChange(''); onCategoryChange('all'); }}
              className="btn-ghost mt-3 min-h-[40px] px-3 text-xs">{t('soundlab.clearFilters')}</button>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((composition) => {
              const genre = GENRES.find((item) => item.id === composition.genre);
              const active = selectedId === composition.id;
              return (
                <li key={composition.id}>
                  <button
                    type="button"
                    onClick={() => { onSelect(composition); onNavigate?.(); }}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full rounded-md border px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sc-accent ${active ? 'border-sc-accent bg-sc-accent/10' : 'border-sc-line/15 bg-sc-surface hover:border-sc-accent/50'}`}
                  >
                    <span className="flex items-start gap-3">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: composition.accent, boxShadow: `0 0 0 3px ${accentTint(composition.accent, 0.12)}` }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${active ? 'text-sc-text' : 'text-sc-text-soft'}`}>{composition.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-sc-text-faint">
                          <span>{genre?.label ?? composition.genre}</span><span aria-hidden="true">·</span>
                          <span>{composition.bpm} BPM</span><span aria-hidden="true">·</span><span>{composition.durationSec}s</span>
                        </span>
                        <span className="code-mat mt-2 block truncate px-2 py-1 text-[10px] text-sc-text-soft">{composition.tracks[0]?.equation}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
