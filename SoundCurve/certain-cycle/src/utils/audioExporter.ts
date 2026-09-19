import { parseEquation, type SamplePoint, normalize, clamp, quantizeToScale, type ScaleKey } from './equationParser';
import type { InstrumentType, SonificationMode } from '../store/studioStore';

/**
 * Creates a valid WAV file ArrayBuffer from an AudioBuffer.
 */
export function audioBufferToWav(buffer: AudioBuffer, opt?: { float32?: boolean }): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = opt?.float32 ? 3 : 1; // 1 = PCM, 3 = IEEE float
  const bitDepth = format === 3 ? 32 : 16;

  let result: ArrayBuffer;
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }

  return encodeWAV(result as Float32Array, format, sampleRate, numChannels, bitDepth);
}

function interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);

  let index = 0;
  let inputIndex = 0;

  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function encodeWAV(
  samples: Float32Array,
  format: number,
  sampleRate: number,
  numChannels: number,
  bitDepth: number
): ArrayBuffer {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * bytesPerSample, true);

  if (format === 1) {
    // 16-bit PCM
    floatTo16BitPCM(view, 44, samples);
  } else {
    // 32-bit Float
    writeFloat32(view, 44, samples);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function writeFloat32(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}

export interface ExportAudioOptions {
  equation: string;
  minX: number;
  maxX: number;
  minFreq: number;
  maxFreq: number;
  duration: number;
  volume: number;
  instrument: InstrumentType;
  sonificationMode: SonificationMode;
  scale?: ScaleKey;
}

/**
 * Renders the math-to-sound synthesis into an offline buffer and returns a downloadable WAV Blob.
 */
export async function renderEquationToWavBlob(options: ExportAudioOptions): Promise<Blob> {
  const {
    equation,
    minX,
    maxX,
    minFreq,
    maxFreq,
    duration,
    volume,
    instrument,
    sonificationMode,
    scale = 'major',
  } = options;

  const parseResult = parseEquation(equation);
  if (!parseResult.success || !parseResult.sample) {
    throw new Error(parseResult.error || 'Cannot export audio: invalid equation');
  }

  const samplePoints: SamplePoint[] = parseResult.sample(minX, maxX, 800);
  const validPoints = samplePoints.filter((p) => p.isValid);
  if (validPoints.length === 0) {
    throw new Error('Cannot export audio: equation produced no valid numeric values');
  }

  const sampleRate = 44100;
  const totalSamples = Math.ceil(sampleRate * duration);
  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

  // Master Gain & Compressor for zero clipping
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(clamp(volume * 0.8, 0, 1), 0);

  const compressor = offlineCtx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-12, 0);
  compressor.knee.setValueAtTime(10, 0);
  compressor.ratio.setValueAtTime(8, 0);
  compressor.attack.setValueAtTime(0.003, 0);
  compressor.release.setValueAtTime(0.15, 0);

  masterGain.connect(compressor);
  compressor.connect(offlineCtx.destination);

  const yVals = validPoints.map((p) => p.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);

  // Build audio graph inside offline context based on mode
  if (sonificationMode === 'frequency') {
    renderFrequencyMode(offlineCtx, masterGain, validPoints, minY, maxY, minFreq, maxFreq, duration, instrument);
  } else if (sonificationMode === 'note') {
    renderNoteMode(offlineCtx, masterGain, validPoints, minY, maxY, duration, instrument, scale);
  } else if (sonificationMode === 'rhythm') {
    renderRhythmMode(offlineCtx, masterGain, validPoints, minY, maxY, duration, instrument);
  } else if (sonificationMode === 'chord') {
    renderChordMode(offlineCtx, masterGain, validPoints, minY, maxY, duration, instrument, scale);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const wavArrayBuffer = audioBufferToWav(renderedBuffer);
  return new Blob([wavArrayBuffer], { type: 'audio/wav' });
}

function renderFrequencyMode(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  points: SamplePoint[],
  minY: number,
  maxY: number,
  minFreq: number,
  maxFreq: number,
  duration: number,
  instrument: InstrumentType
) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  applyOscillatorShape(osc, instrument);
  filter.type = 'lowpass';
  filter.Q.setValueAtTime(2.0, 0);

  osc.connect(filter);
  filter.connect(env);
  env.connect(dest);

  // Smooth attack & release
  env.gain.setValueAtTime(0.0001, 0);
  env.gain.exponentialRampToValueAtTime(0.7, 0.05);
  env.gain.setValueAtTime(0.7, Math.max(0.06, duration - 0.08));
  env.gain.exponentialRampToValueAtTime(0.0001, duration);

  const dt = duration / points.length;
  points.forEach((pt, i) => {
    const t = i * dt;
    const freq = normalize(pt.y, minY, maxY, minFreq, maxFreq);
    const clampedFreq = clamp(freq, 20, 8000);
    osc.frequency.setValueAtTime(clampedFreq, t);

    // Slope modulation on filter cutoff
    const slopeBrightness = clamp(Math.abs(pt.dy) * 80, 400, 10000);
    filter.frequency.setValueAtTime(slopeBrightness, t);
  });

  osc.start(0);
  osc.stop(duration);
}

function renderNoteMode(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  points: SamplePoint[],
  minY: number,
  maxY: number,
  duration: number,
  instrument: InstrumentType,
  scale: ScaleKey
) {
  const stepCount = Math.min(points.length, Math.max(16, Math.floor(duration * 8)));
  const dt = duration / stepCount;
  const sampleStride = Math.floor(points.length / stepCount);

  for (let step = 0; step < stepCount; step++) {
    const ptIdx = Math.min(points.length - 1, step * sampleStride);
    const pt = points[ptIdx];
    const norm = normalize(pt.y, minY, maxY, 0, 1);
    const pitch = quantizeToScale(norm, scale);
    const startTime = step * dt;
    const noteDur = dt * 0.9;

    playSingleNoteOffline(ctx, dest, pitch, startTime, noteDur, instrument);
  }
}

function renderRhythmMode(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  points: SamplePoint[],
  minY: number,
  maxY: number,
  duration: number,
  instrument: InstrumentType
) {
  const threshold = minY + (maxY - minY) * 0.65;
  const peaks: number[] = [];

  for (let i = 1; i < points.length - 1; i++) {
    if (
      points[i].y > threshold &&
      points[i].y >= points[i - 1].y &&
      points[i].y >= points[i + 1].y
    ) {
      peaks.push(i);
    }
  }

  // Fallback if no prominent peak
  if (peaks.length === 0) {
    const stride = Math.floor(points.length / 8);
    for (let i = 0; i < points.length; i += stride) peaks.push(i);
  }

  peaks.forEach((peakIdx) => {
    const time = (peakIdx / points.length) * duration;
    const pt = points[peakIdx];
    const pitch = normalize(pt.y, minY, maxY, 220, 880);
    playSingleNoteOffline(ctx, dest, pitch, time, 0.18, instrument);
  });
}

function renderChordMode(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  points: SamplePoint[],
  minY: number,
  maxY: number,
  duration: number,
  instrument: InstrumentType,
  scale: ScaleKey
) {
  const stepCount = Math.min(points.length, Math.max(8, Math.floor(duration * 3)));
  const dt = duration / stepCount;
  const sampleStride = Math.floor(points.length / stepCount);

  for (let step = 0; step < stepCount; step++) {
    const pt = points[Math.min(points.length - 1, step * sampleStride)];
    const norm = normalize(pt.y, minY, maxY, 0, 0.8);
    const root = quantizeToScale(norm, scale);
    const third = quantizeToScale(norm + 0.12, scale);
    const fifth = quantizeToScale(norm + 0.22, scale);

    const t = step * dt;
    const chordDur = dt * 0.95;

    playSingleNoteOffline(ctx, dest, root, t, chordDur, instrument, 0.4);
    playSingleNoteOffline(ctx, dest, third, t, chordDur, instrument, 0.3);
    playSingleNoteOffline(ctx, dest, fifth, t, chordDur, instrument, 0.3);
  }
}

function playSingleNoteOffline(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  instrument: InstrumentType,
  vol = 0.5
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  applyOscillatorShape(osc, instrument);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(frequency * 3.5, startTime);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);

  osc.frequency.setValueAtTime(frequency, startTime);

  // ADSR
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(vol * 0.6, startTime + 0.08);
  gain.gain.setValueAtTime(vol * 0.6, Math.max(startTime + 0.08, startTime + duration - 0.04));
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function applyOscillatorShape(osc: OscillatorNode, instrument: InstrumentType) {
  if (instrument === 'sine') osc.type = 'sine';
  else if (instrument === 'triangle') osc.type = 'triangle';
  else if (instrument === 'sawtooth') osc.type = 'sawtooth';
  else if (instrument === 'square') osc.type = 'square';
  else if (instrument === 'piano') osc.type = 'triangle';
  else if (instrument === 'pluck') osc.type = 'sawtooth';
}
