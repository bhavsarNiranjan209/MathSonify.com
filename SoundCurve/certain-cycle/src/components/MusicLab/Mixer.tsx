/**
 * Music Lab - mixer.
 *
 * One channel strip per track (volume, pan, mute, solo) plus the master.
 * Peak meters are driven by usePeakMeter, which writes transform styles on
 * an animation frame - meters never trigger React renders.
 */

import { useRef } from 'react';
import type { MusicLabProject, MusicLabTrack } from '../../utils/musicLabProject';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { useMusicLabStore } from '../../store/musicLabStore';
import { usePeakMeter } from './hooks';

function ChannelMeter({ getAnalyser }: { getAnalyser: () => AnalyserNode | null }) {
  const fill = useRef<HTMLDivElement>(null);
  usePeakMeter(getAnalyser, fill);
  return (
    <div className="ml-meter" aria-hidden="true">
      <div className="ml-meter__fill" ref={fill} />
    </div>
  );
}

function Channel({ track, selected, onSelect }: {
  track: MusicLabTrack;
  selected: boolean;
  onSelect: () => void;
}) {
  const updateTrack = useMusicLabStore((s) => s.updateTrack);
  const notify = useMusicLabStore((s) => s.notify);
  return (
    <div className={`ml-channel${selected ? ' is-selected' : ''}`}>
      <button type="button" className="ml-channel__name" onClick={onSelect} title={`Select ${track.name}`}>
        {track.name}
      </button>
      <label className="ml-channel__row">
        <span>Vol</span>
        <input
          type="range" min={0} max={1} step={0.01} value={track.volume}
          aria-label={`${track.name} volume`}
          onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })}
        />
      </label>
      <label className="ml-channel__row">
        <span>Pan</span>
        <input
          type="range" min={-1} max={1} step={0.05} value={track.pan}
          aria-label={`${track.name} pan`}
          onChange={(event) => updateTrack(track.id, { pan: Number(event.target.value) })}
        />
      </label>
      <div className="ml-channel__toggles">
        <button
          type="button" className={track.muted ? 'is-on' : ''} aria-pressed={track.muted}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          Mute
        </button>
        <button
          type="button" className={track.solo ? 'is-on' : ''} aria-pressed={track.solo}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
        >
          Solo
        </button>
        <button
          type="button" className="ml-mini-button"
          onClick={() => { void musicLabTransport.previewWholeTrack(track); notify(`Auditioning ${track.name}.`); }}
        >
          Audition
        </button>
      </div>
      <ChannelMeter getAnalyser={() => musicLabTransport.getTrackAnalyser(track.id)} />
    </div>
  );
}

export default function Mixer({ project }: { project: MusicLabProject }) {
  const selectedTrackId = useMusicLabStore((s) => s.selectedTrackId);
  const selectTrack = useMusicLabStore((s) => s.selectTrack);
  const patchProject = useMusicLabStore((s) => s.patchProject);
  const notify = useMusicLabStore((s) => s.notify);
  const masterFill = useRef<HTMLDivElement>(null);
  usePeakMeter(() => musicLabTransport.getMasterAnalyser(), masterFill);

  return (
    <section className="ml-mixer" aria-label="Mixer">
      <div className="ml-panel-head">
        <div>
          <p className="ml-eyebrow">Balance</p>
          <h2>Mixer</h2>
        </div>
        <span className="ml-count">{project.tracks.length} channels</span>
      </div>
      {project.tracks.length === 0 && (
        <p className="ml-empty-note">Add a track to mix it.</p>
      )}
      <div className="ml-channels">
        {project.tracks.map((track) => (
          <Channel
            key={track.id}
            track={track}
            selected={track.id === selectedTrackId}
            onSelect={() => selectTrack(track.id)}
          />
        ))}
      </div>
      <div className="ml-master">
        <div className="ml-master__head">
          <span>Master</span>
          <input
            type="range" min={0} max={1} step={0.01} value={project.masterVolume}
            aria-label="Master volume"
            onChange={(event) => patchProject({ masterVolume: Number(event.target.value) })}
          />
        </div>
        <div className="ml-meter ml-meter--master" aria-hidden="true">
          <div className="ml-meter__fill" ref={masterFill} />
        </div>
      </div>
      <button
        type="button" className="ml-mini-button"
        onClick={() => { patchProject({ masterVolume: 0.8 }); notify('Mix reset.'); }}
      >
        Reset mix
      </button>
    </section>
  );
}
