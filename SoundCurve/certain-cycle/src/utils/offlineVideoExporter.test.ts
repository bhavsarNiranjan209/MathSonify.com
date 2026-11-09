/**
 * Tests for the offline video render.
 *
 * The frame-exact claim is the whole point of this module, so the schedule
 * math is pinned exactly: how many frames a clip holds, the timestamp of each
 * frame, and how the audio buffer is chunked for the AAC encoder. The mode
 * choice and the support check are pure too. The browser-only parts (the
 * encoders, the muxer, the canvas) cannot run in Node, so they are covered by
 * one behavioural test — without WebCodecs the render refuses outright — plus
 * a source guard that the offline path never touches the live recorder.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  offlineFrameCount,
  frameTimestampUs,
  frameDurationUs,
  videoEncoderConfig,
  audioEncoderConfig,
  audioFramePlan,
  isOfflineVideoSupported,
  chooseVideoExportMode,
  probeVideoCodec,
  pickAudioCodec,
  exportVideoOffline,
  OFFLINE_UNSUPPORTED_MESSAGE,
  VIDEO_CODEC_PREFERENCE,
  AUDIO_CODEC,
  AUDIO_CODEC_PREFERENCE,
  AAC_FRAME_SAMPLES,
} from './offlineVideoExporter';
import type { VideoExportOptions } from './videoExporter';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('a 6s clip at 60fps holds 492 frames (intro 1.1s + 6s + outro 1.1s)', () => {
  assert.equal(offlineFrameCount(8200), 492);
});

test('the frame count rounds up so a clip never ends early', () => {
  assert.equal(offlineFrameCount(6000), 360);
  assert.equal(offlineFrameCount(6010), 361);
  assert.equal(offlineFrameCount(1), 1);
});

test('zero or negative durations hold no frames', () => {
  assert.equal(offlineFrameCount(0), 0);
  assert.equal(offlineFrameCount(-100), 0);
});

test('frame timestamps are exact microseconds from frame zero', () => {
  assert.equal(frameTimestampUs(0), 0);
  assert.equal(frameTimestampUs(1), 16667);
  assert.equal(frameTimestampUs(60), 1_000_000);
  assert.equal(frameTimestampUs(492), 8_200_000);
});

test('one frame lasts 16667 microseconds at 60fps', () => {
  assert.equal(frameDurationUs(), 16667);
  assert.equal(frameDurationUs(30), 33333);
});

test('the video encoder config asks for High profile H.264 at the clip size', () => {
  const config = videoEncoderConfig(1280, 720, 8_000_000);
  assert.equal(config.codec, 'avc1.640028');
  assert.equal(config.width, 1280);
  assert.equal(config.height, 720);
  assert.equal(config.bitrate, 8_000_000);
  assert.equal(config.framerate, 60);
});

test('the codec preference leads with High profile and ends with Baseline', () => {
  assert.equal(VIDEO_CODEC_PREFERENCE[0], 'avc1.640028');
  assert.equal(VIDEO_CODEC_PREFERENCE[VIDEO_CODEC_PREFERENCE.length - 1], 'avc1.42001E');
});

test('the audio encoder config asks for AAC-LC at 192 kbps', () => {
  // v22: raised from 128 kbps for clearer sound.
  assert.equal(AUDIO_CODEC, 'mp4a.40.2');
  const config = audioEncoderConfig(44100, 2);
  assert.equal(config.codec, 'mp4a.40.2');
  assert.equal(config.sampleRate, 44100);
  assert.equal(config.numberOfChannels, 2);
  assert.equal(config.bitrate, 192_000);
});

test('the audio encoder config takes an explicit codec for the Opus fallback', () => {
  assert.equal(audioEncoderConfig(44100, 2, 'opus').codec, 'opus');
  assert.equal(audioEncoderConfig(44100, 2, 'mp4a.40.2').codec, 'mp4a.40.2');
});

test('the audio codec preference leads with AAC and falls back to Opus', () => {
  assert.equal(AUDIO_CODEC_PREFERENCE[0], 'mp4a.40.2');
  assert.ok(AUDIO_CODEC_PREFERENCE.includes('opus'));
});

test('the audio plan chunks the buffer into 1024-sample AAC frames', () => {
  assert.equal(AAC_FRAME_SAMPLES, 1024);
  const plan = audioFramePlan(44100 * 8, 44100);
  assert.equal(plan.length, Math.ceil((44100 * 8) / 1024));
  assert.equal(plan[0].start, 0);
  assert.equal(plan[0].length, 1024);
  assert.equal(plan[0].timestampUs, 0);
  // Chunks are contiguous and cover the whole buffer, last one partial.
  const total = plan.reduce((sum, c) => sum + c.length, 0);
  assert.equal(total, 44100 * 8);
  const last = plan[plan.length - 1];
  assert.ok(last.length > 0 && last.length <= 1024);
  assert.equal(last.start + last.length, 44100 * 8);
  // Timestamps increase by one AAC frame each (1024 samples at 44.1kHz).
  assert.equal(plan[1].timestampUs, Math.round((1024 * 1_000_000) / 44100));
});

test('a buffer shorter than one AAC frame is a single chunk', () => {
  const plan = audioFramePlan(500, 44100);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0], { start: 0, length: 500, timestampUs: 0 });
});

test('offline support needs all three WebCodecs globals', () => {
  const full = { VideoEncoder: {}, AudioEncoder: {}, VideoFrame: {} };
  assert.equal(isOfflineVideoSupported(full), true);
  assert.equal(isOfflineVideoSupported({ AudioEncoder: {}, VideoFrame: {} }), false);
  assert.equal(isOfflineVideoSupported({ VideoEncoder: {}, VideoFrame: {} }), false);
  assert.equal(isOfflineVideoSupported({ VideoEncoder: {}, AudioEncoder: {} }), false);
  assert.equal(isOfflineVideoSupported({}), false);
});

test('Node has no WebCodecs, so offline is unsupported here', () => {
  assert.equal(isOfflineVideoSupported(), false);
});

test('the export mode prefers offline, then the live recorder, then none', () => {
  assert.equal(chooseVideoExportMode({ offline: true, realtime: true }), 'offline');
  assert.equal(chooseVideoExportMode({ offline: true, realtime: false }), 'offline');
  assert.equal(chooseVideoExportMode({ offline: false, realtime: true }), 'realtime');
  assert.equal(chooseVideoExportMode({ offline: false, realtime: false }), 'none');
});

test('the codec probe returns null where there is no encoder to probe', async () => {
  assert.equal(await probeVideoCodec(1280, 720, 8_000_000), null);
});

test('the audio codec pick is null where there is no audio encoder', async () => {
  assert.equal(await pickAudioCodec(44100, 2), null);
});

test('the audio codec pick prefers AAC when the encoder accepts it', async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.AudioEncoder;
  try {
    g.AudioEncoder = { isConfigSupported: async () => ({ supported: true }) };
    assert.equal(await pickAudioCodec(44100, 2), 'mp4a.40.2');
  } finally {
    if (prev === undefined) delete g.AudioEncoder;
    else g.AudioEncoder = prev;
  }
});

test('the audio codec pick falls back to Opus when AAC is rejected', async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.AudioEncoder;
  try {
    // Firefox / desktop Linux / some Brave builds: AAC rejected, Opus fine.
    g.AudioEncoder = {
      isConfigSupported: async (cfg: { codec: string }) => ({
        supported: cfg.codec === 'opus',
      }),
    };
    assert.equal(await pickAudioCodec(44100, 2), 'opus');
  } finally {
    if (prev === undefined) delete g.AudioEncoder;
    else g.AudioEncoder = prev;
  }
});

test('the audio codec pick is null when neither codec is supported', async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g.AudioEncoder;
  try {
    g.AudioEncoder = { isConfigSupported: async () => ({ supported: false }) };
    assert.equal(await pickAudioCodec(44100, 2), null);
    g.AudioEncoder = { isConfigSupported: async () => { throw new Error('nope'); } };
    assert.equal(await pickAudioCodec(44100, 2), null);
    g.AudioEncoder = {};
    assert.equal(await pickAudioCodec(44100, 2), null);
  } finally {
    if (prev === undefined) delete g.AudioEncoder;
    else g.AudioEncoder = prev;
  }
});

test('the offline render refuses outright without WebCodecs', async () => {
  const opts: VideoExportOptions = {
    equation: 'sin(x)',
    equationName: null,
    scientist: null,
    minX: -10,
    maxX: 10,
    minFreq: 100,
    maxFreq: 1000,
    duration: 6,
    volume: 0.8,
    instrument: 'sine',
    sonificationMode: 'frequency',
  };
  await assert.rejects(() => exportVideoOffline(opts), {
    message: OFFLINE_UNSUPPORTED_MESSAGE,
  });
});

test('the offline module never touches the live recorder', () => {
  const source = read('./offlineVideoExporter.ts');
  assert.doesNotMatch(source, /MediaRecorder/, 'no live recorder in the offline path');
  assert.doesNotMatch(source, /captureStream/, 'no live canvas capture in the offline path');
  assert.match(source, /import\('mp4-muxer'\)/, 'the muxer must be lazily imported');
});

test('every encoded frame carries its duration, or the muxer rejects it', () => {
  // Without a duration the encoder reports null on every chunk and
  // mp4-muxer's addVideoChunk throws ("duration must be a non-negative real
  // number"), so the whole offline render fails and falls back to the live
  // recorder. The render is frame-exact by construction, so each frame lasts
  // exactly one frame.
  const source = read('./offlineVideoExporter.ts');
  assert.match(
    source,
    /new VideoFrame\(canvas, \{[^}]*duration: frameUs[^}]*\}\)/,
    'the VideoFrame must carry its duration',
  );
});
