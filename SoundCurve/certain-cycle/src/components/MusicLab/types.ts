import type { MusicLabTrack } from '../../data/musicLabInstruments';
import type { MusicLabProject } from '../../utils/musicLabProject';

/** One piano-roll note in pixel space (used by PianoRoll + Inspector). */
export interface RollNoteLayout {
  block: MusicLabTrack['notes'][number];
  left: number;
  width: number;
  top: number;
  label: string;
  pitchName: string;
}

export interface HoveredNote {
  id: string;
  x: number;
  y: number;
  label: string;
}

/** Built-in quick-start templates (rendered by PresetsBar from store data). */
export interface QuickPreset {
  id: string;
  name: string;
  blurb: string;
}

/** Which bottom workspace panel is open — shared by MusicLab + MobileWorkspace. */
export type PanelId = 'timeline' | 'notes' | 'drums' | 'graph' | 'mixer' | 'inspector';

export interface TransportSnapshotLike {
  state: string;
  positionBeats: number;
}

export interface SharedStudioProps {
  project: MusicLabProject;
  selected: MusicLabTrack | null;
  playing: boolean;
  loop: boolean;
  canUndo: boolean;
  canRedo: boolean;
  exporting: boolean;
  audioReady: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onRestart: () => void;
  onToggleLoop: () => void;
  onExport: () => void;
  onShare: () => void;
  onSave: () => void;
  onAddInstrument: (instrumentId: string) => void;
  onPreviewInstrument: (instrumentId: string) => void;
  onApplyPreset: (id: string) => void;
  onSurprise: () => void;
}
