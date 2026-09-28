export const MUSIC_LAB_INSTRUMENTS = [
  { id: 'grand-piano', name: 'Grand Piano', category: 'keys', icon: '🎹', accent: '#4C8DF6', defaults: { pitch: 0, intensity: 70, brightness: 50, warmth: 35 } },
  { id: 'electric-piano', name: 'Electric Piano', category: 'keys', icon: '🎹', accent: '#5BA8F5', defaults: { pitch: 0, intensity: 70, brightness: 56, warmth: 40, fm: 34 } },
  { id: 'rhodes', name: 'Rhodes', category: 'keys', icon: '🎹', accent: '#3E7ED8', defaults: { pitch: 0, intensity: 65, brightness: 42, warmth: 52, fm: 22 } },
  { id: 'synth-keys', name: 'Synth Keys', category: 'keys', icon: '🎹', accent: '#4C8DF6', defaults: { pitch: 0, intensity: 70, brightness: 60, warmth: 30 } },
  { id: 'organ', name: 'Organ', category: 'keys', icon: '🎹', accent: '#6FA4E8', defaults: { pitch: 0, intensity: 70, brightness: 58, warmth: 40 } },
  { id: 'acoustic-guitar', name: 'Acoustic Guitar', category: 'guitars', icon: '🎸', accent: '#D9A05B', defaults: { pitch: 0, intensity: 70, brightness: 50, warmth: 40 } },
  { id: 'clean-electric', name: 'Clean Electric', category: 'guitars', icon: '🎸', accent: '#E0B573', defaults: { pitch: 0, intensity: 70, brightness: 44, warmth: 38 } },
  { id: 'distorted-guitar', name: 'Distorted Guitar', category: 'guitars', icon: '🎸', accent: '#C8803C', defaults: { pitch: 0, intensity: 80, brightness: 58, warmth: 30 } },
  { id: 'bass-guitar', name: 'Bass Guitar', category: 'guitars', icon: '🎸', accent: '#B87A46', defaults: { pitch: -12, intensity: 75, brightness: 30, warmth: 60 } },
  { id: 'violin', name: 'Violin', category: 'strings', icon: '🎻', accent: '#3FB49A', defaults: { pitch: 0, intensity: 65, brightness: 52, warmth: 48 } },
  { id: 'cello', name: 'Cello', category: 'strings', icon: '🎻', accent: '#2E8F7C', defaults: { pitch: -12, intensity: 65, brightness: 36, warmth: 62 } },
  { id: 'string-ensemble', name: 'String Ensemble', category: 'strings', icon: '🎻', accent: '#57C6AD', defaults: { pitch: 0, intensity: 60, brightness: 46, warmth: 50 } },
  { id: 'trumpet', name: 'Trumpet', category: 'brass', icon: '🎺', accent: '#E9B444', defaults: { pitch: 0, intensity: 70, brightness: 68, warmth: 26 } },
  { id: 'french-horn', name: 'French Horn', category: 'brass', icon: '🎺', accent: '#C99A3F', defaults: { pitch: -5, intensity: 65, brightness: 40, warmth: 58 } },
  { id: 'trombone', name: 'Trombone', category: 'brass', icon: '🎺', accent: '#DCA83A', defaults: { pitch: -8, intensity: 70, brightness: 54, warmth: 46 } },
  { id: 'flute', name: 'Flute', category: 'woodwinds', icon: '🎵', accent: '#6FD1CE', defaults: { pitch: 0, intensity: 60, brightness: 58, warmth: 30 } },
  { id: 'clarinet', name: 'Clarinet', category: 'woodwinds', icon: '🎵', accent: '#5FC3C0', defaults: { pitch: 0, intensity: 60, brightness: 42, warmth: 48 } },
  { id: 'saxophone', name: 'Saxophone', category: 'woodwinds', icon: '🎵', accent: '#4FB5B2', defaults: { pitch: 0, intensity: 65, brightness: 50, warmth: 44 } },
  { id: 'analog-lead', name: 'Analog Lead', category: 'synth', icon: '⚡', accent: '#C86BFF', defaults: { pitch: 0, intensity: 70, brightness: 66, warmth: 30 } },
  { id: 'soft-pad', name: 'Soft Pad', category: 'synth', icon: '☁️', accent: '#A66BFF', defaults: { pitch: 0, intensity: 55, brightness: 32, warmth: 62 } },
  { id: 'supersaw', name: 'Supersaw', category: 'synth', icon: '⚡', accent: '#B85CFF', defaults: { pitch: 0, intensity: 70, brightness: 70, warmth: 30 } },
  { id: 'pluck-synth', name: 'Pluck', category: 'synth', icon: '✨', accent: '#D07BFF', defaults: { pitch: 0, intensity: 70, brightness: 62, warmth: 34 } },
  { id: 'sub-bass', name: 'Sub Bass', category: 'bass', icon: '🔊', accent: '#8B5CF6', defaults: { pitch: -24, intensity: 80, brightness: 14, warmth: 80 } },
  { id: 'synth-bass', name: 'Synth Bass', category: 'bass', icon: '🔊', accent: '#7C5CF0', defaults: { pitch: -12, intensity: 75, brightness: 32, warmth: 55 } },
  { id: 'finger-bass', name: 'Finger Bass', category: 'bass', icon: '🔊', accent: '#6E4FE0', defaults: { pitch: -12, intensity: 75, brightness: 26, warmth: 60 } },
  { id: 'kick', name: 'Kick', category: 'drums', icon: '🥁', accent: '#F59E0B', defaults: { pitch: -12, intensity: 85, brightness: 40, warmth: 20 } },
  { id: 'snare', name: 'Snare', category: 'drums', icon: '🥁', accent: '#E8892B', defaults: { pitch: -5, intensity: 85, brightness: 66, warmth: 20 } },
  { id: 'closed-hat', name: 'Closed Hat', category: 'drums', icon: '🥁', accent: '#F7C24B', defaults: { pitch: 0, intensity: 80, brightness: 88, warmth: 10 } },
  { id: 'open-hat', name: 'Open Hat', category: 'drums', icon: '🥁', accent: '#EEB63C', defaults: { pitch: 0, intensity: 75, brightness: 84, warmth: 15 } },
  { id: 'tom', name: 'Tom', category: 'drums', icon: '🥁', accent: '#D97706', defaults: { pitch: -7, intensity: 80, brightness: 48, warmth: 30 } },
  { id: 'clap', name: 'Clap', category: 'drums', icon: '👏', accent: '#F0743F', defaults: { pitch: 0, intensity: 80, brightness: 74, warmth: 15 } },
  { id: 'crash', name: 'Crash', category: 'drums', icon: '🥁', accent: '#FBBF24', defaults: { pitch: 0, intensity: 85, brightness: 90, warmth: 10 } },
  { id: 'percussion', name: 'Percussion', category: 'drums', icon: '🥁', accent: '#C2831A', defaults: { pitch: 4, intensity: 80, brightness: 70, warmth: 25 } },
  { id: 'sitar', name: 'Sitar', category: 'world', icon: '🎵', accent: '#10B981', defaults: { pitch: 0, intensity: 65, brightness: 54, warmth: 38 } },
  { id: 'kalimba', name: 'Kalimba', category: 'world', icon: '🎵', accent: '#34D399', defaults: { pitch: 0, intensity: 65, brightness: 48, warmth: 44 } },
  { id: 'marimba', name: 'Marimba', category: 'world', icon: '🎵', accent: '#22C55E', defaults: { pitch: 0, intensity: 70, brightness: 56, warmth: 40 } },
];

export const MUSIC_LAB_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'keys', label: 'Keys' },
  { id: 'guitars', label: 'Guitars' },
  { id: 'strings', label: 'Strings' },
  { id: 'brass', label: 'Brass' },
  { id: 'woodwinds', label: 'Woodwinds' },
  { id: 'synth', label: 'Synth' },
  { id: 'bass', label: 'Bass' },
  { id: 'drums', label: 'Drums' },
  { id: 'world', label: 'World' },
];

export function getInstrument(id: string) {
  return MUSIC_LAB_INSTRUMENTS.find(i => i.id === id) || MUSIC_LAB_INSTRUMENTS[0];
}

export function filterInstruments(category: string, search: string) {
  let result = MUSIC_LAB_INSTRUMENTS;
  if (category !== 'all') result = result.filter(i => i.category === category);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(i => i.name.toLowerCase().includes(q) || i.category.includes(q));
  }
  return result;
}