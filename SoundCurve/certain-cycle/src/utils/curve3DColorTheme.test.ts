/**
 * v32: the 3D curve follows the export colour theme (White/Blue/Green/Purple).
 *
 * The user asked for the moving 3D curve to use the same four theme colours
 * as the 2D export (purple, specifically). The theme lives in the store so
 * the live 3D view can react to it, the Export modal syncs the picker to
 * the store, and the viewer rebuilds only the tubes when it changes. The
 * exports render the live scene, so the picture and video inherit the
 * theme colour automatically. Source-wiring tests here; the visible colour
 * is covered by the headless visual proof (a purple curve screenshot).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { VIDEO_COLOR_THEMES, videoColorThemeHex } from './videoScene';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

test('the four 2D theme colours are the ones the 3D curve uses', () => {
  assert.equal(videoColorThemeHex('white'), '#FFFFFF');
  assert.equal(videoColorThemeHex('blue'), '#7C6CFF');
  assert.equal(videoColorThemeHex('green'), '#22FF88');
  // Purple is the theme the user asked about.
  assert.equal(videoColorThemeHex('purple'), '#E879F9');
  assert.deepEqual(Object.keys(VIDEO_COLOR_THEMES).sort(), ['blue', 'green', 'purple', 'white']);
});

test('the store carries the export colour theme', () => {
  const store = read('../store/studioStore.ts');
  assert.match(store, /colorTheme: VideoColorTheme;/, 'store has no colorTheme state');
  assert.match(store, /setColorTheme: \(theme: VideoColorTheme\) => void;/, 'store has no setColorTheme action');
  assert.match(store, /colorTheme: loadSavedColorTheme\(\),/, 'store does not initialise from the saved prefs');
  assert.match(store, /setColorTheme: \(colorTheme\) => set\(\{ colorTheme \}\),/, 'setColorTheme does not set the state');
  // Initialised from the same localStorage key the Export modal reads.
  assert.match(store, /localStorage\.getItem\('mathsonify-video-export'\)/, 'store reads the wrong prefs key');
});

test('the viewer follows the store theme and rebuilds only the tubes', () => {
  const viewer = read('../components/Studio/Curve3DViewer.tsx');
  // Subscribes to the theme and pushes it into the scene.
  assert.match(viewer, /useStudioStore\(\(s\) => s\.colorTheme\)/, 'viewer does not subscribe to the colour theme');
  assert.match(viewer, /apiRef\.current\?\.setColorTheme\(colorTheme\)/, 'viewer does not push the theme into the scene');
  // The scene API exposes setColorTheme, and it no-ops when unchanged.
  assert.match(viewer, /setColorTheme\(theme: VideoColorTheme\): void;/, 'SceneApi has no setColorTheme');
  assert.match(viewer, /if \(theme === colorTheme\) return;/, 'setColorTheme rebuilds even when unchanged');
  // The tube colour comes from the theme, not the fixed palette colour.
  assert.match(viewer, /const tubeColor = themeTubeColor\(\);/, 'tube colour is not read from the theme');
  assert.match(viewer, /color: tubeColor, emissive: tubeColor/, 'bright tube does not use the theme colour');
  assert.match(viewer, /color: tubeColor, transparent: true, opacity: 0\.22/, 'ghost tube does not use the theme colour');
  assert.match(viewer, /color: tubeColor, toneMapped: false \}\)\);/, 'playhead does not use the theme colour');
});

test('the Export modal syncs the colour picker to the store', () => {
  const modal = read('../components/ExportModal.tsx');
  assert.match(modal, /const setColorTheme = useStudioStore\(\(s\) => s\.setColorTheme\);/, 'modal does not read setColorTheme');
  // Picking a colour updates the store at once, so the live 3D tube follows.
  assert.match(modal, /setColorTheme\(themeId\);/, 'colour picker does not sync the theme to the store');
});

test('the 3D picture exports pass the labels (name + scientist + theme)', () => {
  const modal = read('../components/ExportModal.tsx');
  assert.match(
    modal,
    /threeDApi\.exportImage\(s\.equation, \{[^}]*equationName: s\.activeEquationName,[^}]*scientistName: s\.activeScientist\?\.name \?\? null,[^}]*colorTheme: videoPrefs\.colorTheme,/s,
    'single 3D picture does not pass the labels',
  );
  assert.match(
    modal,
    /threeDApi\.exportTurntableImage\(s\.equation, \{[^}]*equationName: s\.activeEquationName,[^}]*scientistName: s\.activeScientist\?\.name \?\? null,[^}]*colorTheme: videoPrefs\.colorTheme,/s,
    'turntable 3D picture does not pass the labels',
  );
});
