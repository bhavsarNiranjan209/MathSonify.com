/**
 * Contract tests for the shared graph panel and the 3D viewer.
 *
 * The staleness bug these guard is the important one: it was silent, it was
 * pre-existing, and it would have been independently inherited by 3D had the 3D
 * work landed first. Each test pins one link in the chain that prevents it —
 * the shared hook, the derived curve, the repaint dependency, and the drag
 * 
 * 
 * 
 * 
 * 
 * preview's bounded lifetime.
 *
 * The pure geometry (axes, playhead mapping) is tested for real in
 * `curve3d.test.ts`; what is asserted here is the wiring, which is where the bug
 * actually lived.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Color } from 'three';

import { AXIS_LABEL_SCALE } from '../utils/curve3d';
import { IDLE_DRIFT, scenePalette } from '../utils/graph3dTheme';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

/**
 * Source with comments stripped.
 *
 * Several assertions below are of the form "this identifier must not appear".
 * The prose explaining WHY that identifier is banned necessarily names it, so a
 * naive search over raw source reports a phantom violation in the very comment
 * that documents the rule. Stripping comments first makes the check mean what it
 * says: no such call survives in live code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const VISUALIZER = './Visualizer.tsx';
const PANEL = './GraphPanel.tsx';
const VIEWER = './Studio/Curve3DViewer.tsx';
const SHADERS = './Studio/curve3dShaders.ts';

test('the drag preview cannot outlive the gesture that created it', () => {
  // THE STALENESS BUG, pinned at the source level.
  //
  // The old code kept the drag preview in `freeformRef` and cleared it ONLY in
  // the canvas's pointerup handler. Release the mouse outside the canvas, or let
  // the browser cancel the pointer, and the preview survived forever — masking
  // every later equation change, so the graph appeared frozen on a previous
  // curve with no error anywhere. `handlePointerLeave` must therefore also end
  // the drag.
  const source = read(VISUALIZER);

  const leaveStart = source.indexOf('const handlePointerLeave');
  const leaveEnd = source.indexOf('};', leaveStart);
  assert.ok(leaveStart > 0 && leaveEnd > leaveStart, 'handlePointerLeave must exist');
  assert.match(
    source.slice(leaveStart, leaveEnd),
    /handlePointerUp\(\)/,
    'leaving the canvas must end the drag, or the preview masks later equations',
  );

  // And the preview must be React state, not a ref: a ref is precisely what let
  // it silently persist across renders. Comments are stripped first, because the
  // prose explaining this rule necessarily names the old ref.
  assert.match(source, /const \[freeform, setFreeform\] = useState<SamplePoint\[\] \| null>/);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /freeformRef/, 'no freeformRef may survive in live code');
});

test('the graph repaints on the resolved curve, not just the equation string', () => {
  // Depending on `equation` alone missed every path that changes the curve
  // without changing the string: a preset, a fitted curve, a sculpted spline, a
  // domain change. Keying the repaint on the points themselves closes that gap.
  const source = read(VISUALIZER);
  assert.match(
    source,
    /\}, \[graphPoints, showGrid, minX, maxX, visualizerMode, themeNonce\]\);/,
    'the repaint effect must depend on the resolved curve',
  );
});

test('the render error is derived, not imperatively cleared', () => {
  // An effect that had to remember to clear the error when an equation became
  // valid was duplicated state; deriving it removes the possibility of a stale
  // message surviving a fix.
  const source = read(VISUALIZER);
  assert.match(source, /const renderError = activeCurve\.error \?\? '';/);
  assert.doesNotMatch(source, /const \[renderError, setRenderError\] = useState/);
});

test('both views read the one shared hook', () => {
  // This is what makes "2D and 3D can never disagree" structural rather than
  // aspirational: neither re-samples the equation itself.
  const visualizer = read(VISUALIZER);
  const panel = read(PANEL);
  assert.match(visualizer, /useActiveCurve\(/);
  assert.match(panel, /useActiveCurve\(/);
  assert.doesNotMatch(
    visualizer,
    /parseEquation\(equation\)\.sample/,
    'the Visualizer must not re-sample the equation itself',
  );
});

test('the panel frame declares a definite height in BOTH modes', () => {
  // THE BLANK-3D BUG.
  //
  // The frame used to be `flex-1` inside a root with no height, so it resolved to
  // 0px. The 2D Visualizer hid this because it carries its own h-[520px] and
  // simply overflowed the zero-height box; the 3D viewer inherits `h-full`, was
  // handed 0x0, and three clamped it to a 1x1 buffer — so the scene rendered into
  // a single pixel. Axes and floor were invisible too, which is what identified
  // this as a sizing failure rather than a geometry one.
  //
  // The frame must therefore declare a height itself, identically in both modes,
  // so the canvas keeps exactly its previous 400/480/520px for the exporters.
  const source = read(PANEL);
  const frame = source.match(/<div className="relative w-full h-\[400px\][^"]*">/);
  assert.ok(frame, 'the panel frame must declare its own responsive height');
  assert.doesNotMatch(source, /relative flex-1 min-h-0/, 'the zero-height flex frame must be gone');
});

test('the 2D view fills the frame instead of imposing its own height', () => {
  // Two halves of the fix: the frame owns the height, so the Visualizer must
  // fill it. A percentage height against an auto-height parent collapses to auto
  // in every browser, which would reintroduce the blank canvas on the 2D side.
  const source = read(VISUALIZER);
  assert.match(
    source,
    /relative w-full h-full flex flex-col/,
    'the Visualizer root must fill the frame',
  );
  assert.match(source, /relative w-full h-full min-h-0 cursor-crosshair/);
  // The hard-coded ladder must be gone from the canvas area; it now lives on the
  // panel so there is a single source of truth for the graph's height.
  const canvasArea = source.slice(
    source.indexOf('relative w-full h-full min-h-0 cursor-crosshair') - 200,
    source.indexOf('relative w-full h-full min-h-0 cursor-crosshair') + 200,
  );
  assert.doesNotMatch(canvasArea, /h-\[400px\]/);
});

test('the 3D renderer never clamps a zero-size host to 1px', () => {
  // The clamp is what made the blank canvas permanent and silent: three accepted
  // a 1x1 buffer as valid, so the ResizeObserver had nothing left to fix and the
  // scene stayed invisible with no error. Skipping instead lets the observer
  // retry the moment the host becomes measurable.
  const source = read(VIEWER);
  const resize = source.slice(
    source.indexOf('const resize = () =>'),
    source.indexOf('const observer = new ResizeObserver'),
  );
  assert.doesNotMatch(resize, /Math\.max\(1,/, 'a zero-size host must not be clamped to 1px');
  assert.match(resize, /if \(w <= 0 \|\| h <= 0\) return;/, 'an unmeasurable host must be skipped');
  // And the observer must still be wired, or it would never recover.
  assert.match(source, /new ResizeObserver\(resize\)/);
});

test('GraphPanel is one shared component with an in-panel toggle', () => {
  const source = read(PANEL);
  // A MODE of the existing panel: the toggle sits in the header and swaps the
  // contents of one frame rather than rendering a second card.
  assert.match(source, /2D Graph/);
  assert.match(source, /3D Graph/);
  assert.match(source, /aria-pressed=\{mode === m\}/);
  // It must not navigate anywhere.
  assert.doesNotMatch(source, /<a\s+href|navigate\(|<Link/);
});

test('the 3D viewer takes shared points, subscribing to the transport itself', () => {
  // Accepting an equation string and parsing it internally is how 3D became stale
  // independently: it could only show the curve it was mounted with.
  //
  // Playback is the mirror image. It must NOT arrive as a prop, because the store
  // publishes progress 30-60x/second and a prop would re-render React on every
  // tick. The viewer subscribes to the store imperatively and writes to a ref.
  const source = read(VIEWER);
  assert.match(source, /points: SamplePoint\[\]/);
  // The PROPS interface must not carry progress. Checked on that interface rather
  // than by searching for the text "progress: number", which also appears in the
  // store-subscription's state type and would be a false positive.
  const propsBlock = source.slice(
    source.indexOf('export interface Curve3DViewerProps'),
    source.indexOf('export interface Curve3DViewerProps') + 500,
  );
  assert.doesNotMatch(propsBlock, /progress/, 'progress must not be a React prop');
  assert.match(source, /useStudioStore\.subscribe\(/, 'progress must arrive by subscription');
  assert.match(source, /progressRef\.current = state\.progress/);
  assert.doesNotMatch(code(VIEWER), /parseEquation\(/, 'the viewer must not sample; the hook did');

  // And the panel must not subscribe either, or the 2D subtree re-renders too.
  assert.doesNotMatch(code(PANEL), /useStudioStore\(\(s\) => s\.progress\)/);
  assert.doesNotMatch(code(PANEL), /useStudioStore\(\(s\) => s\.isPlaying\)/);
});

test('the scene rebuilds on a new curve but not on every frame', () => {
  const source = read(VIEWER);
  assert.match(source, /if \(builtForRef\.current === points\) return;/);

  // Progress changes ~60x/second; as a dependency of the rebuild it would rebuild
  // the whole scene every frame. The slice below is the effect's own body.
  const at = source.indexOf('}, [points]);');
  assert.ok(at > 0, 'the points effect must exist');
  const effect = code(VIEWER).slice(0, code(VIEWER).indexOf('}, [points]);'));
  assert.doesNotMatch(effect.slice(-400), /progress/, 'progress must not rebuild geometry');

  // Exactly ONE animation loop. Counted by the loop DEFINITION, not by
  // `requestAnimationFrame(frame)`: the standard self-rescheduling idiom calls
  // that twice per loop (once inside frame to book the next frame, once to start
  // it), so counting call sites would wrongly report two loops.
  assert.equal((source.match(/const frame = \(\) =>/g) ?? []).length, 1);
  assert.equal((source.match(/new WebGLRenderer/g) ?? []).length, 1, 'one renderer, once');
});

test('the grid is procedural, not a helper or a texture', () => {
  // GridHelper drew a hard-edged lattice with no distance fade — the "excessive
  // grid visibility" the brief calls out. Comments are stripped first, because
  // the prose explaining that rule necessarily names the class.
  const viewerCode = code(VIEWER);
  assert.doesNotMatch(viewerCode, /GridHelper/, 'no GridHelper may remain in live code');

  const shaders = read(SHADERS);
  assert.match(shaders, /float gridLine\(/, 'the grid must be computed per fragment');
  assert.match(shaders, /fwidth\(/, 'grid lines must be screen-space anti-aliased');
  assert.match(shaders, /uMinor/);
  assert.match(shaders, /uMajor/);
  assert.match(shaders, /smoothstep\(uFadeEnd/, 'the grid must fade with distance');
});

test('curve brightness is driven by playback, in a shader not a rebuild', () => {
  const shaders = read(SHADERS);
  assert.match(shaders, /uniform float uProgress/);
  assert.match(shaders, /smoothstep\(uProgress/, 'the played/unplayed split must come from progress');
  assert.match(shaders, /uHeadGlow/, 'the scan band must be scalable');
  // onBeforeCompile keeps curve, floor and surface under one lighting model; a raw
  // ShaderMaterial would re-implement lighting and fog by hand and visibly not
  // match the rest of the scene.
  assert.match(shaders, /onBeforeCompile/);
  assert.match(shaders, /MeshStandardMaterial/);
});

test('the curve is a camera-facing ribbon, not a tube', () => {
  // THE central visual change. A TubeGeometry is a solid pipe with a hard
  // silhouette and a specular highlight — it reads as a plastic object, which is
  // exactly the "generic WebGL demo" look this redesign removes.
  assert.doesNotMatch(code(VIEWER), /TubeGeometry/, 'no tube may remain in the live viewer');
  assert.doesNotMatch(code(VIEWER), /buildCurveTube/, 'the tube builder must be unused');
  assert.match(code(VIEWER), /buildCurveRibbon/, 'the curve must be a ribbon');

  const geometry = read('../utils/curve3d.ts');
  assert.match(geometry, /export function buildCurveRibbon/);
  // The attributes the shader needs: a tangent to expand against, a side to
  // offset to, and a position along the curve to compare against progress.
  assert.match(geometry, /aTangent/);
  assert.match(geometry, /aSide/);
  assert.match(geometry, /aAlong/);
});

test('the ribbon faces the camera in the vertex shader, not on the CPU', () => {
  // cross(tangent, viewDir) is what keeps the stroke from turning edge-on and
  // disappearing as the camera orbits. Doing it per-vertex costs nothing; doing
  // it in JS would mean rebuilding geometry on every orbit frame.
  const shaders = read(SHADERS);
  assert.match(shaders, /cross\(tangent, viewDir\)/);
  assert.match(shaders, /cameraPosition/);
  // Screen-space-constant width, so it never swells as the camera pulls back.
  assert.match(shaders, /dist/);
});

test('the curve ends taper rather than being chopped off', () => {
  const shaders = read(SHADERS);
  // A square-cut end at the domain boundary is the tell of a plotted object
  // rather than a curve continuing through space.
  assert.match(shaders, /taper/);
  assert.match(shaders, /smoothstep\(0\.0, 0\.045, aAlong\)/);
  assert.match(shaders, /smoothstep\(1\.0, 0\.955, aAlong\)/);
});

test('the curve responds to real audio, and only a little', () => {
  // "Feel alive" must come from the actual sound, and must stay small enough that
  // the equation remains recognisable — it is a visualization of an equation
  // first.
  const viewer = code(VIEWER);
  assert.match(viewer, /audioEngine\.getAnalyser\(\)/, 'energy must come from the engine');
  assert.match(viewer, /getByteTimeDomainData/, 'and from the same analyser the 2D view reads');
  assert.doesNotMatch(viewer, /setInterval|setTimeout/, 'no independent playback timer');

  const shaders = read(SHADERS);
  assert.match(shaders, /uniform float uEnergy/);
  // The breathing factor is capped at 10%: past that it distorts the mathematics.
  const breathe = shaders.slice(shaders.indexOf('float breathe'), shaders.indexOf('float breathe') + 90);
  assert.match(breathe, /uEnergy \* 0\.\d+/);
  const amount = Number(breathe.match(/uEnergy \* (0\.\d+)/)![1]);
  assert.ok(amount <= 0.15, `energy widens the curve by ${amount}, which distorts the equation`);
});

test('there is no lit plane and no cast shadow', () => {
  // A lit surface catches a directional light, which puts a gradient across a big
  // plane — and a gradient across a big plane reads as a coloured sheet no matter
  // how carefully it is tinted. The ground is unlit, so no shadow can exist.
  const viewer = code(VIEWER);
  assert.doesNotMatch(viewer, /shadowMap\.enabled/);
  assert.doesNotMatch(viewer, /castShadow/);
  assert.doesNotMatch(viewer, /receiveShadow/);
  // And the ground really is a basic (unlit) material with the grid injected.
  assert.match(viewer, /new MeshBasicMaterial\(\{[\s\S]{0,120}floor/);
});

test('there are no coloured planes or rainbow surfaces', () => {
  // One neutral axis colour for all three axes. Three different axis colours is
  // the single clearest "classroom graphing" tell there is.
  const viewer = code(VIEWER);
  const axisLines = viewer.slice(viewer.indexOf('const axisLine'), viewer.indexOf('makeAxisLabel'));
  // The real property: the axis helper takes NO colour parameter, so all three
  // axes are forced to share one neutral. Asserting the signature is more robust
  // than counting call sites.
  assert.match(axisLines, /const axisLine = \(from: Vector3, to: Vector3\) =>/, 'the axis helper must not take a colour');
  assert.equal(axisLines.includes('AXIS_COLORS'), false, 'axes must not be per-axis coloured');
  // And every axis drawn comes from the same single palette entry.
  assert.ok(axisLines.includes('paletteRef.current.axis'), 'axes must use the one neutral axis colour');
  assert.equal((axisLines.match(/new Color\(/g) ?? []).length, 1, 'exactly one axis colour may be constructed');

  // No saturated primaries anywhere in the palette.
  const palette = scenePalette('dark');
  for (const hex of [palette.curve, palette.axis, palette.background, palette.floor]) {
    const c = new Color(hex);
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    assert.ok(max - min < 0.16, `${hex} is a saturated colour; the scene is neutral`);
  }
});

test('the playhead is small and precise, not a glowing ball', () => {
  const viewer = read(VIEWER);
  const radius = Number(viewer.match(/HEAD_RADIUS = ([\d.]+)/)![1]);
  // The curve's stroke half-width is ~0.0022 per unit of distance; a marker of
  // 0.055 is small beside it but still clearly visible.
  assert.ok(radius <= 0.08, `playhead radius ${radius} is large enough to read as a ball`);
  // A soft additive halo rather than a second bright mesh.
  assert.match(viewer, /makeHalo/);
  assert.match(viewer, /AdditiveBlending/);
});

test('the grid is genuinely faint', () => {
  const dark = scenePalette('dark');
  // A grid you can count is a grid competing with the curve.
  assert.ok(dark.gridMinorOpacity <= 0.15, 'minor grid lines must be almost invisible');
  assert.ok(dark.gridMajorOpacity <= 0.3, 'major grid lines must stay recessive');
  assert.notEqual(dark.gridMinor, dark.gridMajor, 'major and minor must differ');
  assert.ok(dark.gridFadeEnd < 60, 'the grid must fade well before the scene edge');
});

test('the scene is lit and toned like an instrument, not a demo', () => {
  const source = read(VIEWER);
  // Filmic tone mapping is what stops emissive highlights clipping to flat white,
  // which is the single biggest tell of cheap WebGL.
  assert.match(source, /ACESFilmicToneMapping/);
  assert.match(source, /SRGBColorSpace/);
  // Fog is what turns a flat backdrop into depth.
  assert.match(source, /new Fog\(/);
});

test('axis labels are small, not oversized', () => {
  // The brief calls out "oversized X/Y/Z letters" as a childish tell.
  assert.ok(AXIS_LABEL_SCALE <= 0.8, `label scale ${AXIS_LABEL_SCALE} is too large`);
  assert.match(read(VIEWER), /AXIS_LABEL_SCALE/);
  assert.doesNotMatch(read(VIEWER), /font = `bold/, 'labels must not be bold headlines');
});

test('the playhead is driven by shared progress and hidden while idle', () => {
  const source = read(VIEWER);
  assert.match(source, /headPosition\(ph\.centerline, progress/);
  // A parked marker on an idle graph implies playback that is not happening.
  assert.match(source, /ph\.head\.visible = playing/);
});

test('3D is view-only — no reshaping affordance', () => {
  // Editing stays 2D-exclusive by design. The viewer must contain camera maths
  // only: no control points, no spline editing, no raycasting against the curve.
  const source = read(VIEWER);
  assert.match(source, /applyOrbit/);
  assert.match(source, /applyPan/);
  assert.match(source, /applyZoom/);
  assert.doesNotMatch(source, /Raycaster|setSplineControlPoints|onControlPoint/);
});

test('light mode is designed, not an inversion of dark', () => {
  const dark = scenePalette('dark');
  const light = scenePalette('light');
  // The failure to avoid: a light scene that is dark with the sign flipped,
  // giving a dark curve on a dark ground and an invisible graph.
  assert.notEqual(light.curve, dark.curve);
  assert.notEqual(light.background, dark.background);

  // The curve must contrast with its own ground in BOTH modes.
  const lum = (hex: string) => {
    const c = new Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  for (const [name, palette] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    const delta = Math.abs(lum(palette.curve) - lum(palette.background));
    assert.ok(delta > 0.5, `${name}: curve and background are too close in luminance`);
  }
  assert.notEqual(dark.gridMinor, dark.gridMajor, 'minor and major grid must differ');
});

test('idle drift is imperceptible and respects reduced motion', () => {
  assert.ok(IDLE_DRIFT.thetaAmplitude < 0.02, 'drift is too visible');
  assert.ok(IDLE_DRIFT.periodSeconds >= 30, 'drift must be slow');
  const viewer = read(VIEWER);
  assert.match(viewer, /prefers-reduced-motion/, 'drift must be disabled for reduced motion');
  // And it must yield to the user rather than fight their drag.
  assert.match(viewer, /idleFor > IDLE_DRIFT\.resumeDelaySeconds/);
});

test('interaction is contained and never scrolls the page', () => {
  const viewer = read(VIEWER);
  // touch-action: none stops one-finger drag orbiting AND scrolling at once.
  assert.match(viewer, /touchAction: 'none'/);
  // The wheel listener must be non-passive or preventDefault is ignored and the
  // page scrolls while the user tries to zoom the graph.
  assert.match(viewer, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
  for (const fn of ['applyOrbit', 'applyZoom', 'applyPan', 'applyPinch']) {
    assert.match(viewer, new RegExp(fn), `${fn} must be wired`);
  }
});

test('a hidden tab does not keep rendering', () => {
  // A backgrounded graph burning a core is a battery bug, not a feature.
  const viewer = read(VIEWER);
  assert.match(viewer, /visibilitychange/);
  assert.match(viewer, /document\.hidden/);
  assert.match(viewer, /if \(paused/);
});

test('resources are disposed, including textures', () => {
  const viewer = read(VIEWER);
  assert.match(viewer, /renderer\.dispose\(\)/);
  assert.match(viewer, /clearGroup\(curveGroup\)/);
  // An axis label's CanvasTexture leaks on every rebuild unless disposed too.
  assert.match(viewer, /map\?\.dispose\?\.\(\)/);
  assert.match(viewer, /cancelAnimationFrame/);
  assert.match(viewer, /observer\.disconnect\(\)/);
});

test('the retired dev harness is gone', () => {
  // The shared panel is now the single implementation; a second 3D harness would
  // be exactly the duplication the brief forbids.
  assert.throws(
    () => read('./Studio/Curve3DDevPanel.tsx'),
    'the dev-only 3D panel should have been removed',
  );
});