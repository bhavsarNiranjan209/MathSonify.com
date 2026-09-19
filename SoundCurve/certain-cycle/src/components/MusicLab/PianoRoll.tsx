/**
 * Music Lab — piano roll grid (renderer shell + toolbar).
 */

import { useCallback, useMemo, useRef } from 'react';
import { getMusicLabInstrument } from '../../data/musicLabInstruments';
import { snapMidiToScale } from '../../utils/musicLabEquation';
import { projectLengthBeats } from '../../utils/musicLabProject';
import { useMusicLabStore } from '../../store/musicLabStore';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { useElementWidth } from './hooks';
import {
  usePianoGeometry, useRollPlayhead, clampMidi, PIANO_ROWS, ROW_H,
  type PianoRollProps,
} from './pianoRollHelpers';
import { useRollInteractions } from './pianoRollInteractions';
import { PianoGrid } from './PianoGrid';

const SNAP_CHOICES = [0.25, 0.5, 1, 2];

export default function PianoRoll({ project, track }: PianoRollProps) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const { loopLength, topMidi, cellWidth } = usePianoGeometry(project, track, frameWidth);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const snapEnabled = useMusicLabStore((s) => s.snapEnabled);
  const setSnapEnabled = useMusicLabStore((s) => s.setSnapEnabled);
  const zoom = useMusicLabStore((s) => s.zoom);
  const setZoom = useMusicLabStore((s) => s.setZoom);
  const selectedNoteIds = useMusicLabStore((s) => s.selectedNoteIds);
  const setNoteSelection = useMusicLabStore((s) => s.setNoteSelection);
  const addNote = useMusicLabStore((s) => s.addNote);
  const updateNotes = useMusicLabStore((s) => s.updateNotes);
  const deleteNotes = useMusicLabStore((s) => s.deleteNotes);
  const duplicateNotes = useMusicLabStore((s) => s.duplicateNotes);
  const clearNotes = useMusicLabStore((s) => s.clearNotes);
  const playheadRef = useRollPlayhead(loopLength, cellWidth);
  const patchProject = useMusicLabStore((s) => s.patchProject);
  const snap = project.snap;
  const snapToScale = project.scale !== 'chromatic';
  const instrument = track ? getMusicLabInstrument(track.instrumentId) : null;

  const beatsFromClientX = useCallback((clientX: number, grid: HTMLDivElement) => {
    const rect = grid.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / cellWidth);
  }, [cellWidth]);
  const midiFromClientY = useCallback((clientY: number, grid: HTMLDivElement) => {
    const rect = grid.getBoundingClientRect();
    const row = Math.floor((clientY - rect.top) / ROW_H);
    return clampMidi(topMidi - row);
  }, [topMidi]);

  const snapNote = useCallback((midi: number) => snapMidiToScale(midi, project.key, project.scale), [project.key, project.scale]);
  const preview = useCallback((midi: number) => {
    if (track) void musicLabTransport.previewTrack(track, midi, 0.5);
  }, [track]);

  const interactions = useRollInteractions({
    track: track ?? { id: 'none', notes: [] } as unknown as NonNullable<PianoRollProps['track']>,
    trackId: track?.id ?? '',
    cellWidth, snap, snapEnabled, snapToScale, snapNote,
    beatsFromClientX, midiFromClientY,
    selectedNoteIds, setNoteSelection, addNote, updateNotes, preview,
  });

  const rows = useMemo(() => Array.from({ length: PIANO_ROWS }, (_, i) => topMidi - i), [topMidi]);
  const gridWidth = Math.max(1, cellWidth * loopLength);

  if (!track || !instrument) {
    return (
      <section className="ml-roll" aria-label="Piano roll">
        <div className="ml-panel-head"><div><p className="ml-eyebrow">Notes</p><h2>Piano roll</h2></div></div>
        <p className="ml-empty-note">Select a melodic track to edit its notes.</p>
      </section>
    );
  }
  if (track.kind === 'drums') {
    return (
      <section className="ml-roll" aria-label="Piano roll">
        <div className="ml-panel-head"><div><p className="ml-eyebrow">Notes</p><h2>Piano roll</h2></div></div>
        <p className="ml-empty-note">“{track.name}” is a drum kit — edit it in the drum sequencer below.</p>
      </section>
    );
  }

  const onNoteKeyDown = (event: React.KeyboardEvent, noteId: string) => {
    const note = track.notes.find((n) => n.id === noteId);
    if (!note) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteNotes(track.id, [noteId]); }
    if (event.key === 'ArrowUp') { event.preventDefault(); updateNotes(track.id, [noteId], { pitch: clampMidi(note.pitch + 1) }); preview(note.pitch + 1); }
    if (event.key === 'ArrowDown') { event.preventDefault(); updateNotes(track.id, [noteId], { pitch: clampMidi(note.pitch - 1) }); preview(note.pitch - 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); updateNotes(track.id, [noteId], { start: Math.max(0, note.start - snap) }); }
    if (event.key === 'ArrowRight') { event.preventDefault(); updateNotes(track.id, [noteId], { start: note.start + snap }); }
  };

  return (
    <section className="ml-roll" aria-label={`Piano roll for ${track.name}`}>
      <div className="ml-panel-head">
        <div><p className="ml-eyebrow">Notes · {instrument.name}</p><h2>Piano roll</h2></div>
        <div className="ml-roll__tools">
          <span className="ml-count">{track.notes.length} notes</span>
          <button type="button" className="ml-mini-button" onClick={() => setNoteSelection(track.notes.map((n) => n.id))} disabled={!track.notes.length}>Select all</button>
          <button type="button" className="ml-mini-button" disabled={!selectedNoteIds.length}
            onClick={() => duplicateNotes(track.id, selectedNoteIds)}>Duplicate</button>
          <button type="button" className="ml-mini-button ml-mini-button--danger" disabled={!selectedNoteIds.length}
            onClick={() => deleteNotes(track.id, selectedNoteIds)}>Delete</button>
          <button type="button" className="ml-mini-button ml-mini-button--danger" disabled={!track.notes.length}
            onClick={() => { if (window.confirm('Clear all notes on this track?')) clearNotes(track.id); }}>Clear</button>
        </div>
      </div>
      <div className="ml-roll__options">
        <label className="ml-check"><input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} /> Snap</label>
        <div className="ml-snap-row" role="group" aria-label="Grid snap">
          {SNAP_CHOICES.map((value) => (
            <button key={value} type="button" className={`ml-chip ${snap === value ? 'is-active' : ''}`}
              onClick={() => patchProject({ snap: value })} aria-pressed={snap === value}>{value} beat</button>
          ))}
        </div>
        <div className="ml-zoom-row">
          <button type="button" className="ml-mini-button" onClick={() => setZoom(zoom - 0.25)} aria-label="Zoom out">−</button>
          <span className="ml-count">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ml-mini-button" onClick={() => setZoom(zoom + 0.25)} aria-label="Zoom in">+</button>
        </div>
      </div>
      <div className="ml-roll__frame" ref={frameRef}>
        <PianoGrid
          track={track} accent={instrument.accent} rows={rows} topMidi={topMidi}
          cellWidth={cellWidth} gridWidth={gridWidth} snap={snap}
          selectedNoteIds={selectedNoteIds} playheadRef={playheadRef}
          onEmptyPointerDown={(e, grid) => interactions.beginEmptyDrag(e, grid)}
          onNotePointerDown={(e, id, edge) => interactions.beginNoteDrag(e, id, edge)}
          onNoteKeyDown={onNoteKeyDown}
          onNoteDoubleClick={(id) => deleteNotes(track.id, [id])}
          onAuditionKey={preview}
          onVelocityPointerDown={(e, id) => interactions.beginVelocityDrag(e, id)}
        />
      </div>
      <p className="ml-hint">Click empty grid to add · drag to move · right edge resizes · double-click deletes · arrow keys nudge · length {loopLength} beats.</p>
    </section>
  );
}
