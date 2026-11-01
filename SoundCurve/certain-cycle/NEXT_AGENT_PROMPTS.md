# Prompts to paste to the agent (one at a time; commit after each; one agent in the repo at a time)

## PROMPT A — fixes: undo/redo, 3D "audio is playing", remove Draw
```
A1. UNDO / REDO IN EDIT MODE do not work (buttons and Ctrl+Z / Ctrl+Shift+Z). Diagnose first, name the cause:
    is the history stored? do the buttons call the store actions? are the shortcuts bound only inside the "?" panel?
    Fix so that: every drag of a control point is one history step; Undo/Redo buttons work AND show disabled when
    there is nothing to undo/redo; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z work while Edit mode is active (not while typing
    in the equation box); Reset clears or records history consistently; the 3D view follows each undo/redo.
    Tests + a browser script: drag a point, undo, redo, assert the equation/curve returns each time.
A2. 3D: show that audio is PLAYING — subtle, not flashy. While playing: the curve is traced progressively with a
    faint ghost of the full curve behind it, a small glowing playhead on the curve, a thin vertical guide from the
    playhead down to the floor, and a very soft pulse of the traced line. When stopped: full curve, no guide.
    Reduced-motion: no pulse. First prove getProgress really changes during playback (log it); if it does not,
    that wiring is the bug. Screenshots: idle vs playing, dark and light, desktop and 390px.
A3. REMOVE THE DRAW PAGE COMPLETELY (it becomes its own website). First: git tag draw-archive. Then delete the route,
    nav/footer/sitemap entries, i18n strings, feature-status/topic entries, notice page entry, assets and tests that
    belong only to Draw. /draw must be a normal 404. List every file deleted. Verify: no dead links, build clean,
    npm test passes (say which tests were removed because they tested Draw).
```

## PROMPT B — video export: landscape + portrait, black background, smooth
Reference: design-previews/video-export-preview.html (open it, switch Landscape/Portrait, press "Record a test clip").
```
VIDEO EXPORT UPGRADE. Evidence for the problem: the owner's clip is labelled 60 fps but ffprobe shows
avg_frame_rate = 2565000/92879 (about 27.6 fps) — frames are being dropped, so it stutters.
1. Export dialog: orientation choice Landscape 16:9 (default) | Portrait 9:16, and quality 720p | 1080p.
   Sizes 1280x720 / 1920x1080 and 720x1280 / 1080x1920. Remember the last choice.
2. LOOK (match the preview): pure black #000 background — remove the gray panel, grid wash and vignette; axes and
   grid very faint; tick numbers about 3x larger than now (font about 2.7% of the short side); curve = soft glow +
   bright core + brighter trail near the head; head with halo and a slow pulse ring; "Equation: …" pill at the top;
   watermark "MathSonify · mathsonify.com" drifts along a strip BELOW the graph and never crosses the curve;
   intro and outro cards kept; scientist mode (name pill + scrolling ticker) kept and re-laid out for portrait.
3. PORTRAIT SAFE AREA: keep important content out of the top 12% and bottom 20% (and the right 14% mid-height) that
   Reels / Shorts / TikTok cover with buttons.
4. SMOOTHNESS: drive everything from the clock (performance.now), never from frame counts; draw the static layer
   (background, axes, numbers, faint curve) ONCE into an offscreen canvas and reuse it; replace per-frame
   shadowBlur / large gradients with stacked strokes; no allocations inside the frame loop; keep audio and video on
   one timeline; videoBitsPerSecond 8 Mbps (720p) / 14 Mbps (1080p); pick mp4 (H.264) first, webm as fallback.
5. ACCEPTANCE (must be measured, not claimed): export 3 equations x 2 orientations; for each run
   ffprobe -show_entries stream=avg_frame_rate,r_frame_rate,width,height,nb_frames and report a table.
   Target: avg_frame_rate within 5% of 60 (or a constant 30 fps if 60 is not achievable on the test machine —
   then say so and make 30 the stable default). Also test on a real phone and report. Save the clips and the table
   in screenshots/video/. Audio sync and the "Equation:" label must still be correct.
```
