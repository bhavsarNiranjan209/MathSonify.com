/**
 * PasteCard — paste a messy equation from anywhere and graph it.
 *
 * Textbooks, Wikipedia and lecture notes write equations in a dozen dialects:
 * `y = sin(x)`, `f(x) = x^2`, LaTeX `$\sin x$`, `2sinx`, `x²`. The equation bar
 * only accepts the Studio's canonical syntax, so this card is the front door
 * for pasted text: it normalises the paste (see `pasteNormalizer`), shows what
 * changed, and on "Use" applies the equation to the Studio — with a domain
 * fitted so the curve actually draws (see `pasteDomainFit`).
 *
 * The card is only visible while the store's inputMode is 'paste' (the
 * "Paste" button in the equation bar switches it on); in 'bar' mode it renders
 * nothing. Free parameters (k, a, b…) get no sliders here — once applied, the
 * Studio's own parameter handles take over for them.
 *
 * © 2026 MathSonify
 */
import { useState } from 'react';
import { useStudioStore } from '../../store/studioStore';
import { useTranslation } from '../../i18n/index';
import { normalizePasted } from '../../utils/pasteNormalizer';
import { fitDomainForExpression } from '../../utils/pasteDomainFit';

const CHIPS = [
  'sin(x)',
  'cos(3*x)',
  'tan(x/2)',
  'e^x',
  'ln(x)',
  'abs(x)',
  'x^2',
  '√x',
  'x³ - x',
];

export default function PasteCard() {
  const { t } = useTranslation();
  const inputMode = useStudioStore((s) => s.inputMode);
  const setInputMode = useStudioStore((s) => s.setInputMode);
  const setEquation = useStudioStore((s) => s.setEquation);
  const setDomain = useStudioStore((s) => s.setDomain);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);

  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [display, setDisplay] = useState('');
  const [params, setParams] = useState<string[]>([]);

  if (inputMode !== 'paste') return null;

  const backToBar = () => {
    setInputMode('bar');
  };

  const handleChange = (val: string) => {
    setText(val);
    setError('');
    setNotes([]);
    setParams([]);
    setDisplay('');
  };

  // Normalise, then APPLY: the old card stopped at normalising and never
  // loaded the equation into the Studio, which is why it felt unfinished.
  const useEquation = () => {
    const result = normalizePasted(text);
    if (!result.ok) {
      setError(result.error || 'Invalid equation');
      setNotes([]);
      setParams([]);
      return;
    }
    setError('');
    setNotes(result.notes);
    setDisplay(result.display);
    setParams(result.params ?? []);

    const fit = fitDomainForExpression(result.expr, result.params ?? [], [minX, maxX]);
    setEquation(result.expr);
    setDomain(fit.domain[0], fit.domain[1]);
    backToBar();
  };

  return (
    <div className="panel p-5 sm:p-6 border-t-2 border-sc-accent/60">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-display text-base font-semibold text-sc-text">
          {t('studio.pasteEquation')}
        </h3>
        <button
          type="button"
          onClick={backToBar}
          className="text-xs text-sc-accent hover:underline transition-colors font-medium py-1 min-h-[44px]"
        >
          {t('studio.useEquationBar')}
        </button>
      </div>

      <p className="text-xs text-sc-text-soft mb-3">{t('studio.pasteHint')}</p>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        placeholder="y = sin(x) · cos(3x)"
        autoFocus
        className="w-full rounded-lg border border-sc-line/20 bg-sc-sunken px-3 py-2 font-mono text-sm text-sc-text placeholder:text-sc-text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-sc-accent"
      />

      <div className="flex flex-wrap gap-1.5 mt-3">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => handleChange(chip)}
            className="px-2.5 py-1 rounded-full border border-sc-line/20 bg-sc-surface text-xs font-mono text-sc-text-soft hover:text-sc-text hover:border-sc-accent/50 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {display && (
        <p className="mt-3 font-mono text-xs text-sc-text-soft">
          Equation: <span className="text-sc-text">{display}</span>
        </p>
      )}

      {notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((note) => (
            <li key={note} className="text-xs text-sc-text-soft">
              • {note}
            </li>
          ))}
        </ul>
      )}

      {params.length > 0 && (
        <p className="mt-2 text-xs text-sc-text-soft">{t('studio.pasteParamsNote')}</p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-500">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => handleChange('')}
          className="px-3.5 py-2 min-h-[44px] btn-ghost text-xs"
        >
          {t('studio.clear')}
        </button>
        <button
          type="button"
          onClick={useEquation}
          disabled={!text.trim()}
          className="px-3.5 py-2 min-h-[44px] btn-primary text-xs disabled:opacity-40"
        >
          {t('studio.use')}
        </button>
      </div>
    </div>
  );
}
