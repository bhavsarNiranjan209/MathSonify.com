/**
 * Video export.
 *
 * This module owns *only* the capture concerns: building the MediaStream,
 * running the clock, driving the recorder and handing the file to the user.
 * Every pixel comes from `videoScene.drawExportFrame` and every sample of audio
 * comes from `audioExporter.renderEquationToWavBlob`, which is the same
 * synthesis code the Create tab plays through `audioEngine`.
 *
 * Nothing here re-parses the equation or re-derives the curve. The caller
 * resolves the active curve once via `resolveActiveCurve` and hands the points
 * in, so the exported video and audio describe exactly what is on screen.
 */
import { renderEquationToWavBlob } from './audioExporter';
import { resolveActiveCurve } from './activeCurve';
import {
  drawExportFrame,
  prepareVideoScene,
  totalDurationMs,
  INTRO_MS,
  OUTRO_MS,
  FPS,
  VIDEO_W,
  VIDEO_H,
  type VideoScene,
} from './videoScene';
import type { SamplePoint, ScaleKey } from './equationParser';
import type { InstrumentType, SonificationMode } from '../store/studioStore';
import type { SplineControlPoint } from './curveSpline';
import type { Scientist } from '../data/scientists';

export interface VideoExportOptions {
  /** Equation string exactly as it currently stands in the store. */
  equation: string;
  equationName: string | null;
  /** Full scientist record when the equation came from the library. */
  scientist: Scientist | null;
  minX: number;
  maxX: number;
  minFreq: number;
  maxFreq: number;
  duration: number;
  volume: number;
  instrument: InstrumentType;
  sonificationMode: SonificationMode;
  scale?: ScaleKey;
  /** Sculpted/freehand curve state — decides equation vs. spline. */
  isCustomCurve?: boolean;
  splineControlPoints?: SplineControlPoint[];
  /** Playback speed; the clip is `duration / speed` seconds long. */
  speed?: number;
}

/**
 * Video bitrate. 8 Mbps is the floor at 720p and scales with pixel count, so a
 * 1080p export gets proportionally more. The old export used 2.5 Mbps at 720p,
 * which is what made the large flat dark regions quantise into visible blocks.
 */
const BITRATE_FLOOR = 8_000_000;
const BITRATE_720P_PIXELS = 1280 * 720;

export function targetBitrate(width: number, height: number): number {
  const scale = (width * height) / BITRATE_720P_PIXELS;
  return Math.round(BITRATE_FLOOR * Math.max(1, scale));
}

/**
 * Recording formats, best first.
 *
 * H.264/MP4 leads deliberately. Safari on iOS and macOS cannot record WebM at
 * all — `MediaRecorder.isTypeSupported` returns false for every `video/webm`
 * candidate there — so a hardcoded webm did not fail loudly, it produced a
 * file Safari then refused to play back. MP4/H.264 is the one container iOS
 * both records and plays, and it is a fine target everywhere else too.
 *
 * The WebM entries follow for Chromium and Firefox, which do support them and
 * get a better bitrate from VP9. Order matters only among formats the current
 * browser actually supports, so the practical result is "the best format this
 * device can both write and read".
 */
export const VIDEO_MIME_PREFERENCE: readonly string[] = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 baseline + AAC-LC
  'video/mp4;codecs=avc1.4d002a,mp4a.40.2', // H.264 main, better quality ceiling
  'video/mp4;codecs=avc1',                   // H.264, codec detail elided
  'video/mp4',                              // plain MP4
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/**
 * First candidate the browser reports support for, or `null` if it supports
 * none of them.
 *
 * `isSupported` is injected rather than read off `MediaRecorder` directly so
 * this is testable in Node, which has no MediaRecorder at all. A `null` result
 * means the caller must refuse the export: recording into an unsupported
 * container yields either a thrown `NotSupportedError` or, worse, a file that
 * silently will not play.
 */
export function pickVideoMimeType(
  isSupported: (mime: string) => boolean,
  candidates: readonly string[] = VIDEO_MIME_PREFERENCE,
): string | null {
  try {
    for (const mime of candidates) {
      if (isSupported(mime)) return mime;
    }
  } catch {
    // A predicate that throws tells us nothing about support, so treat the
    // whole probe as "unsupported" rather than letting it reach the recorder.
  }
  return null;
}

/** Browser-facing wrapper. Returns `null` when recording is impossible here. */
export function detectVideoMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return null;
  try {
    return pickVideoMimeType((mime) => MediaRecorder.isTypeSupported(mime));
  } catch {
    // Some engines expose the method but throw on odd input.
    return null;
  }
}

/**
 * File extension matching the container we actually recorded.
 *
 * Tying this to the chosen mime type is what keeps a Safari MP4 from being
 * written to disk as `.webm` — the old code appended `.webm` unconditionally,
 * which handed iOS users a file it refused to open.
 */
export function videoExtensionForMimeType(mimeType: string | null): 'mp4' | 'webm' {
  return mimeType && mimeType.includes('mp4') ? 'mp4' : 'webm';
}

/** Shown when the browser can neither record nor usefully play a clip. */
export const UNSUPPORTED_RECORDING_MESSAGE =
  'This browser cannot record video — Safari on iPhone and iPad can play video but cannot capture it. ' +
  'Try Chrome on Android, or a desktop browser, for video export.';

/** What a finished recording hands back to the UI. */
export interface VideoExportResult {
  /** The recorded clip, typed with the container it was really recorded in. */
  blob: Blob;
  /**
   * Object URL for the clip. The caller owns it and must revoke it — it is not
   * cleaned up here, because the UI now shows the result inline and keeps it
   * alive until the modal closes.
   */
  url: string;
  /** Suggested filename; the extension matches the real container. */
  filename: string;
  /** The mime type actually recorded — never an assumed `video/webm`. */
  mimeType: string;
}

/**
 * Records the current Create-tab session into the best container this browser
 * actually supports, and hands the clip back to the caller.
 *
 * It deliberately does NOT download anything. A bare `<a download>` is a poor
 * save mechanism on mobile — iOS often ignores `download` and just opens the
 * blob inline — so the UI now shows the result and routes it through
 * `saveFile`, which prefers the native Share sheet. Owning that decision here
 * would have made it impossible to reach the Share sheet at all, because the
 * download used to fire from inside this function.
 *
 * @throws when the active equation cannot be resolved, when the browser cannot
 *         record video at all, or when recording fails.
 */
export async function exportEquationVideo(
  opts: VideoExportOptions,
): Promise<VideoExportResult> {
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
  } = opts;

  // ── Resolve live state ONCE. This is the single source of truth for the
  // clip: the same points the preview is drawing right now.
  const curve = resolveActiveCurve({ equation, minX, maxX, isCustomCurve, splineControlPoints });
  const points: SamplePoint[] = curve.points;

  const mainSeconds = Math.max(0.5, duration / (speed || 1));
  const mainMs = mainSeconds * 1000;
  const totalMs = totalDurationMs(mainMs);

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
  });

  // Paint frame 0 before recording so the first captured frame is the intro
  // card rather than a blank canvas.
  drawExportFrame(ctx, scene, 0);

  // ── Audio: the equation's own sonification, offset past the intro card so it
  // stays in sync with the curve tracing.
  const audioBlob = await renderEquationToWavBlob({
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

  const audioEl = document.createElement('audio');
  const audioBlobUrl = URL.createObjectURL(audioBlob);
  audioEl.src = audioBlobUrl;
  audioEl.preload = 'auto';

  let audioCtx: AudioContext | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        audioEl.removeEventListener('canplaythrough', onReady);
        resolve();
      };
      audioEl.addEventListener('canplaythrough', onReady);
      audioEl.addEventListener('error', () => reject(new Error('Failed to decode audio for video')));
      audioEl.load();
      // Some browsers never fire canplaythrough for a blob; don't hang forever.
      setTimeout(resolve, 3000);
    });

    const AudioCtor = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) throw new Error('Web Audio API is unavailable');
    audioCtx = new AudioCtor();

    // Explicit 60fps capture. `captureStream()` with no argument resolves to
    // whatever rate the canvas happens to change, which is the other half of
    // why the old clips looked soft.
    const canvasStream = canvas.captureStream(FPS);
    const source = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);

    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    // The container is decided *here*, from what this browser reports, and
    // then reused for the Blob type and the filename. Assuming webm (as this
    // used to) is what broke Safari: it cannot record webm, and a blob
    // mislabelled as webm is refused even when the bytes underneath are fine.
    const mimeType = detectVideoMimeType();
    if (!mimeType) throw new Error(UNSUPPORTED_RECORDING_MESSAGE);

    const recorder = new MediaRecorder(combined, {
      mimeType,
      videoBitsPerSecond: targetBitrate(VIDEO_W, VIDEO_H),
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        if (chunks.length === 0) reject(new Error('Video recording produced no data'));
        else resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.onerror = () => reject(new Error('MediaRecorder error'));
    });

    // Frame cadence is driven by rAF against the wall clock rather than a
    // fixed setTimeout: the compositor is a pure function of t, so a dropped
    // frame shortens nothing and the audio stays locked to the curve.
    await new Promise<void>((resolve) => {
      recorder.start(100);
      const t0 = performance.now();

      const tick = () => {
        const t = performance.now() - t0;
        if (t >= totalMs) {
          resolve();
          return;
        }
        drawExportFrame(ctx, scene, t);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      // Audio starts with the clock, not before it.
      audioEl.currentTime = 0;
      void audioEl.play().catch(() => {});
    });

    // Let the last frames flush through the encoder.
    await new Promise((r) => setTimeout(r, 300));

    recorder.stop();
    audioEl.pause();

    const blob = await stopped;
    const url = URL.createObjectURL(blob);

    const label = equationName || equation || 'export';
    const safeName = label.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
    const filename = `mathsonify.com-${safeName}.${videoExtensionForMimeType(mimeType)}`;

    // The URL is deliberately NOT revoked here. The caller shows this clip
    // inline and owns its lifetime; revoking on a timer (as the old download
    // path did) can pull the video out from under a paused preview.
    return { blob, url, filename, mimeType };
  } finally {
    URL.revokeObjectURL(audioBlobUrl);
    if (audioCtx) void audioCtx.close().catch(() => {});
  }
}
