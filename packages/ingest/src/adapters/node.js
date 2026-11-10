// Thin Node adapter: file in, result (and optional files) out. The only module that touches fs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ingestToResult, toMarkdown } from '../index.js';

const KIND = { pdf: 'pdf', epub: 'epub', md: 'md', markdown: 'md', txt: 'txt' };

/** Convert one file. Returns { book, report, assets }. */
export async function ingestFile(file, options = {}) {
  const bytes = new Uint8Array(await fs.readFile(file));
  const kind = KIND[path.extname(file).slice(1).toLowerCase()];
  return ingestToResult({ bytes, kind }, options);
}

/** Write book.json, book.md and the figure assets into outDir. */
export async function writeResult(result, outDir) {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'book.json'), JSON.stringify(result.book));
  await fs.writeFile(path.join(outDir, 'book.md'), toMarkdown(result));
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(result.report, null, 2));
  for (const a of result.assets || []) {
    const p = path.join(outDir, a.path);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, a.bytes);
  }
}
