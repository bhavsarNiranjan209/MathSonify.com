/**
 * Difficulty chooser for normal play: Easy | Medium | Hard.
 *
 * Each tier restricts the deck to a set of families via `libraryForDifficulty`,
 * so a Hard game never asks you to tell `sin(x)` from `cos(x)` and an Easy
 * game never asks about decaying chirps. Selecting a tier builds and starts a
 * fresh game; the chooser vanishes once a round is in progress.
 */
import { GUESS_DIFFICULTY_LABELS, type GuessDifficulty } from '../../data/guessLibrary';
import { useTranslation } from '../../i18n/index';

const TIERS: readonly GuessDifficulty[] = ['Easy', 'Medium', 'Hard'];

export default function GuessDifficultyChooser({
  value,
  onChange,
  disabled,
}: {
  value: GuessDifficulty | null;
  onChange: (difficulty: GuessDifficulty | null) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();

  return (
    <section className="panel p-5 sm:p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-sc-text-faint">
        {t('guess.difficulty.tag')}
      </p>
      <p className="mt-1 text-sm text-sc-text-soft">
        {t('guess.difficulty.subtitle')}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {TIERS.map((tier) => {
          const active = value === tier;
          return (
            <button
              key={tier}
              type="button"
              disabled={disabled}
              onClick={() => onChange(tier)}
              aria-pressed={active}
              className={`px-4 py-2 rounded font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? 'bg-sc-accent text-sc-bg'
                  : 'bg-sc-line/20 text-sc-text-soft hover:bg-sc-line/40'
              }`}
            >
              {GUESS_DIFFICULTY_LABELS[tier]}
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          aria-pressed={value === null}
          className={`px-4 py-2 rounded font-mono text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            value === null
              ? 'bg-sc-accent text-sc-bg'
              : 'bg-sc-line/20 text-sc-text-soft hover:bg-sc-line/40'
          }`}
        >
          {t('guess.difficulty.all')}
        </button>
      </div>
    </section>
  );
}