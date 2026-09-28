import { useRef, useState, useMemo, useEffect } from 'react';
import { useMusicLab } from './store';
import { useTransportFrame } from './hooks';
import { getMusicLabInstrument } from '../../data/musicLabInstruments';
import type { MusicLabTrack } from './types';

interface Props {
  track: MusicLabTrack;
  loopLength: number;
}

export function TrackLane({ track, loopLength }: Props) {
  const { state, updateTrack, addNote } = useMusicLab();
  const instrument = getMusicLabInstrument(track.instrumentId);
  const laneRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const isSelected = state.selectedTrackId === track.id;
  const [isDragOver, setIsDragOver] = useState(false);

  const blocks = useMemo(() => {
    if (track.kind === 'drums') return [];
    return track.notes.map((note: any) => ({
      id: note.id,
      left: Math.max(0, Math.min(100, (note.start / loopLength) * 100)),
      width: Math.max(1.5, (note.duration / loopLength) * 100),
    }));
  }, [track.notes, track.kind, loopLength]);

  useTransportFrame((snapshot) => {
    const head = playheadRef.current;
    if (!head) return;
    const position = track.kind === 'drums'
      ? (snapshot.positionBeats % 4) / 4
      : Math.min(1, Math.max(0, snapshot.positionBeats / loopLength));
    head.style.left = `${(position * 100).toFixed(3)}%`;
  });

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.stopPropagation();
    if (!laneRef.current?.contains(event.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const instrumentId = event.dataTransfer.getData('application/x-musiclab-instrument');
    if (!instrumentId) return;

    const lane = laneRef.current;
    if (!lane) return;

    const rect = lane.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const positionBeats = percentage * loopLength;

    const newNote = {
      pitch: 60,
      start: positionBeats,
      duration: 1,
      velocity: 0.8,
    };
    addNote(track.id, newNote);
  };

  const toggleMute = () => updateTrack(track.id, { muted: !track.muted });
  const toggleSolo = () => updateTrack(track.id, { solo: !track.solo });

  return (
    <div className={`ml-track ${isSelected ? 'is-selected' : ''} ${isDragOver ? 'is-drag-over' : ''}`} role="row" style={{ '--ml-accent': instrument.accent } as React.CSSProperties}>
      <button
        type="button"
        className="ml-track__head"
        onClick={() => { /* select track */ }}
        aria-pressed={isSelected}
        aria-label={`Select ${track.name}`}
      >
        <span className="ml-track__icon" aria-hidden="true">{instrument.icon}</span>
        <span className="ml-track__meta">
          <strong>{track.name}</strong>
          <small>{track.kind === 'drums' ? 'Drum kit · 16 steps' : `${track.notes.length} notes`}</small>
        </span>
        <span className="ml-track__toggles">
          <span className={`ml-toggle ${track.muted ? 'is-on' : ''}`} onClick={toggleMute} aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}>M</span>
          <span className={`ml-toggle ${track.solo ? 'is-on' : ''}`} onClick={toggleSolo} aria-label={track.solo ? `Unsolo ${track.name}` : `Solo ${track.name}`}>S</span>
        </span>
      </button>
      <div
        className="ml-lane"
        ref={laneRef}
        aria-hidden="true"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {track.kind === 'drums' ? (
          <div className="ml-drum-mini">
            {track.steps.map((row: any[], rowIdx: number) => (
              <div key={rowIdx} className="ml-drum-row-mini">
                {row.map((step: any, stepIdx: number) => (
                  <button key={stepIdx} className={step.on ? 'on' : ''} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <>
            {blocks.map((block) => (
              <i key={block.id} style={{ left: `${block.left}%`, width: `${block.width}%` }} />
            ))}
            <div className="ml-playhead" ref={playheadRef} />
          </>
        )}
      </div>
    </div>
  );
}

export default TrackLane;