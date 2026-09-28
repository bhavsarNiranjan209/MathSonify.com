import { useRef, useMemo, useCallback, useState } from 'react';
import { useMusicLab } from './store';
import { useTransportFrame, useElementWidth } from './hooks';
import { getMusicLabInstrument, clampMidi, isBlackKey, noteName, PIANO_ROWS, ROW_H } from './pianoRollHelpers';
import { projectLengthBeats } from '../../utils/musicLabProject';

const SNAP_CHOICES = [0.25, 0.5, 1, 2];

interface Props {
  project: any;
  track: any;
}

export default function PianoRoll({ project, track }: Props) {
  const { state, updateTrack, updateNote, deleteNote, addNote, getInstrument } = useMusicLab();
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const cellWidth = Math.max(40, frameWidth / (projectLengthBeats(project) || 4));
  const loopLength = projectLengthBeats(project) || 4;
  const gridWidth = Math.max(1, cellWidth * loopLength);
  const instrument = getMusicLabInstrument(track.instrumentId);

  const rows = useMemo(() => {
    const topMidi = 84;
    return Array.from({ length: PIANO_ROWS }, (_, i) => topMidi - i);
  }, []);

  const snapEnabled = state.snapEnabled;
  const snap = project.snap || 0.25;

  const beatsFromClientX = useCallback((clientX: number) => {
    const grid = gridRef.current;
    if (!grid) return 0;
    const rect = grid.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / cellWidth);
  }, [cellWidth]);

  const midiFromClientY = useCallback((clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return 60;
    const rect = grid.getBoundingClientRect();
    const row = Math.floor((clientY - rect.top) / ROW_H);
    return clampMidi(84 - row);
  }, []);

  const [dragging, setDragging] = useState<{ type: 'empty' | 'note' | 'resize'; noteId?: string; startX: number; startY: number; originalNote?: any } | null>(null);

  const handleEmptyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const grid = gridRef.current;
    if (!grid) return;
    const startX = beatsFromClientX(e.clientX);
    const startMidi = midiFromClientY(e.clientY);
    const snappedStart = snapEnabled ? Math.round(startX / snap) * snap : startX;

    const newNote = {
      pitch: startMidi,
      start: snappedStart,
      duration: snap,
      velocity: 0.8,
    };
    addNote(track.id, newNote);
  };

  const handleNotePointerDown = (e: React.PointerEvent, note: any) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const isRightEdge = e.clientX > rect.right - 14;
    setDragging({ type: isRightEdge ? 'resize' : 'note', noteId: note.id, startX: e.clientX, startY: e.clientY, originalNote: note });
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = (e.clientX - dragging.startX) / cellWidth;
      const dy = Math.round((dragging.startY - e.clientY) / ROW_H);

      if (dragging.type === 'note' && dragging.originalNote) {
        const newStart = Math.max(0, dragging.originalNote.start + dx);
        const newPitch = clampMidi(dragging.originalNote.pitch + dy);
        const snappedStart = snapEnabled ? Math.round(newStart / snap) * snap : newStart;
        updateNote(track.id, dragging.noteId!, { start: snappedStart, pitch: newPitch });
      } else if (dragging.type === 'resize' && dragging.originalNote) {
        const newDuration = Math.max(snap, dragging.originalNote.duration + dx);
        const snappedDuration = snapEnabled ? Math.round(newDuration / snap) * snap : newDuration;
        updateNote(track.id, dragging.noteId!, { duration: Math.max(snap, snappedDuration) });
      }
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [dragging, cellWidth, snap, snapEnabled, track.id, updateNote]);

  useTransportFrame((snapshot) => {
    if (playheadRef.current) {
      const position = Math.min(1, Math.max(0, snapshot.positionBeats / loopLength));
      playheadRef.current.style.left = `${(position * 100).toFixed(3)}%`;
    }
  });

  if (track.kind === 'drums') {
    return (
      <section className="ml-roll" aria-label="Piano roll">
        <div className="ml-panel-head"><div><p className="ml-eyebrow">Notes</p><h2>Piano roll</h2></div></div>
        <p className="ml-empty-note">Drum tracks use the drum sequencer.</p>
      </section>
    );
  }

  return (
    <section className="ml-roll" aria-label={`Piano roll for ${track.name}`}>
      <div className="ml-panel-head">
        <div><p className="ml-eyebrow">Notes · {instrument.name}</p><h2>Piano roll</h2></div>
        <div className="ml-roll__tools">
          <span className="ml-count">{track.notes.length} notes</span>
          <label className="ml-check"><input type="checkbox" checked={snapEnabled} onChange={(e) => { /* setSnapEnabled */ }} /> Snap</label>
          <div className="ml-snap-row">
            {SNAP_CHOICES.map((value) => (
              <button key={value} type="button" className={snap === value ? 'active' : ''} onClick={() => { /* setSnap */ }}>{value} beat</button>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-roll__frame" ref={frameRef}>
        <div className="ml-roll__scroll">
          <div className="ml-roll__keys" aria-hidden="true">
            {rows.map((midi) => (
              <button key={midi} type="button" tabIndex={-1} className={`ml-key ${isBlackKey(midi) ? 'is-black' : ''}`} title={`Audition ${noteName(midi)}`}>{noteName(midi)}</button>
            ))}
          </div>
          <div className="ml-roll__gridwrap">
            <div className="ml-roll__grid" ref={gridRef} style={{ width: `${gridWidth}px`, height: `${PIANO_ROWS * ROW_H}px` }} onPointerDown={handleEmptyPointerDown}>
              {rows.map((midi, row) => (
                <div key={midi} className={`ml-roll__row ${isBlackKey(midi) ? 'is-black' : ''} ${row % 4 === 0 ? 'is-bar' : ''}`} style={{ top: `${row * ROW_H}px` }} />
              ))}
              {track.notes.map((note: any) => {
                const row = 84 - note.pitch;
                if (row < 0 || row >= PIANO_ROWS) return null;
                const left = note.start * cellWidth;
                const width = Math.max(14, note.duration * cellWidth);
                return (
                  <div
                    key={note.id}
                    data-note={note.id}
                    className="ml-note"
                    style={{ left: `${left}px`, top: `${row * ROW_H + 2}px`, width: `${width}px`, ['--ml-accent' as string]: instrument.accent }}
                    onPointerDown={(e) => handleNotePointerDown(e, note)}
                    onDoubleClick={() => deleteNote(track.id, note.id)}
                    title={`${noteName(note.pitch)} · drag to move, right edge to resize, double-click to delete`}
                  >
                    <span className="ml-note__label">{noteName(note.pitch)}</span>
                    <span className="ml-note__vel" style={{ width: `${Math.round(note.velocity * 100)}%` }} />
                  </div>
                );
              })}
              <div className="ml-playhead" ref={playheadRef} />
            </div>
          </div>
        </div>
      </div>
      <p className="ml-hint">Click empty grid to add · drag to move · right edge resizes · double-click deletes</p>
    </section>
  );
}