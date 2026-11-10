#!/usr/bin/env node
// Per-page structural diagnostics for one fixture. Prints numbers only: marker numerals,
// counts, sizes and positions. Never prints book text.
// Usage: node tools/diagnose.mjs <fixture-id> [notes|toc|paras|pages] [--from N --to M]
import { listFixtures } from './lib/fixtures.mjs';
import { openPdf, loadPdfjs } from '../packages/ingest/src/adapters/pdfjs-node.js';
import { extractPage } from '../packages/ingest/src/stages/extract.js';
import { reorderPage } from '../packages/ingest/src/stages/reorder.js';
import { normalizePage, MARK_OPEN, MARK_CLOSE } from '../packages/ingest/src/stages/normalize.js';
import { docStats, layoutPage } from '../packages/ingest/src/stages/layout.js';
import { cleanPages } from '../packages/ingest/src/stages/clean.js';
import { detectFootnotes, detectHeadings, detectChapters } from '../packages/ingest/src/stages/structure.js';
import { selectProfile, fingerprint, paramsFor } from '../packages/ingest/src/profiles.js';

const [id, what = 'pages'] = process.argv.slice(2);
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : null; };
const fx = listFixtures().find(f => f.id === id);
if (!fx) { console.error('unknown fixture'); process.exit(1); }
const doc = await openPdf(fx.bytes());
const { OPS } = await loadPdfjs();
const meta = await doc.getMetadata();
const opts = { params: paramsFor(selectProfile(fingerprint({ producer: meta.info.Producer, fonts: ['YakoutLinotypeLight-Regular'] }))) };
const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const raw = await extractPage(await doc.getPage(i), OPS, { images: false });
  const n = normalizePage(reorderPage(raw, opts), opts);
  pages.push({ index: i, width: raw.width, height: raw.height, lines: n.lines, images: raw.images });
}
const stats = docStats(pages);
for (const p of pages) layoutPage(p, stats, opts);
cleanPages(pages, stats, opts);
for (const p of pages) p.notes = detectFootnotes(p, stats, opts);
const groups = detectHeadings(pages, stats, opts);
const ch = detectChapters(pages, groups, {}, opts);
const RE = new RegExp(MARK_OPEN + '(\\d+)' + MARK_CLOSE, 'g');
const from = arg('--from') || 1, to = arg('--to') || pages.length;
const cls = s => s.replace(/[A-Za-z]+/g, 'L').replace(/[ء-ي٠-٩]+/g, 'a').replace(/[0-9]+/g, '9').replace(RE, '^').replace(/\s+/g, ' ').slice(0, 40);

console.log('stats', JSON.stringify(stats), 'chapters', ch.method, ch.chapters.length, 'toc', ch.toc ? JSON.stringify(ch.toc.pages) + ' entries ' + ch.toc.entries.length : '-');
for (const p of pages.slice(from - 1, to)) {
  if (what === 'notes') {
    const body = p.lines.filter(l => !l.removed && l.role !== 'note');
    const marks = body.flatMap(l => [...l.text.matchAll(RE)].map(m => m[1]));
    const small = p.lines.filter(l => !l.removed && l.size < stats.bodySize * 0.95).map(l => l.size + '@' + Math.round(l.y) + (l.role === 'note' ? 'N' : '') + ':' + cls(l.text));
    if (marks.length || p.notes.length || small.length) console.log('p' + p.index, 'marks[' + marks.join(',') + ']', 'notes[' + p.notes.map(n => n.n ?? 'cont').join(',') + ']', 'small:', small.join(' | '));
  } else if (what === 'toc') {
    const tp = new Set(ch.toc ? ch.toc.pages : []);
    if (tp.has(pages.indexOf(p))) console.log('p' + p.index, p.lines.map(l => (l.removed ? 'x' : '') + l.size + (l.role === 'heading' ? 'H' : '') + ':' + cls(l.text)).join(' | '));
    const gs = groups.filter(g => g.page === pages.indexOf(p));
    if (gs.length) console.log('p' + p.index, 'groups', gs.map(g => 'L' + g.level + (g.top ? 'T' : '') + ' s' + g.size + ' ' + cls(g.text)).join(' | '));
  } else if (what === 'paras') {
    console.log('p' + p.index, p.lines.map(l => (l.removed ? 'x' : l.role === 'note' ? 'n' : l.role === 'heading' ? 'h' : l.parStart ? 'P' : '.') + (l.endsShort ? 's' : '') + '[' + Math.round(l.x0) + '-' + Math.round(l.x1) + (l.text.match(/[.!?؟…»":]$/) ? 'T' : '') + ']').join(' '));
  } else {
    console.log('p' + p.index, 'lines', p.lines.length, 'removed', p.lines.filter(l => l.removed).length, 'notes', p.notes.length, 'headings', p.lines.filter(l => l.role === 'heading').length);
  }
}
