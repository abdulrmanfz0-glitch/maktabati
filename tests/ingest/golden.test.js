// Agreement with a golden conversion, when one exists locally (tests/fixtures/golden/ is gitignored).
//
// Layout: tests/fixtures/golden/book/
//   source.txt   the fixture it belongs to: its 8-hex id (see tools/bench-ingest.mjs) or PDF file name
//   book.json    the golden book in the app's item format, OR
//   *.md         one Markdown file per chapter (sorted by name), in the app dialect
//
// IMPORTANT: the golden conversion is itself machine-made, so these numbers measure agreement
// between two conversions, not truth. Only numbers are printed; no text.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { listFixtures, ROOT } from '../../tools/lib/fixtures.mjs';
import { ingestToResult } from '../../packages/ingest/src/index.js';
import { cer } from '../helpers/cer.mjs';

const GOLD = path.join(ROOT, 'tests', 'fixtures', 'golden', 'book');
const have = fs.existsSync(GOLD) && fs.readdirSync(GOLD).some(f => /\.(json|md)$/.test(f));

function loadGolden() {
  const files = fs.readdirSync(GOLD);
  if (files.includes('book.json')) return JSON.parse(fs.readFileSync(path.join(GOLD, 'book.json'), 'utf8'));
  return null;
}

const chapterText = ch => (ch.sections || []).flatMap(s => s.blocks || []).map(b => b.text || (b.items || []).join(' ') || b.caption || '').join(' ');
const count = (book, f) => (book.chapters || []).reduce((n, c) => n + f(c), 0);

describe.skipIf(!have)('golden agreement (machine-made golden: agreement, not truth)', () => {
  it('reports agreement metrics', async () => {
    const src = fs.existsSync(path.join(GOLD, 'source.txt')) ? fs.readFileSync(path.join(GOLD, 'source.txt'), 'utf8').trim() : '';
    const fx = listFixtures().find(f => f.id === src || path.basename(f.path) === src);
    if (!fx) { console.log('[golden] source.txt missing or does not name a fixture: skipped [UNVERIFIED]'); return; }
    let gold = loadGolden();
    if (!gold) {
      const md = fs.readdirSync(GOLD).filter(f => f.endsWith('.md')).sort().map(f => fs.readFileSync(path.join(GOLD, f), 'utf8')).join('\n\n');
      gold = (await ingestToResult(md)).book;
    }
    const res = await ingestToResult({ bytes: fx.bytes(), kind: 'pdf' });
    const ours = res.book;
    const rows = [];
    const n = Math.max(gold.chapters.length, ours.chapters.length);
    for (let i = 0; i < n; i++) {
      const g = gold.chapters[i], o = ours.chapters[i];
      if (!g || !o) { rows.push({ chapter: i + 1, missing: g ? 'ours' : 'golden' }); continue; }
      const c = cer(chapterText(g), chapterText(o));
      rows.push({
        chapter: i + 1,
        sectionTitles: (o.sections || []).filter(s => s.title).length + '/' + (g.sections || []).filter(s => s.title).length,
        figures: (o.sections || []).flatMap(s => s.blocks).filter(b => b.type === 'figure').length + '/' + (g.sections || []).flatMap(s => s.blocks).filter(b => b.type === 'figure').length,
        footnotes: (o.notes || []).length + '/' + (g.notes || []).length,
        cer: (c.bounded ? '>=' : '') + c.cer.toFixed(4)
      });
    }
    console.log('[golden] fixture ' + fx.id + ': chapters ours/golden = ' + ours.chapters.length + '/' + gold.chapters.length +
      ', footnotes ' + count(ours, c => (c.notes || []).length) + '/' + count(gold, c => (c.notes || []).length));
    console.table(rows);
    expect(ours.chapters.length).toBeGreaterThan(0);
  }, 600000);
});
