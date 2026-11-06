/**
 * visualizerModes — the 2D-graph mode tabs (2D curve, Waveform, Spectrum,
 * Lissajous, Mandala) with their icons.
 *
 * WHY THIS IS ITS OWN MODULE: the icons lived inline in Visualizer.tsx and
 * were silently destroyed by a Latin-1/UTF-8 double-encoding — the file
 * contained mojibake like 'ðŸ“ˆ' (the bytes of 📈 read as Latin-1) and the
 * tabs rendered garbage ("∂Y~", "â€¢", "â—Z"). Keeping the list here, as
 * plain data with a test, means a future encoding accident fails a test
 * instead of shipping garbled tabs again.
 *
 * The icons are real Unicode characters (emoji / symbols), never ASCII art:
 * every code point is >= U+2000 (or U+FE0F, the emoji variation selector).
 */
import type { VisualizerMode } from '../store/studioStore';

export interface VisualizerModeButton {
  id: VisualizerMode;
  label: string;
  icon: string;
}

export const VISUALIZER_MODES: VisualizerModeButton[] = [
  { id: '2d-graph', label: '2D curve', icon: '📈' },
  { id: 'waveform', label: 'Waveform', icon: '〰️' },
  { id: 'spectrum', label: 'Spectrum', icon: '📊' },
  { id: 'particles', label: 'Lissajous', icon: '◉' },
  { id: 'mandala', label: 'Mandala', icon: '🏵️' },
];
