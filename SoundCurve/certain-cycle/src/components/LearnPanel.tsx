/**
 * Learn mode — a live readout of what the engine is playing right now.
 *
 * The values arrive from `audioEngine` via the store, already derived from the
 * exact sample point being synthesised. This component does no maths of its
 * own: it formats numbers. That is deliberate — anything recomputed here could
 * drift from the sound, which is the one thing this panel must not do.
 */
import { useStudioStore } from '../store/studioStore';
import type { PlaybackPitch } from '../utils/sonificationMapping';

const fmt = (n: number, places = 3) =>
  Number.isFinite(n) ? n.toFixed(places) : '—';

/**
 * Format the pitch for display, honestly.
 *
 * Rhythm and chord modes have no pitch — y drives loudness and triggering — so
 * showing a fabricated "Hz" there would be a lie the user cannot detect. Those
 * modes report the real quantity instead.
 */
function formatPitch(pitch: PlaybackPitch | undefined): string {
  if (!pitch) return '—';
  switch (pitch.kind) {
    case 'hz':
      return `${fmt(pitch.hz, 1)} Hz`;
    case 'scaled':
      return `${fmt(pitch.hz, 1)} Hz (scaled)`;
    case 'amplitude':
      return `${Math.round(pitch.value * 100)}% level`;
  }
}

function formatPan(pan: number | undefined): string {
  if (pan === undefined || !Number.isFinite(pan)) return '—';
  const pct = Math.round(Math.abs(pan) * 100);
  if (pct < 1) return 'centre';
  return pan < 0 ? `${pct}% left` : `${pct}% right`;
}

export default function LearnPanel() {
  const learnMode = useStudioStore((s) => s.learnMode);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const readout = useStudioStore((s) => s.readout);

  if (!learnMode) return null;

  // Announced politely: this updates 60x a second and must not spam a screen
  // reader, which would make the app unusable with one on.
  return (
    <div
      className="p-3 rounded-md bg-sc-surface border border-sc-accent/30 font-mono text-xs space-y-1"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-sc-accent">Learn mode</span>
        {!isPlaying && !readout && (
          <span className="text-[10px] text-sc-text-faint">press play</span>
        )}
      </div>
      <Row label="x" value={readout ? fmt(readout.x) : '—'} />
      <Row label="y" value={readout ? fmt(readout.y) : '—'} />
      <Row label="frequency" value={formatPitch(readout?.pitch)} />
      <Row label="pan" value={formatPan(readout?.pan)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sc-text-faint">{label}</span>
      <span className="text-sc-text tabular-nums">{value}</span>
    </div>
  );
}