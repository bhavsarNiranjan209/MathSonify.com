/**
 * Offline 3D video export — the frame-exact path for the 3D view.
 *
 * The 2D offline exporter draws a VideoScene frame at each timestamp; this
 * module does the same for the live 3D scene. It drives the 3D viewer's
 * `renderFrame(progress)` one frame at a time (pausing the live animation
 * loop first, so it cannot overwrite the frames), copies each rendered
 * WebGL frame onto a 2D canvas, and encodes it with WebCodecs into an MP4
 * with mp4-muxer — the same encoder, audio and muxer setup as the 2D
 * offline path, so the file is the same quality (frame-exact 60fps, H.264,
 * AAC-or-Opus audio).
 *
 * Timeline (same as the 2D video): intro 1.1s + main + outro 1.1s. The 3D
 * playhead progress is 0 during the intro (curve not yet drawn), sweeps
 * 0→1 across the main part, and stays at 1 (full curve) for the outro.
 * The audio is the equation's own sonification, rendered fully offline,
 * identical to the 2D video's.
 *
 * v30: the camera orbits a full 360° over the clip (turntable style,
 * `azimuthAtTime`), starting from the viewer's current orbit, and the
 * billboard watermark is shown in every frame.
 *
 * The 2D canvas is filled with the theme's canvas colour first (the WebGL
 * canvas is transparent), so the video has a solid background in both
 * light and dark mode.
 */
import { renderEquationToAudioBuffer } from './audioExporter';
import { resolveActiveCurve } from './activeCurve';
import {
  FPS,
  INTRO_MS,
  OUTRO_MS,
  totalDurationMs,
  videoSize,
} from './videoScene';
import {
  audioEncoderConfig,
  audioFramePlan,
  frameDurationUs,
  isOfflineVideoSupported,
  offlineFrameCount,
  OFFLINE_UNSUPPORTED_MESSAGE,
  pickAudioCodec,
  probeVideoCodec,
  videoEncoderConfig,
} from './offlineVideoExporter';
import {
  videoBitrateForQuality,
  type VideoExportOptions,
  type VideoExportResult,
} from './videoExporter';
import { getCanvasPalette, getThemeMode } from './theme';
import type { SceneApi } from '../components/Studio/Curve3DViewer';
import type { SamplePoint } from './equationParser';

/** Playhead progress for the 3D scene at video time `tMs`. */
export function progressAtTime(tMs: number, mainMs: number): number {
  if (tMs < INTRO_MS) return 0;
  if (tMs >= INTRO_MS + mainMs) return 1;
  return (tMs - INTRO_MS) / mainMs;
}

/**
 * Orbit azimuth (radians) for the 360° turntable video at video time `tMs`.
 * One full turn over the whole clip — intro, main and outro — starting
 * from the viewer's current orbit, so frame 0 is exactly what the user
 * sees and the last frame has come all the way back around to it.
 */
export function azimuthAtTime(tMs: number, totalMs: number, startAzimuth: number): number {
  if (totalMs <= 0) return startAzimuth;
  const clamped = Math.min(Math.max(tMs, 0), totalMs);
  return startAzimuth + (Math.PI * 2 * clamped) / totalMs;
}

export async function export3DVideoOffline(
  api: SceneApi,
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
    // 360° orbit (v30): on by default — a 3D clip is a turntable clip
    // unless the user turns the orbit off in the Export modal.
    orbit360 = true,
  } = opts;

  // Resolve live state once, exactly like the 2D path: the same points the
  // preview is drawing right now.
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

  // The WebGL canvas is transparent; fill the solid theme background first
  // so the video never has a transparent (black) frame.
  const bg = getCanvasPalette(getThemeMode()).canvas;

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

  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const codec = await probeVideoCodec(VIDEO_W, VIDEO_H, videoBitrateForQuality(quality));
  if (!codec) {
    throw new Error(
      'This browser has WebCodecs but no H.264 encoder — the offline render cannot run here.',
    );
  }

  const audioCodec = await pickAudioCodec(audioBuffer.sampleRate, audioBuffer.numberOfChannels);
  if (!audioCodec) {
    throw new Error(
      'This browser has WebCodecs but no supported audio encoder (AAC or Opus) — the offline render cannot run here.',
    );
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: VIDEO_W, height: VIDEO_H, frameRate: FPS },
    audio: {
      codec: audioCodec === 'opus' ? 'opus' : 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    },
    fastStart: 'in-memory',
  });

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  let encoderError: unknown = null;

  // Pause the live animation loop so it cannot redraw the scene between
  // our renderFrame and the capture. Always resumed, even on failure.
  api.pause();
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
    audioEncoder.configure(
      audioEncoderConfig(audioBuffer.sampleRate, audioBuffer.numberOfChannels, audioCodec),
    );

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

    // ── Video: one exact 3D frame at a time. Each frame is rendered at its
    // playhead progress, copied onto the 2D canvas in the same task (the
    // WebGL canvas is only valid until the next render), and handed to the
    // encoder. The queue is kept short on purpose, as in the 2D path.
    // v30: the camera orbits a full 360° over the clip (turntable style),
    // starting from the viewer's current orbit, and the billboard
    // watermark is shown in every frame.
    const startAzimuth = api.getAzimuth();
    const frameUs = frameDurationUs(FPS);
    for (let i = 0; i < frameCount; i++) {
      const tMs = i * (1000 / FPS);
      const progress = progressAtTime(tMs, mainMs);
      const azimuth = orbit360 ? azimuthAtTime(tMs, totalMs, startAzimuth) : undefined;
      const webglCanvas = api.renderFrame(progress, { azimuth, watermark: true });
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
      ctx.drawImage(webglCanvas, 0, 0, VIDEO_W, VIDEO_H);
      const frame = new VideoFrame(canvas, { timestamp: i * frameUs, duration: frameUs });
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
    // The live view resumes exactly where the user left it.
    api.resume();
  }

  const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);

  const label = equationName || equation || 'export';
  const safeName = label.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
  const suffix = orientation === 'portrait' ? '-portrait' : '';
  const orbitSuffix = orbit360 ? '-360' : '';
  const filename = `mathsonify.com-${safeName}-3d${orbitSuffix}${suffix}.mp4`;

  return { blob, url, filename, mimeType: 'video/mp4' };
}
