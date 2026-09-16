import { useState } from 'react';
import { useStudioStore } from '../store/studioStore';
import { useTranslation } from '../i18n/index';
import { renderEquationToWavBlob } from '../utils/audioExporter';
import { exportGraphAsImage } from '../utils/graphExporter';
import { exportEquationVideo } from '../utils/videoExporter';

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

  const [exportType, setExportType] = useState<'audio' | 'image' | 'video'>('audio');
  const [isExporting, setIsExporting] = useState(false);
  const [downloadReady, setDownloadReady] = useState(false);
  const [exportError, setExportError] = useState('');
  const [imageFormat, setImageFormat] = useState<'png' | 'jpeg'>('png');

  if (!exportModalOpen) return null;

  const sanitizeFilename = (eq: string) =>
    eq.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();

  const handleExportImage = async () => {
    try {
      setIsExporting(true);
      setExportError('');
      await exportGraphAsImage(equation, {
        format: imageFormat,
        watermark: true,
        equationName: activeEquationName ?? undefined,
        scientistName: activeScientist?.name ?? undefined,
      });
      setDownloadReady(true);
      setIsExporting(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Image export failed');
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
      await exportEquationVideo({
        equation, equationName: activeEquationName, founderName: activeScientist?.name ?? null,
        minX, maxX, minFreq, maxFreq, duration, volume, instrument, sonificationMode, scale,
      });
      setDownloadReady(true);
      setIsExporting(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Video export failed');
      setIsExporting(false);
    }
  };

  const audioSizeMB = ((duration * 44100 * 4) / 1024 / 1024).toFixed(2);
  const imageSizeLabel = imageFormat === 'png' ? '~180–350 KB' : '~90–160 KB';
  const videoSizeLabel = `~${(duration * 0.31).toFixed(1)} MB`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(var(--sc-bg) / 0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
      <div
        className="relative w-full max-w-md p-6 space-y-5 rounded-2xl overflow-hidden"
        style={{
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
            className="flex items-center justify-center w-7 h-7 rounded-full text-sc-text-faint hover:text-sc-text transition-colors min-w-[28px] min-h-[28px]"
            style={{ background: 'color-mix(in srgb, var(--sc-line) 14%, transparent)' }}
            aria-label="Close export dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab bar — glass pill */}
        <div className="relative flex rounded-full p-1 gap-1" style={{ background: 'color-mix(in srgb, var(--sc-surface) 86%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)', backdropFilter: 'blur(8px)' }}>
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
                onClick={() => { setExportType(tab.id); setDownloadReady(false); setExportError(''); }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-all duration-200 min-h-[44px]"
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
            </div>
          ) : downloadReady ? (
            <div className="relative flex flex-col items-center gap-2 py-1">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ background: 'rgba(34,197,94,0.16)', border: '1px solid rgba(34,197,94,0.28)', color: '#22C55E' }}
              >
                ✓
              </span>
              <span className="text-xs font-semibold text-emerald-400">
                {exportType === 'image' ? t('export.imageDownloaded') : exportType === 'video' ? t('export.videoDownloaded') : t('export.downloaded')}
              </span>
              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', color: 'var(--sc-text-faint)', border: '1px solid color-mix(in srgb, var(--sc-line) 12%, transparent)' }}>
                mathsonify.com-{sanitizeFilename(exportType === 'video' && activeEquationName ? activeEquationName : equation)}.{exportType === 'video' ? 'webm' : exportType === 'image' ? imageFormat : 'wav'}
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
              <div className="flex justify-between"><span className="text-sc-text-faint">Format</span><span className="font-mono text-sc-text">WebM (VP9, 720p)</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.duration')}</span><span className="font-mono text-sc-text">{duration} {t('export.seconds')}</span></div>
              {activeEquationName && (
                <div className="flex justify-between"><span className="text-sc-text-faint">Equation</span><span className="font-mono text-sc-text">{activeEquationName}</span></div>
              )}
              {activeScientist && (
                <div className="flex justify-between"><span className="text-sc-text-faint">Scientist</span><span className="font-mono text-sc-text">{activeScientist.name}</span></div>
              )}
              <div className="flex justify-between"><span className="text-sc-text-faint">Resolution</span><span className="font-mono text-sc-text">1280 × 720 @ 30fps</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between"><span className="text-sc-text-faint">{t('export.duration')}</span><span className="font-mono text-sc-text">{duration} {t('export.seconds')}</span></div>
              <div className="flex justify-between"><span className="text-sc-text-faint">Canvas</span><span className="font-mono text-sc-text">{t('export.resolution2x')}</span></div>
            </>
          )}
        </div>

        {exportError && (
          <div className="relative p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.32)', color: '#F87171' }}>
            {exportError}
          </div>
        )}

        {exportType === 'image' && (
          <div className="relative space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-sc-text-soft">{t('export.imageFormat')}</span>
              <div className="flex rounded-full p-0.5 gap-0.5" style={{ background: 'color-mix(in srgb, var(--sc-surface) 80%, transparent)', border: '1px solid color-mix(in srgb, var(--sc-line) 13%, transparent)' }}>
                {(['png', 'jpeg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setImageFormat(fmt)}
                    className="px-3 rounded-full text-xs font-semibold transition-all min-h-[32px]"
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
          </div>
        )}

        {exportType === 'video' && (
          <p className="relative text-[11px] text-sc-text-faint">Est. file size: <span className="font-mono text-sc-text-soft">{videoSizeLabel}</span> · VP9 + Opus</p>
        )}

        {exportType === 'audio' && (
          <p className="relative text-[11px] text-sc-text-faint">Est. file size: <span className="font-mono text-sc-text-soft">{audioSizeMB} MB</span> · 44.1 kHz WAV</p>
        )}

        <div className="relative">
          {exportType === 'image' ? (
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExportImage}
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
              disabled={isExporting}
              onClick={handleExportVideo}
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
          <button onClick={() => setExportModalOpen(false)} className="text-sc-text-soft hover:text-sc-text min-h-[28px] px-2">
            {t('export.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
