/**
 * Getting a recorded file off the device.
 *
 * A plain `<a download>` is an unreliable save mechanism on mobile: iOS Safari
 * frequently ignores the `download` attribute and just opens the blob inline,
 * so the user is left staring at a video they cannot file away. Where the Web
 * Share API can accept files, `navigator.share` opens the native sheet — Save to
 * Photos, AirDrop, a Reels/Instagram target — which is the flow phone users
 * actually expect. Only when file sharing is unavailable (typically desktop) do
 * we fall back to the anchor download.
 *
 * Both the decision and the outcome are pure/injectable so they are testable in
 * Node, which has no `navigator.share` and no `document`.
 */

/** Minimal structural view of the share APIs — avoids depending on lib.dom types. */
export interface ShareCapableNavigator {
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  canShare?: (data?: { files?: File[]; title?: string }) => boolean;
}

export type SaveOutcome =
  /** Handed to the OS share sheet. */
  | 'shared'
  /** No file sharing available, or sharing failed — saved via an anchor. */
  | 'downloaded'
  /** The user dismissed the share sheet. Deliberately *not* a download. */
  | 'cancelled';

export interface SaveDeps {
  /** Injected for tests; defaults to the real `navigator`. */
  nav?: ShareCapableNavigator | null;
  /** Injected for tests; defaults to a real anchor download. */
  download?: (file: File, filename: string) => void;
  /**
   * v32: skip the share sheet entirely and download the file directly.
   * The 3D picture/video exports use this — the user asked for a real
   * download, not the native share sheet. A plain `<a download>` is the
   * most direct save the page can trigger; on Android Chrome it downloads
   * straight to the device, and on desktop it is the normal download. On
   * iOS Safari the `download` attribute is often ignored and the file opens
   * inline in the browser instead (the user can then save it from the
   * browser) — that is a browser behaviour the page cannot override.
   */
  forceDownload?: boolean;
}

/**
 * Whether this navigator can share the file itself (as opposed to only a URL).
 *
 * `canShare` is the honest test: a navigator may expose `share()` and still
 * refuse file payloads, in which case calling `share({files})` throws.
 */
export function canShareFile(file: File, nav: ShareCapableNavigator | null): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] }) === true;
  } catch {
    // Some engines throw rather than returning false for file payloads.
    return false;
  }
}

/** True for the `AbortError` a dismissed share sheet rejects with. */
export function isShareAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

/** Real anchor download — the desktop path. */
export function downloadViaAnchor(file: File, filename: string): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on a delay: Firefox cancels an in-flight download if the URL dies
  // synchronously after click().
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Shares the file when the device can, otherwise downloads it.
 *
 * A dismissed share sheet resolves to `'cancelled'` and deliberately does NOT
 * fall through to a download — silently re-firing a download the user just
 * dismissed is exactly the surprise this module exists to prevent. Any *other*
 * share failure (payload too large, permission denied) does fall through, since
 * there the user still deserves their file.
 *
 * v32: `forceDownload` skips the share sheet entirely and downloads the file
 * directly. The 3D picture/video exports use it — the user asked for a real
 * download there, not the native share sheet.
 */
export async function performSave(
  file: File,
  filename: string,
  deps: SaveDeps = {},
): Promise<SaveOutcome> {
  const nav = deps.nav ?? (typeof navigator === 'undefined' ? null : (navigator as ShareCapableNavigator));
  const download = deps.download ?? downloadViaAnchor;

  if (!deps.forceDownload && canShareFile(file, nav)) {
    try {
      await nav!.share!({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (isShareAbort(err)) return 'cancelled';
    }
  }

  download(file, filename);
  return 'downloaded';
}
