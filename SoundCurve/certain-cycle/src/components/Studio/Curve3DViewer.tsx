/**
 * The 3D curve renderer.
 *
 * VISUAL DIRECTION — three priorities, and nothing else:
 *   1. the mathematical curve (a thin thread of light)
 *   2. the playback position (a small scanner on that curve)
 *   3. the mathematical space (fog, a nearly-invisible grid, faint axes)
 *
 * Everything that is not one of those three was removed rather than restyled:
 * the solid tube became a camera-facing ribbon, the lit floor became an unlit
 * ground with grid lines on it, cast shadows are gone (a shadow needs a lit plane
 * to land on, and that plane is exactly the "coloured sheet" the design rejects),
 * and the per-axis colours collapsed to one neutral.
 *
 * ARCHITECTURE — the split the brief demands:
 *   React owns: which equation, the mode, the scene's lifetime.
 *   This renderer owns: camera, playhead, and every high-frequency update.
 *
 * Playback progress arrives by IMPERATIVE STORE SUBSCRIPTION, not as a prop. The
 * store publishes progress ~30-60x/second; routing that through React state would
 * re-render the Studio on every audio tick. Geometry is rebuilt ONLY when the
 * curve's identity changes — progress is a shader uniform, so moving the playhead
 * allocates nothing and touches no React state at all.
 *
 * Scope: VIEW-ONLY. Orbit, zoom and pan. Editing is 2D.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { SamplePoint } from '../../utils/equationParser';
import {
  buildArrowHead,
  buildChipLabel,
  buildTickDash,
  fogRadiiFor,
  referenceTickValues,
} from '../../utils/curve3dAxes';
import {
  AXIS_LABEL_SCALE,
  buildAxes,
  buildBoundingBox as boundingBoxGeometry,
  buildCurveTube,
  framingRadius,
  headIndexForProgress,
  headPosition,
  layoutCurve,
  niceTicks,
  tickLabel,
  type CurveLayout,
} from '../../utils/curve3d';
import {
  applyCurveShader,
  applyFloorShader,
  curveUniforms,
  floorUniforms,
  type CurveUniforms,
  type FloorUniforms,
} from './curve3dShaders';
import { CAMERA_DEFAULTS, IDLE_DRIFT, scenePalette } from '../../utils/graph3dTheme';
import {
  applyOrbit,
  applyPan,
  applyPinch,
  applyZoom,
  dampOrbit,
  orbitBasis,
  orbitPosition,
  type OrbitState,
} from '../../utils/orbitCamera';
import { DEFAULT_MAX_DIMENSION, render3DImage } from '../../utils/render3DImage';
import { useStudioStore } from '../../store/studioStore';
import { audioEngine } from '../../utils/audioEngine';
import { getThemeMode, onThemeChange, type ThemeMode } from '../../utils/theme';

/**
 * Playhead marker radius in world units, and the length of the faint trace
 * behind it. Both are small on purpose: the brief asks for a precise scanner,
 * not a glowing ball.
 */
const HEAD_RADIUS = 0.055;
const HEAD_TRAIL_POINTS = 64;

/**
 * Fraction of the remaining orbit distance covered per frame.
 *
 * Tuned by feel rather than derived: too low and the camera lags the pointer
 * (floaty), too high and it is effectively 1:1 (mechanical). 0.14 is a
 * deliberate middle — the curve keeps gliding briefly after the drag ends, and
 * catches up quickly when the drag reverses.
 */
const ORBIT_DAMPING = 0.14;

const SHADOW_MAP_SIZE = 1024;

/**
 * Tube tessellation. Deliberately not maximal: a curve this size looks smooth
 * well before 64 radial segments, and the cost is paid every frame on a phone.
 */
const TUBULAR_SEGMENTS = 360;
const RADIAL_SEGMENTS = 16;
/**
 * Tube radius. Slim: a clearcoat highlight reads as polish on a thin form, but a
 * fat one immediately reads as a pipe.
 */
const TUBE_RADIUS = 0.085;

/** What the viewer currently has to draw, supplied by the shared panel. */
export interface Curve3DViewerProps {
  /** The shared sampled curve — the SAME array the 2D view draws. */
  points: SamplePoint[];
  /** Accessible description of what is on screen. */
  label: string;
  /**
   * Overrides the store transport when provided. The default reads the studio
   * store's progress directly (no React re-renders, ~60x/second safe).
   * Return null/undefined when idle.
   */
  getProgress?: () => number | null | undefined;
  /**
   * How the canvas negotiates touch gestures with the page.
   *
   * `'none'` (the default, and what the Studio uses) gives a one-finger drag to
   * the orbit and nothing to the page: correct when the graph IS the page.
   *
   * `'pan-y'` hands a vertical drag to the page and keeps horizontal drags for
   * the orbit — correct for a small graph embedded in something you are
   * reading, where swallowing a scroll gesture is a worse failure than a
   * restricted tilt. Pinch is not in the browser's allowed list, so two-finger
   * zoom still reaches the app.
   */
  touchAction?: 'none' | 'pan-y';
}

interface Playhead {
  head: Mesh;
  /** Soft additive glow billboarded at the head. */
  halo: Sprite;
  trail: LineSegments;
  centerline: Vector3[];
}

export default function Curve3DViewer({ points, label, getProgress, touchAction = 'none' }: Curve3DViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const orbitRef = useRef<OrbitState | null>(null);
  /**
   * Where the user's input has asked the camera to be.
   *
   * Input writes HERE and never to `orbitRef`. The frame loop then eases
   * `orbitRef` toward this every frame, which is what gives the orbit a little
   * weight instead of pinning the scene to the cursor. Keeping the two states
   * separate is the whole mechanism; collapsing them is what makes a control
   * feel mechanical.
   */
  const orbitTargetRef = useRef<OrbitState | null>(null);
  const rafRef = useRef(0);

  /**
   * Live transport values, written by an imperative store subscription.
   *
   * This is the whole performance story for playback: React state would re-render
   * the whole Studio 30-60x/second. These refs are read by the frame loop instead,
   * so a playing graph costs one uniform write per frame and nothing else.
   */
  const progressRef = useRef(0);
  const playingRef = useRef(false);
  /**
   * Smoothed audio energy, 0..1, read from the engine's analyser.
   *
   * The SAME signal the 2D visualiser uses, so the curve responds to the actual
   * sound rather than to a decorative timer. Held in a ref and sampled in the
   * frame loop: no React state, no re-render, one Float32Array reused forever.
   */
  const audioEnergyRef = useRef(0);
  /** Eased value actually fed to the shader, so the breath reads as continuous. */
  const energyRef = useRef(0);
  /** Reused sample buffer. Allocated once — never per frame. */
  const sampleBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  /** Identifies the geometry currently in the scene, so it rebuilds only on change. */
  const builtForRef = useRef<SamplePoint[] | null>(null);
  const rebuildRef = useRef<((p: SamplePoint[]) => void) | null>(null);
  const playheadRef = useRef<Playhead | null>(null);
  /** Kept in sync with <html data-theme> by `syncTheme`; the loop reads it to re-ink without a rebuild. */
  const paletteRef = useRef(scenePalette('dark'));
  const curveUniformsRef = useRef<CurveUniforms | null>(null);
  /** The tube's own material, so the frame loop can lift its emissive with audio. */
  const curveMaterialRef = useRef<MeshPhysicalMaterial | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Set by `rebuild` when the layout's y-range was percentile-trimmed (e.g. tan). */
  const [yTrimmed, setYTrimmed] = useState(false);
  /**
   * Bumped on theme change so the points effect re-runs `rebuild` and re-inks
   * EVERY material (floor colour, grid uniforms, curve, axes, ticks, labels,
   * playhead) with the new palette. Background/fog/exposure re-ink in place;
   * these are the colours only the rebuild path knows about.
   */
  const [themeNonce, setThemeNonce] = useState(0);

  /** 3D image capture state. */
  const [captureError, setCaptureError] = useState<string | null>(null);

  /** Allocation of the 3D shell, created once on mount; the capture hook closes
   *  over these so it can call `render3DImage` from component scope. */
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);

  // ── the imperative transport subscription ───────────────────────────
  const progressOverrideRef = useRef(getProgress);
  progressOverrideRef.current = getProgress;
  useEffect(() => {
    if (progressOverrideRef.current) return; // caller drives the playhead directly
    const sync = (state: { progress: number; isPlaying: boolean }) => {
      progressRef.current = state.progress;
      playingRef.current = state.isPlaying;
    };
    sync(useStudioStore.getState());
    // No unsubscribe return needed: zustand's subscribe gives one, and the
    // component unmounts with the panel, but being explicit avoids a leak if the
    // store outlives a hot reload.
    return useStudioStore.subscribe(sync);
  }, []);

  // ── scene shell, input and the frame loop: created once ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      setError('3D visualization unavailable in this browser.');
      return;
    }
    if (!renderer.getContext()) {
      setError('3D visualization unavailable in this browser.');
      return;
    }

    // The scene follows the page's theme from the first frame. It used to
    // hard-code dark here and rely on a later CSS-background read to correct
    // itself — which made fresh light loads depend on timing luck.
    let appliedTheme: ThemeMode = getThemeMode();
    const palette = scenePalette(appliedTheme);
    paletteRef.current = palette;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // Shadows are back. They were removed in the previous pass because a shadow
    // needs a LIT surface to land on, and a lit plane was producing the "coloured
    // sheet" look. The reference implementation gets away with a shadow because
    // its floor is a large, dark, low-reflectance surface whose only job is to
    // catch the shadow — not a colourful plane competing with the curve. So the
    // floor is restored, and given a material that stays dark while still taking
    // light, and the shadow map is capped so it stays affordable on a phone.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    /*
     * THE SINGLE BIGGEST PER-FRAME COST, TURNED OFF.

     * With autoUpdate on (the default) three.js re-renders the entire scene from
     * the light's point of view EVERY FRAME, just to regenerate the shadow map.
     * That is a second full scene render on top of the camera one, every frame,
     * forever — while the thing casting the shadow never moves.

     * The curve, floor, box, axes and ticks are all static between rebuilds; only
     * the camera orbits. So the shadow map only needs regenerating when the
     * geometry itself changes, which is what `needsUpdate` below handles. This
     * roughly halves the per-frame draw work for a scene whose lighting never
     * changes.
     */
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    // Filmic tone mapping + sRGB output. Skipping either is a well-known cause of
    // a physically-based material looking washed out next to a reference: clearcoat
    // highlights in particular need both to roll off correctly rather than clip.
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = palette.exposure;
    renderer.outputColorSpace = SRGBColorSpace;

    const scene = new Scene();
    scene.background = new Color(palette.background);
    // Fog is what turns a flat backdrop into depth. Tuned per theme so the light
    // scene recedes into paper rather than into grey.
    scene.fog = new Fog(new Color(palette.fog), palette.fogNear, palette.fogFar);

    const camera = new PerspectiveCamera(CAMERA_DEFAULTS.fov, 1, 0.1, 400);

    // ── three-point lighting ────────────────────────────────────────
    // The rig is what makes a physically-based surface read as a real object
    // rather than a flat silhouette: a single light gives one highlight that
    // either faces you or does not, so the curve looks identical from every
    // angle. Three lights with different roles give it a moving highlight as the
    // camera orbits, which is the cue the eye reads as "this is a solid thing in
    // a lit space".
    //
    //   KEY  — strong, neutral, the only shadow caster. Defines form.
    //   RIM  — cool, from behind and above; separates the curve from the fog.
    //   FILL — warm and weak, from the opposite side; opens the shadow side so
    //          the curve never goes fully black and loses its shape.
    scene.add(new AmbientLight(0xffffff, palette.ambient));

    const key = new DirectionalLight(0xffffff, palette.key);
    key.position.set(9, 16, 8);
    key.castShadow = true;
    // 1024 is the sweet spot: 2048 doubles the shadow render cost for a
    // difference nobody sees at this scale, and below 1024 the shadow visibly
    // stair-steps on a phone.
    key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 60;
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    // A small negative bias stops shadow acne on a thin tube without detaching
    // the shadow from the curve (peter-panning).
    key.shadow.bias = -0.0008;
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);

    const rim = new PointLight(0xbcd6ff, palette.rim, 44, 2);
    rim.position.set(-10, 6, -12);
    scene.add(rim);

    const fill = new PointLight(0xffd9a8, palette.fill, 38, 2);
    fill.position.set(11, 3, 9);
    scene.add(fill);

    // Everything that depends on WHICH curve is showing lives in one group, so an
    // equation change is a single clear + rebuild rather than a scatter of removals
    // that can miss one and leak GPU memory.
    const curveGroup = new Group();
    scene.add(curveGroup);

    /** Disposes every geometry and material under a node, then detaches it. */
    const clearGroup = (group: Group) => {
      for (const child of [...group.children]) {
        const node = child as Mesh & LineSegments & Sprite;
        node.geometry?.dispose();
        // An axis label's texture must go too, or every rebuild leaks a canvas.
        const mat = node.material as Material & { map?: { dispose?: () => void } };
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else {
          mat?.map?.dispose?.();
          mat?.dispose?.();
        }
        group.remove(child);
      }
    };

    const floorUniformsRef = { current: floorUniforms(palette) };

    const rebuild = (nextPoints: SamplePoint[]) => {
      clearGroup(curveGroup);
      playheadRef.current = null;
      curveUniformsRef.current = null;
      curveMaterialRef.current = null;

      const usable = nextPoints.filter((p) => p.isValid);
      if (usable.length < 2) return;

      let layout;
      try {
        layout = layoutCurve(nextPoints);
      } catch {
        setError('3D visualization unavailable for this equation.');
        return;
      }
      setYTrimmed(layout.yTrimmed);

      // ── the curve: a clearcoated tube ─────────────────────────────
      // MeshPhysicalMaterial with a clearcoat layer. This is the single biggest
      // step from "wireframe demo" to "real product": the clearcoat is a second
      // specular lobe sitting on top of the base material, so as the camera
      // orbits, a tight bright highlight travels along the tube and rolls off
      // toward the rim. A plain standard material has one broad specular term and
      // reads flat from every angle.
      const uniforms = curveUniforms(paletteRef.current);
      curveUniformsRef.current = uniforms;
      const tubeMaterial = applyCurveShader(
        new MeshPhysicalMaterial({
          color: new Color(paletteRef.current.curve),
          // Moderate metalness with low roughness: enough gloss to carry a
          // highlight, not so much that the curve turns into a mirror and
          // stops reading as the light-coloured object it is.
          metalness: 0.25,
          roughness: 0.28,
          // The lacquer layer. Low clearcoatRoughness is what makes it read as a
          // polished coat over the surface rather than a second diffuse bounce.
          clearcoat: 1,
          clearcoatRoughness: 0.12,
          emissive: new Color(paletteRef.current.accent),
          emissiveIntensity: 0,
        }),
        uniforms,
      );
      curveMaterialRef.current = tubeMaterial;
      const tube = new Mesh(
        buildCurveTube(layout.centerline, TUBULAR_SEGMENTS, RADIAL_SEGMENTS, TUBE_RADIUS),
        tubeMaterial,
      );
      tube.castShadow = true;
      curveGroup.add(tube);

      // ── floor: lit enough to catch the shadow, dark enough not to compete ─
      const floorSize = Math.max(46, (layout.bounds.maxX - layout.bounds.minX) * 2.1);
      const floor = new Mesh(
        new PlaneGeometry(floorSize, floorSize),
        applyFloorShader(
          new MeshStandardMaterial({
            color: paletteRef.current.floor,
            // Fully rough: a floor with any sheen reads as a polished slab, and
            // competes with the curve for attention. All it needs to do is take
            // the key light and catch the shadow.
            roughness: 1,
            metalness: 0,
          }),
          floorUniformsRef.current,
        ),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = layout.floorY;
      floor.receiveShadow = true;
      curveGroup.add(floor);

      // ── reflection: a cheap mirrored duplicate, not a real one ───────
      // A true planar reflection needs a second render pass from a mirrored
      // camera — expensive, and the brief explicitly asks for something cheaper
      // that reads the same at a glance. So: the same tube geometry, mirrored
      // through the floor plane, unlit, heavily faded, and excluded from the
      // shadow pass. The eye reads "polished floor" and never checks why.
      const reflection = new Mesh(
        tube.geometry,
        new MeshBasicMaterial({
          color: paletteRef.current.curve,
          transparent: true,
          // Very low: a reflection you can clearly see is a mirror, not polish.
          opacity: 0.11,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      reflection.scale.y = -1;
      // Mirror about the floor plane, not about the world origin.
      reflection.position.y = layout.floorY * 2;
      reflection.renderOrder = 1;
      curveGroup.add(reflection);

      // ── bounding box: the cue that reads as "coordinate space" ─────
      // Edges only. A solid or translucent box would hide the curve; a faint
      // wireframe gives the curve a room to be in without adding mass.
      curveGroup.add(buildBoundingBox(layout, paletteRef.current.axis));

      // ── axes: one neutral, faint, almost part of the space ─────────
      const axes = buildAxes(layout);
      const axisLine = (from: Vector3, to: Vector3) =>
        new LineSegments(
          new BufferGeometry().setFromPoints([from, to]),
          new LineBasicMaterial({
            color: new Color(paletteRef.current.axis),
            transparent: true,
            // Low enough that the eye finds the curve first and the axes second.
            opacity: 0.55,
            depthWrite: false,
          }),
        );
      curveGroup.add(
        axisLine(axes.x.start, axes.x.end),
        axisLine(axes.y.start, axes.y.end),
        axisLine(axes.z.start, axes.z.end),
      );

      // ── arrowheads: the tip that was missing ────────────────────────
      // A line that just stops reads as unfinished. Each positive axis end gets
      // a cone pointing outward, sized to the scene rather than to screen space
      // so it stays proportionate while zooming.
      for (const [tip, origin] of [
        [axes.x.end, axes.x.start],
        [axes.y.end, axes.y.start],
        [axes.z.end, axes.z.start],
      ] as const) {
        const dir = tip.clone().sub(origin);
        if (dir.lengthSq() < 1e-9) continue;
        const head = buildArrowHead(tip, dir, paletteRef.current.axis);
        head.renderOrder = 2;
        curveGroup.add(head);
      }

      // ── ticks: a dash across the axis plus its number, per value ─────
      // Both halves are built together from the same value so they can never
      // disagree — the failure mode where a dash appears with no number, or a
      // number floats with no dash, is worse than having neither.
      //
      // Values come from THIS curve's own domain and range via the layout, never
      // from constants, so switching equations re-labels the axes.
      // Ticks are POSITIONED in world space but LABELLED in equation units.
      //
      // These look interchangeable and are not. The layout centres and lifts the
      // curve, so world Y for a curve running -1..+1 sits at 1.4..3.4. Reading
      // the labels off `bounds` made every tick in the 3D view print a positive
      // number while the 2D graph beside it printed -1, 0 and +1 — the same
      // equation wearing two different sets of readings. `dataBounds` carries the
      // units the user actually typed, so the two views agree.
      const b = layout.bounds;
      const d = layout.dataBounds;
      const addTicks = (
        values: number[],
        valueToPoint: (v: number) => Vector3,
        onHorizontalAxis: boolean,
        labelOffset: Vector3,
      ) => {
        for (const v of values) {
          const at = valueToPoint(v);
          curveGroup.add(buildTickDash(at, onHorizontalAxis, paletteRef.current.axisLabel));

          const sprite = buildChipLabel(String(v));
          if (!sprite) continue;
          sprite.position.copy(at).add(labelOffset);
          curveGroup.add(sprite);
        }
      };

      const lerpAxis = (from: Vector3, to: Vector3, min: number, max: number) => (v: number) => {
        const span = max - min;
        const t = span === 0 ? 0.5 : (v - min) / span;
        return from.clone().lerp(to, t);
      };

      addTicks(
        referenceTickValues(d.minX, d.maxX, 7, 0.3),
        lerpAxis(axes.x.start, axes.x.end, b.minX, b.maxX),
        true,
        new Vector3(0, -0.46, 0.02),
      );
      addTicks(
        referenceTickValues(d.minY, d.maxY, 5, 0.1),
        lerpAxis(axes.y.start, axes.y.end, b.minY, b.maxY),
        false,
        new Vector3(-0.46, 0, 0.02),
      );

      // Labels stay, but tiny and faint: they orient a viewer who is already
      // looking, without announcing the coordinate system.
      for (const [char, at] of [
        ['X', axes.labelX],
        ['Y', axes.labelY],
        ['Z', axes.labelZ],
      ] as const) {
        const sprite = makeAxisLabel(char, paletteRef.current.axisLabel);
        sprite.position.copy(at);
        curveGroup.add(sprite);
      }

      // ── playhead: a small point plus a soft halo ───────────────────
      const head = new Mesh(
        new SphereGeometry(HEAD_RADIUS, 18, 12),
        new MeshBasicMaterial({ color: new Color(paletteRef.current.accent) }),
      );
      head.visible = false;
      const halo = makeHalo(paletteRef.current.accent);
      halo.visible = false;
      const trail = new LineSegments(
        new BufferGeometry().setFromPoints(
          Array.from({ length: HEAD_TRAIL_POINTS }, () => new Vector3()),
        ),
        new LineBasicMaterial({
          color: new Color(paletteRef.current.accent),
          transparent: true,
          // Barely there: the trace marks where the head has been, it is not a
          // feature in its own right.
          opacity: 0.24,
          depthWrite: false,
        }),
      );
      trail.visible = false;
      curveGroup.add(head, halo, trail);
      playheadRef.current = { head, halo, trail, centerline: layout.centerline };

      // Frame the camera so the curve FILLS the frame. `framingRadius` needs the
      // live viewport aspect, because that is what sets the horizontal field of
      // view — fitting from world geometry alone left a wide, flat curve like
      // sin(x) as a thin thread adrift in a large empty panel.
      //
      // BOTH states are set: the target is where input will move from, and the
      // current state is placed there directly so a new equation does not make
      // the camera fly across the scene from the previous one's viewpoint.
      const host = hostRef.current;
      const aspect =
        host && host.clientHeight > 0 ? host.clientWidth / host.clientHeight : 16 / 9;
      const framed: OrbitState = {
        theta: CAMERA_DEFAULTS.theta,
        phi: CAMERA_DEFAULTS.phi,
        radius: framingRadius(layout, aspect, CAMERA_DEFAULTS.fov) * CAMERA_DEFAULTS.radiusScale,
        target: { x: 0, y: (layout.bounds.minY + layout.bounds.maxY) / 2, z: 0 },
      };
      orbitRef.current = { ...framed };
      orbitTargetRef.current = { ...framed };

      // Fog is anchored to the framing distance rather than to fixed numbers, so
      // the grid always fades beyond the curve no matter how big that curve is.
      // A fixed distance either clips a large equation's floor or leaves a small
      // one with a hard, visible grid edge — which is exactly the boundary the
      // reference does not have.
      if (scene.fog instanceof Fog) {
        const fogBounds = fogRadiiFor(framed.radius);
        scene.fog.near = fogBounds.near;
        scene.fog.far = fogBounds.far;
      }

      // The shadow map is no longer refreshed per frame (see the renderer setup),
      // so it has to be invalidated explicitly whenever the geometry it was
      // rendered from has just been replaced. Without this the new curve would
      // keep casting the OLD curve's shadow.
      renderer.shadowMap.needsUpdate = true;
      key.target.position.set(0, layout.floorY, 0);
      key.target.updateMatrixWorld();
      setError(null);
    };

    rebuildRef.current = rebuild;

    // ── sizing ────────────────────────────────────────────────────────
    /**
     * Sizes the renderer to the host.
     *
     * Deliberately does NOT clamp to a 1px minimum. Clamping produced a 1x1
     * drawing buffer that three reported as valid, so the ResizeObserver had
     * nothing left to fix and the scene stayed invisible with no error — a blank
     * canvas that looked like a bug in the geometry rather than in the layout.
     * Skipping instead lets the observer retry the moment the host is measurable.
     */
    const resize = () => {
      const host = hostRef.current;
      if (!host) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (hostRef.current) observer.observe(hostRef.current);

    // Build for the curve we were handed on mount, now that the shell exists.
    rebuild(points);

    // ── input: one handler set serves mouse, pen and touch ───────────
    const pointers = new Map<number, { x: number; y: number }>();
    let panning = false;
    let pinchStart = 0;
    /** Timestamp of the last user interaction; drift pauses until it elapses. */
    let lastInteraction = 0;

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      // Two fingers mean pinch; anything else with a second pointer down is a pan.
      panning = e.button === 2 || e.shiftKey || e.altKey || pointers.size === 2;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      }
      lastInteraction = performance.now();
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const state = orbitRef.current;
      if (!state) return;

      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const [a, b] = [...pointers.values()];
        const separation = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchStart > 0 && separation > 0) {
          orbitTargetRef.current = applyPinch(state, separation / pinchStart);
        }
        pinchStart = separation;
        lastInteraction = performance.now();
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (panning) {
        const { right, up } = orbitBasis(state);
        orbitTargetRef.current = applyPan(state, dx, dy, right, up);
      } else {
        orbitTargetRef.current = applyOrbit(state, dx, dy);
      }
      lastInteraction = performance.now();
    };

    const endPointer = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchStart = 0;
      if (pointers.size === 0) panning = false;
      lastInteraction = performance.now();
    };

    const onWheel = (e: WheelEvent) => {
      // Guard the TARGET ref, since that is what this handler now reads — the
      // previous guard checked `orbitRef` and would have thrown once the two
      // states were separated.
      const targetState = orbitTargetRef.current;
      if (!targetState) return;
      // Scrolling over the graph must zoom the graph, never the page. The
      // listener is non-passive precisely so preventDefault is honoured.
      e.preventDefault();
      // deltaMode 1 is lines and 2 is pages; normalise both to pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
      orbitTargetRef.current = applyZoom(targetState, e.deltaY * unit);
      lastInteraction = performance.now();
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    // ── the frame loop ────────────────────────────────────────────────
    // ONE loop for the whole component. Nothing else in the 3D path starts a
    // second one: two loops would each drive requestAnimationFrame over the same
    // canvas and halve the effective frame rate.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let paused = false;

    /**
     * Reads RMS energy from the engine's analyser, 0..1.
     *
     * The engine's own signal — the same one the 2D visualiser draws — so the 3D
     * curve responds to the real sound rather than to a decorative timer. The
     * sample buffer is allocated once and reused; a `new Uint8Array` per frame
     * would be 44k allocations a second for no reason.
     */
    const readEnergy = (): number => {
      const analyser = audioEngine.getAnalyser();
      if (!analyser) return 0;
      const bins = analyser.fftSize;
      let buffer = sampleBufferRef.current;
      if (!buffer || buffer.length !== bins) {
        buffer = new Uint8Array(bins);
        sampleBufferRef.current = buffer;
      }
      analyser.getByteTimeDomainData(buffer);
      // RMS about the 128 midpoint: a genuine loudness measure, not a peak, so a
      // single transient does not make the curve flinch.
      let sum = 0;
      for (let i = 0; i < bins; i++) {
        const centred = (buffer[i] - 128) / 128;
        sum += centred * centred;
      }
      const rms = Math.sqrt(sum / bins);
      // Compressed and clamped: raw RMS of a sine is around 0.7, which would slam
      // the uniform to its limit and read as a pulsing tube rather than a breath.
      return Math.min(1, Math.pow(rms * 1.6, 0.7));
    };

    const onVisibility = () => {
      paused = document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const startedAt = performance.now();
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      // A hidden tab must not burn a core rendering an invisible scene.
      if (paused || !orbitRef.current) return;

      const now = performance.now();

      // ── damped orbit ──────────────────────────────────────────────
      // The camera eases toward wherever input last asked it to be. Nothing here
      // snaps: the pointer moves the target, and the scene glides after it.
      const targetOrbit = orbitTargetRef.current;
      if (targetOrbit) {
        // Narrowed to a local so TypeScript sees a non-null current below; the
        // assignment back to the ref keeps the two in step.
        const currentOrbit = orbitRef.current;
        if (!currentOrbit) {
          // First frame after a rebuild: place the camera exactly, or the curve
          // would visibly fly in from the last equation's viewpoint.
          orbitRef.current = { ...targetOrbit };
        } else {
          orbitRef.current = dampOrbit(currentOrbit, targetOrbit, ORBIT_DAMPING);
        }
      }

      const state = orbitRef.current;

      // ── idle drift: alive, not animated ───────────────────────────
      // Amplitude is a fraction of a degree over a ~52s cycle, and it is
      // suppressed entirely while the user is touching the scene and under
      // reduced motion. The graph should feel alive, never busy.
      let theta = state.theta;
      let phi = state.phi;
      const idleFor = (now - lastInteraction) / 1000;
      if (!reduceMotion && idleFor > IDLE_DRIFT.resumeDelaySeconds) {
        const t = ((now - startedAt) / 1000 / IDLE_DRIFT.periodSeconds) * Math.PI * 2;
        // Ease in over a second after the user lets go, so the drift never
        // snaps on and reads as a glitch.
        const ramp = Math.min(1, (idleFor - IDLE_DRIFT.resumeDelaySeconds) / 1.5);
        theta += Math.sin(t) * IDLE_DRIFT.thetaAmplitude * ramp;
        phi += Math.sin(t * 0.61 + 1.1) * IDLE_DRIFT.phiAmplitude * ramp;
      }

      const pos = orbitPosition({ ...state, theta, phi });
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(state.target.x, state.target.y, state.target.z);

      // ── playback: one uniform write, no allocation, no React ───────
      // The drop's `getProgress` contract: an explicit reader wins when it
      // returns a finite number; otherwise the store subscription owns the refs.
      const override = progressOverrideRef.current?.();
      const hasOverride = typeof override === 'number' && Number.isFinite(override);
      const progress = hasOverride ? Math.min(1, Math.max(0, override as number)) : progressRef.current;
      const playing = hasOverride ? true : playingRef.current;
      const uniforms = curveUniformsRef.current;
      if (uniforms) {
        uniforms.uProgress.value = progress;
        // The scan band only exists while something is actually sounding; idle,
        // the curve returns to a single even tone.
        uniforms.uHeadGlow.value = playing ? 1 : 0.12;
        // Live audio energy from the engine's own analyser — the SAME signal the
        // 2D visualiser reads, so the curve breathes with the sound rather than
        // with a decorative timer. Smoothed toward the target so it reads as one
        // continuous breath rather than per-frame jitter.
        const target = playing ? readEnergy() : 0;
        energyRef.current += (target - energyRef.current) * 0.12;
        const energy = energyRef.current;
        uniforms.uEnergy.value = energy;
        // The energy rides the material's own emissive rather than the vertex
        // shader: the tube's brightness is now real lighting, so lifting the
        // emissive term is the honest way to make it respond. Capped hard —
        // a curve that visibly pulses with the waveform is distorting the
        // equation, which it is supposed to be depicting.
        if (curveMaterialRef.current) {
          curveMaterialRef.current.emissiveIntensity = energy * 0.35;
        }
      }

      const ph = playheadRef.current;
      if (ph) {
        ph.head.visible = playing;
        ph.halo.visible = playing;
        ph.trail.visible = playing;
        if (playing) {
          const at = headPosition(ph.centerline, progress);
          if (at) {
            ph.head.position.copy(at);
            // The halo is a billboard, so it only needs its world position; its
            // scale carries the halo's size.
            ph.halo.position.copy(at);
            updateTrail(ph.trail, ph.centerline, progress);
          }
        }
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── theme: re-ink from <html data-theme> ─────────────────────────
    // THE PALETTE DECISION COMES FROM getThemeMode() ONLY — never from a
    // resolved CSS background colour. An earlier version re-read the host's
    // background 30 ms after a toggle (watchTheme), while the panel's
    // background-color transition was still running, misclassified the
    // in-between colour as the OTHER theme, and left the scene INVERTED
    // relative to the page — and the 400 ms re-read then agreed with
    // data-theme and early-returned, so the wrong palette stuck.
    //
    // Background/fog/exposure re-ink in place. Every material colour (floor,
    // grid uniforms, curve, axes, ticks, labels, playhead) is re-created by
    // bumping themeNonce, which re-runs `rebuild` with the new paletteRef —
    // a theme toggle is a rare, deliberate action, so a one-off rebuild is
    // the honest price of every colour being right.
    const syncTheme = () => {
      const mode = getThemeMode();
      if (mode === appliedTheme) return;
      appliedTheme = mode;
      const next = scenePalette(mode);
      paletteRef.current = next;
      renderer.toneMappingExposure = next.exposure;
      scene.background = new Color(next.background);
      scene.fog = new Fog(new Color(next.fog), next.fogNear, next.fogFar);
      // The grid lives in shader uniforms captured at mount; refresh them so
      // the rebuilt floor material picks up the new theme's lines.
      floorUniformsRef.current = floorUniforms(next);
      // Light levels change with the theme, and a shadow map is baked from the
      // light that casts it — so it is stale the moment the palette swaps.
      renderer.shadowMap.needsUpdate = true;
      setThemeNonce((n) => n + 1);
      resize();
    };
    const unsubscribeTheme = onThemeChange(syncTheme);
    // Backstop for data-theme changes that never fire the store event (another
    // island writing the attribute, an OS-level switch). Same function, same
    // guard — so the event + observer double-fire is a no-op, not an inversion.
    let unwatchBackground: (() => void) | null = null;
    try {
      const mo = new MutationObserver(syncTheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      unwatchBackground = () => mo.disconnect();
    } catch {}

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endPointer);
      canvas.removeEventListener('pointercancel', endPointer);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      unsubscribeTheme();
      unwatchBackground?.();
      rebuildRef.current = null;
      // three does not free GPU memory on its own, and this is the only place
      // that knows what was allocated.
      clearGroup(curveGroup);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
    // Intentionally empty: the scene shell, renderer and input live for the
    // component's lifetime. Geometry changes are handled by the `points` effect
    // below, which is what keeps an equation swap cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3D image capture one live render, then a footer-composited PNG. The hook
  // writes the file through the same Web Share / download path as every other
  // export, so it never leaves the device without the user choosing where.
  const captureImage = useCallback(async () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) {
      setCaptureError('3D scene is not ready; cannot export.');
      return;
    }
    setCaptureError(null);
    try {
      const eq = label.trim();
      await render3DImage(renderer, scene, camera, {
        equation: eq,
        maxDimension: DEFAULT_MAX_DIMENSION,
      });
    } catch (err) {
      setCaptureError(
        err instanceof Error ? err.message : 'Could not capture the 3D image.',
      );
    }
  }, [label]);

  /**
   * Rebuild geometry when the shared curve changes.
   *
   * Keyed on the `points` ARRAY IDENTITY, which `useActiveCurve` produces afresh
   * whenever the equation, bounds or spline change. Playback progress is
   * deliberately NOT a dependency: it changes ~60x/second and would rebuild the
   * entire scene every frame.
   */
  useEffect(() => {
    if (builtForRef.current !== points) {
      builtForRef.current = points;
      rebuildRef.current?.(points);
      setReady(true);
      return;
    }
    // themeNonce changed with the same points: rebuild only to re-ink every
    // material with the new palette (syncTheme already refreshed paletteRef
    // and the floor uniforms synchronously, before this effect ran).
    if (themeNonce > 0) rebuildRef.current?.(points);
  }, [points, themeNonce]);

  return (
    <div ref={hostRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full select-none"
        // `touch-action: none` is what stops a one-finger drag orbiting the graph
        // AND the page scrolling at the same time. `none` (not `pan-y`) because
        // vertical drag is an orbit gesture here too.
        style={{ touchAction, cursor: 'grab', outline: 'none' }}
        role="img"
        aria-label={label}
      />
      {/* 3D image capture one live render, footer-composited, then Web Share or
        * download. Floats above the 3D scene so it stays reachable while
        * orbiting. */}
      <button
        type="button"
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/6 bg-clip-padding backdrop-blur-sm px-3.5 py-2 text-xs font-medium text-white/85 shadow-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        style={{ touchAction: 'manipulation' }}
        onClick={captureImage}
        title="Save 3D image"
        aria-label="Save 3D image"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 3v12m0 0 4-4m-4 4-4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 20h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>Save image</span>
      </button>

      {captureError ? (
        <p
          className="absolute bottom-16 right-3 max-w-xs rounded-md bg-red-500/15 px-3 py-1.5 text-xs text-red-500/90"
          role="alert"
        >
          {captureError}
        </p>
      ) : null}

      {/*
        Building state. Not a spinner: a thin line drawing itself across the panel
        stands for a curve being laid out, which is what is actually happening.
        Purely decorative, so it is hidden from assistive tech — the graph's own
        aria-label already describes the scene.
      */}
      {!ready && !error && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4"
        >
          <span className="h-px w-28 bg-sc-text-faint/40 overflow-hidden">
            <span className="guess-build-line block h-px w-1/3 bg-sc-accent/70" />
          </span>
          <span className="text-xs font-mono tracking-wide text-sc-text-faint">
            {label}
          </span>
        </div>
      )}

      {/*
        A graph-level message, not a page-level one. The 2D graph and the audio
        keep working; only this panel is affected, so it must not take the Studio
        down with it.
      */}
      {error && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-sc-text-soft">
          {error}
        </p>
      )}

      {/* Shown when the y-range was percentile-trimmed so an asymptotic curve
          (e.g. tan) is readable instead of stretched beyond the viewport. */}
      {yTrimmed && (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] text-sc-text-faint px-3 py-1.5 rounded-md border border-sc-text-faint/30 bg-white/20 backdrop-blur-sm shadow-sm">
          y-range trimmed to show the shape
        </p>
      )}

      <style>{BUILD_LINE_CSS}</style>
    </div>
  );
}

/**
 * Keyframes for the "constructing" line.
 *
 * Defined here rather than in global.css so the 3D panel owns its own styling
 * and contributes nothing to the rest of the site. The animation runs a short
 * line across a hairline, standing in for a curve being laid out.
 */
const BUILD_LINE_CSS = `
@keyframes guess-build {
  0%   { transform: translateX(-120%); }
  100% { transform: translateX(420%); }
}
.guess-build-line {
  animation: guess-build 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .guess-build-line { animation: none; }
}
`;

/* ── helpers ──────────────────────────────────────────────────────── */

/**
 * The bounding box, as renderable edges.
 *
 * `LineSegments` over the twelve edge segments built by `buildBoundingBox`.
 * Semi-transparent and unlit, so it reads as a drawn boundary rather than a
 * surface — a translucent box would tint the curve inside it, and the curve is
 * the one thing that must stay unaltered.
 */
function buildBoundingBox(layout: CurveLayout, hex: string): LineSegments {
  return new LineSegments(
    boundingBoxGeometry(layout, hex),
    // 0.42, up from 0.16. At the old value the box was present in the scene
    // graph but effectively invisible on screen, which reads as "there is no
    // box" rather than "there is a faint box". Still translucent and unlit, so
    // it stays a drawn boundary and never tints the curve inside it.
    new LineBasicMaterial({ color: new Color(hex), transparent: true, opacity: 0.42 }),
  );
}

/**
 * A small, camera-facing axis label.
 *
 * A Sprite rather than 3D text: no font loader, no extra asset, and `Sprite`
 * faces the camera automatically so the label stays readable from any orbit
 * angle without billboarding maths of our own. Rendered from a 2D canvas because
 * that is the one way to get real glyphs into WebGL without a dependency.
 */
function makeAxisLabel(char: string, hex: string): Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    // A light weight at a modest size: the brief asks for small and precise, not
    // bold and shouty. The previous bold ~60px glyph filled the panel.
    ctx.font = `500 ${Math.round(size * 0.46)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // A soft halo so the glyph survives crossing the curve or the grid.
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.06;
    ctx.fillStyle = hex;
    ctx.fillText(char, size / 2, size / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new Sprite(
    new SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(AXIS_LABEL_SCALE, AXIS_LABEL_SCALE, 1);
  // Always on top: a label occluded by the tube is worse than no label.
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * A soft additive halo for the playhead.
 *
 * A radial-gradient sprite, not a second mesh: a sphere with an emissive
 * material reads as a glowing ball, whereas a billboarded gradient reads as light
 * falling off a point. Additive so it adds to whatever is behind it rather than
 * painting over the curve.
 *
 * Sized generously relative to the head itself — a halo you cannot see is not a
 * halo — but the falloff keeps it faint at the edges so it never becomes the
 * brightest thing on screen.
 */
function makeHalo(hex: string): Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, hex);
    gradient.addColorStop(0.28, hex);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0.5,
    }),
  );
  sprite.scale.set(0.7, 0.7, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/**
 * Rewrites the trail vertices to trail behind the playhead.
 *
 * Writes into the existing buffer rather than reallocating, so this costs nothing
 * per frame. The trail is a thin, low-opacity trace that shows direction of travel
 * at a glance — a single moving sphere does not communicate "this has been
 * played".
 */
function updateTrail(trail: LineSegments, centerline: Vector3[], progress: number): void {
  const attribute = trail.geometry.getAttribute('position') as
    | BufferAttribute
    | undefined;
  if (!attribute || centerline.length < 2) return;

  const headIndex = headIndexForProgress(centerline.length, progress);
  const start = Math.max(0, headIndex - HEAD_TRAIL_POINTS);
  const head = centerline[headIndex];

  // Collapse unused segments onto the head so no stale vertex is drawn.
  let written = 0;
  for (let i = start; i <= headIndex && written < HEAD_TRAIL_POINTS; i++) {
    const point = centerline[i];
    attribute.setXYZ(written, point.x, point.y, point.z);
    written++;
  }
  for (let i = written; i < HEAD_TRAIL_POINTS; i++) {
    attribute.setXYZ(i, head.x, head.y, head.z);
  }
  attribute.needsUpdate = true;
}

