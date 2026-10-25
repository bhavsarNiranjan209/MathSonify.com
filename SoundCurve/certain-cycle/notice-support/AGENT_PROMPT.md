# NOTICE PAGES + EMAIL SIGN-UP + /support (USD) — implement (files: certain-cycle/notice-support/)
UI references (open in a browser): notice-preview.html (coming soon + maintenance, with real wrong-email messages),
support-preview.html (Support page in US dollars). No new dependencies. Draw is NOT part of this: that page is being deleted.

1. CONFIG: copy src/config/featureStatus.ts and src/config/support.ts into src/config/, and src/lib/*.ts,
   src/hooks/useEmailSignup.ts, src/server/subscribeCore.ts (+ tests). Rule: nothing becomes 'maintenance'
   automatically — only a manual edit + redeploy. Defaults: soundlab and music-lab = 'coming-soon', everything
   else 'live'. Test it. Convert the tests' imports to the repo style; all 124 must pass.
2. NOTICE PAGE: replace FeatureBuildingState with ONE NoticePage (coming-soon | maintenance) matching
   notice-preview.html. Form: label, honeypot field named "website", consent line, under-18 line, aria-live message,
   thank-you state. Use src/lib/signupClient.ts (createSignup) — the page must NOT re-implement validation.
   Wrong email -> the specific message from emailCheck (missing @, no dot, spaces ...). Common typo (gmial.com,
   .con) -> "Did you mean …?" with "Yes, use it" / "No, keep mine". aria-invalid on the field. Show the form ONLY
   when EMAIL_SIGNUP_ENABLED is true; otherwise "Check back soon" with no form. noindex; not in nav/footer/sitemap.
3. API: copy api/subscribe.ts to certain-cycle/api/subscribe.ts (Vercel Function, no Astro adapter). The provider
   adapter is a stub, BLOCKED until the owner names the provider; then implement from its CURRENT docs: double
   opt-in ON, tag/group = topic, "already subscribed" = success, secrets only from env, never log email or key.
   Topics are soundlab, music-lab, maintenance (no draw). Add .env.example (names only).
4. /support (USD): implement support-preview.html as src/pages/support.astro, driven by src/config/support.ts and
   src/lib/supportAmount.ts (min $5, max $1,000,000; tiers chai $5 / coffee $10 / long night $15; quick chips
   $5 $10 $50 $200 $500; custom amount). Use parseAmount/formatUSD/buildDonateUrl/cupLevel — do not re-write the
   rules. Pay button hidden while donateUrl is empty (never a dead button). Steam/cup animation pauses off-screen
   and is static under reduced motion; the chord plays only on click; mobile: sticky bottom pay bar; amount field
   inputmode="decimal". Footer link "Support MathSonify" (About column). Indexable, in sitemap, i18n keys.
5. POLICY: do NOT edit Privacy/Terms/footer/About until the owner has filled POLICY_DRAFTS.md and says
   "approved"; then insert verbatim, bump version/date, make the localStorage list match the code.
6. EVIDENCE: tests 124/124; component states (idle/sending/success/error/typo/rate-limited); held routes show
   NoticePage, noindex, absent from nav/sitemap; zero third-party requests on /support and the notice pages;
   390px + desktop screenshots; curl test of /api/subscribe against a mock provider (200, 400 with code, 429);
   accessibility score for both pages. Commit after each step.
Owner-only tasks (do not attempt): list-provider account, double opt-in, tags (soundlab, music-lab, maintenance),
API key, Vercel env vars, sending-domain DNS, donation platform (must accept custom amounts and international
cards), fill POLICY_DRAFTS.md.
