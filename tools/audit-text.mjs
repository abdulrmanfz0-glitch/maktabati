#!/usr/bin/env node
// Failure-type audit of one converted book. Counts only, never book text.
// Usage: node tools/audit-text.mjs <out/<id>/book.json | input.pdf> [--json] [--off rule,rule]
import fs from 'node:fs';
import { ingestFile } from '../packages/ingest/src/adapters/node.js';
import { audit, bookText } from './lib/audit.mjs';

const args = process.argv.slice(2);
const off = args.includes('--off') ? args[args.indexOf('--off') + 1].split(',') : [];
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--off');
if (!input || !fs.existsSync(input)) { console.error('Usage: node tools/audit-text.mjs <book.json|file.pdf> [--json] [--off rule,rule]'); process.exit(1); }

let book, report = null;
if (/\.json$/i.test(input)) book = JSON.parse(fs.readFileSync(input, 'utf8'));
else {
  const res = await ingestFile(input, { images: false, rules: Object.fromEntries(off.map(r => [r, false])) });
  book = res.book; report = res.report;
}
let lexicon = null;
try { lexicon = await (await import('../packages/ingest/src/lexicon.js')).loadLexicon(); } catch (e) { /* no word list yet */ }
const a = audit(bookText(book), lexicon);
if (report) a.report = { recommendation: report.recommendation, confidence: report.confidence, score: report.score, issues: report.issues.map(i => i.code + (i.severity === 'major' ? '!' : '')), glyphs: report.glyphs || null };

if (args.includes('--json')) console.log(JSON.stringify(a, null, 2));
else {
  console.log('arabic tokens: ' + a.arabicTokens);
  console.log('reversed ligature pairs (top function words): ' + a.reversedPairs.functionWords + ' broken vs ' + a.reversedPairs.functionWordsCorrect + ' correct (share ' + a.reversedPairs.correctShare + ')');
  console.log('unmapped glyph characters in output: ' + JSON.stringify(a.unmapped));
  console.log('lossy (top function words missing one ى/ا): ' + a.lossy.functionWords);
  console.log('guillemets ' + JSON.stringify(a.guillemets) + '  quotes ' + JSON.stringify(a.quotes));
  for (const [k, list] of Object.entries(a.examples)) console.log('examples ' + k + ': ' + list.map(e => e.ok + ' ' + e.correct + '/' + e.broken).join(', '));
  if (a.lexicon) console.log('lexicon: ' + JSON.stringify(a.lexicon));
  if (a.report) console.log('report: ' + JSON.stringify(a.report));
}
