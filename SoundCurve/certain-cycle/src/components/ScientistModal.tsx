import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SCIENTISTS, type Scientist } from '../data/scientists';
import { useTranslation } from '../i18n/index';
import { useStudioStore } from '../store/studioStore';

export default function ScientistModal() {
  const { t } = useTranslation();
  const [scientist, setScientist] = useState<Scientist | null>(null);
  const reduceMotion = !!useReducedMotion();

  const open = useCallback((id: string) => {
    const found = SCIENTISTS.find((s) => s.id === id);
    if (found) {
      setScientist(found);
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const close = useCallback(() => {
    setScientist(null);
    document.body.style.overflow = '';
  }, []);

  // Listen for custom event from Astro page
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail;
      open(id);
    };
    window.addEventListener('mathsonify:open-scientist', handler);
    return () => window.removeEventListener('mathsonify:open-scientist', handler);
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!scientist) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scientist, close]);

  const setActiveScientist = useStudioStore((s) => s.setActiveScientist);

  // v25: sci + eqName ride in the URL so the scientist survives the page
  // navigation. The click handler also sets it in the store, but a full
  // <a href> navigation reloads the app and wipes in-memory state — the URL
  // is the only thing that survives, and the Studio restores the scientist
  // from these two params on mount. Without them the export ran in user
  // mode and the scientist name never appeared.
  const studioUrl = (eq: Scientist['equations'][0]) =>
    `/studio?eq=${encodeURIComponent(eq.equation)}&inst=${eq.instrument}&mode=${eq.sonificationMode}&minX=${eq.minX}&maxX=${eq.maxX}&dur=${eq.duration}&sci=${scientist?.id ?? ''}&eqName=${encodeURIComponent(eq.name)}`;

  return (
    <AnimatePresence>
      {scientist && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sc-bg/85"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
          onClick={close}
        >
          <motion.div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto panel p-6 sm:p-8 space-y-6"
            initial={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={close}
              className="absolute top-4 right-4 p-1.5 rounded-md text-sc-text-faint hover:text-sc-text hover:bg-sc-surface transition-colors z-10"
              aria-label={t('scientists.close')}
            >
              ✕
            </button>

            {/* Header: Avatar + Name + Dates */}
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 rounded-full border-2 border-sc-accent/30 flex-shrink-0 flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: scientist.color }}
                aria-hidden="true"
              >
                {scientist.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-serif text-2xl sm:text-3xl font-semibold text-sc-text">
                    {scientist.name}
                  </h2>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono text-sc-text-faint">{scientist.lifespan}</span>
                  <span className="text-sc-text-faint">·</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sc-accent/15 text-sc-accent border border-sc-accent/40 capitalize">
                    {scientist.category}
                  </span>
                </div>
                <p className="text-sm text-sc-accent italic mt-1">{scientist.tagline}</p>
              </div>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-sc-text uppercase tracking-wider" data-i18n="scientists.biography">
                {t('scientists.biography')}
              </h3>
              <p className="text-sm text-sc-text-soft leading-relaxed">
                {scientist.bio}
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-sc-line/15" />

            {/* Equations */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-sc-text uppercase tracking-wider" data-i18n="scientists.famousEquations">
                {t('scientists.famousEquations')}
              </h3>

              {scientist.equations.map((eq) => (
                <div
                  key={eq.id}
                  className="panel p-4 sm:p-5 space-y-3 hover:border-sc-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-base font-semibold text-sc-text">{eq.name}</h4>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sc-accent/15 text-sc-accent border border-sc-accent/40 capitalize">
                        {eq.instrument}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-sc-surface text-sc-text-soft border border-sc-line/20 capitalize">
                        {eq.sonificationMode}
                      </span>
                    </div>
                  </div>

                  <div className="code-mat text-sm px-3 py-2 font-mono overflow-x-auto">
                    {eq.equation}
                  </div>

                  <p className="text-xs text-sc-text-soft leading-relaxed">
                    {eq.description}
                  </p>

                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-[11px] font-mono text-sc-text-faint">
                      [{eq.minX}, {eq.maxX}] · {eq.duration}s
                    </span>
                    <a
                      href={studioUrl(eq)}
                      onClick={() => setActiveScientist(scientist, eq.name)}
                      className="px-4 py-1.5 rounded-md btn-primary text-xs font-medium flex items-center gap-1.5"
                      data-i18n="scientists.playInStudio"
                    >
                      <span>▶</span>
                      <span>{t('scientists.playInStudio')}</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-sc-line/15 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="px-4 py-2 rounded-md text-xs font-medium text-sc-text-soft hover:text-sc-text hover:bg-sc-surface transition-colors"
                data-i18n="scientists.close"
              >
                {t('scientists.close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
