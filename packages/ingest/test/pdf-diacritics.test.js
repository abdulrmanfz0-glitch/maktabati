import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ingestFile } from '../src/adapters/node.js';

const DIR = path.resolve('tests/fixtures/pdf');
const PDFS = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /\.pdf$/i.test(f)).sort() : [];

const textOf = book => {
  let s = '';
  for (const ch of book.chapters || []) {
    for (const sec of ch.sections || []) {
      for (const b of sec.blocks || []) {
        s += (b.type === 'list' ? b.items.join('\n') : (b.text || b.caption || '')) + '\n';
      }
    }
  }
  return s;
};

describe.skipIf(!PDFS.length)('local PDF fixtures: no space before a combining mark', () => {
  for (const file of PDFS) {
    it(file, async () => {
      const r = await ingestFile(path.join(DIR, file), { images: false });
      const text = textOf(r.book);
      const split = text.match(/ \p{M}/gu) || [];
      expect(split, 'space before combining mark in ' + file).toHaveLength(0);
    }, 120000);
  }
});
