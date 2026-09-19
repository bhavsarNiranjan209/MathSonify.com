/**
 * Music Lab - the studio shell.
 *
 * Owns transport wiring, the audio-context gate, keyboard shortcuts and
 * unmount cleanup. Everything the user sees lives inside .music-lab-root, so
 * no playhead, canvas, glow or audio visualisation can escape to other pages.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  MUSIC_LAB_INSTRUMENTS,
  getMusicLabInstrument,
} from '../../data/musicLabInstruments';
import { MUSIC_LAB_PRESETS, type MusicLabPreset } from '../../utils/musicLabProject';
import { musicLabTransport } from '../../utils/musicLabEngine';
import { isMusicLabPremium } from '../../utils/musicLabAccess';
import { useMusicLabStore } from '../../store/musicLabStore';
import { downloadAudioBlob, renderProjectToWav, wavFilename } from '../../utils/musicLabEngine';
import { useMediaQuery } from './hooks';
import Transport from './Transport';
import InstrumentBrowser from './InstrumentBrowser';
import Timeline from './Timeline';
import PianoRoll from './PianoRoll';
import DrumSequencer from './DrumSequencer';
import Visualizer from './Visualizer';
import Inspector from './Inspector';
import Mixer from './Mixer';
import MusicLabBackground from './MusicLabBackground';
import './music-lab.css';

/* ────────────────────────────── premium gate ───────────────────────────── */

function PremiumGate() {
  return (
    <div className="ml-gate">
      <p className="ml-eyebrow">Music Lab · Premium Studio</p>
      <h1>Your mathematical studio is waiting.</h1>
      <p>
        Compose beyond the equation. Music Lab lets you build mathematical
        instruments, arrange notes on a live timeline, and watch every musical
        decision reshape the mathematics underneath.
      </p>
      <ul>
        <li>Unlimited mathematical instruments</li>
        <li>Equation manipulation with live preview</li>
        <li>Waveform, spectrum and particle visualisers</li>
        <li>Arrangement timeline, piano roll and drum sequencer</li>
        <li>Project saving and real WAV export</li>
      </ul>
      <button type="button" className="ml-primary-button">Unlock Music Lab</button>
    </div>
  );
}

/* ───────────────────────────── empty / start state ─────────────────────── */

function EmptyState({ onApplyPreset, onSurprise }: {
  onApplyPreset: (id: string) => void;
  onSurprise: () => void;
}) {
  const addInstrument = useMusicLabStore((s) => s.addInstrument);
  const addDrumKit = useMusicLabStore((s) => s.addDrumKit);
  return (
    <div className="ml-empty-state">
      <p className="ml-eyebrow">Start with an instrument</p>
      <h2>Choose your first voice</h2>
      <p>
        Pick an instrument from the library, load a preset, or let the
        mathematics surprise you.
      </p>
      <div className="ml-empty-state__actions">
        <button type="button" className="ml-primary-button" onClick={() => addInstrument('grand-piano')}>
          Add piano
        </button>
        <button type="button" className="ml-mini-button" onClick={() => addDrumKit()}>
          Add drums
        </button>
        <button type="button" className="ml-mini-button" onClick={() => onApplyPreset('celestial-ambient')}>
          Load preset
        </button>
        <button type="button" className="ml-mini-button" onClick={onSurprise}>
          Surprise me
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────── presets bar ─────────────────────────────── */

function PresetsBar({ onApplyPreset, onSurprise }: {
  onApplyPreset: (id: string) => void;
  onSurprise: () => void;
}) {
  return (
    <div className="ml-presets" role="group" aria-label="Quick-start presets">
      {MUSIC_LAB_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onApplyPreset(preset.id)}
          title={preset.description}
        >
          {preset.name}
        </button>
      ))}
      <button type="button" onClick={onSurprise} title="Generate a mathematically valid starting point">
        ✦ Surprise me
      </button>
    </div>
  );
}

/* ───────────────────────────── shortcuts overlay ───────────────────────── */

function ShortcutsOverlay() {
  const close = useMusicLabStore((s) => s.setShowShortcuts);
  return (
    <div className="ml-shortcuts" role="dialog" aria-label="Keyboard shortcuts" onClick={() => close(false)}>
      <div className="ml-shortcuts__card" onClick={(event) => event.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        <dl>
          <dt>Space</dt><dd>Play / pause</dd>
          <dt>S</dt><dd>Stop and rewind</dd>
          <dt>L</dt><dd>Toggle loop</dd>
          <dt>Ctrl+Z / Ctrl+Shift+Z</dt><dd>Undo / redo</dd>
          <dt>Ctrl+S</dt><dd>Save project</dd>
          <dt>1 – 5</dt><dd>Select track</dd>
          <dt>?</dt><dd>This panel</dd>
          <dt>Esc</dt><dd>Close panels</dd>
        </dl>
        <button type="button" className="ml-mini-button" onClick={() => close(false)}>Close</button>
      </div>
    </div>
  );
}

/* ───────────────────────────── workspace switcher ──────────────────────── */

const WORKSPACE_TABS: { id: 'timeline' | 'notes' | 'drums' | 'graph' | 'mixer' | 'inspector'; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'notes', label: 'Notes' },
  { id: 'drums', label: 'Drums' },
  { id: 'graph', label: 'Graph' },
  { id: 'mixer', label: 'Mixer' },
  { id: 'inspector', label: 'Inspector' },
];

function WorkspaceBody({ project, selected }: { project: ReturnType<typeof useMusicLabStore.getState>['project']; selected: ReturnType<typeof useMusicLabStore.getState>['project']['tracks'][number] | null }) {
  const activePanel = useMusicLabStore((s) => s.activePanel);
  if (activePanel === 'notes') {
    return selected
      ? <PianoRoll project={project} track={selected} />
      : <p className="ml-empty-note">Select a note track first.</p>;
  }
  if (activePanel === 'drums') {
    return selected && selected.kind === 'drums'
      ? <DrumSequencer track={selected} />
      : <p className="ml-empty-note">Select a drum track first — add one from the library (Drums category).</p>;
  }
  if (activePanel === 'graph') return <Visualizer track={selected} />;
  if (activePanel === 'mixer') return <Mixer project={project} />;
  if (activePanel === 'inspector') return <Inspector track={selected} />;
  return <Timeline project={project} />;
}

/* ───────────────────────────── the shell ───────────────────────────────── */

export default function MusicLab() {
  const premium = useMemo(() => isMusicLabPremium(), []);

  const project = useMusicLabStore((s) => s.project);
  const tracks = project.tracks;
  const selectedTrackId = useMusicLabStore((s) => s.selectedTrackId);
  const selected = tracks.find((track) => track.id === selectedTrackId) ?? null;

  const playing = useMusicLabStore((s) => s.playing);
  const loop = useMusicLabStore((s) => s.loop);
  const audioReady = useMusicLabStore((s) => s.audioReady);
  const rendering = useMusicLabStore((s) => s.rendering);
  const message = useMusicLabStore((s) => s.message);
  const saveStatus = useMusicLabStore((s) => s.saveStatus);
  const showShortcuts = useMusicLabStore((s) => s.showShortcuts);
  const activePanel = useMusicLabStore((s) => s.activePanel);

  const hydrate = useMusicLabStore((s) => s.hydrate);
  const setPlaying = useMusicLabStore((s) => s.setPlaying);
  const setLoop = useMusicLabStore((s) => s.setLoop);
  const setAudioReady = useMusicLabStore((s) => s.setAudioReady);
  const setRendering = useMusicLabStore((s) => s.setRendering);
  const notify = useMusicLabStore((s) => s.notify);
  const setActivePanel = useMusicLabStore((s) => s.setActivePanel);
  const setShowShortcuts = useMusicLabStore((s) => s.setShowShortcuts);
  const addInstrument = useMusicLabStore((s) => s.addInstrument);
  const selectTrack = useMusicLabStore((s) => s.selectTrack);
  const loadPreset = useMusicLabStore((s) => s.loadPreset);
  const save = useMusicLabStore((s) => s.save);
  const undo = useMusicLabStore((s) => s.undo);
  const redo = useMusicLabStore((s) => s.redo);
  const canUndo = useMusicLabStore((s) => s.past.length > 0);
  const canRedo = useMusicLabStore((s) => s.future.length > 0);
  const updateTrack = useMusicLabStore((s) => s.updateTrack);

  const isCompact = useMediaQuery('(max-width: 820px)');

  /* hydrate once, on mount */
  useEffect(() => { hydrate(); }, [hydrate]);

  /* keep transport loop in sync with the store mirror */
  useEffect(() => { musicLabTransport.toggleLoop(loop); }, [loop]);

  /* keep live mix (volume / mute / solo / pan) aligned with the project */
  useEffect(() => { musicLabTransport.applyMix(project); }, [project]);

  /* full cleanup on unmount: stop audio, cancel frames, drop the graph */
  useEffect(() => () => {
    musicLabTransport.dispose();
    useMusicLabStore.setState({ playing: false, audioReady: false });
  }, []);

  const togglePlay = async () => {
    if (!audioReady) {
      const ready = await musicLabTransport.ensureAudio();
      setAudioReady(ready);
      if (!ready) return;
    }
    if (playing) {
      musicLabTransport.pause();
      setPlaying(false);
    } else {
      const ok = await musicLabTransport.play(project);
      setPlaying(ok);
      notify(ok ? 'Playing.' : 'Audio could not start.');
    }
  };

  const stop = () => {
    musicLabTransport.stop();
    setPlaying(false);
  };

  const restart = () => {
    musicLabTransport.seek(0);
    if (!playing) void musicLabTransport.play(project, 0).then((ok) => setPlaying(ok));
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    musicLabTransport.toggleLoop(next);
  };

  const exportWav = async () => {
    setRendering(true);
    notify('Rendering WAV…');
    try {
      const blob = await renderProjectToWav(project);
      downloadAudioBlob(blob, wavFilename(project));
      notify('WAV downloaded.');
    } catch {
      notify('Export failed — try a shorter project.');
    } finally {
      setRendering(false);
    }
  };

  const handleAddInstrument = (instrumentId: string) => {
    const track = addInstrument(instrumentId);
    notify(`${getMusicLabInstrument(instrumentId).name} added.`);
    if (track) selectTrack(track.id);
  };

  const handlePreviewInstrument = (instrumentId: string) => {
    void musicLabTransport.previewTrack(
      { ...(tracks[0] ?? { id: 'preview', instrumentId, name: 'Preview', kind: 'notes' as const, notes: [], steps: [], volume: 0.8, pan: 0, muted: false, solo: false, params: getMusicLabInstrument(instrumentId).defaults, collapsed: false }), instrumentId, params: getMusicLabInstrument(instrumentId).defaults },
      60,
    );
  };

  const handleApplyPreset = (id: string) => {
    const preset = MUSIC_LAB_PRESETS.find((candidate) => candidate.id === id);
    if (preset) loadPreset(preset);
  };

  const handleSurprise = () => {
    const instrument = MUSIC_LAB_INSTRUMENTS[Math.floor(Math.random() * MUSIC_LAB_INSTRUMENTS.length)];
    const track = addInstrument(instrument.id);
    if (track) {
      const randomiseTrack = useMusicLabStore.getState().randomiseTrack;
      randomiseTrack(track.id);
      selectTrack(track.id);
    }
    notify(`Surprise: ${instrument.name}. Press play.`);
  };

  /* keyboard shortcuts — bound while the studio is mounted only */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (event.ctrlKey || event.metaKey) return;
      switch (event.key) {
        case ' ': event.preventDefault(); void togglePlay(); break;
        case 's': case 'S': stop(); break;
        case 'l': case 'L': toggleLoop(); break;
        case '?': setShowShortcuts(!showShortcuts); break;
        case 'Escape': setShowShortcuts(false); break;
        default:
          if (/^[1-5]$/.test(event.key) && tracks[Number(event.key) - 1]) {
            selectTrack(tracks[Number(event.key) - 1].id);
          }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!premium) return <PremiumGate />;

  return (
    <div className="music-lab-root">
      <MusicLabBackground playing={playing} accent={getMusicLabInstrument(selected?.instrumentId ?? 'grand-piano').accent} />
      <div className="ml-shell">
        <Transport
          project={project}
          playing={playing}
          loop={loop}
          canUndo={canUndo}
          canRedo={canRedo}
          exporting={rendering}
          audioReady={audioReady}
          onTogglePlay={() => void togglePlay()}
          onStop={stop}
          onRestart={restart}
          onToggleLoop={toggleLoop}
          onExport={() => void exportWav()}
          onShare={() => { void navigator.clipboard?.writeText(window.location.href); notify('Link copied.'); }}
          onSave={() => save()}
          onShowShortcuts={() => setShowShortcuts(!showShortcuts)}
        />

        <PresetsBar onApplyPreset={handleApplyPreset} onSurprise={handleSurprise} />

        {tracks.length === 0 ? (
          <div className="ml-panel">
            <EmptyState onApplyPreset={handleApplyPreset} onSurprise={handleSurprise} />
          </div>
        ) : (
          <div className="ml-studio">
            <div className="ml-column">
              <InstrumentBrowser
                activeTrackInstrumentId={selected?.instrumentId}
                onAdd={handleAddInstrument}
                onPreview={handlePreviewInstrument}
              />
            </div>

            <div className="ml-column ml-workspace">

              <div className="ml-workspace-tabs" role="tablist" aria-label="Studio panels">
                {WORKSPACE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activePanel === tab.id}
                    className={activePanel === tab.id ? 'is-active' : ''}
                    onClick={() => setActivePanel(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="ml-workspace-body">
                <WorkspaceBody project={project} selected={selected} />
              </div>
            </div>

            <div className="ml-column">
              <div className="ml-panel">
                <Inspector track={selected} />
              </div>
            </div>
          </div>
        )}

        <div className="ml-footnote">
          <span>
            <span className={`ml-save-dot${saveStatus === 'saved' ? ' is-saved' : ''}${saveStatus === 'error' ? ' is-error' : ''}`} />
            {saveStatus === 'saved' ? 'Saved in this browser' : saveStatus === 'error' ? 'Save failed' : 'Autosave on'}
          </span>
          <span>Mathematics → instrument → sound</span>
        </div>

        {!audioReady && (
          <div className="ml-audio-gate">
            <button type="button" className="ml-primary-button" onClick={() => void togglePlay()}>
              Click anywhere to start audio
            </button>
          </div>
        )}
        {showShortcuts && <ShortcutsOverlay />}
        {message && <output className="ml-toast" aria-live="polite">{message}</output>}
      </div>
    </div>
  );
}
