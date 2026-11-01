# HOW IT WORKS — REDESIGN (match the owner's design 100%, dark AND light)
Reference: how-it-works-redesign/how-it-works-new.html (open in a browser; use the Light/Dark switch in its nav).
The owner's original design picture is the visual target; the HTML is a working version of it with the real equation
converter, real graph, and all four sound modes. Port it to the site (Astro page + React island for the interactive
cards). Reuse the existing engines — do not create new ones. No new dependencies.

SCOPE: /how-it-works page BODY only. Do NOT change the global nav or footer (they are shared components). The mockup's
nav differs (link order, a search icon) — leave the site's existing nav alone and list the differences in your report.

PAGE STRUCTURE (top to bottom)
1. HERO: pill "TRY IT YOURSELF"; H1 "How math becomes music" (2 lines, serif); the paragraph; large decorative art on
   the right: one big glowing curve with three bright nodes, a vertical scan line, faint grid, fanned thin ribbon
   lines; small aside top-right: italic f(x) and the stacked caps "A CURVE / A JOURNEY / A SOUND". Art = ONE canvas,
   pauses off-screen, static (no motion) under prefers-reduced-motion, hidden or shortened on mobile (below the text).
2. TWO CARDS side by side (stacked on mobile):
   LEFT  — big editable "f(x) = ____" (default sin(x)); caps label "EXAMPLE EQUATIONS"; chips: sin(x), cos(x),
           sin(x) + 0.5sin(2x), x^2, sin(x^2), sin(x) + cos(2x); a one-line note (changes per mode); caps heading
           "HOW THE CURVE IS READ"; segmented control Frequency | Note | Rhythm | Chord; one-line caption per mode.
           Map to the REAL engine modes: Frequency = Continuous, Note = Scale notes, Rhythm = Rhythm, Chord = Chords.
   RIGHT — tabs "2D Graph | 3D Graph" with caps "WAVEFORM VIEW"; graph box (domain 0 to 2π; y ticks from the curve;
           x labels 0, π, 2π; faint grid; glowing curve; vertical scan line + head dot; equation chip top-right);
           a "WAVEFORM" strip (live analyser trace while playing); wide Play/Pause button + outlined Reset button.
           The 3D tab uses the EXISTING Curve3DViewer (lazy-loaded, touchAction="pan-y"); the mockup's 3D is only a
           stand-in. The 2D graph uses the shared plotMath for ticks; the equation uses the paste-card converter
           (normalizePasted) ONLY for this page's input; sound uses the existing audio engine. One shared Play state
           drives 2D, 3D, waveform and audio. Play loops; Reset stops and returns to the start.
3. EXPLORE: pill "EXPLORE", H2 "Continue the journey", the paragraph, right-side caps "ONE IDEA / MANY PERSPECTIVES";
   three link cards: 01 Guess (/guess), 02 Equations (/equations), 03 Scientists (/scientists), each with icon, title,
   one line, arrow (moves on hover) and its own line-art (waves / ribbons / wireframe torus, drawn on a small canvas).
   Whole card is the link. Then the "Open the Studio →" button.
Removed from the old page (confirm with the owner before deleting the code): the six mapping cards, the 01-05
accordion, the "Under the hood" technical section. List what you removed.

THEMES: build BOTH from the design tokens — never hard-code hex. The mockup's light palette: background #F3F1EB,
panel #FBFAF7, text #14161A, muted #575B63, borders #D0CBBD / #B3AE9F, button #14161A on #F5F4F0. Art and graph lines
use the theme ink colour; in light mode glows are much softer (no dark smudges). Verified contrast: muted text >= 5.8:1
on every surface in light mode. Theme toggle must update the art and graph instantly.

QUALITY BAR: mobile-first (390px: stacked cards, 44px touch targets, no horizontal scroll, graph 180px tall);
keyboard focus rings; aria-pressed on chips/modes; role="tablist" on the graph tabs; aria-live for equation errors;
canvases have aria-hidden or aria-label; only ONE requestAnimationFrame loop for the page, paused when off-screen;
first-load JS stays small (three.js only when the 3D tab is opened); i18n keys for every string.

EVIDENCE (screenshots/how-it-works/): desktop 1440 and 1076, tablet 820, phone 390 — each in DARK and LIGHT — placed
next to the owner's design picture; the 3D tab; each of the 4 modes while playing; a wrong equation message; theme
toggle mid-play. Report npm test count, build, Lighthouse accessibility + performance (mobile). Commit in steps:
(1) hero, (2) cards + engine wiring, (3) explore + CTA, (4) light mode polish, (5) mobile polish.
