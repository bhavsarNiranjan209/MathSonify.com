import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStudioStore } from '../store/studioStore';

// The QR encoder is only fetched when the QR panel is actually opened, so
// copying a plain text link never downloads it.
const ShareQrPanel = lazy(() => import('./ShareQrPanel'));

export default function ShareModal() {
  const shareModalOpen = useStudioStore((s) => s.shareModalOpen);
  const setShareModalOpen = useStudioStore((s) => s.setShareModalOpen);

  const equation = useStudioStore((s) => s.equation);
  const instrument = useStudioStore((s) => s.instrument);
  const sonificationMode = useStudioStore((s) => s.sonificationMode);
  const duration = useStudioStore((s) => s.duration);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const reduceMotion = !!useReducedMotion();

  // Build query string — src=ms brands every shared URL as MathSonify-origin
  const params = new URLSearchParams({
    eq: equation,
    inst: instrument,
    mode: sonificationMode,
    dur: duration.toString(),
    minX: minX.toString(),
    maxX: maxX.toString(),
    src: 'sc',
  });

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://mathsonify.com';
  const shareUrl = `${baseUrl}/studio?${params.toString()}`;
  const shareText = `Created with MathSonify.com — listen to what the equation "${equation}" sounds like!`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'MathSonify - Math into Music',
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopy();
    }
  };

  const socialLinks = [
    {
      name: 'X (Twitter)',
      icon: '𝕏',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: 'WhatsApp',
      icon: '💬',
      url: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`,
    },
    {
      name: 'Reddit',
      icon: '🤖',
      url: `https://www.reddit.com/submit?title=${encodeURIComponent(`Sound of Math: ${equation}`)}&url=${encodeURIComponent(shareUrl)}`,
    },
  ];

  return (
    <AnimatePresence>
      {shareModalOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-sc-bg/85"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShareModalOpen(false)}
          />

          <motion.div
            className="relative w-full max-w-md panel p-6 space-y-5"
            initial={reduceMotion ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.95, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={reduceMotion ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.95, y: 16, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.25 }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold text-sc-text flex items-center gap-2">
                <span>🔗</span>
                <span>Share equation</span>
              </h3>
              <button
                onClick={() => setShareModalOpen(false)}
                className="p-1 rounded-md text-sc-text-faint hover:text-sc-text transition-colors"
                aria-label="Close share dialog"
              >
                ✕
              </button>
            </div>

            {/* Branded preview pill */}
            <div className="flex items-center gap-2 py-2 px-3 bg-sc-accent/10 border border-sc-accent/30 rounded-md">
              <span className="text-sm">⚡</span>
              <span className="text-xs font-semibold text-sc-accent">Created with MathSonify.com</span>
              <span className="text-xs text-sc-text-faint">&middot; mathsonify.com</span>
            </div>

            {/* Equation preview */}
            <div className="p-3 bg-sc-surface border border-sc-line/15 rounded-md">
              <div className="text-[11px] font-mono text-sc-text-faint mb-1">Equation</div>
              <div className="font-mono text-sm text-sc-accent font-medium">{equation}</div>
              <div className="text-xs text-sc-text-soft mt-1">
                Instrument: {instrument}, Mode: {sonificationMode}
              </div>
            </div>

            {/* Link + copy */}
            <div>
              <label className="block text-xs font-semibold text-sc-text-soft mb-2">
                Shareable URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 panel-inset text-xs font-mono text-sc-text select-all focus:outline-none focus:ring-1 focus:ring-sc-accent/50"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
                    copied
                      ? 'bg-sc-live text-sc-on-live'
                      : 'bg-sc-accent text-sc-on-accent hover:bg-sc-accent/90'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQr((v) => !v)}
                  aria-expanded={showQr}
                  className="px-4 py-2 rounded-md text-xs font-semibold transition-colors bg-sc-surface border border-sc-line/25 text-sc-text-soft hover:border-sc-accent hover:text-sc-text"
                >
                  {showQr ? 'Hide QR' : 'QR code'}
                </button>
              </div>
            </div>

            {/* Same share URL, as a scannable symbol. */}
            {showQr && (
              <div className="pt-1">
                <Suspense fallback={<p className="text-[11px] text-sc-text-faint">Loading QR…</p>}>
                  <ShareQrPanel url={shareUrl} />
                </Suspense>
              </div>
            )}

            {/* Social */}
            <div>
              <label className="block text-xs font-semibold text-sc-text-soft mb-2">
                Broadcast
              </label>
              <div className="grid grid-cols-3 gap-2">
                {socialLinks.map((s) => (
                  <a
                    key={s.name}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`py-2 px-3 rounded-md bg-sc-surface border border-sc-line/20 text-center text-xs font-medium text-sc-text-soft flex items-center justify-center gap-1.5 transition-colors hover:border-sc-accent hover:text-sc-text`}
                  >
                    <span>{s.icon}</span>
                    <span>{s.name}</span>
                  </a>
                ))}
              </div>

              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  onClick={handleNativeShare}
                  className="w-full mt-2 py-2 btn-ghost text-xs"
                >
                  Open device share sheet
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-sc-line/15 flex justify-end">
              <button
                onClick={() => setShareModalOpen(false)}
                className="px-4 py-1.5 btn-ghost text-xs"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}