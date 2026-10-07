/**
 * Tests for the save path.
 *
 * The distinction that matters on a phone: the Web Share API gets the file into
 * Photos / Reels / AirDrop, while an anchor download is a desktop convenience
 * that iOS frequently ignores. The bug this guards against is a "Save" that
 * silently downloads on iOS, or — worse — a dismissed share sheet that then
 * fires a download the user never asked for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { canShareFile, isShareAbort, performSave, type ShareCapableNavigator } from './fileSave';

const CLIP = new File([new Uint8Array([1, 2, 3])], 'mathsonify.com-heart.mp4', { type: 'video/mp4' });
const NAME = 'mathsonify.com-heart.mp4';

/** Records the download fallback so we can assert it did or did not fire. */
function spyDownload() {
  const calls: Array<{ file: File; filename: string }> = [];
  return { calls, download: (f: File, n: string) => { calls.push({ file: f, filename: n }); } };
}

const aborter = () => { const e = new Error('cancelled'); e.name = 'AbortError'; return e; };

test('shares the file when the device can share files', async () => {
  const shared: unknown[] = [];
  const nav: ShareCapableNavigator = {
    canShare: () => true,
    share: async (d) => { shared.push(d); },
  };
  const dl = spyDownload();

  const outcome = await performSave(CLIP, NAME, { nav, ...dl });

  assert.equal(outcome, 'shared');
  assert.equal(shared.length, 1, 'the share sheet must be invoked once');
  assert.deepEqual(shared[0], { files: [CLIP], title: NAME });
  assert.equal(dl.calls.length, 0, 'must NOT also download when sharing worked');
});

test('falls back to a download when file sharing is unavailable', async () => {
  const dl = spyDownload();
  // Desktop Chrome: no share API at all.
  const outcome = await performSave(CLIP, NAME, { nav: {}, ...dl });
  assert.equal(outcome, 'downloaded');
  assert.deepEqual(dl.calls, [{ file: CLIP, filename: NAME }]);
});

test('falls back to a download when share exists but rejects file payloads', async () => {
  // iOS Safari can share a URL but not an arbitrary File; canShare says so.
  const nav: ShareCapableNavigator = { canShare: () => false, share: async () => {} };
  const dl = spyDownload();
  assert.equal(await performSave(CLIP, NAME, { nav, ...dl }), 'downloaded');
  assert.equal(dl.calls.length, 1);
});

test('a dismissed share sheet does NOT trigger a download', async () => {
  // The subtle one. Falling through here would re-fire a download the user
  // just dismissed, which is the exact surprise this module exists to prevent.
  const nav: ShareCapableNavigator = {
    canShare: () => true,
    share: async () => { throw aborter(); },
  };
  const dl = spyDownload();

  assert.equal(await performSave(CLIP, NAME, { nav, ...dl }), 'cancelled');
  assert.equal(dl.calls.length, 0, 'a cancelled share must not fall through to a download');
});

test('a non-abort share failure still delivers the file', async () => {
  // Too large / permission denied: the user should still end up with a file.
  const nav: ShareCapableNavigator = {
    canShare: () => true,
    share: async () => { throw new Error('NotAllowedError: too large'); },
  };
  const dl = spyDownload();

  assert.equal(await performSave(CLIP, NAME, { nav, ...dl }), 'downloaded');
  assert.equal(dl.calls.length, 1);
});

test('a throwing canShare is treated as "cannot share"', async () => {
  const nav: ShareCapableNavigator = {
    canShare: () => { throw new Error('nope'); },
    share: async () => { throw new Error('must not be reached'); },
  };
  assert.equal(canShareFile(CLIP, nav), false);
  const dl = spyDownload();
  assert.equal(await performSave(CLIP, NAME, { nav, ...dl }), 'downloaded');
});

test('canShareFile requires both share and canShare', () => {
  assert.equal(canShareFile(CLIP, null), false, 'no navigator');
  assert.equal(canShareFile(CLIP, { canShare: () => true }), false, 'canShare but no share');
  assert.equal(canShareFile(CLIP, { share: async () => {} }), false, 'share but no canShare');
  assert.equal(canShareFile(CLIP, { share: async () => {}, canShare: () => true }), true);
});

test('isShareAbort only matches AbortError', () => {
  assert.equal(isShareAbort(aborter()), true);
  assert.equal(isShareAbort(new Error('AbortError')), false, 'message text is not the name');
  assert.equal(isShareAbort(new TypeError('other')), false);
  assert.equal(isShareAbort(null), false);
  assert.equal(isShareAbort(undefined), false);
});
