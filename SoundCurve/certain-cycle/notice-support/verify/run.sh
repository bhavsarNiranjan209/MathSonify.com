#!/bin/sh
# usage (from the notice-support folder, Node 22.6+):  sh verify/run.sh
set -e
D=$(mktemp -d); cp src/lib/*.ts src/server/*.ts "$D"/
cd "$D"
sed -i -E "s#from '(\./|\.\./[a-z]+/)([A-Za-z]+)'#from './\2.ts'#g" *.ts
node --experimental-strip-types --no-warnings --test *.test.ts 2>&1
