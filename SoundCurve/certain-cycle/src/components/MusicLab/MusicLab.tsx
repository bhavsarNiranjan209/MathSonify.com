import { useEffect, useRef, useState } from 'react';
import { MusicLabProvider, useMusicLab } from './store';
import { musicLabTransport } from '../../utils/musicLabEngine';
import Transport from './Transport';
import InstrumentBrowser from './InstrumentBrowser';
import Timeline from './Timeline';
import PianoRoll from './PianoRoll';
import MasterCurve from './MasterCurve';
import MusicLabBackground from './MusicLabBackground';
import './music-lab.css';

function MusicLabContent() {
  const {
    state,
    setPlaying,
    setLoop,
    setAudioReady,
    setSelectedTrack,
    addTrack,
    getInstrument,
    dispatch
  } = useMusicLab();

  const { project, selectedTrackId, playing, loop, audioReady, activePanel } = state;
  const isCompactRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia('(max-width: 820px)');
    isCompactRef.current = mql.matches;
    const handler = (e: MediaQueryListEvent) => { isCompactRef.current = e.matches; };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    musicLabTransport.toggleLoop(loop);
  }, [loop]);

  useEffect(() => {
    musicLabTransport.applyMix(project);
  }, [project]);

  useEffect(() => () => {
    musicLabTransport.dispose();
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
    }
  };

  const stop = () => {
    musicLabTransport.stop();
    setPlaying(false);
  };

  const restart = () => {
    musicLabTransport.seek(0);
    if (!playing) musicLabTransport.play(project, 0).then(setPlaying);
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    musicLabTransport.toggleLoop(next);
  };

  const handleAddInstrument = (instrumentId: string) => {
    const instrument = getInstrument(instrumentId);
    addTrack(instrument);
    setSelectedTrack(instrument.id);
  };

  const handlePreviewInstrument = async (instrumentId: string) => {
    const instrument = getInstrument(instrumentId);
    await musicLabTransport.previewTrack(
      { id: 'preview', instrumentId, name: instrument.name, kind: 'notes', notes: [], steps: [], volume: 0.8, pan: 0, muted: false, solo: false, params: instrument.defaults },
      60
    );
  };

  if (!mounted) return null;

  return (
    <div className="music-lab-root">
      <MusicLabBackground playing={playing} />
      {isCompactRef.current ? (
        <MobileWorkspace
          project={project}
          playing={playing}
          loop={loop}
          audioReady={audioReady}
          onTogglePlay={togglePlay}
          onStop={stop}
          onRestart={restart}
          onToggleLoop={toggleLoop}
          onAddInstrument={handleAddInstrument}
          onPreviewInstrument={handlePreviewInstrument}
          dispatch={dispatch}
          getInstrument={getInstrument}
          setSelectedTrack={setSelectedTrack}
          addTrack={addTrack}
        />
      ) : (
        <div className="ml-shell">
          <Transport
            project={project}
            playing={playing}
            loop={loop}
            audioReady={audioReady}
            onTogglePlay={togglePlay}
            onStop={stop}
            onRestart={restart}
            onToggleLoop={toggleLoop}
          />

          <div className="ml-studio">
            <aside className="ml-sidebar">
              <InstrumentBrowser
                activeTrackInstrumentId={state.tracks.find(t => t.id === selectedTrackId)?.instrumentId}
                onAdd={handleAddInstrument}
                onPreview={handlePreviewInstrument}
              />
            </aside>

            <main className="ml-workspace">
              <div className="ml-workspace-tabs" role="tablist">
                <button role="tab" aria-selected={activePanel === 'timeline'} className={activePanel === 'timeline' ? 'active' : ''} onClick={() => dispatch({ type: 'SET_PANEL', payload: 'timeline' })}>Timeline</button>
                <button role="tab" aria-selected={activePanel === 'notes'} className={activePanel === 'notes' ? 'active' : ''} onClick={() => dispatch({ type: 'SET_PANEL', payload: 'notes' })}>Notes</button>
                <button role="tab" className="inactive" disabled>Drums</button>
                <button role="tab" className="inactive" disabled>Graph</button>
                <button role="tab" className="inactive" disabled>Mixer</button>
                <button role="tab" className="inactive" disabled>Inspector</button>
              </div>

              <div className="ml-workspace-body">
                {activePanel === 'timeline' && <Timeline project={project} />}
                {activePanel === 'notes' && state.selectedTrack ? <PianoRoll project={project} track={state.selectedTrack} /> : <p className="ml-empty">Select a track to edit notes</p>}
              </div>
            </main>

            <aside className="ml-inspector">
              {state.selectedTrack ? (
                <Inspector track={state.selectedTrack} />
              ) : (
                <p className="ml-empty">Select a track to inspect</p>
              )}
            </aside>
          </div>

          <MasterCurve />
        </div>
      )}
    </div>
  );
}

function MobileWorkspace({ project, playing, loop, audioReady, onTogglePlay, onStop, onRestart, onToggleLoop, onAddInstrument, onPreviewInstrument, dispatch, getInstrument, setSelectedTrack, addTrack }: any) {
  const { state } = useMusicLab();
  const activePanel = state.activePanel;

  return (
    <div className="ml-mobile-shell">
      <div className="ml-mobile-workspace">
        <Transport project={project} playing={playing} loop={loop} audioReady={audioReady} onTogglePlay={onTogglePlay} onStop={onStop} onRestart={onRestart} onToggleLoop={onToggleLoop} />
        <div className="ml-mobile-presets">
          <button onClick={() => onAddInstrument('grand-piano')}>Add Piano</button>
          <button onClick={() => onAddInstrument('kick')}>Add Drums</button>
        </div>
        {project.tracks.length === 0 ? (
          <div className="ml-mobile-empty">
            <h2>Choose your first instrument</h2>
            <p>Pick from the library or tap a preset</p>
          </div>
        ) : (
          <section className="ml-mobile-panel">
            {activePanel === 'timeline' && <Timeline project={project} />}
            {activePanel === 'notes' && state.selectedTrack ? <PianoRoll project={project} track={state.selectedTrack} /> : <p className="ml-empty">Select a track</p>}
            {['drums', 'graph', 'mixer', 'inspector'].includes(activePanel) && (
              <div className="ml-panel-inactive">
                <h3>{activePanel} - Coming Soon</h3>
                <p>Switch to Timeline or Notes for full editing</p>
              </div>
            )}
          </section>
        )}
        <MasterCurve />
      </div>
      <nav className="ml-mobile-nav">
        {['timeline', 'notes'].map(p => (
          <button key={p} className={activePanel === p ? 'active' : ''} onClick={() => dispatch({ type: 'SET_PANEL', payload: p })}>{p}</button>
        ))}
        {['drums', 'graph', 'mixer', 'inspector'].map(p => (
          <button key={p} disabled className="inactive">{p}</button>
        ))}
      </nav>
    </div>
  );
}

export default function MusicLab() {
  return (
    <MusicLabProvider>
      <MusicLabContent />
    </MusicLabProvider>
  );
}