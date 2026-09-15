import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export interface MathSymbol {
  symbol: string;
  insert?: string;
  hint?: string;
}

export interface SymbolGroup {
  id: string;
  label: string;
  symbols: MathSymbol[];
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'basic',
    label: 'Arithmetic',
    symbols: [
      { symbol: '+', insert: '+', hint: 'add' },
      { symbol: '−', insert: '-', hint: 'subtract' },
      { symbol: '×', insert: '*', hint: 'multiply' },
      { symbol: '÷', insert: '/', hint: 'divide' },
      { symbol: '=', insert: '=', hint: 'equals' },
      { symbol: '≠', insert: '≠', hint: 'not equal' },
      { symbol: '%', insert: '%', hint: 'percent / mod' },
      { symbol: '±', insert: '±', hint: 'plus-minus' },
      { symbol: '·', insert: '*', hint: 'dot product' },
      { symbol: ':', insert: '/', hint: 'ratio' },
      { symbol: '∴', insert: '∴', hint: 'therefore' },
      { symbol: '∵', insert: '∵', hint: 'because' },
    ],
  },
  {
    id: 'compare',
    label: 'Compare',
    symbols: [
      { symbol: '<', insert: '<', hint: 'less than' },
      { symbol: '>', insert: '>', hint: 'greater than' },
      { symbol: '≤', insert: '<=', hint: 'less than or equal' },
      { symbol: '≥', insert: '>=', hint: 'greater than or equal' },
      { symbol: '≈', insert: '≈', hint: 'approximately' },
      { symbol: '≅', insert: '≅', hint: 'congruent' },
      { symbol: '≡', insert: '≡', hint: 'identical' },
      { symbol: '∝', insert: '∝', hint: 'proportional to' },
      { symbol: '≪', insert: '≪', hint: 'much less' },
      { symbol: '≫', insert: '≫', hint: 'much greater' },
      { symbol: '∼', insert: '∼', hint: 'similar' },
    ],
  },
  {
    id: 'algebra',
    label: 'Algebra',
    symbols: [
      { symbol: '√x', insert: 'sqrt(abs(x))', hint: 'square root' },
      { symbol: '∛x', insert: 'cbrt(abs(x))', hint: 'cube root' },
      { symbol: 'x²', insert: 'x^2', hint: 'x squared' },
      { symbol: 'x³', insert: 'x^3', hint: 'x cubed' },
      { symbol: 'xⁿ', insert: 'x^n', hint: 'x to the n' },
      { symbol: 'x⁻¹', insert: 'x^(-1)', hint: 'reciprocal' },
      { symbol: '∞', insert: '∞', hint: 'infinity' },
      { symbol: '∑', insert: '∑', hint: 'summation' },
      { symbol: '∏', insert: '∏', hint: 'product' },
      { symbol: '!', insert: '!', hint: 'factorial' },
      { symbol: 'x', insert: 'x', hint: 'the variable x' },
      { symbol: 'π', insert: 'pi', hint: 'pi (3.14159…)' },
    ],
  },
  {
    id: 'trig',
    label: 'Trig',
    symbols: [
      { symbol: 'sin(x)', insert: 'sin(x)' },
      { symbol: 'cos(x)', insert: 'cos(x)' },
      { symbol: 'tan(x)', insert: 'tan(x)' },
      { symbol: 'cot(x)', insert: 'cot(x)' },
      { symbol: 'sec(x)', insert: 'sec(x)' },
      { symbol: 'csc(x)', insert: 'csc(x)' },
      { symbol: 'sin⁻¹θ', insert: 'asin(x)', hint: 'arcsine' },
      { symbol: 'cos⁻¹θ', insert: 'acos(x)', hint: 'arccosine' },
      { symbol: 'tan⁻¹θ', insert: 'atan(x)', hint: 'arctangent' },
      { symbol: 'θ', insert: 'θ', hint: 'theta (angle)' },
      { symbol: '°', insert: '°', hint: 'degrees' },
      { symbol: 'rad', insert: 'rad', hint: 'radians' },
    ],
  },
  {
    id: 'geometry',
    label: 'Geometry',
    symbols: [
      { symbol: '∠', insert: '∠', hint: 'angle' },
      { symbol: '∟', insert: '∟', hint: 'right angle' },
      { symbol: '△', insert: '△', hint: 'triangle' },
      { symbol: '□', insert: '□', hint: 'quadrilateral' },
      { symbol: '⊙', insert: '⊙', hint: 'circle' },
      { symbol: '∥', insert: '∥', hint: 'parallel' },
      { symbol: '⊥', insert: '⊥', hint: 'perpendicular' },
      { symbol: '⌢', insert: '⌢', hint: 'arc' },
      { symbol: '→', insert: '→', hint: 'ray / direction' },
      { symbol: '↔', insert: '↔', hint: 'line' },
      { symbol: 'π', insert: 'pi', hint: 'pi' },
      { symbol: 'AB', insert: 'AB', hint: 'segment AB' },
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    symbols: [
      { symbol: 'lim', insert: 'lim', hint: 'limit' },
      { symbol: '→', insert: '→', hint: 'approaches' },
      { symbol: '∞', insert: '∞', hint: 'infinity' },
      { symbol: 'd/dx', insert: 'd/dx', hint: 'derivative' },
      { symbol: '∂', insert: '∂', hint: 'partial derivative' },
      { symbol: '∫', insert: '∫', hint: 'integral' },
      { symbol: '∬', insert: '∬', hint: 'double integral' },
      { symbol: '∮', insert: '∮', hint: 'contour integral' },
      { symbol: '∇', insert: '∇', hint: 'gradient / del' },
      { symbol: 'Δ', insert: 'Δ', hint: 'change' },
      { symbol: 'δ', insert: 'δ', hint: 'small change' },
      { symbol: 'f′(x)', insert: 'f(x)', hint: 'function of x' },
    ],
  },
  {
    id: 'sets',
    label: 'Sets',
    symbols: [
      { symbol: '∈', insert: '∈', hint: 'element of' },
      { symbol: '∉', insert: '∉', hint: 'not an element' },
      { symbol: '⊂', insert: '⊂', hint: 'proper subset' },
      { symbol: '⊃', insert: '⊃', hint: 'proper superset' },
      { symbol: '⊆', insert: '⊆', hint: 'subset or equal' },
      { symbol: '⊇', insert: '⊇', hint: 'superset or equal' },
      { symbol: '∪', insert: '∪', hint: 'union' },
      { symbol: '∩', insert: '∩', hint: 'intersection' },
      { symbol: '∅', insert: '∅', hint: 'empty set' },
      { symbol: 'ℕ', insert: 'ℕ', hint: 'natural numbers' },
      { symbol: 'ℤ', insert: 'ℤ', hint: 'integers' },
      { symbol: 'ℝ', insert: 'ℝ', hint: 'real numbers' },
    ],
  },
  {
    id: 'logic',
    label: 'Logic',
    symbols: [
      { symbol: '¬', insert: '¬', hint: 'NOT' },
      { symbol: '∧', insert: '∧', hint: 'AND' },
      { symbol: '∨', insert: '∨', hint: 'OR' },
      { symbol: '⊕', insert: '⊕', hint: 'XOR' },
      { symbol: '⇒', insert: '⇒', hint: 'implies' },
      { symbol: '⇔', insert: '⇔', hint: 'if and only if' },
      { symbol: '∀', insert: '∀', hint: 'for all' },
      { symbol: '∃', insert: '∃', hint: 'there exists' },
      { symbol: '∄', insert: '∄', hint: 'does not exist' },
      { symbol: '∴', insert: '∴', hint: 'therefore' },
      { symbol: '∵', insert: '∵', hint: 'because' },
      { symbol: '∎', insert: '∎', hint: 'end of proof' },
    ],
  },
  {
    id: 'greek',
    label: 'Greek',
    symbols: [
      { symbol: 'α', insert: 'α', hint: 'alpha' },
      { symbol: 'β', insert: 'β', hint: 'beta' },
      { symbol: 'γ', insert: 'γ', hint: 'gamma' },
      { symbol: 'δ', insert: 'δ', hint: 'delta' },
      { symbol: 'θ', insert: 'θ', hint: 'theta' },
      { symbol: 'λ', insert: 'λ', hint: 'lambda' },
      { symbol: 'μ', insert: 'μ', hint: 'mu' },
      { symbol: 'π', insert: 'pi', hint: 'pi (mathjs pi)' },
      { symbol: 'ρ', insert: 'ρ', hint: 'rho' },
      { symbol: 'σ', insert: 'σ', hint: 'sigma' },
      { symbol: 'φ', insert: 'φ', hint: 'phi' },
      { symbol: 'ω', insert: 'ω', hint: 'omega' },
      { symbol: 'Δ', insert: 'Δ', hint: 'capital delta' },
      { symbol: 'Σ', insert: 'Σ', hint: 'capital sigma' },
      { symbol: 'Ω', insert: 'Ω', hint: 'capital omega' },
      { symbol: 'Φ', insert: 'Φ', hint: 'capital phi' },
    ],
  },
  {
    id: 'numbers',
    label: 'Number sets',
    symbols: [
      { symbol: 'ℕ', insert: 'ℕ', hint: 'natural numbers' },
      { symbol: 'ℤ', insert: 'ℤ', hint: 'integers' },
      { symbol: 'ℚ', insert: 'ℚ', hint: 'rational numbers' },
      { symbol: 'ℝ', insert: 'ℝ', hint: 'real numbers' },
      { symbol: 'ℂ', insert: 'ℂ', hint: 'complex numbers' },
      { symbol: 'ℝ⁺', insert: 'ℝ⁺', hint: 'positive reals' },
      { symbol: 'ℤ⁺', insert: 'ℤ⁺', hint: 'positive integers' },
      { symbol: 'ℝ⁻', insert: 'ℝ⁻', hint: 'negative reals' },
      { symbol: 'ℤ⁻', insert: 'ℤ⁻', hint: 'negative integers' },
    ],
  },
  {
    id: 'powers',
    label: 'Sup / Sub',
    symbols: [
      { symbol: 'x⁰', insert: 'x^0' },
      { symbol: 'x¹', insert: 'x^1' },
      { symbol: 'x²', insert: 'x^2' },
      { symbol: 'x³', insert: 'x^3' },
      { symbol: 'x⁴', insert: 'x^4' },
      { symbol: 'x⁵', insert: 'x^5' },
      { symbol: 'xⁿ', insert: 'x^n' },
      { symbol: 'a₁', insert: 'a', hint: 'a sub 1' },
      { symbol: 'a₂', insert: 'a', hint: 'a sub 2' },
      { symbol: 'x₀', insert: 'x', hint: 'x sub 0' },
      { symbol: 'xₙ', insert: 'n*x', hint: 'x sub n' },
      { symbol: 'Aᵀ', insert: 'A', hint: 'matrix transpose' },
    ],
  },
  {
    id: 'brackets',
    label: 'Brackets',
    symbols: [
      { symbol: '( )', insert: '()', hint: 'parentheses' },
      { symbol: '[ ]', insert: '[]', hint: 'square brackets' },
      { symbol: '{ }', insert: '{}', hint: 'braces' },
      { symbol: '< >', insert: '<>', hint: 'angle brackets' },
      { symbol: '|x|', insert: 'abs(x)', hint: 'absolute value' },
      { symbol: '‖x‖', insert: 'norm(x)', hint: 'norm' },
      { symbol: '⌊x⌋', insert: 'floor(x)', hint: 'floor' },
      { symbol: '⌈x⌉', insert: 'ceil(x)', hint: 'ceiling' },
    ],
  },
];

interface MathSymbolPadProps {
  /** Insert text at the cursor (or append). */
  onInsert: (text: string) => void;
  /** Controls visibility from parent — floating overlay. */
  open: boolean;
  /** Called when the user requests close (outside click, Escape, close button). */
  onClose: () => void;
}

/**
 * Floating math symbol keyboard — Google-style overlay.
 *
 * On mobile: bottom sheet that slides up.
 * On desktop: floating card anchored below the equation input.
 * Auto-opens when the equation input is focused (parent controls `open`).
 */
export default function MathSymbolPad({ onInsert, open, onClose }: MathSymbolPadProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = !!useReducedMotion();

  const group = SYMBOL_GROUPS.find((g) => g.id === activeTab) ?? SYMBOL_GROUPS[0];

  const handleTap = (s: MathSymbol) => {
    onInsert(s.insert ?? s.symbol);
    setLastTapped(s.symbol);
    window.setTimeout(() => setLastTapped(null), 350);
  };

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) onClose();
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // Close on outside click (but not on the equation input itself)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#eq-input')) return;
      if (panelRef.current && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    // Delay to avoid catching the click that opened it
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 150);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — only on mobile (bottom sheet) */}
          <motion.div
            className="fixed inset-0 z-40 sm:hidden"
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
            onClick={onClose}
            aria-hidden
            style={{ background: 'rgba(var(--sc-bg), 0.55)', backdropFilter: 'blur(6px)' }}
          />

          {/* Floating panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label="Math symbols keyboard"
            className="
              fixed z-50 overflow-hidden flex flex-col
              /* Mobile: bottom sheet */
              inset-x-0 bottom-0 rounded-t-3xl
              /* Desktop: floating card */
              sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:top-[200px] sm:rounded-2xl sm:max-w-[640px] sm:w-[92vw]
              max-h-[55vh] sm:max-h-[440px]
            "
            style={{
              background: 'color-mix(in srgb, var(--sc-bg) 88%, transparent)',
              backdropFilter: 'blur(24px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
              border: '1px solid color-mix(in srgb, var(--sc-accent) 18%, transparent)',
              boxShadow:
                '0 -8px 40px -8px rgba(var(--sc-accent) / 0.09), 0 2px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
            initial={reduceMotion ? { y: 0, opacity: 1 } : { y: 50, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduceMotion ? { y: 0, opacity: 1 } : { y: 40, opacity: 0, scale: 0.97 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-2 sm:hidden shrink-0">
              <div className="w-10 h-[3px] rounded-full bg-sc-accent/30" />
            </div>

            {/* Header — subtle accent gradient strip */}
            <div
              className="flex items-center justify-between px-4 py-2.5 shrink-0"
              style={{
                background: 'linear-gradient(90deg, color-mix(in srgb, var(--sc-accent) 7%, transparent) 0%, transparent 60%)',
                borderBottom: '1px solid color-mix(in srgb, var(--sc-line) 12%, transparent)',
              }}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-sc-text tracking-wide">
                {/* Keyboard icon — accent tinted */}
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded"
                  style={{ background: 'color-mix(in srgb, var(--sc-accent) 12%, transparent)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sc-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
                  </svg>
                </span>
                <span className="text-sc-accent/70">Math</span> keyboard
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center w-6 h-6 rounded-full text-sc-text-faint hover:text-sc-text transition-all hover:scale-110"
                style={{ background: 'color-mix(in srgb, var(--sc-line) 18%, transparent)' }}
                aria-label="Close keyboard"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>
              </button>
            </div>

            {/* Category tabs — pill bar */}
            <div
              className="flex gap-1 overflow-x-auto px-3 py-2.5 scrollbar-none shrink-0"
              style={{ borderBottom: '1px solid color-mix(in srgb, var(--sc-line) 10%, transparent)' }}
            >
              {SYMBOL_GROUPS.map((g) => {
                const isActive = activeTab === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveTab(g.id)}
                    className="whitespace-nowrap rounded-full text-[11px] font-medium transition-all duration-200 shrink-0 px-3 py-1"
                    style={{
                      background: isActive
                        ? 'var(--sc-accent)'
                        : 'color-mix(in srgb, var(--sc-surface) 80%, transparent)',
                      color: isActive ? 'var(--sc-on-accent)' : 'var(--sc-text-soft)',
                      boxShadow: isActive
                        ? '0 0 12px -2px rgba(var(--sc-accent) / 0.35), 0 1px 3px rgba(0,0,0,0.12)'
                        : 'none',
                      border: isActive
                        ? '1px solid transparent'
                        : '1px solid color-mix(in srgb, var(--sc-line) 15%, transparent)',
                    }}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>

            {/* Glyph grid — scrollable */}
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex-1 overflow-y-auto p-3 grid grid-cols-6 sm:grid-cols-8 gap-1.5 content-start"
            >
              {group.symbols.map((s, i) => {
                const wasTapped = lastTapped === s.symbol;
                return (
                  <motion.button
                    key={s.symbol}
                    type="button"
                    onClick={() => handleTap(s)}
                    title={s.hint ?? s.insert ?? s.symbol}
                    aria-label={s.hint ?? s.symbol}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.15, delay: i * 0.012 }}
                    className="relative h-10 flex items-center justify-center overflow-hidden rounded-lg font-mono text-sm transition-all duration-150"
                    style={{
                      background: wasTapped
                        ? 'var(--sc-accent)'
                        : 'color-mix(in srgb, var(--sc-surface) 70%, transparent)',
                      color: wasTapped ? 'var(--sc-on-accent)' : 'var(--sc-text)',
                      border: wasTapped
                        ? '1px solid transparent'
                        : '1px solid color-mix(in srgb, var(--sc-line) 14%, transparent)',
                      boxShadow: wasTapped
                        ? '0 0 16px -3px rgba(var(--sc-accent) / 0.4), inset 0 1px 0 rgba(255,255,255,0.15)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.06)',
                    }}
                    whileHover={reduceMotion ? undefined : { scale: 1.06, y: -1 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 22 }}
                  >
                    {/* Subtle inner glow on idle buttons */}
                    {!wasTapped && (
                      <span
                        className="absolute inset-0 rounded-lg opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                        style={{
                          background: 'linear-gradient(135deg, rgba(var(--sc-accent) / 0.06) 0%, transparent 60%)',
                        }}
                      />
                    )}
                    <span className="relative z-10">{s.symbol}</span>
                  </motion.button>
                );
              })}
            </motion.div>

            {/* Footer hint */}
            <div
              className="px-4 py-2 shrink-0 flex items-center gap-2"
              style={{
                borderTop: '1px solid color-mix(in srgb, var(--sc-line) 10%, transparent)',
                background: 'linear-gradient(0deg, color-mix(in srgb, var(--sc-accent) 3%, transparent) 0%, transparent 100%)',
              }}
            >
              <span className="text-sc-accent/60 text-[11px]">⏎</span>
              <p className="text-[10px] text-sc-text-faint font-mono">
                Tap to insert — <span className="text-sc-accent/60">√x</span>, <span className="text-sc-accent/60">π</span>, <span className="text-sc-accent/60">sin(x)</span> are ready-to-play
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
