import { useRef, useEffect } from 'react';
import { useTransportFrame } from './hooks';

function formatClock(seconds: number): string {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const millis = Math.floor((total % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

interface Props {
  project: { name: string; tempo: number };
  playing: boolean;
  loop: boolean;
  audioReady: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onRestart: () => void;
  onToggleLoop: () => void;
}

export default function Transport({ project, playing, loop, audioReady, onTogglePlay, onStop, onRestart, onToggleLoop }: Props) {
  const clockRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useTransportFrame((snapshot) => {
    if (clockRef.current) clockRef.current.textContent = formatClock(snapshot.positionSeconds);
    if (barRef.current) barRef.current.textContent = `BAR ${snapshot.bar} · BEAT ${snapshot.beat}`;
  });

  return (
    <header className="ml-transport" role="region" aria-label="Transport">
      <div className="ml-transport__identity">
        <div className="ml-mark" aria-hidden="true">
          <span className="ml-mark__curve" />
          <span className="ml-mark__dot" />
        </div>
        <div>
          <p className="ml-eyebrow">Music Lab <span className="ml-badge">Premium</span></p>
          <button className="ml-project-name" title="Rename">{project.name}</button>
        </div>
      </div>

      <div className="ml-transport__centre">
        <div className="ml-buttons">
          <button className="ml-icon-button" onClick={onRestart} aria-label="Restart" title="Restart (R)">
            <svg viewBox="0 0 24 24"><path d="M6 5v14M20 5v14l-11-7z" /></svg>
          </button>
          <button className={`ml-icon-button ml-icon-button--primary ${playing ? 'is-active' : ''}`} onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} title="Play / Pause (Space)">
            {playing ? <svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
          <button className="ml-icon-button" onClick={onStop} aria-label="Stop" title="Stop (S)">
            <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" /></svg>
          </button>
          <button className={`ml-icon-button ${loop ? 'is-active' : ''}`} onClick={onToggleLoop} aria-pressed={loop} aria-label="Loop" title="Loop (L)">
            <svg viewBox="0 0 24 24"><path d="M4 9h13l-3-3M20 15H7l3 3" /></svg>
          </button>
        </div>

        <div className="ml-clock">
          <span ref={clockRef} className="ml-clock__time">00:00.000</span>
          <span ref={barRef} className="ml-clock__bar">BAR 1 · BEAT 1</span>
        </div>

        <div className="ml-transport__fields">
          <label className="ml-field">
            <span>BPM</span>
            <input type="number" min={40} max={240} value={project.tempo} aria-label="Tempo" onChange={(e) => { /* setTempo */ }} />
          </label>
        </div>
      </div>
    </header>
  );
}