/**
 * Offline video export — the frame-exact path.
 *
 * The real-time recorder captures the canvas live while the clock runs, so a
 * dropped frame mid-draw still gets stamped at the recorder's own pace: the
 * file claims 60fps while the motion inside it is closer to 52. This module
 * does the opposite. It draws every frame one by one, offscreen, at exact
 * timestamps, encodes them with WebCodecs and packs the result into an MP4
 * with mp4-muxer. Nothing here depends on the wall clock or the compositor,
 * so the file's frame rate is the real one.
 *
 * The video scene is a pure function of time (`drawExportFrame` in
 * videoScene), and the audio is already rendered fully offline
 * (`renderEquationToAudioBuffer` in audioExporter), so both tracks are exact
 * by construction. The only browser requirement is WebCodecs
 * (`VideoEncoder`, `AudioEncoder`, `VideoFrame`), which is why this module
 * exposes `isOfflineVideoSupported` and `chooseVideoExportMode`: callers use
 * this path when it is available and fall back to the live recorder when it
 * is not. The muxer library is imported lazily, so it never touches the
 * initial bundle — it is only fetched when a video export actually runs.
 */
import { renderEquationToAudioBuffer } from './audioExporter';
import { resolveActiveCurve } from './activeCurve';
import {
  drawExportFrame,
  prepareVideoScene,
  totalDurationMs,
  videoSize,
  INTRO_MS,
  OUTRO_MS,
  FPS,
  type VideoScene,
} from './videoScene';
import {
  videoBitrateForQuality,
  type VideoExportOptions,
  type VideoExportResult,
} from './videoExporter';
import type { SamplePoint } from './equationParser';

/** Shown when the browser has no WebCodecs to render with. */
export const OFFLINE_UNSUPPORTED_MESSAGE =
  'This browser cannot render video offline — it has no WebCodecs encoder. ' +
  'Try a recent Chrome, Edge, Firefox or Safari for video export.';

/** H.264 codec strings, best first. High profile first; baseline last. */
export const VIDEO_CODEC_PREFERENCE: readonly string[] = [
  'avc1.640028', // H.264 High, level 4.0
  'avc1.4d0028', // H.264 Main, level 4.0
  'avc1.42001E', // H.264 Baseline, level 3.0
];

/** AAC-LC, the codec every MP4 player understands. */
export const AUDIO_CODEC = 'mp4a.40.2';

/** Samples per AAC frame — the chunk size the audio encoder is fed in. */
export const AAC_FRAME_SAMPLES = 1024;

/** Audio bitrate for the exported clip. */
export const AUDIO_BITRATE = 128_000;

/**
 * How many frames a clip of `totalMs` holds at `fps`. The last frame is
 * kept even when the duration is not a whole number of frames, so the clip
 * never ends early.
 */
export function offlineFrameCount(totalMs: number, fps: number = FPS): number {
  if (totalMs <= 0 || fps <= 0) return 0;
  return Math.ceil(totalMs / (1000 / fps));
}

/** Presentation timestamp of frame `index`, in microseconds. */
export function frameTimestampUs(frameIndex: number, fps: number = FPS): number {
  return Math.round((frameIndex * 1_000_000) / fps);
}

/** Duration of one frame, in microseconds. */
export function frameDurationUs(fps: number = FPS): number {
  return Math.round(1_000_000 / fps);
}

/** The encoder configuration for the video track. Pure, so it is testable. */
export function videoEncoderConfig(
  width: number,
  height: number,
  bitrate: number,
  fps: number = FPS,
): VideoEncoderConfig {
  return {
    codec: VIDEO_CODEC_PREFERENCE[0],
    width,
    height,
    bitrate,
    framerate: fps,
  };
}

/** The encoder configuration for the audio track. Pure, so it is testable. */
export function audioEncoderConfig(sampleRate: number, numberOfChannels: number): AudioEncoderConfig {
  return {
    codec: AUDIO_CODEC,
    sampleRate,
    numberOfChannels,
    bitrate: AUDIO_BITRATE,
  };
}

/** One chunk of audio samples handed to the encoder. */
export interface AudioFramePlan {
  /** First sample of the chunk, in the buffer. */
  start: number;
  /** Samples in this chunk (1024, except possibly the last one). */
  length: number;
  /** Presentation timestamp of the chunk, in microseconds. */
  timestampUs: number;
}

/**
 * Splits a buffer of `totalSamples` into AAC-sized chunks. The last chunk
 * keeps whatever samples remain rather than being padded, so the audio track
 * ends exactly where the sonification ends.
 */
export function audioFramePlan(
  totalSamples: number,
  sampleRate: number,
  frameSize: number = AAC_FRAME_SAMPLES,
): AudioFramePlan[] {
  const plan: AudioFramePlan[] = [];
  for (let start = 0; start < totalSamples; start += frameSize) {
    plan.push({
      start,
      length: Math.min(frameSize, totalSamples - start),
      timestampUs: Math.round((start * 1_000_000) / sampleRate),
    });
  }
  return plan;
}

/** The globals the offline path needs, injected so the check is testable. */
export interface OfflineCapabilities {
  VideoEncoder?: unknown;
  AudioEncoder?: unknown;
  VideoFrame?: unknown;
}

/**
 * Whether this environment can render offline: WebCodecs video + audio
 * encoders and the frame type that feeds them. Called with no argument it
 * reads the real globals; tests pass fakes.
 */
export function isOfflineVideoSupported(
  caps: OfflineCapabilities = globalThis as OfflineCapabilities,
): boolean {
  return (
    typeof caps.VideoEncoder !== 'undefined' &&
    typeof caps.AudioEncoder !== 'undefined' &&
    typeof caps.VideoFrame !== 'undefined'
  );
}

/** Which export path the caller should take. */
export type VideoExportMode = 'offline' | 'realtime' | 'none';

/**
 * Offline when it is available (it is frame-exact), the live recorder when
 * only that is available, and neither when the browser can do neither.
 */
export function chooseVideoExportMode(support: {
  offline: boolean;
  realtime: boolean;
}): VideoExportMode {
  if (support.offline) return 'offline';
  if (support.realtime) return 'realtime';
  return 'none';
}

/**
 * First H.264 codec this browser's encoder accepts for the clip, or `null`
 * when none of the candidates is supported. The probe is async because the
 * support check itself is async; a probe that throws is treated as
 * unsupported rather than letting it reach the encoder.
 */
export async function probeVideoCodec(
  width: number,
  height: number,
  bitrate: number,
  fps: number = FPS,
  candidates: readonly string[] = VIDEO_CODEC_PREFERENCE,
): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  if (typeof VideoEncoder.isConfigSupported !== 'function') return null;
  for (const codec of candidates) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
      });
      if (supported) return codec;
    } catch {
      // A codec the probe rejects outright is simply not an option here.
    }
  }
  return null;
}

/**
 * Whether this browser's audio encoder accepts AAC-LC for the clip, or
 * `false` when it has no audio encoder at all or rejects the config.
 *
 * This is the upfront check the offline path was missing: a browser can have
 * WebCodecs yet still be unable to render offline — Firefox has the encoders
 * but cannot encode AAC (desktop Linux neither) — and without this probe the
 * export only discovers that mid-render and silently falls back to the live
 * recorder, so the clip comes out stuttery with no explanation. Callers probe
 * once and advertise the honest path instead.
 */
export async function probeAudioCodec(
  sampleRate: number,
  numberOfChannels: number,
): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false;
  if (typeof AudioEncoder.isConfigSupported !== 'function') return false;
  try {
    const { supported } = await AudioEncoder.isConfigSupported(
      audioEncoderConfig(sampleRate, numberOfChannels),
    );
    return supported === true;
  } catch {
    return false;
  }
}

/**
 * Renders the current Create-tab session into an MP4, frame by frame, with
 * no dependence on the wall clock.
 *
 * Video: the scene is drawn once per frame at its exact timestamp, snapshotted
 * into a frame and encoded. Audio: the sonification is rendered offline and
 * encoded as AAC. Both tracks are packed with mp4-muxer, which is imported
 * lazily so the export code never loads until it is needed.
 *
 * @param onProgress called as frames are encoded, so the UI can show real
 *   progress instead of a spinner. Throttled to every 30 frames plus the end.
 * @throws when WebCodecs is unavailable, when no H.264 codec is supported,
 *   or when encoding fails. Callers fall back to the live recorder on the
 *   codec failure.
 */
export async function exportVideoOffline(
  opts: VideoExportOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<VideoExportResult> {
  if (!isOfflineVideoSupported()) throw new Error(OFFLINE_UNSUPPORTED_MESSAGE);

  const {
    equation,
    equationName,
    scientist,
    minX,
    maxX,
    minFreq,
    maxFreq,
    duration,
    volume,
    instrument,
    sonificationMode,
    scale = 'major',
    isCustomCurve = false,
    splineControlPoints = [],
    speed = 1,
    orientation = 'landscape',
    quality = '720p',
  } = opts;

  // ── Resolve live state ONCE, exactly like the live path: the same points
  // the preview is drawing right now.
  const curve = resolveActiveCurve({ equation, minX, maxX, isCustomCurve, splineControlPoints });
  const points: SamplePoint[] = curve.points;

  const mainSeconds = Math.max(0.5, duration / (speed || 1));
  const mainMs = mainSeconds * 1000;
  const totalMs = totalDurationMs(mainMs);
  const frameCount = offlineFrameCount(totalMs, FPS);

  const { width: VIDEO_W, height: VIDEO_H } = videoSize(orientation, quality);

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not acquire a 2D canvas context for video export');

  const scene: VideoScene = prepareVideoScene({
    ctx,
    equation,
    curve,
    minX,
    maxX,
    mainMs,
    scientist,
    scientistName: scientist?.name ?? null,
    orientation,
    quality,
  });

  // ── Audio: the equation's own sonification, rendered fully offline with
  // the intro/outro silence baked in, so it stays in sync with the curve.
  const audioBuffer = await renderEquationToAudioBuffer({
    equation,
    points,
    minX,
    maxX,
    minFreq,
    maxFreq,
    duration: mainSeconds,
    volume,
    instrument,
    sonificationMode,
    scale,
    leadIn: INTRO_MS / 1000,
    leadOut: OUTRO_MS / 1000,
  });

  // The muxer is loaded lazily: this import is the only place the library is
  // referenced, so it is fetched on the first export and never before.
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const codec = await probeVideoCodec(VIDEO_W, VIDEO_H, videoBitrateForQuality(quality));
  if (!codec) {
    throw new Error(
      'This browser has WebCodecs but no H.264 encoder — the offline render cannot run here.',
    );
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: VIDEO_W, height: VIDEO_H, frameRate: FPS },
    audio: {
      codec: 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    },
    fastStart: 'in-memory',
  });

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  // The first encoder error, if any. Encoder error callbacks run as events,
  // so throwing inside one would be an uncaught exception; the error is
  // stored here and raised after the flush instead.
  let encoderError: unknown = null;

  try {
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });
    videoEncoder.configure({ ...videoEncoderConfig(VIDEO_W, VIDEO_H, videoBitrateForQuality(quality)), codec });

    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });
    audioEncoder.configure(audioEncoderConfig(audioBuffer.sampleRate, audioBuffer.numberOfChannels));

    // ── Audio first: the whole track is already rendered, so it encodes
    // quickly and its chunks are waiting when the muxer finalizes.
    const channels = audioBuffer.numberOfChannels;
    const plan = audioFramePlan(audioBuffer.length, audioBuffer.sampleRate);
    for (const { start, length, timestampUs } of plan) {
      const planar = new Float32Array(length * channels);
      for (let ch = 0; ch < channels; ch++) {
        planar.set(audioBuffer.getChannelData(ch).subarray(start, start + length), ch * length);
      }
      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioBuffer.sampleRate,
        numberOfFrames: length,
        numberOfChannels: channels,
        timestamp: timestampUs,
        data: planar,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();

    // ── Video: one exact frame at a time. Each frame is drawn, snapshotted
    // and handed to the encoder; the encoder copies the pixels on encode, so
    // the frame is closed immediately after. The queue is kept short on
    // purpose: an unbounded queue would hold a copy of every frame in memory
    // (hundreds of megabytes for a 1080p clip) before the encoder caught up.
    const frameUs = frameDurationUs(FPS);
    for (let i = 0; i < frameCount; i++) {
      drawExportFrame(ctx, scene, i * (1000 / FPS));
      const frame = new VideoFrame(canvas, { timestamp: i * frameUs });
      videoEncoder.encode(frame, { keyFrame: i % FPS === 0 });
      frame.close();

      while (videoEncoder.encodeQueueSize > 2) {
        await new Promise((r) => setTimeout(r, 0));
      }
      if (onProgress && (i % 30 === 0 || i === frameCount - 1)) {
        onProgress(i + 1, frameCount);
      }
    }
    await videoEncoder.flush();
    if (onProgress) onProgress(frameCount, frameCount);
    if (encoderError) throw encoderError;

    muxer.finalize();
  } finally {
    if (videoEncoder) videoEncoder.close();
    if (audioEncoder) audioEncoder.close();
  }

  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  const label = equationName || equation || 'export';
  const safeName = label.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
  const suffix = orientation === 'portrait' ? '-portrait' : '';
  const filename = `mathsonify.com-${safeName}${suffix}.mp4`;

  return { blob, url, filename, mimeType: 'video/mp4' };
}
