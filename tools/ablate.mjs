#!/usr/bin/env node
// Ablation: switch off one rule at a time and report which metrics get worse, on which files.
// A rule whose removal worsens no metric on any file must be removed or justified in writing.
// Metrics only. Extraction is cached per file (it does not depend on any rule).
// Usage: node tools/ablate.mjs [--rules id,id] [--json]
import { listFixtures, table } from './lib/fixtures.mjs';
import { flat, delta, DIRECTION } from './lib/metrics.mjs';
import { ingestToResult } from '../packages/ingest/src/index.js';
import { RULES } from '../packages/ingest/src/rules.js';
import { PROFILES } from '../packages/ingest/src/profiles.js';

const args = process.argv.slice(2);
const only = args.includes('--rules') ? args[args.indexOf('--rules') + 1].split(',') : null;
const fixtures = listFixtures();
if (!fixtures.length) { console.error('No PDFs in tests/fixtures/pdf'); process.exit(1); }
const cache = new Map();

async function run(fx, extra = {}) {
  const res = await ingestToResult({ bytes: fx.bytes(), kind: 'pdf' }, Object.assign({ extractCache: cache, cacheKey: fx.id }, extra));
  return flat(res.report);
}

const base = {};
for (const fx of fixtures) { base[fx.id] = await run(fx); process.stderr.write('.'); }
process.stderr.write('\n');

const variants = RULES.filter(r => !only || only.includes(r.id)).map(r => ({ id: r.id, opts: { rules: { [r.id]: false } } }));
// Profile ablation: force the generic profile instead of the fingerprint-selected one.
for (const p of PROFILES) if (p.match && Object.keys(p.params).length && (!only || only.includes('profile:' + p.id))) variants.push({ id: 'profile:' + p.id, opts: { profile: { id: 'generic', params: {} } } });

const out = [];
for (const v of variants) {
  const worse = [], better = [];
  for (const fx of fixtures) {
    const m = await run(fx, v.opts);
    for (const k of Object.keys(DIRECTION)) {
      const d = delta(base[fx.id], m, k); // improvement of the "rule off" run over baseline
      const fmt = (x) => typeof x === 'number' ? +x.toFixed(4) : x;
      if (d < 0) worse.push(fx.id + ':' + k + ' ' + fmt(base[fx.id][k]) + '->' + fmt(m[k]));
      if (d > 0) better.push(fx.id + ':' + k + ' ' + fmt(base[fx.id][k]) + '->' + fmt(m[k]));
    }
  }
  const files = new Set(worse.map(w => w.split(':')[0]));
  out.push({ rule: v.id, filesWorse: files.size, verdict: files.size ? 'keeps (removal hurts)' : 'NO EFFECT: remove or justify', worse, better });
  process.stderr.write(v.id + ' ');
}
process.stderr.write('\n');

if (args.includes('--json')) console.log(JSON.stringify({ baseline: base, ablation: out }, null, 2));
else {
  console.log(table(out.map(o => ({ rule: o.rule, filesWorse: o.filesWorse, verdict: o.verdict, 'metrics worse when off': o.worse.slice(0, 4).join('; ') + (o.worse.length > 4 ? ' …+' + (o.worse.length - 4) : ''), 'better when off': o.better.length })), ['rule', 'filesWorse', 'verdict', 'metrics worse when off', 'better when off']));
}
