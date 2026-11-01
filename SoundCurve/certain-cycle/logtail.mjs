import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(dir, 'test-run.log'), 'utf16le');
const lines = raw.split(/\r?\n/);
const keep = lines.filter((l) => /# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)|not ok|failing tests|AssertionError|ERR_ASSERTION/i.test(l));
console.log(keep.slice(-40).join('\n'));
