import { useEffect, useState } from 'react';
import { useStudioStore } from '../../store/studioStore';
import { useTranslation } from '../../i18n/index';
import { normalizePasted } from '../../utils/pasteNormalizer';
import { compile } from '../../utils/miniEval';

/** Sample an expression over a domain and check finiteness ratio. */
function useAutoFitDomain(expr: string, params: number[] = []): { domain: [number, number]; ratio: number } {
  const defaultMin = -20;
  const defaultMax = 60;
  const step = 0.5;
  const sampleCount = Math.max(10, Math.round((defaultMax - defaultMin) / step));
  let finite = 0;
  let total = 0;
  try {
    const f = compile(expr, params.length > 0 ? { p: params[0] } : {});
    for (let i = 0; i <= sampleCount; i++) {
      const x = defaultMin + (defaultMax - defaultMin) * (i / sampleCount);
      const y = f(x);
      total++;
      if (Number.isFinite(y)) finite++;
    }
  } catch {
    // If compilation fails, treat all as non-finite
  }
  const nonFiniteRatio = total > 0 ? 1 - finite / total : 1;
  // If >40% non-finite, expand domain to reduce non-finite ratio
  let [min, max] = [defaultMin, defaultMax];
  if (nonFiniteRatio > 0.4) {
    // Try narrowing the domain from each side
    for (const tryMin of [defaultMin, -10, 0, 10]) {
      for (const tryMax of [defaultMax, 10, 20, 30, 40, 50, 60]) {
        if (tryMax <= tryMin) continue;
        let fin = 0, tot = 0;
        try {
          const f2 = compile(expr, params.length > 0 ? { p: params[0] } : {});
          for (let i = 0; i <= sampleCount; i++) {
            const x = tryMin + (tryMax - tryMin) * (i / sampleCount);
            const y = f2(x);
            tot++;
            if (Number.isFinite(y)) fin++;
          }
        } catch {
          // keep existing counts
        }
        const ratio = tot > 0 ? 1 - fin / tot : 1;
        if (ratio <= 0.4) {
          min = tryMin;
          max = tryMax;
          break;
        }
      }
      if (max - min > 0) break;
    }
  }
  return { domain: [min, max], ratio: nonFiniteRatio };
}

interface Chip {
  label: string;
  onCopy: () => void;
}

export default function PasteCard() {
  const { t } = useTranslation();
  const { inputMode, equation, setInputMode, raw, expr, display, params, setRaw, setExpr, setDisplay, setParams } = useStudioStore();
  const [text, setText] = useState(equation);
  const [error, setError] = useState<string>('');
  const [notes, setNotes] = useState<string[]>([]);
  const [showVeil, setShowVeil] = useState(false);
  const [mode, setMode] = useState<'bar' | 'paste'>('bar');
  const [autoFitDomain, setAutoFitDomain] = useState<{ domain: [number, number]; ratio: number }>({ domain: [-20, 60], ratio: 0 });

  // Handle switching between bar and paste mode
  const switchMode = (newMode: 'bar' | 'paste') => {
    setMode(newMode);
    setInputMode(newMode);
    setShowVeil(newMode === 'bar');
    // Restore text from the other mode when switching
    if (newMode === 'bar') {
      setText(equation); // Restore bar equation
    } else {
      setText(raw || ''); // Use raw pasted text
    }
  };

  // Normalize the pasted equation
  const normalize = () => {
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

    // Compile the expression for evaluation
    try {
      const f = compile(result.expr, result.params ?? {});
      // Store the compiled function for later use
      // (the app uses its own evaluator, so we just validate here)
    } catch (e) {
      setError('Error compiling equation');
    }
  };

  // Auto-fit domain logic on text change
  useEffect(() => {
    const result = useAutoFitDomain(text);
    setAutoFitDomain(result);
  }, [text]);

  // Handle input change
  const handleChange = (val: string) => {
    setText(val);
    setError('');
    setNotes([]);
    setParams([]);
    setDisplay('');
  };

  // Clear the equation
  const clearEquation = () => {
    setText('');
    setError('');
    setNotes([]);
    setParams([]);
    setDisplay('');
  };

  // Example chips
  const chips: Chip[] = [
    { label: 'sin(x)', onCopy: () => setText('sin(x)') },
    { label: 'cos(3*x)', onCopy: () => setText('cos(3*x)') },
    { label: 'tan(x/2)', onCopy: () => setText('tan(x/2)') },
    { label: 'e^x', onCopy: () => setText('exp(x)') },
    { label: 'ln(x)', onCopy: () => setText('log(x)') },
    { label: 'abs(x)', onCopy: () => setText('abs(x)') },
    { label: 'x^2', onCopy: () => setText('x^2') },
    { label: '√x', onCopy: () => setText('sqrt(x)') },
    { label: 'x³ - x', onCopy: () => setText('x^3 - x') },
  ];

  if (mode === 'bar') {
    // When paste mode is active, bar is blank and disabled
    return null;
  }

  return (
    <div className="card paste-card mb-4">
      <div className="head">
        <h3 className="title">{t('studio.pasteEquation')}</h3>
        <button
          onClick={() => switchMode('bar')}
          className="btn solid"
          title={t('studio.useEquationBar')}
        >
          {t('studio.useEquationBar')}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        rows={4}
        placeholder="Enter an equation"
        className="eq"
        disabled={false}
      />

      <div className="chips">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className="chip"
            onClick={chip.onCopy}
          >
            {chip.label}
          </div>
        ))}
      </div>

      <div className="eqline">
        <span>Equation: {display || '—'}</span>
      </div>

      {notes.length > 0 && (
        <div className="notes">
          {notes.map((note) => (
            <div key={note}>{note}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="err">
          {error}
        </div>
      )}

      {params.length > 0 && (
        <div className="params">
          {params.map((prm) => (
            <div key={prm} className="prm">
              <label>
                {prm}
                <input
                  type="range"
                  min="-20"
                  max="60"
                  step="0.1"
                  value={0}
                  disabled={true}
                />
                <output>{prm} = 1</output>
              </label>
            </div>
          ))}
        </div>
      )}

      <button onClick={clearEquation} className="btn">
        {t('studio.clear')}
      </button>
      <button
        onClick={() => normalize()}
        className="btn solid"
        disabled={!text}
      >
        {t('studio.use')}
      </button>
      <button
        onClick={() => switchMode('bar')}
        className="btn"
      >
        {t('studio.useEquationBar')}
      </button>
    </div>
  );
}