/**
 * Music Lab — drum sequencer.
 *
 * 8 lanes × 16 steps. Step cells are plain buttons; the moving step highlight
 * is one absolutely-positioned overlay written from the transport frame, so
 * playing patterns never re-render React.
 */

import { useRef } from 'react';
import { DRUM_ROWS, type MusicLabTrack } from '../../data/musicLabInstruments';
import { useMusicLabStore } from '../../store/musicLabStore';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { useTransportFrame } from './hooks';

const STEPS = 16;

interface Props {
  track: MusicLabTrack;
}

export default function DrumSequencer({ track }: Props) {
  const selectedDrumRow = useMusicLabStore((s) => s.selectedDrumRow);
  const selectDrumRow = useMusicLabStore((s) => s.selectDrumRow);
  const toggleDrumStep = useMusicLabStore((s) => s.toggleDrumStep);
  const setDrumStep = useMusicLabStore((s) => s.setDrumStep);
  const clearDrumLane = useMusicLabStore((s) => s.clearDrumLane);
  const clearDrumPattern = useMusicLabStore((s) => s.clearDrumPattern);
  const cursorRef = useRef<HTMLDivElement>(null);

  useTransportFrame((snapshot) => {
    const element = cursorRef.current;
    if (!element) return;
    if (snapshot.state !== 'playing') {
      element.style.opacity = '0';
      return;
    }
    // Steps are quarter-beats; wrap the playhead into the 16-step pattern.
    const beats = snapshot.positionBeats % (STEPS / 4);
    element.style.opacity = '1';
    element.style.left = `${((beats * 4) / STEPS) * 100}%`;
  });

  if (track.kind !== 'drums') {
    return (
      <section className="ml-drums" aria-label="Drum sequencer">
        <div className="ml-panel-head">
          <div><p className="ml-eyebrow">Drums</p><h2>Sequencer</h2></div>
        </div>
        <p className="ml-empty-note">Add a drum kit from the library to sequence it here.</p>
      </section>
    );
  }

  const activeCount = track.steps.reduce(
    (sum, lane) => sum + lane.filter((step) => step?.on).length, 0,
  );

  return (
    <section className="ml-drums" aria-label="Drum sequencer">
      <div className="ml-panel-head">
        <div><p className="ml-eyebrow">Drums · {track.name}</p><h2>Sequencer</h2></div>
        <div className="ml-roll__tools">
          <span className="ml-count">{activeCount} hits</span>
          <button type="button" className="ml-mini-button ml-mini-button--danger"
            onClick={() => { if (window.confirm('Clear the whole pattern?')) clearDrumPattern(track.id); }}>
            Clear all
          </button>
        </div>
      </div>

      <div className="ml-drums__ruler" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, step) => (
          <span key={step} className={step % 4 === 0 ? 'is-bar' : ''}>{step % 4 === 0 ? step / 4 + 1 : '·'}</span>
        ))}
      </div>

      <div className="ml-drums__grid" role="grid" aria-label={`Drum pattern for ${track.name}`}>
        {DRUM_ROWS.map((row, rowIndex) => {
          const lane = track.steps[rowIndex];
          const selected = selectedDrumRow === rowIndex;
          return (
            <div key={row.id} role="row" className={`ml-drums__row ${selected ? 'is-selected' : ''}`}
              style={{ '--ml-accent': row.accent } as React.CSSProperties}>
              <button type="button" role="rowheader" className={`ml-drums__lane ${selected ? 'is-active' : ''}`}
                onClick={() => { selectDrumRow(rowIndex); void musicLabTransport.previewDrumRow(track, rowIndex); }}
                title={`Audition ${row.label}`}>
                {row.label}
              </button>
              {Array.from({ length: STEPS }, (_, step) => {
                const cell = lane?.[step];
                const on = Boolean(cell?.on);
                return (
                  <button
                    key={step}
                    type="button"
                    role="gridcell"
                    aria-selected={on}
                    aria-label={`${row.label} step ${step + 1}${on ? `, velocity ${Math.round((cell?.velocity ?? 0.85) * 127)}` : ''}`}
                    className={`ml-drums__cell ${on ? 'is-on' : ''} ${step % 4 === 0 ? 'is-beat' : ''}`}
                    style={on ? { opacity: 0.45 + (cell?.velocity ?? 0.85) * 0.55 } : undefined}
                    onClick={() => {
                      selectDrumRow(rowIndex);
                      toggleDrumStep(track.id, rowIndex, step);
                      if (!on) void musicLabTransport.previewDrumRow(track, rowIndex);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (!cell?.on) return;
                      const next = Math.max(0.1, Math.min(1, (cell?.velocity ?? 0.85) - 0.25));
                      setDrumStep(track.id, rowIndex, step, { velocity: Number(next.toFixed(2)) });
                    }}
                    title={`${row.label} · click to toggle · right-click lowers velocity`}
                  />
                );
              })}
            </div>
          );
        })}
        <div ref={cursorRef} className="ml-drums__cursor" aria-hidden="true" style={{ opacity: 0 }} />
      </div>

      <div className="ml-roll__tools">
        <button type="button" className="ml-mini-button"
          onClick={() => clearDrumLane(track.id, selectedDrumRow)}>
          Clear selected lane
        </button>
        <span className="ml-hint">Click a lane head to audition it · selected lane: {DRUM_ROWS[selectedDrumRow]?.label}.</span>
      </div>
    </section>
  );
}
