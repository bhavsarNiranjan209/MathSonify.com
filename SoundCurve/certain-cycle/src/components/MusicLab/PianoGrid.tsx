/**
 * Music Lab — piano roll note grid + velocity lane (pure renderer).
 */

import { useMemo } from 'react';
import type { MusicLabTrack } from '../../data/musicLabInstruments';
import { clampMidi, isBlackKey, noteName, PIANO_ROWS, ROW_H } from './pianoRollHelpers';

interface GridProps {
  track: MusicLabTrack;
  accent: string;
  rows: number[];
  topMidi: number;
  cellWidth: number;
  gridWidth: number;
  snap: number;
  selectedNoteIds: string[];
  playheadRef: React.RefObject<HTMLDivElement | null>;
  onEmptyPointerDown: (event: React.PointerEvent, grid: HTMLDivElement) => void;
  onNotePointerDown: (event: React.PointerEvent, noteId: string, rightEdge: boolean) => void;
  onNoteKeyDown: (event: React.KeyboardEvent, noteId: string) => void;
  onNoteDoubleClick: (noteId: string) => void;
  onAuditionKey: (midi: number) => void;
  onVelocityPointerDown: (event: React.PointerEvent, noteId: string) => void;
}

export function PianoGrid(props: GridProps) {
  const { track, accent, rows, topMidi, cellWidth, gridWidth } = props;
  const sorted = useMemo(() => [...track.notes].sort((a, b) => a.start - b.start), [track.notes]);
  return (
    <div className="ml-roll__scroll">
      <div className="ml-roll__keys" aria-hidden="true">
        {rows.map((midi) => (
          <button key={midi} type="button" tabIndex={-1}
            className={`ml-key ${isBlackKey(midi) ? 'is-black' : ''}`}
            onClick={() => props.onAuditionKey(midi)} title={`Audition ${noteName(midi)}`}>
            {noteName(midi)}
          </button>
        ))}
      </div>
      <div className="ml-roll__gridwrap">
        <div className="ml-roll__grid" style={{ width: `${gridWidth}px`, height: `${PIANO_ROWS * ROW_H}px` }}
          onPointerDown={(e) => props.onEmptyPointerDown(e, e.currentTarget)}>
          {rows.map((midi, row) => (
            <div key={midi} className={`ml-roll__row ${isBlackKey(midi) ? 'is-black' : ''} ${row % 4 === 0 ? 'is-bar' : ''}`}
              style={{ top: `${row * ROW_H}px` }} />
          ))}
          {track.notes.map((note) => {
            const row = topMidi - note.pitch;
            if (row < 0 || row >= PIANO_ROWS) return null;
            const left = note.start * cellWidth;
            const width = Math.max(14, note.duration * cellWidth);
            const isSel = props.selectedNoteIds.includes(note.id);
            return (
              <div key={note.id} data-note={note.id} role="button" tabIndex={0}
                aria-label={`${noteName(note.pitch)} at beat ${note.start.toFixed(2)}, velocity ${Math.round(note.velocity * 127)}`}
                aria-pressed={isSel}
                className={`ml-note ${isSel ? 'is-selected' : ''}`}
                style={{ left: `${left}px`, top: `${row * ROW_H + 2}px`, width: `${width}px`, ['--ml-accent' as string]: accent }}
                onPointerDown={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  props.onNotePointerDown(e, note.id, e.clientX > rect.right - 14);
                }}
                onKeyDown={(e) => props.onNoteKeyDown(e, note.id)}
                onDoubleClick={() => props.onNoteDoubleClick(note.id)}
                title={`${noteName(note.pitch)} · drag to move, right edge to resize, double-click to delete`}
              >
                <span className="ml-note__label">{noteName(note.pitch)}</span>
                <span className="ml-note__vel" style={{ width: `${Math.round(note.velocity * 100)}%` }} />
              </div>
            );
          })}
          <div className="ml-playhead" ref={props.playheadRef} />
        </div>
        <div className="ml-velocity" style={{ width: `${gridWidth}px` }} aria-label="Velocity lane">
          <span className="ml-velocity__label">Velocity</span>
          <div className="ml-velocity__track">
            {sorted.map((note) => (
              <div key={note.id} className="ml-velocity__bar" title={`Velocity ${Math.round(note.velocity * 127)} — drag vertically`}
                style={{ left: `${note.start * cellWidth}px`, height: `${Math.max(3, note.velocity * 34)}px` }}
                onPointerDown={(e) => props.onVelocityPointerDown(e, note.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { clampMidi };
