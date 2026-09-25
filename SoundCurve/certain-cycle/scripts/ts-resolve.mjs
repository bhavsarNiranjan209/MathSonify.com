/**
 * Node test-loader shim.
 *
 * `src/**` is written for the bundler (Vite/Astro), which resolves extensionless
 * relative specifiers. Plain node does not, so running the pure-logic unit tests
 * with `node --test` needs the extension tried before giving up. This hook only
 * affects test runs — nothing here ships to the browser.
 *
 * Usage: node --import ./scripts/ts-resolve.mjs --test "src/utils/" + a test path
 * (see the "test" script in package.json)
 */
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
    if (!isRelative) return nextResolve(specifier, context);

    const candidates = [specifier, `${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`];
    let lastError;
    for (const candidate of candidates) {
      try {
        return nextResolve(candidate, context);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  },
});
