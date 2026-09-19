/**
 * Music Lab — transport + scheduling engine.
 *
 * ONE CLOCK. `AudioContext.currentTime` is the only source of timing truth.
 * The playhead, the note scheduler and the drum sequencer all derive their
 * positions from the same `audioStartTime` anchor, so nothing can drift:
 *
 *   positionBeats = startOffsetBeats + (ctx.currentTime - audioStartTime) / secondsPerBeat
 *
 * Scheduling uses a lookahead window instead of a timer-per-note: a 25 ms
 * interval tops up a 150 ms horizon of voices, which is the standard way to
 * keep Web Audio timing sample-accurate. React state is never touched by the
 * audio clock — the UI polls `snapshot()` from its own animation frame.
 *
 * Lifetime: this engine owns its mix bus, per-track buses, every voice node and
 * its scheduler timer. `dispose()` releases all of it, which is what guarantees
 * that nothing from Music Lab survives navigating away from /music-lab.
 */

import { audioEngine } from './audioEngine';
import { audioBufferToWav } from './audioExporter';
import {
  DRUM_ROWS,
  getMusicLabInstrument,
  type MusicLabParameters,
  type MusicLabTrack,
} from '../data/musicLabInstruments';
import { buildVoice, createImpulseResponse } from './musicLabSynth';
import {
  drumLaneParams,
  projectLengthBeats,
  secondsPerBeat,
  secondsPerStep,
  swingOffset,
  type MusicLabProject,
} from './musicLabProject';
import { frequencyForMidi, harmonicRecipe, pitchMultiplier } from './musicLabEquation';

export type TransportState = 'idle' | 'playing' | 'paused';

export interface TransportSnapshot {
  state: TransportState;
  /** Playhead position within the timeline, in beats. */
  positionBeats: number;
  positionSeconds: number;
  /** 1-based musical position. */
  bar: number;
  beat: number;
  /** 16th step within the bar, 0..15. */
  step: number;
  loopLengthBeats: number;
  /** Beat positions that started sounding since the previous poll. */
  triggered: number[];
}

interface TrackBus {
  input: GainNode;
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  reverbSend: GainNode;
  delaySend: GainNode;
}

/** Seconds of audio scheduled ahead of the playhead. */
const LOOKAHEAD_SECONDS = 0.15;
/** How often the scheduler tops up the horizon. */
const SCHEDULER_INTERVAL_MS = 25;
/** Percussive lanes need no sustain — one step of body is plenty. */
const DRUM_STEP_SECONDS = 0.25;
/** Voice nodes above this count get pruned opportunistically. */
const VOICE_NODE_LIMIT = 2400;

export class MusicLabTransport {
  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private reverb: ConvolverNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private buses = new Map<string, TrackBus>();

  private liveNodes: AudioNode[] = [];
  private schedulerId: ReturnType<typeof setInterval> | null = null;

  private project: MusicLabProject | null = null;
  private state: TransportState = 'idle';
  private loopEnabled = true;

  private audioStartTime = 0;
  private startOffsetBeats = 0;
  private scheduledThroughBeats = 0;
  private loopLengthBeats = 8;

  /** Beat positions whose voices were created since the last UI poll. */
  private triggered: number[] = [];
  private listeners = new Set<() => void>();

  /* ───────────────────────────── lifecycle ───────────────────────────── */

  /** Creates the graph on demand. Safe to call repeatedly. */
  async ensureAudio(): Promise<boolean> {
    await audioEngine.initialize();
    const ctx = audioEngine.getAudioContext();
    const destination = audioEngine.getMasterGain();
    if (!ctx || !destination) return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.ctx === ctx && this.masterBus) return true;
    this.ctx = ctx;

    // Music Lab's own mix bus, feeding the shared MathSonify master.
    this.masterBus = ctx.createGain();
    this.masterBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterAnalyser.smoothingTimeConstant = 0.8;
    this.masterBus.connect(this.masterAnalyser);
    this.masterAnalyser.connect(destination);

    // One convolution room for the whole studio, reached via per-track sends.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = createImpulseResponse(ctx);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.setValueAtTime(0.9, ctx.currentTime);
    this.reverb.connect(reverbReturn);
    reverbReturn.connect(this.masterBus);

    // One tempo-synced echo, also shared.
    this.delay = ctx.createDelay(2);
    this.delayFeedback = ctx.createGain();
    const delayReturn = ctx.createGain();
    delayReturn.gain.setValueAtTime(0.85, ctx.currentTime);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(delayReturn);
    delayReturn.connect(this.masterBus);

    return true;
  }

  isReady(): boolean {
    return this.ctx !== null && this.masterBus !== null;
  }

  private createBus(track: MusicLabTrack): TrackBus | null {
    const ctx = this.ctx;
    if (!ctx || !this.masterBus || !this.reverb || !this.delay) return null;
    const input = ctx.createGain();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;

    gain.gain.value = track.volume;
    panner.pan.value = track.pan;
    input.connect(gain);
    gain.connect(panner);
    panner.connect(analyser);
    analyser.connect(this.masterBus);

    const reverbSend = ctx.createGain();
    const delaySend = ctx.createGain();
    reverbSend.gain.value = 0;
    delaySend.gain.value = 0;
    gain.connect(reverbSend);
    gain.connect(delaySend);
    reverbSend.connect(this.reverb);
    delaySend.connect(this.delay);

    return { input, gain, panner, analyser, reverbSend, delaySend };
  }

  /** Rebuilds the bus set so it matches the project's tracks exactly. */
  private syncBuses(project: MusicLabProject): void {
    const wanted = new Set(project.tracks.map((track) => track.id));
    for (const [id, bus] of this.buses) {
      if (wanted.has(id)) continue;
      bus.input.disconnect();
      bus.gain.disconnect();
      bus.panner.disconnect();
      bus.analyser.disconnect();
      bus.reverbSend.disconnect();
      bus.delaySend.disconnect();
      this.buses.delete(id);
    }
    for (const track of project.tracks) {
      if (!this.buses.has(track.id)) {
        const bus = this.createBus(track);
        if (bus) this.buses.set(track.id, bus);
      }
    }
  }

  /**
   * Pushes project mix + effect values onto the live graph without restarting
   * playback, so mixer moves are heard immediately.
   */
  applyMix(project: MusicLabProject): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const anySolo = project.tracks.some((track) => track.solo);
    for (const track of project.tracks) {
      const bus = this.buses.get(track.id);
      if (!bus) continue;
      const audible = !track.muted && (!anySolo || track.solo);
      bus.gain.gain.setTargetAtTime(audible ? track.volume : 0, now, 0.02);
      bus.panner.pan.setTargetAtTime(track.pan, now, 0.02);
      bus.reverbSend.gain.setTargetAtTime((track.params.reverb / 100) * 0.55, now, 0.05);
      bus.delaySend.gain.setTargetAtTime((track.params.delay / 100) * 0.5, now, 0.05);
    }
    this.masterBus?.gain.setTargetAtTime(project.masterVolume, now, 0.05);
    if (this.delay) {
      // A dotted-eighth echo locks the delay to the project tempo.
      this.delay.delayTime.setTargetAtTime(Math.min(1.9, secondsPerBeat(project) * 0.75), now, 0.05);
    }
    this.delayFeedback?.gain.setTargetAtTime(0.34, now, 0.05);
  }

  /* ─────────────────────────────── transport ─────────────────────────── */

  private computeLoopLength(project: MusicLabProject): number {
    return Math.max(1, projectLengthBeats(project));
  }

  async play(project: MusicLabProject, fromBeats?: number): Promise<boolean> {
    const ready = await this.ensureAudio();
    if (!ready || !this.ctx) return false;
    this.project = project;
    this.syncBuses(project);
    this.applyMix(project);
    this.loopLengthBeats = this.computeLoopLength(project);

    // Resume where we paused; an explicit `fromBeats` always wins.
    if (fromBeats !== undefined) {
      this.startOffsetBeats = Math.max(0, fromBeats);
    } else if (this.state !== 'paused') {
      this.startOffsetBeats = 0;
    }

    // Anchor the clock. Everything else is derived from this one number.
    this.audioStartTime = this.ctx.currentTime + 0.06;
    this.scheduledThroughBeats = this.startOffsetBeats;
    this.state = 'playing';
    this.triggered = [];
    this.startScheduler();
    this.emit();
    return true;
  }

  pause(): void {
    if (this.state !== 'playing') return;
    // Freeze the playhead by converting the moving clock back into an offset.
    this.startOffsetBeats = this.positionBeats();
    this.state = 'paused';
    this.stopScheduler();
    this.releaseVoices();
    this.emit();
  }

  stop(): void {
    this.state = 'idle';
    this.startOffsetBeats = 0;
    this.stopScheduler();
    this.releaseVoices();
    this.emit();
  }

  /** Stop, rewind to zero and immediately replay. */
  async restart(project: MusicLabProject): Promise<boolean> {
    this.stop();
    return this.play(project, 0);
  }

  toggleLoop(enabled: boolean): void {
    this.loopEnabled = enabled;
    this.emit();
  }

  /** Moves the playhead. Works while playing and while stopped. */
  seek(beats: number): void {
    const clamped = Math.max(0, beats);
    this.startOffsetBeats = clamped;
    if (this.state === 'playing' && this.ctx) {
      // Re-anchor so the seek takes effect immediately.
      this.audioStartTime = this.ctx.currentTime + 0.02;
      this.scheduledThroughBeats = clamped;
      this.releaseVoices();
    }
    this.emit();
  }

  /** Current playhead in beats, derived from the audio clock. */
  positionBeats(): number {
    if (this.state !== 'playing' || !this.ctx || !this.project) return this.startOffsetBeats;
    const elapsed = Math.max(0, this.ctx.currentTime - this.audioStartTime);
    const beats = this.startOffsetBeats + elapsed / secondsPerBeat(this.project);
    if (!this.loopEnabled) return beats;
    // Wrap into the loop for display without disturbing scheduling.
    const wrapped = beats % this.loopLengthBeats;
    return wrapped < 0 ? wrapped + this.loopLengthBeats : wrapped;
  }

  getState(): TransportState {
    return this.state;
  }

  getLoopLengthBeats(): number {
    return this.loopLengthBeats;
  }

  isLooping(): boolean {
    return this.loopEnabled;
  }

  getMasterAnalyser(): AnalyserNode | null {
    return this.masterAnalyser;
  }

  getTrackAnalyser(trackId: string): AnalyserNode | null {
    return this.buses.get(trackId)?.analyser ?? null;
  }

  /** Read by the UI's own animation frame — never from React render. */
  snapshot(): TransportSnapshot {
    const beats = this.positionBeats();
    const beatInBar = ((beats % 4) + 4) % 4;
    const triggered = this.triggered;
    this.triggered = [];
    return {
      state: this.state,
      positionBeats: beats,
      positionSeconds: this.project ? beats * secondsPerBeat(this.project) : 0,
      bar: Math.floor(beats / 4) + 1,
      beat: Math.floor(beatInBar) + 1,
      step: Math.floor((beatInBar % 1) * 4),
      loopLengthBeats: this.loopLengthBeats,
      triggered,
    };
  }

  /** Lets the UI react to transport-state changes without polling. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /* ─────────────────────────────── scheduling ────────────────────────── */

  private startScheduler(): void {
    if (this.schedulerId !== null) return;
    this.schedulerId = setInterval(() => this.tick(), SCHEDULER_INTERVAL_MS);
    this.tick();
  }

  private stopScheduler(): void {
    if (this.schedulerId === null) return;
    clearInterval(this.schedulerId);
    this.schedulerId = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    const project = this.project;
    if (!ctx || !project || this.state !== 'playing') return;

    const spb = secondsPerBeat(project);
    const loopLength = this.loopLengthBeats;
    const horizonBeats = this.startOffsetBeats
      + (ctx.currentTime + LOOKAHEAD_SECONDS - this.audioStartTime) / spb;
    if (horizonBeats <= this.scheduledThroughBeats) return;

    const anySolo = project.tracks.some((track) => track.solo);
    for (const track of project.tracks) {
      if (track.muted || (anySolo && !track.solo)) continue;
      const bus = this.buses.get(track.id);
      if (!bus) continue;

      if (track.kind === 'drums') {
        this.scheduleDrumPattern(project, track, bus, spb, loopLength, horizonBeats);
        continue;
      }

      const instrument = getMusicLabInstrument(track.instrumentId);
      // One recipe per track per tick, not per note.
      const recipe = harmonicRecipe(instrument, track.params);
      for (const note of track.notes) {
        this.scheduleOccurrences(note.start, loopLength, horizonBeats, (startBeats) => {
          this.emitVoices(buildVoice(ctx, bus.input, instrument, track.params, {
            frequency: frequencyForMidi(note.pitch) * pitchMultiplier(track.params.pitch),
            start: this.audioStartTime + (startBeats - this.startOffsetBeats) * spb,
            duration: Math.max(0.05, note.duration * spb),
            velocity: note.velocity,
            pan: track.pan,
          }, recipe), startBeats);
        });
      }
    }

    this.scheduledThroughBeats = horizonBeats;

    if (!this.loopEnabled && horizonBeats >= loopLength) {
      const stopAt = this.audioStartTime + (loopLength - this.startOffsetBeats) * spb + 1.1;
      const delayMs = Math.max(50, (stopAt - ctx.currentTime) * 1000);
      setTimeout(() => {
        if (this.state === 'playing' && this.ctx && this.ctx.currentTime >= stopAt - 0.08) {
          this.stop();
        }
      }, delayMs);
    }
  }

  /**
   * Expands one label beat into every looped occurrence inside
   * `(scheduledThrough, horizon]`. This is what makes looping sample-accurate
   * instead of a timer-restart hack.
   */
  private scheduleOccurrences(
    labelBeat: number,
    loopLength: number,
    horizonBeats: number,
    callback: (startBeats: number) => void,
  ): void {
    const firstPass = Math.floor((this.scheduledThroughBeats - labelBeat) / loopLength);
    for (let pass = firstPass; pass < firstPass + 4; pass += 1) {
      const occurrence = labelBeat + pass * loopLength;
      if (occurrence <= this.scheduledThroughBeats) continue;
      if (occurrence > horizonBeats) break;
      callback(occurrence);
    }
  }

  private scheduleDrumPattern(
    project: MusicLabProject,
    track: MusicLabTrack,
    bus: TrackBus,
    spb: number,
    loopLength: number,
    horizonBeats: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const stepBeats = 0.25;
    for (let rowIndex = 0; rowIndex < DRUM_ROWS.length; rowIndex += 1) {
      const lane = track.steps[rowIndex];
      if (!lane) continue;
      const laneInstrument = getMusicLabInstrument(DRUM_ROWS[rowIndex].instrumentId);
      // Lane instruments keep their own DNA; the kit's shape controls come from
      // the track. `drumLaneParams` is shared with the equation panel.
      const laneParams: MusicLabParameters = drumLaneParams(track, laneInstrument);
      const recipe = harmonicRecipe(laneInstrument, laneParams);
      for (let stepIndex = 0; stepIndex < lane.length; stepIndex += 1) {
        const step = lane[stepIndex];
        if (!step?.on) continue;
        const swingBeats = swingOffset(project, stepIndex) / spb;
        this.scheduleOccurrences(stepIndex * stepBeats + swingBeats, loopLength, horizonBeats, (startBeats) => {
          if (step.probability < 1 && Math.random() > step.probability) return;
          this.emitVoices(buildVoice(ctx, bus.input, laneInstrument, laneParams, {
            frequency: frequencyForMidi(36 + rowIndex * 3)
              * pitchMultiplier(laneInstrument.defaults.pitch),
            start: this.audioStartTime + (startBeats - this.startOffsetBeats) * spb,
            duration: DRUM_STEP_SECONDS,
            velocity: step.velocity,
            pan: track.pan,
          }, recipe), startBeats);
        });
      }
    }
  }

  private emitVoices(nodes: AudioNode[], atBeats: number): void {
    if (!nodes.length) return;
    this.liveNodes.push(...nodes);
    this.triggered.push(atBeats);
    if (this.liveNodes.length > VOICE_NODE_LIMIT) this.releaseVoices(true);
  }

  /** Disconnects every voice node. `keepRecent` spares the newest generation. */
  private releaseVoices(keepRecent = false): void {
    const released = keepRecent
      ? this.liveNodes.splice(0, Math.max(0, this.liveNodes.length - 600))
      : this.liveNodes.splice(0);
    for (const node of released) {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
      } catch {
        /* already stopped */
      }
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  /* ──────────────────────────────── preview ─────────────────────────── */

  /** One-off audition for the instrument browser, mixer and piano roll. */
  async previewTrack(track: MusicLabTrack, midi: number, seconds = 0.9): Promise<void> {
    const ready = await this.ensureAudio();
    const ctx = this.ctx;
    if (!ready || !ctx) return;
    let bus = this.buses.get(track.id);
    if (!bus) {
      const created = this.createBus(track);
      if (!created) return;
      this.buses.set(track.id, created);
      bus = created;
    }
    if (this.project) this.applyMix(this.project);
    const instrument = getMusicLabInstrument(track.instrumentId);
    const nodes = buildVoice(ctx, bus.input, instrument, track.params, {
      frequency: frequencyForMidi(midi) * pitchMultiplier(track.params.pitch),
      start: ctx.currentTime + 0.02,
      duration: seconds,
      velocity: 0.9,
      pan: track.pan,
    });
    this.liveNodes.push(...nodes);
    setTimeout(() => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          /* already released */
        }
      }
    }, (seconds + 3) * 1000);
  }

  /** Auditions one drum lane straight from the sequencer grid. */
  async previewDrumRow(track: MusicLabTrack, rowIndex: number): Promise<void> {
    const row = DRUM_ROWS[rowIndex];
    if (!row) return;
    const laneInstrument = getMusicLabInstrument(row.instrumentId);
    await this.previewTrack({
      ...track,
      instrumentId: laneInstrument.id,
      params: drumLaneParams(track, laneInstrument),
    }, 36 + rowIndex * 3, 0.5);
  }

  /** Auditions a track: the first three notes, or the first drum lane. */
  async previewWholeTrack(track: MusicLabTrack): Promise<void> {
    if (track.kind === 'drums') {
      await this.previewDrumRow(track, 0);
      return;
    }
    const notes = [...track.notes].sort((a, b) => a.start - b.start).slice(0, 3);
    if (!notes.length) {
      await this.previewTrack(track, 60, 0.7);
      return;
    }
    for (const note of notes) {
      await this.previewTrack(track, note.pitch, Math.max(0.35, note.duration * 0.35));
    }
  }

  /* ─────────────────────────────── teardown ─────────────────────────── */

  /**
   * Full stop: timer, voices, buses and graph. Called on unmount and on route
   * change — this is what guarantees no Music Lab audio survives navigation.
   */
  dispose(): void {
    this.stopScheduler();
    this.releaseVoices();
    for (const [, bus] of this.buses) {
      bus.input.disconnect();
      bus.gain.disconnect();
      bus.panner.disconnect();
      bus.analyser.disconnect();
      bus.reverbSend.disconnect();
      bus.delaySend.disconnect();
    }
    this.buses.clear();
    this.masterBus?.disconnect();
    this.masterAnalyser?.disconnect();
    this.reverb?.disconnect();
    this.delay?.disconnect();
    this.delayFeedback?.disconnect();
    this.masterBus = null;
    this.masterAnalyser = null;
    this.reverb = null;
    this.delay = null;
    this.delayFeedback = null;
    this.ctx = null;
    this.project = null;
    this.state = 'idle';
    this.startOffsetBeats = 0;
    this.triggered = [];
    this.listeners.clear();
  }
}

/** Single shared transport for the Music Lab page. */
export const musicLabTransport = new MusicLabTransport();

/* ───────────────────────────── offline rendering ───────────────────────── */

/**
 * Renders the project to a WAV Blob using the SAME voice builders the live
 * engine uses. There is no second synthesis path, so the export is exactly
 * what you heard.
 */
export async function renderProjectToWav(project: MusicLabProject): Promise<Blob> {
  const spb = secondsPerBeat(project);
  const loopLength = Math.max(1, projectLengthBeats(project));
  const duration = loopLength * spb + 2.4;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

  const master = ctx.createGain();
  master.gain.value = project.masterVolume;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = createImpulseResponse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);

  const delay = ctx.createDelay(2);
  delay.delayTime.value = Math.min(1.9, spb * 0.75);
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = 0.34;
  const delayReturn = ctx.createGain();
  delayReturn.gain.value = 0.85;
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayReturn);
  delayReturn.connect(master);

  const anySolo = project.tracks.some((track) => track.solo);

  for (const track of project.tracks) {
    if (track.muted || (anySolo && !track.solo)) continue;
    const bus = ctx.createGain();
    bus.gain.value = track.volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = track.pan;
    bus.connect(panner);
    panner.connect(master);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = (track.params.reverb / 100) * 0.55;
    const delaySend = ctx.createGain();
    delaySend.gain.value = (track.params.delay / 100) * 0.5;
    panner.connect(reverbSend);
    panner.connect(delaySend);
    reverbSend.connect(reverb);
    delaySend.connect(delay);

    if (track.kind === 'drums') {
      for (let rowIndex = 0; rowIndex < DRUM_ROWS.length; rowIndex += 1) {
        const lane = track.steps[rowIndex];
        if (!lane) continue;
        const laneInstrument = getMusicLabInstrument(DRUM_ROWS[rowIndex].instrumentId);
        const laneParams = drumLaneParams(track, laneInstrument);
        const recipe = harmonicRecipe(laneInstrument, laneParams);
        const laneFrequency = frequencyForMidi(36 + rowIndex * 3)
          * pitchMultiplier(laneInstrument.defaults.pitch);
        for (let stepIndex = 0; stepIndex < lane.length; stepIndex += 1) {
          const step = lane[stepIndex];
          if (!step?.on) continue;
          // Export is deterministic: probability is ignored, swing is honoured.
          const start = stepIndex * 0.25 * spb + swingOffset(project, stepIndex);
          if (start >= duration) continue;
          buildVoice(ctx, bus, laneInstrument, laneParams, {
            frequency: laneFrequency,
            start,
            duration: DRUM_STEP_SECONDS,
            velocity: step.velocity,
            pan: track.pan,
          }, recipe);
        }
      }
      continue;
    }

    const instrument = getMusicLabInstrument(track.instrumentId);
    const recipe = harmonicRecipe(instrument, track.params);
    for (const note of track.notes) {
      const start = note.start * spb;
      if (start >= duration) continue;
      buildVoice(ctx, bus, instrument, track.params, {
        frequency: frequencyForMidi(note.pitch) * pitchMultiplier(track.params.pitch),
        start,
        duration: Math.max(0.05, note.duration * spb),
        velocity: note.velocity,
        pan: track.pan,
      }, recipe);
    }
  }

  const buffer = await ctx.startRendering();
  return new Blob([audioBufferToWav(buffer)], { type: 'audio/wav' });
}

export function downloadAudioBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function wavFilename(project: MusicLabProject): string {
  const slug = project.name.replace(/[^\w-]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  return `${slug || 'music-lab'}.wav`;
}