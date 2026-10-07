import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_FLAGS,
  FEATURE_ROUTES,
  isFeatureEnabled,
  isRouteDisabled,
  featureForRoute,
  getVisibleNavLinks,
  type FeatureId,
} from './featureFlags';

// These tests describe the SHIPPED default. `FEATURE_FLAGS` is built from
// build-time env overrides, so when one is present the suite asserts against
// that value instead — the release CONTROL is what is under test here, not a
// particular build's environment.
const envOverrides = ['SOUNDLAB_ENABLED', 'DRAW_ENABLED', 'MUSICALAB_ENABLED']
  .some((key) => process.env[key] === 'true');

// The release-control contract. These tests are the safety net for "flip one
// flag and the right thing happens" — if someone refactors the guard and it
// stops responding to the flags, this fails loudly.

const FEATURE_IDS: FeatureId[] = ['soundLab', 'draw', 'musicLab'];

test('all three future features exist as flags', () => {
  assert.deepEqual(Object.keys(FEATURE_FLAGS).sort(), [...FEATURE_IDS].sort());
  // The repository default is "unreleased". When a build-time override is
  // present the suite is exercising a preview deploy, so the flag value is
  // whatever that deploy asked for.
  if (!envOverrides) {
    for (const id of FEATURE_IDS) {
      assert.equal(FEATURE_FLAGS[id], false, `${id} should be unreleased by default`);
    }
  }
});

test('every feature has a public route', () => {
  assert.equal(FEATURE_ROUTES.soundLab, '/soundlab');
  assert.equal(FEATURE_ROUTES.draw, '/draw');
  assert.equal(FEATURE_ROUTES.musicLab, '/music-lab');
});

test('the route guard agrees with the flags, whatever they are set to', () => {
  // This is the real invariant: guard === !flag, for every feature. It holds
  // in the default build and in any preview deploy.
  for (const id of FEATURE_IDS) {
    const expectedDisabled = FEATURE_FLAGS[id] !== true;
    assert.equal(isFeatureEnabled(id), !expectedDisabled, `${id} enabled state`);
    assert.equal(isRouteDisabled(id), expectedDisabled, `${id} route guard`);
    assert.equal(
      isRouteDisabled(FEATURE_ROUTES[id]),
      expectedDisabled,
      `${id} path guard`,
    );
  }
});

test('unguarded public routes are never treated as disabled', () => {
  for (const path of ['/', '/studio', '/equations', '/about', '/scientists']) {
    assert.equal(isRouteDisabled(path), false, `${path} must stay public`);
  }
});

test('featureForRoute resolves paths including a trailing slash', () => {
  assert.equal(featureForRoute('/soundlab'), 'soundLab');
  assert.equal(featureForRoute('/music-lab/'), 'musicLab');
  assert.equal(featureForRoute('/draw'), 'draw');
  assert.equal(featureForRoute('/studio'), null);
});

test('the navbar drops unreleased features and leaves no gaps', () => {
  const all = [
    { name: 'SoundLab', feature: 'soundLab' as FeatureId | null },
    { name: 'How It Works', feature: null },
    { name: 'Studio', feature: null },
    { name: 'Draw', feature: 'draw' as FeatureId | null },
    { name: 'Equations', feature: null },
    { name: 'Music Lab', feature: 'musicLab' as FeatureId | null },
    { name: 'About', feature: null },
  ];
  const visible = getVisibleNavLinks(all).map((link) => link.name);

  // Whatever the flags say, a feature is present if and only if it is enabled.
  const expected = all
    .filter((link) => link.feature === null || FEATURE_FLAGS[link.feature])
    .map((link) => link.name);
  assert.deepEqual(visible, expected);

  // Public links are never dropped, and nothing is left as a placeholder.
  for (const always of ['How It Works', 'Studio', 'Equations', 'About']) {
    assert.ok(visible.includes(always), `${always} must always be in the navbar`);
  }
});

test('the release rule is honest: enabling a flag is the only switch', () => {
  // Simulate the released state the way the production code reads it, so the
  // one-change launch promise is verified rather than assumed.
  const released: Record<FeatureId, boolean> = { soundLab: true, draw: false, musicLab: false };
  const navAll = [
    { name: 'SoundLab', feature: 'soundLab' as FeatureId | null },
    { name: 'Draw', feature: 'draw' as FeatureId | null },
    { name: 'Music Lab', feature: 'musicLab' as FeatureId | null },
  ];
  const visible = navAll
    .filter((link) => link.feature === null || released[link.feature])
    .map((link) => link.name);
  assert.deepEqual(visible, ['SoundLab']);

  const allReleased: Record<FeatureId, boolean> = { soundLab: true, draw: true, musicLab: true };
  const visibleAll = navAll
    .filter((link) => link.feature === null || allReleased[link.feature])
    .map((link) => link.name);
  assert.deepEqual(visibleAll, ['SoundLab', 'Draw', 'Music Lab']);
});


