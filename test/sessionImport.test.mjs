import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat, convertRecord, buildImportPlan } from '../src/utils/sessionImport.js';

const FD = { age: 62, race: 'white' };
const calcComplete = { version: '1.0', part: 'complete', part1Data: FD, part1Result: { score: 7 }, part2Data: { psa: 4.1 }, part2Result: { riskCat: 'x' } };
const calcPart1 = { version: '1.0', part: 'part1', part1Data: FD, part1Result: { score: 7 } };
const kioskResults = { sessionRef: 'EP-20261001-AAAA', formData: FD, result: { engineResult: { score: 9 } }, postResult: null, rawAnswers: { age: '62' } };
const kioskSession = { version: 'epsa-session-v1', sessionRef: 'EP-20261001-BBBB', formData: FD, engineResult: { score: 5 }, step1: FD, preResult: { score: 5 }, step2: null };

test('detects each known format', () => {
  assert.equal(detectFormat(calcComplete), 'calc-complete');
  assert.equal(detectFormat(calcPart1), 'calc-part1');
  assert.equal(detectFormat(kioskResults), 'kiosk-results');
  assert.equal(detectFormat(kioskSession), 'session');
  assert.equal(detectFormat({ foo: 1 }), null);
});

test('calculator complete -> step2, new ref, full status', () => {
  const { session, warnings } = convertRecord(calcComplete);
  assert.match(session.sessionRef, /^EP-\d{8}-[A-Z0-9]{4}$/);
  assert.deepEqual(session.step2, { psa: 4.1 });
  assert.equal(session.status, 'STEP2_COMPLETE');
  assert.ok(warnings.some(w => /new one was assigned/.test(w)));
});

test('kiosk results unwraps engineResult and keeps ref + rawAnswers', () => {
  const { session } = convertRecord(kioskResults);
  assert.equal(session.sessionRef, 'EP-20261001-AAAA');
  assert.equal(session.engineResult.score, 9);
  assert.deepEqual(session.rawAnswers, { age: '62' });
});

test('answers-only record is rejected, not imported', () => {
  const { error } = convertRecord({ sessionRef: 'EP-1', rawAnswers: { age: '60' } });
  assert.match(error, /raw answers/);
});

test('plan merges same ref across files and flags existing', () => {
  const p1 = { ...kioskSession, sessionRef: 'EP-20261001-CCCC' };
  const p2 = { ...kioskSession, sessionRef: 'EP-20261001-CCCC', step2: { psa: 3 }, postResult: { riskCat: 'low' } };
  const plan = buildImportPlan(
    [{ name: 'a.json', text: JSON.stringify(p1) }, { name: 'b.json', text: JSON.stringify([p2, calcPart1]) }, { name: 'bad.json', text: '{' }],
    new Set(['EP-20261001-CCCC']),
  );
  assert.equal(plan.entries.length, 2);
  const merged = plan.entries.find(e => e.session.sessionRef === 'EP-20261001-CCCC');
  assert.equal(merged.exists, true);
  assert.deepEqual(merged.session.step2, { psa: 3 });
  assert.equal(merged.session.status, 'STEP2_COMPLETE');
  assert.equal(plan.rejected.length, 1);
});
