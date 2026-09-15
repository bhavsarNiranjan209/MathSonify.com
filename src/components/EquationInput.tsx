import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStudioStore } from '../store/studioStore';
import { useTranslation } from '../i18n/index';
import { parseEquation, sanitizeEquationString } from '../utils/equationParser';
import { PRESETS } from '../data/presets';
import MathSymbolPad from './MathSymbolPad';

const MATH_HELPERS = [
  { label: 'sin', insert: 'sin(x)' },
  { label: 'cos', insert: 'cos(x)' },
  { label: 'tan', insert: 'tan(x)' },
  { label: 'x²', insert: 'x^2' },
  { label: 'x³', insert: 'x^3' },
  { label: '√x', insert: 'sqrt(abs(x))' },
  { label: 'eˣ', insert: 'exp(x)' },
  { label: 'ln', insert: 'log(abs(x)+0.01)' },
  { label: 'π', insert: 'pi' },
  { label: '|x|', insert: 'abs(x)' },
];

export default function EquationInput() {
  const { t } = useTranslation();
  const equation = useStudioStore((s) => s.equation);
  const setEquation = useStudioStore((s) => s.setEquation);
  const minX = useStudioStore((s) => s.minX);
  const setMinX = useStudioStore((s) => s.setMinX);
  const maxX = useStudioStore((s) => s.maxX);
  const setMaxX = useStudioStore((s) => s.setMaxX);
  const loadPreset = useStudioStore((s) => s.loadPreset);
  const setPresetDrawerOpen = useStudioStore((s) => s.setPresetDrawerOpen);

  const [rawInput, setRawInput] = useState(equation);
  const [error, setError] = useState<string>('');
  const [showDomainControls, setShowDomainControls] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<number | null>(null);

  const reduceMotion = !!useReducedMotion();

  useEffect(() => {
    setRawInput(equation);
  }, [equation]);

  const handleChange = (val: string) => {
    setRawInput(val);
    const parsed = parseEquation(val);
    if (!parsed.success) {
      setError(parsed.error || 'Invalid equation syntax');
      setShakeError(true);
      setTimeout(() => setShakeError(false), 600);
    } else {
      setError('');
      setEquation(val);
    }
  };

  // Insert at the saved caret (kept in sync with the visible input), so tapping
  // a symbol drops exactly where a kid is looking. Falls back to appending.
  const insertAtCursor = (txt: string) => {
    const pos = caretRef.current ?? rawInput.length;
    const updated = `${rawInput.slice(0, pos)}${txt}${rawInput.slice(pos)}`;
    caretRef.current = pos + txt.length;
    handleChange(updated);
    // Restore focus + caret after the controlled input re-renders
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(caretRef.current, caretRef.current);
      }
    });
  };

  const quickPresets = PRESETS.slice(0, 5);

  const trackCaret = () => {
    caretRef.current = inputRef.current?.selectionStart ?? null;
  };

  const handleSurprise = () => {
    const random = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    loadPreset({ equation: random.equation, ...random.recommendedSettings });
    caretRef.current = null;
  };

  return (
    <div className="space-y-4">
      {/* Wide tactile equation slot */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="eq-input" className="text-xs font-semibold text-sc-text-soft">
            {t('eq.mathEquation')}
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSurprise}
              className="flex items-center gap-1.5 py-1 min-h-[44px] text-xs font-medium text-sc-accent hover:underline transition-colors"
              title="Load a random fun equation"
            >
              <span aria-hidden>🎲</span>
              <span>{t('eq.surpriseMe')}</span>
            </button>
            <button
              type="button"
              onClick={() => setPresetDrawerOpen(true)}
              className="text-xs text-sc-accent hover:underline transition-colors font-medium py-1 min-h-[44px]"
            >
              {t('eq.library')}
            </button>
          </div>
        </div>

        <div className="relative panel-inset">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sc-text-faint font-mono text-sm pointer-events-none select-none">
            f(x) =
          </div>
          <input
            id="eq-input"
            ref={inputRef}
            type="text"
            value={rawInput}
            onChange={(e) => {
              caretRef.current = e.target.selectionStart;
              handleChange(e.target.value);
            }}
            onSelect={trackCaret}
            onClick={trackCaret}
            onKeyUp={trackCaret}
            onFocus={() => setKeyboardOpen(true)}
            placeholder={t('eq.placeholder')}
            className={`w-full min-h-[44px] pl-16 pr-16 py-3.5 bg-transparent text-sc-text placeholder:text-sc-text-faint/70 font-mono text-sm rounded-[4px] focus:outline-none transition-all duration-200 ${
              error
                ? 'ring-1 ring-red-500/60 ring-inset'
                : 'ring-1 ring-transparent focus:ring-sc-accent/50 focus:ring-2'
            } ${shakeError ? 'animate-shake' : ''}`}
            spellCheck={false}
          />
          {/* Keyboard toggle button */}
          <button
            type="button"
            onClick={() => setKeyboardOpen((v) => !v)}
            className="absolute right-9 top-1/2 -translate-y-1/2 p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-sc-text-faint hover:text-sc-text hover:bg-sc-surface transition-colors"
            title="Math keyboard"
            tabIndex={-1}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
            </svg>
          </button>
          {rawInput && (
            <button
              onClick={() => handleChange('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-sc-text-faint hover:text-sc-text transition-colors text-xs"
              title="Clear input"
            >
              ✕
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              className="mt-2 text-xs text-red-400 font-medium flex items-center gap-1.5"
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
              key="error"
            >
              <span>⚠️</span> {error}
            </motion.p>
          ) : (
            <motion.p
              className="mt-1.5 text-[11px] text-emerald-500/90 font-medium flex items-center gap-1"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              key="success"
            >
              <span className="text-emerald-500">✓</span> {t('eq.validExpression')}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Insert helper dials */}
      <div>
        <div className="text-xs text-sc-text-soft mb-2">{t('eq.insertFunction')}</div>
        <div className="flex flex-wrap gap-1.5">
          {MATH_HELPERS.map((helper) => (
            <button
              key={helper.label}
              type="button"
              onClick={() => insertAtCursor(helper.insert)}
              className="px-2.5 py-1.5 min-h-[44px] text-xs font-mono bg-sc-surface hover:bg-sc-accent hover:text-sc-on-accent border border-sc-line/20 hover:border-sc-accent text-sc-text-soft rounded-sc-sm transition-colors active:scale-95"
            >
              {helper.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floating math keyboard overlay */}
      <MathSymbolPad
        onInsert={insertAtCursor}
        open={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
      />

      {/* Quick presets */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-sc-text-soft">{t('eq.popularPresets')}</span>
          <button
            onClick={() => setPresetDrawerOpen(true)}
            className="text-[11px] text-sc-accent hover:underline"
          >
            {t('eq.viewAll')}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quickPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset({ equation: preset.equation, ...preset.recommendedSettings })}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                equation === preset.equation
                  ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/50 font-semibold'
                  : 'bg-sc-surface text-sc-text-soft border-sc-line/25 hover:border-sc-accent hover:text-sc-text'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Domain controls */}
      <div className="pt-2 border-t border-sc-line/15">
        <button
          type="button"
          onClick={() => setShowDomainControls(!showDomainControls)}
          className="w-full flex items-center justify-between text-xs text-sc-text-soft hover:text-sc-text py-1 transition-colors group"
        >
          <span className="font-semibold">{t('eq.domainRange')}</span>
          <span className="font-mono text-xs transition-transform group-hover:translate-x-1">
            {showDomainControls ? t('eq.hide') : t('eq.expand')}
          </span>
        </button>

        <AnimatePresence>
          {showDomainControls && (
            <motion.div
              className="mt-3 space-y-3"
              initial={reduceMotion ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeInOut' }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-sc-text-faint mb-1 font-mono">{t('eq.minX')}</label>
                  <input
                    type="number"
                    step="0.5"
                    value={minX}
                    onChange={(e) => setMinX(parseFloat(e.target.value) || -10)}
                    className="w-full px-2.5 py-1.5 panel-inset text-xs font-mono text-sc-text focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-sc-text-faint mb-1 font-mono">{t('eq.maxX')}</label>
                  <input
                    type="number"
                    step="0.5"
                    value={maxX}
                    onChange={(e) => setMaxX(parseFloat(e.target.value) || 10)}
                    className="w-full px-2.5 py-1.5 panel-inset text-xs font-mono text-sc-text focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {[
                  { label: '[-2π, +2π]', min: -6.28, max: 6.28 },
                  { label: '[-10, +10]', min: -10, max: 10 },
                  { label: '[0, +10]', min: 0, max: 10 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setMinX(preset.min);
                      setMaxX(preset.max);
                    }}
                    className="flex-1 py-1.5 min-h-[44px] text-[10px] font-mono bg-sc-surface hover:bg-sc-accent/15 rounded-sc-sm text-sc-text-soft hover:text-sc-text transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}