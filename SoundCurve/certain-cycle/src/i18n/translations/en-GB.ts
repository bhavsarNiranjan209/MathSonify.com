/**
 * British English — a small override dictionary on top of American English.
 *
 * Only the strings whose spelling differs are listed here; every other key
 * falls back to `en` per-key (see `t()` in `../index`). That keeps the two
 * English variants in sync by construction: a new string is added once, in
 * `en.ts`, and both variants show it until a British spelling is needed.
 */
const enGB = {
  // Navigation
  'nav.analog': 'Analogue',

  // Home — Features
  'home.feature2Desc':
    'From pure sine and triangle to analogue saw, 8-bit square, resonant piano body, and plucked-string synthesis.',
  'home.feature3Desc':
    'Microtonal pitch sweeps, scale quantisation, rhythmic peak triggers, and chord voicings.',

  // Studio
  'studio.subtitle':
    'Type any mathematical expression, read its geometry from the paper, and press play to synthesise its acoustic resonance.',

  // Audio
  'audio.musicalScale': 'Musical scale quantisation',

  // Instrument labels
  'inst.sawtoothDesc': 'Bright analogue brass',

  // Equations
  'equations.tag': 'mathematical catalogue',
};

export default enGB;
