/**
 * Language list contract: Tamil is gone, English is offered as US/UK
 * variants, and old stored values migrate cleanly to English (US).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidLang, getLang, t, LANGUAGES, LANG_KEY } from './index';

test('Tamil is gone from the language list', () => {
  assert.equal(isValidLang('ta'), false);
  // `code` is typed Lang, which no longer includes 'ta' — compare as plain
  // strings so the check itself stays type-correct.
  assert.ok(!LANGUAGES.some((l) => (l.code as string) === 'ta'), 'ta must not be listed');
});

test('English is offered as US and UK variants, first in the list', () => {
  assert.equal(isValidLang('en-US'), true);
  assert.equal(isValidLang('en-GB'), true);
  assert.equal(isValidLang('en'), false);
  const codes = LANGUAGES.map((l) => l.code);
  assert.equal(codes[0], 'en-US');
  assert.equal(codes[1], 'en-GB');
  const us = LANGUAGES.find((l) => l.code === 'en-US');
  const gb = LANGUAGES.find((l) => l.code === 'en-GB');
  assert.ok(us && gb);
  assert.equal(us.native, 'English (US)');
  assert.equal(gb.native, 'English (UK)');
});

test('every listed language has a dictionary', () => {
  for (const l of LANGUAGES) {
    assert.equal(isValidLang(l.code), true, `${l.code} has no dictionary`);
  }
});

test('UK English spells analogue and catalogue; US English keeps analog and catalog', () => {
  assert.equal(t('nav.analog', 'en-GB'), 'Analogue');
  assert.equal(t('nav.analog', 'en-US'), 'Analog');
  assert.equal(t('equations.tag', 'en-GB'), 'mathematical catalogue');
  assert.equal(t('equations.tag', 'en-US'), 'mathematical catalog');
  assert.equal(t('audio.musicalScale', 'en-GB'), 'Musical scale quantisation');
  assert.equal(t('audio.musicalScale', 'en-US'), 'Musical scale quantization');
  assert.ok(t('home.feature3Desc', 'en-GB').includes('quantisation'));
  assert.ok(t('studio.subtitle', 'en-GB').includes('synthesise'));
});

test('UK English falls back to US English for unchanged strings', () => {
  assert.equal(t('nav.studio', 'en-GB'), 'Studio');
  assert.equal(t('nav.studio', 'en-US'), 'Studio');
  assert.equal(t('support.amountLabel', 'en-GB'), t('support.amountLabel', 'en-US'));
});

test('a stored legacy language migrates to English (US)', () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  try {
    // Plain 'en' migrates to 'en-US' and the stored value is healed.
    store.set(LANG_KEY, 'en');
    assert.equal(getLang(), 'en-US');
    assert.equal(store.get(LANG_KEY), 'en-US');
    // Removed 'ta' falls back to English (US).
    store.set(LANG_KEY, 'ta');
    assert.equal(getLang(), 'en-US');
    // Nothing stored: the fallback.
    store.delete(LANG_KEY);
    assert.equal(getLang(), 'en-US');
  } finally {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  }
});
