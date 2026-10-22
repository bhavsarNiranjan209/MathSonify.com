#!/bin/sh
# usage (from the paste-card folder, Node 22.6+):  sh verify/run.sh
set -e
D=$(mktemp -d); cp src/utils/pasteNormalizer.ts src/utils/miniEval.ts src/utils/pasteNormalizer.test.ts "$D"/
cd "$D"
sed -i "s#from './pasteNormalizer'#from './pasteNormalizer.ts'#; s#from './miniEval'#from './miniEval.ts'#" pasteNormalizer.test.ts
node --experimental-strip-types --no-warnings --test pasteNormalizer.test.ts 2>&1
