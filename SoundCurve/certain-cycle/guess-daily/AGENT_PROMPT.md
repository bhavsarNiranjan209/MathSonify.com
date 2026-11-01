# GUESS — DAILY CHALLENGE (+ difficulty) — implement (files: certain-cycle/guess-daily/)
Decisions (owner): ONE worldwide game per day on the US Eastern clock (America/New_York), NOT the player's local date.
The end-screen tiers stay exactly as built (9-10 perfect, 3-8 good, 0-2 keep training). No new dependencies.

1. LOGIC: copy src/lib/dailyChallenge.ts (+ test) into src/lib/ (or the repo's utils folder). Convert the test to the
   repo's node:test style; all tests must pass, including the GOLDEN GAME test. NEVER change hashString, mulberry32,
   seededShuffle or buildDailyGame without the owner's say-so: any change gives different players different games.
   Never use Math.random or the player's time zone anywhere in the daily path.
2. ADAPTER: map the real Guess library to {id, family} (30 equations, 6 families x 5). Daily = ALL families mixed,
   10 distinct questions, 4 options each from the answer's family, same order for everyone. Do not store the deck;
   rebuild it from getDailyKey(Date.now()) every time.
3. UI: on the Guess start screen add "Daily challenge" next to normal play. Show today's date label (US Eastern),
   the player's streak, and — once played — the result and a countdown "Next challenge in hh:mm:ss" driven by
   msUntilNextReset (recompute every second from the real clock; do not accumulate). Midnight Eastern is about
   9:30 AM (summer) / 10:30 AM (winter) in India: say "New challenge every day at midnight US Eastern time".
4. RULES: one SCORED attempt per date (canPlayDaily). If the page is left mid-game, the attempt is consumed when the
   FIRST answer is given (so a refresh cannot be used to peek). Results per question stored as booleans.
   Streak via nextStreak. Share via shareText (Web Share on phones, clipboard fallback, toast "Copied").
5. STORAGE: localStorage keys for lastPlayedKey, today's results and the streak. Add them to the Privacy Policy's
   key list (the owner approves the wording). Nothing is sent to a server.
6. DIFFICULTY (normal play, not daily): Easy = trig + beat (10 equations), Medium = chirp + perc (10),
   Hard = decay + shape + chirp (15, pick 10). Always 10 distinct questions; distractors from the same family.
7. TESTS/EVIDENCE: all dailyChallenge tests pass under TZ=UTC, Asia/Kolkata, Pacific/Auckland, America/Los_Angeles
   (run each); a browser script plays the daily twice with the system time zone set to two different zones and
   asserts the SAME 10 questions; the second attempt on the same date is refused; screenshots at 390px and desktop
   (start screen, playing, finished with countdown, share toast). Commit after each step; report the test count.
