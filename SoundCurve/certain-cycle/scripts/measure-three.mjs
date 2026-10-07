/**
 * Measures what `three` actually costs this project, rather than guessing from
 * its reputation for being huge.
 *
 * Three bundles two ways that matter here:
 *   - `subset` — exactly the named exports Curve3DViewer imports. This is what
 *     the viewer will cost if it ever ships.
 *   - `whole`  — `import * as THREE`, i.e. the "just import the library" mistake
 *     the brief explicitly rules out. The gap between the two is the
 *     tree-shaking actually doing its job, and is worth seeing.
 *
 * Bundled with esbuild (already a transitive dep) under the same settings
 * Vite/Rollup use, minified, then gzipped and brotli'd.
 *
 * Usage: node scripts/measure-three.mjs
 */
import { build } from 'esbuild';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const NAMED = [
  'AmbientLight', 'CatmullRomCurve3', 'Color', 'DirectionalLight', 'GridHelper',
  'Mesh', 'MeshStandardMaterial', 'PCFSoftShadowMap', 'PerspectiveCamera',
  'PlaneGeometry', 'PointLight', 'Scene', 'TubeGeometry', 'Vector3', 'WebGLRenderer',
];

const kb = (n) => `${(n / 1024).toFixed(1)} KB`.padStart(10);

async function measure(label, source) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    treeShaking: true,
    write: false,
  });
  const code = Buffer.from(result.outputFiles[0].contents);
  return {
    label,
    raw: code.length,
    gz: gzipSync(code, { level: 9 }).length,
    br: brotliCompressSync(code, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

const rows = [
  await measure('named subset (what the viewer uses)', `
    import { ${NAMED.join(', ')} } from 'three';
    globalThis.__keep = [${NAMED.join(', ')}];
  `),
  await measure('import * as THREE (the mistake)', `
    import * as THREE from 'three';
    globalThis.__keep = THREE;
  `),
];

console.log('three@0.186.1, bundled + minified + tree-shaken:\n');
for (const r of rows) {
  console.log(`  ${r.label}\n    raw ${kb(r.raw)} | gzip ${kb(r.gz)} | brotli ${kb(r.br)}`);
}
const [subset, whole] = rows;
console.log(
  `\n  tree-shaking saves ${kb(whole.gz - subset.gz)} gzip ` +
  `(${((1 - subset.gz / whole.gz) * 100).toFixed(0)}% smaller than a namespace import)`,
);