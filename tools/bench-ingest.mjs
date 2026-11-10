#!/usr/bin/env node
// Benchmark the ingest engine over every PDF in tests/fixtures/pdf. Metrics only.
// Each file runs in its own process so time and peak memory are per file.
// Appends one line per run to docs/ingest-bench-history.jsonl (metrics only) unless --no-history.
// Usage: node tools/bench-ingest.mjs [--label "text"] [--no-history] [--json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { listFixtures, table, ROOT } from './lib/fixtures.mjs';
import { flat } from './lib/metrics.mjs';

const args = process.argv.slice(2);
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : '';
const HISTORY = path.join(ROOT, 'docs', 'ingest-bench-history.jsonl');

const fixtures = listFixtures();
if (!fixtures.length) { console.error('No PDFs in tests/fixtures/pdf'); process.exit(1); }
const child = path.join(ROOT, 'tools', 'lib', 'run-child.mjs');

const results = [];
for (const fx of fixtures) {
  let r;
  try {
    const out = execFileSync(process.execPath, [child, fx.id], { cwd: ROOT, maxBuffer: 64 << 20, encoding: 'utf8' });
    r = JSON.parse(out.trim().split('\n').pop());
  } catch (e) { r = { id: fx.id, ok: false, error: 'crash' }; }
  results.push(r);
  process.stderr.write('.');
}
process.stderr.write('\n');

const rows = results.map(r => {
  if (!r.ok) return { file: r.id, pages: '-', score: '-', chapters: '-', issues: r.error, recommendation: 'error', time: r.ms ? (r.ms / 1000).toFixed(1) + 's' : '-', success: 'no' };
  const rep = r.report;
  const major = rep.issues.filter(i => i.severity === 'major').map(i => i.code + (i.pages ? '(' + i.pages + ')' : ''));
  const minor = rep.issues.filter(i => i.severity !== 'major').map(i => i.code + '(' + i.pages + ')');
  return {
    file: r.id,
    pages: rep.pages,
    score: rep.score.toFixed(3),
    chapters: rep.chapters.count + ' ' + rep.chapters.method,
    notes: rep.footnotes.linked + '/' + rep.footnotes.found,
    figures: rep.figures,
    issues: [major.join(' '), minor.length ? '[minor ' + minor.join(' ') + ']' : ''].filter(Boolean).join(' ') || '-',
    recommendation: rep.recommendation + ' ' + rep.confidence.toFixed(2),
    time: (r.ms / 1000).toFixed(1) + 's',
    'ms/100p': Math.round(r.ms / rep.pages * 100),
    peakMB: r.peakMB,
    success: r.success ? 'yes' : 'no'
  };
});

const ok = results.filter(r => r.ok);
const succ = ok.filter(r => r.success).length;
const profiles = [...new Set(ok.map(r => r.report.profile))];
const producers = [...new Set(ok.map(r => r.report.fingerprint.producer.replace(/\s[\d.]+$/, '')))];

if (args.includes('--json')) console.log(JSON.stringify({ rows, results: ok.map(r => ({ id: r.id, ...flat(r.report) })) }, null, 2));
else {
  console.log(table(rows, ['file', 'pages', 'score', 'chapters', 'notes', 'figures', 'issues', 'recommendation', 'time', 'ms/100p', 'peakMB', 'success']));
  console.log();
  if (profiles.length === 1 && producers.length === 1) console.log('NOTE: all ' + ok.length + ' fixtures share one publisher fingerprint (profile "' + profiles[0] + '", producer "' + producers[0] + '"). Results describe these files only, not Arabic PDFs in general.');
  else console.log('Fixture fingerprints: profiles ' + profiles.join(', ') + '; producers ' + producers.join(', '));
  console.log('auto-success rate: ' + succ + ' of ' + fixtures.length);
}

if (!args.includes('--no-history')) {
  let commit = '';
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (e) { /* no git */ }
  const dirty = (() => { try { return execFileSync('git', ['status', '--porcelain', 'packages/ingest'], { cwd: ROOT, encoding: 'utf8' }).trim() ? '+dirty' : ''; } catch (e) { return ''; } })();
  const entry = {
    date: new Date().toISOString(), commit: commit + dirty, label,
    fixtures: fixtures.length, success: succ, profiles, producers,
    files: results.map(r => r.ok ? { id: r.id, pages: r.report.pages, ms: r.ms, peakMB: r.peakMB, recommendation: r.report.recommendation, method: r.report.chapters.method, ...flat(r.report) } : { id: r.id, error: r.error })
  };
  fs.appendFileSync(HISTORY, JSON.stringify(entry) + '\n');
  console.log('history: appended to docs/ingest-bench-history.jsonl');
}
