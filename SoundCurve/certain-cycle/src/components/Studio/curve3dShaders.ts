/**
 * Shader injection for the 3D scene.
 *
 * Everything here is `onBeforeCompile` patches on stock THREE materials rather
 * than custom ShaderMaterials. That is deliberate: a raw ShaderMaterial has to
 * re-implement lighting, fog and tone mapping by hand, and any drift between it
 * and the rest of the scene shows up as an object that looks pasted on. Patching
 * MeshStandardMaterial keeps the curve, the floor and the surface under one
 * lighting model, so the result reads as a single photograph rather than layers.
 *
 * It also buys the three headline features almost for free:
 *   - the played / unplayed split along the curve is ONE uniform per frame, not
 *     a geometry rebuild, so playback costs essentially nothing;
 *   - the grid is procedural in the fragment shader, so there is no grid texture
 *     to load and the lines stay one pixel wide at every zoom level;
 *   - distance fade is computed per fragment against the camera, so the grid and
 *     the ground dissolve into the depth of the scene.
 */
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type IUniform,
} from 'three';
import type { ScenePalette } from '../../utils/graph3dTheme';

/**
 * Anti-aliased grid line.
 *
 * `fwidth` gives the screen-space derivative, so a line is exactly one pixel
 * wide however far away it is — the usual failure of hand-rolled grids, where
 * distant lines alias into shimmer or vanish entirely.
 */
const GRID_GLSL = `
  float gridLine(float coord, float width) {
    float d = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(d / width, 1.0);
  }
`;

/** World position varying, shared by the floor and surface patches. */
const WORLD_VARYING = 'varying vec3 vWorldPos;';

/* ── the curve: a camera-facing luminous ribbon ────────────────────── */

export interface CurveUniforms {
  uProgress: IUniform<number>;
  uPlayed: IUniform<Color>;
  uUpcoming: IUniform<Color>;
  uAccent: IUniform<Color>;
  uHeadGlow: IUniform<number>;
  /** Live audio energy, 0..1. Drives a barely-perceptible breath in the stroke. */
  uEnergy: IUniform<number>;
  /** Stroke width in world units at one unit of distance. */
  uWidth: IUniform<number>;
}

/**
 * Patches a material so the curve renders as a thin thread of light.
 *
 * The expansion happens in the VERTEX shader: each vertex is pushed sideways
 * along `cross(tangent, viewDirection)`, which is the in-plane direction
 * perpendicular to the curve AND perpendicular to the eye. That makes the ribbon
 * face the camera from every angle without any CPU work, so orbiting costs
 * nothing and the stroke never turns edge-on and disappears.
 *
 * `uEnergy` widens the stroke by at most a few percent while the equation is
 * sounding. That is deliberately small: the brief asks the curve to feel alive,
 * not to distort. Anything larger would misrepresent the mathematics, and this
 * is a visualization of an equation first.
 */
/**
 * Patches the tube's material so playback is visible ON the curve itself.
 *
 * Deliberately minimal now. The previous pass drove a flat camera-facing ribbon
 * from a vertex shader that computed its own width, taper and cross-section
 * falloff. With a physically-based tube, all of that is the geometry's job and
 * doing it here would actively fight the lighting: the highlight has to come from
 * the real surface normal so it travels convincingly as the camera orbits, which
 * is the entire reason the tube is back.
 *
 * So this patch now only supplies what the geometry cannot know:
 *   - the played / upcoming colour split, from the shared playback progress;
 *   - a narrow emissive band at the playhead;
 *   - a very small energy response.
 *
 * `positionAlong` is a real attribute on the tube (written by `buildCurveTube`),
 * carrying the curve parameter, so it lines up exactly with the samples the audio
 * engine is scanning. That is what keeps the 3D playhead locked to the sound.
 */
export function applyCurveShader<T extends MeshStandardMaterial | MeshPhysicalMaterial>(
  material: T,
  uniforms: CurveUniforms,
): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WORLD_VARYING}
        attribute float positionAlong;
        varying float vAlong;`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n        vAlong = positionAlong;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WORLD_VARYING}
        varying float vAlong;
        uniform float uProgress;
        uniform vec3 uPlayed;
        uniform vec3 uUpcoming;
        uniform vec3 uAccent;
        uniform float uHeadGlow;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // 1.0 where the playhead has passed, 0.0 ahead of it. The not-yet-played
        // part of the equation stays present but recessive — dimming it to nothing
        // would stop the curve reading as a whole object.
        float played = smoothstep(uProgress - 0.0015, uProgress + 0.0015, vAlong);
        diffuseColor.rgb = mix(uUpcoming, uPlayed, played);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float playedE = smoothstep(uProgress - 0.0015, uProgress + 0.0015, vAlong);
        float headE = exp(-pow((vAlong - uProgress) * 190.0, 2.0));
        // Two contributions only: a faint lift along the travelled path, and one
        // narrow band at the scanning head. No general glow, no neon.
        totalEmissiveRadiance += uAccent * (playedE * 0.08 + headE * 1.2) * uHeadGlow;`,
      );
  };
  material.customProgramCacheKey = () => 'guess-curve-tube-v3';
  return material;
}

export interface FloorUniforms {
  uMinor: IUniform<Color>;
  uMajor: IUniform<Color>;
  uMinorOpacity: IUniform<number>;
  uMajorOpacity: IUniform<number>;
  uFadeEnd: IUniform<number>;
  uBase: IUniform<Color>;
  uCell: IUniform<number>;
}

/**
 * Injects the procedural grid into a material.
 *
 * Typed for `MeshBasicMaterial` because that is what the ground now uses: an
 * UNLIT plane carrying the background colour and the grid lines. Making it a
 * lit standard material was what produced the "coloured sheet" look — a surface
 * that catches a directional light has a gradient across it, and a gradient
 * across a big plane reads as a coloured floor no matter how you tint it.
 *
 * `MeshStandardMaterial` is also accepted, so a genuinely lit surface (a 3D
 * mathematical surface) can reuse the same grid if it ever needs one.
 */
export function applyFloorShader<T extends MeshBasicMaterial | MeshStandardMaterial>(
  material: T,
  uniforms: FloorUniforms,
): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_VARYING}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WORLD_VARYING}
        uniform vec3 uMinor;
        uniform vec3 uMajor;
        uniform float uMinorOpacity;
        uniform float uMajorOpacity;
        uniform float uFadeEnd;
        uniform vec3 uBase;
        uniform float uCell;
        ${GRID_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 g = vWorldPos.xz / uCell;
        float minor = max(gridLine(g.x, 1.0), gridLine(g.y, 1.0));
        vec2 g5 = g / 5.0;
        float major = max(gridLine(g5.x, 1.0), gridLine(g5.y, 1.0));

        // Distance from the camera across the ground plane, so the grid thins
        // into the scene instead of stopping at a visible edge.
        float dist = length(vWorldPos.xz - cameraPosition.xz);
        float fade = 1.0 - smoothstep(uFadeEnd * 0.3, uFadeEnd, dist);

        vec3 gridColor = mix(uMinor, uMajor, major);
        float strength = max(minor * uMinorOpacity, major * uMajorOpacity);
        diffuseColor.rgb = mix(uBase, gridColor, strength * fade);`,
      );
  };
  material.customProgramCacheKey = () => 'guess-floor-grid-v1';
  return material;
}

/* ── surfaces ──────────────────────────────────────────────────────── */

export interface SurfaceUniforms {
  uContour: IUniform<Color>;
  uContourStrength: IUniform<number>;
  uContourFreq: IUniform<number>;
}

/**
 * Adds contour banding to a surface.
 *
 * Contour lines are level curves of z, which is genuine mathematical structure
 * rather than decoration: the eye can read height straight off them. `fwidth`
 * keeps each line one pixel wide and prevents the moire that fixed-width bands
 * produce at a distance.
 */
export function applyContourShader(
  material: MeshStandardMaterial,
  uniforms: SurfaceUniforms,
): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLD_VARYING}`)
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${WORLD_VARYING}
        uniform vec3 uContour;
        uniform float uContourStrength;
        uniform float uContourFreq;
        ${GRID_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float level = vWorldPos.z * uContourFreq;
        float contour = gridLine(level, 1.2);
        diffuseColor.rgb = mix(diffuseColor.rgb, uContour, contour * uContourStrength);`,
      );
  };
  material.customProgramCacheKey = () => 'guess-surface-contour-v1';
  return material;
}

/* ── uniform factories ─────────────────────────────────────────────── */

/** Uniform set for a curve material, from a palette. */
export function curveUniforms(palette: ScenePalette): CurveUniforms {
  return {
    uProgress: { value: 0 },
    uPlayed: { value: new Color(palette.curve) },
    uUpcoming: { value: new Color(palette.curveDimmed) },
    uAccent: { value: new Color(palette.accent) },
    uHeadGlow: { value: 1 },
    uEnergy: { value: 0 },
    // Stroke half-width per unit of distance. Deliberately small: this is a
    // thread of light, and the previous tube radius read as a pipe.
    uWidth: { value: 0.0022 },
  };
}

/** Uniform set for the ground plane, from a palette. */
export function floorUniforms(palette: ScenePalette): FloorUniforms {
  return {
    uMinor: { value: new Color(palette.gridMinor) },
    uMajor: { value: new Color(palette.gridMajor) },
    uMinorOpacity: { value: palette.gridMinorOpacity },
    uMajorOpacity: { value: palette.gridMajorOpacity },
    uFadeEnd: { value: palette.gridFadeEnd },
    uBase: { value: new Color(palette.floor) },
    uCell: { value: 1 },
  };
}

/** Uniform set for a surface, from a palette. */
export function surfaceUniforms(palette: ScenePalette): SurfaceUniforms {
  return {
    uContour: { value: new Color(palette.contour) },
    uContourStrength: { value: 0.85 },
    uContourFreq: { value: 0.55 },
  };
}
