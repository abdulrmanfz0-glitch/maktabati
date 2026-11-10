#!/usr/bin/env node
// Convert one book file to the lossless book JSON, a Markdown rendering, the report and the
// figure images. Default output folder: out/<content hash>/ (out/ is git-ignored).
// Prints metrics only, never book text.
// Usage: node tools/convert.mjs <input.pdf|.epub|.md|.txt> [outdir]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ingestFile, writeResult } from '../packages/ingest/src/adapters/node.js';
import { ROOT } from './lib/fixtures.mjs';

const [input, outArg] = process.argv.slice(2);
if (!input || !fs.existsSync(input)) { console.error('Usage: node tools/convert.mjs <input.pdf> [outdir]'); process.exit(1); }
const id = crypto.createHash('sha1').update(fs.readFileSync(input)).digest('hex').slice(0, 8);
const outDir = path.resolve(outArg || path.join(ROOT, 'out', id));

const t0 = Date.now();
const res = await ingestFile(input, { images: true });
await writeResult(res, outDir);

const r = res.report, c = r.coverage;
console.log('file ' + id + ': ' + (r.pages || '-') + ' pages, ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('chapters: ' + res.book.chapters.length + (r.chapters ? ' (' + r.chapters.method + ')' : ''));
if (r.footnotes) console.log('notes linked: ' + r.footnotes.linked + '/' + r.footnotes.found);
if (c) console.log('coverage: ' + c.assignedShare + ' assigned; dropped ' + c.dropped + (c.dropped ? ' ' + JSON.stringify(c.droppedReasons) : ''));
console.log('recommendation: ' + r.recommendation + ' ' + (r.confidence ?? '') + '; issues: ' + ((r.issues || []).map(i => i.code + (i.severity === 'major' ? '!' : '')).join(' ') || '-'));
console.log('wrote: ' + ['book.json', 'book.md', 'report.json'].map(f => path.join(outDir, f)).join(', ') + (res.assets.length ? ' + ' + res.assets.length + ' images' : ''));
