import { projectLengthBeats, type MusicLabProject } from '../../utils/musicLabProject';
import { useMusicLabStore } from '../../store/musicLabStore';
import { TrackLane } from './TrackLane';

export default function Timeline({ project }: { project: MusicLabProject }) {
  const loopLength = Math.max(4, projectLengthBeats(project));
  const duplicateTrack = useMusicLabStore((s) => s.duplicateTrack);
  const removeTrack = useMusicLabStore((s) => s.removeTrack);
  const selectedTrackId = useMusicLabStore((s) => s.selectedTrackId);
  const selected = project.tracks.find((t) => t.id === selectedTrackId) ?? null;

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
        <p className="ml-empty-note">No tracks yet. Add an instrument from the library.</p>
      )}
      <div className="ml-tracks" role="table" aria-label="Tracks">
        {project.tracks.map((track) => (
          <TrackLane key={track.id} track={track} loopLength={loopLength} />
        ))}
      </div>
      {selected && (
        <div className="ml-track-actions">
          <button type="button" className="ml-mini-button" onClick={() => duplicateTrack(selected.id)}>
            Duplicate {selected.name}
          </button>
          <button type="button" className="ml-mini-button ml-mini-button--danger"
            onClick={() => { if (window.confirm(`Remove “${selected.name}”?`)) removeTrack(selected.id); }}>
            Remove track
          </button>
        </div>
      )}
    </section>
  );
}
