import { useEffect, useState } from 'react';
import { useStudioStore } from '../store/studioStore';
import { useTranslation } from '../i18n/index';
import { renderEquationToWavBlob } from '../utils/audioExporter';
import { exportGraphAsImage } from '../utils/graphExporter';
import {
  exportEquationVideo,
  detectVideoMimeType,
  videoExtensionForMimeType,
  UNSUPPORTED_RECORDING_MESSAGE,
  type VideoExportResult,
} from '../utils/videoExporter';
import {
  exportVideoOffline,
  isOfflineVideoSupported,
  chooseVideoExportMode,
  pickAudioCodec,
} from '../utils/offlineVideoExporter';
import { export3DVideoOffline } from '../utils/export3DVideoOffline';
import { videoSize, VIDEO_COLOR_THEMES, isVideoColorTheme, type VideoColorTheme, type VideoOrientation, type VideoQuality } from '../utils/videoScene';
import { performSave, type SaveOutcome } from '../utils/fileSave';

/** localStorage key for the last export choices (video orientation + quality, curve colour). */
export const VIDEO_EXPORT_PREFS_KEY = 'mathsonify-video-export';

function loadVideoPrefs(): { orientation: VideoOrientation; quality: VideoQuality; colorTheme: VideoColorTheme; orbit360: boolean } {
  const fallback = { orientation: 'landscape' as VideoOrientation, quality: '720p' as VideoQuality, colorTheme: 'white' as VideoColorTheme, orbit360: true };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(VIDEO_EXPORT_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { orientation?: unknown; quality?: unknown; colorTheme?: unknown; orbit360?: unknown };
    return {
      orientation: parsed.orientation === 'portrait' ? 'portrait' : 'landscape',
      quality: parsed.quality === '1080p' ? '1080p' : parsed.quality === '480p' ? '480p' : '720p',
      colorTheme: isVideoColorTheme(parsed.colorTheme) ? parsed.colorTheme : 'white',
      // 360° orbit (v30): on by default — a 3D clip is a turntable clip
      // unless the user turns the orbit off. Old saved prefs have no key.
      orbit360: parsed.orbit360 === false ? false : true,
    };
  } catch {
    return fallback;
  }
}

export default function ExportModal() {
  const { t } = useTranslation();
  const exportModalOpen = useStudioStore((s) => s.exportModalOpen);
  const setExportModalOpen = useStudioStore((s) => s.setExportModalOpen);

  const equation = useStudioStore((s) => s.equation);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);
  const minFreq = useStudioStore((s) => s.minFreq);
  const maxFreq = useStudioStore((s) => s.maxFreq);
  const duration = useStudioStore((s) => s.duration);
  const volume = useStudioStore((s) => s.volume);
  const instrument = useStudioStore((s) => s.instrument);
  const sonificationMode = useStudioStore((s) => s.sonificationMode);
  const scale = useStudioStore((s) => s.scale);
  const activeScientist = useStudioStore((s) => s.activeScientist);
  const activeEquationName = useStudioStore((s) => s.activeEquationName);
  // The live 3D scene's export API, present only while a 3D viewer is
  // mounted (the Studio's GraphPanel in 3D mode). When it exists, the
  // image and video tabs offer a 3D option alongside the 2D one.
  const threeDApi = useStudioStore((s) => s.threeDApi);

  const [exportType, setExportType] = useState<'audio' | 'image' | 'video'>('audio');
  const [isExporting, setIsExporting] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [exportError, setExportError] = useState('');
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');
  // 2D or 3D, per tab. Defaults to 3D when a 3D viewer is mounted (the user
  // opened the export from 3D mode), otherwise 2D. Only shown when a 3D
  // viewer exists; in 2D mode there is nothing to choose.
  const [imageDimension, setImageDimension] = useState<'2d' | '3d'>('3d');
  const [videoDimension, setVideoDimension] = useState<'2d' | '3d'>('3d');
  // 360° turntable picture (v30): four views in one PNG, instead of the
  // single view. Only in the 3D image tab; off by default so a plain 3D
  // picture still exports exactly as before.
  const [image360, setImage360] = useState(false);

  // ── Video results ────────────────────────────────────────────────
  // The recorded clip is shown inline and saved explicitly, because a bare
  // `<a download>` is unreliable on mobile (iOS often just opens the blob).
  const [video, setVideo] = useState<VideoExportResult | null>(null);
  const [saveOutcome, setSaveOutcome] = useState<SaveOutcome | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Which container this browser can actually record. `null` means video export
  // is impossible here (e.g. Safari on iOS, which cannot record at all).
  const [videoMime] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : detectVideoMimeType(),
  );
  // Whether the frame-exact offline render is available here (WebCodecs).
  // It is the preferred path: unlike the live recorder it cannot drop frames,
  // so the file's frame rate is the real one.
  const [offlineSupported] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : isOfflineVideoSupported(),
  );
  // Which audio codec the offline render will use, once probed: a codec
  // string when one is available, `null` when this browser encodes neither
  // AAC nor Opus, and `undefined` while the probe is still running.
  // WebCodecs alone does not mean the offline render will work — a browser
  // can have the encoders yet be unable to encode AAC (Firefox, desktop
  // Linux, some Brave builds) — and without this check the export only
  // discovers the failure mid-render and silently falls back to the live
  // recorder, so the clip comes out irregular with no explanation. The
  // offline path is only advertised once a codec is known (or while the
  // probe is pending); no codec at all means the live recorder.
  const [audioCodec, setAudioCodec] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!offlineSupported) return;
    let cancelled = false;
    pickAudioCodec(44100, 2).then((codec) => {
      if (!cancelled) setAudioCodec(codec);
    });
    return () => {
      cancelled = true;
    };
  }, [offlineSupported]);
  const offlineReady = offlineSupported && audioCodec !== null;
  // Note shown when a clip was recorded live because the frame-exact render
  // was not available, so the user knows why the motion may stutter.
  const [videoNote, setVideoNote] = useState('');
  // Progress of the offline render, shown while it runs.
  const [videoProgress, setVideoProgress] = useState<{ done: number; total: number } | null>(null);
  // Video export is blocked only when neither path is available.
  const videoBlocked = chooseVideoExportMode({ offline: offlineReady, realtime: videoMime !== null }) === 'none';

  // Video orientation + quality, remembered from the last export.
  const [videoPrefs, setVideoPrefs] = useState(loadVideoPrefs);
  const videoOrientation = videoPrefs.orientation;
  const videoQuality = videoPrefs.quality;
  useEffect(() => {
    try {
      window.localStorage.setItem(VIDEO_EXPORT_PREFS_KEY, JSON.stringify(videoPrefs));
    } catch {
      // Private mode / full storage: the export still works, it just forgets.
    }
  }, [videoPrefs]);

  // Release the previous clip's object URL whenever it is replaced or the modal
  // closes, so a long editing session does not leak a blob per export.
  useEffect(() => {
    if (!video) return;
    return () => URL.revokeObjectURL(video.url);
  }, [video]);

  // Closing the modal drops the clip too.
  useEffect(() => {
    if (exportModalOpen) return;
    setVideo(null);
    setSaveOutcome(null);
  }, [exportModalOpen]);

  if (!exportModalOpen) return null;

  const sanitizeFilename = (eq: string) =>
    eq.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();

  const handleExportImage = async () => {
    try {
      setIsExporting(true);
      setExportError('');
      // Read the live session (same as the video path) so the image renders
      // the curve that is on screen right now, in the chosen colour.
      const s = useStudioStore.getState();
      await exportGraphAsImage(s.equation, {
        format: imageFormat,
        watermark: true,
        equationName: s.activeEquationName ?? undefined,
        scientistName: s.activeScientist?.name ?? undefined,
        scientist: s.activeScientist,
        colorTheme: videoPrefs.colorTheme,
        orientation: videoOrientation,
        minX: s.minX,
        maxX: s.maxX,
        isCustomCurve: s.isCustomCurve,
        splineControlPoints: s.splineControlPoints,
        duration: s.duration,
      });
      setDownloadReady(true);
      setIsExporting(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Image export failed');
      setIsExporting(false);
    }
  };

  /**
   * 3D image export (v29). Uses the live 3D scene's own render3DImage —
   * one frame, footer, PNG up to 2048px — so the picture is the 3D view
   * exactly as it looks on screen. Only offered while a 3D viewer is
   * mounted (threeDApi is present).
   */
  const handleExport3DImage = async () => {
    if (!threeDApi) return;
    try {
      setIsExporting(true);
      setExportError('');
      const s = useStudioStore.getState();
      await threeDApi.exportImage(s.equation);
      setDownloadReady(true);
      setIsExporting(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '3D image export failed');
      setIsExporting(false);
    }
  };

  /**
   * 360° turntable picture (v30). Four views (0°/90°/180°/270°) in one
   * 2×2 PNG, each with the billboard watermark. Same handler shape as
   * the single 3D picture above.
   */
  const handleExport3DTurntableImage = async () => {
    if (!threeDApi) return;
    try {
      setIsExporting(true);
      setExportError('');
      const s = useStudioStore.getState();
      await threeDApi.exportTurntableImage(s.equation);
      setDownloadReady(true);
      setIsExporting(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : '3D turntable image export failed');
      setIsExporting(false);
    }
  };

  const handleExportWav = async () => {
    try {
      setIsExporting(true);
      setExportError('');
      const wavBlob = await renderEquationToWavBlob({
        equation, minX, maxX, minFreq, maxFreq, duration, volume, instrument, sonificationMode, scale,
      });
      const url = URL.createObjectURL(wavBlob);
      const filename = `mathsonify.com-${sanitizeFilename(equation)}.wav`;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDownloadReady(true);
      setIsExporting(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setIsExporting(false);
    }
  };

  const handleExportVideo = async () => {
    try {
      setIsExporting(true);
      setExportError('');
      setSaveOutcome(null);
      setVideoProgress(null);
      setVideoNote('');
      // Read the live session at the moment Export is pressed. Zustand's
      // getState() avoids a stale render closure, so changing equation or
      // instrument and exporting immediately captures the new values.
      const s = useStudioStore.getState();

      const base = {
        equation: s.equation,
        equationName: s.activeEquationName,
        scientist: s.activeScientist,
        minX: s.minX,
        maxX: s.maxX,
        minFreq: s.minFreq,
        maxFreq: s.maxFreq,
        duration: s.duration,
        volume: s.volume,
        instrument: s.instrument,
        sonificationMode: s.sonificationMode,
        scale: s.scale,
        isCustomCurve: s.isCustomCurve,
        splineControlPoints: s.splineControlPoints,
        speed: s.speed,
        orientation: videoOrientation,
        quality: videoQuality,
        colorTheme: videoPrefs.colorTheme,
        // 360° orbit (v30): the 3D clip circles the scene once. Only the
        // 3D exporter reads it; the 2D paths ignore the extra field.
        orbit360: videoPrefs.orbit360,
      };

      let result: VideoExportResult;
      // 3D video (v29): the frame-exact offline 3D render, when the user
      // asked for 3D and a 3D viewer is mounted. It drives the live 3D
      // scene frame-by-frame. If it fails, the error is surfaced — falling
      // back to a 2D clip would silently give the user the wrong video.
      if (videoDimension === '3d' && threeDApi) {
        result = await export3DVideoOffline(threeDApi, base, (done, total) =>
          setVideoProgress({ done, total }),
        );
      } else if (offlineReady) {
        // Frame-exact offline render first. If it fails (e.g. this browser
        // has WebCodecs but no H.264 encoder), fall back to the live recorder
        // instead of failing outright — unless there is no recorder either.
        // The fallback is surfaced, not silent: a live recording can stutter,
        // so the user is told this clip is one.
        try {
          result = await exportVideoOffline(base, (done, total) =>
            setVideoProgress({ done, total }),
          );
        } catch (offlineErr) {
          setVideoProgress(null);
          if (!videoMime) throw offlineErr;
          setVideoNote(
            'Frame-exact render failed in this browser, so this clip was recorded live — motion may stutter. Chrome or Edge gives a frame-exact export.',
          );
          result = await exportEquationVideo(base);
        }
      } else {
        if (offlineSupported) {
          setVideoNote(
            'This browser cannot encode audio for the offline render (no AAC or Opus), so video exports use the live recorder and motion may stutter. For a frame-exact clip, use Chrome or Edge.',
          );
        }
        result = await exportEquationVideo(base);
      }
      // Show the clip; saving is a separate, explicit action.
      setVideo(result);
      setDownloadReady(true);
      setIsExporting(false);
      setVideoProgress(null);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Video export failed');
      setIsExporting(false);
      setVideoProgress(null);
    }
  };

  /**
   * The single Save action. Uses the Web Share API where the device can share
   * files (giving the native Save-to-Photos / Reels sheet) and an anchor
   * download otherwise.
   */
  const handleSaveVideo = async () => {
    if (!video) return;
    try {
      setIsSaving(true);
      setExportError('');
      const file = new File([video.blob], video.filename, { type: video.mimeType });
      setSaveOutcome(await performSave(file, video.filename));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not save the video');
    } finally {
      setIsSaving(false);
    }
  };

  const audioSizeMB = ((duration * 44100 * 4) / 1024 / 1024).toFixed(2);
  const imageSizeLabel = imageFormat === 'png' ? '~180–350 KB' : '~90–160 KB';
  const videoDims = videoSize(videoOrientation, videoQuality);
  const videoPixelScale = (videoDims.width * videoDims.height) / (1280 * 720);
  const videoSizeLabel = `~${(duration * 0.31 * videoPixelScale).toFixed(1)} MB`;
  /** Human label for the container this browser will really record. The
   * offline render always produces MP4/H.264, so it gets its own label —
   * but only when the offline path is actually ready (an audio codec was
   * picked): advertising MP4/H.264 on a browser that will fall back to the
   * live recorder is what made exports look irregular with no explanation. */
  const videoFormatLabel = offlineReady
    ? `MP4 · H.264 · ${videoQuality}60`
    : videoMime
      ? `${videoExtensionForMimeType(videoMime).toUpperCase()} · ${videoMime.includes('mp4') ? 'H.264' : 'VP9'} · ${videoQuality}60`
      : 'unavailable';
  const videoResolutionLabel = `${videoDims.width} × ${videoDims.height} @ 60fps`;

  // Orientation picker (v22), shared by the image and video tabs: one
  // choice, one stored preference, both exports in the same shape — so a
  // portrait pick really is a portrait file, in either format.
  const orientationPicker = (
    <div className="flex items-center justify-between">
      <span className="text-xs text-sc-text-soft">Orientation</span>
      <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
        {([
          { id: 'landscape' as const, label: 'Landscape 16:9' },
          { id: 'portrait' as const, label: 'Portrait 9:16' },
        ]).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setVideoPrefs((p) => ({ ...p, orientation: opt.id }))}
            className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
            style={{
              background: videoOrientation === opt.id ? 'var(--sc-accent)' : 'transparent',
              color: videoOrientation === opt.id ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
              boxShadow: videoOrientation === opt.id ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  // Curve colour picker (v21b), shared by the image and video tabs: one
  // choice, one stored preference, both exports in the same colour.
  const colourPicker = (
    <div className="flex items-center justify-between">
      <span className="text-xs text-sc-text-soft">Colour</span>
      <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
        {(Object.keys(VIDEO_COLOR_THEMES) as VideoColorTheme[]).map((themeId) => (
          <button
            key={themeId}
            type="button"
            onClick={() => setVideoPrefs((p) => ({ ...p, colorTheme: themeId }))}
            className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px] flex items-center gap-1.5"
            style={{
              background: videoPrefs.colorTheme === themeId ? 'var(--sc-accent)' : 'transparent',
              color: videoPrefs.colorTheme === themeId ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
              boxShadow: videoPrefs.colorTheme === themeId ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
            }}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: VIDEO_COLOR_THEMES[themeId].hex, border: '1px solid rgba(255,255,255,0.35)' }} />
            {VIDEO_COLOR_THEMES[themeId].label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{
        background: 'rgba(var(--sc-bg) / 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        // Landscape notches: keep the sheet clear of the safe area. Inline
        // rather than a `.sc-safe-*` utility, because such a class would
        // collide with Tailwind's own padding utilities (same specificity,
        // later in the cascade) and silently win.
        paddingLeft: 'max(0px, env(safe-area-inset-left))',
        paddingRight: 'max(0px, env(safe-area-inset-right))',
      }}
    >
      <div
        className="relative w-full sm:max-w-md p-5 sm:p-6 space-y-5 rounded-t-2xl sm:rounded-2xl overflow-y-auto"
        style={{
          // On a phone this is a bottom sheet: cap the height and let it scroll,
          // and keep its actions clear of the home indicator.
          maxHeight: 'min(92dvh, 100%)',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
          background: 'color-mix(in srgb, var(--sc-bg) 88%, transparent)',
          backdropFilter: 'blur(24px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.35)',
          border: '1px solid color-mix(in srgb, var(--sc-accent) 18%, transparent)',
          boxShadow: '0 0 32px -8px rgba(var(--sc-accent) / 0.14), 0 16px 48px -12px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* Subtle accent gradient wash */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden" aria-hidden>
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ background: 'linear-gradient(135deg, rgba(var(--sc-accent) / 0.16) 0%, transparent 55%)' }}
          />
        </div>

        <div className="relative flex items-center justify-between">
          <h3 className="font-serif text-lg font-semibold text-sc-text flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm" style={{ background: 'color-mix(in srgb, var(--sc-accent) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-accent) 18%, transparent)' }}>💾</span>
            <span>{t('export.title')}</span>
          </h3>
          <button
            onClick={() => setExportModalOpen(false)}
            className="flex items-center justify-center w-11 h-11 rounded-full text-sc-text-faint hover:text-sc-text transition-colors"
            style={{ background: 'color-mix(in srgb, var(--sc-line) 14%, transparent)' }}
            aria-label="Close export dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab bar — glass pill */}
        <div className="relative flex flex-wrap sm:flex-nowrap rounded-2xl sm:rounded-full p-1 gap-1" style={{ background: 'color-mix(in srgb, var(--sc-surface) 86%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)', backdropFilter: 'blur(8px)' }}>
          {([
            { id: 'audio' as const, label: t('export.audioTab'), icon: '♪' },
            { id: 'image' as const, label: t('export.imageTab'), icon: '🖼' },
            { id: 'video' as const, label: 'Video', icon: '▶' as const },
          ]).map((tab) => {
            const active = exportType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setExportType(tab.id); setDownloadReady(false); setExportError(''); setSaveOutcome(null); }}
                // Full-width stacked targets on a phone; equal thirds from sm up.
                className="w-full sm:w-auto sm:flex-1 flex items-center justify-center gap-1.5 rounded-2xl sm:rounded-full text-xs font-semibold transition-all duration-200 min-h-[44px]"
                style={{
                  background: active ? 'var(--sc-accent)' : 'transparent',
                  color: active ? 'var(--sc-on-accent)' : 'var(--sc-text-soft)',
                  boxShadow: active ? '0 0 18px -4px rgba(var(--sc-accent) / 0.45), 0 1px 4px rgba(0,0,0,0.14)' : 'none',
                  border: active ? '1px solid transparent' : '1px solid transparent',
                }}
              >
                <span className="text-[11px]">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Preview area — dashed border + icon */}
        <div
          className="relative rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[96px] overflow-hidden"
          style={{
            background: 'color-mix(in srgb, var(--sc-surface) 55%, transparent)',
            border: '1.5px dashed color-mix(in srgb, var(--sc-accent) 22%, transparent)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {/* Subtle grid dots in preview bg */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07] rounded-xl"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(var(--sc-line) / 0.9) 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }}
            aria-hidden
          />

          {isExporting ? (
            <div className="relative flex flex-col items-center gap-3 py-1">
              {/* Pulsing ring + waveform */}
              <div className="relative w-14 h-14 flex items-center justify-center">
                <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(var(--sc-accent) / 0.18)' }} />
                <span className="absolute inset-1 rounded-full animate-pulse" style={{ border: '2px solid rgba(var(--sc-accent) / 0.45)' }} />
                <span className="relative flex items-end gap-[3px] h-6">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full animate-pulse"
                      style={{
                        background: 'var(--sc-accent)',
                        height: `${10 + (i % 2 === 0 ? 10 : 4)}px`,
                        animationDelay: `${i * 120}ms`,
                        animationDuration: '0.7s',
                      }}
                    />
                  ))}
                </span>
              </div>
              <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--sc-accent)' }}>
                {exportType === 'image' ? t('export.imageRendering') : exportType === 'video' ? t('export.videoRendering') : t('export.rendering')}
              </span>
              {exportType === 'video' && videoProgress && (
                <span className="text-[11px] font-mono" style={{ color: 'var(--sc-text-faint)' }}>
                  Frame {videoProgress.done} / {videoProgress.total}
                </span>
              )}
            </div>
          ) : downloadReady ? (
            <div className="relative flex flex-col items-center gap-2 py-1">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold status-ok"
                style={{ background: 'rgba(34,197,94,0.16)', border: '1px solid rgba(34,197,94,0.28)' }}
              >
                ✓
              </span>
              <span className="text-xs font-semibold status-ok">
                {exportType === 'video' ? t('export.videoReady') : exportType === 'image' ? t('export.imageDownloaded') : t('export.downloaded')}
              </span>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', color: 'var(--sc-text-faint)', border: '1px solid color-mix(in srgb, var(--sc-line) 12%, transparent)' }}>
                {video?.filename ?? `mathsonify.com-${sanitizeFilename(exportType === 'video' && activeEquationName ? activeEquationName : equation)}.${exportType === 'video' ? videoExtensionForMimeType(videoMime) : exportType === 'image' ? imageFormat : 'wav'}`}
              </span>
            </div>
          ) : (
            <>
              <span className="relative text-2xl opacity-80">
                {exportType === 'image' ? '🖼️' : exportType === 'video' ? '🎬' : '🎵'}
              </span>
              <span className="relative text-xs font-medium text-sc-text-soft text-center leading-snug">
                {exportType === 'image' ? 'High-res graph snapshot' : exportType === 'video' ? 'Animated graph video + audio' : 'Synthesized audio file'}
              </span>
              <span className="relative text-[11px] font-mono px-2 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--sc-accent) 10%, transparent)', color: 'var(--sc-accent)', border: '1px solid color-mix(in srgb, var(--sc-accent) 14%, transparent)' }}>
                {equation}
              </span>
            </>
          )}
        </div>

        {/* Specs */}
        <div className="relative p-4 rounded-xl space-y-2 text-xs" style={{ background: 'color-mix(in srgb, var(--sc-surface) 70%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 11%, transparent)', backdropFilter: 'blur(6px)' }}>
          <div className="flex justify-between">
            <span className="text-sc-text-faint">{t('export.equation')}</span>
            <span className="font-mono text-sc-accent">{equation}</span>
          </div>
          {exportType === 'audio' ? (
            <>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.audioFormat')}</span><span className="font-mono text-sc-text">{t('export.formatValue')}</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.duration')}</span><span className="font-mono text-sc-text">{duration} {t('export.seconds')}</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.synthesisVoice')}</span><span className="font-mono text-sc-text capitalize">{instrument}</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.estimatedSize')}</span><span className="font-mono text-sc-text">{audioSizeMB} MB</span></div>
            </>
          ) : exportType === 'video' ? (
            <>
              <div className="flex justify-between"><span className="text-sc-text-faint">Format</span><span className="font-mono text-sc-text">{videoFormatLabel}</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.duration')}</span><span className="font-mono text-sc-text">{duration} {t('export.seconds')}</span></div>
              {activeEquationName && (
                <div className="flex justify-between"><span className="text-sc-text-faint">Equation</span><span className="font-mono text-sc-text">{activeEquationName}</span></div>
              )}
              {activeScientist && (
                <div className="flex justify-between"><span className="text-sc-text-faint">Scientist</span><span className="font-mono text-sc-text">{activeScientist.name}</span></div>
              )}
              <div className="flex justify-between"><span className="text-sc-text-faint">Resolution</span><span className="font-mono text-sc-text">{videoResolutionLabel}</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.duration')}</span><span className="font-mono text-sc-text">{duration} {t('export.seconds')}</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">Canvas</span><span className="font-mono text-sc-text">{t('export.resolution2x')}</span></div>
            </>
          )}
        </div>

        {exportError && (
          <div className="relative p-3 rounded-xl text-xs status-error" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)' }}>
            {exportError}
          </div>
        )}

        {exportType === 'image' && (
          <div className="relative space-y-3">
            {/* 2D / 3D — only while a 3D viewer is mounted. Defaults to 3D
                (the user opened the export from 3D mode); 2D is the
                familiar picture export. */}
            {threeDApi && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-sc-text-soft">View</span>
                <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
                  {(['2d', '3d'] as const).map((dim) => (
                    <button
                      key={dim}
                      type="button"
                      onClick={() => setImageDimension(dim)}
                      className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
                      style={{
                        background: imageDimension === dim ? 'var(--sc-accent)' : 'transparent',
                        color: imageDimension === dim ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
                        boxShadow: imageDimension === dim ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
                      }}
                    >
                      {dim === '2d' ? '2D' : '3D'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-sc-text-soft">{t('export.imageFormat')}</span>
              <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
                {(['png', 'jpeg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setImageFormat(fmt)}
                    className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
                    style={{
                      background: imageFormat === fmt ? 'var(--sc-accent)' : 'transparent',
                      color: imageFormat === fmt ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
                      boxShadow: imageFormat === fmt ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
                    }}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-sc-text-faint">Est. file size: <span className="font-mono text-sc-text-soft">{imageSizeLabel}</span> · 2× retina · includes MathSonify.com watermark</p>
            {/* 360° turntable picture (v30) — only in the 3D image tab: one
                PNG with four views (0°/90°/180°/270°) instead of the single
                view. Each view carries the billboard watermark. */}
            {threeDApi && imageDimension === '3d' && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-sc-text-soft">360° picture</span>
                <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
                  {([
                    { id: false, label: 'Single view' },
                    { id: true, label: '🔄 Turntable · 4 views' },
                  ]).map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setImage360(opt.id)}
                      className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
                      style={{
                        background: image360 === opt.id ? 'var(--sc-accent)' : 'transparent',
                        color: image360 === opt.id ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
                        boxShadow: image360 === opt.id ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {orientationPicker}
            {colourPicker}
          </div>
        )}

        {exportType === 'video' && (
          <div className="relative space-y-3">
            {/* 2D / 3D — only while a 3D viewer is mounted. Defaults to 3D
                (the user opened the export from 3D mode). The 3D clip is a
                frame-exact render of the live 3D scene. */}
            {threeDApi && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-sc-text-soft">View</span>
                <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
                  {(['2d', '3d'] as const).map((dim) => (
                    <button
                      key={dim}
                      type="button"
                      onClick={() => setVideoDimension(dim)}
                      className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
                      style={{
                        background: videoDimension === dim ? 'var(--sc-accent)' : 'transparent',
                        color: videoDimension === dim ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
                        boxShadow: videoDimension === dim ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
                      }}
                    >
                      {dim === '2d' ? '2D' : '3D'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 360° orbit (v30) — only for the 3D video: the camera circles
                the scene once over the clip (turntable style), starting from
                the view on screen now. On by default; the billboard
                watermark stays readable from every angle. */}
            {threeDApi && videoDimension === '3d' && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-sc-text-soft">🔄 360° orbit</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={videoPrefs.orbit360}
                  onClick={() => setVideoPrefs((p) => ({ ...p, orbit360: !p.orbit360 }))}
                  className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
                  style={{
                    background: videoPrefs.orbit360 ? 'var(--sc-accent)' : 'color-mix(in srgb, var(--sc-surface) 80%, transparent)',
                    color: videoPrefs.orbit360 ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
                    border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)',
                    boxShadow: videoPrefs.orbit360 ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
                  }}
                >
                  {videoPrefs.orbit360 ? 'On · camera circles once' : 'Off · fixed view'}
                </button>
              </div>
            )}
            {orientationPicker}
            <div className="flex items-center justify-between">
              <span className="text-xs text-sc-text-soft">Quality</span>
              <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
                {(['480p', '720p', '1080p'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setVideoPrefs((p) => ({ ...p, quality: q }))}
                    className="px-3 rounded-full text-xs font-semibold transition-all min-h-[44px]"
                    style={{
                      background: videoQuality === q ? 'var(--sc-accent)' : 'transparent',
                      color: videoQuality === q ? 'var(--sc-on-accent)' : 'var(--sc-text-faint)',
                      boxShadow: videoQuality === q ? '0 0 10px -2px rgba(var(--sc-accent)/0.35)' : 'none',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-sc-text-faint">
              Est. file size: <span className="font-mono text-sc-text-soft">{videoSizeLabel}</span> · {videoFormatLabel}
            </p>
            {colourPicker}
            {videoBlocked && (
              <p className="p-3 rounded-xl text-xs status-error" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)' }}>
                {UNSUPPORTED_RECORDING_MESSAGE}
              </p>
            )}
            {offlineSupported && audioCodec === null && (
              <p className="p-3 rounded-xl text-xs" style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.32)', color: 'var(--sc-text-soft)' }}>
                This browser cannot encode audio for the offline render (no AAC or Opus), so video exports use the live recorder and motion may stutter. For a frame-exact clip, use Chrome or Edge.
              </p>
            )}
            {/* Inline review of the recorded clip, plus the one Save action. */}
            {video && (
              <div className="space-y-2">
                <video
                  src={video.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-lg border border-sc-line/20 bg-black"
                  style={{ aspectRatio: videoOrientation === 'portrait' ? '9 / 16' : '16 / 9' }}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={handleSaveVideo}
                    disabled={isSaving}
                    className="flex-1 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-h-[44px] disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(135deg, var(--sc-accent) 0%, color-mix(in srgb, var(--sc-accent) 82%, white 10%) 100%)',
                      color: 'var(--sc-on-accent)',
                      border: '1px solid color-mix(in srgb, var(--sc-accent) 30%, transparent)',
                    }}
                  >
                    {isSaving ? '…' : '⬇ Save video'}
                  </button>
                </div>
                <p className="text-[11px] font-mono break-all text-sc-text-faint">
                  {video.filename}
                  {saveOutcome === 'shared' && ' · saved via share sheet'}
                  {saveOutcome === 'downloaded' && ' · downloaded'}
                  {saveOutcome === 'cancelled' && ' · share sheet dismissed — tap Save to try again'}
                </p>
              </div>
            )}
            {videoNote && (
              <p className="p-3 rounded-xl text-xs" style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.32)', color: 'var(--sc-text-soft)' }}>
                {videoNote}
              </p>
            )}
          </div>
        )}

        {exportType === 'audio' && (
          <p className="relative text-[11px] text-sc-text-faint">Est. file size: <span className="font-mono text-sc-text-soft">{audioSizeMB} MB</span> · 44.1 kHz WAV</p>
        )}

        <div className="relative">
          {exportType === 'image' ? (
            <button
              type="button"
              disabled={isExporting}
              onClick={imageDimension === '3d' && threeDApi ? (image360 ? handleExport3DTurntableImage : handleExport3DImage) : handleExportImage}
              className="w-full rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-h-[44px] disabled:cursor-not-allowed"
              style={{
                background: isExporting ? 'color-mix(in srgb, var(--sc-accent) 42%, transparent)' : 'linear-gradient(135deg, var(--sc-accent) 0%, color-mix(in srgb, var(--sc-accent) 82%, white 10%) 100%)',
                color: 'var(--sc-on-accent)',
                boxShadow: isExporting ? 'none' : '0 0 20px -6px rgba(var(--sc-accent)/0.45), 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.14)',
                border: '1px solid color-mix(in srgb, var(--sc-accent) 30%, transparent)',
              }}
            >
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{t('export.imageRendering')}</span>
                </>
              ) : downloadReady ? (
                <><span>✓</span><span>{t('export.imageDownloaded')}</span></>
              ) : (
                <span>{t('export.imageDownload')}</span>
              )}
            </button>
          ) : exportType === 'video' ? (
            <button
              type="button"
              disabled={isExporting || videoBlocked}
              onClick={handleExportVideo}
              className="w-full rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-h-[44px] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: isExporting ? 'color-mix(in srgb, var(--sc-accent) 42%, transparent)' : 'linear-gradient(135deg, var(--sc-accent) 0%, color-mix(in srgb, var(--sc-accent) 82%, white 10%) 100%)',
                color: 'var(--sc-on-accent)',
                boxShadow: isExporting ? 'none' : '0 0 20px -6px rgba(var(--sc-accent)/0.45), 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.14)',
                border: '1px solid color-mix(in srgb, var(--sc-accent) 30%, transparent)',
              }}
            >
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{t('export.videoRendering')}</span>
                </>
              ) : downloadReady ? (
                <><span>✓</span><span>{t('export.videoDownloaded')}</span></>
              ) : (
                <span>{t('export.videoDownload')}</span>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExportWav}
              className="w-full rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-h-[44px] disabled:cursor-not-allowed"
              style={{
                background: isExporting ? 'color-mix(in srgb, var(--sc-accent) 42%, transparent)' : 'linear-gradient(135deg, var(--sc-accent) 0%, color-mix(in srgb, var(--sc-accent) 82%, white 10%) 100%)',
                color: 'var(--sc-on-accent)',
                boxShadow: isExporting ? 'none' : '0 0 20px -6px rgba(var(--sc-accent)/0.45), 0 2px 8px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.14)',
                border: '1px solid color-mix(in srgb, var(--sc-accent) 30%, transparent)',
              }}
            >
              {isExporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>{t('export.rendering')}</span>
                </>
              ) : downloadReady ? (
                <><span>✓</span><span>{t('export.downloaded')}</span></>
              ) : (
                <span>{t('export.renderDownload')}</span>
              )}
            </button>
          )}
        </div>

        <div className="relative pt-2 flex items-center justify-between text-[11px] text-sc-text-faint" style={{ borderTop: '1px solid color-mix(in srgb, var(--sc-line) 10%, transparent)' }}>
          <span>{t('export.clientSide')}</span>
          <button onClick={() => setExportModalOpen(false)} className="text-sc-text-soft hover:text-sc-text min-h-[44px] px-3">
            {t('export.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
