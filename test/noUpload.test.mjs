// The screening tool keeps sessions on the device; staff move them into REDCap
// by downloading a CSV. Sinai IT's review rests on that, so it is a test rather
// than a code-review convention: browser code must not gain a way to send data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

// loadImageAsDataUrl fetches the app's own logo for the printed PDF.
const ALLOWED_FETCH = new Set(['utils/generateClinicalPdfs.js']);

const FORBIDDEN = [
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['navigator.sendBeacon', /sendBeacon/],
  ['WebSocket', /\bnew\s+WebSocket\b/],
  ['EventSource', /\bnew\s+EventSource\b/],
  ['database client', /@libsql\/client|firebase\/firestore/],
];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(jsx?|mjs)$/.test(f) ? [p] : [];
  });
}

const files = walk(SRC).map((p) => [p.slice(SRC.length), readFileSync(p, 'utf8')]);

test('has source files to check', () => {
  assert.ok(files.length > 10);
});

test('only same-origin asset loads use fetch()', () => {
  const offenders = files.filter(([rel, body]) => /\bfetch\s*\(/.test(body) && !ALLOWED_FETCH.has(rel)).map(([rel]) => rel);
  assert.deepEqual(offenders, []);
});

for (const [name, pattern] of FORBIDDEN) {
  test(`does not use ${name}`, () => {
    const offenders = files.filter(([, body]) => pattern.test(body)).map(([rel]) => rel);
    assert.deepEqual(offenders, []);
  });
}
