import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { PREDICTION_COLS, predictionColumns, hashConfig } from '../src/services/predictionColumns.js';

// Shapes mirror @urology-ai/epsa-engine 0.2.x output (scalars only shown here, plus
// message text and nested objects that must NOT be copied through).
const ENGINE_RESULT = {
  engineVersion: '0.2.5', guidelineVersion: 'AUA/SUO 2026', modelVersion: '1.0.3',
  score: 48, recommendPSA: true, psaRecommendReason: 'family_history_override',
  action: 'Free text shown to the patient', psaRecommendMessage: 'More patient-facing text',
  age: 58, bmi: '27.0', brcaStatus: 'unknown', itemImpacts: [1, 2, 3],
};
const POST_RESULT = {
  modelVersion: '1.0.3', epsaTierKey: 'high', riskCat: 'High Risk',
  mriRecommended: false, mriRecommendReason: null,
  biopsyRecommended: true, biopsyReason: 'pirads_4',
  biopsyMessage: 'Patient-facing text', psaValue: 6.4,
};

test('extracts every prediction column from the engine results', () => {
  const c = predictionColumns(ENGINE_RESULT, POST_RESULT, 'abcdef0123456789');
  assert.deepEqual(Object.keys(c).sort(), [...PREDICTION_COLS].sort());
  assert.equal(c.engine_version, '0.2.5');
  assert.equal(c.recommend_psa, 1);
  assert.equal(c.psa_recommend_reason, 'family_history_override');
  assert.equal(c.part2_tier_key, 'high');
  assert.equal(c.mri_recommended, 0);
  assert.equal(c.biopsy_recommended, 1);
  assert.equal(c.model_hash, 'abcdef0123456789');
});

test('missing results yield nulls, not errors', () => {
  const c = predictionColumns(null, undefined);
  assert.deepEqual(Object.values(c), PREDICTION_COLS.map(() => null));
});

test('prediction columns carry no PHI, free text or form values', () => {
  const c = predictionColumns(ENGINE_RESULT, POST_RESULT, 'abcdef0123456789');
  const PHI_KEY = /name|mrn|dob|birth|phone|email|address|zip|ssn|note|comment|message|action|age|bmi|race/i;
  assert.deepEqual(PREDICTION_COLS.filter((k) => PHI_KEY.test(k)), []);
  const blob = JSON.stringify(c);
  for (const leaked of ['Free text', 'Patient-facing', 'More patient', '58', '27.0']) {
    assert.ok(!blob.includes(leaked), `leaked: ${leaked}`);
  }
});

test('outcome fields are not part of the prediction record', () => {
  assert.deepEqual(PREDICTION_COLS.filter((k) => /outcome|psa_result|biopsy_gg|pathology/i.test(k)), []);
});

test('hashConfig is stable and sensitive to config changes', async () => {
  const a = await hashConfig({ w: 1 }, webcrypto.subtle);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, await hashConfig({ w: 1 }, webcrypto.subtle));
  assert.notEqual(a, await hashConfig({ w: 2 }, webcrypto.subtle));
});

test('client, worker COLS, migration and public validation all know every prediction column', () => {
  const worker = readFileSync(new URL('../worker/turso-proxy.js', import.meta.url), 'utf8');
  const colsBlock = worker.slice(worker.indexOf('const COLS = ['), worker.indexOf('const CREATE_SQL'));
  const migrate = worker.slice(worker.indexOf('const MIGRATE_COLS'), worker.indexOf('let schemaReady'));
  const rules = worker.slice(worker.indexOf('const PUBLIC_FIELD_RULES'), worker.indexOf('function validatePublicRow'));
  for (const col of PREDICTION_COLS) {
    assert.ok(colsBlock.includes(`'${col}'`), `worker COLS missing ${col}`);
    assert.ok(migrate.includes(`['${col}'`), `MIGRATE_COLS missing ${col}`);
    assert.ok(new RegExp(`\\b${col}:\\s`).test(rules), `PUBLIC_FIELD_RULES missing ${col}`);
  }
});
