import { useEffect, useRef } from 'react';
import { useStudioStore } from '../store/studioStore';
import { useTranslation } from '../i18n/index';

export default function ShortcutModal() {
  const open = useStudioStore((s) => s.shortcutModalOpen);
  const setOpen = useStudioStore((s) => s.setShortcutModalOpen);
  const { t } = useTranslation();
  const prevFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocused.current = document.activeElement as HTMLElement | null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      setTimeout(() => prevFocused.current?.focus(), 10);
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (e.target === e.currentTarget) setOpen(false);
    };
    const el = document.getElementById('shortcut-modal-overlay');
    el?.addEventListener('click', onClick);
    return () => el?.removeEventListener('click', onClick);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div id="shortcut-modal-overlay" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={t('shortcuts') || 'Keyboard shortcuts'}>
      <div className="bg-sc-surface border border-sc-line/20 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={() => setOpen(false)} aria-label="Close" className="absolute top-3 right-3 text-sc-text hover:text-sc-accent">✕</button>
        <h2 className="text-xl font-bold text-sc-text mb-4">Keyboard shortcuts</h2>
        <ul className="space-y-2 text-sm text-sc-text">
          <li><kbd className="font-mono bg-sc-surface border rounded px-1">Space</kbd> — Play / Pause</li>
          <li><kbd className="font-mono bg-sc-surface border rounded px-1">Ctrl+Z</kbd> / <kbd className="font-mono bg-sc-surface border rounded px-1">⌘+Z</kbd> — Undo while editing a curve (freehand edit)</li>
          <li><kbd className="font-mono bg-sc-surface border rounded px-1">Ctrl+Shift+Z</kbd> / <kbd className="font-mono bg-sc-surface border rounded px-1">⌘+Shift+Z</kbd> — Redo while editing a curve (freehand edit)</li>
        </ul>
        <p className="text-xs text-sc-text/50 mt-4">Press <kbd className="font-mono">?</kbd> to open, <kbd className="font-mono">Esc</kbd> or click outside to close.</p>
      </div>
    </div>
  );
}
