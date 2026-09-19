import { useMemo, useRef } from 'react';
import { DRUM_ROWS, getMusicLabInstrument, type MusicLabTrack } from '../../data/musicLabInstruments';
import { useMusicLabStore } from '../../store/musicLabStore';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { useTransportFrame } from './hooks';

interface Props {
  track: MusicLabTrack;
  loopLength: number;
}

export function TrackLane({ track, loopLength }: Props) {
  const selectedTrackId = useMusicLabStore((s) => s.selectedTrackId);
  const selectTrack = useMusicLabStore((s) => s.selectTrack);
  const updateTrack = useMusicLabStore((s) => s.updateTrack);
  const instrument = getMusicLabInstrument(track.instrumentId);
  const laneRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedTrackId === track.id;

  const blocks = useMemo(() => {
    if (track.kind === 'drums') return [];
    return track.notes.map((note) => ({
      id: note.id,
      left: Math.max(0, Math.min(100, (note.start / loopLength) * 100)),
      width: Math.max(1.5, (note.duration / loopLength) * 100),
    }));
  }, [track.notes, track.kind, loopLength]);

  // Timeline-relative playhead: absolute inside the lane, never fixed to viewport.
  useTransportFrame((snapshot) => {
    const lane = laneRef.current;
    const head = playheadRef.current;
    if (!lane || !head) return;
    const position = track.kind === 'drums'
      ? (snapshot.positionBeats % 4) / 4
      : Math.min(1, Math.max(0, snapshot.positionBeats / loopLength));
    head.style.left = `${(position * 100).toFixed(3)}%`;
    const hit = track.kind === 'notes'
      && snapshot.state === 'playing'
      && snapshot.triggered.length > 0;
    lane.classList.toggle('is-hit', hit);
  });

  const toggleMute = (event: React.MouseEvent) => {
    event.stopPropagation();
    updateTrack(track.id, { muted: !track.muted });
  };
  const toggleSolo = (event: React.MouseEvent) => {
    event.stopPropagation();
    updateTrack(track.id, { solo: !track.solo });
  };
  const audition = (event: React.MouseEvent) => {
    event.stopPropagation();
    void musicLabTransport.previewWholeTrack(track);
  };

  return (
    <div
      className={`ml-track ${isSelected ? 'is-selected' : ''}`}
      role="row"
      style={{ '--ml-accent': instrument.accent } as React.CSSProperties}
    >
      <button
        type="button"
        className="ml-track__head"
        onClick={() => selectTrack(track.id)}
        aria-pressed={isSelected}
        aria-label={`Select ${track.name}`}
      >
        <span className="ml-track__icon" aria-hidden="true">{instrument.icon}</span>
        <span className="ml-track__meta">
          <strong>{track.name}</strong>
          <small>{track.kind === 'drums' ? 'Drum kit · 16 steps' : `${track.notes.length} notes`}</small>
        </span>
        <span className="ml-track__toggles">
          <span
            role="button" tabIndex={0}
            className={`ml-toggle ${track.muted ? 'is-on' : ''}`}
            aria-pressed={track.muted} aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
            onClick={toggleMute}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateTrack(track.id, { muted: !track.muted }); } }}
          >M</span>
          <span
            role="button" tabIndex={0}
            className={`ml-toggle ${track.solo ? 'is-on' : ''}`}
            aria-pressed={track.solo} aria-label={track.solo ? `Unsolo ${track.name}` : `Solo ${track.name}`}
            onClick={toggleSolo}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updateTrack(track.id, { solo: !track.solo }); } }}
          >S</span>
          <span
            role="button" tabIndex={0}
            className="ml-toggle"
            aria-label={`Audition ${track.name}`}
            onClick={audition}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void musicLabTransport.previewWholeTrack(track); } }}
          >▶</span>
        </span>
      </button>
      <div className="ml-lane" ref={laneRef} aria-hidden="true">
        {track.kind === 'drums' ? (
          <DrumMiniGrid track={track} />
        ) : (
          blocks.map((block) => (
            <i key={block.id} style={{ left: `${block.left}%`, width: `${block.width}%` }} />
          ))
        )}
        <div className="ml-playhead" ref={playheadRef} />
      </div>
    </div>
  );
}

function DrumMiniGrid({ track }: { track: MusicLabTrack }) {
  const cells = useMemo(() => {
    const active: boolean[] = Array.from({ length: 16 }, () => false);
    track.steps.forEach((lane) => {
      lane.slice(0, 16).forEach((step, index) => {
        if (step?.on) active[index] = true;
      });
    });
    return active;
  }, [track.steps]);
  return (
    <div className="ml-drum-mini">
      {cells.map((on, index) => (
        <span key={index} className={on ? 'is-on' : ''} />
      ))}
    </div>
  );
}

export function DrumLaneLegend() {
  return (
    <p className="ml-empty-note">
      {DRUM_ROWS.map((row) => row.label).join(' · ')}
    </p>
  );
}

