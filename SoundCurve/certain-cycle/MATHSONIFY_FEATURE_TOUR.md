# MathSonify — Feature Tour (do this yourself, about 25 minutes)

Open the site (dev: http://localhost:4321). Tick each box. If something does not behave as written, that
feature is broken or not built — write down the page + what you saw.
Test **desktop first**, then the same page on your **phone**, in **dark** and **light**.

Legend: 🟢 reported done · 🟡 pasted but unchecked · 🔵 new code delivered, not yet in the site

---

## A. Everywhere (every page)
- [ ] 🟢 Top bar: **How It Works · Studio · Guess · Scientists · Equations · About**. "Studio" softly
      glows white, slow breathing (not flickering). No item called "Create".
- [ ] 🟢 **Light / Dark** toggle (top right) switches the whole page. Reload — it remembers.
- [ ] 🟢 **EN ▾** language menu — change language, nav text changes (new pages may stay English: known gap).
- [ ] 🟢 Footer on every page; "Studio" is the name used (no "Creation Studio").

## B. Home  `/`
- [ ] 🟢 Only 3 things: hero, quote box, footer.
- [ ] 🟡 Hero graph has a **Play** button; it loops; press again to pause.
- [ ] 🟡 **Surprise me** button next to the quick-experiment chips loads a random equation into the graph.

## C. How It Works  `/how-it-works`
- [ ] 🟢 Small demo card on the right (not a giant graph). Equation label says **"Equation: …"**.
- [ ] 🟢 Click **3D Graph** in the card → the card **flips**. Drag = orbit. Page still scrolls with a
      vertical swipe on phone. Mouse-wheel zoom needs **Ctrl/⌘ + wheel** here (so the page doesn't hijack scroll).
- [ ] 🟢 **Play** loops and draws the curve in on both 2D and 3D faces; flip mid-play — stays in sync.
- [ ] 🟢 Preset chips (sin(x), cos(x), …) change the curve. "How the curve is read": Frequency / Note /
      Rhythm / Chord.
- [ ] 🟢 Mapping cards, "The same journey, every time" accordion, collapsed **Under the hood**,
      two cards at the end (Scientists, Equations), final button. **One footer only** at the very bottom.

## D. Studio  `/studio`  (the main product)
**Equation box**
- [ ] 🟢 Paste a multi-line equation → only the first line is used.
- [ ] 🟢 Type `sinn(x)` → a prompt "Did you mean sin(x)?" with a button to accept.
- [ ] 🔵 Type `sum(k=0,12, 1/(k+1)*sin((4*k+1)*x))` → a dense wave appears (Σ support, needs graph-fix + parser step).
- [ ] 🟢 **View all 12+** (under Popular presets) opens the **math keyboard** (tabs: Arithmetic, Compare,
      Algebra, Trig, Geometry, Calculus). On phone: it slides up from the bottom; the equation box stays visible.
- [ ] 🟢 **Surprise me** and **Library** buttons (top right of the equation card).
**Sound**
- [ ] 🟢 **Play audio**, **instruments** (Sine, Triangle, Saw, Square, Piano, Pluck), **modes** (Continuous,
      Scale notes, Rhythm, Chords), Volume, Duration, Speed, Frequency bounds, Loop.
- [ ] 🟢 Buttons **Learn mode / Stereo pan / Describe curve** sit right under Play.
      Learn mode shows live x, y, frequency while playing · Stereo pan moves sound left/right with the
      curve (use headphones) · Describe curve **speaks** a description.
- [ ] 🟢 **Export WAV** and **Share** are the LAST things in that card.
- [ ] 🟢 Share → copy link / **QR code**. Open the copied link → same equation loads.
**Graph**
- [ ] 🟢 **2D Graph / 3D Graph** toggle (top right of the graph) → flip animation.
- [ ] 🔵 2D: numbers on both axes (including negatives) stay visible **while playing**.
- [ ] 🔵 3D dark: filled dark floor. 3D **light: no black base — only black grid lines**.
- [ ] 🔵 3D numbers include negatives (try `x^3` — values below the axis, numbers like -1000, 0, 1000).
- [ ] 🔵 `tan(x)` in 3D → readable, with a small note "y-range trimmed to show the shape".
- [ ] 🔵 Edit the equation in 2D → 3D numbers and shape update by themselves.
- [ ] 🟢 3D: drag = orbit, wheel/pinch = zoom, right-drag (or Shift+drag) = pan, double-click = reset view.
- [ ] 🟢 **Save image** (3D) → PNG with "Equation: …" and "mathsonify.com" footer. Check light AND dark.
- [ ] 🟢 **Edit** (2D): drag the curve to reshape it; Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo; Reset.
- [ ] 🟢 2D tabs: 2D curve · Waveform · Spectrum · Lissajous · Mandala; **Grid** toggle.
**Smart defaults**
- [ ] 🟡 Visit `/studio` with nothing after it → an "equation of the day"; same all day, new tomorrow.
- [ ] 🟡 Visit `/studio?eq=x^2` → shows x² (an explicit link always wins).
- [ ] 🟢 Visit `/create` → lands on `/studio`.
**The "?" thing — see section H.**

## E. Guess  `/guess`
- [ ] 🟢 Round 1/10, progress bar of 10 segments, big play button (shows a ring while playing; tap again to stop).
- [ ] 🟢 Press Play, then immediately **Next**/answer → sound stops (no overlap).
- [ ] 🟢 Answer → correct = **green**, wrong = **red + right one green**, curve revealed, "Equation: …".
- [ ] 🟡 Difficulty choice (Easy / Hard) before starting. 🟡 **Daily challenge** (one try per day, share text).
- [ ] 🟢 Finish 10 rounds → ending differs: high score = bright arpeggio + confetti; middle = softer
      sparkle; low = gentle tone, no confetti.
- [ ] 🟢 Phone: after answering, the page scrolls down to the result; "Next round" scrolls back up.

## F. Scientists  `/scientists`
- [ ] 🟢 Search + chips (All / Physicists / Mathematicians). On phone it must not lag.
- [ ] 🟢 Open a scientist → their equations → **Remix this** opens Studio with that equation loaded.

## G. Equations  `/equations`
- [ ] 🟢 Chip order: All Presets, **Funny Questions (2nd)**, Trigonometric, … Famous Math.
- [ ] 🟢 Click **Funny Questions** → its border ripples like liquid for ~2 seconds, then settles.
- [ ] 🟢 First cards: **Heart, Bloom, Starburst, Crown, Shell** — each has a faint coloured glow that pulses.
- [ ] 🟢 **Open in studio** loads that equation.

## H. What is the "?" in Studio?
It is the **keyboard-shortcuts cheat sheet**. On a computer, click on the page (not inside the equation
box) and press **?** (Shift + /). A small window lists the shortcuts: **Space** = play/pause,
**Ctrl/⌘+Z** = undo, **Ctrl/⌘+Shift+Z** = redo (these two work while you are editing a curve).
There is also a small "? shortcuts" chip next to the "Space play or stop" chip (desktop only).
Close with **Esc** or by clicking outside. It does **not** open while you type in the equation box, and phones
have no "?" key, so it is desktop-only on purpose.

## I. Other pages
- [ ] 🟢 **About**: technical details are inside a collapsed "Under the hood"; a short human line about who built it.
- [ ] 🟢 **Contact**: three cards with email addresses. (No form yet — so you are **not notified** of messages.)
- [ ] 🟢 **Privacy / Terms**: both say the same minimum age (**5+**).
- [ ] 🟢 **404**: visit `/this-does-not-exist` → "This point doesn't exist.", glitchy 404, ripple from the break;
      tap "tap the break — hear it" → a rising tone that cuts off.
- [ ] ⏸ **/premium** exists but is parked (not linked, not for launch). **/soundlab, /music-lab, /draw**
      should show a "coming soon" page, not a half-built screen.

## J. Export a video (verify where it lives)
- [ ] 🟢 In Studio, **Export WAV** opens the export dialog — check whether it offers video there. A good clip has an
      intro card, a bouncing "MathSonify · mathsonify.com" watermark, "Equation: …" on top (a scientist
      equation also gets the name + a scrolling bottom ticker), and an outro card. On a phone: the Share sheet opens.
