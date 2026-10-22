# PASTE-EQUATION CARD — integrate (files: certain-cycle/paste-card/)
Reference UI to match: paste-card/paste-card-preview.html (open in a browser). No new dependencies.

1. MAIN BAR: remove the special paste handling (handlePaste first-line logic) and restore the placeholder to
   "Type an equation — e.g. sin(x) * cos(3*x)". Everything else about the bar stays (typo correction, keyboard,
   presets, Surprise me, Library). Do NOT route the bar through normalizePasted.
2. NEW CARD above the equation card: "Paste equation". Store: inputMode 'bar' | 'paste' (default 'bar').
   - Exactly ONE active. Inactive card: dimmed + veil + "Use …" button. While paste is active the bar shows NO
     equation (hidden/blank, disabled). Each side keeps its own text and restores it on switch.
   - Graph, audio, 3D, export, share/QR, Learn mode, Save image read ONLY the active source.
   - Paste card: textarea (multi-line OK), example chips (copy the 9 from the preview), "EQUATION" line
     (result.display), notes, error panel (result.error), parameter sliders for result.params (−20..60, step
     0.1, default 1), Clear, "Use the equation bar instead".
   - Auto-fit the domain in paste mode when > 40% of default-domain samples are non-finite.
3. ENGINE: src/utils/pasteNormalizer.ts (copy as is) returns the canonical `expr` with explicit "*". Feed it to
   the EXISTING evaluator with scope {x, ...params}. Confirm the evaluator supports: nthRoot, cbrt, abs, sign,
   floor/ceil/round, log10/log2, sum()/prod() with bounds that may be parameters (round, 10,000-term cap, friendly
   error), nested sums; REAL roots for negative bases with odd-denominator exponents ((-8)^(1/3) = -2,
   x^(2/3) real so the heart is symmetric); NaN gaps for sqrt/log of negatives. Add what's missing, with tests.
   miniEval.ts is a TEST ORACLE only — keep it out of the production bundle. No eval, no mathjs for pasted text
   beyond what the evaluator already uses.
4. STATE/EXPORT: store {raw, expr, display, params}. Share link carries expr (+ params); QR same URL. Video/3D
   image label = "Equation: <display>". 3D view must draw pasted equations (negatives below the axis).
5. TESTS (node:test): convert paste-card/src/utils/pasteNormalizer.test.ts imports to the repo style; it must pass
   91/91. Add a differential test: for every notation case, app-evaluator vs miniEval within 1e-9. Add UI-contract
   tests for mutual exclusivity and bar-blank-in-paste-mode and restore-on-switch.
6. EVIDENCE (screenshots/paste-card/): heart in LaTeX with the k slider moved (2 values); Σ in Unicode; Σ LaTeX
   square wave; roots; abs bars; the "x²+y²=4" error message; switching paste→bar→paste; 3D view of a pasted
   equation; mobile 390px; dark + light. Report test counts + build. Commit after each numbered step.
Do not touch held pages or the Edit/undo logic.
