/**
 * Music Lab — piano roll (part 1: helpers + shell).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMusicLabInstrument, type MusicLabTrack } from '../../data/musicLabInstruments';
import { snapMidiToScale } from '../../utils/musicLabEquation';
import { projectLengthBeats, type MusicLabProject } from '../../utils/musicLabProject';
import { useMusicLabStore } from '../../store/musicLabStore';
import { useElementWidth, useTransportFrame } from './hooks';
import { musicLabTransport } from '../../utils/musicLabEngine';

export const PIANO_ROWS = 25;
export const MIN_MIDI = 36;
export const ROW_H = 22;

export function clampMidi(value: number, min = MIN_MIDI, max = 127): number {
  return Math.min(max, Math.max(min, value));
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

export interface PianoRollProps {
  project: MusicLabProject;
  track: MusicLabTrack | null;
}

export function usePianoGeometry(project: MusicLabProject, track: MusicLabTrack | null, containerWidth: number) {
  const zoom = useMusicLabStore((s) => s.zoom);
  const loopLength = Math.max(4, projectLengthBeats(project));
  const topMidi = useMemo(() => {
    if (!track || track.notes.length === 0) return 84;
    const avg = track.notes.reduce((sum, n) => sum + n.pitch, 0) / track.notes.length;
    return clampMidi(Math.round(avg) + 8, MIN_MIDI + PIANO_ROWS - 1, 108);
  }, [track]);
  const cellWidth = useMemo(() => {
    const usable = Math.max(220, containerWidth - 64);
    return (usable / Math.max(4, loopLength)) * zoom;
  }, [containerWidth, loopLength, zoom]);
  return { loopLength, topMidi, cellWidth };
}

export function useRollPlayhead(loopLength: number, cellWidth: number) {
  const playheadRef = useRef<HTMLDivElement>(null);
  useTransportFrame((snapshot) => {
    if (playheadRef.current) {
      const p = Math.min(1, Math.max(0, snapshot.positionBeats / loopLength));
      playheadRef.current.style.left = `calc(64px + ${(p * cellWidth * loopLength).toFixed(1)}px)`;
    }
  });
  return playheadRef;
}
