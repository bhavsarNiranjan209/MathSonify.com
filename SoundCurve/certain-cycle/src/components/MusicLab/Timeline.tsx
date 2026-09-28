import { useRef, useState } from 'react';
import { useMusicLab } from './store';
import { projectLengthBeats } from '../../utils/musicLabProject';
import TrackLane from './TrackLane';

export default function Timeline({ project }: { project: any }) {
  const { state, addTrack, getInstrument } = useMusicLab();
  const loopLength = Math.max(4, projectLengthBeats(project));
  const tracksRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!tracksRef.current?.contains(event.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);

    const instrumentId = event.dataTransfer.getData('application/x-musiclab-instrument');
    if (!instrumentId) return;

    const tracksContainer = tracksRef.current;
    if (!tracksContainer) return;

    let laneRect: DOMRect | null = null;
    if (project.tracks.length > 0) {
      const firstLane = tracksContainer.querySelector('.ml-lane');
      if (firstLane) laneRect = firstLane.getBoundingClientRect();
    } else {
      const emptyZone = tracksContainer.querySelector('.ml-empty-drop-zone');
      if (emptyZone) laneRect = emptyZone.getBoundingClientRect();
    }
    if (!laneRect) return;

    const clickX = event.clientX - laneRect.left;
    const percentage = Math.max(0, Math.min(1, clickX / laneRect.width));
    const positionBeats = percentage * loopLength;

    const instrument = getInstrument(instrumentId);
    addTrack(instrument);
  };

  return (
    <section className="ml-timeline" aria-label="Arrangement timeline">
      <div className="ml-panel-head">
        <div>
          <p className="ml-eyebrow">Arrangement</p>
          <h2>Timeline</h2>
        </div>
        <span className="ml-count">{project.tracks.length} tracks · {loopLength} beats</span>
      </div>
      {project.tracks.length === 0 && (
        <div
          className="ml-empty-drop-zone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <p className="ml-empty-note">No tracks yet. Drag an instrument here to start.</p>
        </div>
      )}
      <div
        className={`ml-tracks ${isDragOver ? 'is-drag-over' : ''}`}
        ref={tracksRef}
        role="table"
        aria-label="Tracks"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {project.tracks.map((track: any) => (
          <TrackLane key={track.id} track={track} loopLength={loopLength} />
        ))}
      </div>
    </section>
  );
}