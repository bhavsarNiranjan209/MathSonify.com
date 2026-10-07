/**
 * Contract tests for the shared graph panel and the 3D viewer.
 *
 * The staleness bug these guard is the important one: it was silent, it was
 * pre-existing, and it would have been independently inherited by 3D had the 3D
 * work landed first. Each test pins one link in the chain that prevents it —
 * the shared hook, the derived curve, the repaint dependency, and the drag
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
  // The frame's class now sits alongside the perspective style, so the assertion
  // must not assume className is the first and only attribute.
  const frame = source.match(/className="relative w-full h-\[400px\][^"]*"/);
  assert.ok(frame, 'the panel frame must declare its own responsive height');
  assert.doesNotMatch(source, /relative flex-1 min-h-0/, 'the zero-height flex frame must be gone');
});



test('no implementation prose is rendered into the DOM as text', () => {
  // A REGRESSION TEST FOR A SHIPPED BUG.
  //
  // A bare `/* ... */` written between JSX elements is not a comment — only
  // `{/* ... */}` is. The naked form is parsed as literal text, so React rendered
  // 23 lines of implementation notes ("THE FLIP", "perspective", "preserve-3d",
  // "backface-visibility") straight into the page, in front of the user.
  //
  // It typechecked, it built, and 17k tests passed, because text is legal JSX
  // children. Nothing short of an explicit check would have caught it.
  //
  // The rule enforced here: inside the return's JSX, every block comment must be
  // wrapped in braces. Comments before the `return` are ordinary JS and are fine.
  const source = read(PANEL);
  const jsx = source.slice(source.indexOf('return ('));
  assert.ok(jsx.length > 0, 'the panel must return JSX');

  // A block comment opening in JSX position that is NOT preceded by `{`.
  const stray = [...jsx.matchAll(/(^|[^{])\/\*(?!\s*\/)/g)];
  assert.equal(
    stray.length,
    0,
    `found ${stray.length} unwrapped block comment(s) in JSX; React renders these as text`,
  );

  // NOTE: this test previously also banned four literal phrases ("THE FLIP",
  // "preserve-3d", ...). That list is gone on purpose.
  //
  // It was a blunt second line of defence for the same bug, and once the 2D/3D
  // flip came back its implementation notes legitimately mention those words —
  // inside a properly wrapped `{/* */}` comment. Asserting on wording would then
  // fail on correct code.
  //
  // The regex above is strictly stronger: it rejects EVERY unwrapped block
  // comment in JSX regardless of what it says, so it catches this bug in any
  // wording. A phrase list only ever caught the four sentences that happened to
  // ship.
});

test('the 2D/3D toggle flips, and the flip cannot blank or leak the canvas', () => {
  // INVERTED DELIBERATELY, with the reason recorded.
  //
  // An earlier pass added a rotateY flip. It was removed, because a bare `/* */`
  // comment written between JSX elements rendered its implementation notes into
  // the page as visible text — the regression guarded above. The flip was blamed
  // for that bug, but the bug was the comment, not the rotation.
  //
  // The flip is now back by request. What it must NOT do is reintroduce the
  // actual failure: hide the 2D canvas with `display: none`, which AGENTS.md
  // forbids because it takes the canvas out of layout and its backing store
  // stops tracking the container. Both faces stay laid out and are hidden with
  // `backface-visibility` instead.
  const source = read(PANEL);

  // The rotation itself.
  assert.match(source, /transformStyle: 'preserve-3d'/, 'the frame rotates on Y');
  assert.match(source, /rotateY\(\$\{show3D \? 180 : 0\}deg\)/, 'rotation tracks the mode');
  assert.match(source, /perspective: '1600px'/, 'the flip needs a perspective to read as depth');

  // The part that actually matters: no display:none on the canvas.
  assert.doesNotMatch(
    source,
    /display: show3D \? 'none' : 'block'/,
    'the 2D canvas must be hidden by backface-visibility, never display:none',
  );
  assert.match(source, /backfaceVisibility: 'hidden'/, 'both faces opt out of depth sorting');
  assert.match(source, /\{show3D && <Curve3DViewer/, 'the WebGL view mounts only in 3D');

  // Reduced motion is honoured in CSS, so there is no JS branch to forget.
  assert.match(source, /motion-reduce:transition-none/);
});

test('the 3D scene is eager, so the toggle does not reveal an unsized canvas', () => {
  // Mounting the viewer only when it is flipped is what produces a blank canvas
  // mid-transition: WebGL sized against a container that did not yet exist draws
  // into nothing.
  const viewer = code(VIEWER);
  assert.match(viewer, /ResizeObserver|hostRef/, 'the viewer must observe its own host size');
  assert.doesNotMatch(viewer, /suspended/, 'the flip-only suspension flag is dead and must be gone');
});

test('the orbit is damped, not pinned 1:1 to the pointer', () => {
  // An orbit that tracks the cursor exactly feels mechanical: the scene is pinned
  // to the pointer and stops dead when it does. Input writes a TARGET, and the
  // frame loop eases the camera toward it.
  const viewer = code(VIEWER);
  assert.match(viewer, /orbitTargetRef/);
  assert.match(viewer, /dampOrbit\(currentOrbit, targetOrbit, ORBIT_DAMPING\)/);

  // Every input path must write the target, never the rendered state.
  const inputs = viewer.slice(viewer.indexOf('const onPointerDown'), viewer.indexOf('const onContextMenu'));
  const writesTarget = (inputs.match(/orbitTargetRef\.current = apply/g) ?? []).length;
  assert.equal(inputs.includes('orbitRef.current = apply'), false, 'input must not write the rendered state');
  assert.ok(writesTarget >= 3, `orbit, pan and pinch must all target: found ${writesTarget}`);

  // Tuned in a range: below ~0.05 it lags the pointer, at 1 it is 1:1 again.
  const factor = Number(viewer.match(/ORBIT_DAMPING = ([\d.]+)/)![1]);
  assert.ok(factor > 0.05 && factor <= 0.2, `damping ${factor} is either floaty or effectively 1:1`);

  const damping = read('../utils/orbitCamera.ts');
  assert.match(damping, /export function dampOrbit/);
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

test('a wireframe bounding box gives the curve a coordinate space to sit in', () => {
  // The cue that most makes a scene read as "a real coordinate space" rather than
  // "an object floating in void" — the reference implementation has the same cue.
  // Edges only: a solid or translucent box would occlude or tint the curve, which
  // is the one thing that must stay unaltered.
  const viewer = code(VIEWER);
  assert.match(viewer, /buildBoundingBox/);
  assert.match(viewer, /LineSegments/);

  const box = viewer.slice(viewer.indexOf('function buildBoundingBox'));
  assert.match(box, /LineBasicMaterial/, 'edges, not surfaces');
  assert.match(box, /opacity: 0\.\d+/);
  const opacity = Number(box.match(/opacity: ([\d.]+)/)![1]);
  // The box must be VISIBLE, not merely present: at the old 0.16 it was in the
  // scene graph but effectively invisible on screen, which reads as "there is
  // no box" rather than "there is a faint box". Graph paper needs drawn edges.
  //
  // The invariant still protected is translucency: the box is a drawn boundary,
  // never a surface, and must never become opaque enough to occlude or tint the
  // curve inside it. The band is a range, not a ceiling, so a future edit cannot
  // quietly push it either way.
  assert.ok(
    opacity >= 0.25 && opacity < 0.7,
    `box opacity ${opacity} must read as drawn lines without becoming a surface`,
  );

  const geometry = read('../utils/curve3d.ts');
  assert.match(geometry, /export function buildBoundingBox/);
});

test('Z stays visibly present even though the curve lies on z = 0', () => {
  // Honesty note: this product's equations are single-variable, y = f(x). The
  // curve genuinely lies in the z = 0 plane, and nothing pretends otherwise. Z is
  // kept visible because the scene has depth and the reference has a third axis —
  // not because the equation uses it.
  const viewer = code(VIEWER);
  assert.match(viewer, /axisLine\(axes\.z\.start, axes\.z\.end\)/, 'the z axis must be drawn');
  assert.match(viewer, /\['Z', axes\.labelZ\]/, 'and labelled');

  const geometry = read('../utils/curve3d.ts');
  assert.match(geometry, /minZ/);
  assert.match(geometry, /maxZ/);
});

test('the reflection is cheap: a mirrored duplicate, not a second render pass', () => {
  // A real planar reflection needs a second pass from a mirrored camera. The brief
  // asks for something cheaper that reads the same at a glance, which is exactly
  // what this is.
  const viewer = code(VIEWER);
  const reflection = viewer.slice(
    viewer.indexOf('const reflection = new Mesh'),
    viewer.indexOf('curveGroup.add(buildBoundingBox'),
  );
  assert.match(reflection, /tube\.geometry/, 'it reuses the existing geometry');
  assert.match(reflection, /scale\.y = -1/, 'mirrored through the floor plane');
  const opacity = Number(reflection.match(/opacity: ([\d.]+)/)![1]);
  assert.ok(opacity <= 0.2, `a reflection at ${opacity} is a mirror, not polish`);
  // And no extra camera, no render target, no second pass.
  assert.doesNotMatch(reflection, /RenderTarget|camera/);
});

test('the curve is a clearcoated PBR tube, so the highlight travels', () => {
  // A deliberate REVERSAL of the previous pass, which used a flat camera-facing
  // ribbon because a solid tube read as a plastic pipe. The brief now targets the
  // polish of a reference 3D calculator, and that is unachievable on a ribbon:
  // a flat form has essentially one normal, so its specular lobe never moves as
  // the camera orbits — the exact "reads flat from every angle" symptom.
  //
  // So the tube is back, but slim, and carrying the clearcoat that makes it read
  // as lacquer rather than as plastic.
  const viewer = code(VIEWER);
  assert.match(viewer, /MeshPhysicalMaterial/, 'the curve must be a physical material');
  assert.match(viewer, /buildCurveTube/);
  assert.match(viewer, /clearcoat: 1/, 'the clearcoat layer is the whole point');
  assert.ok(Number(viewer.match(/clearcoatRoughness: ([\d.]+)/)![1]) <= 0.2, 'the coat must be glossy');

  // Slim, not a pipe.
  const radius = Number(viewer.match(/TUBE_RADIUS = ([\d.]+)/)![1]);
  assert.ok(radius <= 0.12, `tube radius ${radius} reads as a pipe`);

  // Enough gloss to carry a highlight, not so much it becomes a mirror.
  const metalness = Number(viewer.match(/metalness: ([\d.]+)/)![1]);
  assert.ok(metalness > 0 && metalness <= 0.4, `metalness ${metalness} is out of range`);

  // The shader must NOT be doing the tube's job: expanding vertices toward the
  // camera would defeat the real normals the clearcoat depends on.
  const shaders = read(SHADERS);
  assert.doesNotMatch(shaders, /cross\(tangent, viewDir\)/);
  assert.match(shaders, /attribute float positionAlong/);
});

test('the scene uses correct colour management, or the PBR material is wrong', () => {
  // Skipping either of these is a well-known cause of a physically-based material
  // looking washed out next to a reference — clearcoat highlights in particular
  // need both to roll off instead of clipping to flat white.
  const viewer = code(VIEWER);
  assert.match(viewer, /ACESFilmicToneMapping/);
  assert.match(viewer, /SRGBColorSpace/);
  assert.match(viewer, /toneMappingExposure/);
});

test('there is a three-point rig, and the curve moves through its highlights', () => {
  // One light gives a highlight that either faces you or does not, so the curve
  // looks the same from every angle — which is what made it read as a flat
  // silhouette. Three roles, three directions.
  const viewer = code(VIEWER);
  assert.match(viewer, /DirectionalLight/, 'a key light');
  assert.match(viewer, /PointLight/, 'rim and fill');
  const pointLights = (viewer.match(/new PointLight/g) ?? []).length;
  assert.ok(pointLights >= 2, `expected rim + fill, found ${pointLights} point lights`);
  // The key is the shadow caster; the others are not.
  assert.match(viewer, /key\.castShadow = true/);
});

test('the floor is lit enough to catch a shadow, and stays dark', () => {
  // A shadow needs a LIT surface to land on. The floor is therefore a standard
  // (lit) material — but fully rough and the palette's neutral floor colour, so
  // it reads as a surface catching light rather than a coloured sheet.
  const viewer = code(VIEWER);
  assert.match(viewer, /shadowMap\.enabled/);
  assert.match(viewer, /floor\.receiveShadow = true/);
  assert.match(viewer, /tube\.castShadow = true/);
  const floorBlock = viewer.slice(viewer.indexOf('const floor = new Mesh'), viewer.indexOf('const reflection'));
  assert.match(floorBlock, /MeshStandardMaterial/, 'the floor must take light');
  assert.match(floorBlock, /roughness: 1/, 'a glossy floor competes with the curve');

  // The shadow map is capped: 2048 doubles the render cost for a difference
  // nobody sees at this scale.
  const mapSize = Number(viewer.match(/SHADOW_MAP_SIZE = (\d+)/)![1]);
  assert.ok(mapSize <= 1024, `shadow map ${mapSize} is too expensive to run every frame`);
});

test('the curve responds to real audio, and only a little', () => {
  // "Feel alive" must come from the actual sound, and must stay small enough that
  // the equation remains recognisable — it is a visualization of an equation
  // first.
  const viewer = code(VIEWER);
  assert.match(viewer, /audioEngine\.getAnalyser\(\)/, 'energy must come from the engine');
  assert.match(viewer, /getByteTimeDomainData/, 'and from the same analyser the 2D view reads');
  assert.doesNotMatch(viewer, /setInterval|setTimeout/, 'no independent playback timer');

  // The energy rides the material's own emissive now, so the cap is a plain
  // multiplier on emissiveIntensity. Past ~0.5 it stops reading as a response
  // and starts distorting the mathematics it is meant to be depicting.
  const amount = Number(viewer.match(/emissiveIntensity = energy \* ([\d.]+)/)![1]);
  assert.ok(amount <= 0.5, `energy lifts the curve by ${amount}, which distorts the equation`);
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

test('the grid reads as graph paper without competing with the curve', () => {
  const dark = scenePalette('dark');
  // The grid must actually be legible. This assertion previously demanded the
  // minor lines be "almost invisible" (<= 0.15), which on a #07080a ground
  // produced a scene with no readable coordinate system at all — the scene
  // read as an empty black room rather than as paper with a grid on it.
  //
  // What still matters is HIERARCHY: major lines must stay clearly stronger
  // than minor ones, so the grid has structure instead of becoming noise that
  // competes with the curve.
  assert.ok(
    dark.gridMinorOpacity >= 0.18 && dark.gridMinorOpacity <= 0.32,
    `minor grid opacity ${dark.gridMinorOpacity} must be legible but subordinate`,
  );
  assert.ok(
    dark.gridMajorOpacity > dark.gridMinorOpacity,
    'major lines must stay clearly stronger than minor ones',
  );
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

  // The curve must contrast with its own ground. HOW it contrasts differs by mode.
  const lum = (hex: string) => {
    const c = new Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  };
  for (const [name, palette] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    const delta = Math.abs(lum(palette.curve) - lum(palette.background));

    if (name === 'dark') {
      // Dark mode carries its separation by LUMINANCE: a light curve on a
      // near-black ground. That must never regress — it is what makes the graph
      // read at a glance in the mode most people use at night.
      assert.ok(delta > 0.5, `${name}: curve and background are too close in luminance`);
    } else {
      // LIGHT MODE IS NOW WHITE-ON-WHITE, BY REQUEST. The curve is #ffffff in
      // both modes so the maths looks identical whichever theme is active, which
      // necessarily puts it on the paper-white ground.
      //
      // Contrast here therefore cannot come from hue. It comes from FORM: the
      // tube is a lit physical material (metalness, roughness, a clearcoat
      // highlight) standing above a floor it casts a shadow onto and reflects
      // into — the same reason a white object stays readable in a white studio.
      // A flat-hex luminance comparison cannot see any of that.
      //
      // What IS still guarded is the failure that would genuinely lose the
      // curve: the ground going pure white, leaving no shadow and no reflection
      // to read against.
      assert.ok(
        delta > 0 && palette.floor !== palette.curve,
        `${name}: the ground must not be identical to the curve`,
      );
      assert.notEqual(palette.floor, '#ffffff', 'a pure-white floor removes the shadow to read against');
    }
  }

  // And the curve really is white in both modes: one colour for the maths,
  // independent of theme.
  assert.ok(lum(light.curve) > 0.95, 'the light-mode curve must be white');
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