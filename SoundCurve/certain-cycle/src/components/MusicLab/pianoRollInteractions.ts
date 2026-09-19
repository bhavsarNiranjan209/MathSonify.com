/**
 * Music Lab — piano roll interactions (pointer + touch drag logic).
 */

import { useCallback, useEffect, useRef } from 'react';
import { musicLabId, type MusicLabTrack } from '../../data/musicLabInstruments';
import { clampMidi } from './pianoRollHelpers';

export interface DragState {
  mode: 'move' | 'resize' | 'velocity';
  pointerId: number;
  noteIds: string[];
  originNotes: { id: string; start: number; duration: number; pitch: number; velocity: number }[];
  originX: number;
  originY: number;
}

export interface InteractionArgs {
  track: MusicLabTrack;
  trackId: string;
  cellWidth: number;
  snap: number;
  snapEnabled: boolean;
  snapToScale: boolean;
  snapNote: (midi: number) => number;
  beatsFromClientX: (clientX: number, grid: HTMLDivElement) => number;
  midiFromClientY: (clientY: number, grid: HTMLDivElement) => number;
  selectedNoteIds: string[];
  setNoteSelection: (ids: string[]) => void;
  addNote: (trackId: string, note: Partial<MusicLabTrack['notes'][number]>) => MusicLabTrack['notes'][number] | null;
  updateNotes: (trackId: string, ids: string[], patch: Partial<MusicLabTrack['notes'][number]>) => void;
  preview: (midi: number) => void;
}

const ROW_H = 22;

export function quantise(beats: number, snap: number, enabled: boolean): number {
  if (!enabled || snap <= 0) return Math.max(0, beats);
  return Math.max(0, Math.round(beats / snap) * snap);
}
export function useRollInteractions(args: InteractionArgs) {
  const dragRef = useRef<DragState | null>(null);

  const finishDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    args.updateNotes(args.trackId, drag.noteIds, {});
    const moved = args.track.notes.find((n) => n.id === drag.noteIds[0]);
    if (moved) args.preview(moved.pitch);
  }, [args]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      const dxBeats = (event.clientX - drag.originX) / args.cellWidth;
      const dyRows = Math.round((event.clientY - drag.originY) / ROW_H);
      if (drag.mode === 'resize') {
        const origin = drag.originNotes[0];
        if (!origin) return;
        const next = Math.max(0.25, quantise(origin.duration + dxBeats, args.snap, args.snapEnabled));
        args.updateNotes(args.trackId, drag.noteIds, { duration: Number(next.toFixed(3)) });
        return;
      }
      if (drag.mode === 'velocity') {
        const origin = drag.originNotes[0];
        if (!origin) return;
        const delta = (event.clientY - drag.originY) / 60;
        const next = Math.max(0.05, Math.min(1, origin.velocity - delta));
        args.updateNotes(args.trackId, drag.noteIds, { velocity: Number(next.toFixed(2)) });
        return;
      }
      for (const origin of drag.originNotes) {
        const rawStart = origin.start + dxBeats;
        const rawPitch = origin.pitch - dyRows;
        const snapped = args.snapToScale ? args.snapNote(clampMidi(rawPitch)) : clampMidi(rawPitch);
        args.updateNotes(args.trackId, [origin.id], {
          start: Number(quantise(rawStart, args.snap, args.snapEnabled).toFixed(3)),
          pitch: snapped,
        });
      }
    };
    const onUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) finishDrag();
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [args, finishDrag]);

  const beginNoteDrag = useCallback((event: React.PointerEvent, noteId: string, rightEdge: boolean) => {
    if (event.pointerType === 'touch' && !event.isPrimary) return;
    event.stopPropagation();
    const note = args.track.notes.find((n) => n.id === noteId);
    if (!note) return;
    const ids = args.selectedNoteIds.includes(noteId) ? args.selectedNoteIds : [noteId];
    if (!args.selectedNoteIds.includes(noteId)) args.setNoteSelection(ids);
    dragRef.current = {
      mode: rightEdge ? 'resize' : 'move',
      pointerId: event.pointerId,
      noteIds: ids,
      originNotes: ids.flatMap((id) => {
        const found = args.track.notes.find((n) => n.id === id);
        return found ? [{ id, start: found.start, duration: found.duration, pitch: found.pitch, velocity: found.velocity }] : [];
      }),
      originX: event.clientX,
      originY: event.clientY,
    };
  }, [args]);

  const beginEmptyDrag = useCallback((event: React.PointerEvent, grid: HTMLDivElement) => {
    if (event.pointerType === 'touch' && !event.isPrimary) return;
    if ((event.target as HTMLElement).closest('[data-note]')) return;
    const beats = args.beatsFromClientX(event.clientX, grid);
    const midi = args.midiFromClientY(event.clientY, grid);
    const created = args.addNote(args.trackId, {
      id: musicLabId('note'),
      pitch: args.snapToScale ? args.snapNote(midi) : midi,
      start: quantise(beats, args.snap, args.snapEnabled),
      duration: Math.max(0.25, args.snap),
      velocity: 0.82,
    });
    if (created) {
      args.setNoteSelection([created.id]);
      args.preview(created.pitch);
    }
  }, [args]);

  const beginVelocityDrag = useCallback((event: React.PointerEvent, noteId: string) => {
    if (event.pointerType === 'touch' && !event.isPrimary) return;
    event.stopPropagation();
    const note = args.track.notes.find((n) => n.id === noteId);
    if (!note) return;
    dragRef.current = {
      mode: 'velocity',
      pointerId: event.pointerId,
      noteIds: [noteId],
      originNotes: [{ id: noteId, start: note.start, duration: note.duration, pitch: note.pitch, velocity: note.velocity }],
      originX: event.clientX,
      originY: event.clientY,
    };
  }, [args]);

  return { beginNoteDrag, beginEmptyDrag, beginVelocityDrag };
}

