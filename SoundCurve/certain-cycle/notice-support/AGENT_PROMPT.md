# NOTICE PAGES + EMAIL SIGN-UP + /support — implement (files: certain-cycle/notice-support/)
UI references (open in a browser): notice-preview.html, support-preview.html. No new dependencies.

1. CONFIG: copy src/config/featureStatus.ts and src/config/support.ts into src/config/. Rule: nothing becomes
   'maintenance' automatically — only a manual edit + redeploy does. Default every page 'live' except soundlab,
   music-lab, draw = 'coming-soon'. Test that.
2. NOTICE PAGE: replace FeatureBuildingState with ONE NoticePage component (modes: coming-soon | maintenance) matching
   notice-preview.html: badge, headline, animated bars (static under reduced motion), lead, email form (label,
   honeypot field named "website", consent line, under-18 line, aria-live message), thank-you state, link back to
   Studio. noindex, not in nav/footer/sitemap. Per-page copy lives in one place (i18n keys). Mobile first.
   Show the form ONLY when EMAIL_SIGNUP_ENABLED is true; otherwise show the same page with "Check back soon" and no
   form (never a form that cannot work). Maintenance shows the form only if collectEmail is true.
3. API: copy api/subscribe.ts -> certain-cycle/api/subscribe.ts and src/server/subscribeCore.ts(+test) ->
   src/server/. Vercel serves /api for the static Astro build — NO adapter. Tests (node:test) must pass 54/54.
   The provider adapter is a stub: BLOCKED until the owner names the provider. When unblocked, implement it from the
   provider's CURRENT docs: double opt-in ON, tag/group = topic, "already subscribed" = success, secrets only from
   env (EMAIL_PROVIDER_API_KEY, EMAIL_LIST_ID), never log the email or key. Add .env.example (names only).
4. CLIENT: POST JSON {email, topic, website, t: render timestamp}; handle 200/400/429/502/network with friendly
   text; disable the button while sending; move focus to the result; no localStorage; same reply for new/duplicate.
5. /support: implement support-preview.html as src/pages/support.astro driven by src/config/support.ts. Any EMPTY
   config value hides that element (no dead buttons). Steam canvas pauses off-screen and is static under reduced
   motion; the thank-you chord plays ONLY on click; Share uses Web Share with clipboard fallback; external link
   rel="noopener noreferrer" target="_blank". Add the footer link "Support MathSonify" (About column). In sitemap,
   indexable. i18n keys. Remove nothing from /premium.
6. POLICY: do NOT edit Privacy/Terms/footer/About text until the owner has filled POLICY_DRAFTS.md and says
   "approved". Then insert the approved text verbatim, bump the version/date, and make the localStorage list match
   the code. Until then, list the claims that will become false (report only).
7. EVIDENCE: subscribeCore 54/54; component state tests (idle/sending/success/error/rate-limited); route checks —
   held routes show NoticePage, noindex, absent from nav and sitemap; zero third-party requests on /support and the
   notice pages; screenshots (390px + desktop) of each state; a curl test of /api/subscribe against a mock provider
   (200, 400, 429); accessibility score for both pages. Commit after each step.
Owner-only tasks (do not attempt): create the list-provider account, enable double opt-in, create tags
soundlab/music-lab/draw/maintenance, get the API key, set Vercel env vars, verify the sending domain after buying it,
choose the donation platform, fill POLICY_DRAFTS.md.
