/**
 * TryItCard (v28, revised): the homepage card that wraps the working
 * equation player beside "Try it yourself." and an Open Studio button.
 * Asserted on the source, the way the no-copy guard tests do it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('the card holds the real player beside the try-it copy and a Studio link', () => {
  const source = read('./TryItCard.tsx');
  // The player inside is the real, working EquationPlayerCard — not a picture.
  assert.match(source, /import EquationPlayerCard from '\.\/EquationPlayerCard'/, 'card does not use the working player');
  assert.match(source, /<EquationPlayerCard equation=\{equation\} duration=\{duration\} \/>/, 'card does not pass the equation and duration through');
  // The right-hand copy, exactly as the owner wrote it.
  assert.match(source, /Try it yourself\./, 'card is missing the "Try it yourself." heading');
  assert.match(source, /See how a simple equation can create a unique sound and pattern\./, 'card is missing the subtext');
  // The button goes to the Studio.
  assert.match(source, /href="\/studio"/, 'card has no link to the Studio');
  assert.match(source, /Open Studio/, 'card is missing the Open Studio button');
});

test('the homepage renders the try-it card, not the player alone', () => {
  const source = read('../pages/index.astro');
  assert.match(source, /import TryItCard from '\.\.\/components\/TryItCard'/, 'homepage does not import the try-it card');
  assert.match(source, /<TryItCard client:load equation="sin\(x\)" duration=\{5\} \/>/, 'homepage does not render the try-it card');
  // The old globe banner is gone: no sphere image, no headline, no button.
  assert.doesNotMatch(source, /home-banner-sphere/, 'homepage still references the globe image');
  assert.doesNotMatch(source, /Where logic/, 'homepage still has the old banner headline');
  assert.doesNotMatch(source, /Enter the Studio/, 'homepage still has the old banner button');
});
