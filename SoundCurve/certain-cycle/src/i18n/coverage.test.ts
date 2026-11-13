/**
 * Full-coverage contract: the language switcher translates the whole site,
 * not just the main UI. Every supported language must actually translate
 * the Privacy and Terms pages and a main UI string — a key that falls back
 * to English is a key that was never translated. The brand name, equation
 * names and technical terms stay in English in every language.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { t, LANGUAGES } from './index';

// Languages other than the two English variants — these must carry real
// translations, so the translated value must differ from the US English one.
const TRANSLATED_LANGS = LANGUAGES.map((l) => l.code).filter(
  (c) => c !== 'en-US' && c !== 'en-GB'
);

test('every non-English language translates the Privacy page title', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('privacy.title', lang);
    assert.notEqual(v, t('privacy.title', 'en-US'), `${lang}: privacy.title is still English`);
    assert.ok(v.length > 0, `${lang}: privacy.title is empty`);
  }
});

test('every non-English language translates the Terms page title', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('terms.title', lang);
    assert.notEqual(v, t('terms.title', 'en-US'), `${lang}: terms.title is still English`);
    assert.ok(v.length > 0, `${lang}: terms.title is empty`);
  }
});

test('every non-English language translates a main UI string (How It Works)', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('nav.howItWorks', lang);
    assert.notEqual(v, t('nav.howItWorks', 'en-US'), `${lang}: nav.howItWorks is still English`);
    assert.ok(v.length > 0, `${lang}: nav.howItWorks is empty`);
  }
});

test('every non-English language translates a Privacy body paragraph', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('privacy.s1Desc2', lang);
    assert.notEqual(v, t('privacy.s1Desc2', 'en-US'), `${lang}: privacy.s1Desc2 is still English`);
  }
});

test('every non-English language translates a Terms body paragraph', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('terms.s1Desc', lang);
    assert.notEqual(v, t('terms.s1Desc', 'en-US'), `${lang}: terms.s1Desc is still English`);
  }
});

test('the brand name and technical terms stay in English in every language', () => {
  for (const lang of TRANSLATED_LANGS) {
    // privacy.s1Desc2 names the brand and both technical terms in one
    // paragraph ("MathSonify runs 100% client-side using the Web Audio API
    // … and a sandboxed mathjs expression parser"). All three must survive
    // translation verbatim.
    const v = t('privacy.s1Desc2', lang);
    assert.ok(v.includes('MathSonify'), `${lang}: privacy.s1Desc2 lost the brand name`);
    assert.ok(v.includes('mathjs'), `${lang}: privacy.s1Desc2 lost the mathjs term`);
    assert.ok(v.includes('Web Audio API'), `${lang}: privacy.s1Desc2 lost the Web Audio API term`);
  }
});

test('UK English uses UK spellings in the new policy keys', () => {
  assert.ok(t('privacy.s1Desc1', 'en-GB').includes('minimise'));
  assert.ok(t('privacy.s3Note3', 'en-GB').includes('colour'));
  assert.ok(t('terms.s2Desc1', 'en-GB').includes('synthesise'));
  assert.ok(t('terms.s2Desc1', 'en-GB').includes('visualisations'));
});

test('every non-English language translates the contact page', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('contact.generalTitle', lang);
    assert.notEqual(v, t('contact.generalTitle', 'en-US'), `${lang}: contact.generalTitle is still English`);
  }
});

test('every non-English language translates the offline page title', () => {
  for (const lang of TRANSLATED_LANGS) {
    const v = t('offline.title', lang);
    assert.notEqual(v, t('offline.title', 'en-US'), `${lang}: offline.title is still English`);
  }
});
