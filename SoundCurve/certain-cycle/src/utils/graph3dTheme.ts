/**
 * Scene palette for the 3D graph, derived from the site's theme.
 *
 * WHY THIS EXISTS: the scene was previously hard-coded to dark greys
 * (`0x0b0d12` floor, `0x2b3340` grid, white curve). That looked correct in dark
 * mode and wrong in light mode, where a white curve on a white floor is
 * literally invisible.
 *
 * LIGHT MODE IS DESIGNED, NOT INVERTED. Inverting would give a black curve on a
 * near-black floor, which is the same invisibility with the sign flipped. So the
 * light scene is authored on its own terms: a warm paper-white ground, a near
 * black curve with real weight, a cool grey grid that recedes, and axes that are
 * present but quiet. Dark mode is the near-black instrument look the brand uses
 * elsewhere.
 *
 * Everything here is a plain, testable record — no THREE types — so the mapping
 * from theme to look can be asserted without a GPU.
 */
import type { ThemeMode } from './theme';

export interface ScenePalette {
  /** Clear colour and fog colour: the space the graph sits in. */
  background: string;
  fog: string;
  /** How far the fog has fully taken over, in world units. */
  fogNear: number;
  fogFar: number;

  /** The ground plane the curve floats above. */
  floor: string;
  /** Fine grid lines, and the stronger every-Nth division. */
  gridMinor: string;
  gridMajor: string;
  /** Peak alpha of each grid line. Minor must stay well under major. */
  gridMinorOpacity: number;
  gridMajorOpacity: number;
  /** Distance at which the grid has faded out completely. */
  gridFadeEnd: number;

  /** The mathematical object — the hero. */
  curve: string;
  /** Curve colour before the playhead has passed; dims the un-played part. */
  curveDimmed: string;

  /** Single restrained accent, used only for the playhead and its scan band. */
  accent: string;
  /** Axis lines and their labels. */
  axis: string;
  axisLabel: string;
  /** Surface fill (only drawn for genuine z = f(x,y)). */
  surface: string;
  /** Contour banding over that surface. */
  contour: string;

  ambient: number;
  key: number;
  rim: number;
  /** Warm secondary fill. Opens the shadow side so the curve keeps its form. */
  fill: number;
  /** Filmic tone mapping suits both modes; pure white in light clips. */
  exposure: number;
}

const DARK: ScenePalette = {
  background: '#07080a',
  fog: '#07080a',
  fogNear: 22,
  fogFar: 72,

  // The ground is NOT a lit surface. It is the background colour with grid lines
  // drawn on it, so nothing catches light and reads as a coloured sheet. Depth
  // comes from fog and perspective instead.
  floor: '#07080a',
  // Bright enough to actually read as graph paper at a glance. These were so
  // close to the background that the grid was effectively invisible.
  gridMinor: '#2b323c',
  gridMajor: '#49525f',
  gridMinorOpacity: 0.24,
  gridMajorOpacity: 0.46,
  gridFadeEnd: 46,

  // The hero: a soft thread, not white paint. Slightly warm so it does not read
  // as a blown-out highlight against the cool background.
  curve: '#e8e6e1',
  // The not-yet-played part of the SAME curve: present, but recessive. It must
  // never disappear, or the equation stops being a whole object.
  curveDimmed: '#7d838d',

  // The single accent in the whole scene, spent only on the playhead.
  accent: '#c9a24b',
  // SOFT GREY rules, not white. Pure white lines on a near-black ground read as
  // blown-out highlights and pull the eye off the curve; grey keeps the
  // coordinate system readable while letting the curve stay the brightest thing
  // in the scene.
  axis: '#868d99',
  axisLabel: '#a7aeb9',
  surface: '#14181e',
  contour: '#2c333d',

  // The curve is metallic (metalness 0.25) with no environment map, so it has
  // almost no diffuse response and relies on direct and ambient light alone.
  // At ambient 0.3 the tube rendered essentially black. These are the lights
  // doing the work the emissive term cannot.
  ambient: 0.95,
  key: 2.4,
  rim: 14,
  // Weak and warm: this light exists to keep the shadow side from going flat
  // black and losing its form, not to be noticed as a light.
  fill: 9,
  exposure: 1.15,
};

const LIGHT: ScenePalette = {
  // Warm off-white, not pure white: a pure white ground reads as an empty page,
  // a warm one reads as paper - which is where mathematics belongs.
  background: '#faf9f6',
  fog: '#faf9f6',
  fogNear: 26,
  fogFar: 82,

  floor: '#faf9f6',
  // Cool grey on a warm ground: neutral lines recede, warm lines compete.
  gridMinor: '#6e665e',
  // Dark enough to read as drawn ink on paper: black grid rules on a white
  // ground. Minor stays well under major so the page reads as paper first,
  // graph paper second, and the floor itself stays the paper colour (no dark
  // base competing with the curve).
  gridMajor: '#2a2622',
  gridMinorOpacity: 0.5,
  gridMajorOpacity: 0.85,
  gridFadeEnd: 58,

  // WHITE. The curve is the single most important colour in the scene, and it is
  // white in every mode and for every equation — not a themed accent, so
  // switching light/dark never changes what the maths itself looks like.
  //
  // This is not a flat white silhouette: the material carries metalness,
  // roughness and a clearcoat layer, so it renders as a lit form with a
  // travelling highlight and a shadowed side.
  curve: '#ffffff',
  // The not-yet-played part of the SAME curve: present, but recessive. It must
  // never disappear, or the equation stops being a whole object. Light enough to
  // stay visible against paper, dim enough to show the playhead's progress.
  curveDimmed: '#bdbab3',

  // The same restrained brass as dark mode: it must stay visible against both a
  // warm ground and a near-black one, and swapping it per theme would make the
  // playhead feel like a different object in each mode.
  accent: '#a8801f',
  // Near-black rules on paper. Graph paper is drawn in ink, not in a tint of the
  // paper — but these are LINES, not fills, so the page stays white underneath.
  axis: '#2a2622',
  axisLabel: '#3f3b36',
  surface: '#eceae4',
  contour: '#c8c4ba',

  ambient: 0.9,
  // Lower key in light: the ground is already bright, so a strong key would
  // wash out the very depth the scene depends on.
  key: 0.9,
  rim: 6,
  fill: 4,
  exposure: 0.98,
};

/** The scene palette for a mode. */
export function scenePalette(theme: ThemeMode): ScenePalette {
  return theme === 'light' ? LIGHT : DARK;
}

/**
 * Camera framing shared by both modes.
 *
 * Tuned to be readable the instant 3D opens: a three-quarter view with a modest
 * downward tilt, and enough distance that the whole curve fits with air around
 * it. The previous default sat almost level with the floor and closer in, which
 * flattened the curve and made it hard to read as a spatial object.
 */
export const CAMERA_DEFAULTS = {
  /** Azimuth, radians. Off-axis so the curve is seen in perspective, not head-on. */
  theta: 0.62,
  /** Polar angle from +Y. ~68 degrees: looking down gently, not straight down. */
  phi: 1.19,
  /**
 * Multiplier on the auto-fit distance.
 *
 * Kept close to 1: `framingRadius` now fits the curve to the viewport properly,
 * and a large margin on top of a correct fit is what produced the original
 * "tiny curve in a huge empty panel" look.
 *
 * 1.45, up from 1.04. At 1.04 the curve filled the frame edge to edge, which
 * reads as being zoomed INTO rather than as a scene you are looking at — and
 * that loses the whole point of entering 3D, since 2D already looked like that.
 * At 1.45 the cube, the axes and the tick labels all sit inside the frame, and
 * the first frame still reads much like the 2D view it replaced; orbiting from
 * there is what turns it into a 3D scene. Past roughly 1.6 the curve stops being
 * the subject and becomes a small object in a large empty panel.
 */
radiusScale: 1.45,
  /** Degrees. Longer lens than the previous 45 — less perspective distortion. */
  fov: 40,
} as const;

/**
 * Idle drift, in the smallest units that still read as motion.
 *
 * The brief is explicit: the user should barely notice it. These amplitudes are
 * fractions of a degree over ~50s cycles, so the graph is verifiably alive
 * without ever reading as a spinning demo. Scaled by zero under reduced motion.
 */
export const IDLE_DRIFT = {
  /** Radians of azimuthal sway (about 0.6 degrees). */
  thetaAmplitude: 0.011,
  /** Radians of polar sway — smaller still, so it does not bob. */
  phiAmplitude: 0.005,
  /** Seconds per full cycle. Slow enough to read as parallax, not animation. */
  periodSeconds: 52,
  /** Seconds to wait after the user lets go before resuming drift. */
  resumeDelaySeconds: 3.2,
} as const;
