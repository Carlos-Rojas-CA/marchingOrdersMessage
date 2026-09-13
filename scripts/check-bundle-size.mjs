import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/**
 * Fails the build when the initial JavaScript payload grows past its budget.
 *
 * Only the entry chunk counts: the PDF renderer is deliberately lazy and must
 * not be charged against the cost of opening the app.
 */
/*
 * Tightened once the builder moved to its own chunk. A ceiling you are at half
 * of stops catching anything: the point is to notice the next regression, not
 * to be reassured by a number nothing can reach.
 */
const BUDGET_KB = 95;
const dir = 'dist/assets';

const entry = readdirSync(dir).filter(
  (name) => name.startsWith('index-') && name.endsWith('.js'),
);

if (entry.length === 0) {
  console.error('No entry chunk found in dist/assets — did the build run?');
  process.exit(1);
}

let total = 0;
for (const name of entry) {
  total += gzipSync(readFileSync(join(dir, name))).length;
}

const kb = total / 1024;
console.log(`Initial JS: ${kb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`);

if (kb > BUDGET_KB) {
  console.error(`Over budget by ${(kb - BUDGET_KB).toFixed(1)} KB.`);
  process.exit(1);
}
