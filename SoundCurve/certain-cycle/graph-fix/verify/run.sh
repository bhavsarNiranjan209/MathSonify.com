#!/bin/sh
# usage: sh verify/run.sh   (from the graph-fix folder; needs Node 22.6+)
set -e
D=$(mktemp -d); cp src/utils/plotMath.ts src/utils/plot2d.ts src/utils/plotMath.test.ts verify/*.ts "$D"/
cd "$D"
sed -i "s#from './plotMath'#from './plotMath.ts'#" plot2d.ts plotMath.test.ts
sed -i "s#from 'vitest'#from './shim.ts'#" plotMath.test.ts
echo "=== math tests ===";   node --experimental-strip-types --no-warnings plotMath.test.ts
echo "=== 2D renderer ==="; node --experimental-strip-types --no-warnings plot2d.harness.ts
