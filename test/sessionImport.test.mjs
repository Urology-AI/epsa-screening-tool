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

test('answers with no valid age are rejected', () => {
  const { error } = convertRecord({ sessionRef: 'EP-1', rawAnswers: { qol: '1', shim: '3' } });
  assert.match(error, /incomplete/);
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

const ANSWERS = { age: '64', race: 'white', familyHistory: 'one', familyHistoryBreastCancer: 'no', familyHistoryPancreaticCancer: 'no', qol: '3', shim: '4', diet: 'mixed', exercise: 'moderate', smoking: 'never', comorbidities: '1', brca: 'no', heightFt: '5', heightIn: '10', weightLbs: '180', psaKnown: 'yes', psaValue: '4.2' };
const ENGINE = { pre: fd => ({ score: fd.age }), post: (pre, s2) => ({ psaValue: s2.psa, pathwayMode: s2.pathwayMode }) };

test('answers-only file is rebuilt into formData and scored on import', () => {
  assert.equal(detectFormat(ANSWERS), 'answers');
  assert.equal(detectFormat({ sessionRef: 'EP-1', rawAnswers: ANSWERS }), 'answers');
  const plan = buildImportPlan([{ name: 'fail.json', text: JSON.stringify({ sessionRef: 'EP-20261002-ZZZZ', rawAnswers: ANSWERS }) }], new Set(), ENGINE);
  const [e] = plan.entries;
  assert.equal(e.session.formData.age, 64);
  assert.equal(e.session.formData.familyHistory, 1);
  assert.deepEqual(e.session.formData.shim, [4, 4, 4, 4, 4]);
  assert.equal(e.session.engineResult.score, 64);
  assert.equal(e.session.postResult.psaValue, 4.2);
  assert.equal(e.rescore, null);
});

test('calculator rows keep their score until recalculated', () => {
  const plan = buildImportPlan([{ name: 'c.json', text: JSON.stringify(calcPart1) }], new Set(), ENGINE);
  const [e] = plan.entries;
  assert.equal(e.session.engineResult.score, 7);
  assert.equal(e.rescore.engineResult.score, 62);
});
