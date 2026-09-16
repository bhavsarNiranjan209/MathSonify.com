import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Composition } from '../../data/compositions';
import { GENRES } from '../../data/compositions';
import { useSoundLabStore } from '../../store/soundLabStore';
import { compositionEngine } from '../../utils/compositionEngine';

/** Convert a #RRGGBB accent into an rgba() tint string. */
function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface CompositionCardProps {
  composition: Composition;
  active?: boolean;
}

export default memo(function CompositionCard({ composition, active = false }: CompositionCardProps) {
  const select = useSoundLabStore((s) => s.select);
  const resetForComposition = useSoundLabStore((s) => s.resetForComposition);

  const handleOpen = (id: string) => {
    select(id);
    resetForComposition(composition.tracks.map((t) => t.id));
  };
  const reduceMotion = !!useReducedMotion();
  const genre = GENRES.find((g) => g.id === composition.genre);

  return (
    <motion.div
      layout={reduceMotion ? false : true}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
      className={`soundlab-card panel relative flex flex-col overflow-hidden ${active ? 'soundlab-card-active' : ''}`}
      style={{ borderTop: `2px solid ${tint(composition.accent, active ? 0.7 : 0.28)}` }}
      data-soundlab-genre={composition.genre}
      data-soundlab-title={composition.title.toLowerCase()}
    >
      {/* Accent dot — single desaturated hue per genre */}
      <span
        aria-hidden="true"
        className="absolute right-4 top-4 h-2 w-2 rounded-full"
        style={{ backgroundColor: composition.accent, boxShadow: `0 0 0 3px ${tint(composition.accent, 0.12)}` }}
      />

      <div className="flex items-center justify-between gap-2 px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sc-line/20 bg-sc-surface px-2.5 py-0.5 text-[11px] font-mono text-sc-text-soft">
          <span aria-hidden="true">{genre?.emoji ?? '🎵'}</span>
          {genre?.label ?? composition.genre}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-sc-accent/40 bg-sc-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-sc-accent">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          © Proprietary
        </span>
      </div>

      <div className="px-5 pt-3 pb-2 flex-1">
        <h3 className="font-serif text-xl font-semibold tracking-tight text-sc-text">{composition.title}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-sc-text-soft">{composition.description}</p>

        {/* Stacked equation chips — read-only, one per track */}
        <div className="mt-4 space-y-1.5">
          {composition.tracks.map((track) => (
            <div
              key={track.id}
              className="code-mat group flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
              title="Original equation © MathSonify — listening only"
            >
              <span
                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sc-text-soft"
                style={{ backgroundColor: tint(composition.accent, 0.1), color: composition.accent }}
              >
                {track.label}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sc-text/90">
                {track.equation}
              </span>
              <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-sc-text-faint">
                {track.voice}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer — meta + actions */}
      <div className="mt-3 px-5 pb-4">
        <div className="flex items-center justify-between pt-3 text-[11px] font-mono text-sc-text-faint">
          <span>{composition.bpm} BPM</span>
          <span className="uppercase">{composition.key}</span>
          <span>{composition.durationSec}s</span>
          <button
            type="button"
            onClick={() => handleOpen(composition.id)}
            className="btn-ghost px-3.5 py-2 text-xs"
            aria-pressed={active}
          >
            {active ? 'Now playing' : 'Open'}
          </button>
        </div>
      </div>
    </motion.div>
  );
});