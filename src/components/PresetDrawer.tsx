import { useState } from 'react';
import { useStudioStore } from '../store/studioStore';
import { useTranslation } from '../i18n/index';
import { PRESETS, PRESET_CATEGORIES, type EquationPreset } from '../data/presets';

export default function PresetDrawer() {
  const { t } = useTranslation();
  const presetDrawerOpen = useStudioStore((s) => s.presetDrawerOpen);
  const setPresetDrawerOpen = useStudioStore((s) => s.setPresetDrawerOpen);
  const loadPreset = useStudioStore((s) => s.loadPreset);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!presetDrawerOpen) return null;

  const filteredPresets = PRESETS.filter((preset) => {
    const matchesCat = selectedCategory === 'all' || preset.category === selectedCategory;
    const matchesSearch =
      preset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.equation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      preset.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleSelectPreset = (preset: EquationPreset) => {
    loadPreset({
      equation: preset.equation,
      ...preset.recommendedSettings,
    });
    setPresetDrawerOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sc-bg/85">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col panel overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-sc-line/15">
          <div>
            <h3 className="font-serif text-lg font-semibold text-sc-text">
              {t('preset.title')}
            </h3>
            <p className="text-xs text-sc-text-soft">{t('preset.subtitle')}</p>
          </div>
          <button
            onClick={() => setPresetDrawerOpen(false)}
            className="p-2 rounded-md hover:bg-sc-line/10 text-sc-text-faint hover:text-sc-text transition-colors"
            aria-label="Close library"
          >
            ✕
          </button>
        </div>

        {/* Search & categories */}
        <div className="p-4 border-b border-sc-line/15 space-y-3">
          <input
            type="text"
            placeholder={t('preset.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-2.5 panel-inset text-sm text-sc-text placeholder:text-sc-text-faint focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
          />

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {PRESET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-sc-accent text-sc-on-accent border border-sc-accent'
                    : 'bg-sc-surface text-sc-text-soft border border-sc-line/20 hover:border-sc-accent hover:text-sc-text'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Presets grid */}
        <div className="p-4 overflow-y-auto max-h-[50vh] grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPresets.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className="p-4 rounded-md bg-sc-surface hover:bg-sc-accent/5 border border-sc-line/20 hover:border-sc-accent/50 cursor-pointer transition-colors duration-200 group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-sm text-sc-text group-hover:text-sc-accent transition-colors">
                    {preset.name}
                  </h4>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sc-accent/15 text-sc-accent border border-sc-accent/40">
                    {preset.category.toLowerCase()}
                  </span>
                </div>

                <div className="code-mat text-xs px-2.5 py-1.5 mb-2">
                  {preset.equation}
                </div>

                <p className="text-xs text-sc-text-soft line-clamp-2 mb-2">{preset.description}</p>
              </div>

              <div className="pt-2 border-t border-sc-line/15 flex items-center justify-between text-[11px] text-sc-text-faint">
                <span className="truncate pr-2 italic">“{preset.soundDescription}”</span>
                <span className="text-sc-accent font-medium">{t('preset.load')}</span>
              </div>
            </div>
          ))}

          {filteredPresets.length === 0 && (
            <div className="col-span-2 py-12 text-center text-sc-text-faint text-sm">
              {t('preset.emptyState')} "{searchQuery}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-sc-line/15 bg-sc-bg/40 flex items-center justify-between text-xs text-sc-text-faint">
          <span>{t('preset.clickToLoad')}</span>
          <button
            onClick={() => setPresetDrawerOpen(false)}
            className="px-4 py-1.5 btn-ghost text-xs"
          >
            {t('preset.close')}
          </button>
        </div>
      </div>
    </div>
  );
}