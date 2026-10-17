# MATHSONIFY / SOUNDCURVE — THE MASTER PROMPT (v1.0)

> The single, complete reference for this product: what it is, every feature,
> every page, every section, every system, every convention, and everything
> built so far. Use this document to brief a new developer, an AI agent, or a
> stakeholder without needing any other context.
>
> Brand name in the codebase and UI: **MathSonify.com** (project codename:
> SoundCurve; the deployed app folder is `certain-cycle/` inside the repo).

---

## 1. WHAT THE PRODUCT IS

**MathSonify is an interactive web app that turns mathematical equations into
sound and visual graphs.** The core loop is always the same:

```
equation → sampled curve → scanner walks left→right → every point becomes a note
```

- **Students** hear the shape of a sine, a polynomial, a famous physicist's equation.
- **Musicians** sculpt curves by hand and get melodies, or build instruments in Music Lab.
- **Educators** demonstrate functions sensually; **creative coders** export images/videos of the result.
- Everything runs **client-side and privacy-first**: no accounts, no servers for audio,
  no data leaves the browser except optional share links (equations encoded in the URL).

Taglines used across the site:
- "Turn Math Into Living Sound & Music" (hero)
- "Wait... you can actually hear the geometry of mathematics?" (homepage callout)

---

## 2. TECH STACK (as actually installed)

| Layer | Technology | Version |
|---|---|---|
| Framework | Astro | ^7.3.2 |
| UI islands | React + React DOM | ^19.3.0 |
| Styling | Tailwind CSS (via @astrojs/tailwind) | ^3.4.19 |
| State | Zustand | ^5.0.15 |
| Math parsing | math.js | ^15.2.0 |
| 3D rendering | three.js | ^0.186.1 |
| Animation | framer-motion | ^13.2.0 |
| QR codes | qrcode-generator | ^2.0.4 |
| Language | TypeScript | ^7.0.2 |
| Runtime | Node | >= 22.12.0 |
| Audio | Web Audio API (native, no library) | — |
| Video export | Canvas CaptureStream + MediaRecorder | — |
| Payments | Stripe (client-only checkout, publishable key) | — |

**Commands** (run inside `certain-cycle/`):
```bash
npm run dev        # astro dev (use `astro dev --background` per AGENTS.md)
npm run build      # astro build → dist/ (17 pages, ~7s)
npm run preview    # serve dist/ at http://localhost:4321
npm test           # node --test over src/**/*.test.ts  → currently 19,022 tests, ALL PASSING
```

**Repository layout note:** the live app is `certain-cycle/`. The repo root
(`SoundCurve/`) contains stale scaffolding (`src/tailwind.css`, old config files,
a separate unrelated `freellmapi/` project). All work happens in `certain-cycle/`.

---

## 3. SITE MAP — EVERY ROUTE

17 routes are built. Public visibility of three of them is controlled by feature flags.

| Route | Status | What it is |
|---|---|---|
| `/` | Public | Homepage: Hero + quote callout + CTA |
| `/studio` | Public | **The Studio** — main equation editor + graph + audio (flagship) |
| `/how-it-works` | Public | Interactive "math becomes music" demonstration page |
| `/guess` | Public | "Guess the Equation" — 10-round listening game |
| `/scientists` | Public | Archive of ~100 scientists/mathematicians + their equations |
| `/equations` | Public | Acoustic reference catalog of every supported function |
| `/about` | Public | Mission, tech stack, privacy-first architecture |
| `/contact` | Public | Contact section ("resonance channel open") |
| `/pricing` | Public | MathSonify Premium (Stripe checkout, Buy-Me-a-Coffee fallback) |
| `/privacy` | Public | Privacy policy |
| `/terms` | Public | Terms of service |
| `/soundlab` | **Flag-gated** (`soundLab`) | Multi-track equation compositions library + player |
| `/draw` | **Flag-gated** (`draw`) | Freehand drawing → always-on pentatonic scanner |
| `/music-lab` | **Flag-gated** (`musicLab`) | Mathematical instrument creation studio |
| `/create` | Redirect | Permanent redirect → `/studio`, preserves `?eq=...` query (old shared links) |
| `/404` | Error | "This Point Doesn't Exist" — curve runs off the graph |
| `/500` | Error | "The Equation Broke Somewhere" — curve destabilises and clips |

**Navbar order:** SoundLab (flag) → How It Works → Studio → Guess → Draw (flag)
→ Scientists → Equations → Music Lab (flag) → About. Fixed top bar, wordmark
"MathSonify.com" left, hamburger menu on mobile. SoundLab/Music Lab links have
animated gradient glows; Studio has a soft white breathing glow; all glows are
disabled under `prefers-reduced-motion`.

---

## 4. FEATURE FLAG SYSTEM

`src/config/featureFlags.ts` is the **single source of truth** for release control.

- `soundLab`, `draw`, `musicLab` — all default **false** (code stays in repo,
  routes render a "being built" state, nav entries are removed entirely — no gaps,
  no hidden DOM, nothing loaded by visitors).
- Build-time env overrides: `SOUNDLAB_ENABLED=true`, `DRAW_ENABLED=true`,
  `MUSICALAB_ENABLED=true`.
- Helpers: `isFeatureEnabled()`, `getVisibleNavLinks()`, `featureForRoute()`,
  `isRouteDisabled()` — route guards, navbar and SEO all read from here (never duplicated).
-
`src/utils/productConfig.ts` holds launch-phase config: `SOUNDLAB_PHASE`
  (teaser → early-access → limited-free → premium → full-release),
  `SOUNDLAB_FREE_PLAY_LIMIT` (default 3/day), `PREMIUM_ENABLED`, Stripe
  publishable key + price ID, contact email, Buy-Me-a-Coffee URL.
- `docs/feature-flags.md` documents the release process.

---

## 5. THE STUDIO (`/studio`) — FLAGSHIP FEATURE, IN DETAIL

One React island (`client:only="react"`), composed of:

### 5.1 Left column — controls
- **Equation input** (`EquationInput.tsx`): live text input with inline preview,
  caret-preserving edits, paste handling, typo correction
  (`utils/typoCorrection.ts`), and query-param bootstrapping
  (`?eq=`, `&inst=`, `&mode=`, `&dur=`, `&minX=`, `&maxX=`, `?sci=`, `&eqName=`).
- **Math symbol pad** (`MathSymbolPad.tsx`): tabbed symbol groups (π, √, trig,
  operators…), portal-rendered panel, tap feedback.
- **Audio controls** (`AudioControls.tsx`):
  - Instruments (6): `sine`, `triangle`, `sawtooth`, `square`, `piano`, `pluck`
  - Sonification modes (4): `frequency`, `note`, `rhythm`, `chord`
  - Scales (musical key/scale selection), volume, duration, speed, loop,
    min/max frequency range, stereo panning toggle (curve height → L/R pan).
- **Presets drawer** (`PresetDrawer.tsx`): curated equation templates by category.
- **Scientist modal** (`ScientistModal.tsx`): opens from `/scientists` cards via
  `mathsonify:open-scientist` CustomEvent; loads a scientist's equation into the Studio.

### 5.2 Right column — visualization
- **Visualizer** (`Visualizer.tsx`): canvas 2D renderer with 5 modes:
  `2d-graph`, `waveform`, `spectrum`, `particles`, `mandala`.
  Grid toggle, line width, curve color (null = theme default), zoom/pan,
  requestAnimationFrame loop that never allocates per frame.
- **3D viewer** (`Studio/Curve3DViewer.tsx`): lazy-loaded three.js chunk.
  - Visual direction: (1) the curve as a thin thread of light, (2) a small
    scanner/playhead on the curve, (3) faint mathematical space (fog, nearly
    invisible grid, faint axes). No shadows, no coloured floors.
  - Architecture: React owns equation/scene lifetime; the renderer owns camera
    and playhead. Playback progress arrives via **imperative Zustand store
    subscription** (~30–60 ticks/s) as a **shader uniform** — zero React
    re-renders, zero per-frame allocations. Geometry rebuilds only when the
    curve's identity changes.
  - Orbit / zoom / pan (`utils/orbitCamera.ts`), damped motion, idle camera
    drift (`IDLE_DRIFT`: ~0.6° sway, 30s+ period, resumes 3.2s after last
    interaction, disabled under `prefers-reduced-motion`).
  - `touchAction` prop: Studio uses `none` (drag orbits, page never scrolls);
    embedded cards opt into `pan-y` (horizontal = orbit, vertical = page scroll).
  - Accessible: `role="img"` + `aria-label="3D view of <equation>…"`; building
    state is a decorative self-drawing line (aria-hidden); error state is
    graph-level only (never takes down the Studio).
- **Curve sculpting** (`Studio/ControlPointLayer.tsx` + `utils/curveSpline.ts`):
  drag control points to deform the curve; brush radius (Tight↔Broad) deforms
  neighbourhoods; **"fit closest equation"** (`utils/curveFitting.ts`) reverse-maps
  a sculpted curve to the nearest known formula; reset restores the original.
- **Learn mode** (`LearnPanel.tsx` + `CurveDescriber.tsx`): live playback readout
  (x, y, note, frequency) emitted by the audio engine every frame; spoken + written
  curve description for blind/low-vision users.
- **Shortcut modal** (`ShortcutModal.tsx`): keyboard-shortcut reference.

### 5.3 Export & share
- **Export modal** (`ExportModal.tsx`):
  - **Image (PNG)** — `utils/graphExporter.ts` + `utils/render3DImage.ts`
    (renders one 3D frame offscreen for 3D exports).
  - **Video (WebM/MP4)** — `utils/videoExporter.ts`: 60fps, 1280×720 (≥8 Mbps;
    1080p scales up), container fallback H.264/mp4 → vp9 → vp8 → bare webm
    (never a silent mp4 fallback), extension always matches the container.
  - **Video scene branding** (`utils/videoScene.ts`): intro/outro cards, progress
    bar over the main segment, "Equation: …" label on every surface, and in
    **scientist mode** a ticker strip with scientist metadata; **user mode** has
    no ticker.
  - **Watermark** (`utils/watermark.ts`): animated travelling watermark that
    never overlaps the ticker strip in scientist mode; travels lower in user mode.
- **Share modal** (`ShareModal.tsx` + `ShareQrPanel.tsx`): builds a shareable URL
  with all parameters (`src=ms` brands every shared link as MathSonify-origin),
  copy-to-clipboard, QR code generation.

### 5.4 State (`src/store/studioStore.ts`, Zustand)
Single store holding: playback (isPlaying, progress, currentX/Y, readout),
audio params (volume, duration, speed, instrument, mode, scale, loop, min/maxFreq),
equation + bounds (equation, originalEquation, minX, maxX), sculpting state
(isEditingCurve, isCustomCurve, splineControlPoints, brushRadius, fitResult),
visualizer settings, active scientist context (synced to URL via replaceState),
modal flags, and `hasPendingChanges`.

### 5.5 Error containment
`Studio/StudioErrorBoundary.tsx` wraps panels so a renderer crash degrades one
panel, never the whole page.

---

## 6. HOW IT WORKS (`/how-it-works`) — THE EXPERIENCE PAGE

Rebuilt from "five numbered cards" into a **demonstration-first experience**:

1. **Hero**: "How math becomes music — not by describing it." Badge: "try it yourself".
2. **The Experience** (exactly ONE React island, `client:load`):
   - `HowItWorksExperience.tsx` — type/pick an equation, watch it morph into a
     curve (`utils/howItWorksMorph.ts`, eased 520ms morph, jumps instantly under
     reduced motion), a scanner walks it, sound plays. Live waveform + playhead.
   - **2D ↔ 3D flip card**: perspective flip between the 2D canvas and the
     lazy `Curve3DViewer` (embedded with `touchAction="pan-y"`).
   - Math helpers in `utils/howItWorksMath.ts`; unit tests in
     `howItWorks3d.test.ts`, `howItWorksMath.test.ts`, `howItWorksMorph.test.ts`.
3. **"The same journey, every time"** — the transformation as a numbered journey,
   revealed with native `<details>` accordions (keyboard accessible, zero script).
4. **Under the hood** — original technical explanation, preserved but collapsed.
5. **Closing**: cards to `/scientists` and `/equations` + "Open the Studio" CTA.

Performance discipline: one island, one canvas, one rAF loop; all other sections
are plain Astro markup (zero JS); faint CSS radial wash background that stops
under reduced motion.

**Verified behaviours (live-browser stress test, 11/11 passing):**
- Viewer chunk **prefetched** when the card nears the viewport (not on click).
- **20 flips** 2D↔3D produce **zero** WebGL-context warnings; last flip still renders.
- Canvas keeps its accessible name through everything.
- On a 390×844 touch viewport: canvas reflows (330×198), `touch-action: pan-y`,
  horizontal one-finger drag **orbits** (9.3% of frame changed) without scrolling,
  vertical drag **scrolls the page** (445→580) and does not orbit.
- Under emulated `prefers-reduced-motion`: flip has **no transition**, idle
  camera drift measures **0% pixel change over 1.4s**.

---

## 7. GUESS (`/guess`) — LISTENING GAME

NOT feature-flagged (self-contained): 10 rounds, 4 multiple-choice options per
round, built from a 30-equation library (`src/data/guessLibrary.ts`).

- Hear an equation sonified, name it, watch the curve revealed.
- `GuessGame.tsx` + `Guess/GuessCurveReveal.tsx` + `Guess/GuessConfetti.tsx`
  (confetti is aria-hidden and skipped entirely under reduced motion).
- Supporting logic: `guessRounds.ts` (round builder), `guessFeedback.ts`
  (tiered feedback), `guessLibrary.ts`, `celebrationTiers.ts`.
- Shares only the audio engine, curve sampler and canvas palette with the rest
  of the app.

---

## 8. SCIENTISTS (`/scientists`)

- ~100 server-rendered cards (SEO + no-JS access) from `src/data/scientists.ts`
  (Euler, Fourier, Curie, Planck, and many more — each with lifespan, tagline,
  portrait SVG in `public/scientists/`, and their real equations).
- Category filter chips + full-text search (vanilla script, delegated listener).
- `content-visibility: auto` + `contain-intrinsic-size` for mobile paint performance.
- Clicking a card fires `mathsonify:open-scientist(id)` → `ScientistModal`
  lists their equations → one click loads it into the Studio with scientist
  metadata attached (drives the video-export ticker).

---

## 9. EQUATIONS (`/equations`)

- Full acoustic reference catalog from `src/data/presets.ts` (categories,
  sort order, recommended settings per preset: instrument, mode, duration, bounds).
- Search + category chips; the "Funny Questions"/rare chip triggers a **liquid
  SVG ripple** (feTurbulence + feDisplacementMap, replayed via `beginElement()`).
- Every card has "Open in Studio" → `/studio?eq=…&inst=…&mode=…&dur=…&minX=…&maxX=…`.

---

## 10. SOUNDLAB (`/soundlab`) — FLAG-GATED

Proprietary multi-track equation compositions:

- **Library** (`SoundLab/SoundLabLibrary.tsx`): browse curated compositions from
  `src/data/compositionSets/` — `original.ts` (large flagship set), `harmonic.ts`,
  `atmosphere.ts`, `organic.ts`, `pulse.ts` — assembled by
  `compositionBuilder.ts` into typed tuples (`compositionTuple.ts`,
  `compositionTypes.ts`), validated by `compositionValidator.ts` (293 lines),
  catalogued/tested by `compositionCatalog.test.ts`.
- **Player** (`SoundLab/CompositionPlayer.tsx`): full transport, phase-aware
  gating (`playable`, `phase` props), prev/next navigation, framer-motion
  transitions that respect reduced motion.
- **Workspace** (`SoundLab/SoundLabWorkspace.tsx`): arrangement/editing surface.
- **Engine**: `compositionEngine.ts`, `soundLabLibrary.ts` (localStorage library),
  `soundLabStore.ts` (Zustand).
- **Phases** (productConfig): teaser → early-access → limited-free (3 free
  plays/day) → premium → full-release. One constant flips the whole product phase.

---

## 11. DRAW (`/draw`) — FLAG-GATED

- `FreehandDraw.tsx` + `utils/freehandDraw.ts` (stroke model),
  `freehandScanner.ts` (always-on scan line), `freehandAudio.ts` (pentatonic mapping).
- Draw freely with mouse/pen/finger (`touch-action: none` on the paper canvas,
  aria-labelled per tool: pen vs whole-stroke eraser); an always-on scanner
  turns every stroke into a looping pentatonic performance.

---

## 12. MUSIC LAB (`/music-lab`) — FLAG-GATED, PREMIUM FLAGSHIP

Mathematical instrument creation studio ("every sound traced back to an equation"):

- **Instrument browser** (`MusicLab/InstrumentBrowser.tsx`) from
  `src/data/musicLabInstruments.ts`.
- **Piano roll** (`PianoRoll.tsx` + `pianoRollHelpers.ts`) for note arrangement.
- **Timeline** (`Timeline.tsx`), **Track lanes** (`TrackLane.tsx`), **Transport**.
- **Master curve** (`MasterCurve.tsx`) — the equation that drives the instruments.
- **Inspector** (`Inspector.tsx`) — parameter editing per instrument.
- **Mixer** — per-channel mixing in `music-lab.css` layouts.
- **Presets** (`MusicLab/presets.ts`), **store** (`store.tsx` context +
  `src/store/musicLabStore.ts`), **engine**: `musicLabEngine.ts`,
  `musicLabSynth.ts`, `synthVoices.ts`, `musicLabEquation.ts` (equation →
  instrument mapping), `musicLabProject.ts` (save/load),
  `musicLabAccess.ts` (entitlement checks).
- Responsive from 980px → 700px breakpoints; all animation killed under
  reduced motion via CSS.

---

## 13. MARKETING / STATIC PAGES

- **Homepage** (`/`): Hero (floating "MATHEMATICAL ACOUSTIC EXPERIMENT" badge,
  "Turn Math Into Living Sound & Music", buttons "Open Sound Studio" +
  "Explore Library") → quote callout panel → CTA "Start creating in the Studio"
  → Footer. (Curated grid, feature grid and SoundLab teaser were deliberately
  removed to keep the homepage minimal.)
- **About**: mission, technology, privacy-first architecture.
- **Contact**: "Let's make some noise" — resonance/waveform themed.
- **Pricing**: MathSonify Premium — Music Lab, advanced instruments, full
  SoundLab, exports; Stripe client-only checkout + Buy-Me-a-Coffee fallback.
- **Privacy / Terms**: standard legal pages.
- **404**: "This Point Doesn't Exist" — animated graph-paper grid + axes, the
  curve runs off the edge and stops; links home.
- **500**: "The Equation Broke Somewhere" — same visual language, curve
  destabilises and clips; deliberately dependency-free (static markup + CSS +
  tiny inline retry script) so it renders even when the app is unhealthy;
  respects reduced motion while keeping the signal visible; `noindex`.

---

## 14. SHARED SYSTEMS

### 14.1 Audio engine (`src/utils/audioEngine.ts` + `synthVoices.ts`)
Web Audio API synthesis: oscillator-based instruments (incl. piano/pluck voices),
sonification mappings (`sonificationMapping.ts` — how y-values become
frequency/note/rhythm/chord), scale quantization, stereo panning from curve
height, playback readout emission for Learn mode.

### 14.2 Equation pipeline
`equationParser.ts` (math.js wrapper, sampling to `SamplePoint[]`, vertical-shift
helper) → `activeCurve.ts`/`useActiveCurve.ts` (single source of the current
curve: equation OR sculpted spline) → `curveSpline.ts` (control points, brush
deform) → `curveFitting.ts` (reverse fit) → `equationParams.ts` (URL param
encode/decode, 600 lines + 233 lines of tests) → `equationLabel.ts` ("Equation: …" prefixing).

### 14.3 3D pipeline
`curve3d.ts` (layout, ticks, tube geometry, framing), `curve3dAxes.ts` (labels,
arrowheads, tick dashes), `curve3dShaders.ts` (GLSL: curve ribbon + floor
shaders), `graph3dTheme.ts` (palettes, `CAMERA_DEFAULTS`, `IDLE_DRIFT`),
`orbitCamera.ts` (orbit/zoom/pan math), `surface3d.ts`, `render3DImage.ts`
(offscreen single-frame export), `renderOneFrame.ts`.

### 14.4 Export pipeline
`graphExporter.ts` (PNG), `videoExporter.ts` (MediaRecorder, codec ladder),
`videoScene.ts` (intro/outro/ticker/progress scene composition), `watermark.ts`,
`audioExporter.ts`, `fileSave.ts` (cross-browser download helper + tests),
`qr.ts` (share QR).

### 14.5 i18n (`src/i18n/`)
20 languages: **English, Spanish, French, German, Italian, Portuguese,
Dutch, Swedish, Danish, Norwegian, Finnish, Arabic, Japanese, Korean,
Chinese, Malay, Irish, Māori, Tamil, Luxembourgish**
(`en/es/fr/de/it/pt/nl/sv/da/no/fi/ar/ja/ko/zh/ms/ga/mi/ta/lb.ts`).
- `data-i18n` attributes on static markup + `applyStaticTranslations`; React
  components use `useTranslation()` hook.
- RTL-aware for Arabic; migration scripts: `add-about-i18n.mjs`,
  `rename-studio-i18n.mjs`.

### 14.6 Theme
Dark theme by default with light-theme support (`utils/theme.ts`:
`getThemeMode()`, `onThemeChange()`), CSS custom properties
(`--sc-bg`, `--sc-text`, `--sc-accent`, `--sc-line`, …) in `styles/global.css`,
Tailwind mapping in `tailwind.config.mjs`. Design language: near-black canvas,
serif display headings, mono eyebrows, accent-glow panels (see repo-root `DESIGN.md`).

### 14.7 Accessibility (site-wide, tested)
- `prefers-reduced-motion` honoured EVERYWHERE: global CSS collapse, nav glows,
  confetti, morphs, 3D idle drift, flip transitions, Music Lab transitions,
  500-page signal, build-line animation.
- Canvas elements carry `role="img"` + descriptive aria-labels; decorative
  layers are `aria-hidden`.
- 44px minimum touch targets; focus rings on all interactive elements.
- Blind-accessibility path: Learn mode + CurveDescriber (spoken/written curve description).
- Keyboard: native `<details>` accordions, shortcut modal, focus-trapped modals.

### 14.8 Performance
- Astro static pages + React islands only where interactive; `client:only` for
  the Studio, `client:load` for the How-it-works island.
- 3D viewer is a **lazy chunk**, prefetched on viewport proximity.
- Imperative store subscription for high-frequency playback (no React churn).
- `content-visibility: auto` on the 100-card scientist grid.
- rAF loops pause when paused/offscreen; heavy math debounced; no per-frame allocation.
- Full production build: **17 pages in ~7 seconds**.

---

## 15. TESTING & VERIFICATION INFRASTRUCTURE

### 15.1 Unit tests — `npm test` → **19,022 tests, 19,022 pass, 0 fail**
(node --test with a TS resolver in `scripts/ts-resolve.mjs`). Suites cover:
equation parsing/params/labels, curve spline/fitting/3D math, sonification
mapping, video scene/exporter/watermark, file save, QR, freehand
draw/scanner, guess rounds/feedback/library, typo correction, composition
builder/validator/catalog, soundLab library, musicLab equation/access,
feature flags, special pages (404/500/building state), graph-panel
source-contract tests, preloader, playback accessibility, how-it-works
math/morph/3d.

### 15.2 Live-browser (CDP / Chrome DevTools Protocol) scripts
in `certain-cycle/scripts/` (launch Chrome with `--remote-debugging-port=9222`):
- `verify-hiw-3d.mjs` / **`verify-hiw-3d-stress.mjs`** — How-it-works 3D card:
  prefetch, 20-flip dispose, touch orbit/scroll (`pan-y`), reduced-motion
  (flip + idle drift), accessible name. **Latest run: 11/11 PASS**
  (evidence: `scripts/verify-hiw-3d-stress.out.txt`).
- `verify-3d-data.mjs`, `verify-render3d.mjs` — 3D data/render checks + saved
  evidence screenshots (`screenshots/render3d-dark.png`, `render3d-light.png`,
  `hiw-*.png`, `shortcut-modal-open.png`).
- `verify-mobile-throttle.mjs` — mobile throttling behaviour.
- `verify-scientists.mjs`, `verify-shapes.mjs`, `verify-html.mjs`,
  `verify-studio-mounts.mjs`, `diagnose-studio.mjs` — mounts, HTML, scientists.
- `measure-bundle.mjs`, `measure-three.mjs`, `shape-metrics.mjs` — perf/bundle budget.

---

## 16. CONVENTIONS & RULES (DO / DON'T)

**Do:**
- Components `.tsx`, pages `.astro`, utilities `.ts`; Tailwind classes only (no CSS modules).
- Zustand for shared state (stores: studio, soundLab, musicLab).
- Keep components focused; heavy math debounced; canvas rAF-based.
- Add translations to ALL 20 files in `src/i18n/translations/`.
- Respect `prefers-reduced-motion` in every new animation.
- Keep 44px touch targets and aria labels on canvases.
- Add unit tests for any new pure logic (`src/**/*.test.ts`).
- Use feature flags for anything not ready to ship.

**Don't:**
- Don't use `display: none` on canvas elements (breaks rendering).
- Don't block the main thread with math.
- Don't hardcode equation strings in components (data files only).
- Don't add dependencies without bundle-size justification (three.js is already
  code-split and budget-measured).
- Don't duplicate release logic outside `featureFlags.ts`.
- Don't let an embedded 3D card swallow page scroll (use `touchAction="pan-y"`;
  only the Studio graph uses `none`).
- Don't ship motion that ignores reduced-motion.

---

## 17. CURRENT STATE & RECENT WORK (as of this document)

**Git:** branch `master`, 2 commits ahead of `origin/master` (not yet pushed):
1. `2382286` — restore verify-3d-data.mjs
2. `64bc1a1` — fix: ? modal + 3D save evidence + regression; hold §3

**Just completed (the previously "held §3/§4" task):**
- Extended `scripts/verify-hiw-3d-stress.mjs` with §3 (touch: pan-y orbit vs
  scroll on an emulated 390×844 phone) and §4 (reduced-motion: no flip
  transition, zero idle drift measured over 1.4s), running the whole pass under
  emulated `prefers-reduced-motion` for deterministic pixel diffs.
- Executed it against the production build in headless Chrome: **11/11 checks
  pass**; evidence saved to `scripts/verify-hiw-3d-stress.out.txt`.
- Re-ran the full unit suite after: **18,986/18,986 pass**.

**Known follow-ups / backlog:**
- Push `master` to `origin` (2 commits pending).
- Flip feature flags when SoundLab / Draw / Music Lab are ready to release
  (one-line change each in `src/config/featureFlags.ts`).
- Optional: commit the stress-test evidence file alongside the script.

---

*Generated from the live codebase on 2026-10-11. Every statement above was
verified against the actual source files in `certain-cycle/`.*






