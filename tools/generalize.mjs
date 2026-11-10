#!/usr/bin/env node
// Generalization check. Split the fixtures into two sets (by publisher fingerprint when there
// are several, otherwise by file), tune the numeric parameters on set A, report on set B,
// then swap. Metrics only.
// With a single publisher this is labelled "single publisher: weak evidence".
// With fewer than 6 files the check is reported as [INSUFFICIENT DATA].
// Usage: node tools/generalize.mjs [--json]
import { listFixtures, table } from './lib/fixtures.mjs';
import { flat } from './lib/metrics.mjs';
import { ingestToResult } from '../packages/ingest/src/index.js';
import { DEFAULT_PARAMS } from '../packages/ingest/src/profiles.js';

const fixtures = listFixtures();
const cache = new Map();
const GRID = {
  spaceGapEm: [0.1, 0.15, 0.25],
  footnoteSizeRatio: [0.88, 0.92, 0.96],
  headingSizeRatio: [1.1, 1.15, 1.25],
  minRepeatShare: [0.005, 0.01, 0.03]
};

async function evalSet(set, params) {
  const rows = [];
  for (const fx of set) {
    const res = await ingestToResult({ bytes: fx.bytes(), kind: 'pdf' }, { extractCache: cache, cacheKey: fx.id, params });
    rows.push({ id: fx.id, fp: res.report.fingerprint, ...flat(res.report) });
  }
  const mean = k => rows.reduce((a, r) => a + (r[k] || 0), 0) / (rows.length || 1);
  return { rows, success: rows.filter(r => r.success).length, score: mean('score'), linkRate: mean('linkRate'), paraTerm: mean('paraTerm'), residual: mean('residual') };
}
const objective = s => s.success * 1000 + s.score * 100 + s.linkRate * 10 + s.paraTerm - s.residual * 0.01;

function* combos() {
  const keys = Object.keys(GRID);
  const rec = function* (i, acc) {
    if (i === keys.length) { yield Object.assign({}, acc); return; }
    for (const v of GRID[keys[i]]) { acc[keys[i]] = v; yield* rec(i + 1, acc); }
  };
  yield* rec(0, {});
}

async function tune(set) {
  let best = null, bestObj = -Infinity;
  for (const c of combos()) {
    const s = await evalSet(set, c);
    const o = objective(s);
    if (o > bestObj + 1e-9) { bestObj = o; best = c; }
  }
  return best;
}

if (!fixtures.length) { console.error('No PDFs in tests/fixtures/pdf'); process.exit(1); }
// warm the cache and read fingerprints
const warm = await evalSet(fixtures, {});
const groupOf = r => r.fp.producer.replace(/\s[\d.]+$/, '') + '|' + (r.fp.fonts[0] || '');
const groups = [...new Set(warm.rows.map(groupOf))];
let A, B, mode;
if (groups.length >= 2) {
  mode = 'by publisher fingerprint';
  const g0 = new Set(warm.rows.filter(r => groupOf(r) === groups[0]).map(r => r.id));
  A = fixtures.filter(f => g0.has(f.id)); B = fixtures.filter(f => !g0.has(f.id));
} else {
  mode = 'by file (single publisher: weak evidence)';
  A = fixtures.filter((_, i) => i % 2 === 0); B = fixtures.filter((_, i) => i % 2 === 1);
}
const insufficient = fixtures.length < 6;

const report = [];
for (const [train, test, name] of [[A, B, 'tune A -> test B'], [B, A, 'tune B -> test A']]) {
  const best = await tune(train);
  const trainDef = await evalSet(train, {}), trainBest = await evalSet(train, best);
  const testDef = await evalSet(test, {}), testBest = await evalSet(test, best);
  report.push({ name, train: train.map(f => f.id), test: test.map(f => f.id), best, trainDef, trainBest, testDef, testBest });
}

if (process.argv.includes('--json')) console.log(JSON.stringify({ mode, insufficient, groups: groups.length, report }, null, 2));
else {
  console.log('Generalization check: split ' + mode + (insufficient ? ' [INSUFFICIENT DATA: fewer than 6 files]' : ''));
  console.log('Fingerprint groups: ' + groups.length + (groups.length < 2 ? ' (single publisher: weak evidence; not cross-publisher generalization)' : ''));
  console.log('Defaults: ' + JSON.stringify(Object.fromEntries(Object.keys(GRID).map(k => [k, DEFAULT_PARAMS[k]]))));
  for (const r of report) {
    console.log('\n' + r.name + '   train=' + r.train.join(',') + '   test=' + r.test.join(','));
    console.log('tuned params: ' + JSON.stringify(r.best));
    const row = (label, s) => ({ set: label, success: s.success + '/' + s.rows.length, meanScore: s.score.toFixed(3), linkRate: s.linkRate.toFixed(3), paraTerm: s.paraTerm.toFixed(3), residual: s.residual.toFixed(1) });
    console.log(table([row('train, defaults', r.trainDef), row('train, tuned', r.trainBest), row('test, defaults', r.testDef), row('test, tuned', r.testBest)], ['set', 'success', 'meanScore', 'linkRate', 'paraTerm', 'residual']));
  }
}
