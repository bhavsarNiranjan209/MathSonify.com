/**
 * Curve3DViewer — drop-in replacement for the current 3D viewer (same props + optional getProgress).
 *  - Negative values use the SAME affine map as positives; tick numbers come from the shared
 *    plotMath used by the 2D graph, so both views always agree.
 *  - Light mode has NO filled base: the floor is a shadow-catcher + black grid lines.
 *  - Tall / wide / asymptotic curves are normalised (no NaN geometry, never a blank canvas).
 *  - Curve draws itself in while playing (ghost curve + bright traced tube), parametrised by
 *    sample index so it matches the 2D graph and audio playhead exactly.
 *  - Renders only when something changed; pauses when off-screen. Idle cost ~0 GPU.
 *
 * Playback is read through `getProgress` (called every frame, no React re-renders):
 *   getProgress={() => { const s = useStudioStore.getState(); return s.isPlaying ? s.progress : null; }}
 * (adjust the two field names to your store). Return null/undefined when idle.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { computeView, formatTick, type View, type XY } from '../../utils/plotMath';
import { resolveBackground, watchTheme, type BgInfo } from '../../utils/themeWatch';

export interface Curve3DViewerProps {
  points: XY[];
  label?: string;
  getProgress?: () => number | null | undefined;
  /** 'none' (default): one finger orbits, page never scrolls. 'pan-y': vertical drags scroll the page
   *  and mouse-wheel zoom needs Ctrl/Cmd (so an embedded card never hijacks page scroll). */
  touchAction?: 'none' | 'pan-y';
  className?: string;
}

const W3 = 8, H3 = 4, D3 = 3; // plot box in scene units

const PAL = {
  dark: {
    tube: 0xffffff, emissive: 0x9db4ff, emissiveI: 0.22, metal: 0.5, rough: 0.22,
    axis: 0xe8e8ea, grid: 0xffffff, gridOp: 0.12, wallOp: 0.08, box: 0x6a6a74, boxOp: 0.6,
    text: '#F2F2F0', tick: '#C3C6CD', chip: 'rgba(10,10,12,0.82)', head: 0xffffff, floor: 0x0a0a0c,
    key: 1.3, fill: 0.5, rim: 0.4, amb: 0.55,
  },
  light: {
    tube: 0x14161a, emissive: 0x000000, emissiveI: 0, metal: 0.25, rough: 0.35,
    axis: 0x14161a, grid: 0x14161a, gridOp: 0.38, wallOp: 0.22, box: 0x14161a, boxOp: 0.55,
    text: '#14161A', tick: '#2b2e35', chip: 'rgba(255,255,255,0.9)', head: 0x14161a, floor: 0,
    key: 1.6, fill: 0.5, rim: 0.3, amb: 0.9,
  },
} as const;
type Pal = typeof PAL.dark | typeof PAL.light;

type SceneApi = {
  setPoints(p: XY[]): { ok: boolean; clipped: boolean };
  setTouchAction(t: 'none' | 'pan-y'): void;
  destroy(): void;
};

export default function Curve3DViewer({ points, label, getProgress, touchAction = 'none', className }: Curve3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const progressRef = useRef(getProgress);
  progressRef.current = getProgress;
  const [problem, setProblem] = useState<string | null>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const mount = mountRef.current!;
    try {
      apiRef.current = createScene(mount, () => progressRef.current?.(), touchAction, (m) => setProblem(m));
    } catch (e) {
      console.error('[Curve3DViewer] could not start WebGL', e);
      setProblem('3D view unavailable on this device.');
    }
    return () => { apiRef.current?.destroy(); apiRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const r = api.setPoints(points);
      setClipped(r.clipped);
      setProblem(r.ok ? null : '3D view unavailable for this equation (nothing drawable in range).');
    } catch (e) {
      console.error('[Curve3DViewer] build failed', e);
      setProblem('3D view unavailable for this equation.');
    }
  }, [points]);

  useEffect(() => { apiRef.current?.setTouchAction(touchAction); }, [touchAction]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 160 }}
         role="img" aria-label={label ? `3D view of ${label}` : '3D graph'}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      {problem && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 16, fontSize: 13, opacity: 0.8 }}>
          {problem}
        </div>
      )}
      {clipped && !problem && (
        <div style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 11, opacity: 0.6, pointerEvents: 'none' }}>
          y-range trimmed to show the shape
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function disposeTree(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (!o.isSprite && o.geometry) o.geometry.dispose(); // sprites share one internal geometry
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
  });
}
function srgb(tex: THREE.Texture) {
  const t: any = tex, T: any = THREE;
  if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; else t.encoding = T.sRGBEncoding;
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function createScene(
  mount: HTMLElement,
  readProgress: () => number | null | undefined,
  initialTouch: 'none' | 'pan-y',
  onProblem: (msg: string | null) => void,
): SceneApi {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
  canvas.style.touchAction = initialTouch;
  mount.appendChild(canvas);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { canvas.remove(); throw e; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // transparent: the card's own background shows through
  const ra: any = renderer, T: any = THREE;
  if ('outputColorSpace' in ra) ra.outputColorSpace = T.SRGBColorSpace; else ra.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const K = parseInt(THREE.REVISION, 10) >= 155 ? Math.PI : 1; // light units changed in r155

  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(5, 8, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
  const sh = key.shadow.camera as THREE.OrthographicCamera;
  sh.left = -8; sh.right = 8; sh.top = 8; sh.bottom = -8; sh.near = 1; sh.far = 30;
  const fill = new THREE.DirectionalLight(0x9db4ff, 1); fill.position.set(-6, 3, -4);
  const rim = new THREE.DirectionalLight(0xffe2c4, 1); rim.position.set(4, -1, 6);
  const amb = new THREE.HemisphereLight(0xffffff, 0x445066, 1);
  scene.add(key, fill, rim, amb);

  const data = new THREE.Group();
  scene.add(data);

  let points: XY[] = [];
  let view: View | null = null;
  let bg: BgInfo = resolveBackground(mount);
  let segs: { start: number; end: number; curve: THREE.CatmullRomCurve3; bright: THREE.Mesh; ghost: THREE.Mesh }[] = [];
  let head: THREE.Mesh | null = null;
  const sprites: { s: THREE.Sprite; pxW: number; pxH: number }[] = [];

  const DEF = { theta: 0.62, phi: 1.18 };
  let theta = DEF.theta, tTheta = DEF.theta, phi = DEF.phi, tPhi = DEF.phi;
  let radius = 14, tRadius = 14, fitRadius = 14, userZoomed = false;
  const target = new THREE.Vector3(0, 0, 0);
  let touchAction = initialTouch;
  let needs = true, visible = true, lastP: number | null | undefined = undefined, raf = 0;

  function clearData() {
    while (data.children.length) { const c = data.children[0]; data.remove(c); disposeTree(c); }
    segs = []; head = null; sprites.length = 0;
  }
  function lines(arr: number[], color: number, opacity: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, toneMapped: false }));
  }
  function cone(at: THREE.Vector3, dir: THREE.Vector3, color: number) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 14), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.position.copy(at);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return m;
  }
  /** Text on a tightly-sized chip, shown at a CONSTANT on-screen size (tiny cards stay readable). */
  function label(text: string, pos: THREE.Vector3, kind: 'axis' | 'tick', anchor: [number, number], pal: Pal) {
    const texFont = kind === 'axis' ? 44 : 34, screenFont = kind === 'axis' ? 15 : 11;
    const c = document.createElement('canvas'), g = c.getContext('2d')!;
    const font = `600 ${texFont}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
    g.font = font;
    const tw = g.measureText(text).width;
    const cw = Math.ceil(tw + (kind === 'axis' ? 26 : 22)), ch = texFont + (kind === 'axis' ? 20 : 16);
    c.width = cw; c.height = ch;
    g.font = font;
    g.fillStyle = pal.chip; rr(g, 0, 0, cw, ch, Math.min(14, ch / 3)); g.fill();
    g.fillStyle = kind === 'axis' ? pal.text : pal.tick;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2 + 1);
    const tex = new THREE.CanvasTexture(c); srgb(tex); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: false, fog: false });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos); s.center.set(anchor[0], anchor[1]); s.renderOrder = 10;
    const k = screenFont / texFont;
    sprites.push({ s, pxW: cw * k, pxH: ch * k });
    data.add(s);
  }
  function layoutSprites() {
    const hpx = mount.clientHeight || 1;
    const k = (2 * Math.tan((camera.fov * Math.PI) / 360)) / hpx; // px -> sprite scale (constant screen size)
    const small = hpx < 260 ? 0.9 : 1;
    for (const o of sprites) o.s.scale.set(o.pxW * k * small, o.pxH * k * small, 1);
  }
  function applyLightsAndFog() {
    const pal = bg.dark ? PAL.dark : PAL.light;
    key.intensity = pal.key * K; fill.intensity = pal.fill * K; rim.intensity = pal.rim * K; amb.intensity = pal.amb * K;
    scene.fog = new THREE.Fog((bg.r << 16) | (bg.g << 8) | bg.b, fitRadius * 1.15, fitRadius * 3.0); // far grid fades into the card colour
  }

  function build(): { ok: boolean; clipped: boolean } {
    clearData();
    if (!points.length) return { ok: false, clipped: false };
    view = computeView(points, W3, H3);
    if (!view.segments.length) return { ok: false, clipped: view.clipped };
    const v = view;
    const pal: Pal = bg.dark ? PAL.dark : PAL.light;
    applyLightsAndFog();
    const X = (x: number) => v.toX(x) - W3 / 2;
    const Y = (y: number) => v.toY(y) - H3 / 2;
    const floorY = -H3 / 2;

    // FLOOR: dark = filled; light = shadow catcher only (NO filled base — just the lines below)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W3 + 2, D3 + 2),
      bg.dark ? new THREE.MeshStandardMaterial({ color: PAL.dark.floor, roughness: 0.95, metalness: 0.05 })
              : new THREE.ShadowMaterial({ opacity: 0.14 }),
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY - 0.01; floor.receiveShadow = true;
    data.add(floor);

    // GRID lines sit exactly on tick values (floor + back wall) so values can be read straight off the curve
    const fl: number[] = [], wl: number[] = [];
    for (const t of v.xTicks.ticks) {
      const sx = X(t);
      fl.push(sx, floorY, -D3 / 2, sx, floorY, D3 / 2);
      wl.push(sx, -H3 / 2, -D3 / 2, sx, H3 / 2, -D3 / 2);
    }
    for (let i = 0; i <= 4; i++) { const z = -D3 / 2 + (D3 * i) / 4; fl.push(-W3 / 2, floorY, z, W3 / 2, floorY, z); }
    for (const t of v.yTicks.ticks) { const sy = Y(t); wl.push(-W3 / 2, sy, -D3 / 2, W3 / 2, sy, -D3 / 2); }
    data.add(lines(fl, pal.grid, pal.gridOp), lines(wl, pal.grid, pal.wallOp));
    data.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W3, H3, D3)),
      new THREE.LineBasicMaterial({ color: pal.box, transparent: true, opacity: pal.boxOp, toneMapped: false })));

    // AXES through data zero: negative values visibly sit below / left of them
    const axY = Y(v.xAxisY), axX = X(v.yAxisX);
    data.add(lines([
      -W3 / 2, axY, 0, W3 / 2 + 0.25, axY, 0,
      axX, -H3 / 2, 0, axX, H3 / 2 + 0.25, 0,
      axX, axY, -D3 / 2, axX, axY, D3 / 2 + 0.25,
    ], pal.axis, 0.9));
    data.add(
      cone(new THREE.Vector3(W3 / 2 + 0.25, axY, 0), new THREE.Vector3(1, 0, 0), pal.axis),
      cone(new THREE.Vector3(axX, H3 / 2 + 0.25, 0), new THREE.Vector3(0, 1, 0), pal.axis),
      cone(new THREE.Vector3(axX, axY, D3 / 2 + 0.25), new THREE.Vector3(0, 0, 1), pal.axis),
    );
    label('x', new THREE.Vector3(W3 / 2 + 0.6, axY, 0), 'axis', [0.5, 0.5], pal);
    label('y', new THREE.Vector3(axX, H3 / 2 + 0.6, 0), 'axis', [0.5, 0.5], pal);
    label('z', new THREE.Vector3(axX, axY, D3 / 2 + 0.6), 'axis', [0.5, 0.5], pal);

    // TICKS: dash + number on the front-bottom and front-left box edges (never collide with the curve)
    const td: number[] = [];
    for (const t of v.xTicks.ticks) {
      const sx = X(t);
      td.push(sx, floorY, D3 / 2, sx, floorY - 0.09, D3 / 2);
      label(formatTick(t, v.xTicks.step), new THREE.Vector3(sx, floorY - 0.14, D3 / 2), 'tick', [0.5, 1], pal);
    }
    for (const t of v.yTicks.ticks) {
      const sy = Y(t);
      td.push(-W3 / 2, sy, D3 / 2, -W3 / 2 - 0.09, sy, D3 / 2);
      label(formatTick(t, v.yTicks.step), new THREE.Vector3(-W3 / 2 - 0.14, sy, D3 / 2), 'tick', [1, 0.5], pal);
    }
    data.add(lines(td, pal.axis, 0.8));

    // CURVE: one tube per continuous segment, parametrised by sample INDEX (not arc length)
    for (const seg of v.segments) {
      const stride = Math.max(1, Math.ceil((seg.end - seg.start + 1) / 900));
      const vecs: THREE.Vector3[] = [];
      for (let i = seg.start; i <= seg.end; i += stride) vecs.push(new THREE.Vector3(X(points[i].x), Y(points[i].y), 0));
      if ((seg.end - seg.start) % stride !== 0) vecs.push(new THREE.Vector3(X(points[seg.end].x), Y(points[seg.end].y), 0));
      if (vecs.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(vecs, false, 'centripetal');
      (curve as any).getUtoTmapping = (u: number) => u;
      const n = Math.min(1200, (vecs.length - 1) * 2);
      const bright = new THREE.Mesh(
        new THREE.TubeGeometry(curve, n, 0.04, 10, false),
        new THREE.MeshPhysicalMaterial({
          color: pal.tube, emissive: pal.emissive, emissiveIntensity: pal.emissiveI,
          metalness: pal.metal, roughness: pal.rough, clearcoat: 0.6, clearcoatRoughness: 0.25,
        }),
      );
      bright.castShadow = true;
      const ghost = new THREE.Mesh(
        new THREE.TubeGeometry(curve, Math.min(600, n), 0.016, 6, false),
        new THREE.MeshBasicMaterial({ color: pal.tube, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }),
      );
      ghost.visible = false;
      data.add(ghost, bright);
      segs.push({ start: seg.start, end: seg.end, curve, bright, ghost });
    }
    if (!segs.length) return { ok: false, clipped: v.clipped };

    head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 18), new THREE.MeshBasicMaterial({ color: pal.head, toneMapped: false }));
    head.visible = false; data.add(head);

    lastP = undefined; // force the progress state to be re-applied to the new meshes
    layoutSprites();
    needs = true;
    return { ok: true, clipped: v.clipped };
  }

  /** p === null -> idle: whole curve shown. 0..1 -> curve draws in up to p, ghost curve behind it. */
  function applyProgress(p: number | null) {
    const idle = p === null || p >= 1;
    const idx = idle ? Infinity : p! * (points.length - 1);
    let headPlaced = false;
    for (const s of segs) {
      const f = idle ? 1 : Math.min(1, Math.max(0, (idx - s.start) / Math.max(1, s.end - s.start)));
      const total = (s.bright.geometry.index as THREE.BufferAttribute).count;
      s.bright.geometry.setDrawRange(0, f >= 1 ? total : Math.floor((total * f) / 3) * 3);
      s.ghost.visible = !idle;
      if (!idle && head && !headPlaced && idx >= s.start && idx <= s.end) { head.position.copy(s.curve.getPointAt(f)); headPlaced = true; }
    }
    if (head) head.visible = headPlaced;
  }

  function layout() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (w < 2 || h < 2) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const R = Math.sqrt((W3 / 2 + 0.9) ** 2 + (H3 / 2 + 0.7) ** 2 + (D3 / 2 + 0.6) ** 2);
    fitRadius = R / Math.sin(Math.min(vfov, hfov) / 2);
    if (!userZoomed) { radius = tRadius = fitRadius; }
    tRadius = Math.min(fitRadius * 2.5, Math.max(fitRadius * 0.25, tRadius));
    layoutSprites(); applyLightsAndFog();
    needs = true;
  }

  const clampR = (r: number) => Math.min(fitRadius * 2.5, Math.max(fitRadius * 0.25, r));
  function zoomBy(f: number) { tRadius = clampR(tRadius * f); userZoomed = true; needs = true; }

  /* ---------- input: orbit / pan / pinch / wheel / double-click reset ---------- */
  const pointers = new Map<number, { x: number; y: number }>();
  let mode: 'orbit' | 'pan' = 'orbit', pinch = 0;
  const pinchDist = () => { const [a, b] = Array.from(pointers.values()); return Math.hypot(a.x - b.x, a.y - b.y); };
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mode = e.button === 2 || e.shiftKey ? 'pan' : 'orbit';
    if (pointers.size === 2) pinch = pinchDist();
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2) { const d = pinchDist(); if (pinch > 0 && d > 0) zoomBy(pinch / d); pinch = d; return; }
    if (mode === 'pan') {
      const k = 0.0018 * radius;
      target.x = Math.max(-4, Math.min(4, target.x - Math.cos(theta) * dx * k));
      target.z = Math.max(-4, Math.min(4, target.z + Math.sin(theta) * dx * k));
      target.y = Math.max(-3, Math.min(3, target.y + dy * k));
    } else {
      tTheta -= dx * 0.0075;
      tPhi = Math.min(Math.PI - 0.12, Math.max(0.12, tPhi - dy * 0.0075));
    }
    needs = true;
  };
  const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
  const onWheel = (e: WheelEvent) => {
    if (touchAction === 'pan-y' && !(e.ctrlKey || e.metaKey)) return; // embedded card: let the page scroll
    e.preventDefault();
    zoomBy(Math.exp(e.deltaY * 0.0015));
  };
  const onDbl = () => { tTheta = DEF.theta; tPhi = DEF.phi; target.set(0, 0, 0); userZoomed = false; tRadius = fitRadius; needs = true; };
  const noMenu = (e: Event) => e.preventDefault();
  const onLost = (e: Event) => { e.preventDefault(); onProblem('3D view paused (graphics context lost). Reload to restore.'); };
  const onRestored = () => { onProblem(null); needs = true; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('contextmenu', noMenu);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  let rs = 0;
  const ro = new ResizeObserver(() => { cancelAnimationFrame(rs); rs = requestAnimationFrame(layout); });
  ro.observe(mount);
  const io = new IntersectionObserver((en) => { visible = en[0]?.isIntersecting ?? true; if (visible) needs = true; });
  io.observe(mount);
  const refreshTheme = (info: BgInfo) => { bg = info; if (points.length) build(); needs = true; };
  const unwatch = watchTheme(mount, refreshTheme);
  const firstRead = window.setTimeout(() => refreshTheme(resolveBackground(mount)), 250); // CSS may not be applied yet at hydration

  /* ---------- render on demand: no idle animation, so an idle graph costs ~0 GPU ---------- */
  let last = performance.now();
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let changed = needs; needs = false;
    const k = 1 - Math.pow(0.82, dt * 60);
    if (Math.abs(tTheta - theta) > 1e-4 || Math.abs(tPhi - phi) > 1e-4 || Math.abs(tRadius - radius) > 1e-3) {
      theta += (tTheta - theta) * k; phi += (tPhi - phi) * k; radius += (tRadius - radius) * k; changed = true;
    }
    const raw = readProgress();
    const p = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : null;
    if (p !== lastP) { lastP = p; applyProgress(p); changed = true; }
    if (changed) {
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
      renderer.render(scene, camera);
    }
  }
  raf = requestAnimationFrame(tick);
  layout();

  return {
    setPoints(next) {
      points = next; userZoomed = false; tTheta = DEF.theta; tPhi = DEF.phi; target.set(0, 0, 0);
      layout();
      return build();
    },
    setTouchAction(t) { touchAction = t; canvas.style.touchAction = t; },
    destroy() {
      cancelAnimationFrame(raf); cancelAnimationFrame(rs);
      ro.disconnect(); io.disconnect(); unwatch(); clearTimeout(firstRead);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel); canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('contextmenu', noMenu);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      clearData(); scene.remove(data);
      renderer.dispose(); renderer.forceContextLoss(); // frees the GL context now (iOS caps live contexts)
      canvas.remove();
    },
  };
}
