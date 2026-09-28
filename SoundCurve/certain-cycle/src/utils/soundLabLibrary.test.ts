import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITIONS } from '../data/compositions';
import { adjacentComposition, filterCompositions } from './soundLabLibrary';

test('search matches title, genre, equation, and instrument', () => {
  assert.equal(filterCompositions(COMPOSITIONS, { category: 'all', query: 'celestial' })[0]?.id, 'celestial-drift');
  assert.ok(filterCompositions(COMPOSITIONS, { category: 'all', query: 'ambient' }).some((item) => item.id === 'celestial-drift'));
  assert.ok(filterCompositions(COMPOSITIONS, { category: 'all', query: 'sine' }).length > 0);
  assert.ok(filterCompositions(COMPOSITIONS, { category: 'all', query: 'exp(' }).length > 0);
  assert.deepEqual(filterCompositions(COMPOSITIONS, { category: 'all', query: 'not-a-real-track' }), []);
});

test('category filtering returns only that genre', () => {
  const ambient = filterCompositions(COMPOSITIONS, { category: 'ambient', query: '' });
  assert.ok(ambient.length > 0);
  assert.ok(ambient.every((composition) => composition.genre === 'ambient'));
});

test('previous and next wrap inside the filtered list', () => {
  const ambient = filterCompositions(COMPOSITIONS, { category: 'ambient', query: '' });
  const first = ambient[0].id;
  const last = ambient[ambient.length - 1].id;
  assert.equal(adjacentComposition(ambient, last, 1)?.id, first);
  assert.equal(adjacentComposition(ambient, first, -1)?.id, last);
  assert.equal(adjacentComposition([], null, 1), null);
});
