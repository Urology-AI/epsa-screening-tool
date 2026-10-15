import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRedcapCsv, isRedcapEligible } from '../src/utils/redcapExport.js';

const FORM = {
  age: 61, race: 'african-american', familyHistory: 1, brcaStatus: 'no',
  heightFt: '5', heightIn: '10', weightLbs: '180', exercise: 'regular',
  smoking: 'never', chemicalExposure: 'wtc_911', ipssQol: 2, shim: [4],
};

test('one header row, record_id first, coded values', () => {
  const csv = buildRedcapCsv([{ id: 'cs_1', sessionRef: 'EP-20261015-AAAA', formData: FORM }]);
  const [header, row] = csv.trim().split('\r\n');
  const cols = header.split(',');
  assert.equal(cols[0], 'record_id');
  const rec = Object.fromEntries(cols.map((c, i) => [c, row.split(',')[i]]));
  assert.equal(rec.record_id, 'EP-20261015-AAAA');
  assert.equal(rec.race_epsa, '2');
  assert.equal(rec.chemical_exposure, 'nine_eleven');
  assert.equal(rec.height_cm, '178');
});

test('falls back to the stable session id, never a random one', () => {
  const s = { id: 'cs_2', formData: FORM };
  assert.equal(buildRedcapCsv([s]), buildRedcapCsv([s]));
  assert.match(buildRedcapCsv([s]), /\r\ncs_2,/);
});

test('free-text notes are quoted', () => {
  const csv = buildRedcapCsv([{ id: 'cs_3', formData: FORM, checklistData: { influence: 'no', notes: 'said "ok", then\nleft', savedAt: '2026-10-15T10:00:00Z' } }]);
  assert.match(csv, /"said ""ok"", then\nleft"/);
  assert.match(csv, /2026-10-15T10:00:00Z/);
});

test('declined sessions are not eligible; legacy (no flag) ones are', () => {
  assert.equal(isRedcapEligible({ consented: false, formData: FORM }), false);
  assert.equal(isRedcapEligible({ consented: null, formData: FORM }), true);
  assert.equal(isRedcapEligible({ consented: true }), false);
});
