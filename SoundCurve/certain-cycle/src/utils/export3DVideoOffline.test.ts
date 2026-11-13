/**
 * 3D export (v29): picture wiring + offline frame-exact video.
 *
 * The timeline math is pure (tested for real). The wiring — the 3D scene
 * API, the store's threeDApi, the ExportModal's 2D/3D toggles — is asserted
 * on the source, the way the no-copy guard tests do it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { progressAtTime, azimuthAtTime } from '../utils/export3DVideoOffline';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('progressAtTime: intro 0, main sweeps 0→1, outro 1', () => {
  const mainMs = 5000;
  // Intro (1.1s): the curve has not started drawing yet.
  assert.equal(progressAtTime(0, mainMs), 0, 'intro start is not 0');
  assert.equal(progressAtTime(1099, mainMs), 0, 'intro end is not 0');
  // Main: sweeps 0 → 1 across the duration.
  assert.equal(progressAtTime(1100, mainMs), 0, 'main start is not 0');
  assert.ok(Math.abs(progressAtTime(1100 + 2500, mainMs) - 0.5) < 0.001, 'main midpoint is not 0.5');
  assert.equal(progressAtTime(1100 + 4999, mainMs), 0.9998, 'main end is not ~1');
  // Outro (1.1s): the full curve stays drawn.
  assert.equal(progressAtTime(1100 + 5000, mainMs), 1, 'outro start is not 1');
  assert.equal(progressAtTime(1100 + 5000 + 1100, mainMs), 1, 'outro end is not 1');
});

test('azimuthAtTime: one full turn over the clip, starting from the current orbit', () => {
  const start = 0.62; // the viewer's default orbit
  const totalMs = 7200;
  assert.equal(azimuthAtTime(0, totalMs, start), start, 'frame 0 is not the current view');
  assert.ok(Math.abs(azimuthAtTime(totalMs / 2, totalMs, start) - (start + Math.PI)) < 1e-9, 'midpoint is not half a turn');
  assert.ok(Math.abs(azimuthAtTime(totalMs, totalMs, start) - (start + Math.PI * 2)) < 1e-9, 'last frame is not a full turn');
  // Clamped: never before the start, never past one full turn.
  assert.equal(azimuthAtTime(-100, totalMs, start), start, 'negative time goes before the start');
  assert.ok(Math.abs(azimuthAtTime(99999, totalMs, start) - (start + Math.PI * 2)) < 1e-9, 'time past the end goes past one turn');
  assert.equal(azimuthAtTime(1000, 0, start), start, 'zero-length clip has no orbit');
});

test('the 3D picture has a solid theme background in both modes', () => {
  // The WebGL canvas is transparent; without a fill first, a light-mode
  // picture came out with a black surround (v30 fix — the video exporter
  // and the turntable composer already filled first).
  const source = read('../utils/render3DImage.ts');
  assert.match(source, /ctx\.fillStyle = palette\.canvas;\n\s+ctx\.fillRect\(0, 0, width, height\);/, '3D picture does not fill the theme background');
  assert.ok(
    source.indexOf('fillRect(0, 0, width, height)') < source.indexOf('ctx.drawImage(webglCanvas'),
    'background fill must come before the WebGL frame is drawn',
  );
});

test('the 3D video orbits 360° with the billboard watermark in every frame', () => {
  const source = read('../utils/export3DVideoOffline.ts');
  // The orbit starts from the viewer's current orbit, not from a fixed angle.
  assert.match(source, /const startAzimuth = api\.getAzimuth\(\);/, 'video does not read the current orbit');
  assert.match(source, /azimuthAtTime\(tMs, totalMs, startAzimuth\)/, 'video does not advance the azimuth per frame');
  // Every frame renders with its orbit angle and the watermark on.
  assert.match(source, /api\.renderFrame\(progress, \{ azimuth, watermark: true \}\)/, 'video frames carry no azimuth or watermark');
  // Orbit is on by default; the filename says so.
  assert.match(source, /orbit360 = true,/, 'orbit is not on by default');
  assert.match(source, /const orbitSuffix = orbit360 \? '-360' : '';/, 'orbiting clip has no -360 filename marker');
  // The scene API carries the orbit start.
  const viewer = read('../components/Studio/Curve3DViewer.tsx');
  assert.match(viewer, /getAzimuth\(\): number;/, 'SceneApi has no getAzimuth');
  assert.match(viewer, /getAzimuth\(\) \{\n\s+return theta;\n\s+\},/, 'getAzimuth does not return the orbit angle');
  // A temporary azimuth never moves the user's orbit.
  assert.match(viewer, /const th = typeof azimuth === 'number' && Number\.isFinite\(azimuth\) \? azimuth : theta;/, 'renderFrame overwrites the orbit');
});

test('the ExportModal offers the 360° orbit toggle in the 3D video tab', () => {
  const modal = read('../components/ExportModal.tsx');
  assert.match(modal, /360° orbit/, 'video tab has no 360° orbit toggle');
  assert.match(modal, /orbit360: videoPrefs\.orbit360,/, 'video export does not pass the orbit choice');
  assert.match(modal, /orbit360: !p\.orbit360/, 'orbit toggle does not flip the choice');
  // The choice is remembered (on by default for old saved prefs).
  assert.match(modal, /orbit360: parsed\.orbit360 === false \? false : true,/, 'orbit choice is not persisted');
});

test('the 3D scene exposes the export API (picture + per-frame video)', () => {
  const source = read('../components/Studio/Curve3DViewer.tsx');
  // The API type carries the export methods (v32: exportImage takes the
  // labels — equation name + scientist name + colour theme).
  assert.match(source, /exportImage\(equation: string, labels\?: SceneApiLabelInfo\): Promise<\{ blob: Blob; filename: string \}>/, 'SceneApi has no exportImage');
  assert.match(source, /renderFrame\(progress: number \| null, opts\?: \{ azimuth\?: number; watermark\?: boolean \}\): HTMLCanvasElement/, 'SceneApi has no renderFrame (v30: azimuth + watermark opts)');
  assert.match(source, /pause\(\): void/, 'SceneApi has no pause');
  assert.match(source, /resume\(\): void/, 'SceneApi has no resume');
  // The viewer hands the API to its parent (and clears it on unmount).
  assert.match(source, /onReady\?: \(api: SceneApi \| null\) => void/, 'Curve3DViewer has no onReady prop');
  assert.match(source, /onReadyRef\.current\?\.\(apiRef\.current\)/, 'viewer does not hand the API to onReady');
  assert.match(source, /onReadyRef\.current\?\.\(null\)/, 'viewer does not clear the API on unmount');
  // exportImage uses the existing render3DImage (one frame + footer + PNG),
  // passing the labels through (v32).
  assert.match(source, /render3DImage\(renderer, scene, camera, \{\s*equation,\s*equationName: labels\?\.equationName \?\? null,\s*scientistName: labels\?\.scientistName \?\? null,\s*colorTheme: labels\?\.colorTheme \?\? colorTheme,\s*\}\)/, 'exportImage does not call render3DImage with the labels');
  // renderFrame applies the progress then renders (so the playhead moves).
  assert.match(source, /applyProgress\(p\)/, 'renderFrame does not apply the progress');
  assert.match(source, /renderer\.render\(scene, camera\)/, 'renderFrame does not render the scene');
});

test('the store carries the live 3D API for the export UI', () => {
  const source = read('../store/studioStore.ts');
  assert.match(source, /threeDApi: SceneApi \| null/, 'store has no threeDApi field');
  assert.match(source, /setThreeDApi: \(api: SceneApi \| null\) => void/, 'store has no setThreeDApi action');
  assert.match(source, /threeDApi: null,/, 'store does not initialise threeDApi to null');
  assert.match(source, /setThreeDApi: \(threeDApi\) => set\(\{ threeDApi \}\)/, 'store has no setThreeDApi setter');
  // The GraphPanel wires the viewer's onReady into the store.
  const panel = read('../components/GraphPanel.tsx');
  assert.match(panel, /onReady=\{\(api\) => useStudioStore\.getState\(\)\.setThreeDApi\(api\)\}/, 'GraphPanel does not wire onReady into the store');
});

test('the ExportModal offers 3D picture and 3D video while a 3D viewer is mounted', () => {
  const source = read('../components/ExportModal.tsx');
  // It reads the live 3D API from the store.
  assert.match(source, /const threeDApi = useStudioStore\(\(s\) => s\.threeDApi\)/, 'ExportModal does not read threeDApi');
  // 3D picture: a handler that calls the scene's exportImage (v32: with
  // the labels — equation name + scientist name + colour theme).
  assert.match(source, /const handleExport3DImage = async/, 'ExportModal has no 3D image handler');
  assert.match(source, /await threeDApi\.exportImage\(s\.equation, \{/, '3D image handler does not call exportImage');
  // 3D video: the video handler routes to the offline 3D render.
  assert.match(source, /export3DVideoOffline\(threeDApi, base/, 'video handler does not call the 3D offline render');
  // Both tabs get a 2D / 3D toggle, only while a 3D viewer exists.
  assert.match(source, /setImageDimension\(dim\)/, 'image tab has no 2D/3D toggle');
  assert.match(source, /setVideoDimension\(dim\)/, 'video tab has no 2D/3D toggle');
  // The image button routes to the 3D handler when 3D is chosen (v30: via
  // the turntable handler when the 360° picture is picked).
  assert.match(source, /onClick=\{imageDimension === '3d' && threeDApi \? \(image360 \? handleExport3DTurntableImage : handleExport3DImage\) : handleExportImage\}/, 'image button does not route to the 3D handler');
});

test('the 3D video exporter reuses the offline pipeline (same quality as 2D)', () => {
  const source = read('../utils/export3DVideoOffline.ts');
  // Same audio (offline sonification), same codecs, same muxer, same FPS.
  assert.match(source, /renderEquationToAudioBuffer/, '3D video does not reuse the offline audio render');
  assert.match(source, /probeVideoCodec/, '3D video does not probe the video codec');
  assert.match(source, /pickAudioCodec/, '3D video does not pick the audio codec');
  assert.match(source, /new Muxer\(/, '3D video does not use mp4-muxer');
  assert.match(source, /new VideoFrame\(canvas, \{ timestamp: i \* frameUs, duration: frameUs \}\)/, '3D video does not make frame-exact VideoFrames');
  // It pauses the live loop while driving frames, and always resumes.
  assert.match(source, /api\.pause\(\)/, '3D video does not pause the live loop');
  assert.match(source, /api\.resume\(\)/, '3D video does not resume the live loop');
  // Each frame renders the 3D scene at its progress, then copies it.
  // (v30: with the orbit azimuth and the billboard watermark.)
  assert.match(source, /api\.renderFrame\(progress, \{ azimuth, watermark: true \}\)/, '3D video does not render frames via the scene API');
  assert.match(source, /ctx\.drawImage\(webglCanvas, 0, 0, VIDEO_W, VIDEO_H\)/, '3D video does not copy the WebGL frame to the canvas');
  // The output is a distinct 3D file, not the 2D one.
  assert.match(source, /-3d\$\{orbitSuffix\}\$\{suffix\}\.mp4/, '3D video filename does not carry the -3d marker');
});
