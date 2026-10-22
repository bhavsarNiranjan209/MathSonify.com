# MATHSONIFY — MASTER SPECIFICATION (v1)

Single source of truth for the whole site. Everything below is either **built**, **specified and
awaiting verification**, or **on hold**. The Status Ledger (section 12) says which. Where this document
says "verify in repo", the author could not see the code — check before changing anything.

---

## 0. HOW TO USE THIS DOCUMENT (read first, agent)

1. **Audit before building.** For every item, inspect the repo and mark DONE / PARTIAL / NOT DONE with a
   file path as evidence. Do not rewrite things that already work.
2. **One agent writes to the repo at a time.** Commit after every finished item. Touch only the files of
   the current task.
3. **Evidence or it didn't happen.** "Done" requires: test output, and for UI a screenshot (desktop AND a
   390x844 phone viewport, dark AND light). A passing test suite is not proof a page looks right.
4. **Diagnose before fixing bugs.** Name the root cause. "Not reproducing, cause unknown" is an acceptable
   status; "fixed" without a cause is not.
5. **No new dependencies** without checking bundle size and saying so. three.js is already present and is
   lazy-loaded.
6. **Do not touch held features** (section 11): SoundLab, Music Lab, Draw, Premium internals.
7. Never invent copy for legal pages. Flag statements that need an owner decision instead.

---

## 1. PRODUCT

**Name:** MathSonify — **mathsonify.com** (early working name SoundCurve is retired; remove any leftover).
**One line:** Type an equation, see its shape, hear it. Mathematics as living sound.
**Homepage headline:** "Turn mathematics into *living*sound" (italic serif on "living").
**Audience:** students, curious people, teachers, musicians, creative coders. A first-time visitor must
understand the product within seconds.
**Principles**
- The sound must be *derived from the equation* — deterministic, explainable, never random.
- Instrument, not a form: controls feel like an instrument; the equation is the reward for curiosity.
- Free core experience, **no login, no account** for anything at launch.
- Calm, precise, slightly playful. Never childish. Restraint over spectacle; motion only answers an action
  (exceptions: the documented soft glows).
- Privacy-first: equations are processed on the device. Any backend added later must be minimal and disclosed.
- Every on-screen/in-video reference to an equation is labelled **"Equation: …"** — never bare text.

---

## 2. ARCHITECTURE & STACK

- **Astro** (static pages) + **React islands** (`client:only` for Studio) + **TypeScript** + **Tailwind**
  (design tokens `sc-*`) + **zustand** (`useStudioStore`) + **mathjs** (AST parsing, never `eval`).
- **Web Audio API** only (no audio libraries). **Canvas 2D** for 2D graphs/visualizers. **three.js** only for
  the 3D view, loaded with a dynamic import (≈578 kB, never in first-load JS).
- Project root is **`certain-cycle/`** (not repo-root `src/`). Tests: `node:test` runner (not vitest) — keep it.
- Hosting: **Vercel** (static build + optional serverless functions). Domain is the only purchase.
- i18n: **20 locales**, strings via `data-i18n` / `applyStaticTranslations` (assigns `textContent` — put
  `data-i18n` on an inner `<span>` when the parent contains other markup, e.g. the glowing Studio link).
- Browser storage: `localStorage` only. Keys: `mathsonify-theme` (`light|dark`), `mathsonify-lang`.
  Any new key (daily challenge, sound toggle) MUST be added to the Privacy Policy.
- Third-party requests at launch: none (self-host fonts — see section 9).

---

## 3. DESIGN SYSTEM

**Dark palette (locked):** background `#0B0B0D`, panel `#121215`, equation box `#17181B`, border `#2A2A30`,
text `#F5F5F2`, muted `#9A9AA2`, curve/accent `#FFFFFF`, primary button `#E8E8E6` (text `#080A0C`).
**Light palette:** warm background (~`#F1EFE9`), panel `#FFFFFF`, text `#14161A`, muted `#6B6F76`, border
`#E1DED5`, primary button `#14161A` (text `#F5F4F0`). Light mode is a real palette, not an inversion; every
interactive element must stay readable. Use the site's Tailwind tokens; do not hardcode hex in components.
**Typography:** Instrument Serif (headlines; italic for emphasis), Inter (UI/body), JetBrains Mono
(equations, labels, badges, numbers). Self-hosted.
**Components:** pill badges (outlined), equation boxes (mono, `#17181B`), primary = solid light button,
secondary = outlined; toggles `aria-pressed`; touch targets ≥ 44px; visible focus rings.
**Motion:** soft breathing glows only (2.6–3.4 s, ease-in-out, small alpha delta, never a flicker).
Studio nav link: white glow 3.2 s, alpha 0.22→0.50, text colour left theme-legible. Special equation cards:
accent-coloured glow pulse 2.6 s. Funny Questions chip: one-shot 2 s SVG-turbulence "wavy border" ripple on
load and on every click, then settles. `prefers-reduced-motion`: disable large motion, keep function.
**Shareable visual language:** dark near-black, white glowing curve, mono equation pill, serif headings.

---

## 4. GLOBAL SYSTEMS

**Navigation (all pages):** logo "MathSonify.com" · How It Works · **Studio** (glow) · Guess · Scientists ·
Equations · About · right side: Light/Dark toggle, language selector (EN ▾). Mobile: collapses to a menu.
Name is **Studio** everywhere (nav, footer, buttons: "Open Studio"). No "Create", "Creation Studio",
"Sound Studio".
**Footer (all pages):** brand + "An interactive mathematical audio experiment and creative sonification
platform — turn math into music." + mono tagline (currently "zero backend · 100% Web Audio API" — update
the moment any backend exists). Columns: Product (Studio, Equation Library, How It Works, Equation Guide
[verify target exists], Famous Scientists) · Architecture (items must be real links or visibly plain text,
not text styled like links) · About (About MathSonify, Free and open access) · Legal (Privacy Policy,
Terms of Use, Contact Us). Bottom: "© 2026 MathSonify. All mathematical expressions sonified
deterministically." + "Open Studio".
**Routes:** `/` · `/how-it-works` · `/studio` (`/create` redirects, preserving `?eq=`; add a real 301 in
`vercel.json`) · `/guess` · `/scientists` · `/equations` · `/about` · `/contact` · `/privacy` · `/terms` ·
`/premium` (hold, noindex) · 404 · held: `/soundlab`, `/music-lab`, `/draw` (render `FeatureBuildingState`,
noindex, not linked). Planned: `/s` (share-preview route) and `/api/og`.
**SEO:** per-page title/description, `site` = final domain, canonical, OG/Twitter tags + default OG image,
robots.txt, sitemap, favicon set, `lang`, noindex on 404/premium/held pages.
**Accessibility:** semantic HTML, keyboard operable, focus visible, `aria-label` on canvases, ARIA on
toggles, WCAG contrast in both themes, `prefers-reduced-motion`. "Describe curve" gives a spoken, template-
based description (Web Speech Synthesis).
**Performance:** page-load JS stays small (home ≈ 222 kB measured); lazy-load three.js and the QR lib;
render-on-demand canvases; pause animation when off-screen; cap pixel ratio at 2; no second audio engine,
no second parser, no second WebGL canvas. Never leave an animation loop running after leaving a page.
**Error handling:** invalid equation → friendly message ("We couldn't understand that equation. Try
something like sin(x) or x^2 + 3x + 2."). `StudioErrorBoundary` shows a visible panel + Reload. The
`#sc-preloader` has independent dismissal paths + an unconditional ~8 s failsafe that reveals
`#sc-startup-error`. Nothing may fail silently into a blank screen.

---

## 5. CORE ENGINES (shared by every page)

### 5.1 Equation pipeline (single path, used everywhere)
raw text → (paste card only) **`normalizePasted()`** → **normalisation** (√→sqrt, π→pi, ×→*,
÷→/, superscripts ²³→^2 ^3) → **Σ unrolling** (typed form `sum(k=0,12, expr)` and pasted Σ with bounds are
expanded into a finite explicit sum before parsing; the parser never sees Σ) → **typo correction** ("Did
you mean sin(x)? [Use this]" — doubled letters sinn/coss/taan, sqtr→sqrt, one missing ")"; never silently
rewrite) → **mathjs AST compile** → sampler. Unparseable → friendly error. No `eval`, ever.
**Math keyboard:** tabs Arithmetic / Compare / Algebra / Trig / Geometry / Calculus; opened from the
"View all 12+" control in Studio. Mobile: bottom sheet; the equation field stays fully visible above the
backdrop blur; the sheet itself is darker/opaque so it doesn't look hazy.

### 5.2 Sampling
600–800 points over `[x_min, x_max]` (default ≈ [-6.28, 6.28]). Per point: (x, y), slope
`dy/dx ≈ [f(x+dx) − f(x−dx)] / 2dx`, curvature. Non-finite values are kept as gaps. One shared
`SamplePoint[]` source feeds audio, 2D, 3D and export (custom/freehand curves use the evaluated spline).

### 5.3 Audio engine (Web Audio)
x → time (left to right scan); y → pitch (normalised into the frequency bounds, default ≈ 220–750 Hz,
highest point of sin(x) plays A5 880 Hz in the hero demo); slope → biquad lowpass cutoff (steeper =
brighter); amplitude → gain. Chain: Oscillator(s) → BiquadFilter → gain envelope (ADSR) →
DynamicsCompressor → Analyser → destination (no clipping, ever). **Instruments:** Sine, Triangle, Saw,
Square, Piano-style, Pluck. **Sonification modes:** Continuous (microtonal sweep), Scale notes (quantised),
Rhythm (peaks trigger hits), Chords (harmonic voicings). **Controls:** Play/Pause/Stop, Volume (default
70%), Duration (default 4 s), Speed, Low/High pitch bounds, Loop. **Stereo pan** tied to y (toggle, on by
default). Deterministic: same equation + settings = same sound. One `stopAudio()` path; never two voices
overlapping. AudioContext is created/resumed only after a user gesture.

### 5.3a Graph engines (new shared code — see `graph-fix/`)
- `plotMath.ts` — pure maths shared by 2D and 3D: `niceTicks` (1/2/5 steps, exact negatives, includes 0),
  `formatTick`, `robustRange` (trims asymptotes when range/5–95%-band > 10; measured: tan 37, 1/x 81, sec 31
  vs x³ 1.4, exp 2.7, x¹⁰ 1.7), `splitSegments`, `computeView` (one affine map for x and y; negative data
  sits below the zero axis; axis drawn at 0 or the nearest edge).
- `plot2d.ts` — 2D renderer: grid, axes, ghost curve and **tick numbers painted once into an offscreen
  layer**; every frame = clear → drawImage(layer) → bright curve → head dot. (Fixes "readings disappear when
  I press Play" — the old redraw wiped them every frame.)
- `Curve3DViewer.tsx` — 3D view: transparent canvas (card background shows through), light mode has **no
  filled floor** (shadow catcher + black grid lines; dark mode keeps the filled dark floor), grid lines
  sit on tick values (floor + back wall), arrowhead axes, tick dashes + number chips on the front-bottom /
  front-left edges at constant on-screen size, curve parametrised by sample index (matches 2D + audio),
  ghost curve + bright traced tube while playing, damped orbit, pointer/pinch/wheel, double-click resets,
  render-on-demand, pauses off-screen, full dispose + `forceContextLoss`, visible fallback message instead
  of a blank canvas, "y-range trimmed" note when asymptotes were trimmed. Theme is detected from the real
  background colour behind the viewer and re-read on theme change.
- Playback is read through `getProgress()` (no React re-renders). 3D is **view-only**; editing is 2D only.

### 5.4 Shared state
`useStudioStore` is the single source of truth: equation, parsed function, sampled curve, instrument,
mode, parameters, playback (`progress`, playing). 2D, 3D, audio, export, learn mode all read it. How It
Works mirrors its own engine into the store (`publishTransport`) so the 3D face stays in sync with the 2D
face. Nothing keeps a private copy of the equation.

### 5.5 Export & share
- **WAV:** client-side, 16-bit 44.1 kHz stereo.
- **Video:** 60 fps canvas capture, ≥ 8 Mbps at 720p. Format detection (mp4/H.264 first for Safari, then
  vp9/vp8/webm), inline preview, **Web Share API** with the file on phones, download fallback. Layered
  animated background (drifting glow, parallax grid, vignette), corner-to-corner bouncing watermark
  "MathSonify · mathsonify.com", 1.1 s intro card + 1.1 s outro card ("Made with MathSonify.com").
  *User mode:* pill "Equation: …" only. *Scientist mode* (equation came from the Scientists library): name
  pill in italic serif + continuously scrolling bottom ticker (name · field · "Equation: …"), watermark
  kept clear of the ticker. *Fun/featured equations:* curve in the equation's accent colour, label is
  **only** "Equation: …" — never captions like "I love you". Export reads **live state** (including custom
  curves and speed), never a separate re-render path.
- **3D image export:** renders one frame and calls `toBlob()` in the same task (no
  `preserveDrawingBuffer`), composes a footer band ("Equation: …" left, "mathsonify.com" right), longest
  side ≤ 2048 px, fills the (transparent) canvas with the resolved card colour first, restores the view in
  `try/finally`, Web Share with download fallback.
- **Share link:** `/studio?eq=<encoded>` (plus `sci`/`eqName` for scientist equations). **QR code**
  generated client-side from the same URL. Planned: `/s` + `/api/og` so previews show the real curve.

---

## 6. PAGES

### 6.1 Home `/` — locked: Hero → Quote/CTA → Footer. Nothing else.
- Eyebrow "mathematical acoustics". Headline "Turn mathematics into *living*sound". Subtitle: "Type an
  equation. Read its geometry from the paper, press play, and hear its harmonics synthesized through the
  Web Audio API in real time."
- Buttons: **Open Studio** (solid) and **Browse the library** (outlined → /equations).
- Hero graph card: sin(x)cos(3x), footer "sampled at 800 points", gets a visible **Play/Pause** (loops,
  same progressive-reveal mechanic as everywhere else). One **Surprise me** button beside the existing
  "quick experiments" chips (Pure Sine Wave, Pure Cosine Wave, Tangent Curve) — loads a random library
  equation into this small graph. No new sections.
- Quote box: "Wait… you can actually hear the geometry of mathematics?" + one-sentence description +
  "Start creating in Studio". Then the footer.

### 6.2 How It Works `/how-it-works` — an experience, not documentation
Order: **hero** (eyebrow "try it yourself", headline "How math becomes music", subtitle) with, left:
`f(x) =` input, preset chips (sin(x), cos(x), sin(x)+0.5·sin(2x), x², sin(x²), sin(x)·cos(2x)), readout
"Highest point of the curve plays A5 (880 Hz).", mode selector "How the curve is read" (Frequency / Note /
Rhythm / Chord) with a one-line explanation; right: **small** demo card (≈340 px) — equation label, a
**2D/3D toggle** (card flip; the 3D face is the real orbit/zoom viewer, `touchAction="pan-y"`, wheel zoom
needs Ctrl/Cmd so the page still scrolls), one shared Play/Pause that loops and drives both faces.
Then six mapping cards: Height→Pitch, Width→Time, Amplitude→Dynamic range, Oscillations→Repetition,
Steepness→Tone brightness, Curvature→Rate of change (only mappings the engine really does).
Then "The same journey, every time" — accordion 01 Mathematics, 02 Geometry, 03 Motion, 04 Sound, 05 Music.
Then a collapsed-by-default **"Under the hood"** (AST parsing, sampling + derivative, acoustic mapping,
Web Audio chain, audio-visual sync). Then a two-card "Where this goes next": **Scientists** and
**Equations**. Final CTA "Open Studio". There must be exactly one footer at the end — no leftover old page.
3D card requirements: prefetch the viewer chunk (card in viewport / button hover), skeleton fallback,
dispose on unmount (flip 20× → no WebGL-context warning), canvas `aria-label`, reduced motion respected.

### 6.3 Studio `/studio` — the product
Header: "MathSonify Studio", eyebrow "interactive audio synthesizer · studio v1.0", description, chips
"Space play or stop" and (desktop) "? shortcuts".
**Left column**
0. *Paste equation card* (small, ABOVE the equation card). A second, separate input mode for formulas copied
   from anywhere: textarea (multi-line allowed), example chips, a tidy "EQUATION" line, interpretation notes,
   a friendly error with the supported-formats list, **sliders for unknown constants** (k, a, b, n…; −20…60),
   Clear, and "Use the equation bar instead". **Exactly one of {paste card, equation bar} is active at a time**
   (`inputMode: 'bar' | 'paste'` in the store; default `bar`). The inactive card is dimmed with a veil +
   "Use …" button; while paste is active the equation bar shows NO equation; each side keeps its own text and
   restores it on switch. Graph, audio, 3D, export, share/QR and Learn mode read only the active source.
   Conversion = `normalizePasted()` (see `paste-card/`): plain text, LaTeX, Unicode, word-form sums,
   Σ/Π with any bounds, roots (√ ∛ \sqrt[n]{}), |x| bars, sin 2x / sin²x / sin^-1, kx → k·x, y= / f(x)= prefixes,
   unknown constants → sliders, sin(t) → sin(x). Domain auto-fits when most default-domain samples are
   undefined (e.g. √(3−x²)). Real roots for odd-denominator exponents ((−8)^(1/3) = −2). Not supported
   (clear message): implicit curves, piecewise, integrals, derivatives, inequalities, x = f(y), polar/parametric.
1. *Equation card:* title "Mathematical equation" · **Surprise me** · **Library**. Input `f(x) =` with
   keyboard and clear buttons, placeholder "Type an equation — e.g. sin(x) * cos(3*x)" (plain typing only — NO special paste handling), live
   validity line ("✓ Valid mathematical expression"). "Insert function": sin cos tan x² x³ √x eˣ ln π |x|.
   "Popular presets": Pure Sine Wave, Pure Cosine Wave, Tangent Curve, Chirp / Accelerating Wave, Harmonic
   Knot / Lissajous, and **View all 12+ → opens the math keyboard** (not the library; Library has its own
   button). "Domain and sampling range" (expandable).
2. *Audio card, in this order:* **Play audio** (+ reset) → **Learn mode · Stereo pan · Describe curve** →
   instrument picker (Sine, Triangle, Saw, Square, Piano, Pluck) → "How the math makes sound" (Continuous,
   Scale notes, Rhythm, Chords) → Volume, Duration, Speed, Frequency bounds (Low/High pitch), Loop playback →
   **Export WAV and Share LAST**. "Space starts and stops the sound."
**Right column — graph panel** (one panel, never a second card): header toggle **2D Graph / 3D Graph**
(flip animation, same shared state and playhead). 2D tabs: 2D curve, Waveform, Spectrum, Lissajous,
Mandala; **Grid** toggle; **Edit** (sculpt the curve by control points with soft falloff; Reset; Exit edit;
Ctrl/Cmd+Z undo, +Shift redo). The 2D curve always shows tick numbers, including while playing. Footer
readout "Domain: [a, b]" and "Ready for playback". Below: callout "How math creates sound: as the playhead
scans along x, the vertical elevation y(x) controls oscillator frequency while the slope dy/dx modulates
filter brightness and timbre."
**3D:** view-only (orbit 360°, zoom, pan, double-click reset); dark = filled floor, light = lines only;
numeric ticks derived from the active equation; updates live when the 2D equation changes; tall/wide
equations (incl. Σ sums) render or show an explicit fallback message.
**Learn mode:** live readout `x`, `y`, `frequency` from the same sampled data the engine plays.
**Describe curve:** template-based spoken description from real curve properties (extrema count, trend,
symmetry, amplitude) — deterministic, not AI.
**Defaults/deep links:** no `?eq=` → **equation of the day** (deterministic hash of the local date into the
main equation library, computed on the client at mount; invalid entries are skipped); explicit `?eq=`
always wins. **"?"** opens the shortcuts modal (ignored inside inputs / with Ctrl-Cmd-Alt; lists only wired
shortcuts: Space, undo/redo while editing). **Save image** button in 3D. Mobile: graph fits, controls
≥ 44 px, math keyboard as bottom sheet.

### 6.4 Guess `/guess` — own nav tab, own 30-equation library (never merged with Equations)
**Flow:** difficulty choice (Easy = trig; Medium = beat + perc; Hard = chirp + decay + shape) or **Daily
challenge**. 10 rounds from a shuffled deck of 10 *distinct* equations. Each round: big play button with a
progress ring (tap again = stop; single `stopAudio()`), 4 options (3 distractors drawn from the **same
family**), curve stays hidden until answered, then green (correct) / red (wrong + the right one in green)
highlight, "Equation: …" reveal with the curve in the family colour, playful feedback line, small confetti
on correct, streak counter from 2. Progress = 10 segments (green/red/current). Mobile: auto-scroll
smoothly to the reveal after answering and back up on "Next round".
**Library (30), 6 families × 5:** trig — sin(x), cos(x), sin(x)+cos(x), sin(2x), cos(3x) ·
beat — sin(x)+sin(1.1x), sin(2x)·sin(3x), sin(x)·cos(5x), sin(x)+0.5sin(3x)+0.25sin(5x),
sin(x)+sin(2x)/2+sin(3x)/3 · chirp — sin(x²), 0.6·sin(x²), cos(x²), sin(x|x|), sin(2x²) · perc —
floor(3sin x), |sin x|, sign(sin x), ceil(x)−x, floor(x)−x · decay — sin(5x)e^(−0.1x²),
sin(5x)e^(−0.05|x|), sin(8x)e^(−0.2x²), cos(5x)e^(−0.1x²), sin(5x)/(1+x²) · shape — √(9−x²)sin(16x),
√(9−x²)cos(16x), sign(x)√|x|cos(14x), √(16−x²)−2+0.6sin(14x)e^(−0.05|x|), √(9−x²)cos(5x²).
Family colours: trig #E8E8E6, beat #5AA9E0, chirp #9B6BFF, perc #E0805A, decay #2DD4BF, shape #F5A623.
**End screen (tiers):** ≥9 perfect — arpeggio [523.25, 659.25, 783.99, 1046.5] Hz, gap .14 s, big gold
bursts, "Perfect pitch?!"; 3–8 good — [440, 523.25, 587.33] Hz, modest cool sparkle, "Good ear."; <3 — warm
descending [392, 329.63] triangle, **no confetti**, gentle breathing glow, encouraging copy (never mocking).
*(Open: the owner asked "10/10 / 3–8 / 0" — confirm where 9 and 1–2 belong.)*
**Daily challenge:** PRNG seeded by the local date drives the same deck + options + order for everyone;
one scored attempt per day; shareable plain-text result ("MathSonify Daily · Oct 8 · 7/10 🟩🟩🟥…" + link);
local day-streak; keys documented in the Privacy Policy.

### 6.5 Scientists `/scientists`
Eyebrow "hear the masters"; headline "Famous Scientists & Mathematicians"; search; filter chips All /
Physicists / Mathematicians; 3-column responsive grid of ~70+ cards (initials avatar, name, years, quote,
"N equations", **View Equations**). Opening a scientist lists their equations; each has **Remix this** →
`/studio?eq=…` (same deep-link helper as "Open in studio"; passes `sci`/`eqName` so scientist-mode export
works). Mobile performance: virtualise / load incrementally; verify on a throttled phone profile.

### 6.6 Equations `/equations` — "Equation acoustic reference"
Eyebrow "mathematical catalog"; search; chips in this order: **All Presets · Funny Questions ·
Trigonometric · Polynomials · Acoustic Waves · Chaos & Physics · Exponentials & Growth · Famous Math**.
Card anatomy (unchanged component): badge (`rare`), tag pair (waveform / mode), title, equation box,
description, bold "Sonic profile:" line, `Domain: [a, b]`, **Open in studio**.
**Funny Questions** sorts first in its category via a priority field: Heart `x^(2/3)+0.9cos(28x)·√(3−x²)`
[-1.73,1.73] (#E5484D, triangle/sweep) · Bloom `√(9−x²)·sin(16x)` [-3,3] (#F5A623, sine/tremolo) ·
Starburst `sign(x)·√|x|·cos(14x)` [-4,4] (#9B6BFF, square/burst) · Crown
`√(16−x²)−2+0.6sin(14x)e^(−0.05|x|)` [-4,4] (#2DD4BF, sawtooth/flutter) · Shell `√(9−x²)cos(5x²)` [-3,3]
(#38BDF8, sine/chirp), each with its description + sonic profile, a faint pulsing accent glow, then the
existing entries (Inverted Staircase, Ceiling Gap, Diamond Halo, …). The Funny Questions **chip** carries the
one-shot wavy-border ripple. Opening any card in Studio behaves identically; exports use the accent colour.

### 6.7 About `/about`
Eyebrow, "About MathSonify", subtitle. Cards: Our mission · Technical architecture · Privacy and open access.
**Required changes:** move the dense technical bullets (Zustand, biquad filters, compressors…) into a
collapsed "Under the hood"; add one short, genuine line about who built this and why; fix the eyebrow so it
matches the tone ("project manifesto" currently over-promises); optional "What's next" strip teasing
SoundLab / Music Lab / Draw (can double as a waitlist once a form exists); CTA "Open Studio".

### 6.8 Contact `/contact`
Eyebrow "resonance channel open"; "Let's make some noise"; waveform graphic; three cards — General Inquiries
(hello@), Bug Reports (bugs@), Collaborations (collab@); "The frequency of good ideas" carousel; Response
timing (2–3 business days; "URGENT" in the subject is prioritised); CTA.
**Required changes:** replace "Open source spirit" with feedback/feature-idea wording (there is no public
repo). Today these are `mailto:` links only → **no notification system exists**. Plan: real form (types:
General / Bug / Collab / Suggest an equation) → hosted form service or Vercel function → email + instant
phone ping; honeypot/Turnstile; privacy policy updated first. All five addresses (hello@, bugs@, collab@,
privacy@, legal@mathsonify.com) must exist or forward.

### 6.9 Privacy `/privacy` and Terms `/terms`
Privacy (v1.0, effective Sept 14, 2026): 01 philosophy · 02 what we do not collect · 03 local browser
storage · 04 third-party dependencies · 05 children's privacy · 06 changes. Terms: 01 acceptance · 02 what
MathSonify is · 03 license to use · 04 your content · 05 audio safety · 06 prohibited uses · 07 intellectual
property · 08 disclaimer · 09 limitation of liability · 10 modifications/termination.
**Required, copy-level:** one stated minimum age everywhere — **5+**, phrased as guidance ("safe and
appropriate for ages 5 and up"), not as contractual capacity; add a governing-law clause (owner decides
jurisdiction); list every localStorage key actually used; list every third party actually used (none after
self-hosting fonts); add Stripe/analytics/form-provider/link-preview disclosures only when those exist; the
"equations never leave your device" claim needs a qualifier once shared-link previews exist. Not legal
advice — get a real review before payments or data collection go live.

### 6.10 Premium `/premium` — **HOLD** (noindex, not linked)
Currently shows "$9/month", feature list, FAQ, "Continue to secure checkout", Buy Me a Coffee. Must **not**
take real payment for a product that is not live. It references SoundLab/Music Lab (future plans — keep).
Decision pending: waitlist ("notify me") vs. live billing; payment provider choice for an India-based seller
(check Stripe availability; merchant-of-record services handle global tax); Terms/Privacy updates.

### 6.11 404 — concept `y = 1/(x − 404)`, "This point doesn't exist."
Built: status chip, glitch-split "4 0 4" numerals with the asymptote through the zero, curve drawing in on
both sides, playhead that stalls at the break with a pulse ring, equation pill "undefined at x = 404",
buttons Back to MathSonify / Open Studio / Explore equations, tap-the-break → rising tone that cuts off.
Additions (prompted): numeral glitch every ~10–12 s (120–180 ms), faint drifting symbols near the break,
slow grid parallax, desktop-only pointer tilt on the graph panel, a ripple from the break every ~8–10 s.
All subordinate to the curve; all disabled under reduced motion.

---

## 7. FEATURE CATALOG (what exists, one line each)
Equation input · paste handling · typo correction · Σ unrolling · Unicode normalisation · math keyboard ·
presets · Surprise me · Library · 6 instruments · 4 sonification modes · ADSR + compressor · stereo pan ·
Learn mode · Describe curve · 2D graph with edit/undo/redo · 3D view (flip) · How It Works experience ·
Guess (30 eq, difficulty, daily challenge, tiered ending) · Scientists (~70, Remix this) · Equations (+
Funny Questions) · WAV / video / 3D-image export · share link + QR · equation of the day · shortcuts sheet ·
opt-in minimal sound UI (planned) · themes light/dark · 20 languages · 404 · legal pages.

---

## 8. PRIVACY & COPY CONSISTENCY RULES
- "zero backend / nothing leaves your device" is only true until a form, waitlist, OG function or billing is
  added. When that happens update: footer tagline, About, Privacy, Terms in the same change.
- localStorage keys list in Privacy must equal the keys in code (theme, lang, + any added).
- No claim of "open source", "proprietary compositions", or "all rights reserved" on pages that
  contradict each other.
- Use "Studio", "Equation:", "MathSonify" consistently.

---

## 9. BACKEND, HOSTING & LAUNCH PLAN
- Vercel serverless covers everything planned (form, waitlist, OG images, later billing webhooks). Railway
  only if a long-running/stateful service appears. Verify Vercel's current terms for commercial use
  (Premium/ads) before launch.
- Domain: confirm mathsonify.com is available and the name is clear of trademarks; WHOIS privacy, auto-
  renew; free DNS/email routing at the registrar or Cloudflare; www→apex redirect.
- Email: forward all five addresses to one inbox; contact form → provider email + phone ping.
- **Self-host fonts** (Instrument Serif, Inter, JetBrains Mono). Removes the only third-party request.
- Security headers via `vercel.json`: CSP (match self-hosted fonts), Referrer-Policy,
  X-Content-Type-Options, Permissions-Policy; long-cache static assets.
- Analytics: none today (a privacy feature). If added, cookieless only (Plausible / Umami / Cloudflare Web
  Analytics) and disclosed.
- Link previews (`/s`, `/api/og`): render a 1200×630 brand image with the same safe parser; treat `eq` as
  untrusted (length cap ≈ 200, timeout, sample cap, HTML-escape, immutable cache, generic image on error).
- Held pages return `FeatureBuildingState` + noindex. `astro dev` toolbar never ships (verify with
  `astro build && astro preview`).

---

## 10. QA PROTOCOL
**Per feature:** unit tests (`node:test`) + a headless-browser script for UI behaviour + screenshots
(desktop and 390×844, dark and light).
**Always-run checks:** `/studio` mounts (input visible, preloader gone ≤ 10 s) on dev AND preview · no
console errors · `npm test` green and the test count never silently drops · `npm run build` clean.
**Graph checks:** tick numbers visible before, during and after playback · negatives sit below the axis
and ticks include them (test x³ on [-10,10], sin(2x)·sin(3x), tan(x), a Σ-sum) · light mode shows black grid
lines and **no filled base** · theme toggle while in 3D updates everything · 2D edit updates 3D live ·
fps near 60 while orbiting · 20 flips → no "too many WebGL contexts" · 3D image never blank in either theme.
**Devices:** iOS Safari (audio unlock, mp4 export, share sheet, WebGL), Android Chrome, Firefox, desktop
Safari. **Content:** i18n gaps per locale (do not machine-translate legal text) · link audit (no `#` hrefs,
no dead footer items, every mailto exists).

---

## 11. ON HOLD (do not build, do not break)
- **SoundLab** (post-launch trailer feature): up to 6 combinable equations that merge into new music; a free
  library of 15 modifiable equations plus 15 proprietary ones; freemium limits (~2–3 plays / 24 h) —
  which will need accounts + a database (Supabase fits). **Music Lab**, **Draw** (prototype exists:
  scan-line reader, colour = instrument, 14 colours, pentatonic, undo/redo/eraser, exports), **A/B
  Comparison**, **Premium billing**, voice/photo/handwriting-to-equation, multi-variable surfaces,
  classroom live mode, remix/leaderboards, AI "magic button".

---

## 12. STATUS LEDGER (as of this document — verify against the repo)
**Confirmed built:** homepage trim · Studio rename + glow + `/create` redirect · Funny Questions chip order ·
paste handling · How It Works hero scale + dead-space fix + 2D/3D card + closing cards (19/19 checks) ·
shortcut modal + 3D image export (capture path confirmed) · Studio blank-page safety net (preloader
failsafe + error boundary + mount scripts).
**Reported done by the owner:** V2 features batch 1, video export rebuild, shape equations, 404 base +
extras, legal copy fixes, About restructure, Scientists virtualisation, urgent fixes.
**Delivered, needs integration/verification:** `graph-fix/` (shared tick maths, 2D renderer, 3D viewer —
tested: 12 math tests + 8 renderer checks pass; WebGL runtime still needs a real browser check).
**Pasted, unchecked:** equation of the day · Remix this · Guess difficulty · hero Surprise me · Guess daily
challenge · sound toggle.
**Held/undecided:** link previews (needs backend decision) · Contact form · Premium · self-hosted fonts and
launch-hardening list · SoundLab/Music Lab/Draw.

## 13. OPEN DECISIONS (owner)
1. Contact notification method (hosted form vs own function; default: hosted form + email forwarding).
2. Guess end-screen tier boundaries (where do 9 and 1–2 go?).
3. Premium: waitlist vs live billing; provider; India-seller constraints.
4. Governing-law jurisdiction for Terms.
5. Analytics yes/no (and which, if yes).
6. Which upgrades ship before launch: sound UI · page transitions · Scientists timeline · first-run hint.
