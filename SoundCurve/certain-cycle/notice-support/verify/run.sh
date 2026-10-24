#!/bin/sh
# usage (from the notice-support folder, Node 22.6+):  sh verify/run.sh
set -e
D=$(mktemp -d); cp src/server/subscribeCore.ts src/server/subscribeCore.test.ts "$D"/
cd "$D"; sed -i "s#from './subscribeCore'#from './subscribeCore.ts'#" subscribeCore.test.ts
node --experimental-strip-types --no-warnings --test subscribeCore.test.ts 2>&1
