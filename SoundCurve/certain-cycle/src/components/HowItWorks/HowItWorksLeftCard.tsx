import { useMemo } from 'react';
import { HOW_IT_WORKS_PRESETS, noteName, pitchFor, type DemoCurve } from '../../utils/howItWorksMath';

interface LeftCardProps {
  equation: string;
  draft: string;
  mode: 'frequency' | 'note' | 'rhythm' | 'chord';
  curve: DemoCurve;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  onPresetChoose: (v: string) => void;
  onModeChange: (v: 'frequency' | 'note' | 'rhythm' | 'chord') => void;
}

/**
 * Left card (H2): editable f(x), 6 preset chips, note readout, and four
 * sonification-mode buttons with captions. Purely presentational — state lives in parent.
 */
export default function HowItWorksLeftCard({
  equation,
  draft,
  mode,
  curve,
  onDraftChange,
  onSubmit,
  onPresetChoose,
  onModeChange,
}: LeftCardProps) {
  const topHz = curve.maxY != null ? pitchFor(curve, curve.maxY, mode, 220, 880) : null;
  const lowHz = curve.minY != null ? pitchFor(curve, curve.minY, mode, 220, 880) : null;

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="hwi-left-title">
      <h2 id="hwi-left-title" className="sr-only">Equation controls</h2>

      {/* ── Equation input ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-sm text-sc-text-soft shrink-0">f(x) =</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
            spellCheck={false}
            autoComplete="off"
            aria-label="Equation to visualize"
            className="font-mono text-base sm:text-lg text-sc-text bg-transparent border-b border-sc-line/30 focus:border-sc-accent outline-none transition-colors py-1 w-full min-w-0 sm:w-64"
          />
        </label>
      </div>

      {/* ── Preset chips (6) ── */}
      <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Preset equations">
        {HOW_IT_WORKS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onPresetChoose(preset)}
            aria-pressed={equation === preset}
            className={`font-mono text-xs px-3 min-h-[36px] rounded border transition-all ${
              equation === preset
                ? 'border-sc-accent text-sc-text bg-sc-accent/10'
                : 'border-sc-line/20 text-sc-text-soft hover:border-sc-line/45 hover:text-sc-text'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* ── Note readout ── */}
      {topHz && (
        <p className="mt-4 font-mono text-xs text-sc-text-soft">
          Highest point plays {noteName(topHz)} ({Math.round(topHz)} Hz){lowHz && ` · lowest {noteName(lowHz)} ({Math.round(lowHz)} Hz)`}
        </p>
      )}

      {/* ── Sonification mode selector with captions ── */}
      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-wider text-sc-text-faint mb-2">
          How the curve is read
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sonification mode">
          {(['frequency', 'note', 'rhythm', 'chord'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
              role="radio"
              className={`px-3 min-h-[40px] rounded text-xs capitalize transition-all ${
                mode === m
                  ? 'bg-sc-accent text-sc-on-accent'
                  : 'border border-sc-line/20 text-sc-text-soft hover:border-sc-line/45 hover:text-sc-text'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-sc-text-soft leading-relaxed">
          {mode === 'frequency' && 'Height maps straight onto pitch, continuously.'}
          {mode === 'note' && 'Height is snapped to a scale, so it sounds musical rather than glissando.'}
          {mode === 'rhythm' && 'Height drives loudness and triggering instead — there is no pitch here.'}
          {mode === 'chord' && 'Height decides how much of the voicing sounds at each point.'}
        </p>
      </div>

      {curve.error && (
        <p className="mt-4 text-sm text-sc-text-soft" role="status">
          {curve.error}
        </p>
      )}
    </section>
  );
}