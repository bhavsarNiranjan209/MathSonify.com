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

  // Privacy Policy (US spellings overridden to UK)
  'privacy.s1Desc1':
    'MathSonify was designed from the ground up as a <strong class="text-sc-text">zero-data application</strong>. We don\'t just minimise data collection — we eliminated it entirely. There are no servers processing your equations, no databases storing your patterns, and no analytics pipelines watching your interactions. When you close your browser, nothing about your session exists anywhere except on your own device.',
  'privacy.s3Note3':
    'Remembers your last export choices: orientation and quality for image and video exports (landscape/portrait, 480p/720p/1080p) and the curve colour (white/blue/green/purple). Value: a small JSON object.',

  // Terms of Use (US spellings overridden to UK)
  'terms.s2Desc1':
    'MathSonify is a browser-based creative tool that converts mathematical expressions into audio in real time. It uses the Web Audio API to synthesise sound from equations, renders visualisations on an HTML Canvas element, and runs entirely on your local device — no server-side processing is involved.',
};

export default enGB;
