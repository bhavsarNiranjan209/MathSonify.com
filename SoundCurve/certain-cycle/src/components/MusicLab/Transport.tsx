/**
 * Music Lab — transport.
 *
 * The clock readout is written to the DOM from an animation frame, so the
 * millisecond display never triggers a React render.
 */

import { useRef, useState } from 'react';
import { MUSIC_LAB_KEYS, MUSIC_LAB_SCALES } from '../../utils/musicLabEquation';
import { useMusicLabStore } from '../../store/musicLabStore';
import { useTransportFrame } from './hooks';
import type { MusicLabProject } from '../../utils/musicLabProject';

interface Props {
  project: MusicLabProject;
  playing: boolean;
  loop: boolean;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  audioReady: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onRestart: () => void;
  onToggleLoop: () => void;
  onExport: () => void;
  onShare: () => void;
  onSave: () => void;
  onShowShortcuts: () => void;
}

function formatClock(seconds: number): string {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.floor((total % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export default function Transport({
  project,
  playing,
  loop,
  canUndo,
  canRedo,
  exporting,
  audioReady,
  onTogglePlay,
  onStop,
  onRestart,
  onToggleLoop,
  onExport,
  onShare,
  onSave,
  onShowShortcuts,
}: Props) {
  const setTempo = useMusicLabStore((state) => state.setTempo);
  const patchProject = useMusicLabStore((state) => state.patchProject);
  const renameProject = useMusicLabStore((state) => state.renameProject);
  const undo = useMusicLabStore((state) => state.undo);
  const redo = useMusicLabStore((state) => state.redo);
  const saveStatus = useMusicLabStore((state) => state.saveStatus);
  const message = useMusicLabStore((state) => state.message);

  const [editingName, setEditingName] = useState(false);
  const clockRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const tapsRef = useRef<number[]>([]);

  useTransportFrame((snapshot) => {
    if (clockRef.current) clockRef.current.textContent = formatClock(snapshot.positionSeconds);
    if (barRef.current) barRef.current.textContent = `BAR ${snapshot.bar} · BEAT ${snapshot.beat}`;
  });

  /** Tap tempo: average the recent intervals. */
  const tapTempo = () => {
    const now = performance.now();
    const taps = [...tapsRef.current.filter((time) => now - time < 2500), now];
    tapsRef.current = taps;
    if (taps.length < 2) {
      useMusicLabStore.getState().notify('Tap again to set the tempo.');
      return;
    }
    const intervals = taps.slice(1).map((time, index) => time - taps[index]);
    const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    setTempo(Math.round(60000 / average));
  };

  return (
    <header className="ml-transport" role="region" aria-label="Transport">
      <div className="ml-transport__identity">
        <div className="ml-mark" aria-hidden="true">
          <span className="ml-mark__curve" />
          <span className="ml-mark__dot" />
        </div>
        <div>
          <p className="ml-eyebrow">
            Music Lab
            <span className="ml-badge">Premium</span>
          </p>
          {editingName ? (
            <input
              className="ml-project-name is-editing"
              value={project.name}
              autoFocus
              aria-label="Project name"
              onChange={(event) => renameProject(event.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'Escape') setEditingName(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="ml-project-name"
              onClick={() => setEditingName(true)}
              title="Rename this project"
            >
              {project.name}
            </button>
          )}
        </div>
      </div>

      <div className="ml-transport__centre">
        <div className="ml-buttons">
          <button
            type="button"
            className="ml-icon-button"
            onClick={onRestart}
            aria-label="Restart from the beginning"
            title="Restart (R)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M20 5v14l-11-7z" /></svg>
          </button>
          <button
            type="button"
            className={`ml-icon-button ml-icon-button--primary ${playing ? 'is-active' : ''}`}
            onClick={onTogglePlay}
            aria-label={playing ? 'Pause playback' : 'Play the arrangement'}
            aria-pressed={playing}
            title="Play / Pause (Space)"
          >
            {playing
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
          <button
            type="button"
            className="ml-icon-button"
            onClick={onStop}
            aria-label="Stop playback"
            title="Stop (S)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg>
          </button>
          <button
            type="button"
            className={`ml-icon-button ${loop ? 'is-active' : ''}`}
            onClick={onToggleLoop}
            aria-pressed={loop}
            aria-label="Loop the arrangement"
            title="Loop (L)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3" /></svg>
          </button>
        </div>

        <div className="ml-clock">
          <span ref={clockRef} className="ml-clock__time">00:00.000</span>
          <span ref={barRef} className="ml-clock__bar">BAR 1 · BEAT 1</span>
        </div>

        <div className="ml-transport__fields">
          <label className="ml-field">
            <span>BPM</span>
            <span className="ml-field__row">
              <input
                type="number"
                min={40}
                max={240}
                value={project.tempo}
                aria-label="Tempo in beats per minute"
                onChange={(event) => setTempo(Number(event.target.value))}
              />
              <button type="button" className="ml-tap" onClick={tapTempo} title="Tap to set the tempo">
                TAP
              </button>
            </span>
          </label>
          <label className="ml-field">
            <span>Key</span>
            <select
              value={project.key}
              aria-label="Project key"
              onChange={(event) => patchProject({ key: event.target.value })}
            >
              {MUSIC_LAB_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          </label>
          <label className="ml-field">
            <span>Scale</span>
            <select
              value={project.scale}
              aria-label="Project scale"
              onChange={(event) => patchProject({ scale: event.target.value })}
            >
              {MUSIC_LAB_SCALES.map((scale) => (
                <option key={scale.id} value={scale.id}>{scale.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="ml-transport__actions">
        <div className="ml-buttons">
          <button type="button" className="ml-text-button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            Undo
          </button>
          <button type="button" className="ml-text-button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            Redo
          </button>
          <button type="button" className="ml-text-button" onClick={onSave} title="Save in this browser (Ctrl+S)">
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Save'}
          </button>
          <button
            type="button"
            className="ml-text-button ml-text-button--accent"
            onClick={onExport}
            disabled={exporting}
            title="Render the arrangement to a WAV file"
          >
            {exporting ? 'Rendering…' : 'Export WAV'}
          </button>
          <button type="button" className="ml-text-button" onClick={onShare} title="Copy the project JSON">
            Share
          </button>
          <button
            type="button"
            className="ml-icon-button ml-icon-button--ghost"
            onClick={onShowShortcuts}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
        </div>
        <p className="ml-status" aria-live="polite">
          {!audioReady && <span className="ml-status__flag">Audio idle — press play once</span>}
          {message}
        </p>
      </div>
    </header>
  );
}