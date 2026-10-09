// Format detection and conversion for the admin Import Wizard.
//
// Accepts every JSON export we know about and turns it into the record shape
// saveClinicalSession() takes:
//   session        kiosk Export All / per-session export (epsa-session-v1)
//   kiosk-results  kiosk "Export Results JSON": { sessionRef, formData, result, postResult, rawAnswers }
//   calc-complete  calculator Part 3 export: { part:'complete', part1Data, part1Result, part2Data, part2Result }
//   calc-part1     calculator Part 1 export:  { part:'part1', formData, ... } / part1Data
// No dependencies, so it also runs under node --test.

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const nonEmpty = (o) => isObj(o) && Object.keys(o).length > 0;

export const FORMAT_LABELS = {
  session: 'Kiosk session',
  'kiosk-results': 'Kiosk results export',
  'calc-complete': 'Calculator (Part 1 + 2)',
  'calc-part1': 'Calculator (Part 1)',
};

export function detectFormat(r) {
  if (!isObj(r)) return null;
  if (r.version === 'epsa-session-v1' || r.step1 || r.preResult || r.engineResult) return 'session';
  if (r.part1Data) return r.part === 'complete' || nonEmpty(r.part2Data) ? 'calc-complete' : 'calc-part1';
  if (r.formData && r.part === 'part1') return 'calc-part1';
  if (r.formData && ('rawAnswers' in r || 'result' in r || 'exportedAt' in r)) return 'kiosk-results';
  if (r.formData) return 'session';
  return null;
}

function newRef(dateStr) {
  const d = dateStr && !isNaN(new Date(dateStr)) ? new Date(dateStr) : new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `EP-${ymd}-${suffix}`;
}

/** Convert one record. Returns { session, warnings } or { error }. */
export function convertRecord(r) {
  const format = detectFormat(r);
  if (!format) {
    const hint = isObj(r) && r.rawAnswers
      ? 'only raw answers, no calculated Part 1 data — cannot be rescored here'
      : 'not a recognised ePSA export';
    return { error: hint };
  }
  const warnings = [];
  let formData; let engineResult; let step2; let postResult;

  if (format === 'kiosk-results') {
    formData = r.formData;
    engineResult = r.result?.engineResult ?? r.result ?? null;
    postResult = r.postResult ?? r.result?.postResult ?? null;
    step2 = r.step2 ?? null;
  } else {
    formData = r.formData ?? r.step1 ?? r.part1Data ?? null;
    engineResult = r.engineResult ?? r.preResult ?? r.part1Result ?? null;
    const s2 = r.step2 ?? r.part2Data;
    step2 = nonEmpty(s2) ? s2 : null;
    postResult = r.postResult ?? (step2 ? r.part2Result ?? null : null);
  }
  if (!isObj(formData) || !Object.keys(formData).length) return { error: 'no Part 1 data found' };

  if (!engineResult) warnings.push('No Part 1 result in file — score will be blank');
  if (format.startsWith('calc')) warnings.push('Score is as calculated by the calculator, not rescored');
  if (step2 && !postResult) warnings.push('Part 2 inputs present but no Part 2 result');

  const createdAt = r.createdAt ?? r.exportDate ?? r.exportedAt ?? null;
  let sessionRef = r.sessionRef ?? null;
  if (!sessionRef) {
    sessionRef = newRef(createdAt);
    warnings.push('No EP- reference in file — a new one was assigned');
  }
  return {
    format,
    warnings,
    session: {
      sessionRef,
      createdAt,
      formData,
      engineResult,
      step2,
      postResult,
      rawAnswers: r.rawAnswers ?? null,
      finalCategory: r.finalCategory ?? null,
      consented: r.consented ?? null,
      status: step2 ? 'STEP2_COMPLETE' : (r.status ?? 'STEP1_COMPLETE'),
    },
  };
}

/**
 * Parse loaded files into reviewable entries.
 * files: [{ name, text }]. existingRefs: Set of sessionRefs already on the device.
 * Records sharing a sessionRef inside the batch are merged (Part 2 fills Part 1).
 */
export function buildImportPlan(files, existingRefs = new Set()) {
  const byRef = new Map();
  const rejected = [];
  for (const f of files) {
    let parsed;
    try { parsed = JSON.parse(f.text); } catch { rejected.push({ file: f.name, reason: 'not valid JSON' }); continue; }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    items.forEach((item, i) => {
      const label = items.length > 1 ? `${f.name} #${i + 1}` : f.name;
      const out = convertRecord(item);
      if (out.error) { rejected.push({ file: label, reason: out.error }); return; }
      const prev = byRef.get(out.session.sessionRef);
      if (!prev) {
        byRef.set(out.session.sessionRef, { ...out, files: [label] });
        return;
      }
      // Same patient seen twice: keep the richer record, fill gaps from the other.
      const a = prev.session; const b = out.session;
      const base = (b.step2 && !a.step2) ? b : a;
      const other = base === a ? b : a;
      prev.session = {
        ...other, ...Object.fromEntries(Object.entries(base).filter(([, v]) => v != null)),
        step2: base.step2 ?? other.step2,
        postResult: base.postResult ?? other.postResult,
      };
      prev.session.status = prev.session.step2 ? 'STEP2_COMPLETE' : prev.session.status;
      prev.files.push(label);
      prev.warnings = [...new Set([...prev.warnings, ...out.warnings, 'Merged from more than one file'])];
    });
  }
  const entries = [...byRef.values()].map((e, idx) => ({
    id: idx,
    ...e,
    exists: existingRefs.has(e.session.sessionRef),
    include: true,
  }));
  return { entries, rejected };
}
