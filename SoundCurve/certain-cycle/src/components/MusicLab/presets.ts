import { createEmptyProject } from '../../utils/musicLabProject';

/** Starter templates — real editable projects, wired through the store. */
export const QUICK_PRESETS = [
  { id: 'empty', name: 'Blank Canvas', blurb: 'Start silent with one empty track.' },
  { id: 'midnight', name: 'Midnight Study', blurb: 'Piano motif over a soft drone.' },
  { id: 'neon', name: 'Neon Pulse', blurb: 'Bright pluck with driving drums.' },
] as const;

export type QuickPresetId = (typeof QUICK_PRESETS)[number]['id'];

export function emptyProject() {
  return createEmptyProject('Untitled Study');
}
