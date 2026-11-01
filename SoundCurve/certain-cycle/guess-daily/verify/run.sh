#!/bin/sh
# usage (from the guess-daily folder, Node 22.6+). Runs the tests under SEVERAL machine time zones on purpose.
set -e
D=$(mktemp -d); cp src/lib/*.ts "$D"/; cd "$D"
sed -i -E "s#from '\./dailyChallenge'#from './dailyChallenge.ts'#" *.test.ts
for TZ in UTC Asia/Kolkata Pacific/Auckland America/Los_Angeles; do
  echo "== machine time zone: $TZ"; TZ=$TZ node --experimental-strip-types --no-warnings --test *.test.ts 2>&1 | grep -E "^# (tests|pass|fail)|^    not ok|^not ok"
done
