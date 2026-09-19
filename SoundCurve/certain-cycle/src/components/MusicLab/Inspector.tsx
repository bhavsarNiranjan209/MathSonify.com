/**
 * Music Lab — instrument inspector + equation panel.
 *
 * BEGINNER level exposes seven musical controls; ADVANCED reveals the full
 * parameter model. Every slider writes through `updateParams`, which pushes a
 * history entry ("Pitch +3 semitones") so undo restores the maths too.
 */

import { useMemo, useState } from 'react';
import { getMusicLabInstrument, type MusicLabParameters, type MusicLabTrack } from '../../data/musicLabInstruments';
import {
  harmonicRecipe,
  PARAMETER_HINTS,
  renderBaseEquation,
  renderEquation,
} from '../../utils/musicLabEquation';
import { useMusicLabStore, type EditorLevel } from '../../store/musicLabStore';

const BEGINNER_KEYS: (keyof MusicLabParameters)[] = [
  'pitch', 'intensity', 'brightness', 'warmth', 'reverb', 'attack', 'release',
];
const ADVANCED_KEYS: (keyof MusicLabParameters)[] = [
  'harmonics', 'decay', 'sustain', 'vibrato', 'tremolo', 'fm', 'am',
  'filter', 'distortion', 'delay', 'width', 'sub',
];

const RANGES: Partial<Record<keyof MusicLabParameters, [number, number, number]>> = {
  pitch: [-24, 24, 1],
  intensity: [0, 100, 1],
  brightness: [0, 100, 1],
  warmth: [0, 100, 1],
  harmonics: [0, 100, 1],
  attack: [0.002, 2, 0.001],
  decay: [0.01, 4, 0.01],
  sustain: [0, 100, 1],
  release: [0.01, 6, 0.01],
  vibrato: [0, 100, 1],
  tremolo: [0, 100, 1],
  fm: [0, 100, 1],
  am: [0, 100, 1],
  filter: [0, 100, 1],
  distortion: [0, 100, 1],
  delay: [0, 100, 1],
  reverb: [0, 100, 1],
  width: [0, 100, 1],
  sub: [0, 100, 1],
};

function ParamSlider({
  track, paramKey, label,
}: { track: MusicLabTrack; paramKey: keyof MusicLabParameters; label: string }) {
  const updateParams = useMusicLabStore((s) => s.updateParams);
  const range = RANGES[paramKey] ?? [0, 100, 1];
  const [min, max, step] = range;
  const value = track.params[paramKey];
  const display = step >= 1 ? Math.round(value) : value.toFixed(step >= 0.01 ? 2 : 3);
  const help = PARAMETER_HINTS[paramKey];
  return (
    <label className="ml-param" title={help}>
      <span className="ml-param__head">
        <span className="ml-param__name">{label}</span>
        <output>{paramKey === 'pitch' && value > 0 ? `+${display}` : display}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} for ${track.name}`}
        onChange={(event) => updateParams(track.id, paramKey, Number(event.target.value))}
      />
      <small className="ml-param__hint">{help}</small>
    </label>
  );
}

const LABELS: Partial<Record<keyof MusicLabParameters, string>> = {
  reverb: 'Space',
  intensity: 'Energy',
  fm: 'FM',
  am: 'Ring mod',
};

export default function Inspector({ track }: { track: MusicLabTrack | null }) {
  const editorLevel = useMusicLabStore((s) => s.editorLevel);
  const setEditorLevel = useMusicLabStore((s) => s.setEditorLevel);
  const resetParams = useMusicLabStore((s) => s.resetParams);
  const randomiseTrack = useMusicLabStore((s) => s.randomiseTrack);
  const [showMaths, setShowMaths] = useState(false);

  const instrument = track ? getMusicLabInstrument(track.instrumentId) : null;
  const { base, current } = useMemo(() => {
    if (!instrument || !track) return { base: '', current: '' };
    const recipe = harmonicRecipe(instrument, track.params);
    return {
      base: renderBaseEquation(instrument),
      current: renderEquation(instrument, track.params, recipe),
    };
  }, [instrument, track]);

  if (!track || !instrument) {
    return (
      <section className="ml-inspector" aria-label="Inspector">
        <div className="ml-panel-head">
          <div>
            <p className="ml-eyebrow">Inspector</p>
            <h2>Equation and controls</h2>
          </div>
        </div>
        <p className="ml-empty-note">Select a track to shape its mathematics.</p>
      </section>
    );
  }

  const copyEquation = () => { void navigator.clipboard?.writeText(current); };

  return (
    <section className="ml-inspector" aria-label="Inspector">
      <div className="ml-panel-head">
        <div>
          <p className="ml-eyebrow">{instrument.synthesis} model</p>
          <h2>{track.name}</h2>
        </div>
        <div className="ml-level-toggle" role="group" aria-label="Editing level">
          {(['beginner', 'advanced'] as EditorLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={editorLevel === level ? 'is-active' : ''}
              aria-pressed={editorLevel === level}
              onClick={() => setEditorLevel(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-equation">
        <div className="ml-equation__row">
          <span>BASE</span>
          <code>{base}</code>
        </div>
        <div className="ml-equation__row">
          <span>CURRENT</span>
          <code>{current}</code>
        </div>
        <div className="ml-equation__actions">
          <button type="button" className="ml-mini-button" onClick={copyEquation}>Copy equation</button>
          <button type="button" className="ml-mini-button" onClick={() => resetParams(track.id)}>Reset</button>
          <button type="button" className="ml-mini-button" onClick={() => randomiseTrack(track.id)}>Surprise me</button>
        </div>
      </div>

      <div className="ml-params">
        {BEGINNER_KEYS.map((key) => (
          <ParamSlider key={key} track={track} paramKey={key} label={LABELS[key] ?? key} />
        ))}
        {editorLevel === 'advanced' && ADVANCED_KEYS.map((key) => (
          <ParamSlider key={key} track={track} paramKey={key} label={LABELS[key] ?? key} />
        ))}
      </div>

      <button type="button" className="ml-mini-button ml-advanced-more" onClick={() => setShowMaths(!showMaths)}>
        {showMaths ? 'Hide maths details' : 'How does this work?'}
      </button>
      {showMaths && (
        <p className="ml-empty-note">
          {instrument.blurb} Every coefficient above is read verbatim by the synthesiser — the printed
          equation is the sound. Pitch shifts multiply x by 2^(semitones/12); brightness and warmth
          re-weight the partial ladder; tanh() drive squares off the waveform.
        </p>
      )}
    </section>
  );
}
