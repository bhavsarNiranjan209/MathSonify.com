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
 * Left card (H2): editable f(x), 6 preset chips, a mode-aware note readout,
 * and the four sonification modes as one connected segment.
 * Purely presentational — state lives in parent. Restyled to the redesign
 * mockup: Instrument Serif f(x), a bordered note line, a 4-column segment.
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

  // Local maxima above the lower 15% of the range — what Rhythm mode counts.
  const peaks = useMemo(() => {
    const pts = curve.points;
    if (pts.length < 3) return 0;
    const lim = curve.minY + 0.15 * (curve.maxY - curve.minY);
    let n = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], prev = pts[i - 1], next = pts[i + 1];
      if (!p?.isValid || !prev?.isValid || !next?.isValid) continue;
      if (p.y > prev.y && p.y >= next.y && p.y > lim) n++;
    }
    return n;
  }, [curve]);

  const note =
    mode === 'rhythm'
      ? peaks > 0
        ? `Every peak triggers a hit — ${peaks} peak${peaks > 1 ? 's' : ''} in this curve.`
        : 'No peaks here — a steady beat plays instead.'
      : topHz
        ? mode === 'note'
          ? `Highest point snaps to ${noteName(topHz)} (${Math.round(topHz)} Hz).`
          : mode === 'chord'
            ? `Highest point plays ${noteName(topHz)} (${Math.round(topHz)} Hz) — the chord builds from there.`
            : `Highest point plays ${noteName(topHz)} (${Math.round(topHz)} Hz).`
        : '';

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="hwi-left-title">
      <h2 id="hwi-left-title" className="sr-only">Equation controls</h2>

      {/* ── Equation input ── */}
      <div className="flex justify-between items-center gap-2.5 mb-3.5">
        <label className="flex items-baseline gap-2.5 min-w-0 flex-1">
          <b className="font-instrument italic font-normal text-[28px] shrink-0">f(x) =</b>
          <input
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
            spellCheck={false}
            autoComplete="off"
            aria-label="Equation to visualize"
            aria-describedby={curve.error ? 'hwi-eq-err' : undefined}
            className="font-mono text-xl sm:text-2xl text-sc-text bg-transparent border-0 border-b border-transparent focus:border-sc-line/60 outline-none py-0.5 flex-1 min-w-0"
          />
        </label>
        <span className="hidden sm:block font-mono text-[10px] tracking-[0.18em] uppercase text-sc-text-faint whitespace-nowrap">
          Example equations
        </span>
      </div>

      {curve.error && (
        <p id="hwi-eq-err" className="min-h-4 text-xs status-error -mt-1.5 mb-2" role="status">
          That equation couldn&apos;t be read — try something like sin(x) or x^2.
        </p>
      )}

      {/* ── Preset chips (6) ── */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset equations">
        {HOW_IT_WORKS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onPresetChoose(preset)}
            aria-pressed={equation === preset}
            className={`font-mono text-[11.5px] px-3 py-2 rounded-lg border transition-colors ${
              equation === preset
                ? 'border-sc-text bg-sc-text/10 text-sc-text'
                : 'border-sc-line/20 bg-sc-sunken text-sc-text hover:border-sc-line/60'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* ── Note readout (mode-aware) ── */}
      {note && (
        <p className="mt-[18px] mb-3.5 font-mono text-[10px] tracking-[0.14em] uppercase text-sc-text-faint border-t border-sc-line/20 pt-3.5 leading-[1.7]">
          {note}
        </p>
      )}

      {/* ── Sonification mode selector with captions ── */}
      <div className="font-mono text-[10.5px] tracking-[0.16em] font-semibold uppercase mb-2.5">
        How the curve is read
      </div>
      <div className="grid grid-cols-4 border border-sc-line/20 rounded-[10px] overflow-hidden bg-sc-sunken" role="radiogroup" aria-label="Sonification mode">
        {(['frequency', 'note', 'rhythm', 'chord'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            aria-pressed={mode === m}
            role="radio"
            className={`px-1 py-3.5 text-xs transition-colors border-r border-sc-line/20 last:border-r-0 ${
              mode === m
                ? 'bg-sc-accent text-sc-on-accent font-semibold'
                : 'text-sc-text-soft hover:text-sc-text'
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <p className="mt-3.5 text-[13px] text-sc-text opacity-80 min-h-5">
        {mode === 'frequency' && 'Height maps straight onto pitch, continuously.'}
        {mode === 'note' && 'Height snaps to the nearest note of a musical scale.'}
        {mode === 'rhythm' && 'Each peak of the curve triggers a short percussive hit.'}
        {mode === 'chord' && 'Height picks the root of a chord that plays together.'}
      </p>
    </section>
  );
}
