/**
 * No-copy guard for equations: the formula text in the library drawer and on
 * the equations page must not be selectable or copyable. Visitors click the
 * card to load the equation in the Studio and listen — they don't take the
 * text away. Descriptions and other text stay selectable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('the library drawer equation cannot be selected or copied', () => {
  const source = read('./PresetDrawer.tsx');
  // The formula block itself is non-selectable (incl. the iOS long-press
  // callout) and cancels the copy event outright.
  assert.match(
    source,
    /className="code-mat[^"]*select-none/,
    'equation must be non-selectable',
  );
  assert.match(
    source,
    /\[-webkit-touch-callout:none\]/,
    'iOS long-press callout must be off',
  );
  assert.match(
    source,
    /onCopy=\{\(e\) => e\.preventDefault\(\)\}/,
    'copy must be cancelled on the formula',
  );
  // The card still loads on click — the guard must not break the listen flow.
  assert.match(source, /onClick=\{\(\) => handleSelectPreset\(preset\)\}/, 'click still loads the preset');
  assert.match(source, /loadPreset\(\{/, 'loadPreset still wired');
});

test('the equations page formula cannot be selected or copied', () => {
  const source = read('../pages/equations.astro');
  assert.match(
    source,
    /class="code-mat[^"]*select-none/,
    'equation must be non-selectable',
  );
  assert.match(
    source,
    /\[-webkit-touch-callout:none\]/,
    'iOS long-press callout must be off',
  );
  assert.match(
    source,
    /querySelectorAll\('\.code-mat'\)/,
    'copy guard must target the formula blocks',
  );
  assert.match(source, /addEventListener\('copy'/, 'copy must be cancelled on the formula');
  // The page still opens the equation in the Studio.
  assert.match(source, /Open in Studio/, 'Open in Studio link must stay');
});
